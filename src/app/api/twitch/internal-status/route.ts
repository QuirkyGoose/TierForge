import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const data: any = {};
  if (typeof body.isListening === "boolean") data.isListening = body.isListening;
  if (body.lastConnectedAt) data.lastConnectedAt = new Date(body.lastConnectedAt);
  if ("lastError" in body) data.lastError = body.lastError ?? null;

  const existing = await db.twitchConfig.findUnique({ where: { id: "singleton" } });
  if (existing) await db.twitchConfig.update({ where: { id: "singleton" }, data });
  else await db.twitchConfig.create({ data: { id: "singleton", ...data } });
  return NextResponse.json({ ok: true });
}
