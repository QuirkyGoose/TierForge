"use client";

import { useCallback, useEffect, useState } from "react";
import { MetaballsBackground } from "@/components/tier-forge/MetaballsBackground";
import { Halftone } from "@/components/tier-forge/Halftone";
import { TierGrid } from "@/components/tier-forge/TierGrid";
import { ChatFeed } from "@/components/tier-forge/ChatFeed";
import { SettingsPanel } from "@/components/tier-forge/SettingsPanel";
import { CommandReference } from "@/components/tier-forge/CommandReference";
import { useTwitchSocket } from "@/components/tier-forge/useTwitchSocket";
import type { TierList, TwitchConfig } from "@/components/tier-forge/types";
import {
  Plus,
  Radio,
  ListPlus,
  Trash2,
  Star,
  Hash,
  Settings2,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";

export default function Page() {
  const [lists, setLists] = useState<TierList[]>([]);
  const [activeList, setActiveList] = useState<TierList | null>(null);
  const [activeListId, setActiveListIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState("");
  const [showSettings, setShowSettings] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newListTitle, setNewListTitle] = useState("");
  const [config, setConfig] = useState<TwitchConfig | null>(null);
  const [mobileTab, setMobileTab] = useState<"list" | "chat">("list");

  const tw = useTwitchSocket();

  // Load initial list of tier lists
  const loadLists = useCallback(async () => {
    const res = await fetch("/api/tierlists");
    const data = await res.json();
    setLists(data.lists ?? []);
    return data.lists ?? [];
  }, []);

  const loadActive = useCallback(async (id: string) => {
    const res = await fetch(`/api/tierlists/${id}`);
    const data = await res.json();
    setActiveList(data.list ?? null);
  }, []);

  const loadConfig = useCallback(async () => {
    const res = await fetch("/api/twitch/config");
    const data = await res.json();
    setConfig(data.config ?? null);
    if (data.activeTierListId && !activeListId) {
      setActiveListIdState(data.activeTierListId);
      tw.setActiveTierList(data.activeTierListId);
      await loadActive(data.activeTierListId);
    }
  }, [activeListId, tw]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const all = await loadLists();
      // Auto-select first list if exists
      if (all.length > 0 && !activeListId) {
        const first = all[0];
        setActiveListIdState(first.id);
        await loadActive(first.id);
      }
      await loadConfig();
      setLoading(false);
    })();
  }, []);

  // When config arrives from socket, merge
  useEffect(() => {
    if (tw.config) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfig((prev) => ({ ...(prev ?? ({} as TwitchConfig)), ...tw.config } as TwitchConfig));
    }
  }, [tw.config]);

  // When tier list updates arrive from socket, reload the active list
  useEffect(() => {
    if (!activeListId || tw.tierListUpdatedAt === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadActive(activeListId);
  }, [tw.tierListUpdatedAt, activeListId, loadActive]);

  // ---- Handlers ----
  const handleSelectList = async (id: string) => {
    setActiveListIdState(id);
    await loadActive(id);
  };

  const handleMarkLive = async (id: string) => {
    // Toggle isLive
    const target = lists.find((l) => l.id === id);
    const next = !target?.isLive;
    await fetch(`/api/tierlists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isLive: next }),
    });
    // Refresh lists (so other lists' isLive flag updates)
    const fresh = await loadLists();
    // Sync the active-tierlist signal to the relay service
    const newActiveId = next ? id : null;
    tw.setActiveTierList(newActiveId);
    if (newActiveId) await loadActive(newActiveId);
    else setActiveList(null);
  };

  const handleCreateList = async () => {
    if (!newListTitle.trim()) return;
    setCreating(true);
    const res = await fetch("/api/tierlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newListTitle.trim() }),
    });
    const data = await res.json();
    setNewListTitle("");
    setCreating(false);
    if (data.list) {
      await loadLists();
      await handleSelectList(data.list.id);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeListId || !newItemName.trim()) return;
    const res = await fetch(`/api/tierlists/${activeListId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newItemName.trim(), addedBy: "streamer" }),
    });
    if (res.ok) {
      setNewItemName("");
      await loadActive(activeListId);
    }
  };

  const handleMove = async (itemId: string, targetRowId: string | null) => {
    if (!activeListId) return;
    await fetch(`/api/tierlists/${activeListId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowId: targetRowId }),
    });
    await loadActive(activeListId);
  };

  const handleReorder = async (_rowId: string | null, _orderedIds: string[]) => {
    // Optional: persist order. For now we just trust the in-memory state.
    // Could call a dedicated reorder endpoint if needed.
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!activeListId) return;
    await fetch(`/api/tierlists/${activeListId}/items/${itemId}`, { method: "DELETE" });
    await loadActive(activeListId);
  };

  const handleDeleteList = async (id: string) => {
    if (!confirm("Delete this tier list? Items and history will be lost.")) return;
    await fetch(`/api/tierlists/${id}`, { method: "DELETE" });
    const fresh = await loadLists();
    if (activeListId === id) {
      const next = fresh[0]?.id ?? null;
      setActiveListIdState(next);
      if (next) await loadActive(next);
      else setActiveList(null);
      tw.setActiveTierList(next);
    }
  };

  const handleSaveConfig = async (cfg: Partial<TwitchConfig>) => {
    await fetch("/api/twitch/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    tw.sendConfigUpdate(cfg);
    await loadConfig();
  };

  const handleStart = async (cfg: Partial<TwitchConfig>) => {
    tw.sendStart(cfg);
  };

  const handleStop = async () => {
    tw.sendStop();
  };

  const accent = activeList?.accent ?? "#d4a853";
  const activeListSummary = lists.find((l) => l.id === activeListId);

  return (
    <>
      <MetaballsBackground accent={accent} />
      <Halftone accent={accent} />

      <div className="relative" style={{ zIndex: 2, minHeight: "100dvh" }}>
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 px-5 md:px-8 py-3.5 flex items-center justify-between"
          style={{
            background: "rgba(2,2,3,0.78)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            borderBottom: "1px solid var(--line-soft)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${accent} 0%, ${accent}80 100%)`,
                boxShadow: `0 0 0 1px rgba(255,255,255,0.12), 0 0 0 4px ${accent}11, 0 2px 8px rgba(0,0,0,0.35)`,
              }}
            >
              <span className="display-hero text-[18px]" style={{ color: "#020203" }}>T</span>
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: "var(--font-brand)", fontSize: 21, fontWeight: 500, letterSpacing: "0.03em", color: "var(--t1)" }}>
                  Tier Forge
                </span>
                <span className="eyebrow" style={{ color: "var(--t3)" }}>· v1.0</span>
              </div>
              <p className="eyebrow" style={{ color: "var(--t3)" }}>
                Twitch-powered tier list studio
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{
                background: tw.ircConnected ? "rgba(100,255,160,0.08)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${tw.ircConnected ? "rgba(100,255,160,0.18)" : "var(--line)"}`,
              }}
            >
              <span
                className={tw.ircConnected ? "live-dot" : ""}
                style={!tw.ircConnected ? { width: 8, height: 8, borderRadius: "50%", background: "var(--t4)" } : undefined}
              />
              <span
                className="font-mono text-[10px] uppercase tracking-wider"
                style={{ color: tw.ircConnected ? "var(--ok)" : "var(--t3)" }}
              >
                {tw.ircConnected ? `#${config?.channelName ?? "—"}` : "Twitch offline"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="btn-ghost px-3 py-1.5 hidden md:flex items-center gap-1.5 text-[12px]"
              title={showSettings ? "Hide settings" : "Show settings"}
            >
              {showSettings ? <EyeOff size={12} /> : <Eye size={12} />}
              Settings
            </button>
          </div>
        </header>

        {/* Mobile tab switcher */}
        <div className="md:hidden sticky top-[58px] z-20 flex border-b" style={{ background: "rgba(2,2,3,0.78)", backdropFilter: "blur(14px)", borderColor: "var(--line-soft)" }}>
          {(["list", "chat"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className="flex-1 py-2.5 text-center font-mono text-[10px] uppercase tracking-wider transition-colors"
              style={{
                color: mobileTab === tab ? "var(--amber)" : "var(--t3)",
                borderBottom: mobileTab === tab ? `1px solid ${accent}` : "1px solid transparent",
              }}
            >
              {tab === "list" ? "Tier list" : "Chat & Twitch"}
            </button>
          ))}
        </div>

        <main className="px-5 md:px-8 pt-6 pb-12 max-w-[1400px] mx-auto">
          {/* Hero / active tier list header */}
          <section className="mb-6 fade-in-up">
            <p className="eyebrow mb-2">
              {activeListSummary?.isLive ? (
                <span style={{ color: "var(--ok)" }}>● Live · Chat commands enabled</span>
              ) : (
                "Studio · Drag, drop, or let chat build it"
              )}
            </p>
            <h1 className="display-hero" style={{ fontSize: "clamp(36px, 5.5vw, 64px)", marginBottom: 6 }}>
              {activeList?.title ?? "Pick a tier list"}
              <span style={{ color: accent, fontStyle: "italic" }}>.</span>
            </h1>
            <p style={{ color: "var(--t2)", fontSize: 14, maxWidth: 640 }}>
              {activeList?.description ??
                "Drop items into tiers with your mouse, or let your Twitch chat add and move items with simple commands. Mark a list as Live to enable chat."}
            </p>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] lg:grid-cols-[260px_1fr_360px] gap-4">
            {/* Sidebar: list picker */}
            <aside
              className={`${mobileTab === "list" ? "block" : "hidden"} md:block space-y-3`}
            >
              <div className="glass p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="eyebrow-accent flex items-center gap-1.5">
                    <ListPlus size={11} /> Tier lists
                  </span>
                  <span className="eyebrow" style={{ color: "var(--t3)" }}>{lists.length}</span>
                </div>

                <form onSubmit={handleCreateList} className="mb-3 flex gap-1.5">
                  <input
                    type="text"
                    value={newListTitle}
                    onChange={(e) => setNewListTitle(e.target.value)}
                    placeholder="New list title…"
                    className="flex-1 px-3 py-1.5 rounded-[10px] text-[12px] outline-none"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid var(--line)",
                      color: "var(--t1)",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={creating || !newListTitle.trim()}
                    className="px-2.5 py-1.5 rounded-[10px] transition-colors disabled:opacity-50"
                    style={{ background: accent, color: "#020203" }}
                    title="Create"
                  >
                    <Plus size={14} />
                  </button>
                </form>

                <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
                  {lists.length === 0 ? (
                    <p className="text-[11px] py-4 text-center" style={{ color: "var(--t3)" }}>
                      No tier lists yet. Create one above.
                    </p>
                  ) : (
                    lists.map((l) => (
                      <div
                        key={l.id}
                        onClick={() => handleSelectList(l.id)}
                        className="group cursor-pointer px-3 py-2.5 rounded-[10px] transition-all lift-on-hover"
                        style={{
                          background: activeListId === l.id ? `${l.accent}14` : "transparent",
                          border: `1px solid ${activeListId === l.id ? `${l.accent}55` : "var(--line-soft)"}`,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: l.accent, boxShadow: `0 0 8px ${l.accent}55` }}
                          />
                          <span className="flex-1 text-[13px] truncate" style={{ color: "var(--t1)" }}>
                            {l.title}
                          </span>
                          {l.isLive && (
                            <span
                              className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                              style={{ background: "rgba(255,80,80,0.15)", color: "var(--live)" }}
                            >
                              <span className="live-dot inline-block mr-1 align-middle" style={{ width: 5, height: 5 }} />
                              Live
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 pl-4">
                          <span className="eyebrow" style={{ color: "var(--t3)" }}>
                            {l._count?.items ?? 0} items
                          </span>
                          <span className="eyebrow" style={{ color: "var(--t4)" }}>·</span>
                          <span className="eyebrow" style={{ color: "var(--t3)" }}>
                            {new Date(l.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {activeList && (
                <div className="glass p-4 space-y-2">
                  <span className="eyebrow-accent">Quick actions</span>
                  <button
                    type="button"
                    onClick={() => handleMarkLive(activeList.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12px] transition-colors"
                    style={{
                      background: activeList.isLive ? "rgba(255,80,80,0.08)" : "rgba(255,80,80,0.04)",
                      border: `1px solid ${activeList.isLive ? "rgba(255,80,80,0.25)" : "var(--line)"}`,
                      color: activeList.isLive ? "var(--live)" : "var(--t1)",
                    }}
                  >
                    {activeList.isLive ? <EyeOff size={12} /> : <Radio size={12} />}
                    {activeList.isLive ? "Stop live session" : "Go live · enable chat"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteList(activeList.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12px] transition-colors hover:bg-white/[0.03]"
                    style={{ border: "1px solid var(--line)", color: "var(--t3)" }}
                  >
                    <Trash2 size={12} />
                    Delete tier list
                  </button>
                  {activeList.isLive && (
                    <p className="text-[10px] leading-snug px-2" style={{ color: "var(--t3)" }}>
                      <Hash size={9} className="inline mr-0.5" />
                      Chat in <span style={{ color: accent }}>#{config?.channelName ?? "—"}</span> can now use <code style={{ color: accent }}>!additem</code>, <code style={{ color: accent }}>!moveitem</code>, <code style={{ color: accent }}>!vote</code>.
                    </p>
                  )}
                </div>
              )}
            </aside>

            {/* Main: tier grid + add item */}
            <section className={`${mobileTab === "list" ? "block" : "hidden"} md:block space-y-3`}>
              {loading ? (
                <div className="glass p-12 flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" style={{ color: accent }} />
                  <span className="eyebrow">Loading tier lists…</span>
                </div>
              ) : !activeList ? (
                <div className="glass p-12 text-center">
                  <Star size={28} style={{ color: accent, margin: "0 auto 8px" }} />
                  <p className="display-section mb-1" style={{ fontSize: 28 }}>No tier list selected</p>
                  <p style={{ color: "var(--t2)", fontSize: 13 }}>
                    Create one from the sidebar, or pick an existing list to get started.
                  </p>
                </div>
              ) : (
                <>
                  <form
                    onSubmit={handleAddItem}
                    className="glass px-4 py-2.5 flex items-center gap-2"
                  >
                    <Plus size={14} style={{ color: accent }} />
                    <input
                      type="text"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder={`Add an item to “${activeList.title}”…`}
                      className="flex-1 bg-transparent outline-none text-[13px]"
                      style={{ color: "var(--t1)" }}
                      maxLength={80}
                    />
                    <button
                      type="submit"
                      disabled={!newItemName.trim()}
                      className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-opacity disabled:opacity-40"
                      style={{ background: accent, color: "#020203" }}
                    >
                      Add
                    </button>
                  </form>

                  <TierGrid
                    list={activeList}
                    onMove={handleMove}
                    onReorder={handleReorder}
                    onDelete={handleDeleteItem}
                  />

                  {tw.lastUpdateReason && (
                    <div
                      className="px-3 py-2 rounded-[10px] text-[11px] flex items-center gap-1.5"
                      style={{ background: `${accent}0e`, border: `1px solid ${accent}33`, color: "var(--t2)" }}
                    >
                      <span style={{ color: accent }}>↻</span>
                      {tw.lastUpdateReason}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Right rail: chat + settings + commands */}
            <aside
              className={`${mobileTab === "chat" ? "block" : "hidden"} md:block space-y-3`}
              style={{ minHeight: 400 }}
            >
              <div style={{ height: 380, minHeight: 280 }}>
                <ChatFeed
                  messages={tw.messages}
                  commands={tw.commands}
                  statuses={tw.statuses}
                  events={tw.events}
                  ircConnected={tw.ircConnected}
                  onClear={tw.clearMessages}
                />
              </div>

              {showSettings && (
                <SettingsPanel
                  config={config}
                  ircConnected={tw.ircConnected}
                  activeTierListId={activeListId}
                  onSave={handleSaveConfig}
                  onStart={handleStart}
                  onStop={handleStop}
                />
              )}

              <CommandReference prefix={config?.commandPrefix ?? "!"} />
            </aside>
          </div>
        </main>

        <footer
          className="mt-auto px-5 md:px-8 py-4 border-t flex items-center justify-between text-[10px]"
          style={{ borderColor: "var(--line-soft)", color: "var(--t3)", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase" }}
        >
          <span>Tier Forge · Twitch-Powered Tier Lists</span>
          <span className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: tw.connected ? "var(--ok)" : "var(--t4)" }}
            />
            {tw.connected ? "Relay connected" : "Relay offline"}
          </span>
        </footer>
      </div>
    </>
  );
}
