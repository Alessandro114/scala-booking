import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import type { Booking, EventType } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { processStripeWebhook, stripeCheckoutReturnUrls, StripeTestPaymentService, StubPaymentService } from "@/server/services/payments";

describe("payment provider boundary", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_unit"; process.env.STRIPE_WEBHOOK_SECRET = "whsec_unit";
    process.env.CALENDAR_PROVIDER = "local";
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); delete process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_WEBHOOK_SECRET; delete process.env.CALENDAR_PROVIDER; delete process.env.STRIPE_CLAIMABLE_SANDBOX; delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY; delete process.env.DEMO_MODE; });
  it("accepts live keys but rejects missing or malformed credentials", () => {
    expect(() => new StripeTestPaymentService("sk_live_configured", {} as unknown as Stripe)).not.toThrow();
    expect(() => new StripeTestPaymentService("")).toThrow(/authorized Stripe credential set/);
    expect(() => new StripeTestPaymentService("pk_live_wrong_kind")).toThrow(/authorized Stripe credential set/);
  });

  it("enforces mode consistency: a live key never acts on test objects and a test key never on live ones", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const booking = { id: "b-mode", workspaceId: "w", durationId: "d", durationMinutes: 30, inviteeEmail: "g@example.invalid", priceCents: 2500, currency: "usd", stripePaymentIntentId: "pi_mode", checkoutResumeExpiresAt: new Date(Date.now() + 3 * 3_600_000) } as unknown as Booking;
    const eventType = { id: "e", slug: "s", name: "S" } as EventType;
    const build = (livemode: boolean, key: string) => {
      const stripe = { checkout: { sessions: { create: vi.fn().mockResolvedValue({ id: "cs_x", url: "https://x.test", livemode }), retrieve: vi.fn().mockResolvedValue({ status: "open", livemode }), expire: vi.fn() } }, paymentIntents: { retrieve: vi.fn().mockResolvedValue({ id: "pi_mode", livemode, amount_received: 2500, currency: "usd" }) }, refunds: { create: vi.fn() } } as unknown as Stripe;
      return { stripe, service: new StripeTestPaymentService(key, stripe) };
    };
    await expect(build(false, "sk_live_unit").service.createCheckout(booking, eventType)).rejects.toThrow("STRIPE_MODE_MISMATCH");
    await expect(build(true, "sk_test_unit").service.createCheckout(booking, eventType)).rejects.toThrow("STRIPE_MODE_MISMATCH");
    await expect(build(false, "sk_live_unit").service.expireCheckout("cs_x")).rejects.toThrow("STRIPE_MODE_MISMATCH");
    await expect(build(true, "sk_test_unit").service.refundPayment(booking)).rejects.toThrow("STRIPE_REFUND_AUTHORITY_MISMATCH");
    const live = build(true, "sk_live_unit");
    await expect(live.service.createCheckout(booking, eventType)).resolves.toEqual({ sessionId: "cs_x", url: "https://x.test" });
    const test = build(false, "sk_test_unit");
    await expect(test.service.expireCheckout("cs_x")).resolves.toBeUndefined();
  });

  it("rejects webhook events whose livemode differs from the configured key", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_unit";
    const body = JSON.stringify({ id: "evt_mode", object: "event", type: "customer.created", livemode: false, created: 1, data: { object: { id: "cus_1", object: "customer" } } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_unit" });
    await expect(processStripeWebhook(body, signature)).rejects.toMatchObject({ code: "STRIPE_MODE_MISMATCH" });
  });

  it("constructs claimable-sandbox Stripe only behind the explicit nonproduction demo gate", () => {
    process.env.DEMO_MODE = "true"; process.env.STRIPE_CLAIMABLE_SANDBOX = "true"; process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_fixture";
    expect(() => new StripeTestPaymentService("rkcs_test_fixture")).not.toThrow();
    vi.stubEnv("NODE_ENV", "production");
    expect(() => new StripeTestPaymentService("rkcs_test_fixture")).toThrow(/authorized Stripe credential set/);
    vi.stubEnv("NODE_ENV", "test");
  });

  it("rejects claimable-sandbox runtime creation when publishable or webhook custody is missing", () => {
    process.env.DEMO_MODE = "true"; process.env.STRIPE_CLAIMABLE_SANDBOX = "true";
    expect(() => new StripeTestPaymentService("rkcs_test_fixture")).toThrow(/complete authorized/);
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_fixture"; delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() => new StripeTestPaymentService("rkcs_test_fixture")).toThrow(/complete authorized/);
  });

  it("rejects claimable-sandbox webhook verification when publishable or webhook custody is missing", async () => {
    process.env.DEMO_MODE = "true"; process.env.STRIPE_CLAIMABLE_SANDBOX = "true"; process.env.STRIPE_SECRET_KEY = "rkcs_test_fixture";
    await expect(processStripeWebhook("{}", "signature")).rejects.toThrow(/not configured/);
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_fixture"; delete process.env.STRIPE_WEBHOOK_SECRET;
    await expect(processStripeWebhook("{}", "signature")).rejects.toThrow(/not configured/);
  });

  it("keeps the default provider network-free", async () => {
    const service = new StubPaymentService();
    expect(await service.createCheckout()).toBeNull();
  });

  it("creates card-only Checkout and a full idempotent refund bound to the stored PaymentIntent", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const create = vi.fn().mockResolvedValue({ id: "cs_test_card_only", url: "https://checkout.stripe.test/session", livemode: false });
    const retrieveIntent = vi.fn().mockResolvedValue({ id: "pi_test_authority", livemode: false, amount_received: 2500, currency: "usd" });
    const createRefund = vi.fn().mockResolvedValue({ id: "re_test_full", status: "succeeded", failure_reason: null });
    const stripe = { checkout: { sessions: { create, retrieve: vi.fn(), expire: vi.fn() } }, paymentIntents: { retrieve: retrieveIntent }, refunds: { create: createRefund } } as unknown as Stripe;
    const booking = { id: "booking-card-only", workspaceId: "workspace-1", durationId: "duration-1", durationMinutes: 30, inviteeEmail: "guest@example.invalid", priceCents: 2500, currency: "usd", stripePaymentIntentId: "pi_test_authority", checkoutResumeExpiresAt: new Date(Date.now() + 24 * 60 * 60_000) } as Booking;
    const eventType = { id: "event-1", slug: "strategy-call", name: "Strategy Call" } as EventType;
    const service = new StripeTestPaymentService("sk_test_unit", stripe);
    await service.createCheckout(booking, eventType);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ mode: "payment", wallet_options: { link: { display: "never" } }, expires_at: Math.floor((Date.now() + (23 * 60 + 55) * 60_000) / 1000) }), { idempotencyKey: "booking:booking-card-only:checkout:v2" });
    // payment_method_types is no longer sent (stripe-mock's current spec rejects it; Stripe now infers
    // methods from the Dashboard's enabled payment methods). Link stays hidden via wallet_options above.
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("payment_method_types");
    expect(JSON.stringify(create.mock.calls[0])).not.toMatch(/afterpay|klarna|cashapp|us_bank_account/);
    await expect(service.refundPayment(booking)).resolves.toEqual({ refundId: "re_test_full", status: "succeeded", failureCode: null });
    expect(createRefund).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_test_authority", amount: 2500, reason: "requested_by_customer" }), { idempotencyKey: "booking:booking-card-only:refund:full:v1" });
    vi.useRealTimers();
  });

  it("returns paid checkout to the actual cookie-backed confirmation contract", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    expect(stripeCheckoutReturnUrls({ id: "booking 1" }, { slug: "strategy-call" })).toEqual({
      successUrl: "http://localhost:3000/book/strategy-call/confirmation?booking=booking%201&payment=success",
      cancelUrl: "http://localhost:3000/manage/booking%201/cancel?slug=strategy-call&payment=cancelled",
    });
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("accepts an exact test-mode paid session once and deduplicates retries", async () => {
    const eventType = await db.eventType.findFirstOrThrow({ include: { durations: true } }); const duration = eventType.durations[0]!;
    const bookingId = randomUUID(); const sessionId = `cs_test_${randomUUID()}`; const eventId = `evt_${randomUUID()}`;
    await db.booking.create({ data: {
      id: bookingId, workspaceId: eventType.workspaceId, eventTypeId: eventType.id, hostId: eventType.ownerId, durationId: duration.id,
      durationMinutes: duration.durationMinutes, priceCents: 2500, currency: "usd", inviteeName: "Paid Test",
      inviteeEmail: "paid@example.com", inviteeTimeZone: "UTC", startAt: new Date("2099-03-01T15:00:00Z"), endAt: new Date("2099-03-01T15:30:00Z"),
      status: "PENDING_PAYMENT", stripeCheckoutSessionId: sessionId, stripePaymentStatus: "unpaid", capabilityVersion: randomUUID(), manageExpiresAt: new Date("2099-04-01T00:00:00Z"),
    } });
    const payload = JSON.stringify({
      id: eventId, object: "event", type: "checkout.session.completed", livemode: false, created: 1,
      data: { object: { id: sessionId, object: "checkout.session", livemode: false, mode: "payment", status: "complete", client_reference_id: bookingId, payment_status: "paid", payment_intent: { id: `pi_${bookingId}`, latest_charge: `ch_${bookingId}` }, amount_total: 2500, currency: "usd", metadata: { bookingId, eventTypeId: eventType.id, durationId: duration.id } } },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_unit" });
    expect(await processStripeWebhook(payload, signature)).toEqual({ duplicate: false, eventId });
    expect(await processStripeWebhook(payload, signature)).toEqual({ duplicate: true, eventId });
    const collidedPayload = payload.replace('"amount_total":2500', '"amount_total":2501');
    const collidedSignature = Stripe.webhooks.generateTestHeaderString({ payload: collidedPayload, secret: "whsec_unit" });
    await expect(processStripeWebhook(collidedPayload, collidedSignature)).rejects.toThrow(/identity/);
    expect(await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).toMatchObject({ status: "CONFIRMED", stripePaymentIntentId: `pi_${bookingId}`, stripeChargeId: `ch_${bookingId}`, refundStatus: "NOT_REQUIRED" });
    expect(await db.integrationOutbox.findFirst({ where: { bookingId, status: "COMPLETED" } })).not.toBeNull();
    await db.booking.delete({ where: { id: bookingId } }); await db.webhookEvent.delete({ where: { id: eventId } });
  });

  it("queues and reconciles a full refund when paid completion arrives after cancellation", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const eventType = await db.eventType.findFirstOrThrow({ include: { durations: true } }); const duration = eventType.durations[0]!;
    const bookingId = randomUUID(); const sessionId = `cs_test_${randomUUID()}`; const paymentIntentId = `pi_${randomUUID()}`; const checkoutEventId = `evt_${randomUUID()}`;
    await db.booking.create({ data: {
      id: bookingId, workspaceId: eventType.workspaceId, eventTypeId: eventType.id, hostId: eventType.ownerId, durationId: duration.id, durationMinutes: duration.durationMinutes,
      priceCents: 2500, currency: "usd", inviteeName: "Refund Test", inviteeEmail: "refund@example.invalid", inviteeTimeZone: "UTC",
      startAt: new Date("2099-03-03T15:00:00Z"), endAt: new Date("2099-03-03T15:30:00Z"), status: "CANCELLED",
      stripeCheckoutSessionId: sessionId, stripePaymentStatus: "unpaid", capabilityVersion: randomUUID(), manageExpiresAt: new Date("2099-04-03T00:00:00Z"),
    } });
    const checkoutPayload = JSON.stringify({ id: checkoutEventId, object: "event", type: "checkout.session.completed", livemode: false, created: 1,
      data: { object: { id: sessionId, object: "checkout.session", livemode: false, mode: "payment", status: "complete", client_reference_id: bookingId, payment_status: "paid", payment_intent: { id: paymentIntentId, latest_charge: `ch_${bookingId}` }, amount_total: 2500, currency: "usd", metadata: { bookingId, eventTypeId: eventType.id, durationId: duration.id } } } });
    await processStripeWebhook(checkoutPayload, Stripe.webhooks.generateTestHeaderString({ payload: checkoutPayload, secret: "whsec_unit" }));
    expect(await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).toMatchObject({ status: "CANCELLED", stripePaymentStatus: "paid_after_cancel", stripePaymentIntentId: paymentIntentId, refundStatus: "REFUND_PENDING" });
    expect(await db.integrationOutbox.findUnique({ where: { idempotencyKey: `stripe:refund:${bookingId}:full:v1` } })).toMatchObject({ kind: "STRIPE_REFUND", status: "PENDING" });

    const refundId = `re_${randomUUID()}`; const refundEventId = `evt_${randomUUID()}`;
    const refundPayload = JSON.stringify({ id: refundEventId, object: "event", type: "refund.updated", livemode: false, created: 2,
      data: { object: { id: refundId, object: "refund", status: "succeeded", amount: 2500, currency: "usd", payment_intent: paymentIntentId, metadata: { bookingId, workspaceId: eventType.workspaceId } } } });
    const refundSignature = Stripe.webhooks.generateTestHeaderString({ payload: refundPayload, secret: "whsec_unit" });
    await expect(processStripeWebhook(refundPayload, refundSignature)).resolves.toEqual({ duplicate: false, eventId: refundEventId });
    await expect(processStripeWebhook(refundPayload, refundSignature)).resolves.toEqual({ duplicate: true, eventId: refundEventId });
    expect(await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).toMatchObject({ refundStatus: "REFUNDED", stripeRefundId: refundId, refundedAmountCents: 2500 });
    expect(await db.integrationOutbox.findUnique({ where: { idempotencyKey: `stripe:refund:${bookingId}:full:v1` } })).toMatchObject({ status: "COMPLETED" });
    const expiredEventId = `evt_${randomUUID()}`;
    const expiredPayload = JSON.stringify({ id: expiredEventId, object: "event", type: "checkout.session.expired", livemode: false, created: 3,
      data: { object: { id: sessionId, object: "checkout.session", livemode: false, mode: "payment", status: "expired", client_reference_id: bookingId, payment_status: "unpaid", amount_total: 2500, currency: "usd", metadata: { bookingId, eventTypeId: eventType.id, durationId: duration.id } } } });
    await processStripeWebhook(expiredPayload, Stripe.webhooks.generateTestHeaderString({ payload: expiredPayload, secret: "whsec_unit" }));
    expect(await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).toMatchObject({ stripePaymentStatus: "paid_after_cancel", refundStatus: "REFUNDED", stripeRefundId: refundId, refundedAmountCents: 2500 });
    await db.booking.delete({ where: { id: bookingId } }); await db.webhookEvent.deleteMany({ where: { id: { in: [checkoutEventId, refundEventId, expiredEventId] } } });
  });

  it("rejects an inexact expired event without releasing the booking", async () => {
    const eventType = await db.eventType.findFirstOrThrow({ include: { durations: true } }); const duration = eventType.durations[0]!;
    const bookingId = randomUUID(); const sessionId = `cs_test_${randomUUID()}`; const eventId = `evt_${randomUUID()}`;
    await db.booking.create({ data: {
      id: bookingId, workspaceId: eventType.workspaceId, eventTypeId: eventType.id, hostId: eventType.ownerId, durationId: duration.id, durationMinutes: duration.durationMinutes,
      priceCents: 2500, currency: "usd", inviteeName: "Expiry Test", inviteeEmail: "expiry@example.com", inviteeTimeZone: "UTC",
      startAt: new Date("2099-03-02T15:00:00Z"), endAt: new Date("2099-03-02T15:30:00Z"), status: "PENDING_PAYMENT",
      stripeCheckoutSessionId: sessionId, stripePaymentStatus: "unpaid", idempotencyKey: randomUUID(), requestFingerprint: randomUUID(), capabilityVersion: randomUUID(), manageExpiresAt: new Date("2099-04-02T00:00:00Z"),
    } });
    const payload = JSON.stringify({
      id: eventId, object: "event", type: "checkout.session.expired", livemode: false, created: 1,
      data: { object: { id: sessionId, object: "checkout.session", livemode: false, mode: "payment", status: "open", client_reference_id: bookingId, payment_status: "unpaid", amount_total: 2500, currency: "usd", metadata: { bookingId, eventTypeId: eventType.id, durationId: duration.id } } },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_unit" });
    await expect(processStripeWebhook(payload, signature)).rejects.toThrow(/expiry/);
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("PENDING_PAYMENT");
    expect(await db.webhookEvent.findUnique({ where: { id: eventId } })).toBeNull();
    await db.booking.delete({ where: { id: bookingId } });
  });
});
