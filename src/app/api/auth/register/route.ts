import { NextRequest, NextResponse } from "next/server";
import { createSession, hashPassword, normalizeEmail } from "@/lib/auth-server";
import { getSql } from "@/lib/neon";

export async function POST(request: NextRequest) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const { email, password, acceptedPrivacy } = (await request.json()) as {
    email?: string;
    password?: string;
    acceptedPrivacy?: boolean;
  };

  const normalizedEmail = normalizeEmail(email ?? "");
  if (!normalizedEmail || !password || password.length < 8) {
    return NextResponse.json({ error: "Informe e-mail e senha com pelo menos 8 caracteres." }, { status: 400 });
  }
  if (!acceptedPrivacy) {
    return NextResponse.json({ error: "Aceite os termos e a política de privacidade." }, { status: 400 });
  }

  try {
    const rows = await sql`
      insert into auth_users (email, password_hash, terms_accepted_at, privacy_accepted_at)
      values (${normalizedEmail}, ${hashPassword(password)}, now(), now())
      returning id, email, plan_status, subscription_current_period_end
    `;

    const response = NextResponse.json({
      user: {
        id: rows[0].id,
        email: rows[0].email,
        planStatus: rows[0].plan_status,
        subscriptionCurrentPeriodEnd: rows[0].subscription_current_period_end,
      },
    });
    await createSession(sql, rows[0].id as string, response);
    return response;
  } catch {
    return NextResponse.json({ error: "Já existe uma conta com este e-mail." }, { status: 409 });
  }
}
