# BizApps-Payments — Open App Plan

## Overview

**BizApps-Payments** is an MJ Open App providing a provider-abstracted payment processing layer. It follows MJ's established engine/provider pattern (like Communication) to support multiple payment processors through a single, consistent API.

**Repository**: Standalone Open App repo (e.g., `MemberJunction/mj-bizapps-payments`)
**Schema**: `bizapps_payments`
**Depends on**: MJ Core (≥5.15.0), BizApps-Common (for Person/Organization linkage)

---

## Target Providers

| Provider | Priority | Strengths | Subscription API? |
|----------|----------|-----------|-------------------|
| **Stripe** | P0 — Ship first | Dominant for SaaS/platforms, best API | Yes, full-featured |
| **PayPal / Braintree** | P1 | Massive consumer reach, Braintree = dev API | Yes |
| **Square** | P2 | Retail/POS + growing online, events/conferences | Yes |
| **Authorize.net** | P2 | Legacy workhorse, many existing merchant accounts | ARB (Automated Recurring Billing) |
| **Adyen** | P3 | Enterprise-grade, global multi-currency | Yes |

Shopify Payments is Stripe under the hood — not a separate provider.

---

## Architecture

### Design Principles

1. **Provider-abstracted** — All payment operations go through `PaymentEngine.GetProvider(name)`, never direct SDK calls from consuming code
2. **Thin entities, rich providers** — DB entities store references and audit trails; business logic lives in provider implementations
3. **Subscription primitives included** — Every major provider has recurring billing baked in; excluding it from the contract would force awkward re-extension later
4. **Webhook-first** — Payment state changes come from provider webhooks, not polling. The DB is the system of record once a webhook is processed.
5. **BizApps-Common linkage** — PaymentCustomer links to Common's Person/Organization, not to MJ core User (a person paying may not be a system user)

### Three-Layer Package Structure

Mirrors the Communication package pattern:

```
mj-bizapps-payments/
├── mj-app.json
├── migrations/
│   └── V202603230000__v1.0.x__Initial_Schema.sql
├── metadata/
│   ├── .mj-sync.json
│   ├── entities/
│   ├── actions/
│   └── applications/
└── packages/
    ├── base-types/              # Abstract contracts + type definitions
    │   └── src/
    │       ├── BasePaymentProvider.ts
    │       ├── PaymentEngineBase.ts
    │       ├── CredentialUtils.ts
    │       ├── types.ts
    │       └── index.ts
    ├── engine/                  # Concrete engine + orchestration
    │   └── src/
    │       ├── PaymentEngine.ts
    │       └── index.ts
    ├── providers/
    │   ├── stripe/              # @RegisterClass(BasePaymentProvider, 'Stripe')
    │   ├── paypal/              # @RegisterClass(BasePaymentProvider, 'PayPal')
    │   ├── square/              # @RegisterClass(BasePaymentProvider, 'Square')
    │   └── authorizenet/        # @RegisterClass(BasePaymentProvider, 'AuthorizeNet')
    ├── server-bootstrap/        # Tree-shaking prevention, startup registration
    ├── ng-bootstrap/            # Angular bootstrap
    ├── webhook-handler/         # Express middleware for inbound webhooks
    └── types/                   # Shared TypeScript types (server + client)
```

---

## Database Schema (`bizapps_payments`)

### Entity Relationship Diagram

```
PaymentProvider ─────────────────────────────────────────────┐
  │                                                          │
PaymentProviderConfig (per-org API keys, mode, webhook secret)│
  │                                                          │
PaymentCustomer ──── links to ──── Common.Person/Organization│
  │                                                          │
  ├── PaymentMethod (tokenized card/bank refs)               │
  │                                                          │
  ├── PaymentIntent ──── PaymentIntentStatusLog              │
  │       │                                                  │
  │       └── linked to ── Invoice ── InvoiceLineItem        │
  │                                                          │
  ├── Refund                                                 │
  │                                                          │
  ├── Subscription ──── SubscriptionStatusLog                │
  │                                                          │
  └── PaymentWebhookEvent (raw webhook audit log)            │
      └── references ───────────────────────────────────────-┘
```

