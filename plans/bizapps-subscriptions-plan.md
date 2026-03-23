# BizApps-Subscriptions — Open App Plan

## Overview

**BizApps-Subscriptions** is an MJ Open App that layers business-level subscription management on top of BizApps-Payments. While Payments handles the provider primitives ("tell Stripe to charge this card monthly"), Subscriptions handles the business logic ("Gold plan includes features X, Y, Z with a 14-day trial and $20/month annual billing").

**Repository**: Standalone Open App repo (e.g., `MemberJunction/mj-bizapps-subscriptions`)
**Schema**: `bizapps_subscriptions`
**Depends on**: BizApps-Payments (≥1.0.0), BizApps-Common (≥1.0.0), MJ Core (≥5.15.0)

---

## Why a Separate App from Payments?

The split follows the same principle as Communication vs. Email Marketing:

| Layer | Payments (Provider Primitives) | Subscriptions (Business Logic) |
|-------|-------------------------------|-------------------------------|
| **Scope** | "Create a $20/month subscription in Stripe" | "Upgrade user from Silver to Gold plan with prorated credit" |
| **Entities** | Subscription (thin: external ID, status, period dates) | SubscriptionPlan, PlanTier, Entitlement, MemberSubscription |
| **Provider-aware?** | Yes — each provider has different APIs | No — works through PaymentEngine abstraction |
| **Who uses it?** | Payment engine internals, webhook handlers | Application code, agents, dashboards, workflows |
| **Required?** | Can use Payments without Subscriptions (one-time charges) | Cannot use Subscriptions without Payments |

Organizations that only need one-time payments (event registrations, donations, e-commerce) install BizApps-Payments alone. Organizations with recurring billing add BizApps-Subscriptions on top.

---

## Architecture

### How the Layers Connect

```
┌─────────────────────────────────────────────────────┐
│  BizApps-Subscriptions (this app)                   │
│                                                     │
│  SubscriptionPlan ─── PlanTier ─── Entitlement      │
│         │                                           │
│  MemberSubscription ──────────────────────────┐     │
│         │                                     │     │
│         │  calls PaymentEngine to create/      │     │
│         │  update/cancel provider subscription  │     │
│         ▼                                     ▼     │
├─────────────────────────────────────────────────────┤
│  BizApps-Payments                                   │
│                                                     │
│  PaymentEngine.GetProvider('Stripe')                │
│      .CreateSubscription(priceId, customerId)       │
│                                                     │
│  Subscription entity (thin) ← webhook updates       │
│  Invoice entity ← webhook creates                   │
├─────────────────────────────────────────────────────┤
│  BizApps-Common                                     │
│                                                     │
│  Person / Organization (who is subscribing)          │
└─────────────────────────────────────────────────────┘
```

### Key Principle: Subscriptions Engine Calls PaymentEngine Directly

```typescript
// ✅ CORRECT — Direct engine call, full type safety
import { PaymentEngine } from '@bizapps/payments-engine';

const provider = PaymentEngine.Instance.GetProvider('Stripe');
const result = await provider.CreateSubscription({
    ExternalCustomerId: customer.ExternalCustomerID,
    ExternalPriceId: plan.ExternalPriceID,
    TrialPeriodDays: plan.TrialDays,
    Metadata: { memberSubscriptionId: memberSub.ID }
});

// ❌ WRONG — Never call via Actions for code-to-code
const result = await executeAction('Create Subscription', { ... });
```

---

## Database Schema (`bizapps_subscriptions`)

### Entity Relationship Diagram

```
SubscriptionPlan
    │
    ├── PlanTier (usage-based pricing tiers)
    │
    ├── PlanEntitlement (features included in plan)
    │       │
    │       └── EntitlementDefinition (reusable feature definitions)
    │
    └── MemberSubscription (Person + Plan + Payments.Subscription)
            │
            ├── MemberSubscriptionHistory (plan change audit trail)
            │
            └── links to ── Payments.Subscription (thin provider record)
                             Payments.PaymentCustomer
                             Common.Person / Common.Organization
```

### Entities

