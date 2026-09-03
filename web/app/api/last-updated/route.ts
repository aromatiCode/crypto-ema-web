import { NextResponse } from "next/server";
import { getBrowserSupabase } from "@/lib/supabase-browser";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export async function GET() {
  const client = getBrowserSupabase();
  if (!client) {
    return NextResponse.json({ lastUpdated: null });
  }
  const { data, error } = await client
    .from("trend_transitions")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    return NextResponse.json({ lastUpdated: null }, { status: 500 });
  }
  const lastUpdated = data && data.length > 0 ? String(data[0].created_at) : null;
  return NextResponse.json({ lastUpdated });
}
