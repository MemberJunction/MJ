# Telephony Vendor Bindings — Twilio, Vonage, RingCentral

**Part of:** [Agent Bridges & Public Widget program](./README.md)
**Decision in force:** D3 (all telephony this push)
**Goal:** Take the three telephony bridge drivers from "code-complete, unit-tested against fakes" to "places and receives real calls through the agent," with credential-gated integration tests.

---

## 0. The one-paragraph thesis

The drivers are **done**. Each `*Bridge` extends `BaseTelephonyBridge`, declares its capabilities, and already ships a **native SDK wrapper** (`*NativeCallSdk` + `Bind*NativeCall()` + auto-registration in `BridgeNativeSdkRegistry`). The native wrapper lazy-loads a **native module specifier** — so the remaining work is: (1) implement the real REST + media layer the native loader resolves to, (2) stand up the **inbound webhook + Media-Streams WebSocket endpoint** in MJAPI so carriers can reach us, (3) wire credentials via MJ config, (4) write integration tests. No driver rewrites.

---

## 1. Current state (verified against code)

### 1a. Base contract — `BaseTelephonyBridge`
`packages/AI/RealtimeBridge/Base/src/base-telephony-bridge.ts`

```typescript
export interface ITelephonyCallSdk {
  dial(toNumber: string, fromNumber: string, args?: Record<string, unknown>): Promise<string>;
  answer(callId: string): Promise<void>;
  hangup(callId: string): Promise<void>;
  sendAudioFrame(pcm: ArrayBuffer): void;
  onAudioFrame(cb: (pcm: ArrayBuffer) => void): void;
  sendDtmf(digits: string): Promise<void>;
  onDtmf(cb: (digits: string) => void): void;
  transfer(callId: string, toNumber: string): Promise<void>;
  onCallEnded(cb: () => void): void;
}
export type TelephonyCallSdkFactory = (config?: Record<string, unknown>) => ITelephonyCallSdk;

export abstract class BaseTelephonyBridge extends BaseRealtimeBridge {
  public SetSdkFactory(factory: TelephonyCallSdkFactory): void
  public async Connect(ctx: RealtimeBridgeContext): Promise<BridgeConnectResult>   // dial (Outbound) or answer (Inbound)
  public SendMedia(track, frame): void                                            // → sdk.sendAudioFrame
  public OnMedia(handler): void                                                   // ← sdk.onAudioFrame
  public override async SendDTMF(digits): Promise<void>                           // gated by DTMF feature
  public override async TransferCall(target): Promise<void>                       // gated by CallTransfer feature
}
// Config keys: DIRECTION_CONFIG_KEY='Direction', FROM_NUMBER_CONFIG_KEY='FromNumber', INBOUND_CALL_ID_CONFIG_KEY='InboundCallId'
```

The base wires the transport seam (`SendMedia`→`sdk.sendAudioFrame`, `sdk.onAudioFrame`→`OnMedia`). **You implement only the SDK behind the seam.**

### 1b. Twilio (lead provider) — already scaffolded
`packages/AI/RealtimeBridge/Providers/Twilio/src/`

- `twilio-bridge.ts` — `@RegisterClass(BaseRealtimeBridge, 'TwilioBridge')`, sets factory in ctor.
- `twilio-call-sdk.ts` — `ITwilioClientBindings` (the real seam) + `TwilioCallSdk` (throws until bound) + `TwilioCallSdkFactory`.
- `twilio-native-call-sdk.ts` — **`TwilioNativeCallSdk implements ITelephonyCallSdk`** + `BindTwilioNativeCall(loadModule)` reading `TwilioNativeSdkConfig { AccountSid, AuthToken, ApiKeySid, ApiKeySecret, StreamUrl, NativeModuleSpecifier }`.
- `register-native.ts` — `RegisterTwilioNativeSdk()` registers into `BridgeNativeSdkRegistry` on import.
- `__tests__/twilio-bridge.test.ts` — `FakeTwilioCallSdk` with `DriveInboundAudio/DriveInboundDtmf/DriveCallEnded` helpers.