#### SubscriptionPlan
The catalog of available plans. Each plan maps to a price/product in the payment provider.

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| Name | nvarchar(200) | 'Gold', 'Silver', 'Enterprise' |
| Description | nvarchar(max) | |
| Slug | nvarchar(100) | URL-friendly identifier, unique |
| BillingInterval | nvarchar(20) | 'month' \| 'year' \| 'week' \| 'one_time' |
| BillingIntervalCount | int | Default 1. Use 3 for quarterly (3 months). |
| BasePrice | decimal(18,4) | Base price per interval |
| Currency | nvarchar(3) | ISO 4217 |
| TrialDays | int | 0 = no trial |
| IsActive | bit | Can new subscribers choose this plan? |
| IsPublic | bit | Visible on pricing page vs. internal/negotiated |
| SortOrder | int | Display ordering |
| MaxSeats | int | Nullable = unlimited. For per-seat plans. |
| ExternalPriceID | nvarchar(200) | Provider's price ID (e.g., `price_xxx`). Nullable if plan is provider-agnostic. |
| ExternalProductID | nvarchar(200) | Provider's product ID |
| PaymentProviderConfigID | uniqueidentifier | FK → Payments.PaymentProviderConfig (which provider/merchant) |
| Metadata | nvarchar(max) | JSON — flexible key/value store |

#### PlanTier
For usage-based or tiered pricing. Optional — many plans are flat-rate.

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| SubscriptionPlanID | uniqueidentifier | FK → SubscriptionPlan |
| TierName | nvarchar(100) | 'First 1000 API calls', 'Next 10,000', etc. |
| UpToQuantity | int | Upper bound of this tier (null = unlimited) |
| UnitAmount | decimal(18,4) | Price per unit in this tier |
| FlatAmount | decimal(18,4) | Flat fee for this tier (alternative to per-unit) |
| SortOrder | int | |

#### EntitlementDefinition
Reusable feature/capability definitions. Decoupled from plans so the same entitlement can appear in multiple plans.

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| Name | nvarchar(200) | 'API Access', 'Premium Support', 'Max Storage GB' |
| Slug | nvarchar(100) | Code-friendly identifier, unique |
| Description | nvarchar(max) | |
| ValueType | nvarchar(20) | 'boolean' \| 'numeric' \| 'text' |
| DefaultValue | nvarchar(200) | Default when not granted by a plan |

#### PlanEntitlement
Links plans to entitlements with plan-specific values.

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| SubscriptionPlanID | uniqueidentifier | FK → SubscriptionPlan |
| EntitlementDefinitionID | uniqueidentifier | FK → EntitlementDefinition |
| Value | nvarchar(200) | Plan-specific value: 'true', '100', '50GB' |

UNIQUE constraint on (SubscriptionPlanID, EntitlementDefinitionID).

#### MemberSubscription
The core record: links a person/organization to a plan and its underlying payment subscription. This is where business state lives.

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| PersonID | uniqueidentifier | FK → Common.Person (nullable) |
| OrganizationID | uniqueidentifier | FK → Common.Organization (nullable) |
| SubscriptionPlanID | uniqueidentifier | FK → SubscriptionPlan |
| PaymentSubscriptionID | uniqueidentifier | FK → Payments.Subscription (nullable for free plans) |
| PaymentCustomerID | uniqueidentifier | FK → Payments.PaymentCustomer (nullable for free plans) |
| Status | nvarchar(50) | 'active' \| 'trialing' \| 'past_due' \| 'canceled' \| 'expired' \| 'paused' \| 'pending' |
| Seats | int | Current seat count (for per-seat plans) |
| CurrentPeriodStart | datetimeoffset | Synced from payment subscription |
| CurrentPeriodEnd | datetimeoffset | |
| TrialEndsAt | datetimeoffset | |
| CancelAtPeriodEnd | bit | |
| CanceledAt | datetimeoffset | |
| StartedAt | datetimeoffset | When this subscription first became active |
| Metadata | nvarchar(max) | JSON |

CHECK: exactly one of PersonID or OrganizationID must be non-null.