### Entities

#### PaymentProvider
System-level registry of available providers. Metadata-driven, loaded by the engine at startup.

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| Name | nvarchar(100) | 'Stripe', 'PayPal', etc. |
| Description | nvarchar(500) | |
| DriverClass | nvarchar(200) | ClassFactory registration name |
| IsEnabled | bit | |
| SupportsSubscriptions | bit | Capability flag |
| SupportsRefunds | bit | |
| SupportsWebhooks | bit | |
| SupportedCurrencies | nvarchar(max) | Comma-delimited ISO 4217 codes, or 'All' |

#### PaymentProviderConfig
Per-organization provider configuration. Supports multiple orgs using the same provider with different merchant accounts.

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| PaymentProviderID | uniqueidentifier | FK → PaymentProvider |
| OrganizationID | uniqueidentifier | FK → Common.Organization (nullable for single-org) |
| Mode | nvarchar(20) | 'live' \| 'test' |
| APIKeyEncrypted | nvarchar(max) | Encrypted at rest |
| SecretKeyEncrypted | nvarchar(max) | Encrypted at rest |
| WebhookSecretEncrypted | nvarchar(max) | For signature verification |
| PublishableKey | nvarchar(500) | Client-side key (not secret) |
| MerchantAccountID | nvarchar(200) | Provider-specific merchant ID |
| DefaultCurrency | nvarchar(3) | ISO 4217, default 'USD' |

#### PaymentCustomer
Links an MJ person/organization to a provider's customer object. One person can have multiple provider customers (e.g., Stripe customer + PayPal customer).

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| PaymentProviderConfigID | uniqueidentifier | FK → PaymentProviderConfig |
| PersonID | uniqueidentifier | FK → Common.Person (nullable) |
| OrganizationID | uniqueidentifier | FK → Common.Organization (nullable) |
| ExternalCustomerID | nvarchar(200) | Provider's customer ID (e.g., `cus_xxx`) |
| Email | nvarchar(255) | Synced from provider |
| Name | nvarchar(255) | |
| Status | nvarchar(50) | 'active' \| 'deleted' |

CHECK: exactly one of PersonID or OrganizationID must be non-null.

#### PaymentMethod
Tokenized payment instruments. Never stores raw card numbers — only provider token references.

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| PaymentCustomerID | uniqueidentifier | FK → PaymentCustomer |
| ExternalMethodID | nvarchar(200) | Provider's method ID (e.g., `pm_xxx`) |
| Type | nvarchar(50) | 'card' \| 'bank_account' \| 'paypal' \| 'apple_pay' \| 'google_pay' |
| Last4 | nvarchar(4) | Last 4 digits for display |
| Brand | nvarchar(50) | 'visa', 'mastercard', 'amex', etc. |
| ExpirationMonth | int | |
| ExpirationYear | int | |
| IsDefault | bit | |
| Status | nvarchar(50) | 'active' \| 'expired' \| 'revoked' |

#### PaymentIntent
Represents an intent to collect payment. Maps directly to Stripe PaymentIntent, PayPal Order, Square Payment, etc.

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| PaymentProviderConfigID | uniqueidentifier | FK → PaymentProviderConfig |
| PaymentCustomerID | uniqueidentifier | FK → PaymentCustomer (nullable for guest checkout) |
| PaymentMethodID | uniqueidentifier | FK → PaymentMethod (nullable until method selected) |
| ExternalIntentID | nvarchar(200) | Provider's ID (e.g., `pi_xxx`) |
| Amount | decimal(18,4) | |
| Currency | nvarchar(3) | ISO 4217 |
| Status | nvarchar(50) | 'created' \| 'processing' \| 'succeeded' \| 'failed' \| 'canceled' \| 'requires_action' |
| Description | nvarchar(500) | |
| StatementDescriptor | nvarchar(100) | What appears on the bank statement |
| Metadata | nvarchar(max) | JSON — provider-agnostic key/value pairs |
| FailureCode | nvarchar(100) | |
| FailureMessage | nvarchar(500) | |

