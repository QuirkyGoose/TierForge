import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const name = (body.name as string | undefined)?.trim();
  const tierLabel = (body.tierLabel as string | undefined)?.trim()?.toUpperCase();
  const username = body.username ?? "streamer";

  if (!name || !tierLabel) return NextResponse.json({ error: "name and tierLabel required" }, { status: 400 });

  const allItems = await db.tierItem.findMany({ where: { tierListId: id } });
  const item = allItems.find((i) => i.name.toLowerCase() === name.toLowerCase());
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const allRows = await db.tierRow.findMany({ where: { tierListId: id } });
  const row = allRows.find((r) => r.label.toUpperCase() === tierLabel);
  if (!row) return NextResponse.json({ error: `Tier ${tierLabel} not found` }, { status: 404 });

  const updated = await db.tierItem.update({ where: { id: item.id }, data: { rowId: row.id } });

  await db.chatLog.create({
    data: {
      username,
      message: `!moveitem ${name} ${tierLabel}`,
      command: "moveitem",
      tierListId: id,
      isCommand: true,
      isActioned: true,
    },
  }).catch(() => {});

  return NextResponse.json({ item: updated });
}
