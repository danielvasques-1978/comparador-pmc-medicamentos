import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/neon";
import { getProfileId } from "@/lib/profile-server";

export async function GET(request: NextRequest) {
  const sql = getSql();
  const clientKey = request.nextUrl.searchParams.get("clientKey");
  if (!sql || !clientKey) return NextResponse.json({ settings: null });

  const { profileId } = await getProfileId(sql, request, clientKey);
  const rows = await sql`
    select uf_icms_map
    from user_settings
    where profile_id = ${profileId}
  `;

  return NextResponse.json({ settings: rows[0]?.uf_icms_map ?? null });
}

export async function POST(request: NextRequest) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ enabled: false });

  const { clientKey, ufIcmsMap } = (await request.json()) as {
    clientKey?: string;
    ufIcmsMap?: Record<string, string>;
  };

  if (!clientKey || !ufIcmsMap) {
    return NextResponse.json({ error: "clientKey and ufIcmsMap are required" }, { status: 400 });
  }

  const { profileId } = await getProfileId(sql, request, clientKey);
  await sql`
    insert into user_settings (profile_id, uf_icms_map, updated_at)
    values (${profileId}, ${JSON.stringify(ufIcmsMap)}::jsonb, now())
    on conflict (profile_id) do update set
      uf_icms_map = excluded.uf_icms_map,
      updated_at = now()
  `;

  return NextResponse.json({ enabled: true });
}