#### PaymentIntentStatusLog
Immutable audit trail of every status transition. Populated primarily from webhooks.

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| PaymentIntentID | uniqueidentifier | FK → PaymentIntent |
| PreviousStatus | nvarchar(50) | |
| NewStatus | nvarchar(50) | |
| ProviderEventID | nvarchar(200) | Links to the webhook event that triggered this |
| Details | nvarchar(max) | JSON with provider-specific details |

#### Invoice
Provider-generated invoices. Especially important for subscription billing.

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| PaymentProviderConfigID | uniqueidentifier | FK |
| PaymentCustomerID | uniqueidentifier | FK |
| SubscriptionID | uniqueidentifier | FK → Subscription (nullable) |
| ExternalInvoiceID | nvarchar(200) | |
| InvoiceNumber | nvarchar(100) | Human-readable number |
| Status | nvarchar(50) | 'draft' \| 'open' \| 'paid' \| 'void' \| 'uncollectible' |
| Subtotal | decimal(18,4) | |
| Tax | decimal(18,4) | |
| Total | decimal(18,4) | |
| AmountPaid | decimal(18,4) | |
| AmountDue | decimal(18,4) | |
| Currency | nvarchar(3) | |
| DueDate | datetimeoffset | |
| PaidAt | datetimeoffset | |
| HostedInvoiceURL | nvarchar(1000) | Provider's hosted invoice page |
| InvoicePDFURL | nvarchar(1000) | |

#### InvoiceLineItem

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| InvoiceID | uniqueidentifier | FK → Invoice |
| Description | nvarchar(500) | |
| Quantity | decimal(18,4) | |
| UnitAmount | decimal(18,4) | |
| Amount | decimal(18,4) | quantity × unit amount |
| Currency | nvarchar(3) | |

#### Refund

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| PaymentIntentID | uniqueidentifier | FK → PaymentIntent |
| ExternalRefundID | nvarchar(200) | |
| Amount | decimal(18,4) | Partial refund amount |
| Currency | nvarchar(3) | |
| Status | nvarchar(50) | 'pending' \| 'succeeded' \| 'failed' \| 'canceled' |
| Reason | nvarchar(50) | 'duplicate' \| 'fraudulent' \| 'requested_by_customer' \| 'other' |
| Notes | nvarchar(max) | |

#### Subscription
**Thin** provider-level record. Tracks what the provider tells us via webhooks. Business-level plan management belongs in BizApps-Subscriptions.

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| PaymentProviderConfigID | uniqueidentifier | FK |
| PaymentCustomerID | uniqueidentifier | FK |
| PaymentMethodID | uniqueidentifier | FK (nullable) |
| ExternalSubscriptionID | nvarchar(200) | |
| Status | nvarchar(50) | 'active' \| 'past_due' \| 'canceled' \| 'unpaid' \| 'trialing' \| 'paused' \| 'incomplete' |
| ExternalPriceID | nvarchar(200) | Provider's price/plan ID |
| Quantity | int | |
| Currency | nvarchar(3) | |
| CurrentPeriodStart | datetimeoffset | |
| CurrentPeriodEnd | datetimeoffset | |
| CancelAtPeriodEnd | bit | |
| CanceledAt | datetimeoffset | |
| TrialStart | datetimeoffset | |
| TrialEnd | datetimeoffset | |
| Metadata | nvarchar(max) | JSON |

#### SubscriptionStatusLog

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| SubscriptionID | uniqueidentifier | FK → Subscription |
| PreviousStatus | nvarchar(50) | |
| NewStatus | nvarchar(50) | |
| ProviderEventID | nvarchar(200) | |
| Details | nvarchar(max) | JSON |

#### PaymentWebhookEvent
Raw audit log of every inbound webhook. Enables replay and debugging.

| Column | Type | Notes |
|--------|------|-------|
| ID | uniqueidentifier | PK |
| PaymentProviderConfigID | uniqueidentifier | FK |
| ExternalEventID | nvarchar(200) | Provider's event ID (idempotency key) |
| EventType | nvarchar(200) | e.g., 'payment_intent.succeeded', 'invoice.paid' |
| RawPayload | nvarchar(max) | Full JSON body |
| ProcessingStatus | nvarchar(50) | 'received' \| 'processed' \| 'failed' \| 'skipped' |
| ProcessingError | nvarchar(max) | |
| ReceivedAt | datetimeoffset | |
| ProcessedAt | datetimeoffset | |

