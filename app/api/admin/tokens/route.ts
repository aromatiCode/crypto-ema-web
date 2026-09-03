import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/admin";
import { addToken, removeToken, readConfigFiles } from "@/lib/github";
import { config as staticConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/tokens
 * Returns the live token list from the repo (with a fallback to the
 * build-time list if the GitHub API is unreachable).
 */
export async function GET() {
  const username = await getCurrentUser();
  if (!username) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  try {
    const { root, cloud } = await readConfigFiles();
    if (root?.data.tokens) {
      return NextResponse.json({ tokens: root.data.tokens });
    }
    return NextResponse.json({ tokens: staticConfig.tokens });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to read repo: ${msg}` },
      { status: 502 }
    );
  }
}

/**
 * POST /api/admin/tokens   { token: "BTC" }
 * Adds a token to both config.json files in the repo.
 */
export async function POST(req: NextRequest) {
  const username = await getCurrentUser();
  if (!username) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  let body: { token?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const token = (body.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }
  try {
    await addToken(token);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/**
 * DELETE /api/admin/tokens   { token: "BTC" }
 * Removes a token from both config.json files in the repo.
 */
export async function DELETE(req: NextRequest) {
  const username = await getCurrentUser();
  if (!username) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  let body: { token?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const token = (body.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }
  try {
    await removeToken(token);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
