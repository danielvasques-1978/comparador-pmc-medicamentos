import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { getSql } from "@/lib/neon";

export async function GET(request: NextRequest) {
  const sql = getSql();
  if (!sql) return NextResponse.json({ user: null });
  const user = await getCurrentUser(sql, request);
  return NextResponse.json({ user });
}
