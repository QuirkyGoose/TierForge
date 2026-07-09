import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const list = await db.tierList.findUnique({
    where: { id },
    include: {
      rows: { orderBy: { order: "asc" } },
      items: { orderBy: { order: "asc" } },
    },
  });
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ list });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const data: any = {};
  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.accent === "string") data.accent = body.accent;
  if (typeof body.isLive === "boolean") {
    if (body.isLive) {
      await db.tierList.updateMany({ where: { id: { not: id }, isLive: true }, data: { isLive: false } });
    }
    data.isLive = body.isLive;
  }
  const list = await db.tierList.update({
    where: { id },
    data,
    include: { rows: { orderBy: { order: "asc" } }, items: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json({ list });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.tierList.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
