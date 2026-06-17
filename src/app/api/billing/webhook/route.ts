import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSql } from "@/lib/neon";
import { getStripe, normalizeSubscriptionStatus, syncSubscriptionForCustomer } from "@/lib/stripe-server";

export const dynamic = "force-dynamic";

function customerIdFrom(value: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function syncSubscription(sql: NonNullable<ReturnType<typeof getSql>>, subscription: Stripe.Subscription) {
  const customerId = customerIdFrom(subscription.customer);
  if (!customerId) return;
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const periodEnd = subscription.items.data[0]?.current_period_end
    ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
    : null;

  await sql`
    update auth_users
    set plan_status = ${normalizeSubscriptionStatus(subscription.status)},
        stripe_customer_id = coalesce(stripe_customer_id, ${customerId}),
        stripe_subscription_id = ${subscription.id},
        stripe_price_id = ${priceId},
        subscription_current_period_end = ${periodEnd},
        updated_at = now()
    where stripe_customer_id = ${customerId}
       or id::text = ${subscription.metadata.appUserId ?? ""}
  `;
}

export async function POST(request: NextRequest) {
  const sql = getSql();
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sql) return NextResponse.json({ error: "database unavailable" }, { status: 503 });
  if (!stripe || !webhookSecret) return NextResponse.json({ error: "billing unavailable" }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = customerIdFrom(session.customer);
      if (customerId) await syncSubscriptionForCustomer(sql, customerId);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncSubscription(sql, event.data.object as Stripe.Subscription);
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = customerIdFrom(invoice.customer);
      if (customerId) await syncSubscriptionForCustomer(sql, customerId);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
