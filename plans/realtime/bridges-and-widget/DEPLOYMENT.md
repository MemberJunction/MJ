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
| **Vonage telephony** | same shape as Twilio (webhook + media WSS), vendor config block | Vonage account, ngrok, OpenAI Realtime key |
| **RingCentral telephony** | **SIP softphone** — agent-identity metadata + `telephony.ringcentral` SIP-creds block. **No webhook, no ngrok** (outbound SIP registration). | paid RingEX account + an "Existing Phone" device, OpenAI Realtime key |

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

- **`ai-bridge-agent-identities`** → maps a `PhoneNumber` + a `ProviderID` (`@lookup …Twilio` /
  `@lookup …Vonage`) to the agent that answers it. Inbound calls resolve the agent by the dialed number.
  **Number format is provider-specific**: Twilio uses the `+`-prefixed E.164 (`+18669016546`); Vonage's
  webhook `to` is **bare digits** (`14782450323`), so seed the Vonage row without the `+`. The Vonage
  provider row itself ships pre-seeded (`ai-bridge-providers`, `DriverClass = VonageBridge`, Active).

---

## 4. Config — `mj.config.cjs`

Top-level blocks (siblings of `magicLink`). Secrets come from `.env`, never inlined.

```js
// Public widget — master switch. Default is false → routes don't mount → mint 401s.
widget: {
  enabled: true,
  audience: 'mj-magic-link',   // MUST equal magicLink.audience or guest tokens won't validate
},

// Telephony — `enabled` gates whether telephony starts at boot.
// Gate on ANY configured vendor so one block can carry several.
telephony: {
  enabled: !!(process.env.TWILIO_ACCOUNT_SID || process.env.VONAGE_APPLICATION_ID || process.env.RINGCENTRAL_SIP_USERNAME),
  twilio: process.env.TWILIO_ACCOUNT_SID ? {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,         // also the HMAC key for webhook signature verify
    streamPublicUrl: process.env.TWILIO_STREAM_PUBLIC_URL, // wss://<public-host>/telephony/twilio/media
    webhookSigningSecret: process.env.TWILIO_WEBHOOK_SIGNING_SECRET || undefined,
  } : undefined,

  // Vonage — Voice API auth is application-scoped (Application ID + RSA private key → signed JWTs).
  // The account apiKey/apiSecret pair is carried for key-scoped ops; signatureSecret is the webhook
  // verification key (the ingress fails CLOSED if it's absent — see gotchas). `enabled` gates on
  // VONAGE_APPLICATION_ID because that — not the API key — is what actually places/answers calls.
  vonage: process.env.VONAGE_APPLICATION_ID ? {
    applicationId: process.env.VONAGE_APPLICATION_ID,
    // Read the PEM from a file path so a multi-line key never has to live in .env:
    privateKey: process.env.VONAGE_PRIVATE_KEY_PATH
      ? require('fs').readFileSync(process.env.VONAGE_PRIVATE_KEY_PATH, 'utf8')
      : process.env.VONAGE_PRIVATE_KEY || undefined,
    apiKey: process.env.VONAGE_API_KEY || undefined,
    apiSecret: process.env.VONAGE_API_SECRET || undefined,
    signatureSecret: process.env.VONAGE_SIGNATURE_SECRET || process.env.VONAGE_API_SECRET || undefined,
    mediaPublicUrl: process.env.VONAGE_MEDIA_PUBLIC_URL, // wss://<public-host>/telephony/vonage/media
    eventUrl: process.env.VONAGE_EVENT_URL || undefined,
  } : undefined,

  // RingCentral — SIP softphone (the ONLY RingCentral transport that carries bidirectional call audio;
  // its WebSocket "Call Streaming" product is receive-only). No webhook, no public URL, no media WSS:
  // it's an outbound SIP registration that receives inbound INVITEs on its own SIP/TLS connection. The
  // five creds come from an "Existing Phone" (BYOD) device — see §6b. Strip the :port off sipDomain.
  ringcentral: process.env.RINGCENTRAL_SIP_USERNAME ? {
    sipDomain: process.env.RINGCENTRAL_SIP_DOMAIN,                 // e.g. sip.ringcentral.com (NO port)
    sipOutboundProxy: process.env.RINGCENTRAL_SIP_OUTBOUND_PROXY,  // e.g. sip20.ringcentral.com:5096
    sipUsername: process.env.RINGCENTRAL_SIP_USERNAME,
    sipPassword: process.env.RINGCENTRAL_SIP_PASSWORD,
    sipAuthorizationId: process.env.RINGCENTRAL_SIP_AUTHORIZATION_ID,
    // codec defaults to 'OPUS/16000' (wideband PCM16 — the least-friction realtime path). Override only
    // if your carrier forces G.711 ('PCMU/8000'). The bridge auto-sets the carrier sample rate to match.
  } : undefined,
},
```

