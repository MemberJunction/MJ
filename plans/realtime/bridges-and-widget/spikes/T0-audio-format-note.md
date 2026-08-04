# T0 — Telephony Audio-Format / Data-Flow Note

**Phase:** T0 (media-plane spike) of the telephony bridge program.
**Status:** Delivered. Pure-TS codec + resampler + unit tests landed in `@memberjunction/ai-bridge-base`; loopback test green.
**Scope:** Decide the end-to-end audio-format contract, document where transcode/resample happen and the per-model sample rates, and confirm the P5 (server-bridged media plane) question.

---

## 1. The audio-format contract (the decision)

| Boundary | Format on the wire | Owner of the conversion |
|---|---|---|
| **Carrier ↔ native SDK** | G.711 **μ-law @ 8 kHz mono** (Twilio Media Streams; most PSTN ingress. Some carriers also offer L16.) | The native SDK adapter (e.g. `RealTwilioBindings`) |
| **Native SDK ↔ bridge seam** (`ITelephonyCallSdk`) | **PCM16 `ArrayBuffer`** (linear, little-endian, mono) — model-agnostic | — (this is the stable contract) |
| **Bridge seam ↔ realtime model** | PCM16 at the **model's** rate (Gemini: 16 kHz up / 24 kHz down) | The realtime model driver / native SDK rate-match |

**Decision: the bridge seam always speaks PCM16 `ArrayBuffer`.** This matches `ITelephonyCallSdk.sendAudioFrame(pcm: ArrayBuffer)` / `onAudioFrame(cb: (pcm: ArrayBuffer) => void)` exactly (see `base-telephony-bridge.ts`). Everything carrier-specific — the μ-law companding and the 8 kHz↔model-rate resampling — lives **inside the native SDK adapter**, never in the driver and never in the engine. The driver (`BaseTelephonyBridge`) and the engine (`AIBridgeEngine`) stay codec-agnostic; they just shuttle PCM16 frames.

Why in the native SDK: it is the only layer that knows the carrier's true on-wire format (μ-law vs L16, frame size, endianness) and the negotiated model rate. Putting transcode there keeps the seam a single contract and lets each provider differ without touching shared code.

---

## 2. End-to-end data flow

```
INBOUND  (what the agent HEARS)
  Caller ──PSTN──► Carrier ──μ-law/8kHz frames──► [Native SDK adapter]
      muLawToPcm16()  →  resamplePcm16(8000 → 16000)  →  PCM16 ArrayBuffer
        └─► ITelephonyCallSdk.onAudioFrame(pcm) 
              └─► BaseTelephonyBridge wraps as BridgeMediaFrame {Track:'audio-in'}
                    └─► AIBridgeEngine.wireTransportSeam: bridge.OnMedia → session.SendInput(chunk,'audio')
                          └─► Realtime model (Gemini Live @ 16 kHz input)

OUTBOUND (what the agent SAYS)
  Realtime model emits PCM16 @ 24 kHz (Gemini output)
    └─► session.OnOutput(chunk) → AIBridgeEngine.wireTransportSeam → bridge.SendMedia('audio-out', frame)
          └─► BaseTelephonyBridge.SendMedia → ITelephonyCallSdk.sendAudioFrame(pcm)
                └─► [Native SDK adapter]
                      resamplePcm16(24000 → 8000)  →  pcm16ToMuLaw()  →  μ-law/8kHz frames
                        └─► Carrier ──PSTN──► Caller
```

The shaded `[Native SDK adapter]` steps are the only place codec/resample run. The two T0 modules deliver exactly those steps as pure, tested functions:

- `packages/AI/RealtimeBridge/Base/src/audio/g711.ts` — `muLawToPcm16` / `pcm16ToMuLaw` (+ `*Buffer` `ArrayBuffer` wrappers matching the seam frame type).
- `packages/AI/RealtimeBridge/Base/src/audio/resample.ts` — `resamplePcm16(input, fromRate, toRate)` (+ `resamplePcm16Buffer`).

Both are exported from `@memberjunction/ai-bridge-base` via `src/audio/index.ts` → `src/index.ts`. No re-export from any other package (CLAUDE rule 5).

---

## 3. Per-model sample rates

From the realtime client driver notes (`packages/AI/RealtimeClient/src/audio/`):

