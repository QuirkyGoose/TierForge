import { NextRequest, NextResponse } from "next/server";

/**
 * Start the Twitch IRC relay.
 * Proxies to the Durable Object which maintains the actual IRC connection.
 *
 * Body: { channelName, botNickname, oauthToken, commandPrefix }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const base = reqUrlBase(req);
  try {
    const res = await fetch(`${base}/api/twitch/relay/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to start relay" }, { status: 500 });
  }
}

function reqUrlBase(req: NextRequest) {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
