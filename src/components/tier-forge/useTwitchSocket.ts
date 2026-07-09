"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ChatMessage, ChatCommand, TwitchStatus, TwitchEvent, TwitchConfig } from "./types";

interface UseTwitchSocketResult {
  connected: boolean;
  ircConnected: boolean;
  messages: ChatMessage[];
  commands: ChatCommand[];
  statuses: TwitchStatus[];
  events: TwitchEvent[];
  config: Partial<TwitchConfig> | null;
  tierListUpdatedAt: number;
  lastUpdateReason: string | null;
  clearMessages: () => void;
  sendStart: (cfg?: Partial<TwitchConfig>) => void;
  sendStop: () => void;
  sendConfigUpdate: (cfg: Partial<TwitchConfig>) => void;
  setActiveTierList: (id: string | null) => void;
  botSay: (text: string) => void;
}

export function useTwitchSocket(): UseTwitchSocketResult {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [ircConnected, setIrcConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [commands, setCommands] = useState<ChatCommand[]>([]);
  const [statuses, setStatuses] = useState<TwitchStatus[]>([]);
  const [events, setEvents] = useState<TwitchEvent[]>([]);
  const [config, setConfig] = useState<Partial<TwitchConfig> | null>(null);
  const [tierListUpdatedAt, setTierListUpdatedAt] = useState(0);
  const [lastUpdateReason, setLastUpdateReason] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (!disposed) setConnected(true);
      };
      ws.onclose = () => {
        if (!disposed) {
          setConnected(false);
          setIrcConnected(false);
          scheduleReconnect();
        }
      };
      ws.onerror = () => {};
      ws.onmessage = (event) => {
        try {
          const { event: evt, data } = JSON.parse(event.data);
          handleEvent(evt, data);
        } catch {}
      };
    };

    const scheduleReconnect = () => {
      if (reconnectTimer.current) return;
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null;
        connect();
      }, 2000);
    };

    const handleEvent = (event: string, data: any) => {
      switch (event) {
        case "twitch:status":
          setStatuses((prev) => [...prev.slice(-80), data]);
          {
            const lower = (data.message || "").toLowerCase();
            if (lower.includes("joined #") || lower.includes("listening for chat")) {
              setIrcConnected(true);
            } else if (lower.includes("disconnected") || lower.includes("closed") || lower.includes("cannot start") || lower.includes("cannot connect") || lower.includes("error")) {
              setIrcConnected(false);
            }
          }
          break;
        case "chat:message":
          setMessages((prev) => [...prev.slice(-300), data]);
          break;
        case "chat:command":
          setCommands((prev) => [...prev.slice(-80), data]);
          break;
        case "twitch:event":
          setEvents((prev) => [...prev.slice(-40), data]);
          break;
        case "config:sync":
          setConfig(data);
          break;
        case "tierlist:updated":
          setLastUpdateReason(data.reason);
          setTierListUpdatedAt(Date.now());
          break;
      }
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCommands([]);
    setStatuses([]);
    setEvents([]);
  }, []);

  const sendStart = useCallback(async (cfg?: Partial<TwitchConfig>) => {
    try {
      await fetch("/api/twitch/relay/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg ?? {}),
      });
    } catch {}
  }, []);

  const sendStop = useCallback(async () => {
    try {
      await fetch("/api/twitch/relay/stop", { method: "POST" });
    } catch {}
  }, []);

  const sendConfigUpdate = useCallback(async (cfg: Partial<TwitchConfig>) => {
    try {
      await fetch("/api/twitch/relay/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
    } catch {}
  }, []);

  const setActiveTierList = useCallback(async (id: string | null) => {
    try {
      await fetch("/api/twitch/relay/active-tierlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierListId: id }),
      });
    } catch {}
  }, []);

  const botSay = useCallback(async (text: string) => {
    try {
      await fetch("/api/twitch/relay/bot-say", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch {}
  }, []);

  return {
    connected,
    ircConnected,
    messages,
    commands,
    statuses,
    events,
    config,
    tierListUpdatedAt,
    lastUpdateReason,
    clearMessages,
    sendStart,
    sendStop,
    sendConfigUpdate,
    setActiveTierList,
    botSay,
  };
}
