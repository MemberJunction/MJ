# T1 — Twilio Ingress Notes (MJAPI live wiring, credential-gated)

**Part of:** [Telephony Vendor Bindings](../telephony-vendor-bindings.md) — Phase T1, deliverable (B)/(C).
**Status:** The **offline, unit-tested** pieces are done (see below). The **live** MJAPI router + WSS endpoint
+ `Telephony.PlaceCall` mutation are blocked on real Twilio credentials + a publicly reachable URL.

---

## What landed offline (this push)

All in `packages/AI/RealtimeBridge/Providers/Twilio/src/`, framework-free + unit-tested (no Express, no
network, no DB, no `twilio` install):

- **`real-twilio-bindings.ts`** — `RealTwilioBindings implements ITwilioClientBindings` over injected minimal
  surfaces (`ITwilioRestLike` = `CreateCall`/`UpdateCall`; `ITwilioMediaPump` = `Send`/`OnFrame`/`GetStreamSid`).
  Pure helpers: `buildConnectStreamTwiML`, `buildPlayDigitsTwiML`, `buildDialTwiML`, `parseTwilioMediaFrame`,
  `encodeTwilioMediaFrame` (base64 μ-law ↔ PCM16 via the T0 codec `muLawToPcm16Buffer`/`pcm16ToMuLawBuffer`).
- **`twilio-ingress.ts`** — pure ingress helpers: `verifyTwilioSignature` (Twilio's HMAC-SHA1 request-signature
  scheme, constant-time compare), `computeTwilioSignature`, `buildInboundVoiceTwiML`, `resolveInboundCall`.
- **`__tests__/real-twilio-bindings.test.ts`**, **`__tests__/twilio-ingress.test.ts`** — full unit coverage.
- **`package.json`** — `twilio` added to `optionalDependencies` (CLAUDE rule 8, category 2; never statically
  imported — production wires it behind the injected surfaces).

These are pure functions the MJAPI router will call verbatim — the live router holds **no** Twilio-specific
logic beyond plumbing HTTP/WS to these helpers and the engine.

---

## Intended MJAPI router shape (the remaining live piece)

Three routes, mounted **publicly** (carriers can't carry an MJ JWT — signature verification is the gate):

### `POST /telephony/twilio/voice` (inbound voice webhook)
```
1. verifyTwilioSignature(authToken, req.header('X-Twilio-Signature'), fullUrl, req.body)  → 403 on fail
2. const { callSid, from, to } = resolveInboundCall(req.body)
3. resolve dialed DID `to` → `MJ: AI Bridge Agent Identities` (IdentityType 'PhoneNumber')
4. AIBridgeEngine.StartBridgeSession({ Direction: 'Inbound', InboundCallId: callSid, ... })
5. respond 200 text/xml with buildInboundVoiceTwiML(streamPublicUrl)   // <Connect><Stream wss://…/media>
```

### `WSS /telephony/twilio/media` (Media Streams socket)
```
- On 'start' frame: capture streamSid; locate the active call's RealTwilioBindings instance by CallSid.
- Provide an ITwilioMediaPump backed by THIS socket:
    Send(callSid, frame)      → ws.send(JSON.stringify(frame))
    OnFrame(callSid, handler) → ws.on('message', m => handler(JSON.parse(m)))
    GetStreamSid(callSid)     → the captured streamSid
- Inbound 'media' → bindings.onStreamAudio handler → PCM16 → session.SendInput (engine seam, already wired).
- 'stop' → bindings.onCallStatus → call-ended.
- Verify the connection origin (Twilio signs the initial HTTP upgrade; also gate with webhookSigningSecret).
```

### `Telephony.PlaceCall(agentIdentityId, toNumber)` (outbound trigger)
A GraphQL mutation / Remote Operation that calls
`AIBridgeEngine.StartBridgeSession({ Direction: 'Outbound', ... })`. The bound `RealTwilioBindings.createCall`
issues REST `POST /Calls` with the `<Connect><Stream>` TwiML; the returned Call SID becomes the session's
external connection id.

---

## Credential config block

Resolved via MJ config / credential system — **never inlined**. In `mj.config.cjs`:

```js
telephony: {
  twilio: {
    accountSid: '…',            // OR use apiKeySid + apiKeySecret instead of authToken for REST auth
    authToken: '…',             // also the HMAC key for verifyTwilioSignature
    apiKeySid: '…',             // optional alternative to accountSid+authToken
    apiKeySecret: '…',
    streamPublicUrl: 'wss://<MJAPI_PUBLIC_URL>/telephony/twilio/media',  // the <Connect><Stream> url
    webhookSigningSecret: '…',  // shared secret gating the public webhook/WSS endpoints (defense-in-depth)
  }
}
```

These map onto `TwilioNativeSdkConfig` (`AccountSid`/`AuthToken`/`ApiKeySid`/`ApiKeySecret`/`StreamUrl`) which
the native SDK reads from the resolved session `Configuration`. `authToken` doubles as the
`verifyTwilioSignature` key.

---

## Precisely what's blocked on credentials / live wiring

1. **The Express router + WSS endpoint in MJAPI** — needs the real `twilio` REST client + a websocket server
   wired into the `ITwilioRestLike`/`ITwilioMediaPump` surfaces, plus a public URL (`MJAPI_PUBLIC_URL` / ngrok
   in dev) Twilio can reach. Not buildable/testable offline.
2. **`Telephony.PlaceCall` mutation / Remote Operation** — needs the DB reachable (CodeGen for the resolver +
   the agent-identity lookup) and Twilio credentials to place a real call.
3. **Integration tests** (`describe.skipIf(!process.env.TWILIO_TEST_*)`) — dial a real test DID / number;
   never run in CI. Capped-spend test numbers only.
4. **Metadata / config schema** — if the `telephony.twilio` block needs a provider `Configuration` schema row,
   that's a DB migration + CodeGen (currently blocked: DB unreachable).

The seam is complete and proven offline; the above is purely the network/credential/DB-bound activation.
