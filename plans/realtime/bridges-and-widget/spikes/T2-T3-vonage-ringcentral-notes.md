# T2 / T3 — Vonage & RingCentral Ingress Notes (MJAPI live wiring, credential-gated)

**Part of:** [Telephony Vendor Bindings](../telephony-vendor-bindings.md) — Phases T2 (Vonage) and T3
(RingCentral), deliverables (A)/(B)/(C). Near-repeats of T1 (Twilio) with per-vendor deltas — see
[T1-twilio-ingress-notes.md](./T1-twilio-ingress-notes.md) for the proven template.
**Status:** The **offline, unit-tested** pieces are done for both vendors (below). The **live** MJAPI routers
+ media endpoints + `Telephony.PlaceCall` mutation are blocked on real carrier credentials + a publicly
reachable URL + the DB (CodeGen).

---

## What landed offline (this push)

### Vonage — `packages/AI/RealtimeBridge/Providers/Vonage/src/`
Framework-free + unit-tested (no Express, no network, no DB, no `@vonage/server-sdk` install):

- **`real-vonage-bindings.ts`** — `RealVonageBindings implements IVonageClientBindings` over injected minimal
  surfaces (`IVonageVoiceLike` = `CreateCall`/`HangupCall`/`TransferCall`/`SendDtmf`; `IVonageMediaPump` =
  `Send`/`OnFrame`). Pure helpers: `buildConnectNcco`, `buildTransferNccoAction`, `parseVonageMediaFrame`,
  `encodeVonageMediaFrame` (base64 μ-law ↔ PCM16 via the T0 codec `muLawToPcm16Buffer`/`pcm16ToMuLawBuffer`).
- **`vonage-ingress.ts`** — pure ingress helpers: `verifyVonageSignature` (Vonage signed-request HMAC-SHA256
  hex scheme, constant-time compare), `computeVonageSignature`, `verifyVonageJwt` (HS256 bearer-JWT verify +
  `exp`, no JWT lib), `buildInboundAnswerNcco`, `resolveInboundCall`.
- **`__tests__/real-vonage-bindings.test.ts`**, **`__tests__/vonage-ingress.test.ts`** — full unit coverage.
- **`package.json`** — `@vonage/server-sdk` added to `optionalDependencies` (CLAUDE rule 8, category 2; never
  statically imported — production wires it behind the injected surfaces). Justification in the top-level
  `"//optionalDependencies"` string key.

### RingCentral — `packages/AI/RealtimeBridge/Providers/RingCentral/src/`
Same shape (no `@ringcentral/sdk` install):

- **`real-ringcentral-bindings.ts`** — `RealRingCentralBindings implements IRingCentralClientBindings` over
  injected minimal surfaces (`IRingCentralCallControlLike` = `CreateSession`/`AnswerParty`/`DropSession`/
  `PlayDigits`/`TransferParty`; `IRingCentralMediaPump` = `Send`/`OnFrame`). Pure helpers:
  `buildCreateSessionPayload`, `buildTransferPartyPayload`, `parseRingCentralMediaFrame`,
  `encodeRingCentralMediaFrame` (base64 μ-law ↔ PCM16 via the T0 codec).
- **`ringcentral-ingress.ts`** — pure ingress helpers: `handleValidationToken` (the subscription-registration
  `Validation-Token` echo handshake), `verifyRingCentralWebhook` (delivery `verification-token` constant-time
  check), `resolveInboundCall` (telephony-session notification → `{ sessionId, from, to }`).
- **`__tests__/real-ringcentral-bindings.test.ts`**, **`__tests__/ringcentral-ingress.test.ts`** — full unit
  coverage.
- **`package.json`** — `@ringcentral/sdk` added to `optionalDependencies` (same rule-8 justification in the
  top-level `"//optionalDependencies"` key).

These are pure functions the MJAPI routers will call verbatim — the live routers hold **no** vendor-specific
logic beyond plumbing HTTP/WS to these helpers and the engine.

---

## Per-vendor deltas vs Twilio (what makes T2/T3 not a blind clone)

| Concern | Twilio (T1) | **Vonage (T2)** | **RingCentral (T3)** |
|---|---|---|---|
| Answer/connect doc | TwiML `<Connect><Stream>` (XML) | **NCCO** `connect` action w/ `websocket` endpoint (JSON) | Call-Control **create-session** payload (`streamUrl`) |
| Place call | REST `POST /Calls` | **Voice API** `POST /v1/calls` | Call-Control `POST .../telephony/sessions` |
| Transfer | REST update `<Dial>` | Voice API `PUT /v1/calls/:uuid` `transfer` NCCO | Call-Control party `transfer` |
| Media leg | Media Streams WS (`<Stream>`) | WebSocket `connect` media leg | Session **media stream** |
| Media frame | `{event:'media', media:{payload}}` | `{event:'media', payload}` | `{event:'media', media:{data}}` |
| Call-end signal | `stop` frame | WebSocket `close` | media-stream `stop` |
| Webhook auth | `X-Twilio-Signature` (HMAC-SHA1, URL+params) | **`sig`** (HMAC-SHA256 hex, sorted `&k=v`) **or JWT** (HS256 bearer) | **validation-token** handshake + **verification-token** delivery check; Call Control via **OAuth (JWT/3-legged)** |
| Optional SDK | `twilio` | `@vonage/server-sdk` | `@ringcentral/sdk` |

