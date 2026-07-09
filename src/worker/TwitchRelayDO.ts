/**
 * TwitchRelayDO — Cloudflare Durable Object (Tier Forge edition)
 *
 * Replaces both the socket.io server AND the Twitch relay mini-service.
 *
 * Responsibilities:
 *   1. Maintain a persistent WebSocket connection to Twitch IRC (wss://irc-ws.chat.twitch.tv:443)
 *   2. Accept WebSocket connections from browsers (fan-out chat messages + tier list updates)
 *   3. Parse chat commands (!additem, !moveitem, !vote, !tierlist, !commands, !resetvotes) and apply them via the Next.js API
 *   4. Store config (channelName, oauthToken, activeTierListId) in DO storage (durable, persists across restarts)
 *   5. Use a 30s alarm to keep the IRC connection alive (Durable Objects idle out after 30s on free plan)
 */

import { DurableObject } from "cloudflare:workers";
import type { WebSocket } from "@cloudflare/workers-types";

// WebSocketPair is a global in the Cloudflare Workers runtime — no import needed

interface RelayConfig {
  channelName: string | null;
  botNickname: string | null;
  oauthToken: string | null;
  commandPrefix: string;
  allowViewersToAdd: boolean;
  allowViewersToMove: boolean;
  allowViewersToVote: boolean;
  activeTierListId: string | null;
  isListening: boolean;
}

const DEFAULT_CONFIG: RelayConfig = {
  channelName: null,
  botNickname: "tierforge_bot",
  oauthToken: null,
  commandPrefix: "!",
  allowViewersToAdd: true,
  allowViewersToMove: false,
  allowViewersToVote: true,
  activeTierListId: null,
  isListening: false,
};

const NEXT_API = "http://localhost:3000";

export class TwitchRelayDO extends DurableObject {
  private ircSocket: WebSocket | null = null;
  private clients: Set<WebSocket> = new Set();
  private isConnecting = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private _config: RelayConfig | null = null;

  private async getConfig(): Promise<RelayConfig> {
    if (this._config) return this._config;
    const stored = await this.ctx.storage.get<RelayConfig>("config");
    this._config = { ...DEFAULT_CONFIG, ...stored };
    return this._config;
  }

  private async saveConfig(updates: Partial<RelayConfig>): Promise<RelayConfig> {
    const config = await this.getConfig();
    this._config = { ...config, ...updates };
    await this.ctx.storage.put("config", this._config);
    return this._config;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleBrowserWebSocket(request);
    }

    if (url.pathname === "/start" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const config = await this.saveConfig({
        channelName: body.channelName,
        botNickname: body.botNickname,
        oauthToken: body.oauthToken,
        commandPrefix: body.commandPrefix ?? "!",
        allowViewersToAdd: body.allowViewersToAdd ?? true,
        allowViewersToMove: body.allowViewersToMove ?? false,
        allowViewersToVote: body.allowViewersToVote ?? true,
      });
      await this.connectTwitch(config);
      return Response.json({ ok: true, listening: true });
    }

    if (url.pathname === "/stop" && request.method === "POST") {
      await this.disconnectTwitch();
      return Response.json({ ok: true, listening: false });
    }

    if (url.pathname === "/config" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const config = await this.saveConfig(body);
      this.broadcastToClients("config:sync", config);
      return Response.json({ ok: true, config });
    }

    if (url.pathname === "/active-tierlist" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const config = await this.saveConfig({ activeTierListId: body.tierListId ?? null });
      this.broadcastToClients("config:sync", config);
      return Response.json({ ok: true });
    }

    if (url.pathname === "/status" && request.method === "GET") {
      const config = await this.getConfig();
      return Response.json({
        ircConnected: this.ircSocket !== null && this.ircSocket.readyState === 1,
        channel: config.channelName,
        activeTierListId: config.activeTierListId,
        clientCount: this.clients.size,
      });
    }

    if (url.pathname === "/bot-say" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const config = await this.getConfig();
      if (this.ircSocket && this.ircSocket.readyState === 1 && config.oauthToken && config.channelName) {
        this.ircSocket.send(`PRIVMSG #${config.channelName} :${String(body.text).slice(0, 480)}`);
        return Response.json({ ok: true });
      }
      return Response.json({ ok: false, error: "Not connected or no OAuth" }, { status: 400 });
    }

