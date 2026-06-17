import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/neon";
import { getProfileId } from "@/lib/profile-server";

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

  const { profileId, user } = await getProfileId(sql, request, clientKey);

  const rows = user
    ? await sql`select id, email from app_profiles where id = ${profileId}`
    : await sql`
      update app_profiles
      set email = coalesce(${email || null}, email), updated_at = now()
      where id = ${profileId}
      returning id, email
    `;

  return NextResponse.json({ enabled: true, profile: rows[0] });
}