```typescript
export interface ITwilioClientBindings {
  createCall(toNumber, fromNumber, args?): Promise<string>;
  acceptInbound(callSid): Promise<void>;
  completeCall(callSid): Promise<void>;
  pushStreamAudio(callSid, pcm: ArrayBuffer): void;
  onStreamAudio(callSid, cb: (pcm: ArrayBuffer) => void): void;
  playDigits(callSid, digits): Promise<void>;
  onDigits(callSid, cb: (digits) => void): void;
  redirectCall(callSid, toNumber): Promise<void>;
  onCallStatus(callSid, cb: () => void): void;
}
```
Unbound error (current): `TwilioCallSdk has no real Twilio client bound (operation '{op}'). Construct it with an ITwilioClientBindings over the real twilio SDK (REST + Media Streams), or inject a fake in tests.`

### 1c. Vonage & RingCentral — identical shape
- Vonage: `IVonageClientBindings` (`createCall/acceptInbound/hangupCall/pushWebsocketAudio/onWebsocketAudio/playDigits/onDigits/transferCall/onCallStatus`), driver `'VonageBridge'`.
- RingCentral: `IRingCentralClientBindings` (`createSession/answerSession/dropSession/pushStreamAudio/onStreamAudio/playDigits/onDigits/transferSession/onSessionStatus`), driver `'RingCentralBridge'`.
- Same `*NativeCallSdk` + `Bind*NativeCall()` + `register-native.ts` pattern.

### 1d. Metadata rows already seeded
`metadata/ai-bridge-providers/.ai-bridge-providers.json` has Active rows for Twilio/Vonage/RingCentral with `BridgeType:"Telephony"`, correct `DriverClass`, and `SupportedFeatures` (`OutboundDial, InboundRouting, AudioIn, AudioOut, DTMF, CallTransfer`). **No metadata work needed** unless you add config.

### 1e. Packages
`@memberjunction/ai-bridge-{twilio,vonage,ringcentral}@5.42.0`, each depends only on core/global/core-entities/ai-bridge-base. **The real vendor SDK is NOT a dependency** — it's lazy-loaded via `NativeModuleSpecifier`. Add it as an **`optionalDependencies`** entry when you bind (CLAUDE rule 8: dynamic import is justified here as an optional peer; still declare it).

---

## 2. The real work (what's actually missing)

```
   ┌─────────────────────────── MJAPI (new) ───────────────────────────┐
   │  Inbound webhook endpoint  +  Media-Streams WebSocket endpoint     │
   │  (carrier → us: TwiML/NCCO/Call-Control + bidirectional PCM)       │
   └───────────────┬───────────────────────────────────────────────────┘
                   │ resolves call → AIBridgeEngine.StartBridgeSession
                   ▼
   BridgeNativeSdkRegistry.Apply('TwilioBridge', driver)   ← already auto-registered
                   ▼
   TwilioNativeCallSdk  →  [IMPLEMENT THIS]  real twilio SDK:
        createCall      → REST: POST /Calls (outbound dial)
        acceptInbound   → answer via TwiML <Connect><Stream>
        pushStreamAudio → Media Streams WS outbound frames
        onStreamAudio   → Media Streams WS inbound frames
        playDigits      → REST <Play>/<Pause> or SIP INFO
        redirectCall    → REST POST /Calls/{sid} (transfer)
        onCallStatus    → status-callback webhook → ended
```

Three real deliverables per provider: **(A)** the native SDK implementation, **(B)** the MJAPI ingress (webhook + media WS), **(C)** credential config. Plus tests.

---

## 3. Phased task breakdown

