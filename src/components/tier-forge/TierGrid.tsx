"use client";

import { DndContext, type DragEndEvent, type DragStartEvent, PointerSensor, useSensor, useSensors, DragOverlay, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useMemo } from "react";
import { Trash2 } from "lucide-react";
import type { TierList, TierItem, TierRow } from "./types";

interface TierGridProps {
  list: TierList;
  onMove: (itemId: string, targetRowId: string | null) => Promise<void> | void;
  onReorder: (rowId: string | null, orderedIds: string[]) => Promise<void> | void;
  onDelete: (itemId: string) => Promise<void> | void;
}

function SortableItem({ item, accent, onDelete }: { item: TierItem; accent: string; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      {...attributes}
      {...listeners}
      className="group relative flex items-center gap-1.5 px-2.5 py-1.5 mr-1 mb-1 pill text-sm lift-on-hover select-none"
      title={`${item.name}${item.voteCount ? ` · ${item.voteCount} vote${item.voteCount === 1 ? "" : "s"}` : ""}`}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      />
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          className="relative w-5 h-5 rounded-full object-cover"
          style={{ boxShadow: `0 0 0 1px ${accent}33` }}
        />
      ) : (
        <div
          className="relative w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium"
          style={{ background: `${accent}22`, color: accent }}
        >
          {item.name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <span className="relative text-[13px] leading-none" style={{ color: "var(--t1)" }}>
        {item.name}
      </span>
      {item.voteCount > 0 && (
        <span
          className="relative ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider"
          style={{ background: `${accent}1a`, color: accent, letterSpacing: "0.08em" }}
        >
          {item.voteCount}
        </span>
      )}
      <span
        className="relative text-[9px] font-mono uppercase tracking-wider ml-0.5"
        style={{ color: "var(--t3)" }}
        title={`Added by ${item.addedBy}`}
      >
        {item.addedBy === "streamer" ? "★" : item.addedBy.slice(0, 6)}
      </span>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(item.id);
        }}
        className="relative opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 p-0.5"
        title="Remove item"
        tabIndex={-1}
      >
        <Trash2 size={11} style={{ color: "var(--danger)" }} />
      </button>
    </div>
  );
}

