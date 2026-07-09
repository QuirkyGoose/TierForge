"use client";

import { useEffect, useState } from "react";
import type { TwitchConfig } from "./types";
import { ExternalLink, KeyRound, Radio, Save } from "lucide-react";

interface SettingsPanelProps {
  config: Partial<TwitchConfig> | null;
  ircConnected: boolean;
  activeTierListId: string | null;
  onSave: (cfg: Partial<TwitchConfig>) => Promise<void>;
  onStart: (cfg: Partial<TwitchConfig>) => Promise<void>;
  onStop: () => Promise<void>;
}

export function SettingsPanel({ config, ircConnected, activeTierListId, onSave, onStart, onStop }: SettingsPanelProps) {
  const [channelName, setChannelName] = useState("");
  const [botNickname, setBotNickname] = useState("");
  const [oauthToken, setOauthToken] = useState("");
  const [commandPrefix, setCommandPrefix] = useState("!");
  const [allowAdd, setAllowAdd] = useState(true);
  const [allowMove, setAllowMove] = useState(false);
  const [allowVote, setAllowVote] = useState(true);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (config) {
      setChannelName(config.channelName ?? "");
      setBotNickname(config.botNickname ?? "tierforge_bot");
      setOauthToken(config.oauthToken ?? "");
      setCommandPrefix(config.commandPrefix ?? "!");
      setAllowAdd(config.allowViewersToAdd ?? true);
      setAllowMove(config.allowViewersToMove ?? false);
      setAllowVote(config.allowViewersToVote ?? true);
    }
  }, [config]);

  const buildPayload = (): Partial<TwitchConfig> => ({
    channelName: channelName.trim().replace(/^#/, ""),
    botNickname: botNickname.trim() || "tierforge_bot",
    oauthToken: oauthToken.trim() || null,
    commandPrefix: commandPrefix.trim() || "!",
    allowViewersToAdd: allowAdd,
    allowViewersToMove: allowMove,
    allowViewersToVote: allowVote,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(buildPayload());
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      await onSave(buildPayload());
      await onStart(buildPayload());
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    await onStop();
  };

  const hasChannel = channelName.trim().length > 0;
  const hasOauth = oauthToken.trim().length > 0;

  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio size={13} style={{ color: "var(--amber)" }} />
          <span className="eyebrow-accent">Twitch connection</span>
        </div>
        <span
          className="font-mono text-[9px] uppercase tracking-wider px-2 py-1 rounded-full"
          style={{
            background: ircConnected ? "rgba(100,255,160,0.1)" : "rgba(255,255,255,0.04)",
            color: ircConnected ? "var(--ok)" : "var(--t3)",
            border: `1px solid ${ircConnected ? "rgba(100,255,160,0.2)" : "var(--line)"}`,
          }}
        >
          {ircConnected ? "● Live" : "○ Offline"}
        </span>
      </div>

      <Field label="Channel name">
        <input
          type="text"
          value={channelName}
          onChange={(e) => setChannelName(e.target.value)}
          placeholder="yourchannel"
          className="w-full bg-transparent border-0 outline-none text-[13px] py-1"
          style={{ color: "var(--t1)" }}
        />
      </Field>
      <p className="text-[11px] -mt-2" style={{ color: "var(--t3)" }}>
        The Twitch channel to listen to. Lowercase, no <code style={{ color: "var(--amber)" }}>#</code>.
      </p>

      <Field label="Bot nickname">
        <input
          type="text"
          value={botNickname}
          onChange={(e) => setBotNickname(e.target.value)}
          placeholder="tierforge_bot"
          className="w-full bg-transparent border-0 outline-none text-[13px] py-1"
          style={{ color: "var(--t1)" }}
          disabled={!hasOauth}
        />
      </Field>
      <p className="text-[11px] -mt-2" style={{ color: "var(--t3)" }}>
        Only used if you provide an OAuth token. Anonymous mode uses a random <code style={{ color: "var(--amber)" }}>justinfan</code> name.
      </p>

      <Field label="OAuth token" icon={<KeyRound size={11} style={{ color: "var(--amber)" }} />}>
        <input
          type="password"
          value={oauthToken}
          onChange={(e) => setOauthToken(e.target.value)}
          placeholder="oauth:xxxxxxxxxxxxxxxxxxxxxx"
          className="w-full bg-transparent border-0 outline-none text-[13px] py-1 font-mono"
          style={{ color: "var(--t1)" }}
        />
      </Field>
      <p className="text-[11px] -mt-2 flex items-center gap-1" style={{ color: "var(--t3)" }}>
        Generate one at
        <a
          href="https://twitchtokengenerator.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 underline"
          style={{ color: "var(--amber)" }}
        >
          twitchtokengenerator.com
          <ExternalLink size={9} />
        </a>
        <span className="ml-1">
          (select <code style={{ color: "var(--amber)" }}>chat:read</code> + <code style={{ color: "var(--amber)" }}>chat:edit</code> scopes). Optional — without it the bot listens only.
        </span>
      </p>

      <Field label="Command prefix">
        <input
          type="text"
          value={commandPrefix}
          onChange={(e) => setCommandPrefix(e.target.value)}
          maxLength={2}
          className="w-16 bg-transparent border-0 outline-none text-[13px] py-1 font-mono"
          style={{ color: "var(--t1)" }}
        />
      </Field>

      <div className="space-y-2 pt-1">
        <Toggle
          label="Allow viewers to add items"
          desc="Anyone can use !additem"
          checked={allowAdd}
          onChange={setAllowAdd}
        />
        <Toggle
          label="Allow viewers to move items"
          desc="Anyone can use !moveitem (mods always can)"
          checked={allowMove}
          onChange={setAllowMove}
        />
        <Toggle
          label="Allow viewers to vote"
          desc="Anyone can use !vote"
          checked={allowVote}
          onChange={setAllowVote}
        />
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-ghost flex items-center gap-1.5 text-[12px] py-2 px-4 disabled:opacity-50"
        >
          <Save size={12} />
          {saving ? "Saving…" : savedAt ? "Saved ✓" : "Save"}
        </button>
        {ircConnected ? (
          <button
            type="button"
            onClick={handleStop}
            className="btn-primary text-[12px] py-2 px-4 flex items-center gap-1.5"
            style={{ background: "var(--danger)" }}
          >
            Stop listening
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStart}
            disabled={starting || !hasChannel}
            className="btn-primary text-[12px] py-2 px-4 flex items-center gap-1.5 disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start listening"}
          </button>
        )}
      </div>

      {!activeTierListId && (
        <p className="text-[11px] px-2.5 py-1.5 rounded-md" style={{ background: "rgba(255,205,107,0.08)", color: "var(--warn)", border: "1px solid rgba(255,205,107,0.18)" }}>
          ⚠ Mark a tier list as “Live” to enable chat commands.
        </p>
      )}
    </div>
  );
}

function Field({ label, children, icon }: { label: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1 eyebrow mb-1">{icon}{label}</span>
      <div
        className="px-3 py-1 rounded-[10px] transition-colors focus-within:bg-white/[0.04]"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--line-soft)" }}
      >
        {children}
      </div>
    </label>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-[10px] transition-colors hover:bg-white/[0.02] text-left"
      style={{ border: "1px solid var(--line-soft)" }}
    >
      <div>
        <p className="text-[12px] font-medium" style={{ color: "var(--t1)" }}>{label}</p>
        <p className="text-[10px]" style={{ color: "var(--t3)" }}>{desc}</p>
      </div>
      <span
        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
        style={{ background: checked ? "var(--amber)" : "rgba(255,255,255,0.08)" }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
          style={{
            background: checked ? "#020203" : "var(--t2)",
            transform: checked ? "translateX(18px)" : "translateX(2px)",
          }}
        />
      </span>
    </button>
  );
}