#### MemberSubscriptionHistory
Immutable audit trail of every plan change, status transition, or seat adjustment.

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| MemberSubscriptionID | uniqueidentifier | FK → MemberSubscription |
| ChangeType | nvarchar(50) | 'created' \| 'upgraded' \| 'downgraded' \| 'canceled' \| 'reactivated' \| 'seats_changed' \| 'status_changed' \| 'trial_started' \| 'trial_ended' |
| PreviousPlanID | uniqueidentifier | FK → SubscriptionPlan (nullable) |
| NewPlanID | uniqueidentifier | FK → SubscriptionPlan (nullable) |
| PreviousStatus | nvarchar(50) | |
| NewStatus | nvarchar(50) | |
| PreviousSeats | int | |
| NewSeats | int | |
| ProratedAmount | decimal(18,4) | Credit/charge for mid-cycle changes |
| Notes | nvarchar(max) | |
| PerformedByUserID | uniqueidentifier | FK → __mj.User (nullable — null = system/webhook) |

---

## SubscriptionEngine

### Core Operations

```typescript
export class SubscriptionEngine extends BaseSingleton<SubscriptionEngine> {

    // ── Plan Management ──
    async GetActivePlans(contextUser: UserInfo): Promise<SubscriptionPlanEntity[]>;
    async GetPlanBySlug(slug: string, contextUser: UserInfo): Promise<SubscriptionPlanEntity | null>;

    // ── Entitlement Checking (Hot Path — Cached) ──
    async CheckEntitlement(
        params: CheckEntitlementParams
    ): Promise<EntitlementResult>;
    // Returns: { Granted: boolean, Value: string, Source: 'plan' | 'override' | 'default' }

    async GetEffectiveEntitlements(
        memberSubscriptionId: string,
        contextUser: UserInfo
    ): Promise<EffectiveEntitlement[]>;

    // ── Subscription Lifecycle ──
    async CreateSubscription(
        params: CreateMemberSubscriptionParams,
        contextUser: UserInfo
    ): Promise<MemberSubscriptionResult>;
    // 1. Creates MemberSubscription record
    // 2. Calls PaymentEngine.GetProvider().CreateSubscription()
    // 3. Links PaymentSubscriptionID
    // 4. Logs to MemberSubscriptionHistory

    async ChangePlan(
        memberSubscriptionId: string,
        newPlanId: string,
        contextUser: UserInfo
    ): Promise<MemberSubscriptionResult>;
    // 1. Calculates proration
    // 2. Calls provider.UpdateSubscription() with new price
    // 3. Updates MemberSubscription
    // 4. Logs upgrade/downgrade to history

    async CancelSubscription(
        memberSubscriptionId: string,
        cancelAtPeriodEnd: boolean,
        contextUser: UserInfo
    ): Promise<MemberSubscriptionResult>;

    async ReactivateSubscription(
        memberSubscriptionId: string,
        contextUser: UserInfo
    ): Promise<MemberSubscriptionResult>;

    async UpdateSeats(
        memberSubscriptionId: string,
        newSeatCount: number,
        contextUser: UserInfo
    ): Promise<MemberSubscriptionResult>;

    // ── Webhook Event Handling ──
    // Called by Payments webhook handler when subscription events arrive
    async HandlePaymentSubscriptionEvent(
        paymentSubscriptionId: string,
        event: ParsedWebhookEvent,
        contextUser: UserInfo
    ): Promise<void>;
    // Syncs status, period dates, trial dates from payment layer
    // Logs transitions to MemberSubscriptionHistory
}
```

### Entitlement Caching Strategy

Entitlement checks are the hot path — called on nearly every request in feature-gated apps. Must be fast.

```
Request: "Does user X have 'api_access'?"
    │
    ├── Check in-memory cache (keyed by MemberSubscriptionID + EntitlementSlug)
    │     Hit? → Return cached result (< 1ms)
    │
    ├── Cache miss → Load from DB:
    │     MemberSubscription → SubscriptionPlan → PlanEntitlement → EntitlementDefinition
    │     Cache result with TTL (5 min default, configurable)
    │
    └── Cache invalidation:
          Triggered by MemberSubscription status change
          Triggered by plan change (ChangePlan)
          Triggered by webhook status updates
```

