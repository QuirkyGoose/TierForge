import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const name = (body.name as string | undefined)?.trim();
  const username = (body.username as string | undefined)?.trim();

  if (!name || !username) return NextResponse.json({ error: "name and username required" }, { status: 400 });

  const allItems = await db.tierItem.findMany({ where: { tierListId: id } });
  const item = allItems.find((i) => i.name.toLowerCase() === name.toLowerCase());
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const existing = await db.voteRecord.findUnique({
    where: { username_itemId: { username, itemId: item.id } },
  });

  if (existing) {
    await db.$transaction([
      db.voteRecord.delete({ where: { id: existing.id } }),
      db.tierItem.update({ where: { id: item.id }, data: { voteCount: { decrement: 1 } } }),
    ]);
    return NextResponse.json({ item: { ...item, voteCount: item.voteCount - 1 }, voted: false });
  }

  await db.$transaction([
    db.voteRecord.create({ data: { username, itemId: item.id, tierListId: id } }),
    db.tierItem.update({ where: { id: item.id }, data: { voteCount: { increment: 1 } } }),
  ]);

  return NextResponse.json({ item: { ...item, voteCount: item.voteCount + 1 }, voted: true });
}
