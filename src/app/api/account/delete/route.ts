import { NextRequest, NextResponse } from "next/server";
import { clearSession, getCurrentUser } from "@/lib/auth-server";
import { getSql } from "@/lib/neon";

export async function POST(request: NextRequest) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const user = await getCurrentUser(sql, request);
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });

  await sql`delete from app_profiles where user_id = ${user.id}`;
  await sql`delete from auth_users where id = ${user.id}`;

  const response = NextResponse.json({ ok: true });
  await clearSession(sql, request, response);
  return response;
}