---

## Provider Contract

### BasePaymentProvider (Abstract)

```typescript
export abstract class BasePaymentProvider {
    // ── Identity ──
    abstract get ProviderName(): string;

    // ── Capability Discovery ──
    abstract GetSupportedOperations(): PaymentOperation[];
    SupportsOperation(op: PaymentOperation): boolean {
        return this.GetSupportedOperations().includes(op);
    }

    // ── Customer Management ──
    abstract CreateCustomer(params: CreateCustomerParams): Promise<CustomerResult>;
    abstract UpdateCustomer(params: UpdateCustomerParams): Promise<CustomerResult>;
    abstract DeleteCustomer(externalId: string): Promise<BasePaymentResult>;

    // ── Payment Methods ──
    abstract AttachPaymentMethod(params: AttachMethodParams): Promise<PaymentMethodResult>;
    abstract DetachPaymentMethod(externalMethodId: string): Promise<BasePaymentResult>;
    abstract ListPaymentMethods(externalCustomerId: string): Promise<PaymentMethodResult[]>;

    // ── One-Time Payments ──
    abstract CreatePaymentIntent(params: CreateIntentParams): Promise<PaymentIntentResult>;
    abstract ConfirmPaymentIntent(externalIntentId: string): Promise<PaymentIntentResult>;
    abstract CancelPaymentIntent(externalIntentId: string): Promise<PaymentIntentResult>;

    // ── Refunds ──
    abstract CreateRefund(params: CreateRefundParams): Promise<RefundResult>;

    // ── Subscriptions (Provider Primitives) ──
    abstract CreateSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult>;
    abstract UpdateSubscription(params: UpdateSubscriptionParams): Promise<SubscriptionResult>;
    abstract CancelSubscription(externalId: string, cancelAtPeriodEnd?: boolean): Promise<SubscriptionResult>;

    // Optional — not all providers support pause
    async PauseSubscription(externalId: string): Promise<SubscriptionResult> {
        return { Success: false, ErrorMessage: `${this.ProviderName} does not support pausing subscriptions` };
    }
    async ResumeSubscription(externalId: string): Promise<SubscriptionResult> {
        return { Success: false, ErrorMessage: `${this.ProviderName} does not support resuming subscriptions` };
    }

    // ── Invoices ──
    abstract GetInvoice(externalInvoiceId: string): Promise<InvoiceResult>;
    abstract ListInvoices(externalCustomerId: string, params?: ListInvoicesParams): Promise<InvoiceResult[]>;

    // ── Webhooks ──
    abstract VerifyWebhookSignature(payload: string | Buffer, signature: string, secret: string): boolean;
    abstract ParseWebhookEvent(payload: string | Buffer): ParsedWebhookEvent;
}
```

### PaymentOperation Type

```typescript
type PaymentOperation =
    | 'CreateCustomer' | 'UpdateCustomer' | 'DeleteCustomer'
    | 'AttachPaymentMethod' | 'DetachPaymentMethod' | 'ListPaymentMethods'
    | 'CreatePaymentIntent' | 'ConfirmPaymentIntent' | 'CancelPaymentIntent'
    | 'CreateRefund'
    | 'CreateSubscription' | 'UpdateSubscription' | 'CancelSubscription'
    | 'PauseSubscription' | 'ResumeSubscription'
    | 'GetInvoice' | 'ListInvoices'
    | 'VerifyWebhookSignature' | 'ParseWebhookEvent';
```

### PaymentEngine

```typescript
export class PaymentEngine extends PaymentEngineBase {
    // Singleton via BaseSingleton
    public static get Instance(): PaymentEngine {
        return PaymentEngine.getInstance<PaymentEngine>();
    }

    // Loads PaymentProvider + PaymentProviderConfig entities
    async Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void>;

    // ClassFactory lookup
    GetProvider(providerName: string): BasePaymentProvider;

    // Convenience: resolve provider from a config record
    GetProviderForConfig(configId: string): BasePaymentProvider;
}
```

