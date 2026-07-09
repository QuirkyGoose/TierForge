/**
 * Twitch Relay Mini-Service
 *
 * Responsibilities:
 *   1. Listen on port 3003 as a socket.io server.
 *   2. Accept control events from the Next.js app (`twitch:start`, `twitch:stop`, `config:update`).
 *   3. Connect to Twitch IRC over secure WebSocket (wss://irc-ws.chat.twitch.tv:443).
 *   4. Read every chat message from the joined channel.
 *   5. Parse commands (configurable prefix, default "!") and apply mutations via the Next.js API.
 *   6. Broadcast events back to all socket.io clients:
 *        - `chat:message`   (every PRIVMSG, with badges/tags)
 *        - `chat:command`   (a parsed command, before/after execution)
 *        - `tierlist:updated` (a tier list has changed)
 *        - `twitch:status`  (connection lifecycle updates)
 *
 * Auth model:
 *   - If an OAuth token is supplied (oauth:xxxx format), use the botNickname and PASS auth.
 *     This allows the bot to send messages back to chat.
 *   - If no OAuth token is supplied, fall back to anonymous `justinfanNNN` login.
 *     Listening only — cannot send chat messages.
 */

import { createServer, type IncomingMessage } from "http";
import { Server } from "socket.io";
import { WebSocket } from "ws";

const PORT = 3003;
const NEXT_API = "http://localhost:3000";

// ---------- Runtime state ----------
interface TwitchConfig {
  channelName: string | null;
  botNickname: string | null;
  oauthToken: string | null;
  commandPrefix: string;
  allowViewersToAdd: boolean;
  allowViewersToMove: boolean;
  allowViewersToVote: boolean;
  activeTierListId: string | null;
}

let config: TwitchConfig = {
  channelName: null,
  botNickname: null,
  oauthToken: null,
  commandPrefix: "!",
  allowViewersToAdd: true,
  allowViewersToMove: false,
  allowViewersToVote: true,
  activeTierListId: null,
};

let irc: WebSocket | null = null;
let isConnecting = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let pingTimer: NodeJS.Timeout | null = null;
let joinRetryTimer: NodeJS.Timeout | null = null;

// ---------- HTTP server (just for health checks) ----------
const httpServer = createServer((req: IncomingMessage, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      ircConnected: irc !== null && irc.readyState === WebSocket.OPEN,
      channel: config.channelName,
      activeTierList: config.activeTierListId,
    }));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

const io = new Server(httpServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ---------- Helpers ----------
function broadcastStatus(message: string, level: "info" | "warn" | "error" = "info") {
  console.log(`[status:${level}] ${message}`);
  io.emit("twitch:status", { message, level, at: new Date().toISOString() });
}

function makeJustinfanNick(): string {
  const n = Math.floor(Math.random() * 89999 + 10000);
  return `justinfan${n}`;
}

async function fetchJson(url: string, opts: RequestInit = {}): Promise<any> {
  try {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text();
      return { error: `HTTP ${res.status}: ${text}` };
    }
    return await res.json();
  } catch (e: any) {
    return { error: e?.message ?? String(e) };
  }
}

async function apiGet(path: string): Promise<any> {
  return fetchJson(`${NEXT_API}${path}`);
}