Uses MJ's server-side caching infrastructure (`RunView` with auto-cache for small lookup tables like EntitlementDefinition and PlanEntitlement).

---

## Webhook Integration with Payments

BizApps-Subscriptions doesn't handle webhooks directly. Instead, it registers a **listener** with the Payments webhook handler:

```typescript
// During engine startup
PaymentWebhookRouter.RegisterHandler('customer.subscription.*', async (event) => {
    await SubscriptionEngine.Instance.HandlePaymentSubscriptionEvent(
        event.ExternalSubscriptionId,
        event,
        systemUser
    );
});

PaymentWebhookRouter.RegisterHandler('invoice.paid', async (event) => {
    // Update MemberSubscription period dates if linked to a subscription invoice
    await SubscriptionEngine.Instance.HandleInvoicePaid(event, systemUser);
});

PaymentWebhookRouter.RegisterHandler('invoice.payment_failed', async (event) => {
    // Transition MemberSubscription to 'past_due'
    await SubscriptionEngine.Instance.HandlePaymentFailed(event, systemUser);
});
```

This keeps the webhook HTTP endpoint in Payments (single entry point) while allowing Subscriptions to react to relevant events.

---

## Actions (Exposed to Agents/Workflows)

| Action | Description |
|--------|-------------|
| Get Subscription Plans | List all active plans (optionally filtered by public/private) |
| Check Entitlement | Check if a person/org has a specific entitlement |
| Get Member Subscription | Get current subscription status for a person/org |
| Create Member Subscription | Subscribe a person/org to a plan |
| Change Subscription Plan | Upgrade or downgrade |
| Cancel Member Subscription | Cancel (immediately or at period end) |
| Reactivate Subscription | Undo cancellation before period ends |
| Update Subscription Seats | Adjust seat count for per-seat plans |
| Get Subscription History | Audit trail of all changes |

---

## Common Scenarios

### New Subscription (Happy Path)

```
1. User selects "Gold Monthly" plan on pricing page
2. Client calls CreateMemberSubscription action
3. SubscriptionEngine:
   a. Validates plan exists and is active
   b. Finds or creates PaymentCustomer (via PaymentEngine)
   c. Calls PaymentEngine.GetProvider('Stripe').CreateSubscription({
        ExternalCustomerId: 'cus_xxx',
        ExternalPriceId: plan.ExternalPriceID,  // 'price_xxx'
        TrialPeriodDays: plan.TrialDays,
        Metadata: { memberSubscriptionId: newRecord.ID }
      })
   d. Creates MemberSubscription (status = 'trialing' or 'active')
   e. Links PaymentSubscriptionID
   f. Logs 'created' to MemberSubscriptionHistory
4. Stripe webhook: customer.subscription.created → confirms status
5. After trial: Stripe webhook: invoice.paid → confirms first real payment
6. Stripe webhook: customer.subscription.updated → status = 'active'
   → SubscriptionEngine syncs period dates + status
```

### Plan Upgrade (Mid-Cycle)

```
1. User clicks "Upgrade to Enterprise"
2. SubscriptionEngine.ChangePlan():
   a. Loads current MemberSubscription + old plan + new plan
   b. Calls provider.UpdateSubscription({
        ExternalSubscriptionId: 'sub_xxx',
        NewExternalPriceId: newPlan.ExternalPriceID,
        ProrationBehavior: 'create_prorations'  // Stripe handles proration math
      })
   c. Updates MemberSubscription.SubscriptionPlanID
   d. Logs 'upgraded' with PreviousPlanID + NewPlanID + ProratedAmount
   e. Invalidates entitlement cache for this member
3. Stripe generates prorated invoice automatically
4. Webhook: invoice.paid → logged in Payments layer
```

### Failed Payment → Past Due → Recovery