function TierRowView({
  row,
  items,
  accent,
  onMove,
  onDelete,
}: {
  row: TierRow;
  items: TierItem[];
  accent: string;
  onMove: (itemId: string, targetRowId: string | null) => void;
  onDelete: (itemId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `row-${row.id}` });

  return (
    <div
      ref={setNodeRef}
      className="flex items-stretch rounded-[14px] overflow-hidden lift-on-hover"
      style={{
        border: `1px solid ${isOver ? `${row.color}80` : "var(--line)"}`,
        background: isOver ? `${row.color}10` : "var(--bg-panel)",
        backdropFilter: "blur(10px)",
        minHeight: "68px",
        transition: "border-color 0.2s, background 0.2s",
      }}
    >
      <div
        className="flex items-center justify-center px-5 min-w-[88px]"
        style={{
          background: `linear-gradient(135deg, ${row.color} 0%, ${row.color}cc 100%)`,
          boxShadow: `inset 0 0 30px rgba(0,0,0,0.25), 0 0 0 1px ${row.color}33`,
        }}
      >
        <span className="tier-label">{row.label}</span>
      </div>
      <div className="flex-1 flex flex-wrap items-center px-3 py-2.5 gap-0">
        <SortableContext items={items.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
          {items.length === 0 ? (
            <span className="text-xs font-mono uppercase tracking-wider px-2" style={{ color: "var(--t3)" }}>
              Drop items here
            </span>
          ) : (
            items.map((item) => (
              <SortableItem key={item.id} item={item} accent={accent} onDelete={onDelete} />
            ))
          )}
        </SortableContext>
      </div>
      <button
        type="button"
        onClick={() => items.forEach((it) => onMove(it.id, null))}
        className="px-3 text-[10px] font-mono uppercase tracking-wider opacity-0 hover:opacity-100 transition-opacity"
        style={{ color: "var(--t3)" }}
        title="Clear all items in this row"
      >
        Empty
      </button>
    </div>
  );
}

function PoolRow({
  items,
  accent,
  onMove,
  onDelete,
}: {
  items: TierItem[];
  accent: string;
  onMove: (itemId: string, targetRowId: string | null) => void;
  onDelete: (itemId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "row-pool" });
  return (
    <div
      ref={setNodeRef}
      className="flex items-stretch rounded-[14px] overflow-hidden lift-on-hover"
      style={{
        border: `1px ${isOver ? "solid" : "dashed"} ${isOver ? `${accent}80` : "var(--line)"}`,
        background: isOver ? `${accent}08` : "transparent",
        backdropFilter: "blur(10px)",
        minHeight: "68px",
        transition: "border-color 0.2s, background 0.2s",
      }}
    >
      <div
        className="flex items-center justify-center px-5 min-w-[88px]"
        style={{
          background: "rgba(255,255,255,0.03)",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
        }}
      >
        <span
          className="font-mono uppercase"
          style={{
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.2em",
            color: "var(--t3)",
          }}
        >
          Pool
        </span>
      </div>
      <div className="flex-1 flex flex-wrap items-center px-3 py-2.5 gap-0">
        <SortableContext items={items.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
          {items.length === 0 ? (
            <span className="text-xs font-mono uppercase tracking-wider px-2" style={{ color: "var(--t3)" }}>
              Unsorted items
            </span>
          ) : (
            items.map((item) => <SortableItem key={item.id} item={item} accent={accent} onDelete={onDelete} />)
          )}
        </SortableContext>
      </div>
    </div>
  );
}

export function TierGrid({ list, onMove, onReorder, onDelete }: TierGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragOverride, setDragOverride] = useState<{ itemId: string; targetRowId: string | null } | null>(null);

  // Items currently visible — props.items, with a temporary override applied during drag.
  const localItems: TierItem[] = useMemo(() => {
    if (!dragOverride) return list.items;
    return list.items.map((i) =>
      i.id === dragOverride.itemId ? { ...i, rowId: dragOverride.targetRowId } : i
    );
  }, [list.items, dragOverride]);

  const activeItem = useMemo(() => localItems.find((i) => i.id === activeId) || null, [localItems, activeId]);

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const draggedId = activeId;
    setActiveId(null);
    setDragOverride(null);
    const { active, over } = e;
    if (!over || !draggedId) return;

    const activeIdLocal = String(active.id);
    const overId = String(over.id);

    let targetRowId: string | null = null;
    let sameRowReorder = false;

    if (overId.startsWith("row-")) {
      targetRowId = overId === "row-pool" ? null : overId.slice(4);
    } else {
      const overItem = list.items.find((i) => i.id === overId);
      const activeItem = list.items.find((i) => i.id === activeIdLocal);
      if (!overItem || !activeItem) return;
      targetRowId = overItem.rowId;
      sameRowReorder = activeItem.rowId === overItem.rowId;
    }

    if (sameRowReorder) {
      const rowItems = list.items
        .filter((i) => i.rowId === targetRowId)
        .sort((a, b) => a.order - b.order);
      const oldIndex = rowItems.findIndex((i) => i.id === activeIdLocal);
      const newIndex = rowItems.findIndex((i) => i.id === overId);
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = arrayMove(rowItems, oldIndex, newIndex);
      onReorder(targetRowId, reordered.map((i) => i.id));
    } else {
      onMove(activeIdLocal, targetRowId);
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="space-y-2">
        {list.rows.map((row) => (
          <TierRowView
            key={row.id}
            row={row}
            items={localItems.filter((i) => i.rowId === row.id)}
            accent={list.accent}
            onMove={onMove}
            onDelete={onDelete}
          />
        ))}
        <PoolRow
          items={localItems.filter((i) => i.rowId === null)}
          accent={list.accent}
          onMove={onMove}
          onDelete={onDelete}
        />
      </div>
      <DragOverlay>
        {activeItem ? (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 pill text-sm"
            style={{
              background: "rgba(20,20,22,0.95)",
              border: `1px solid ${list.accent}80`,
              boxShadow: `0 12px 30px ${list.accent}40`,
            }}
          >
            <span style={{ color: list.accent }}>●</span>
            <span style={{ color: "var(--t1)" }}>{activeItem.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
