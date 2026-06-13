import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/neon";

export async function POST(request: NextRequest) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ enabled: false });

  const { clientKey, email } = (await request.json()) as {
    clientKey?: string;
    email?: string;
  };

  if (!clientKey) {
    return NextResponse.json({ error: "clientKey is required" }, { status: 400 });
  }

  const rows = await sql`
    insert into app_profiles (client_key, email, updated_at)
    values (${clientKey}, ${email || null}, now())
    on conflict (client_key) do update set
      email = coalesce(excluded.email, app_profiles.email),
      updated_at = now()
    returning id, email
  `;

  return NextResponse.json({ enabled: true, profile: rows[0] });
}