### Phase T0 — Media-plane spike (do once, shared) (1 day)
- [ ] Decide the **audio format contract** end-to-end: carriers deliver μ-law/8kHz (Twilio Media Streams) or L16; the realtime models expect PCM16 at 16/24kHz. Define where resampling/transcoding happens (recommend: in the native SDK, so the bridge seam always speaks PCM16 as `ArrayBuffer`, matching `ITelephonyCallSdk`). Document the chosen sample rates per model (see realtime client driver notes: Gemini 16k up/24k down).
- [ ] Confirm whether server-bridged media plane (program README §6 / "P5") is required, or whether the native SDK owning the carrier WS is sufficient on its own. For telephony the **native SDK owns the carrier socket directly**, so P5 is NOT a hard blocker — but the bridge still needs the realtime session's `SendInput/OnOutput` wired (verify `AIBridgeEngine` does this for an attached telephony bridge).
- [ ] **Acceptance:** a written audio-format/data-flow note checked into this folder; a passing loopback test that pipes synthetic μ-law in → PCM16 out → back, asserting round-trip fidelity.

### Phase T1 — Twilio end-to-end (the proving track)
**(A) Native SDK** — implement `ITwilioClientBindings` over the real `twilio` npm SDK + Media Streams:
- [ ] Add `twilio` to `optionalDependencies` of `@memberjunction/ai-bridge-twilio`; run `npm install` at repo root.
- [ ] Implement a `RealTwilioBindings` class behind `BindTwilioNativeCall`'s module loader (or wire `twilio-native-call-sdk.ts`'s `NativeModuleSpecifier` to a real module). Map each `ITwilioClientBindings` method to REST/Media-Streams per §2.
- [ ] Outbound: `createCall` → REST `POST /Calls` with a TwiML `<Connect><Stream url="wss://<MJAPI>/telephony/twilio/media">`.
- [ ] Inbound: `acceptInbound` returns TwiML connecting the stream; `onStreamAudio`/`pushStreamAudio` bridge the WS.
- [ ] DTMF: `onDigits` from `<Gather>`/stream events; `playDigits` via REST. Transfer: `redirectCall` → REST update.

**(B) MJAPI ingress** — new router(s):
- [ ] `POST /telephony/twilio/voice` (inbound webhook) — carrier hits this on incoming call; resolves the dialed DID → `MJ: AI Bridge Agent Identities` (IdentityType `PhoneNumber`) → starts a session via `AIBridgeEngine.StartBridgeSession` with `Direction=Inbound`, `InboundCallId=<CallSid>`; returns TwiML.
- [ ] `WSS /telephony/twilio/media` — Media Streams socket; pumps frames into the active call's `onStreamAudio` callback and accepts `pushStreamAudio`. Mount as a public route (carrier can't send an MJ JWT) but **verify Twilio signatures** (`X-Twilio-Signature`) and a shared secret.
- [ ] Outbound trigger: a GraphQL mutation / Remote Operation `Telephony.PlaceCall(agentIdentityId, toNumber)` that calls `StartBridgeSession` with `Direction=Outbound`.

**(C) Config & credentials:**
- [ ] `mj.config.cjs` block: `telephony.twilio { accountSid, authToken | apiKeySid+apiKeySecret, streamPublicUrl, webhookSigningSecret }`. Resolve via MJ config/credential system — **never inline**. The native SDK reads these from session `Configuration` / provider config, not from the driver.

**(D) Tests:**
- [ ] **Unit (CI, no network):** extend `twilio-bridge.test.ts` style — `FakeTwilioCallSdk` already exists; add tests for the new `RealTwilioBindings` mapping logic using a mocked `twilio` client (assert REST payloads + WS frame mapping + signature verification). Keep network out.
- [ ] **Integration (credential-gated, `describe.skipIf(!env)`):** with real Twilio test credentials + a test DID, place an outbound call to a test number that auto-answers and echoes; assert the agent connected, exchanged audio, and the call ended cleanly. Document required env vars in the package README. These are **not** run in CI.
- [ ] **Manual runbook:** step-by-step to dial in to the DID and talk to the agent; mirror `../gemini-meeting-live-test-runbook.md` format.

**Acceptance (T1):** a real inbound call to the test DID reaches the pinned agent and holds a two-way voice conversation; an outbound `PlaceCall` mutation rings a real phone and connects the agent; unit tests pass in CI; integration tests pass locally with credentials.

