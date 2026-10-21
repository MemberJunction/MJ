# Realtime session events and identity verification

Server side of two related capabilities of a realtime agent session:

1. **Session events** — a typed, authorized channel from the server to the session's own client
   (`RealtimeSessionEvents` subscription). Apps publish with `RealtimeSessionEventService`.
2. **Mid-session identity verification** — a person (often an anonymous widget guest) proves they control
   an email address *without leaving the conversation*. The server emails a one-time link and a typed
   code, records the verification on the session, extends the session's limits, and publishes
   `identity.verified`.

The event contract (types, payload map, wire format) is framework-neutral and lives in
`@memberjunction/ai-core-plus` (`realtime-session-events.ts`). Everything here is server-only.

Verification **never creates an MJ user and never changes the session's principal** (decision D6): the
session stays owned by whoever started it; verification only attaches a verified identity and relaxes the
session's limits.

## Flow

```
client                     MJServer                                   inbox
  │  RequestRealtimeSessionVerification(sessionId, name, email)
  ├──────────────────────────▶ policy + limits → store HASHED pending on Session.Config
  │                            └─ email {link, code} ────────────────────▶ person
  │  (subscription open: RealtimeSessionEvents(sessionId))
  │                                       link opened (any device)  ◀──────┤
  │                            GET  /realtime/verify/:token  → confirm page (NO side effects)
  │                            POST /realtime/verify         → redeem (single use)
  │  — or, same device —
  ├─ SubmitRealtimeSessionVerificationCode(sessionId, code) ─▶ redeem (single use)
  │                            mark verified · extend deadline · audit · publish identity.verified
  ◀──────────────── event: identity.verified (only to the session's owner)
```

Event delivery has **no replay**. A client that was disconnected when the event fired recovers with
`RealtimeSessionVerificationStatus(sessionId)` (and by reading the session).

## Operations

| Operation | Kind | Auth | Notes |
|---|---|---|---|
| `RequestRealtimeSessionVerification(agentSessionId, name, email)` | mutation | session's own principal | `email` is `@NoLog`. Sends the email. |
| `SubmitRealtimeSessionVerificationCode(agentSessionId, code)` | mutation | session's own principal | `code` is `@NoLog`. Spaces/dashes ignored. |
| `RealtimeSessionVerificationStatus(agentSessionId)` | query | session's own principal | The durable backstop for a missed event. |
| `RealtimeSessionEvents(agentSessionId)` | subscription | session's own principal | See *Authorization*. |
| `GET /realtime/verify/:token` | HTTP, **public** | the token is the capability | Renders a one-button confirmation page. Never consumes the token. |
| `POST /realtime/verify` (form field `token`) | HTTP, **public** | the token is the capability | Redeems. Per-IP rate limited. |

Every verification result carries a machine-readable `ErrorCode` (`invalid_email`, `consumer_domain`,
`domain_blocked`, `rate_limited`, `send_limit_reached`, `invalid_code`, `attempts_exhausted`,
`code_expired`, `session_not_found`, `session_closed`, `verification_unavailable`, …).

The routes are only mounted, and the operations only act, when `realtime.identityVerification.enabled` is true
**and** a `communicationProvider` is configured **and** an `hmacSecret` of at least 16 characters is set. Without the
secret the feature reports itself unavailable (fail closed) and logs why at startup.

The browser-side transport for the three operations and the subscription is `GraphQLRealtimeSessionClient` in
`@memberjunction/graphql-dataprovider`.

## Authorization

The principal comes from the **server-authenticated** context (`userPayload.userRecord`), never from an
argument. An id argument only selects *which of the caller's own sessions*.

A caller may use a session when `AIAgentSession.UserID` equals their user (`UUIDsEqual`). Widget guests all
share one Anonymous user, so for an anonymous/magic-link principal that is **not enough**: the guest's
signed per-session scope (`MagicLinkScope.ResourceID`) must equal the session's conversation `ExternalID`.
An anonymous principal with no scope is refused outright.

- Refusals are uniform ("session not found") whether the session is missing or simply not yours, so ids
  cannot be probed.
- The subscription is authorized **twice**: when it opens, and again per event (each event carries an
  owner/scope snapshot of its session), so a replicated event from another instance is judged like a local one.
- State changes (`identityVerification`, `maxSessionDeadlineIso` on `AIAgentSession.Config`) are written by a
  **service principal** inside a trusted-write scope, and `MJAIAgentSessionEntityServer` refuses any other
  write to those keys — the session owner can update their own session row, so without that guard they
  could forge verification or move their own deadline.

## Policy knobs

Set per deployment in `mj.config.cjs` → `realtime.identityVerification.policy`, and per agent/channel in the
config cascade (`channels.config.IdentityVerification`, plus `session.unverifiedMaxSeconds` /
`session.verifiedMaxSeconds`). The cascade layer is **snapshotted onto the session at mint**, so the rules a
person is held to are fixed server-side and cannot be chosen later.

| Knob | Default | Meaning |
|---|---|---|
| `requireBusinessDomain` | `false` | Refuse consumer mailbox providers (`consumer_domain`). |
| `consumerDomains` | curated list (`DEFAULT_CONSUMER_EMAIL_DOMAINS`) | Overrides the curated list. An empty list is treated as absent. |
| `blockedDomains` | `[]` | Always refused (`domain_blocked`). Matches subdomains. |
| `linkTtlMinutes` | 30 (1–1440) | Lifetime of the link and code. |
| `maxSendsPerSession` | 3 (1–20) | Verification emails one session may trigger (persisted, exact). |
| `maxCodeAttempts` | 5 (1–10) | Wrong codes before the pending verification is voided. |
| `unverifiedMaxSeconds` | none | Absolute session cap until verified. Applies to **any** principal. |
| `verifiedMaxSeconds` | none | Cap after verification, measured from session start. Only ever *extends*. |

