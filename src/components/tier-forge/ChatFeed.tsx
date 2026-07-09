"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage, ChatCommand, TwitchStatus, TwitchEvent } from "./types";
import { Eraser } from "lucide-react";

interface ChatFeedProps {
  messages: ChatMessage[];
  commands: ChatCommand[];
  statuses: TwitchStatus[];
  events: TwitchEvent[];
  ircConnected: boolean;
  onClear: () => void;
}

function Badge({ kind }: { kind: string }) {
  const colors: Record<string, string> = {
    broadcaster: "#ff5050",
    moderator: "#64ffa0",
    vip: "#d9a3b8",
    subscriber: "#d4a853",
    founder: "#d4a853",
    verified: "#64ffa0",
    partner: "#b894d9",
  };
  const color = colors[kind] || "rgba(255,255,255,0.4)";
  const letter = kind.charAt(0).toUpperCase();
  return (
    <span
      title={kind}
      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-bold uppercase"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {letter}
    </span>
  );
}

export function ChatFeed({ messages, commands, statuses, events, ircConnected, onClear }: ChatFeedProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const allCount = messages.length + commands.length + statuses.length + events.length;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [allCount]);

  // Build a unified timeline
  type TimelineItem =
    | { kind: "msg"; data: ChatMessage; ts: number }
    | { kind: "cmd"; data: ChatCommand; ts: number }
    | { kind: "status"; data: TwitchStatus; ts: number }
    | { kind: "event"; data: TwitchEvent; ts: number };
  const timeline: TimelineItem[] = [];
  messages.forEach((m) => timeline.push({ kind: "msg", data: m, ts: new Date(m.at).getTime() }));
  commands.forEach((c) => timeline.push({ kind: "cmd", data: c, ts: new Date(c.at).getTime() }));
  statuses.forEach((s) => timeline.push({ kind: "status", data: s, ts: new Date(s.at).getTime() }));
  events.forEach((e) => timeline.push({ kind: "event", data: e, ts: new Date(e.at).getTime() }));
  timeline.sort((a, b) => a.ts - b.ts);
  const visible = timeline.slice(-150);

  return (
    <div className="glass flex flex-col" style={{ height: "100%", minHeight: 280 }}>
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--line-soft)" }}>
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: ircConnected ? "var(--ok)" : "var(--t4)",
              boxShadow: ircConnected ? "0 0 8px rgba(100,255,160,0.6)" : "none",
              animation: ircConnected ? "statusPulse 2.4s ease-in-out infinite" : "none",
            }}
          />
          <span className="eyebrow">Live chat</span>
          <span className="eyebrow" style={{ color: "var(--t2)" }}>·</span>
          <span className="eyebrow" style={{ color: ircConnected ? "var(--ok)" : "var(--t3)" }}>
            {ircConnected ? "Listening" : "Idle"}
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="opacity-60 hover:opacity-100 transition-opacity"
          title="Clear feed"
        >
          <Eraser size={13} style={{ color: "var(--t2)" }} />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {visible.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <p className="eyebrow mb-2">No activity yet</p>
            <p style={{ color: "var(--t3)", fontSize: 12 }}>
              Connect your Twitch channel and chat events will stream in here.
            </p>
          </div>
        ) : (
          visible.map((it, i) => {
            if (it.kind === "status") {
              const colorMap = { info: "var(--t2)", warn: "var(--warn)", error: "var(--danger)" };
              return (
                <div key={`s${i}`} className="flex items-start gap-2 py-1 px-1.5 rounded-md">
                  <span
                    className="font-mono text-[9px] uppercase tracking-wider mt-0.5 shrink-0"
                    style={{ color: "var(--t3)" }}
                  >
                    {new Date(it.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-[11px] italic" style={{ color: colorMap[it.data.level] }}>
                    ↳ {it.data.message}
                  </span>
                </div>
              );
            }
            if (it.kind === "event") {
              return (
                <div
                  key={`e${i}`}
                  className="flex items-center gap-2 py-1.5 px-2 rounded-md"
                  style={{ background: "rgba(212,168,83,0.08)", border: "1px solid rgba(212,168,83,0.18)" }}
                >
                  <span
                    className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(212,168,83,0.18)", color: "var(--amber)" }}
                  >
                    {it.data.type}
                  </span>
                  <span className="text-[12px]" style={{ color: "var(--t1)" }}>
                    {it.data.systemMsg}
                  </span>
                </div>
              );
            }
            if (it.kind === "cmd") {
              return (
                <div
                  key={`c${i}`}
                  className="flex items-center gap-2 py-1.5 px-2 rounded-md"
                  style={{ background: "rgba(212,168,83,0.06)", border: "1px solid rgba(212,168,83,0.15)" }}
                >
                  <span
                    className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ background: "rgba(212,168,83,0.2)", color: "var(--amber)" }}
                  >
                    cmd
                  </span>
                  <span className="text-[12px] font-medium shrink-0" style={{ color: "var(--t1)" }}>
                    {it.data.username}
                  </span>
                  {it.data.isPrivileged && (
                    <span className="font-mono text-[8px] uppercase tracking-wider" style={{ color: "var(--warn)" }}>
                      mod
                    </span>
                  )}
                  <span className="font-mono text-[12px]" style={{ color: "var(--amber)" }}>
                    !{it.data.command}
                  </span>
                  {it.data.args.length > 0 && (
                    <span className="text-[12px] truncate" style={{ color: "var(--t2)" }}>
                      {it.data.argStr}
                    </span>
                  )}
                </div>
              );
            }
            // chat msg
            return (
              <div key={`m${i}`} className="flex items-start gap-2 py-0.5 px-1.5 rounded-md hover:bg-white/[0.02]">
                <span className="flex items-center gap-1 shrink-0">
                  {it.data.badges.slice(0, 3).map((b) => <Badge key={b} kind={b} />)}
                </span>
                <span
                  className="text-[12px] font-medium shrink-0"
                  style={{ color: it.data.isPrivileged ? "var(--amber)" : "var(--t1)" }}
                >
                  {it.data.username}
                </span>
                <span className="text-[12px] flex-1 break-words" style={{ color: "var(--t2)" }}>
                  {it.data.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