---

## Webhook Architecture

### Inbound Webhook Flow

```
Provider (Stripe/PayPal/etc.)
    │
    ▼
Express Route: POST /api/webhooks/payments/:providerName
    │
    ├── 1. Look up PaymentProviderConfig by provider name + webhook secret
    ├── 2. provider.VerifyWebhookSignature(rawBody, sig header, secret)
    ├── 3. Idempotency check: does ExternalEventID already exist in PaymentWebhookEvent?
    ├── 4. Insert PaymentWebhookEvent (status = 'received')
    ├── 5. provider.ParseWebhookEvent(rawBody) → normalized event
    ├── 6. Route to handler:
    │       payment_intent.succeeded → update PaymentIntent status + log
    │       invoice.paid            → update Invoice status
    │       customer.subscription.* → update Subscription status + log
    │       charge.refunded         → update Refund status
    ├── 7. Update PaymentWebhookEvent (status = 'processed')
    └── 8. Return 200 OK (must respond within 5s for most providers)
```

### Webhook Registration

Each provider needs a publicly accessible URL. In development, use MJAPI's `publicUrl` config (ngrok, etc.). In production, the webhook URL is configured in the provider's dashboard and stored in `PaymentProviderConfig`.

---

## Actions (Exposed to Agents/Workflows)

Following MJ's Actions design philosophy — thin wrappers that delegate to the engine:

| Action | Description |
|--------|-------------|
| Create Payment Customer | Link a Person/Organization to a payment provider |
| Create Payment Intent | Initiate a one-time payment |
| Process Refund | Refund a completed payment (full or partial) |
| Create Subscription | Start a recurring billing subscription |
| Cancel Subscription | Cancel (immediately or at period end) |
| Get Payment Status | Check current status of a payment intent |
| Get Customer Invoices | List invoices for a customer |
| Sync Payment Methods | Refresh stored payment methods from provider |

---

## Relationship to BizApps-Common

BizApps-Payments declares a dependency on BizApps-Common in `mj-app.json`:

```json
{
  "dependencies": {
    "bizapps-common": ">=1.0.0"
  }
}
```

Key linkages:
- `PaymentCustomer.PersonID` → `Common.Person.ID`
- `PaymentCustomer.OrganizationID` → `Common.Organization.ID`
- `PaymentProviderConfig.OrganizationID` → `Common.Organization.ID`

This means a **Person** (from Common's CRM layer) can have payment methods, subscriptions, and invoices without being an MJ system User.

---

## Implementation Phases

### Phase 1: Foundation + Stripe
- Database schema (all entities above)
- `base-types` package with full provider contract
- `engine` package with PaymentEngine singleton
- `stripe` provider — full implementation of all operations
- Webhook handler middleware
- Metadata (entity registrations, actions)
- Unit tests for engine + Stripe provider (mocked)

### Phase 2: PayPal / Braintree
- `paypal` provider implementing the same contract
- PayPal-specific webhook signature verification
- Integration tests

### Phase 3: Square + Authorize.net
- `square` provider
- `authorizenet` provider (note: ARB for subscriptions has quirks)

### Phase 4: Angular UI Components
- Payment method management component
- Invoice list/detail views
- Subscription status display
- Dashboard for payment analytics

---

## Security Considerations

1. **No raw card data** — All card handling happens client-side via provider SDKs (Stripe Elements, PayPal buttons). Server only sees tokens.
2. **Encrypted secrets** — API keys and webhook secrets stored encrypted in `PaymentProviderConfig`
3. **Webhook signature verification** — Every inbound webhook is cryptographically verified before processing
4. **Idempotent webhook processing** — `ExternalEventID` prevents duplicate processing
5. **PCI compliance** — By design, this architecture is SAQ-A compliant (no card data touches our servers)
6. **Mode isolation** — `PaymentProviderConfig.Mode` ensures test/live environments never cross
