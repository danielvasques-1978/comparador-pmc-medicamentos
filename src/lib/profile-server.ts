import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import type { getSql } from "@/lib/neon";

type Sql = NonNullable<ReturnType<typeof getSql>>;

export async function getProfileId(sql: Sql, request: NextRequest, clientKey?: string | null) {
  const user = await getCurrentUser(sql, request);

  if (user) {
    const rows = await sql`
      insert into app_profiles (client_key, email, user_id, updated_at)
      values (${"user:" + user.id}, ${user.email}, ${user.id}, now())
      on conflict (client_key) do update set
        email = excluded.email,
        user_id = excluded.user_id,
        updated_at = now()
      returning id
    `;
    return { profileId: rows[0]?.id as string | undefined, user };
  }

  if (!clientKey) return { profileId: null, user: null };

  const rows = await sql`
    insert into app_profiles (client_key)
    values (${clientKey})
    on conflict (client_key) do update set updated_at = now()
    returning id
  `;
  return { profileId: rows[0]?.id as string | undefined, user: null };
}
