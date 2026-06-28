# Enabling Agent Bridges & the Public Widget on an MJ Instance

Everything you must turn on — database, metadata, config, env, external infra — to run the
**telephony bridges** (Twilio/Vonage/RingCentral) and the **public web widget** on a MemberJunction
instance. Both ride the same realtime-agent spine; the steps below are ordered so each prerequisite
exists before the thing that references it.

> **TL;DR for "it returned 401 / 403 / nothing":** the widget routes only mount when
> `widget.enabled: true` is in `mj.config.cjs` (default is **false** → mint falls through to auth →
> **401**). After that, a **403** means the WidgetInstance row isn't in this DB or the host origin
> isn't allowed. See [§7 Gotchas](#7-gotchas-the-non-obvious-stuff).

---

## 1. What you're enabling

| Capability | Needs | External dependency |
|---|---|---|
| **Public web widget** (text+voice guest support) | DB migrations + metadata + `widget.enabled` config | OpenAI Realtime key (voice only) |
| **Twilio telephony** (in/outbound voice) | DB migrations + agent-identity metadata + `telephony` config + env | Twilio account, ngrok (public URL), OpenAI Realtime key |
| **Vonage / RingCentral** | same shape as Twilio, vendor config block | that vendor's account |

The widget's **text** path needs no AI vendor key beyond what the pinned agent already uses. The
**voice** path (widget or telephony) needs a realtime model key (see §5).

---

## 2. Database — migrations + CodeGen

Run the standard `mj migrate` + CodeGen. The relevant migrations (already in `migrations/v5/`):

| Migration | Creates |
|---|---|
| `V202606151800__v5.41.x__Realtime_Bridges.sql` | bridge entities (providers, agent identities, sessions) |
| `V202606270023__v5.44.x__Widget_Instances.sql` | the `WidgetInstance` table |
| `V202606271200__v5.44.x__Widget_Guest_RLS.sql` | the two RLS filters the guest role uses (text/conversations) |
| `V202606281200__v5.44.x__Widget_Guest_Session_RLS.sql` | two more RLS filters scoping the realtime **voice** session entities (AI Agent Sessions + Session Channels) to the guest |

**Order matters:** the RLS-filter migration must run **before** you push the entity-permissions
metadata, because those permission rows `@lookup` the RLS filters *by name*. Migrate + CodeGen first,
then §3.

> The RLS filters are created in SQL (not metadata) on purpose: creating a Row-Level-Security filter
> is denied to non-Owner principals, so it can't be seeded through the guest-scoped sync path.

---

## 3. Metadata — seed in dependency order

All via `mj sync push`. Push in this order so `@lookup` references resolve:

```bash
# 1. The guest role + bridge providers (referenced by everything below)
npx mj sync push --dir=metadata --include="roles"
npx mj sync push --dir=metadata --include="ai-bridge-providers"

# 2. Entity permissions for the Widget Guest role (these @lookup the RLS filters from §2)
npx mj sync push --dir=metadata --include="entity-permissions"

# 3. The widget instance(s) — the pk_ key the browser uses
npx mj sync push --dir=metadata --include="widget-instances"

# 4. Telephony only: map a phone number to an agent
npx mj sync push --dir=metadata --include="ai-bridge-agent-identities"
```

What each provides:

- **`roles`** → the `Widget Guest` restricted role. Guests run under this, NOT an unfiltered principal.
- **`entity-permissions`** → Widget Guest can Read/Update **only** Conversations + Conversation Details
  (text), plus AI Agent Sessions + AI Agent Session Channels (**voice**), each gated by an RLS filter
  that scopes rows to the guest's own `ExternalID`/session. This is the cross-guest isolation guarantee.
  The voice-session entities are scoped through the session's Conversation, which `SessionManager`
  stamps with the guest's signed scope (`MagicLinkScope.ResourceID`) at create time — so a guest can
  start a voice session but cannot read or touch any other guest's session.
- **`widget-instances`** → one row per embeddable widget. Key fields:

  | Field | Example | Meaning |
  |---|---|---|
  | `PublicKey` | `pk_test_example_support_widget` | the `data-widget-key` the host page sends |
  | `PinnedAgentID` | `@lookup …Sage` | the ONE agent a guest can reach (D5 — never unpinned) |
  | `GuestRoleID` | `@lookup …Widget Guest` | the restricted role above |
  | `AllowedOrigins` | `["http://localhost:8080"]` | host page origins allowed to mint (CORS-style gate) |
  | `Modality` | `Both` / `Text` / `Voice` | whether the mic appears |
  | `AuthStrategy` | `Anonymous` | guest-default; `magic-link` upgrade is the escalation |
  | `SessionTTLMinutes` / `RateLimitPerMinute` / `VoiceMaxSessionMinutes` | 15 / 30 / 10 | per-instance ceilings |

