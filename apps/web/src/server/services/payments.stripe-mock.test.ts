// Runs the real Stripe SDK against stripe-mock (Stripe's official OpenAPI-validated mock server).
// Skipped unless STRIPE_MOCK_PORT is set, e.g. docker run -p 127.0.0.1:12111:12111 stripe/stripe-mock
import Stripe from "stripe";
import type { Booking, EventType } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StripeTestPaymentService } from "@/server/services/payments";

const port = Number(process.env.STRIPE_MOCK_PORT || 0);
const d = port ? describe : describe.skip;

d("payments against stripe-mock (spec-validated Stripe API)", () => {
  const client = (dropPaymentMethodTypes = true) => {
    const stripe = new Stripe("sk_test_mock", { host: "127.0.0.1", port, protocol: "http", maxNetworkRetries: 0 });
    if (!dropPaymentMethodTypes) return stripe;
    // stripe-mock's spec (2026-09) no longer lists payment_method_types for Checkout, while the pinned SDK API
    // version (2026-07-29.dahlia) still does. Everything else is validated; the divergence has its own test below.
    const create = stripe.checkout.sessions.create.bind(stripe.checkout.sessions);
    (stripe.checkout.sessions as { create: unknown }).create = (params: Stripe.Checkout.SessionCreateParams, options?: Stripe.RequestOptions) => create({ ...params, payment_method_types: undefined }, options);
    return stripe;
  };
  const booking = () => ({ id: "b-mock", workspaceId: "w", durationId: "d", durationMinutes: 30, inviteeEmail: "guest@example.invalid", priceCents: 2500, currency: "usd", stripePaymentIntentId: "pi_mock", checkoutResumeExpiresAt: new Date(Date.now() + 3 * 3_600_000) } as unknown as Booking);
  const eventType = { id: "e", slug: "strategy-call", name: "Strategy Call" } as EventType;

  beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://book.get-scala.com"); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("sends a spec-valid card-only Checkout Session and gets a test-mode session back", async () => {
    const service = new StripeTestPaymentService("sk_test_unit", client());
    const result = await service.createCheckout(booking(), eventType);
    expect(result?.sessionId).toMatch(/^cs_/);
    expect(result?.url).toMatch(/^https:\/\//);
  });

  it("KNOWN DIVERGENCE: stripe-mock rejects payment_method_types — confirm against a real Stripe test key before bumping the SDK/API version", async () => {
    const service = new StripeTestPaymentService("sk_test_unit", client(false));
    await expect(service.createCheckout(booking(), eventType)).rejects.toThrow(/additional properties are not allowed/);
  });

  it("expires an open session through the API", async () => {
    const service = new StripeTestPaymentService("sk_test_unit", client());
    await expect(service.expireCheckout("cs_test_mock")).resolves.toBeUndefined();
  });

  it("refuses to act when the configured key kind (live) does not match the object mode (test)", async () => {
    const service = new StripeTestPaymentService("sk_live_configured", client());
    await expect(service.createCheckout(booking(), eventType)).rejects.toThrow("STRIPE_MODE_MISMATCH");
    await expect(service.expireCheckout("cs_test_mock")).rejects.toThrow("STRIPE_MODE_MISMATCH");
  });

  it("does not refund a payment whose authority (amount) differs from the stored booking", async () => {
    const service = new StripeTestPaymentService("sk_test_unit", client());
    await expect(service.refundPayment({ ...booking(), priceCents: 999_999 } as Booking)).rejects.toThrow("STRIPE_REFUND_AUTHORITY_MISMATCH");
  });
});
