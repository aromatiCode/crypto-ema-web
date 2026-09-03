/**
 * Admin authentication helpers.
 *
 * - Session cookies are signed with HMAC-SHA256 via the `jose` library.
 * - The signing secret comes from the ADMIN_SESSION_SECRET env var.
 * - Passwords are stored as bcrypt hashes in the Supabase `admin_users` table.
 *
 * On the very first call to `seedDefaultAdminIfMissing`, a row with
 * username=admin and password=admin is created. The user is expected to
 * change the password from the UI immediately.
 */

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { getServerSupabase } from "./supabase";

const COOKIE_NAME = "ema_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

function getSecretKey(): Uint8Array {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "ADMIN_SESSION_SECRET env var is required and must be at least 16 characters."
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  sub: string; // username
  exp: number; // unix seconds
}

export async function signSession(username: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  return await new SignJWT({ sub: username, exp })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(getSecretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") {
      return null;
    }
    return { sub: payload.sub, exp: payload.exp };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<string | null> {
  const c = cookies().get(COOKIE_NAME);
  if (!c?.value) return null;
  const session = await verifySession(c.value);
  return session?.sub ?? null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

interface AdminRow {
  id: number;
  username: string;
  password_hash: string;
}

/**
 * If no admin user exists, create one with default credentials
 * (admin / admin). Returns the seeded row so the caller can decide
 * whether to surface a 'change your password' hint.
 */
export async function seedDefaultAdminIfMissing(): Promise<void> {
  const client = getServerSupabase();
  if (!client) return;
  const { data, error } = await client
    .from("admin_users")
    .select("id")
    .limit(1);
  if (error) throw error;
  if (data && data.length > 0) return;

  const passwordHash = await bcrypt.hash("admin", 10);
  const { error: insertErr } = await client
    .from("admin_users")
    .insert({ username: "admin", password_hash: passwordHash });
  if (insertErr) throw insertErr;
}

export async function getAdminRow(username: string): Promise<AdminRow | null> {
  const client = getServerSupabase();
  if (!client) return null;
  const { data, error } = await client
    .from("admin_users")
    .select("id,username,password_hash")
    .eq("username", username)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as AdminRow | null) ?? null;
}

export async function verifyCredentials(
  username: string,
  password: string
): Promise<boolean> {
  await seedDefaultAdminIfMissing();
  const row = await getAdminRow(username);
  if (!row) return false;
  return await bcrypt.compare(password, row.password_hash);
}

export async function changePassword(
  username: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (newPassword.length < 6) {
    return { ok: false, reason: "New password must be at least 6 characters." };
  }
  const row = await getAdminRow(username);
  if (!row) return { ok: false, reason: "User not found." };
  const ok = await bcrypt.compare(currentPassword, row.password_hash);
  if (!ok) return { ok: false, reason: "Current password is incorrect." };
  const newHash = await bcrypt.hash(newPassword, 10);
  const client = getServerSupabase();
  if (!client) return { ok: false, reason: "Database not configured." };
  const { error } = await client
    .from("admin_users")
    .update({ password_hash: newHash, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
