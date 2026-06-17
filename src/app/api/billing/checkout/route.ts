import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { getSql } from "@/lib/neon";
import { getAppUrl, getOrCreateStripeCustomer, getStripe } from "@/lib/stripe-server";

export async function POST(request: NextRequest) {
  const sql = getSql();
  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!sql) return NextResponse.json({ error: "database unavailable" }, { status: 503 });
  if (!stripe || !priceId) {
    return NextResponse.json({ error: "billing unavailable" }, { status: 503 });
  }

  const user = await getCurrentUser(sql, request);
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });

  const appUrl = getAppUrl(request.url);
  const customerId = await getOrCreateStripeCustomer(sql, user.id, user.email);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/?billing=success`,
    cancel_url: `${appUrl}/?billing=cancelled`,
    client_reference_id: user.id,
    metadata: {
      appUserId: user.id,
    },
    subscription_data: {
      metadata: {
        appUserId: user.id,
      },
    },
  });

  if (!session.url) return NextResponse.json({ error: "checkout unavailable" }, { status: 502 });
  return NextResponse.json({ url: session.url });
}
