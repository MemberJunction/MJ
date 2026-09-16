---
"@memberjunction/ai": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ng-conversations": patch
---

feat(ai): a first-class realtime media plane, an open modality vocabulary, and per-model Gemini Live legality

Realtime sessions had no name for the media they carry. Every driver hardcoded audio-in and
audio-out, which is why a model that accepts live video had nowhere to put it and an avatar's video
output would have had nowhere either. `@memberjunction/ai` now models it: a **track** is one
directional stream of one modality, with direction as a property rather than a type (audio is
already bidirectional and video is becoming so), carrying its own consent requirement and usage
basis. `ResolveRequestedTracks` negotiates requested against supported, keeping an unsupported
request marked rather than dropping it so a caller falls back deliberately instead of wondering why
no samples arrive. `RealtimeSessionCapabilities` gains `SupportedInboundTracks` /
`SupportedOutboundTracks`, absent reading as "audio only" so existing drivers keep working while
declaring nothing, and `ModelConfiguration.Realtime` gains `RequestedTracks` as the request side.

Negotiation is what makes an expensive default a decision instead of an accident: an unrequested
track is never established, so omitting configuration cannot inherit a provider default. That is not
hypothetical — Gemini 3.8 Live's own turn coverage defaults to shipping every video frame, billed.

Modality is a **registered key** (`RealtimeModalityRegistry`, a `BaseSingleton`) rather than a closed
union, seeded with audio/video/image/text. A closed union would make every future modality a
`@memberjunction/ai` release; this mirrors `RealtimeTurnDetectionMode`'s `'native'` — a known core
with a deliberate open door. `BaseRealtimeChannelServer` gains `GetSourcedTracks()` /
`GetSunkTracks()`, both defaulting to `[]`, which is where the media and semantic planes meet: a
channel stays a tool surface, and declaring a sourced track additionally lets a model watch that
surface live. Declared in code rather than metadata for the same reason
`GetServerToolDefinitions()` is — whether a surface can produce frames is a property of the
implementation, not a deployment choice.

`@memberjunction/ai-gemini` gains a per-model Live capability table and applies it when minting a
session, because each of these rules fails at session mint when broken, upstream of all UI:
`enableAffectiveDialog` is dropped for the 3.8 family, which removed it (the SDK still declares the
field, since it remains valid for 3.1, so the guard has to be ours); `proactivity.proactiveAudio:
false` is dropped where proactive audio is permanently on, while `true` passes through;
`thinkingConfig` is omitted entirely for `gemini-3.8-live` as its model page instructs, and Extended
Thinking takes low/medium/high and refuses `minimal` with a warning rather than a dead session; and
turn coverage is now stated on every session rather than inherited. The facts live in a keyed data
table rather than `if (model === ...)` branching, so the table extends by adding a row. Deployment
metadata stays the authority and the table is the fallback, so a model whose catalog rows are
unseeded or stale still mints a working session; an unknown model resolves permissively rather than
turning a future model release into an outage, and the one thing it will not do is invent a thinking
level.

`@google/genai` converges on one major (v1 → ^2.8.0), which the v2 surface requires. Non-breaking for
the surface the realtime client uses.

`@memberjunction/ai-realtime-client` learns the per-model idle contract instead of assuming one. A
tool call no longer implies the model stopped: that is true when tools execute synchronously and false
under `NON_BLOCKING`, where the model keeps generating and keeps issuing calls. Conflating the two had
a concrete cost — the driver commits a held context note by sending a bare turn-complete, and on a
non-blocking model that lands on an active generation and cuts the reply off mid-sentence. The commit
is now deferred to a real idle point, `IsBusy` is computed from outstanding work (reasoning in
progress, tool batch non-empty, audio still playing) rather than from a single flag, and a backstop
timer unwedges a session whose idle frame never arrives. Parallel, duplicate and out-of-order tool
results go through the provider-agnostic `RealtimeToolBatchBarrier` rather than a second
implementation.

Model-authored reasoning summaries are surfaced as **narration**, never as assistant speech. Attributing
a model's scratch reasoning to it as an answer is worse than not showing it at all, so thought parts
(`Part.thought`) are excluded from audio synthesis entirely and emitted on the transcript stream with
`Kind: 'narration'`, which `@memberjunction/ai` now carries on `RealtimeTranscript`.
`@memberjunction/ng-conversations` renders them as their own card kind — a brain icon and "is
thinking…", with cancel, artifacts and run links suppressed, because a thought is not a delegated run
you can cancel or open.
