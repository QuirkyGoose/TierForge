"use client";

interface CommandReferenceProps {
  prefix: string;
}

interface CommandDef {
  name: string;
  args: string;
  desc: string;
  access: "all" | "mods";
}

const COMMANDS: CommandDef[] = [
  { name: "additem", args: "<name>", desc: "Add a new item to the pool.", access: "all" },
  { name: "moveitem", args: "<name> <tier>", desc: "Move an item to a tier (S/A/B/C/D/F).", access: "mods" },
  { name: "vote", args: "<name>", desc: "Vote for an item. Vote again to unvote.", access: "all" },
  { name: "resetvotes", args: "", desc: "Reset all vote counts to zero.", access: "mods" },
  { name: "tierlist", args: "", desc: "Show the active tier list name in chat.", access: "all" },
  { name: "commands", args: "", desc: "List all available chat commands.", access: "all" },
];

export function CommandReference({ prefix }: CommandReferenceProps) {
  return (
    <div className="glass-soft p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="eyebrow">Chat commands</span>
        <span className="eyebrow" style={{ color: "var(--amber)" }}>{prefix}</span>
      </div>
      <div className="space-y-2">
        {COMMANDS.map((c) => (
          <div key={c.name} className="flex items-baseline gap-2 py-1.5 border-b last:border-b-0" style={{ borderColor: "var(--line-soft)" }}>
            <code
              className="font-mono text-[12px] shrink-0"
              style={{ color: "var(--amber)", fontWeight: 500 }}
            >
              {prefix}{c.name}
            </code>
            <span className="font-mono text-[11px] shrink-0" style={{ color: "var(--t3)" }}>
              {c.args}
            </span>
            <span className="flex-1 text-[11px]" style={{ color: "var(--t2)" }}>
              {c.desc}
            </span>
            <span
              className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0"
              style={{
                background: c.access === "mods" ? "rgba(255,205,107,0.1)" : "rgba(100,255,160,0.08)",
                color: c.access === "mods" ? "var(--warn)" : "var(--ok)",
                border: `1px solid ${c.access === "mods" ? "rgba(255,205,107,0.2)" : "rgba(100,255,160,0.15)"}`,
              }}
            >
              {c.access}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
