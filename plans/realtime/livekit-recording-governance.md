# Governed Recording for Realtime Sessions — Plan

**Status:** Plan / RFC. Folded into the LiveKit room UX stack (PR #2860) as the recording roadmap.
**Related:** `@memberjunction/livekit-room-server` (`LiveKitEgressService`), `RealtimeBridgeResolver`,
`GraphQLLiveKitClient`, `@memberjunction/ng-livekit-room` (`ShowRecordingControl`),
`@memberjunction/ng-mj-livekit-room` (`EnableRecording`).

---

## 1. Goal

Make recording of realtime sessions a **first-class, governed capability** — audio *and* video — gated by a
**multi-layer chain** (component prop → MJ-level policy enforced server-side → consent), rather than a
single client prop. Today PR #2860 ships **cloud composite egress** with a UI prop + a server resolver;
this plan turns that into a properly governed, consented, extensible feature.

## 2. What exists today (baseline)

- **Cloud egress (built):** `LiveKitEgressService.StartRoomRecording` / `StopRecording` (room composite
  MP4) via `livekit-server-sdk`, exposed through `StartLiveKitRecording` / `StopLiveKitRecording`
  (`RealtimeBridgeResolver`) and `GraphQLLiveKitClient`. UI record button gated by `EnableRecording`
  (MJ binding) → `ShowRecordingControl` (generic component) → `ToggleRecording` output.
- **Gap:** the only gate is the client prop; the resolver checks *authentication* but not a **recording
  policy**. No consent signaling. No per-participant/track or RTMP outputs. No coverage for the
  **client-direct** (non-LiveKit) realtime voice sessions.

## 3. The gating chain (design)

Recording must be authorized at the point of action, **server-side**, by resolving a layered policy. A
client prop only controls whether the *affordance* is shown — never whether recording is *allowed*.

```
UI affordance      ShowRecordingControl / EnableRecording   (cosmetic gate only)
        │
        ▼
Server policy      resolveRecordingPolicy(user, app, room)  ← AUTHORITATIVE, enforced in the resolver
   resolution      = system default → app/tenant override → role → per-user
        │            yields: 'forbidden' | 'allowed' | 'required'
        ▼
Consent            broadcast 'lk-recording' data-channel signal; all clients show "● Recording";
                   optional explicit acknowledgment in policy-sensitive deployments
        ▼
Egress             LiveKitEgressService starts (composite / per-participant / RTMP)
```

### Policy storage
- **System / app / tenant** policy via an MJ setting key, e.g. `mj.realtime.recording.policy` (values
  `forbidden` / `allowed` / `required`), with an app-scoped override. (Confirm whether to use a system
  settings table, an app config, or a dedicated `MJ: Recording Policies` entity — decide in the design
  spike; prefer reusing existing settings infrastructure over a new entity.)
- **Per-user** preference via `UserInfoEngine` (e.g. opt-out where policy allows).
- Resolution is **most-specific-wins** with `forbidden` always able to veto downward (a tenant that forbids
  cannot be overridden by a user pref).

### Enforcement point
`RealtimeBridgeResolver.StartLiveKitRecording` calls a new `RecordingPolicyService.Resolve({ user, appId,
roomName })` **before** invoking egress; returns a clear error when `forbidden`. Never trust the client.

## 4. Consent & compliance

- On start, publish a `lk-recording` data-channel message `{ active: true, by, startedAt }`; the room UI
  renders a persistent "● Recording" banner (already have the data-channel + banner patterns).
- On stop, publish `{ active: false }`.
- Optional **hard consent**: in `required`/sensitive modes, a participant must acknowledge before their
  media is captured (gate publish or show a blocking modal) — deployment-configurable.
- Persist a **recording audit record** (who started/stopped, room, egress id, time) — likely a new entity
  `MJ: Realtime Session Recordings` (decide in spike) linked to the agent session bridge.

## 5. Media coverage

- **Composite (built):** one mixed A/V MP4 per room.
- **Per-participant / per-track egress:** add `LiveKitEgressService.StartParticipantEgress(...)` (separate
  files per participant) — same client, different egress call. Useful for transcription/diarization.
- **RTMP / stream egress:** add `StartStreamEgress(rtmpUrl)` for live restreaming.
- All behind the same policy gate.

## 6. Client-direct realtime sessions (phase 2)

The voice co-agent sessions (PR #2787) are **browser ↔ model**, not LiveKit — no SFU/egress. Options:
- **Server-side capture** at the realtime-model session boundary (the `IRealtimeSession` already sees
  input/output audio chunks; tee them to an encoder/storage). Cleanest, server-authoritative.
- **Client-side `MediaRecorder`** of the mixed local/agent audio → upload. Simpler but client-trust + only
  captures what the client has.
- Transcripts/usage already persist via `AIPromptRun`; media is the new part.
Scope phase 2 after the LiveKit policy layer + consent are proven.

## 7. Phasing

1. **Policy + consent on LiveKit (server-enforced):** `RecordingPolicyService` + resolver enforcement +
   `lk-recording` consent signal + audit record. UI shows the banner. (Highest value — closes the trust gap.)
2. **Media breadth:** per-participant + RTMP egress options behind the gate.
3. **Client-direct capture:** server-side tee of `IRealtimeSession` audio (preferred) for non-LiveKit
   realtime sessions.
4. **Admin UX:** surface the policy + audit records in Explorer (settings + a recordings list).

## 8. Open questions for the design spike

- Where does the policy live — existing system/app settings vs. a dedicated entity? (Prefer existing.)
- Retention / storage location ownership (LiveKit project egress config vs. MJ-managed storage + lifecycle).
- Legal/consent defaults per deployment (one-party vs. all-party jurisdictions) — make `required`-consent
  the safe default where unset.
- Egress cost controls (auto-stop on empty room, max duration).

## 9. Deliverables

`RecordingPolicyService` (+ tests), resolver enforcement, consent signal + banner wiring, audit entity +
migration, per-participant/RTMP egress methods, the client-direct phase-2 capture, and an Explorer admin
surface. Each phase its own PR; phase 1 lands first.
