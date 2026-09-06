import { NextRequest, NextResponse } from "next/server";
import { comGuarda } from "@/lib/api-guard";
import { getSql } from "@/lib/neon";
import { getProfileId } from "@/lib/profile-server";

export async function GET(request: NextRequest) {
  return comGuarda("profile/favorites GET", async () => {
    const sql = getSql();
    const clientKey = request.nextUrl.searchParams.get("clientKey");
    if (!sql || !clientKey) return NextResponse.json({ favorites: [] });

    const { profileId } = await getProfileId(sql, request, clientKey);
    const rows = await sql`
      select medicine_id
      from user_favorites
      where profile_id = ${profileId}
    `;

    return NextResponse.json({ favorites: rows.map((row) => row.medicine_id) });
  });
}

export async function POST(request: NextRequest) {
  return comGuarda("profile/favorites POST", async () => {
    const sql = getSql();
    if (!sql) return NextResponse.json({ enabled: false });

    const { clientKey, medicineId, favorite } = (await request.json()) as {
      clientKey?: string;
      medicineId?: string;
      favorite?: boolean;
    };

    if (!clientKey || !medicineId) {
      return NextResponse.json({ error: "clientKey and medicineId are required" }, { status: 400 });
    }

    const { profileId } = await getProfileId(sql, request, clientKey);
    if (favorite) {
      // medicine_id tem chave estrangeira para medicines; um id inexistente
      // violaria a restrição. Só insere se o medicamento existe — favoritar um
      // id desconhecido vira no-op, não um 500.
      await sql`
        insert into user_favorites (profile_id, medicine_id)
        select ${profileId}, ${medicineId}
        where exists (select 1 from medicines where id = ${medicineId})
        on conflict do nothing
      `;
    } else {
      await sql`
        delete from user_favorites
        where profile_id = ${profileId} and medicine_id = ${medicineId}
      `;
    }

    return NextResponse.json({ enabled: true });
  });
}