- **`ai-bridge-agent-identities`** → maps a `PhoneNumber` (e.g. `+18669016546`) + a `ProviderID`
  (`@lookup …Twilio`) to the agent that answers it. Inbound calls resolve the agent by the dialed number.

---

## 4. Config — `mj.config.cjs`

Top-level blocks (siblings of `magicLink`). Secrets come from `.env`, never inlined.

```js
// Public widget — master switch. Default is false → routes don't mount → mint 401s.
widget: {
  enabled: true,
  audience: 'mj-magic-link',   // MUST equal magicLink.audience or guest tokens won't validate
},

// Telephony — `enabled` gates whether /telephony/* routes + media WSS mount at boot.
telephony: {
  enabled: !!process.env.TWILIO_ACCOUNT_SID,
  twilio: process.env.TWILIO_ACCOUNT_SID ? {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,         // also the HMAC key for webhook signature verify
    streamPublicUrl: process.env.TWILIO_STREAM_PUBLIC_URL, // wss://<public-host>/telephony/twilio/media
    webhookSigningSecret: process.env.TWILIO_WEBHOOK_SIGNING_SECRET || undefined,
  } : undefined,
},
```

The widget **reuses the magic-link RS256 key + auth provider**, initialized idempotently inside
`createWidgetHandler` even when `magicLink.enabled` is `false`. So the widget stands on its own — you
do NOT need to enable magic-link unless you want the guest→verified **upgrade** path (then set
`magicLink.enabled: true`).

Vonage / RingCentral: add a `telephony.vonage` / `telephony.ringcentral` sub-block mirroring twilio.

---

## 5. Environment — `.env`

| Var | For | Notes |
|---|---|---|
| `AI_VENDOR_API_KEY__OpenAIRealtime` | **voice (widget + telephony)** | **driverClass-specific** — the realtime driver is `OpenAIRealtime`, NOT `OpenAILLM`. A key under the wrong name → "no usable Realtime model". |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio | live = billable; test creds only work with magic numbers |
| `TWILIO_STREAM_PUBLIC_URL` | Twilio media | `wss://<ngrok-host>/telephony/twilio/media` |
| `MJAPI_PUBLIC_URL` | Twilio inbound | MUST match the ngrok host — the inbound webhook signature is verified against the full public URL |
| `TWILIO_TEST_ACCOUNT_SID` / `_AUTH_TOKEN` / `_FROM` / `_TO` | the credential-gated integration test | absent → test self-skips |

---

## 6. External infra (telephony only)