Server-wide limits (`realtime.identityVerification.rateLimits`, in memory, per instance; `0` disables):
`perIpSends`, `perEmailDomainSends`, `perEmailSends` over `sendWindowMs`; `perSessionCodeAttempts` over
`codeAttemptWindowMs`; `redeemPerIp` over `redeemWindowMs`.

Other settings: `communicationProvider`, `fromAddress`, `publicBaseUrl` (defaults like magic links),
`contextUserForVerification` (the service principal; falls back to the system user), and:

- `hmacSecret` (env `MJ_REALTIME_VERIFICATION_SECRET`): **required**. The server-only key the typed code is HMAC'd
  under before it is stored. Never sent to a client or written to a session. Rotating it voids pending verifications only.
- `deliveryMode`: `send` (default) delivers the email. `dry-run` builds and logs the message through the communication
  provider **without delivering it**, for rehearsal and integration environments — the integration bundle reads the
  link and code from the `MJ: Communication Logs` row. Never use it in production.

## Security properties

- **Hashed at rest, and the code hash is keyed.** The token and the code are never stored raw: a SHA-256 of the
  token (256 random bits) and an **HMAC-SHA-256 of the code under the server-only `hmacSecret`**, salted and bound to the
  session. The keying is what protects a six-digit code: the session's owner — the very person being verified — can
  read their own `Session.Config`, and an unkeyed hash of a six-digit code is reversible offline in about a million
  guesses, which would bypass the attempt cap and the inbox entirely. Verification compares digests with
  `timingSafeEqual`.
- **Single use, expiring.** Redemption clears the pending verification; an expired or used token is
  refused. A wrong code consumes an attempt; the cap voids the verification.
- **Scanner-safe link.** `GET` renders a confirmation button; only the human's `POST` consumes the token,
  so mail scanners and previewers cannot burn it.
- **Leak-free pages.** Every refusal (unknown, malformed, expired, used, voided) renders the same page with
  the same status. Responses are `no-store`, `no-referrer`, never framed, with a CSP that forbids all but
  the page's own inline style.
- **Uniform errors.** Missing and not-yours sessions are indistinguishable.
- **Bounded.** Per-IP, per-email-domain and per-address send limits; per-session code-attempt limit; a body
  size limit on the public POST; the in-memory limiters are size-bounded.
- **Audited.** A successful verification writes an `MJ: Audit Logs` row of type
  *Realtime Identity Verified* (seeded by `metadata/audit-log-types`). If that type has not been seeded the
  entry is written to the server log instead of being dropped silently.
- **No principal change.** No user is created or switched.

## Limitations to know about

- **The email body is logged by the communication engine.** `CommunicationEngine.SendSingleMessage` writes an
  `MJ: Communication Logs` row whose `MessageContent` contains the full body — here, the live link and code (the same
  is already true of magic-link emails). Keep read access to that entity restricted to administrators. A principal who
  can read it can redeem a verification for an address they do not control; `deliveryMode: 'dry-run'` makes that the
  intended way to read the email, which is why it must never be used in production.

- Rate limiters are per process. Across replicas the in-memory limits are best-effort; per-session send and
  attempt counts are persisted and exact.
- Single-use redemption is serialised per session in one process. Across replicas it is best-effort (there
  is no compare-and-swap on a JSON column without a schema change).
- The session janitor enforces `maxSessionDeadlineIso`; it closes with its normal `Janitor` reason (there
  is no dedicated close reason, which would need a schema change).
- Events have no replay (see *Flow*).

## Publishing an event from an app

```ts
import { RealtimeSessionEventService } from '@memberjunction/server/realtime-sessions';

const result = await RealtimeSessionEventService.Instance.Publish({
    AgentSessionID, Type: 'identity.verified', Payload, ContextUser, Provider,
});
if (!result.Success) { /* result.ErrorMessage — Publish never throws */ }
```

Add new event types by extending `RealtimeSessionEventPayloadMap` (declaration merging) in
`@memberjunction/ai-core-plus`; clients must ignore types they do not know.

## Where things are

| File | Role |
|---|---|
| `sessionAccess.ts`, `subscriptionAuthorization.ts` | The authorization decision and its subscription/event gates (pure, decorator-free). |
| `RealtimeSessionEventService.ts` | Publisher + cross-instance fan-out hook. |
| `verificationPolicy.ts`, `verificationCore.ts` | Policy resolution; token/code/state/hash/expiry logic (pure). |
| `verificationWorkflow.ts` | The operations, written against injected ports. |
| `SessionVerificationPortsBase.ts` | Config-free production ports (session IO, trusted writes, publish, audit). |
| `RealtimeSessionVerificationService.ts` | Binds the ports to server configuration; process singleton. |
| `RealtimeVerifyRouter.ts`, `verificationPages.ts` | The public routes and their pages. |
| `sessionConfigStamps.ts` | What session start stamps (policy snapshot, unverified cap, inherited identity). |
| `core.ts` | The configuration-free surface, published as `@memberjunction/server/realtime-sessions`. |

The GraphQL resolvers are `../resolvers/RealtimeSessionVerificationResolver.ts` and
`../resolvers/RealtimeSessionEventsResolver.ts`.
