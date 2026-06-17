import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/auth-server";
import { getSql } from "@/lib/neon";

export async function POST(request: NextRequest) {
  const sql = getSql();
  const response = NextResponse.json({ ok: true });
  if (sql) await clearSession(sql, request, response);
  return response;
}