```
1. Stripe webhook: invoice.payment_failed
   → Payments layer: updates Invoice status
   → Subscriptions listener: sets MemberSubscription.Status = 'past_due'
   → Logs 'status_changed' to history
   → Entitlement cache NOT invalidated (grace period — still has access)

2. Stripe retries payment (automatic retry schedule)

3a. Retry succeeds:
    Webhook: invoice.paid → MemberSubscription.Status = 'active'

3b. All retries exhausted:
    Webhook: customer.subscription.updated (status = 'unpaid' or 'canceled')
    → MemberSubscription.Status = 'expired'
    → Entitlement cache invalidated → features gated
    → Logs 'status_changed'
```

---

## Implementation Phases

### Phase 1: Core Schema + Engine
- Database migration (all entities above)
- SubscriptionEngine with plan management + lifecycle operations
- Entitlement checking with caching
- Webhook listener registration with Payments
- MemberSubscriptionHistory audit logging
- Unit tests (engine logic, entitlement checks)

### Phase 2: Actions + Agent Integration
- All actions listed above
- Agent-friendly parameter descriptions
- Integration with MJ's workflow system

### Phase 3: Angular UI
- Plan catalog/pricing page component
- Subscription management dashboard (current plan, usage, invoices)
- Plan comparison component
- Upgrade/downgrade flow with confirmation
- Seat management UI for per-seat plans
- Entitlement status display

### Phase 4: Advanced Features
- Coupon/discount code support (maps to provider coupon APIs)
- Usage-based billing metering (report usage → provider calculates charges)
- Multi-currency plan variants
- Plan migration tools (bulk move subscribers between plans)
- Revenue analytics dashboard

---

## mj-app.json (Sketch)

```json
{
  "$schema": "https://schema.memberjunction.org/mj-app/v1.json",
  "manifestVersion": 1,
  "name": "bizapps-subscriptions",
  "displayName": "BizApps Subscriptions",
  "description": "Business-level subscription management, plan catalogs, entitlements, and lifecycle operations for MemberJunction",
  "version": "1.0.0",
  "license": "MIT",
  "icon": "fa-solid fa-repeat",
  "publisher": {
    "name": "MemberJunction"
  },
  "repository": "https://github.com/MemberJunction/mj-bizapps-subscriptions",
  "mjVersionRange": ">=5.15.0",
  "schema": {
    "name": "bizapps_subscriptions",
    "createIfNotExists": true
  },
  "dependencies": {
    "bizapps-payments": ">=1.0.0",
    "bizapps-common": ">=1.0.0"
  },
  "packages": {
    "server": [
      {
        "name": "@bizapps/subscriptions-server-bootstrap",
        "role": "bootstrap",
        "startupExport": "LoadSubscriptionsServer"
      },
      {
        "name": "@bizapps/subscriptions-engine",
        "role": "engine"
      },
      {
        "name": "@bizapps/subscriptions-actions",
        "role": "actions"
      }
    ],
    "client": [
      {
        "name": "@bizapps/subscriptions-ng-bootstrap",
        "role": "bootstrap",
        "startupExport": "LoadSubscriptionsClient"
      },
      {
        "name": "@bizapps/subscriptions-ng",
        "role": "module"
      }
    ],
    "shared": [
      {
        "name": "@bizapps/subscriptions-types",
        "role": "library"
      }
    ]
  }
}
```

---

## Relationship Summary

```
BizApps-Common          BizApps-Payments           BizApps-Subscriptions
─────────────           ────────────────           ──────────────────────
Person                  PaymentProvider             SubscriptionPlan
Organization            PaymentProviderConfig       PlanTier
Address                 PaymentCustomer ←──────────→ MemberSubscription
                        PaymentMethod               PlanEntitlement
                        PaymentIntent               EntitlementDefinition
                        Invoice                     MemberSubscriptionHistory
                        Refund
                        Subscription ←─────────────→ MemberSubscription
                        PaymentWebhookEvent

        ↑                       ↑                          ↑
  "Who is this person?"   "Charge their card"    "What plan are they on?"
```

Each layer has a clear, non-overlapping responsibility. Payments is provider-aware; Subscriptions is provider-agnostic. Common provides the identity backbone.