### Phase T2 — Vonage (repeat with deltas)
- [ ] Same A/B/C/D as T1 against `IVonageClientBindings`. Deltas: Vonage uses **NCCO** (not TwiML), a **WebSocket `connect`** action for media, and the **Voice API** for `createCall`/`transferCall`. Endpoints: `POST /telephony/vonage/event` + `POST /telephony/vonage/answer` (returns NCCO) + `WSS /telephony/vonage/media`. Signature/JWT verification per Vonage.
- [ ] `optionalDependencies`: `@vonage/server-sdk`.
- [ ] **Acceptance:** same as T1 for Vonage.

### Phase T3 — RingCentral (repeat with deltas)
- [ ] Same pattern against `IRingCentralClientBindings`. Deltas: RingCentral **Call Control API** + its media stream; OAuth (JWT/3-legged) for auth; session-based vocabulary (`createSession/answerSession/dropSession/transferSession`). Endpoints under `/telephony/ringcentral/*`. Webhook validation via RingCentral validation token.
- [ ] `optionalDependencies`: `@ringcentral/sdk`.
- [ ] **Acceptance:** same as T1 for RingCentral.

### Phase T4 — Shared hardening
- [ ] Common ingress middleware: signature verification, idempotency on retried webhooks, structured logging of call lifecycle.
- [ ] Concurrency + cost guardrails (max concurrent calls per agent identity; reuse `SessionJanitor` for stuck calls).
- [ ] Observability: confirm each call produces an `AIAgentSession` + bridge + participant rows and a co-agent run (the engine already does this — verify with a real call).
- [ ] Update `metadata/ai-bridge-providers/` rows if any `Configuration` schema is added.

---

## 4. Test strategy summary

| Layer | Runs in CI? | What it covers | Pattern |
|---|---|---|---|
| Driver unit (existing) | ✅ | Bridge seam, capability gating, DTMF/transfer routing | `Fake*CallSdk` in `__tests__/` (already present) |
| Native-binding unit (new) | ✅ | REST payload shape, WS frame mapping, μ-law↔PCM transcode, signature verification | Mock the vendor SDK module; no network |
| Ingress unit (new) | ✅ | Webhook→session resolution, TwiML/NCCO generation, signature reject | Supertest against the Express router with mocked engine |
| Integration (new) | ❌ (credential-gated) | Real call places/answers, two-way audio, hangup | `describe.skipIf(!process.env.TWILIO_TEST_*)` |
| Manual runbook (new) | ❌ | Human dial-in/dial-out validation | Markdown runbook per provider |

---

## 5. Risks & gotchas

- **Audio transcoding is the subtle part.** μ-law/8kHz ↔ PCM16/16–24kHz must be correct and low-latency. Get T0's loopback test green before T1.
- **Real money + real numbers.** Integration tests dial real PSTN — use test numbers, cap spend, never run in CI.
- **Webhook reachability.** Carriers must reach MJAPI publicly (use `MJAPI_PUBLIC_URL` / ngrok in dev — see root CLAUDE.md). Document this.
- **Signature verification is mandatory** on every public carrier endpoint — these can't carry an MJ JWT.
- **`optionalDependencies` + dynamic import** is the sanctioned pattern here (CLAUDE rule 8, category 2). Declare the dep; comment the category.
- **Don't touch the drivers.** If you're editing `*-bridge.ts`, you're probably doing it wrong — the work lives in the native SDK + ingress.

---

## 6. Definition of done

- [ ] Twilio, Vonage, RingCentral each: real inbound call reaches the agent; outbound `PlaceCall` connects the agent; DTMF + transfer work.
- [ ] Native-binding + ingress unit tests pass in CI; integration tests pass locally with credentials; manual runbooks written.
- [ ] Credentials resolve via MJ config; vendor SDKs in `optionalDependencies`; no secrets in code.
- [ ] Each call yields the expected session/bridge/participant/run records.
- [ ] Touched packages build (`npm run build`) and unit tests pass (`npm run test`).
