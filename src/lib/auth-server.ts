import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { getSql } from "@/lib/neon";

type Sql = NonNullable<ReturnType<typeof getSql>>;

export type AuthUser = {
  id: string;
  email: string;
  planStatus: string;
  subscriptionCurrentPeriodEnd: string | null;
};

export const sessionCookieName = "comparador_pmc_session";
const useSecureCookie = process.env.VERCEL === "1";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, hash] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
}

export async function createSession(sql: Sql, userId: string, response: NextResponse) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  await sql`
    insert into auth_sessions (token_hash, user_id, expires_at)
    values (${tokenHash}, ${userId}, ${expiresAt.toISOString()})
  `;

  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: useSecureCookie,
    path: "/",
    expires: expiresAt,
  });
}

export async function getCurrentUser(sql: Sql, request: NextRequest): Promise<AuthUser | null> {
  const token = request.cookies.get(sessionCookieName)?.value;
  return getCurrentUserByToken(sql, token);
}

export async function getCurrentUserByToken(sql: Sql, token?: string): Promise<AuthUser | null> {
  if (!token) return null;

  const rows = await sql`
    select u.id, u.email, u.plan_status, u.subscription_current_period_end
    from auth_sessions s
    join auth_users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)}
      and s.expires_at > now()
      and u.deleted_at is null
    limit 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id as string,
    email: row.email as string,
    planStatus: row.plan_status as string,
    subscriptionCurrentPeriodEnd: row.subscription_current_period_end
      ? new Date(row.subscription_current_period_end as string).toISOString()
      : null,
  };
}

export function isAdminEmail(email: string) {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
  return adminEmails.includes(normalizeEmail(email));
}

export async function clearSession(sql: Sql, request: NextRequest, response: NextResponse) {
  const token = request.cookies.get(sessionCookieName)?.value;
  if (token) {
    await sql`delete from auth_sessions where token_hash = ${hashToken(token)}`;
  }
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: useSecureCookie,
    path: "/",
    maxAge: 0,
  });
}