1. **ngrok** (or any public tunnel) → your MJAPI port: `ngrok http 4008`. Put the `https://…` host in
   `MJAPI_PUBLIC_URL` and the `wss://…/telephony/twilio/media` in `TWILIO_STREAM_PUBLIC_URL`. **These
   cycle** every ngrok restart — re-point all three (env + the Twilio number's webhook).
2. **Twilio number** → set its Voice webhook to `https://<public-host>/telephony/twilio/voice` (POST).
3. **OpenAI Realtime** API key under the env name in §5.

The widget needs none of this — it's same-origin-to-MJAPI over normal HTTPS.

---

## 7. Verify

```bash
# Widget mint — expect 200 + a token. 401 = widget.enabled off. 403 = instance row/origin problem.
curl -s -X POST http://localhost:4008/widget/session \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:8080' \
  -d '{"widgetKey":"pk_test_example_support_widget"}' | head -c 300

# Then the browser eyeball (serve a host page on a whitelisted origin):
npx http-server packages/Web/Widget -p 8080 -c-1
open http://localhost:8080/examples/two-widgets.html
```

Beyond this enablement, verification is the package unit suites (bridge providers + the widget,
client and server), the credential-gated Twilio integration test (`TWILIO_TEST_*`, skipped in CI),
and a manual browser/audio pass against a running MJAPI.

---

## 7b. ⚠️ Demo-grade guest agent execution — HARDENING DEBT

To make a guest get a live **agent reply** (text + voice) on localhost, the Widget Guest role was
granted, beyond the conversation/session isolation above:

| Entity | Grant | Scoped? |
|---|---|---|
| `MJ: AI Agents` | Read | ✅ RLS-scoped to **widget-pinned agents only** (`Widget Guest: Widget-Pinned Agents`) — guests never see your internal roster |
| `MJ: AI Agent Runs` | Create/Read/Update | ❌ **unscoped** |
| `MJ: AI Agent Run Steps` | Create/Read/Update | ❌ **unscoped** |
| `MJ: AI Prompt Runs` | Create/Read/Update | ❌ **unscoped** |

**Why this exists:** the widget's client-side `ConversationsRuntime` resolves the pinned agent from
`AIEngineBase` (needs AI Agents read), and the server-side agent run writes its run records under the
guest principal (needs the three run-entity grants).

**Why it's debt, NOT production-ready:** the three run entities are granted **unscoped** — a guest could
read other users' agent/prompt run rows (which can contain conversation content). Acceptable on a
single-tester localhost; a **data leak on a public deployment.**

**The proper fix (do before any public launch):** move widget agent execution to a **privileged
server-side dispatch** — the guest owns only the Conversation + Details (display), and an elevated
server context resolves + runs the pinned agent and writes the reply back as a Conversation Detail the
guest reads via the existing RLS. Then the guest needs **none** of the AI-Agents/run grants above.
Until then, treat the widget as **demo/localhost only**.

## 8. Gotchas (the non-obvious stuff)

The things that cost real time during bring-up — each is now either fixed in code or captured as a step above.

| Symptom | Cause | Fix |
|---|---|---|
| Widget mint **401 "Authentication failed"** | `widget.enabled` defaults false → routes never mount → request hits unified auth middleware | set `widget.enabled: true` (§4) |
| **Mint returns a token, but the FIRST GraphQL call (`GetDatasetStatusByName`) 401s** and the widget then errors with `Cannot read properties of null (reading 'NewRecord')` | The widget validates guest tokens against the magic-link JWKS at `/magic-link/jwks.json`, but that route used to mount only when `magicLink.enabled`. With magic-link off, the public key was never served → the auth middleware couldn't validate the (otherwise valid) guest token → 401, and the null provider then NPEs. | **Fixed in code** — when `widget.enabled && !magicLink.enabled`, MJServer now publishes the reused signing key via a JWKS-only router (`createMagicLinkJwksRouter`). The widget genuinely stands on its own; `magicLink.enabled` is NOT required. (Pre-fix workaround was `magicLink.enabled: true`.) |
| Widget mint **403** | WidgetInstance row not in this DB, or host page origin not in `AllowedOrigins` | push `widget-instances` (§3); serve on a whitelisted origin |
| Voice: **"no usable Realtime model"** | realtime key under `AI_VENDOR_API_KEY__OpenAILLM` | put it under `AI_VENDOR_API_KEY__OpenAIRealtime` (driverClass name, §5) |
| Inbound call: **"No 'From' number specified"** | engine stamps `Direction` on the DB row but doesn't forward it into the bridge Configuration | fixed in code (`buildSessionConfiguration` sets the Direction config key) |
| Twilio **31920** / WS upgrade **400** | two `WebSocketServer({server})` (GraphQL + media) fight over the HTTP `upgrade` event in ws 8.x | fixed in code — single path-routing upgrade dispatcher + `noServer:true` |
| Audio **deep / slowed down** | model PCM is 24 kHz, Twilio Media Streams are 8 kHz μ-law — played at the wrong rate | fixed in code — `BaseTelephonyBridge` resamples both legs |
| Outbound rejected, Twilio **21210** | caller-ID (the agent identity's number) isn't provisioned on the Twilio account | use a number you own on the account as the agent identity's `IdentityValue` |
| entity-permissions push fails on `@lookup …RLS Filters` | pushed before the RLS-filter migration ran | migrate first, then push metadata (§2 ordering) |
| Guest tokens won't validate | `widget.audience` ≠ `magicLink.audience` | keep both `mj-magic-link` (§4) |
| Mic/voice fails: **"User: Anonymous … does NOT have permission to Create MJ: AI Agent Sessions"** | The Widget Guest role wasn't granted the realtime-session entities (voice persists `MJ: AI Agent Sessions` + `Session Channels`). | Push the `entity-permissions` (grants + RLS links) and run the `Widget_Guest_Session_RLS` migration (§2/§3), then restart MJAPI so the metadata cache reloads. |
| Agent turn fails with **"Conversation detail `<id>` not found"** (mint + conversation create both succeeded) | **Two widgets on one page.** `ConversationsRuntime` is a process-wide singleton with one shared agent-dispatch provider; a second mounted widget overwrites the first's provider, so a turn typed in widget A dispatches under widget B's guest token → B's RLS scope can't see A's conversation detail → not found. | **One widget per page** (matches real usage). To demo/test cross-guest isolation, open the page in two separate browser windows (or incognito) — separate JS contexts = separate runtimes = independent sessions. |
