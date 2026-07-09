import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const { itemId } = await ctx.params;
  const item = await db.tierItem.findUnique({ where: { id: itemId } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const { itemId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const data: any = {};
  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.imageUrl === "string") data.imageUrl = body.imageUrl;
  if (body.rowId !== undefined) data.rowId = body.rowId || null;
  if (typeof body.order === "number") data.order = body.order;
  const item = await db.tierItem.update({ where: { id: itemId }, data });
  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const { itemId } = await ctx.params;
  await db.tierItem.delete({ where: { id: itemId } });
  return NextResponse.json({ ok: true });
}
