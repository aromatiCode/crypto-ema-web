import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const username = await getCurrentUser();
  return NextResponse.json({ authenticated: !!username, username });
}
