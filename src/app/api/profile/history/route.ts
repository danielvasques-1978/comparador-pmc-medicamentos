import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/neon";

async function getProfileId(clientKey: string) {
  const sql = getSql();
  if (!sql) return null;
  const rows = await sql`
    insert into app_profiles (client_key)
    values (${clientKey})
    on conflict (client_key) do update set updated_at = now()
    returning id
  `;
  return rows[0]?.id as string | undefined;
}

export async function GET(request: NextRequest) {
  const sql = getSql();
  const clientKey = request.nextUrl.searchParams.get("clientKey");
  if (!sql || !clientKey) return NextResponse.json({ history: [] });

  const profileId = await getProfileId(clientKey);
  const rows = await sql`
    select query
    from search_history
    where profile_id = ${profileId}
    order by created_at desc
    limit 6
  `;

  return NextResponse.json({ history: rows.map((row) => row.query) });
}

export async function POST(request: NextRequest) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ enabled: false });

  const { clientKey, query, uf, icmsRate, resultCount } = (await request.json()) as {
    clientKey?: string;
    query?: string;
    uf?: string;
    icmsRate?: string;
    resultCount?: number;
  };

  if (!clientKey || !query || !uf || !icmsRate) {
    return NextResponse.json({ error: "clientKey, query, uf and icmsRate are required" }, { status: 400 });
  }

  const profileId = await getProfileId(clientKey);
  await sql`
    insert into search_history (profile_id, query, uf, icms_rate, result_count)
    values (${profileId}, ${query}, ${uf}, ${icmsRate}, ${resultCount ?? 0})
  `;

  return NextResponse.json({ enabled: true });
}