Audio is identical across all three: μ-law/8k on the wire, PCM16 `ArrayBuffer` at the seam, transcoded by the
shared **T0 codec** — never reimplemented per vendor.

---

## Intended MJAPI router shapes (the remaining live pieces)

All routes mounted **publicly** (carriers can't carry an MJ JWT — signature/token verification is the gate).

### Vonage
- **`POST /telephony/vonage/answer`** — `verifyVonageSignature` / `verifyVonageJwt` → 403 on fail;
  `resolveInboundCall(req.body)`; resolve dialed DID `to` → agent identity (IdentityType `PhoneNumber`);
  `AIBridgeEngine.StartBridgeSession({ Direction:'Inbound', InboundCallId: callId })`; respond 200 JSON with
  `buildInboundAnswerNcco(mediaWssUrl)`.
- **`POST /telephony/vonage/event`** — lifecycle events (verify, map terminal status → call-ended).
- **`WSS /telephony/vonage/media`** — the `connect` websocket media leg; back an `IVonageMediaPump` with the
  socket (`Send`→`ws.send(JSON.stringify)`, `OnFrame`→`ws.on('message')`); inbound `media` →
  `bindings.onWebsocketAudio` → PCM16 → `session.SendInput`; `close` → `onCallStatus`.

### RingCentral
- **`POST /telephony/ringcentral/*` (notifications)** — first call `handleValidationToken(req.header('Validation-Token'))`;
  if non-null, echo it back in the response `Validation-Token` header + 200 (registration handshake). Otherwise
  `verifyRingCentralWebhook(expectedToken, req.header('verification-token'))` → 403 on fail;
  `resolveInboundCall(req.body.body)`; resolve DID → identity; `StartBridgeSession({ Direction:'Inbound',
  InboundCallId: sessionId })`.
- **Media stream** — back an `IRingCentralMediaPump` with the session's media gateway stream; same inbound→
  `session.SendInput`, `stop`→`onSessionStatus`.

### `Telephony.PlaceCall(agentIdentityId, toNumber)` (both vendors)
A GraphQL mutation / Remote Operation calling `AIBridgeEngine.StartBridgeSession({ Direction:'Outbound', ... })`.
The bound `RealVonageBindings.createCall` / `RealRingCentralBindings.createSession` issues the vendor REST call
with the connect-NCCO / create-session payload; the returned call UUID / session id becomes the session's
external connection id.

---

## Credential config blocks

Resolved via MJ config / credential system — **never inlined**. In `mj.config.cjs`:

```js
telephony: {
  vonage: {
    applicationId: '…',          // Voice application id (signs the Voice JWT w/ privateKey)
    privateKey: '…',             // Voice application private key
    apiKey: '…', apiSecret: '…', // Account API auth
    signatureSecret: '…',        // HMAC key for verifyVonageSignature / verifyVonageJwt
    mediaWssUrl: 'wss://<MJAPI_PUBLIC_URL>/telephony/vonage/media',
    eventUrl: 'https://<MJAPI_PUBLIC_URL>/telephony/vonage/event',
  },
  ringcentral: {
    clientId: '…', clientSecret: '…',  // OAuth app credentials
    jwt: '…',                          // server-to-server JWT (3-legged alternative)
    serverUrl: 'https://platform.ringcentral.com',  // sandbox vs production
    streamUrl: 'wss://<MJAPI_PUBLIC_URL>/telephony/ringcentral/media',
    webhookVerificationToken: '…',     // expected token for verifyRingCentralWebhook
  }
}
```

These map onto `VonageNativeSdkConfig` / `RingCentralNativeCallConfig` which the native SDKs read from the
resolved session `Configuration`. The Vonage `signatureSecret` doubles as the `verifyVonageSignature` /
`verifyVonageJwt` key; the RingCentral `webhookVerificationToken` is the `verifyRingCentralWebhook` expected
value.

---

## Precisely what's blocked on credentials / live wiring (both vendors)

1. **The Express routers + media endpoints in MJAPI** — need the real `@vonage/server-sdk` Voice client /
   `@ringcentral/sdk` Call-Control client + a websocket/media server wired into the injected
   `IVonageVoiceLike`/`IVonageMediaPump` / `IRingCentralCallControlLike`/`IRingCentralMediaPump` surfaces, plus
   a public URL (`MJAPI_PUBLIC_URL` / ngrok in dev) the carrier can reach. Not buildable/testable offline.
2. **`Telephony.PlaceCall` mutation / Remote Operation** — needs the DB reachable (CodeGen for the resolver +
   the agent-identity lookup) and carrier credentials to place a real call. Shared with T1.
3. **Integration tests** (`describe.skipIf(!process.env.VONAGE_TEST_* / RINGCENTRAL_TEST_*)`) — dial a real
   test DID / number; never run in CI. Capped-spend test numbers only.
4. **OAuth token lifecycle (RingCentral)** — 3-legged / JWT grant + token refresh lives in the live REST client
   wiring (resolved upstream); only the webhook validation/verification handshake is offline-testable here.
5. **Metadata / config schema** — if the `telephony.vonage` / `telephony.ringcentral` blocks need a provider
   `Configuration` schema row, that's a DB migration + CodeGen (currently blocked: DB unreachable).

The seams are complete and proven offline for both vendors; the above is purely the network/credential/DB-bound
activation, identical in shape to T1.
