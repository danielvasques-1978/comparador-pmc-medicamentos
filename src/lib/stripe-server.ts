import Stripe from "stripe";
import type { getSql } from "@/lib/neon";

type Sql = NonNullable<ReturnType<typeof getSql>>;

export const paidPlanStatuses = new Set(["active", "trialing"]);

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey, {
    apiVersion: "2026-05-27.dahlia",
  });
}

export function getAppUrl(requestUrl?: string) {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (requestUrl) return new URL(requestUrl).origin;
  return "http://localhost:3000";
}

export async function getOrCreateStripeCustomer(sql: Sql, userId: string, email: string) {
  const stripe = getStripe();
  if (!stripe) throw new Error("stripe_not_configured");

  const rows = await sql`
    select stripe_customer_id
    from auth_users
    where id = ${userId} and deleted_at is null
    limit 1
  `;
  const existingCustomerId = rows[0]?.stripe_customer_id as string | undefined;
  if (existingCustomerId) return existingCustomerId;

  const customer = await stripe.customers.create({
    email,
    metadata: {
      appUserId: userId,
    },
  });

  await sql`
    update auth_users
    set stripe_customer_id = ${customer.id}, updated_at = now()
    where id = ${userId}
  `;

  return customer.id;
}

export function normalizeSubscriptionStatus(status?: string | null) {
  if (!status) return "free";
  return paidPlanStatuses.has(status) ? "active" : status;
}

export async function syncSubscriptionForCustomer(sql: Sql, customerId: string) {
  const stripe = getStripe();
  if (!stripe) throw new Error("stripe_not_configured");

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
  });

  const subscription = subscriptions.data
    .filter((item) => item.status !== "canceled" && item.status !== "incomplete_expired")
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0];

  if (!subscription) {
    await sql`
      update auth_users
      set plan_status = 'free',
          stripe_subscription_id = null,
          stripe_price_id = null,
          subscription_current_period_end = null,
          updated_at = now()
      where stripe_customer_id = ${customerId}
    `;
    return;
  }

  const priceId = subscription.items.data[0]?.price.id ?? null;
  const periodEnd = subscription.items.data[0]?.current_period_end
    ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
    : null;

  await sql`
    update auth_users
    set plan_status = ${normalizeSubscriptionStatus(subscription.status)},
        stripe_subscription_id = ${subscription.id},
        stripe_price_id = ${priceId},
        subscription_current_period_end = ${periodEnd},
        updated_at = now()
    where stripe_customer_id = ${customerId}
  `;
}