- **Gemini Live:** **16 kHz input** (mic capture is fixed at 16 kHz — see `micCapture.ts`: "captured fixed at 16 kHz") and **24 kHz output** (playback — see `pcmPlayback.ts`: "Gemini Live" / `24000`, and the test fixtures use `audio/pcm;rate=24000`). So the telephony adapter resamples **8 kHz → 16 kHz inbound** and **24 kHz → 8 kHz outbound** for a Gemini-backed agent.
- The PCM16 contract itself is rate-tagged at the boundary (`audio/pcm;rate=<n>`), and `pcmPlayback.ts` was deliberately generalized off Gemini's old 24-kHz-fixed engine so the rate is a driver-supplied parameter. Other realtime models that negotiate a different `agent_output_audio_format` rate just change the `toRate`/`fromRate` arguments to `resamplePcm16` — the codec is unchanged.

All conversions are integer-ratio for the telephony set (8 k / 16 k / 24 k), which linear interpolation handles cleanly.

### Resampler quality note
`resamplePcm16` uses **linear interpolation**. This is adequate for narrowband voice: the telephony band is ~300–3400 Hz, far below the 8 kHz Nyquist, so there is little high-frequency energy to alias on downsample or to (fail to) reconstruct on upsample, and it is cheap enough for per-frame real-time use. It is documented in the module that a band-limited (windowed-sinc / polyphase FIR) filter would go behind the same `resamplePcm16` signature if a future driver ever needs music-grade quality or aggressive ratios — callers would not change.

---

## 4. P5 conclusion (is a server-bridged media plane a hard blocker?)

**No — P5 is NOT a hard blocker for telephony.**

For telephony the **native SDK owns the carrier socket directly** (Twilio Media Streams WS terminates in the native SDK adapter, not in a separate MJ media-plane service). So the "server-bridged media plane / P5" question that meeting bridges raise does not gate telephony: the audio path is `carrier WS ↔ native SDK ↔ ITelephonyCallSdk seam`.

What telephony **does** require is that the bridge's media seam be wired to the realtime session — and it is. Verified in `packages/AI/RealtimeBridge/Server/src/ai-bridge-engine.ts` `wireTransportSeam(active)`:

- **Inbound:** `Bridge.OnMedia((frame) => … RealtimeSession.SendInput(chunk, 'audio'))` — the agent hears the caller.
- **Outbound:** `RealtimeSession.OnOutput((chunk) => Bridge.SendMedia('audio-out', …))` — the agent speaks into the call.

(The method also handles diarization speaker-stamping, video-in/out for video models, and barge-in interruption — none of which telephony needs, but they ride the same seam harmlessly.) So an attached telephony bridge gets its `SendInput`/`OnOutput` wired by the engine with no extra plumbing; the only remaining provider work is the native SDK (T1+) that converts μ-law/8 kHz ↔ PCM16/model-rate using the T0 primitives.

---

## 5. T0 acceptance — met

- ✅ **Written audio-format/data-flow note** — this file.
- ✅ **Passing loopback test** — `src/__tests__/g711.test.ts › T0 acceptance: synthetic μ-law loopback` pipes synthetic μ-law in → PCM16 (decode) → μ-law (encode) and asserts round-trip fidelity within μ-law bounds. Decode→encode is lossless for all 256 codes **except** the inherent G.711 negative-zero code `0x7F`, which collapses to positive-zero `0xFF` (linear PCM has a single zero) — documented in the test. A second test round-trips a 160-byte (20 ms @ 8 kHz) μ-law voice frame through the `ArrayBuffer` seam losslessly.
- ✅ Encode→decode fidelity also asserted for silence, ±full-scale, a value sweep, and a 440 Hz sine, within companded (magnitude-scaled) tolerance.
- ✅ Resampler tests: length scales by ratio (8 k→16 k doubles ±1, 16 k→8 k halves ±1, 8 k→24 k triples), DC stays constant, and an 8 k→16 k→8 k round-trip preserves a 300 Hz sine's shape.

**Test result:** `@memberjunction/ai-bridge-base` build clean; `npm run test` → **107 passed / 0 failed / 0 skipped** (7 files; 47 of the passing tests are the new g711 + resample suites).
