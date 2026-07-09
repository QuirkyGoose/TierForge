import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.voteRecord.deleteMany({ where: { tierListId: id } });
  await db.tierItem.updateMany({ where: { tierListId: id }, data: { voteCount: 0 } });
  return NextResponse.json({ ok: true });
}
