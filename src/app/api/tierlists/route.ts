import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const DEFAULT_TIERS = [
  { label: "S", color: "#ff7a6b" },
  { label: "A", color: "#d4a853" },
  { label: "B", color: "#d49274" },
  { label: "C", color: "#d9a3b8" },
  { label: "D", color: "#b894d9" },
  { label: "F", color: "#9bbf9b" },
];

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `tl-${Date.now().toString(36)}`;
}

export async function GET() {
  const lists = await db.tierList.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true } } },
  });
  return NextResponse.json({ lists });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const title = (body.title as string | undefined)?.trim() || "Untitled Tier List";
  const description = (body.description as string | undefined)?.trim() || null;
  const accent = (body.accent as string | undefined) || "#d4a853";

  const slugBase = slugify(title);
  let slug = slugBase;
  let n = 1;
  while (await db.tierList.findUnique({ where: { slug } })) {
    slug = `${slugBase}-${n++}`;
  }

  const list = await db.tierList.create({
    data: {
      title,
      description,
      slug,
      accent,
      rows: {
        create: DEFAULT_TIERS.map((t, i) => ({ label: t.label, color: t.color, order: i })),
      },
    },
    include: { rows: { orderBy: { order: "asc" } }, items: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json({ list });
}