    return new Response("Not found", { status: 404 });
  }

  private handleBrowserWebSocket(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    server.accept();
    this.clients.add(server);

    (async () => {
      const config = await this.getConfig();
      const ircUp = this.ircSocket !== null && this.ircSocket.readyState === 1;
      server.send(JSON.stringify({
        event: "twitch:status",
        data: {
          message: ircUp
            ? `Joined #${config.channelName}. Listening for chat…`
            : "Not connected to Twitch.",
          level: "info",
          at: new Date().toISOString(),
        },
      }));
      server.send(JSON.stringify({ event: "config:sync", data: config }));
    })();

    server.addEventListener("close", () => {
      this.clients.delete(server);
    });

    server.addEventListener("error", () => {
      this.clients.delete(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async connectTwitch(config: RelayConfig) {
    if (!config.channelName) {
      this.broadcastStatus("Cannot connect — no Twitch channel configured.", "warn");
      return;
    }
    if (this.isConnecting) return;
    if (this.ircSocket && this.ircSocket.readyState === 1) {
      await this.disconnectTwitch(true);
    }

    this.isConnecting = true;
    this.broadcastStatus(`Connecting to Twitch IRC as ${config.oauthToken ? config.botNickname : "anonymous justinfan"}…`);

    try {
      const resp = await fetch("https://irc-ws.chat.twitch.tv:443/", {
        headers: { Upgrade: "websocket" },
      });
      if (resp.status !== 101) {
        throw new Error(`WebSocket upgrade failed: ${resp.status}`);
      }
      // @ts-ignore — webSocket is a Cloudflare extension
      const socket = resp.webSocket as WebSocket;
      socket.accept();
      this.ircSocket = socket;

      const nick = config.oauthToken && config.botNickname
        ? config.botNickname.toLowerCase().replace(/[^a-z0-9_]/g, "")
        : `justinfan${Math.floor(Math.random() * 89999 + 10000)}`;

      socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      if (config.oauthToken) {
        socket.send(`PASS ${config.oauthToken}`);
      }
      socket.send(`NICK ${nick}`);
      socket.send(`JOIN #${config.channelName.toLowerCase()}`);

      socket.addEventListener("message", (event) => {
        this.handleIrcLine(event.data as string);
      });

      socket.addEventListener("close", () => {
        this.ircSocket = null;
        this.isConnecting = false;
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        this.broadcastStatus("Twitch IRC connection closed.", "warn");
        this.saveConfig({ isListening: false });
      });

      socket.addEventListener("error", () => {
        this.ircSocket = null;
        this.isConnecting = false;
        this.broadcastStatus("Twitch IRC error.", "error");
        this.saveConfig({ isListening: false });
      });

      this.pingInterval = setInterval(() => {
        if (this.ircSocket && this.ircSocket.readyState === 1) {
          this.ircSocket.send("PING :tmi.twitch.tv");
        }
      }, 240_000);

      this.isConnecting = false;
      this.broadcastStatus(`Joined #${config.channelName}. Listening for chat…`);
      await this.saveConfig({ isListening: true });
      this.ctx.storage.setAlarm(Date.now() + 25_000);
    } catch (e: any) {
      this.isConnecting = false;
      this.broadcastStatus(`IRC connection failed: ${e?.message ?? e}`, "error");
    }
  }

  private async disconnectTwitch(silent = false) {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ircSocket) {
      try { this.ircSocket.close(); } catch {}
      this.ircSocket = null;
    }
    await this.saveConfig({ isListening: false });
    if (!silent) {
      this.broadcastStatus("Disconnected from Twitch IRC.");
    }
  }

  private handleIrcLine(rawLine: string) {
    rawLine.split(/\r?\n/).forEach((line) => {
      if (!line) return;

      if (line.startsWith("PING")) {
        this.ircSocket?.send(`PONG :${line.split(" :")[1] ?? ""}`);
        return;
      }

      let tags: Record<string, string> | undefined;
      let rest = line;
      if (rest.startsWith("@")) {
        const spaceIdx = rest.indexOf(" ");
        if (spaceIdx < 0) return;
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
        if (spaceIdx < 0) return;
        prefix = rest.slice(1, spaceIdx);
        rest = rest.slice(spaceIdx + 1);
      }

      const parts = rest.split(" ");
      const command = parts.shift()?.toUpperCase();
      const params: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].startsWith(":")) {
          params.push(parts.slice(i).join(" ").slice(1));
          break;
        }
        params.push(parts[i]);
      }

      if (command === "PRIVMSG" && params.length >= 2) {
        const nick = prefix?.split("!")[0] ?? "unknown";
        const message = params[1];
        this.handleChatMessage(nick, message, tags);
        return;
      }

      if (command === "USERNOTICE" && params.length >= 1) {
        const msgId = tags?.["msg-id"] ?? "";
        const systemMsg = tags?.["system-msg"] ?? "";
        const displayName = tags?.["display-name"] ?? tags?.login ?? "";
        this.broadcastToClients("twitch:event", {
          type: msgId,
          channel: params[0],
          user: displayName,
          systemMsg,
          at: new Date().toISOString(),
        });
        return;
      }
    });
  }

  private async handleChatMessage(nick: string, message: string, tags?: Record<string, string>) {
    const config = await this.getConfig();
    const displayName = tags?.["display-name"] ?? nick;
    const badges = tags?.badges
      ? tags.badges.split(",").map((b) => b.split("/")[0]).filter(Boolean)
      : [];
    const isPriv = badges.includes("broadcaster") || badges.includes("moderator") || badges.includes("vip");

    this.broadcastToClients("chat:message", {
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

    this.broadcastToClients("chat:command", {
      username: displayName,
      command: cmd,
      args,
      argStr,
      isPrivileged: isPriv,
      at: new Date().toISOString(),
    });

    this.applyCommand(cmd, args, argStr, displayName, isPriv, config).catch((e) => {
      this.broadcastStatus(`Command error: ${e?.message ?? e}`, "error");
    });
  }

  private async applyCommand(
    cmd: string,
    _args: string[],
    argStr: string,
    username: string,
    isPriv: boolean,
    config: RelayConfig,
  ) {
    const tierListId = config.activeTierListId;
    if (!tierListId) {
      if (["additem", "add", "moveitem", "move", "vote", "tierlist", "list", "resetvotes", "commands", "help"].includes(cmd)) {
        this.broadcastStatus(`Cannot run !${cmd} — no active tier list set.`, "warn");
      }
      return;
    }

    switch (cmd) {
      case "additem":
      case "add":
        if (!isPriv && !config.allowViewersToAdd) return;
        if (!argStr) return;
        await this.apiPost(`/api/tierlists/${tierListId}/items`, {
          name: argStr.slice(0, 80),
          addedBy: username,
          source: "twitch",
        });
        await this.broadcastTierlistUpdated(tierListId, `${username} added "${argStr}"`);
        break;

      case "moveitem":
      case "move":
        if (!isPriv && !config.allowViewersToMove) return;
        {
          const m = argStr.match(/^"([^"]+)"\s+(\S+)\s*$/i) ?? argStr.match(/^(.+?)\s+(\S+)\s*$/i);
          if (m) {
            const itemName = m[1].trim().slice(0, 80);
            const tierLabel = m[2].trim().toUpperCase();
            await this.apiPost(`/api/tierlists/${tierListId}/items/move`, {
              name: itemName,
              tierLabel,
              username,
              source: "twitch",
            });
            await this.broadcastTierlistUpdated(tierListId, `${username} moved "${itemName}" → ${tierLabel}`);
          }
        }
        break;

      case "vote":
        if (!isPriv && !config.allowViewersToVote) return;
        if (!argStr) return;
        {
          const name = argStr.slice(0, 80);
          await this.apiPost(`/api/tierlists/${tierListId}/items/vote`, {
            name,
            username,
          });
          await this.broadcastTierlistUpdated(tierListId, `${username} voted for "${name}"`);
        }
        break;

      case "resetvotes":
        if (!isPriv) return;
        await this.apiPost(`/api/tierlists/${tierListId}/reset-votes`, {});
        await this.broadcastTierlistUpdated(tierListId, `${username} reset all votes`);
        break;

      case "tierlist":
      case "list":
        // Public info command — bot reply handled client side
        break;

      case "commands":
      case "help":
        // Bot reply handled client side
        break;
    }
  }

  async alarm() {
    const config = await this.getConfig();
    if (config.isListening && (!this.ircSocket || this.ircSocket.readyState !== 1)) {
      this.broadcastStatus("IRC disconnected, attempting reconnect…");
      await this.connectTwitch(config);
    }
    if (config.isListening) {
      this.ctx.storage.setAlarm(Date.now() + 25_000);
    }
  }

  // ---------- Helpers ----------

  private broadcastToClients(event: string, data: any) {
    const payload = JSON.stringify({ event, data });
    for (const ws of this.clients) {
      try {
        ws.send(payload);
      } catch {
        this.clients.delete(ws);
      }
    }
  }

  private broadcastStatus(message: string, level: "info" | "warn" | "error" = "info") {
    this.broadcastToClients("twitch:status", { message, level, at: new Date().toISOString() });
  }

  private async apiPost(path: string, body: any): Promise<any> {
    try {
      const res = await fetch(`${NEXT_API}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        return { error: `HTTP ${res.status}: ${text}` };
      }
      return await res.json();
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  }

  private async apiGet(path: string): Promise<any> {
    try {
      const res = await fetch(`${NEXT_API}${path}`);
      if (!res.ok) return { error: `HTTP ${res.status}` };
      return await res.json();
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  }

  private async broadcastTierlistUpdated(tierListId: string, reason: string) {
    const data = await this.apiGet(`/api/tierlists/${tierListId}`);
    this.broadcastToClients("tierlist:updated", { tierListId, reason, data, at: new Date().toISOString() });
  }
}