async function apiPost(path: string, body: any): Promise<any> {
  return fetchJson(`${NEXT_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------- Twitch IRC ----------
function connectTwitch() {
  if (irc && (irc.readyState === WebSocket.OPEN || irc.readyState === WebSocket.CONNECTING)) {
    return;
  }
  if (!config.channelName) {
    broadcastStatus("Cannot connect — no Twitch channel configured.", "warn");
    return;
  }
  if (isConnecting) return;
  isConnecting = true;

  broadcastStatus(`Connecting to Twitch IRC as ${config.oauthToken ? config.botNickname : "anonymous justinfan"}…`);

  try {
    irc = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
  } catch (e: any) {
    isConnecting = false;
    broadcastStatus(`WebSocket init failed: ${e?.message ?? e}`, "error");
    scheduleReconnect();
    return;
  }

  irc.on("open", () => {
    isConnecting = false;
    const nick = config.oauthToken && config.botNickname
      ? config.botNickname.toLowerCase().replace(/[^a-z0-9_]/g, "")
      : makeJustinfanNick();

    irc?.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
    if (config.oauthToken) {
      irc?.send(`PASS ${config.oauthToken}`);
    }
    irc?.send(`NICK ${nick}`);
    irc?.send(`JOIN #${config.channelName!.toLowerCase()}`);

    // Keepalive PING every 4min
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (irc && irc.readyState === WebSocket.OPEN) {
        irc.send("PING :tmi.twitch.tv");
      }
    }, 240_000);

    broadcastStatus(`Joined #${config.channelName}. Listening for chat…`);
    // Update DB status via Next.js API
    apiPost("/api/twitch/internal-status", {
      isListening: true,
      lastConnectedAt: new Date().toISOString(),
      lastError: null,
    }).catch(() => {});
  });

  irc.on("message", (raw: Buffer | string) => {
    const data = typeof raw === "string" ? raw : raw.toString();
    handleIrcLine(data);
  });

  irc.on("close", () => {
    isConnecting = false;
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    broadcastStatus("Twitch IRC connection closed.", "warn");
    apiPost("/api/twitch/internal-status", { isListening: false }).catch(() => {});
    scheduleReconnect();
  });

  irc.on("error", (err: Error) => {
    isConnecting = false;
    broadcastStatus(`IRC error: ${err.message}`, "error");
    apiPost("/api/twitch/internal-status", {
      isListening: false,
      lastError: err.message,
    }).catch(() => {});
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (config.channelName && irc === null || irc?.readyState === WebSocket.CLOSED) {
      broadcastStatus("Attempting reconnect…");
      connectTwitch();
    }
  }, 5000);
}

function disconnectTwitch(silent = false) {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (joinRetryTimer) { clearTimeout(joinRetryTimer); joinRetryTimer = null; }
  if (irc) {
    try { irc.close(); } catch {}
    irc = null;
  }
  if (!silent) broadcastStatus("Disconnected from Twitch IRC.");
  apiPost("/api/twitch/internal-status", { isListening: false }).catch(() => {});
}

// ---------- IRC line parser ----------
interface ParsedIrcLine {
  tags?: Record<string, string>;
  prefix?: string;
  command?: string;
  params: string[];
}

function parseIrcLine(line: string): ParsedIrcLine | null {
  let tags: Record<string, string> | undefined;
  let rest = line;
  if (rest.startsWith("@")) {
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx < 0) return null;
    const tagStr = rest.slice(1, spaceIdx);
    tags = {};
    tagStr.split(";").forEach((kv) => {
      const [k, v] = kv.split("=");
      tags![k] = v ?? "";
    });
    rest = rest.slice(spaceIdx + 1);
  }
  let prefix: string | undefined;
  if (rest.startsWith(":")) {
    const spaceIdx = rest.indexOf(" ");
    if (spaceIdx < 0) return null;
    prefix = rest.slice(1, spaceIdx);
    rest = rest.slice(spaceIdx + 1);
  }
  const parts = rest.split(" ");
  const command = parts.shift()?.toUpperCase();
  // Join trailing params
  const params: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(":")) {
      params.push(parts.slice(i).join(" ").slice(1));
      break;
    }
    params.push(parts[i]);
  }
  return { tags, prefix, command, params };
}

function badgeFromTags(tags?: Record<string, string>): string[] {
  if (!tags?.badges) return [];
  return tags.badges.split(",").map((b) => b.split("/")[0]).filter(Boolean);
}

function isPrivileged(tags?: Record<string, string>): boolean {
  const badges = badgeFromTags(tags);
  if (badges.includes("broadcaster")) return true;
  if (badges.includes("moderator")) return true;
  if (badges.includes("vip")) return true;
  if (badges.includes("subscriber")) return true;
  return false;
}

