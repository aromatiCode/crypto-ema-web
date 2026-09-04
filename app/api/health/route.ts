import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date().toISOString();
  return NextResponse.json({
    ok: true,
    receivedAt: now,
    message: "Railway worker heartbeat received. If this timestamp updates every ~60s, the worker is running.",
  });
}
