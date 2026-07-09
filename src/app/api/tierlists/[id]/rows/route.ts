import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Bulk-replace all tier rows for a tier list. */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const rows: Array<{ label: string; color: string; order: number }> = body.rows ?? [];

  await db.tierRow.deleteMany({ where: { tierListId: id } });
  if (rows.length) {
    await db.tierRow.createMany({
      data: rows.map((r) => ({
        tierListId: id,
        label: r.label.slice(0, 4),
        color: r.color,
        order: r.order,
      })),
    });
  }

  const fresh = await db.tierList.findUnique({
    where: { id },
    include: { rows: { orderBy: { order: "asc" } }, items: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json({ list: fresh });
}
