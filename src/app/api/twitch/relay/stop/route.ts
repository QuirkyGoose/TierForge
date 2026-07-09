import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const base = reqUrlBase(req);
  try {
    const res = await fetch(`${base}/api/twitch/relay/stop`, { method: "POST" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to stop relay" }, { status: 500 });
  }
}

function reqUrlBase(req: NextRequest) {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