The widget **reuses the magic-link RS256 key + auth provider**, initialized idempotently inside
`createWidgetHandler` even when `magicLink.enabled` is `false`. So the widget stands on its own — you
do NOT need to enable magic-link unless you want the guest→verified **upgrade** path (then set
`magicLink.enabled: true`).

RingCentral is **not** the same shape as Twilio/Vonage — it carries SIP device creds, not a webhook
signing secret or public URL (it needs no ngrok). See §6b for where the five SIP values come from.

---

## 5. Environment — `.env`

| Var | For | Notes |
|---|---|---|
| `AI_VENDOR_API_KEY__OpenAIRealtime` | **voice (widget + telephony)** | **driverClass-specific** — the realtime driver is `OpenAIRealtime`, NOT `OpenAILLM`. A key under the wrong name → "no usable Realtime model". |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio | live = billable; test creds only work with magic numbers |
| `TWILIO_STREAM_PUBLIC_URL` | Twilio media | `wss://<ngrok-host>/telephony/twilio/media` |
| `MJAPI_PUBLIC_URL` | Twilio/Vonage inbound | MUST match the ngrok host — the inbound webhook signature is verified against the full public URL |
| `TWILIO_TEST_ACCOUNT_SID` / `_AUTH_TOKEN` / `_FROM` / `_TO` | the credential-gated integration test | absent → test self-skips |
| `VONAGE_APPLICATION_ID` | Vonage | the Voice app UUID — also the `enabled` gate for the Vonage block |
| `VONAGE_PRIVATE_KEY_PATH` | Vonage | absolute path to the app's `private.key` (PEM). Read into config at boot — keeps the multi-line key out of `.env`. (`VONAGE_PRIVATE_KEY` with the inline PEM is the fallback.) |
| `VONAGE_API_KEY` / `VONAGE_API_SECRET` | Vonage | account key:secret (top of the dashboard). Needed for key-scoped ops; **not** sufficient alone to place Voice calls (that needs the app JWT above). |
| `VONAGE_SIGNATURE_SECRET` | Vonage webhook gate | **REQUIRED** — the HMAC/JWT key the answer/event webhooks verify against. Absent → the ingress rejects every webhook (fails closed). Dashboard → Settings. |
| `VONAGE_MEDIA_PUBLIC_URL` | Vonage media | `wss://<ngrok-host>/telephony/vonage/media` |
| `VONAGE_EVENT_URL` | Vonage (optional) | `https://<ngrok-host>/telephony/vonage/event` — lifecycle events |
| `RINGCENTRAL_SIP_USERNAME` | RingCentral | SIP User Name from the "Existing Phone" device — also the `enabled` gate for the RingCentral block. **No ngrok / public URL needed.** |
| `RINGCENTRAL_SIP_PASSWORD` | RingCentral | SIP Password (rotates if you re-provision the device). |
| `RINGCENTRAL_SIP_AUTHORIZATION_ID` | RingCentral | SIP Authorization ID. |
| `RINGCENTRAL_SIP_DOMAIN` | RingCentral | SIP Domain, e.g. `sip.ringcentral.com` — **strip the `:port`** (the proxy keeps its port, the domain doesn't). |
| `RINGCENTRAL_SIP_OUTBOUND_PROXY` | RingCentral | Outbound Proxy `host:port`, e.g. `sip20.ringcentral.com:5096` (region-specific). |

---

## 6. External infra (telephony only)

1. **ngrok** (or any public tunnel) → your MJAPI port: `ngrok http 4008`. Put the `https://…` host in
   `MJAPI_PUBLIC_URL` and the `wss://…/telephony/twilio/media` in `TWILIO_STREAM_PUBLIC_URL`. **These
   cycle** every ngrok restart — re-point all three (env + the Twilio number's webhook).
2. **Twilio number** → set its Voice webhook to `https://<public-host>/telephony/twilio/voice` (POST).
3. **OpenAI Realtime** API key under the env name in §5.

The widget needs none of this — it's same-origin-to-MJAPI over normal HTTPS.

### 6a. Vonage setup (end-to-end)

Same ngrok in §6.1 applies (point it at MJAPI's port). Then:

1. **Create a Voice application** — Dashboard → Applications → *Create*, enable **Voice**. Set:
   - **Answer URL** → `https://<public-host>/telephony/vonage/answer`, **method POST** (Vonage defaults
     answer to GET — you MUST switch it to POST or the ingress 404s the GET).
   - **Event URL** → `https://<public-host>/telephony/vonage/event`, **method POST**.

   This yields the **Application ID** and a one-time **`private.key`** download → save it and point
   `VONAGE_PRIVATE_KEY_PATH` at it. (Scriptable instead of the dashboard: `POST
   https://api.nexmo.com/v2/applications` with Basic auth `api_key:api_secret` — the response carries
   both the `id` and `keys.private_key` inline, and you set the webhooks in the same call.)

2. **Enable signed webhooks** — Dashboard → Settings → toggle **"Use signed webhooks"** on and copy the
   **Signature secret** → `VONAGE_SIGNATURE_SECRET`. **Not optional**: the ingress verifies every webhook
   and fails closed without it, and Vonage only sends the signing JWT when this is on.

3. **Link a number** to the application (Numbers → buy/assign → link to the app). The dialed DID resolves
   to the agent via the `ai-bridge-agent-identities` row (§3). Format the row's `IdentityValue` as **bare
   digits, no `+`** for Vonage (e.g. `14782450323`) — Vonage's webhook `to` is unprefixed, unlike Twilio.

The media socket (`wss://<host>/telephony/vonage/media`, content-type `audio/l16;rate=8000`) is opened by
the answer NCCO automatically — you don't configure it in the dashboard, but `VONAGE_MEDIA_PUBLIC_URL` must
match your ngrok host.

> **Trial accounts**: a Vonage free-trial account gets one number but **cannot provision more via API**
> (the buy 401s) and may only interact with **verified** numbers. Test by calling **into** the Vonage
> number (inbound); outbound (`PlaceVonageCall`) can only dial numbers you've verified as test numbers.

### 6b. RingCentral setup (end-to-end)

RingCentral is the odd one out: **no ngrok, no webhook, no public URL.** The agent connects as a headless
**SIP softphone** (`ringcentral-softphone` over SIP/TLS + RTP/SRTP) — the only RingCentral product that
carries bidirectional call audio (its WebSocket "Call Streaming" product is *receive-only*, so it can't
voice the agent). The server holds one long-lived SIP **registration**; inbound calls arrive as SIP INVITEs
on it directly.

**Account reality:** RingCentral **removed its free sandbox**. You need a **paid RingEX** account with a
user extension that has a **Digital Line + assigned phone number (DID)**. There's no free fake-PSTN lab —
you test on a real, billed account, so guard against accidental outbound dialing during tests.

**The five SIP creds — simplest path (console, no API/JWT/code):**

1. **Admin Portal** → ensure a user extension has a **Digital Line + DID**.
2. **Phone System → Phones & Devices → User Phones → Add Device → Other Phones → "Existing Phone"** →
   assign it to that extension, assign the DID, and set the **Emergency Address** (mandatory — a missing
   one **blocks outbound calls**).
3. On that device → **Set Up and Provision → "Set up manually using SIP"** — this page shows **SIP Domain,
   Outbound Proxy, User Name, Password, Authorization ID**. Those map 1:1 to the five `RINGCENTRAL_SIP_*`
   env vars in §5. **Strip the `:port` off the SIP Domain.**
4. Seed the agent-identity row (§3) with `IdentityType='PhoneNumber'`, `IdentityValue` = the DID, so an
   inbound call to it resolves to the pinned agent. (RingCentral's INVITE `From`/`To` are SIP URIs; the
   ingress parses the number out, keeping any leading `+` — match the row's `IdentityValue` accordingly.)

**Alternative (API):** create a **Server-only (no UI) / REST API** app with **JWT auth** and scopes
**VoIP Calling + Read Accounts + Call Control**, then `listExtensionDevices` (filter `type='OtherPhone'`)
→ `readDeviceSipInfo` returns the same five values. More moving parts; only worth it to automate
provisioning. **Note:** `sip-provision` is the *wrong* endpoint (that's the browser WebPhone path).

> **Gotchas:** ① Use an **"Existing Phone" (`OtherPhone`)** device — a "RingCentral Phone app"
> (`SoftPhone`-type) device's creds will **not** register with this SDK. ② **One registration per device**
> for inbound — for concurrent inbound calls, provision a separate Existing Phone device per endpoint.
> ③ The **"VoIP Calling" scope** sometimes isn't selectable and needs a RingCentral **support ticket** —
> only relevant for the API route; the console-manual route sidesteps it. ④ Default codec is `OPUS/16000`
> (wideband 16 kHz); the bridge sets its carrier sample rate to match automatically.

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

## 7b. Guest agent execution — cross-guest leak CLOSED (2026-06-30)

To make a guest get a live **agent reply** (text + voice), the Widget Guest role is granted, beyond the
conversation/session isolation above:

| Entity | Grant | Scoped? |
|---|---|---|
| `MJ: AI Agents` | Read | ✅ RLS-scoped to **widget-pinned agents only** (`Widget Guest: Widget-Pinned Agents`) — guests never see your internal roster |
| `MJ: AI Agent Runs` | Create/Read/Update | ✅ Read **RLS-scoped** (`Widget Guest: Own Agent Runs`) — a guest reads only its own session's runs |
| `MJ: AI Agent Run Steps` | Create/Read/Update | ✅ Read **RLS-scoped** (same filter, via `ConversationID`) |
| `MJ: AI Prompt Runs` | Create/Read/Update | ✅ Read **RLS-scoped** (same filter, via `ConversationID`) |

**Text path** — agent execution now runs under a **privileged server-side dispatch**:
`RunAIAgentFromConversationDetail` detects a widget guest (`IsMagicLinkAnonymous` + the signed
`mj_widget_id` claim), validates conversation ownership **under the guest** (RLS), then runs the
**authoritative pinned agent** (resolved from the widget instance, never the client arg) under the
**system principal**. So a text guest writes **no** run rows.

**Voice path** — the realtime subsystem threads `contextUser` pervasively, so the co-agent observability
+ delegated target-agent runs are still written under the guest. To close the cross-guest leak there, the
three run entities are **read-RLS-scoped** by `Widget Guest: Own Agent Runs`
(`ConversationID IN (SELECT ID FROM vwConversations WHERE ExternalID = '{{ScopeResourceID}}')`), so a guest
can only read its own session's run rows. (Update is left unscoped: a voice-delegated run may be created
with a null `ConversationID`, which an update filter would hide and break server-side finalize; the stated
blocker was the read leak, and reads being scoped prevents discovering another guest's unguessable run ids.)

**Migration:** `V202606292320__…Widget_Public_Hardening.sql` seeds the RLS filter; the
`metadata/entity-permissions` rows attach it as `ReadRLSFilterID`. **No longer demo/localhost-only.**

## 8. Gotchas (the non-obvious stuff)

The things that cost real time during bring-up — each is now either fixed in code or captured as a step above.

| Symptom | Cause | Fix |
|---|---|---|
| Widget mint **401 "Authentication failed"** | `widget.enabled` defaults false → routes never mount → request hits unified auth middleware | set `widget.enabled: true` (§4) |
| **Mint returns a token, but the FIRST GraphQL call (`GetDatasetStatusByName`) 401s** and the widget then errors with `Cannot read properties of null (reading 'NewRecord')` | The widget validates guest tokens against the magic-link JWKS at `/magic-link/jwks.json`, but that route used to mount only when `magicLink.enabled`. With magic-link off, the public key was never served → the auth middleware couldn't validate the (otherwise valid) guest token → 401, and the null provider then NPEs. | **Fixed in code** — when `widget.enabled && !magicLink.enabled`, MJServer now publishes the reused signing key via a JWKS-only router (`createMagicLinkJwksRouter`). The widget genuinely stands on its own; `magicLink.enabled` is NOT required. (Pre-fix workaround was `magicLink.enabled: true`.) |
| Widget mint **403** | WidgetInstance row not in this DB, or host page origin not in `AllowedOrigins` | push `widget-instances` (§3); serve on a whitelisted origin |
| Voice: **"no usable Realtime model"** | realtime key under `AI_VENDOR_API_KEY__OpenAILLM` | put it under `AI_VENDOR_API_KEY__OpenAIRealtime` (driverClass name, §5) |
| Inbound call: **"No 'From' number specified"** | engine stamps `Direction` on the DB row but doesn't forward it into the bridge Configuration | fixed in code (`buildSessionConfiguration` sets the Direction config key) |
| **Vonage: every webhook 403s** ("Invalid Vonage signature") | `VONAGE_SIGNATURE_SECRET` unset, or signed webhooks not enabled in the dashboard → the gate fails closed and Vonage sends no signing JWT | set the signature secret (§5) AND enable signed webhooks (§6a step 2) |
| **Vonage answer webhook 404s** | the Voice app's Answer URL is set to GET (Vonage's default) | switch the Answer + Event URL methods to **POST** (§6a step 1) |
| **Vonage: connects but audio is garbled / silent** | the media path was built as a Twilio copy (base64 μ-law in JSON) | **fixed in code** — Vonage carries audio as **raw binary L16 PCM** frames + JSON **text** control events; no base64, no μ-law (`real-vonage-bindings.ts` / `vonageMediaRegistry.ts`) |
| **Vonage: agent talks over itself after the caller interrupts** | Vonage queues up to **~60s** of sent audio; without a flush, the agent drains the old reply while answering the new input | **fixed in code** — barge-in now sends Vonage's `{"action":"clear"}` command (`BaseTelephonyBridge.FlushOutboundMedia` → `ITelephonyCallSdk.flushOutbound`). Use a headset when testing to avoid acoustic-echo false barge-ins. |
| **Vonage: can't buy a number (`number/buy` 401)** | free-trial accounts get one number but can't provision more via API, and only interact with verified numbers | use the trial number; verify your cell as a test number; test inbound, not outbound (§6a trial note) |
| Twilio **31920** / WS upgrade **400** | two `WebSocketServer({server})` (GraphQL + media) fight over the HTTP `upgrade` event in ws 8.x | fixed in code — single path-routing upgrade dispatcher + `noServer:true` |
| Audio **deep / slowed down** | model PCM is 24 kHz, Twilio Media Streams are 8 kHz μ-law — played at the wrong rate | fixed in code — `BaseTelephonyBridge` resamples both legs |
| Outbound rejected, Twilio **21210** | caller-ID (the agent identity's number) isn't provisioned on the Twilio account | use a number you own on the account as the agent identity's `IdentityValue` |
| entity-permissions push fails on `@lookup …RLS Filters` | pushed before the RLS-filter migration ran | migrate first, then push metadata (§2 ordering) |
| Guest tokens won't validate | `widget.audience` ≠ `magicLink.audience` | keep both `mj-magic-link` (§4) |
| Mic/voice fails: **"User: Anonymous … does NOT have permission to Create MJ: AI Agent Sessions"** | The Widget Guest role wasn't granted the realtime-session entities (voice persists `MJ: AI Agent Sessions` + `Session Channels`). | Push the `entity-permissions` (grants + RLS links) and run the `Widget_Guest_Session_RLS` migration (§2/§3), then restart MJAPI so the metadata cache reloads. |
| Agent turn fails with **"Conversation detail `<id>` not found"** (mint + conversation create both succeeded) | **Two widgets on one page.** `ConversationsRuntime` is a process-wide singleton with one shared agent-dispatch provider; a second mounted widget overwrites the first's provider, so a turn typed in widget A dispatches under widget B's guest token → B's RLS scope can't see A's conversation detail → not found. | **One widget per page** (matches real usage). To demo/test cross-guest isolation, open the page in two separate browser windows (or incognito) — separate JS contexts = separate runtimes = independent sessions. |
