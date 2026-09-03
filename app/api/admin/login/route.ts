import { NextRequest, NextResponse } from "next/server";
import {
  signSession,
  verifyCredentials,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required." },
      { status: 400 }
    );
  }

  const ok = await verifyCredentials(username, password);
  if (!ok) {
    return NextResponse.json(
      { error: "Invalid username or password." },
      { status: 401 }
    );
  }

  const token = await signSession(username);
  const res = NextResponse.json({ ok: true, username });
  res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return res;
}
