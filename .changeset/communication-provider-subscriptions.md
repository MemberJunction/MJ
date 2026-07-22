---
"@memberjunction/communication-types": minor
"@memberjunction/communication-ms-graph": minor
---

Add a provider-agnostic push-notification **subscription** abstraction to the communication framework, plus the first concrete implementation in the MS Graph provider — so consumers that ingest inbound messages can subscribe to "new message" push instead of polling `GetMessages` on a timer.

**base-types (`@memberjunction/communication-types`):**

- New optional, backward-compatible virtual methods on `BaseCommunicationProvider` — `CreateSubscription`, `RenewSubscription`, `DeleteSubscription`, `ParseNotification`, and `getSubscriptionCapabilities` — all with not-supported defaults. Every existing provider (sendgrid, gmail, twilio, expo-push, and third-party subclasses) compiles and behaves identically with zero changes.
- Four new `ProviderOperation` members and the supporting types (`CreateSubscriptionParams`, `SubscriptionResult`, `RenewSubscriptionParams`, `DeleteSubscriptionParams`, `SubscriptionCapabilities`, `WebhookNotificationInput`, `NormalizedNotification`, `ParseNotificationResult`, `SubscriptionChangeType`).
- Providers stay **stateless** (the consumer persists subscription IDs/expirations/secrets and schedules renewals) and notifications are treated as **hints** — the consumer re-fetches content through the existing authenticated pull methods, so forged notifications are harmless. Capability discovery via the existing `getSupportedOperations()`/`supportsOperation()` mechanism, with a documented invariant that `getSubscriptionCapabilities()` being defined implies all four ops are advertised.

**MS Graph (`@memberjunction/communication-ms-graph`):**

- Full implementation of all five methods over the provider's existing authenticated Graph client — no new dependencies. `CreateSubscription`/`RenewSubscription`/`DeleteSubscription` do subscription CRUD against the Graph service root (`AZURE_GRAPH_ENDPOINT` honored for sovereign clouds); `ParseNotification` is pure (no network) and safe on hostile/garbage input (never throws). Well-known mail folders take a zero-extra-call hot path; a custom display-name folder resolves to an ID; `DeleteSubscription` treats a 404 as success (idempotent); `RenewSubscription` surfaces a debuggable message on the credential-mismatch 404.