function handleIrcLine(rawLine: string) {
  rawLine.split(/\r?\n/).forEach((line) => {
    if (!line) return;
    const parsed = parseIrcLine(line);
    if (!parsed) return;

    // PING/PONG keepalive
    if (parsed.command === "PING") {
      irc?.send(`PONG :${parsed.params[0] ?? ""}`);
      return;
    }
    if (parsed.command === "PONG") return;

    // Welcome — re-join on reconnect
    if (parsed.command === "001" && config.channelName) {
      // Already joined in open handler, but just in case
      return;
    }

    // PRIVMSG — chat message
    if (parsed.command === "PRIVMSG" && parsed.params.length >= 2) {
      const nick = parsed.prefix?.split("!")[0] ?? "unknown";
      const channel = parsed.params[0];
      const message = parsed.params[1];
      handleChatMessage(nick, channel, message, parsed.tags);
      return;
    }

    // CLEARCHAT — timeout/clear
    if (parsed.command === "CLEARCHAT") {
      io.emit("chat:clear", { channel: parsed.params[0] });
      return;
    }

    // USERNOTICE — sub/resub/raid/cheer
    if (parsed.command === "USERNOTICE" && parsed.params.length >= 1) {
      const msgId = parsed.tags?.["msg-id"] ?? "";
      const systemMsg = parsed.tags?.["system-msg"] ?? "";
      const displayName = parsed.tags?.["display-name"] ?? parsed.tags?.login ?? "";
      io.emit("twitch:event", {
        type: msgId,
        channel: parsed.params[0],
        user: displayName,
        systemMsg,
        raw: parsed,
        at: new Date().toISOString(),
      });
      return;
    }
  });
}

