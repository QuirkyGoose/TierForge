import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const items = await db.tierItem.findMany({ where: { tierListId: id }, orderBy: { order: "asc" } });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const name = (body.name as string | undefined)?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const list = await db.tierList.findUnique({ where: { id }, include: { _count: { select: { items: true } } } });
  if (!list) return NextResponse.json({ error: "Tier list not found" }, { status: 404 });

  // Duplicate check (case-insensitive — SQLite doesn't support mode: insensitive)
  const allItems = await db.tierItem.findMany({ where: { tierListId: id }, select: { id: true, name: true } });
  const dupe = allItems.find((i) => i.name.toLowerCase() === name.toLowerCase());
  if (dupe) return NextResponse.json({ item: dupe, duplicate: true });

  const item = await db.tierItem.create({
    data: {
      tierListId: id,
      name: name.slice(0, 80),
      imageUrl: body.imageUrl ?? null,
      addedBy: body.addedBy ?? "streamer",
      order: list._count.items,
    },
  });

  await db.chatLog.create({
    data: {
      username: body.addedBy ?? "streamer",
      message: `!additem ${name}`,
      command: "additem",
      tierListId: id,
      isCommand: true,
      isActioned: true,
    },
  }).catch(() => {});

  return NextResponse.json({ item });
}
