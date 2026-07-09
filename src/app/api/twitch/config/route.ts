import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const cfg = await db.twitchConfig.findUnique({ where: { id: "singleton" } });
  if (!cfg) {
    const created = await db.twitchConfig.create({ data: { id: "singleton" } });
    return NextResponse.json({ config: created, activeTierListId: null });
  }
  const live = await db.tierList.findFirst({ where: { isLive: true } });
  return NextResponse.json({ config: cfg, activeTierListId: live?.id ?? null });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const data: any = {};
  for (const k of [
    "channelName",
    "botNickname",
    "oauthToken",
    "commandPrefix",
    "allowViewersToAdd",
    "allowViewersToMove",
    "allowViewersToVote",
    "autoStartOnBoot",
  ]) {
    if (k in body) data[k] = body[k];
  }
  const existing = await db.twitchConfig.findUnique({ where: { id: "singleton" } });
  let cfg;
  if (existing) cfg = await db.twitchConfig.update({ where: { id: "singleton" }, data });
  else cfg = await db.twitchConfig.create({ data: { id: "singleton", ...data } });

  // Also sync to the Durable Object (so it has the latest config)
  try {
    const base = reqUrlBase(req);
    await fetch(`${base}/api/twitch/relay/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {}

  return NextResponse.json({ config: cfg });
}

function reqUrlBase(req: NextRequest) {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
