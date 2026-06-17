import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { getSql } from "@/lib/neon";
import { getAppUrl, getOrCreateStripeCustomer, getStripe } from "@/lib/stripe-server";

export async function POST(request: NextRequest) {
  const sql = getSql();
  const stripe = getStripe();

  if (!sql) return NextResponse.json({ error: "database unavailable" }, { status: 503 });
  if (!stripe) return NextResponse.json({ error: "billing unavailable" }, { status: 503 });

  const user = await getCurrentUser(sql, request);
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });

  const customerId = await getOrCreateStripeCustomer(sql, user.id, user.email);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: getAppUrl(request.url),
  });

  return NextResponse.json({ url: session.url });
}