// ---------- Chat command handling ----------
function handleChatMessage(nick: string, channel: string, message: string, tags?: Record<string, string>) {
  const displayName = tags?.["display-name"] ?? nick;
  const badges = badgeFromTags(tags);
  const isPriv = isPrivileged(tags);

  // Emit to all clients
  io.emit("chat:message", {
    id: `${nick}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    username: displayName,
    message,
    badges,
    isPrivileged: isPriv,
    isCommand: message.startsWith(config.commandPrefix),
    at: new Date().toISOString(),
  });

  if (!message.startsWith(config.commandPrefix)) return;

  const trimmed = message.slice(config.commandPrefix.length).trim();
  const [cmdRaw, ...args] = trimmed.split(/\s+/);
  const cmd = cmdRaw?.toLowerCase();
  const argStr = args.join(" ");

  if (!cmd) return;

  // Always emit command event
  io.emit("chat:command", {
    username: displayName,
    command: cmd,
    args,
    argStr,
    isPrivileged: isPriv,
    at: new Date().toISOString(),
  });

  // Apply mutations
  applyCommand(cmd, args, argStr, displayName, isPriv).catch((e) => {
    broadcastStatus(`Command error: ${e?.message ?? e}`, "error");
  });
}

async function applyCommand(
  cmd: string,
  args: string[],
  argStr: string,
  username: string,
  isPriv: boolean
) {
  const tierListId = config.activeTierListId;
  if (!tierListId) {
    if (["additem", "moveitem", "vote", "tierlist", "resetvotes"].includes(cmd)) {
      broadcastStatus(`Cannot run !${cmd} — no active tier list set.`, "warn");
    }
    return;
  }

  switch (cmd) {
    case "additem":
    case "add":
      if (!isPriv && !config.allowViewersToAdd) return;
      if (!argStr) return;
      await apiPost(`/api/tierlists/${tierListId}/items`, {
        name: argStr.slice(0, 80),
        addedBy: username,
        source: "twitch",
      });
      broadcastTierlistUpdated(tierListId, `${username} added "${argStr}"`);
      break;

    case "moveitem":
    case "move":
      if (!isPriv && !config.allowViewersToMove) return;
      {
        // !move "Item Name" S   OR   !move Item S
        // Try quoted form first
        const m = argStr.match(/^"([^"]+)"\s+(\S+)\s*$/i) ?? argStr.match(/^(.+?)\s+(\S+)\s*$/i);
        if (m) {
          const itemName = m[1].trim().slice(0, 80);
          const tierLabel = m[2].trim().toUpperCase();
          await apiPost(`/api/tierlists/${tierListId}/items/move`, {
            name: itemName,
            tierLabel,
            username,
            source: "twitch",
          });
          broadcastTierlistUpdated(tierListId, `${username} moved "${itemName}" → ${tierLabel}`);
        }
      }
      break;

    case "vote":
      if (!isPriv && !config.allowViewersToVote) return;
      if (!argStr) return;
      {
        const name = argStr.slice(0, 80);
        await apiPost(`/api/tierlists/${tierListId}/items/vote`, {
          name,
          username,
        });
        broadcastTierlistUpdated(tierListId, `${username} voted for "${name}"`);
      }
      break;

    case "resetvotes":
      if (!isPriv) return;
      await apiPost(`/api/tierlists/${tierListId}/reset-votes`, {});
      broadcastTierlistUpdated(tierListId, `${username} reset all votes`);
      break;

    case "tierlist":
    case "list":
      // Public info command — bot reply only (handled client side via chat:command)
      break;

    case "commands":
    case "help":
      // Bot reply handled client side
      break;

    default:
      // Unknown command — do nothing
      break;
  }
}

async function broadcastTierlistUpdated(tierListId: string, reason: string) {
  const data = await apiGet(`/api/tierlists/${tierListId}`);
  io.emit("tierlist:updated", { tierListId, reason, data, at: new Date().toISOString() });
}

// ---------- Socket.io connection handler ----------
io.on("connection", (socket) => {
  console.log(`[socket.io] client connected: ${socket.id}`);

  // Send current state on connect — use phrasing that the page's status parser recognizes
  const ircUp = irc !== null && irc.readyState === WebSocket.OPEN;
  const initialMsg = ircUp
    ? `Joined #${config.channelName}. Listening for chat…`
    : "Not connected to Twitch.";
  socket.emit("twitch:status", {
    message: initialMsg,
    level: ircUp ? "info" : "info",
    at: new Date().toISOString(),
  });
  socket.emit("config:sync", config);

  socket.on("twitch:start", async (newConfig?: Partial<TwitchConfig>) => {
    if (newConfig) {
      config = { ...config, ...newConfig };
    }
    if (!config.channelName) {
      broadcastStatus("Cannot start — channel name missing.", "error");
      return;
    }
    disconnectTwitch(true);
    setTimeout(() => connectTwitch(), 200);
  });

  socket.on("twitch:stop", () => {
    disconnectTwitch();
  });

  socket.on("config:update", (newConfig: Partial<TwitchConfig>) => {
    config = { ...config, ...newConfig };
    console.log("[config] updated:", config);
    io.emit("config:sync", config);
  });

  socket.on("active-tierlist", (tierListId: string | null) => {
    config.activeTierListId = tierListId;
    io.emit("config:sync", config);
  });

  socket.on("bot:say", async (text: string) => {
    if (!irc || irc.readyState !== WebSocket.OPEN) return;
    if (!config.oauthToken || !config.channelName) return; // anonymous cannot send
    irc.send(`PRIVMSG #${config.channelName} :${text.slice(0, 480)}`);
  });

  socket.on("disconnect", () => {
    console.log(`[socket.io] client disconnected: ${socket.id}`);
  });
});

// ---------- Boot ----------
httpServer.listen(PORT, () => {
  console.log(`Twitch relay service listening on port ${PORT}`);
  // On boot, ask Next.js for current config
  apiGet("/api/twitch/config")
    .then((data) => {
      if (data && !data.error && data.config) {
        // API returns { config: {...}, activeTierListId: "..." } — extract just the config fields
        config = {
          ...config,
          channelName: data.config.channelName ?? null,
          botNickname: data.config.botNickname ?? null,
          oauthToken: data.config.oauthToken ?? null,
          commandPrefix: data.config.commandPrefix ?? "!",
          allowViewersToAdd: data.config.allowViewersToAdd ?? true,
          allowViewersToMove: data.config.allowViewersToMove ?? false,
          allowViewersToVote: data.config.allowViewersToVote ?? true,
          activeTierListId: data.activeTierListId ?? null,
        };
        console.log("[boot] loaded config from API:", config);
        if (config.channelName && data.config.isListening) {
          connectTwitch();
        }
      }
    })
    .catch((e) => console.error("[boot] failed to fetch config:", e?.message));
});

process.on("SIGTERM", () => {
  disconnectTwitch(true);
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  disconnectTwitch(true);
  httpServer.close(() => process.exit(0));
});
