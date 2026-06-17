import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { getSql } from "@/lib/neon";

export async function GET(request: NextRequest) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ error: "database unavailable" }, { status: 503 });

  const user = await getCurrentUser(sql, request);
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });

  const [profiles, favorites, settings, history] = await Promise.all([
    sql`select id, email, created_at, updated_at from app_profiles where user_id = ${user.id}`,
    sql`
      select f.medicine_id, f.created_at
      from user_favorites f
      join app_profiles p on p.id = f.profile_id
      where p.user_id = ${user.id}
    `,
    sql`
      select s.uf_icms_map, s.updated_at
      from user_settings s
      join app_profiles p on p.id = s.profile_id
      where p.user_id = ${user.id}
    `,
    sql`
      select h.query, h.uf, h.icms_rate, h.result_count, h.created_at
      from search_history h
      join app_profiles p on p.id = h.profile_id
      where p.user_id = ${user.id}
      order by h.created_at desc
    `,
  ]);

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    user,
    profiles,
    favorites,
    settings,
    history,
  });
}
