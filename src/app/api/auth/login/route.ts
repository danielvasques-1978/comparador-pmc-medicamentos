import { NextRequest, NextResponse } from "next/server";
import { createSession, normalizeEmail, verifyPassword } from "@/lib/auth-server";
import { getSql } from "@/lib/neon";

export async function POST(request: NextRequest) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const { email, password } = (await request.json()) as {
    email?: string;
    password?: string;
  };

  const normalizedEmail = normalizeEmail(email ?? "");
  const rows = await sql`
    select id, email, password_hash, plan_status
    from auth_users
    where email = ${normalizedEmail} and deleted_at is null
    limit 1
  `;
  const user = rows[0];

  if (!user || !password || !verifyPassword(password, user.password_hash as string)) {
    return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
  }

  const response = NextResponse.json({
    user: { id: user.id, email: user.email, planStatus: user.plan_status },
  });
  await createSession(sql, user.id as string, response);
  return response;
}
