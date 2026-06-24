# Overnight Journal — Realtime Bridges & Public Widget Program

**Branch:** `claude/bridges-widget-impl` (local commits only — DO NOT push, no PR)
**Started:** 2026-06-24
**Operator:** Claude (autonomous overnight session)
**Plan:** `plans/realtime/bridges-and-widget/` (README + 3 work-stream docs)

---

## ⭐ Summary (read this first)

_Updated continuously. Newest status at the top of each phase section._

**Where things stand (final — W0–W6, T0–T4, M0–M4 all triaged):**
- **WIDGET (the priority) — text + voice complete offline.** W0 ✅ (D5 spike), W1 ✅ (guest-session
  backend), W2 ✅ entity+CodeGen (seed push DB-blocked), W3 ✅ (embeddable shadow-DOM bundle),
  W4 ✅ (voice + abuse ceilings), W5 ⚠ (host-passed identity DONE; magic-link upgrade documented),
  W6 ⚠ (most controls built into W1–W5; remainder documented in `spikes/W6-hardening-notes.md`).
  New pkg `@memberjunction/web-widget`: builds, **27 tests**, self-contained esbuild bundle.
- **TELEPHONY — all three vendors bound offline.** T0 ✅ (G.711 codec + resampler, 107 tests),
  T1 ✅ Twilio (67), T2 ✅ Vonage (72), T3 ✅ RingCentral (63) — native bindings + ingress, all
  reusing the T0 codec, drivers untouched. T4 (shared hardening) not started — mostly live-wiring.
- **MEETINGS** — M0 Slack **NO-GO/parked** ✅; M1 ⚠ Teams binding + Graph ingress (87 tests);
  M2 ⏳ calendar + identity provisioners (delegated, offline); M3 parked; M4 not started.
- **Everything labelled "live"/"creds-gated" is the credential/DB/Auth0-dependent activation layer
  (MJAPI routers, real vendor SDK wiring, integration tests) — code paths are complete + unit-tested,
  documented in the per-vendor `spikes/*-notes.md`, never faked.**

**Review-first order (for tomorrow):**
1. This phase board + the two hard blockers (DB outage, Auth0) — 2 min.
2. `packages/Web/Widget/` + `packages/MJServer/src/widget/` — the widget (priority); ~66 widget+host tests.
3. `plans/realtime/bridges-and-widget/spikes/` — every phase's findings/notes (the decision + blocker trail).
4. The vendor bindings: `packages/AI/RealtimeBridge/Providers/{Twilio,Vonage,RingCentral,Teams}/src/real-*-bindings.ts` + `*-ingress.ts` + `Base/src/audio/` (T0 codec).
5. `migrations/v5/V202606242115__*Widget_Instances.sql` + `metadata/{widget-instances,roles,entity-permissions}` (W2).

**Hard blockers encountered:**
- **🔴 DB outage (NEW, mid-session):** `sql-claude` became unreachable (DNS unresolved) after the
  W2 migration + CodeGen had been applied. Blocks: `mj sync push` (W2 seed verify), any further
  migrations/CodeGen, and re-running the W0 live spike. Everything migration/CodeGen-dependent was
  already done before the outage. All remaining planned work (W3/W4/T1+/M1) is offline code +
  unit tests and proceeds unaffected. **If the DB is restored, run:** `mj sync push --dir=metadata
  --include="roles,entity-permissions,widget-instances"` then verify the Widget Guest role denies a
  RunView on an out-of-scope entity.
- **Auth0 / live MJAPI integration** — anticipated per mission; affects live acceptance curls
  (W1/W3) and credential-gated vendor integration tests (T1–T3, M1). Mitigation: offline unit tests
  + ready-to-run integration tests; documented, never faked.
- `deep-research` skill unusable in sandbox (PreToolUse hook errors under `/bin/sh`:
  `set: Illegal option -o pipefail`). Worked around via a general-purpose agent.

---

## Environment verified

- DB: `sql-claude` / `MJ_Workbench` / schema `__mj` reachable via `sqlcmd ... -d MJ_Workbench`. Magic-link + bridge entities present.
- `mj` CLI global; node v24.18.0.
- Latest migration folder: `migrations/v5/`. Latest migration timestamp: `V202606231000`.
- `packages/Web` does not yet exist (new widget package will live here per plan: `packages/Web/Widget/`).
- Bridge providers present: Twilio, Vonage, RingCentral, Teams, Slack, Discord, GoogleMeet, LiveKit, Webex, Zoom.

---

## Phase status board

| Phase | Title | Status |
|---|---|---|
| W0 | Spike & guardrails | ✅ DONE |
| W1 | Guest-session backend | ✅ DONE (live curl Auth0-gated) |
| W2 | Widget-instance metadata | ✅ entity+CodeGen / ⚠ seed push DB-blocked |
| W3 | Embeddable bundle (text MVP) | ✅ DONE (live e2e Auth0-gated) |
| W4 | Voice modality | ✅ DONE (live voice Auth0/mic-gated) |
| W5 | Magic-link upgrade + host identity | ⚠ host-identity DONE / upgrade documented |
| W6 | Hardening & embed polish | ⚠ much built in W1–W5 / remainder documented |
| T0 | Media-plane spike | ✅ DONE |
| T1 | Twilio end-to-end | ⚠ binding+ingress DONE / live router creds-gated |
| T2 | Vonage | ⚠ binding+ingress DONE / live router creds-gated |
| T3 | RingCentral | ⚠ binding+ingress DONE / live router creds-gated |
| T4 | Telephony shared hardening | ⛔ not started (signature mw shared; rest live-wiring) |
| M0 | Slack media-access verification spike | ✅ DONE (NO-GO, parked) |
| M1 | Teams native SDK | ⚠ binding+ingress DONE / live join Azure-gated |
| M2 | Calendar + identity provisioners | ⏳ in progress (delegated, offline) |
| M3 | Slack binding (gated on M0) | ⛔ PARKED (M0 NO-GO) |
| M4 | Meeting shared hardening | ⛔ not started (depends on live meeting wiring) |

---

## Per-phase log

### W0 — Spike & guardrails
**Status: DONE** ✅ (acceptance met)

- Wrote a runnable spike (`spikes/w0-guest-guardrails-spike.ts`) that bootstraps the live SQL
  Server provider + `AIEngineBase` and reproduces the exact candidate-agent filter from
  `ConversationAgentRunner.processMessage` (lines 150-160).
- **Empirical result:** 43 agents total; 17 active top-level non-sub agents; a guest session
  (`currentUser === undefined`) would expose **all 17** as `ALL_AVAILABLE_AGENTS` handoff
  targets — including Skip, Database Designer, Codesmith, Agent Manager, Query Builder.
- **Finding:** pinning `explicitAgentId` is necessary but NOT sufficient (it fixes the entry
  agent, not the handoff list). The constrained guest principal + a support-scoped pinned agent
  are the real backstop. Carried into W1/W2 design. See `spikes/W0-findings.md`.
- Files: `spikes/w0-guest-guardrails-spike.ts`, `spikes/W0-findings.md`.
- Did NOT run a live LLM turn (no model spend; conclusion is a pure metadata/permission fact).
  The guest text-turn end-to-end is exercised in W3 acceptance (gated on Auth0/MJAPI boot).

### W1 — Guest-session backend
**Status: DONE** ✅ (offline build + unit tests; live curl acceptance is Auth0-gated — see below)

Implemented `packages/MJServer/src/widget/`, mirroring the magic-link architecture
(pure core + thin service + public router):
- **`widgetCore.ts`** (pure, DB-free, unit-tested): `parseAllowedOrigins`, fail-closed
  `isOriginAllowed`, `isModalityEnabled`, `evaluateWidgetMint`, and `buildWidgetGuestClaims`
  (reuses magic-link `buildSessionClaims` in anonymous mode + adds the additive `mj_widget_id`).
- **`WidgetSessionService.ts`**: `MintGuestSession` / `RefreshGuestSession` — resolves the widget
  by `PublicKey` (RunView under a system/Owner lookup user), enforces status + origin allowlist,
  resolves the guest role name, mints a short-lived RS256 guest JWT via `MagicLinkKeyManager`.
  **Direct-mint** (no MagicLinkInvite row — resolves widget doc open-Q #1); forensics ride
  `mj_sid` + best-effort structured audit logging.
- **`WidgetRouter.ts`**: public `POST /widget/session` + `/session/refresh`, IP rate-limited,
  enumeration-resistant status mapping (all client rejections → 403, only faults → 500).
  `ensureWidgetSigning` idempotently initializes the magic-link key + registers the `magic-link`
  auth provider so the widget validates tokens even if `magicLink.enabled` is false.
- **Config**: added `widget` block to `config.ts` (+ `WidgetConfig` type); reuses magic-link
  audience/issuer/JWKS by default. Mounted in `index.ts` before the auth middleware.
- **Claims**: extended `MagicLinkJWTClaims` with additive optional `mj_widget_id`.

Files touched: `widget/{widgetCore,WidgetSessionService,WidgetRouter,index}.ts`,
`__tests__/widget.test.ts`, `config.ts`, `index.ts`, `auth/magicLink/types.ts`.

**Build:** `@memberjunction/server` builds clean (`tsc && tsc-alias`).
**Tests:** full MJServer suite **551 passed / 56 skipped / 0 failed** (incl. 21 new widget tests:
origin allowlist, modality gating, mint eligibility, claims shape, RS256 sign+verify roundtrip,
tamper rejection).

**Acceptance status:**
- ✅ Pure mint logic + claims + RS256 roundtrip verified by unit tests.
- ⛔ **Live `curl POST /widget/session` → validated by auth middleware → constrained UserInfo**
  is **BLOCKED on Auth0/MJAPI boot** (mission-noted gap; `AUTH0_*` unset). The code path is
  complete and the magic-link anonymous synthesis it reuses is already production-tested; the
  end-to-end curl is ready to run once MJAPI boots with `widget.enabled=true` + `magicLink`
  signing configured. Documented, not faked.

### W2 — Widget-instance metadata
**Status: DONE (code) / PARTIAL (seed push blocked by DB outage)**

- **Migration** `migrations/v5/V202606242115__v5.43.x__Widget_Instances.sql` creates the
  `WidgetInstance` table → entity **`MJ: Widget Instances`** (`MJWidgetInstanceEntity`).
  Columns: Name, PublicKey (unique), ApplicationID/PinnedAgentID/GuestRoleID (FKs),
  AllowedOrigins (JSON), Modality (Text/Voice/Both), AuthStrategy (D1), Status,
  SessionTTLMinutes, RateLimitPerMinute, VoiceMaxSessionMinutes. Followed migrations/CLAUDE.md
  (hardcoded no FK indexes, sp_addextendedproperty on every column, no __mj_ timestamps).
- **Migration applied + CodeGen run** successfully (while DB was up): entity subclass, server
  resolvers, Angular forms generated; MJCoreEntities builds clean. Committed.
- **Decision (open-Q #3):** new entity, not magic-link reuse — durable per-deployment config vs.
  ephemeral per-token invites. Documented in the migration header.
- **Metadata seed** (committed, ready): Widget Guest restricted role + entity permissions
  (read/create/update on `MJ: Conversations` + `MJ: Conversation Details` only, no delete) +
  one example widget instance (Chat app / Sage / Widget Guest / localhost origins). Pull filters
  widened to include Widget Guest.
- ⛔ **`mj sync push` + the "denied RunView" acceptance check are BLOCKED**: `sql-claude` became
  unreachable (DNS unresolved) after the migration+CodeGen step. Files are authored/valid and
  ready to push when the DB returns.
- **Caveat for the human (cross-guest isolation):** all anonymous guests share the seeded
  Anonymous principal (same UserID), so a per-UserID RLS filter would NOT isolate one guest's
  Conversation from another's. The Widget Guest role satisfies "cannot read arbitrary entities,"
  but per-session conversation isolation (RLS keyed on `mj_sid`/conversation ownership) is a
  genuine **W6 hardening** item — flagged, not silently assumed.

### W3 — Embeddable bundle (text MVP)
**Status: DONE** ✅ (offline build/test/bundle; live end-to-end MJAPI/Auth0-gated)

New package **`@memberjunction/web-widget`** at `packages/Web/Widget/` (added `packages/Web/*` to
root workspaces; `npm install` run to wire symlinks):
- **`<mj-support-widget>`** custom element — shadow DOM + `all: initial` isolation; `--mj-chat-*`
  design tokens injected into the **shadow root** (never `<head>`); launcher/panel/transcript/
  composer; ARIA roles + keyboard (Enter send / Esc close). No hardcoded-color rules (all tokens).
- **`WidgetSessionClient`** — mints/refreshes the guest JWT via `POST /widget/session`; injectable
  fetch; refresh-lead math.
- **`IWidgetTransport`** seam → **`RuntimeWidgetTransport`** (prod): reuses
  `setupGraphQLClient(guest token)` + `ConversationsRuntime.AgentRunner.processMessage` **always
  passing the pinned `explicitAgentId`** (D5); confirms **open-Q #2** — `GraphQLDataProvider` runs
  fine outside Angular, no slimmer client needed. **`MockWidgetTransport`** for tests/offline.
- **`loader`** — `data-widget-key`/`data-api-url` bootstrap, notification adapter routed into the
  widget transcript, token-refresh scheduling.
- **Examples**: `blank-host.html` (one mount div + one `<script>`, with hostile host CSS to prove
  isolation) + `offline-demo.html`; **README** documents embed/auth/security/build.

**Build:** clean (tsc). **Tests:** **15 passed** (vitest + jsdom) — mint/refresh + field validation,
shadow-DOM style isolation (asserts no leak into `document.head`), launcher open, send→user+agent
bubbles, **pinned-agent pass-through (D5)**, no-transport system message, loader mount + refresh
scheduling. **Bundle:** `npm run bundle` (esbuild) produces a self-contained browser ESM with **no
unresolved node built-ins** (~2.9 MB minified — tree-shaking/code-splitting is W6).

**Acceptance status:**
- ✅ Shadow-DOM isolation verified by unit test; embed contract (1 div + 1 script) demonstrated.
- ✅ Self-contained bundle builds.
- ⛔ Live `blank-host.html` → mint → real text turn is **MJAPI/Auth0-gated** (needs MJAPI booted with
  `widget.enabled=true`). Code path complete + ready; offline demo exercises the full UI via the mock.

**Decisions noted:** vanilla custom element (no Lit) for zero-dependency isolation (open-Q #4);
new entity over magic-link reuse (open-Q #3, in W2); direct-mint guest (open-Q #1, in W1).

### W4 — Voice modality
**Status: DONE** ✅ (offline build/test; live voice MJAPI/Auth0 + mic gated)

Added the voice surface to `@memberjunction/web-widget`, reusing
`@memberjunction/ai-realtime-client` verbatim (no new driver):
- **`VoiceAbuseGuard`** (pure, the public-safety control the plan stresses): per-session
  max-minutes + output-token cost ceiling; the controller polls it and aborts cleanly.
- **`IVoiceController`** seam → **`RealtimeVoiceController`** (prod): injected mint →
  `MJGlobal.Instance.ClassFactory.CreateInstance(BaseRealtimeClient, provider)` → `getUserMedia`
  → `Connect`; wires `OnTranscript/OnStateChange/OnUsage/OnError`; mic teardown on stop/abort.
  **`MockVoiceController`** for tests.
- **`guest-voice-mint`**: live `StartRealtimeClientSession` mutation for the **pinned** agent,
  mapped to `ClientRealtimeSessionConfig` exactly like Explorer's `buildClientConfig`.
- **Element**: modality-gated 🎤 button (Voice/Both only), start/stop toggle, final transcripts
  rendered as messages, voice-state progress line, abuse aborts surfaced as system messages.
- **loader** wires the controller for voice-enabled instances (injectable factory for tests).

**Build:** clean. **Tests:** **27 passed** total (12 new: guard ceilings incl. cost+time, mic-button
modality gating, start/stop, transcript render, abuse-abort surfacing). Bundle still self-contained.
**Acceptance:** ⛔ live two-way voice needs MJAPI realtime mint + mic permission (Auth0/MJAPI-gated);
✅ the abuse ceilings (the "biggest cost/abuse surface" control) are unit-tested; offline demo covers UX.

### W5 — Magic-link upgrade + host identity
**Status: PARTIAL — host-passed identity (D1) DONE; magic-link upgrade designed, not built**

- **Host-passed identity (DONE, tested):** `packages/MJServer/src/widget/host-identity.ts` — pure
  `verifyHostAssertion` (RS256, audience=widget key, fail-closed) + `extractHostIdentity`.
  `WidgetSessionService` requires a valid host assertion for `AuthStrategy='HostIdentity'` widgets
  (verified against a config-registered host key keyed by `PublicKey`), else `host_assertion_invalid`.
  `buildWidgetGuestClaims` folds the host identity into **informational** claims
  (`given_name`/`family_name`/additive `mj_host_email`) while the principal-resolving `email`/`sub`
  STAY the shared Anonymous principal — **a host cannot escalate a guest into a real account.**
  Converges on the same magic-link validation path (host-identity is a mint-time strategy, not a
  second session-validation provider — noted interpretation of the plan).
  **Tests:** 9 new (valid/missing/no-key/bad-sig/wrong-aud/expired/no-email + claims folding).
  Full MJServer suite **560 passed / 0 failed**.
- **Config:** `widget.hostPublicKeys` interim store. _Follow-up:_ a per-instance `HostPublicKey`
  column on `WidgetInstance` (pending a migration — DB down).
- **Magic-link upgrade (NOT built — documented):** the plan's "verify it's you → /magic-link/create
  → swap token" can't use `/magic-link/create` directly because that endpoint is **authenticated**
  (a guest can't call it). It needs a dedicated **guest-scoped `POST /widget/upgrade`** that mints an
  email magic-link on the guest session's behalf, plus the email redeem round-trip (live/Auth0-gated)
  to deliver the verified token back (poll or postMessage) for `transport.UpdateToken`. Designed,
  not implemented — honest gap for tomorrow.

### W6 — Hardening & embed polish
**Status: PARTIAL (much built into W1–W5; remainder documented)**

Several W6 controls already shipped inside earlier phases: origin allowlist (fail-closed,
W1), IP rate-limiting (W1), enumeration-resistant 403s (W1), short-TTL tokens + refresh (W3),
voice abuse ceilings (W4), fail-closed host-identity (W5), ARIA/keyboard (W3/W4), README +
examples (W3). Full per-item status + the cross-cutting hardening backlog is in
`spikes/W6-hardening-notes.md`. **Top remaining item (flagged 🔴):** cross-guest conversation
isolation — guests share the Anonymous principal, so per-UserID RLS won't isolate one guest's
conversation from another's; needs an `mj_sid`/ownership-keyed RLS filter before public deploy.
Other tracked items: per-instance rate limit, host-key-per-instance column, bundle-size
reduction, a dedicated widget-session audit entity, server-side voice cost ceiling plumbing.

### T0 — Media-plane spike
**Status: DONE** ✅

- Added the shared transcode primitive to `@memberjunction/ai-bridge-base`:
  `src/audio/g711.ts` (ITU-T G.711 μ-law codec + ArrayBuffer wrappers matching the
  `ITelephonyCallSdk` PCM16 seam) and `src/audio/resample.ts` (linear PCM16 resampler for
  8k/16k/24k). Exported via the base `index.ts` (no cross-package re-export).
- **47 new unit tests** (round-trip fidelity within G.711 bounds, ITU known vectors, rate
  scaling, DC preservation) incl. the explicit T0 acceptance loopback (μ-law → PCM16 → μ-law).
  A real bug was caught+fixed (CLIP must be 32635, not 0x7FFF, or the top μ-law segment overflows).
- **Build:** `@memberjunction/ai-bridge-base` clean. **Tests:** 107 passed / 0 failed (7 files).
- **Audio-format note** `spikes/T0-audio-format-note.md`: carrier μ-law/8k ↔ bridge-seam PCM16 ↔
  model 16k/24k; transcode owned by the native SDK; **P5 (server-bridged media plane) confirmed
  NOT a hard blocker** for telephony (native SDK owns the carrier socket; `wireTransportSeam` in
  `ai-bridge-engine.ts` already wires the realtime session SendInput/OnOutput).

### T1 — Twilio end-to-end
**Status: PARTIAL — offline binding+ingress DONE; live MJAPI router + integration creds-gated**

- **`RealTwilioBindings`** implements `ITwilioClientBindings` over injected SDK-free surfaces
  (`ITwilioRestLike` + `ITwilioMediaPump`): `createCall`→REST POST /Calls with `<Connect><Stream>`
  TwiML; `completeCall`/`redirectCall`/`playDigits`→REST update; `pushStreamAudio`/`onStreamAudio`→
  Media-Streams frames **transcoded base64-μ-law↔PCM16 strictly via the T0 codec**. All TwiML +
  frame logic in pure exported helpers. **No driver files touched** (work is in the native SDK).
- **`twilio-ingress`** (pure, framework-free): `verifyTwilioSignature` (HMAC-SHA1, constant-time),
  inbound voice TwiML, webhook→`{callSid,from,to}` mapper — ready for the MJAPI router to call verbatim.
- `twilio` declared in `optionalDependencies` (never statically imported; rule 8 cat 2). _(Fixed a
  JSON hazard from the sub-agent: a `"//"` comment key inside `optionalDependencies` would make npm
  try to install a package named `//` — moved it to a top-level `"//optionalDependencies"` key.)_
- **Build:** clean. **Tests:** **67 passed** (27 new bindings+ingress; 40 pre-existing kept green).
- ⛔ **BLOCKED on real Twilio creds + public URL + DB:** the live MJAPI Express `POST
  /telephony/twilio/voice` + `WSS /telephony/twilio/media` router, the `Telephony.PlaceCall` mutation
  (needs CodeGen + DID→agent-identity lookup), credential-gated integration tests, and the
  `telephony.twilio` config schema. All specified in `spikes/T1-twilio-ingress-notes.md`.

### T2 — Vonage
**Status: PARTIAL — offline binding + ingress DONE; live router creds-gated**

- `RealVonageBindings` over injected SDK-free surfaces; **NCCO `connect`-websocket** action (not
  TwiML), Voice API for create/hangup/transfer/DTMF, media `{event:'media',payload}` (`close`=end).
- `vonage-ingress`: `verifyVonageSignature` (HMAC-SHA256) + `verifyVonageJwt` (HS256) + NCCO answer
  builder. μ-law↔PCM16 via the T0 codec. `@vonage/server-sdk` optionalDep (never imported).
- **Build:** clean. **Tests:** 72 passed (33 new). Driver untouched.
- ⛔ Live MJAPI `POST /telephony/vonage/answer|event` + `WSS /media` + PlaceCall + integration:
  creds/DB-gated. See `spikes/T2-T3-vonage-ringcentral-notes.md`.

### T3 — RingCentral
**Status: PARTIAL — offline binding + ingress DONE; live router creds-gated**

- `RealRingCentralBindings` over injected surfaces; **Call-Control session vocab**
  (createSession/answerParty/dropSession/transferParty), create-session payload, media
  `{event:'media',media:{data}}` (`stop`=end).
- `ringcentral-ingress`: validation-token registration handshake + constant-time verification-token
  check. μ-law↔PCM16 via the T0 codec. `@ringcentral/sdk` optionalDep (never imported).
- **Build:** clean. **Tests:** 63 passed (24 new). Driver untouched.
- ⛔ Live MJAPI routers + PlaceCall + OAuth token lifecycle + integration: creds/DB-gated. Same notes file.

### T4 — Telephony shared hardening
_Status: TODO_

### M0 — Slack media-access verification spike
**Status: DONE** ✅ — **Verdict: NO-GO (Slack parked).**

- Investigated whether Slack exposes a supported bot-join-with-media path for huddles. It does not.
- Evidence: `calls.*` API is UI call-registration only ("Slack doesn't make the call"); the only
  huddle primitive is the signaling-only `user_huddle_changed` event; huddle media runs on a
  private Amazon Chime SDK backend Slack does not expose; commercial recorders (Recall.ai) use
  desktop system-audio capture in a logged-in human session, not a Slack API.
- Recorded the go/no-go gate in `meeting-vendor-bindings-teams-slack.md` §M0 and full evidence +
  re-evaluation triggers in `spikes/M0-slack-media-findings.md`.
- Action: M3 stays closed. Slack provider row should be `Status='Disabled'` (metadata change —
  see M-phase notes). Driver scaffold remains valid + unit-tested; not deleted.

### M1 — Teams native SDK
**Status: PARTIAL — offline binding + Graph ingress DONE; live join Azure/creds-gated**

- **`RealTeamsBindings`** implements `ITeamsMeetingSdk` over injected SDK-free surfaces
  (`IGraphCallsLike` control plane + `IAcsMediaLike` audio plane): `join`→Graph create-call,
  roster/chat/mute/hangup→Graph, audio in/out→ACS sockets transcoded via the **T0 resampler**,
  `onHandRaise` absence explicitly tolerated (won't throw on tenants lacking it). Join-payload
  build, Teams `meetup-join` URL/coordinate parse, and roster normalization are pure functions.
- **`teams-ingress`** (pure): `validateGraphNotification` (validation-token + constant-time
  clientState handshake), `parseCallNotification`, `buildJoinByUrlRequest` — MJAPI-ready.
- `@microsoft/microsoft-graph-client` + `@azure/communication-call-automation` in
  `optionalDependencies` (never statically imported). **Driver + its tests untouched.**
- **Build:** clean. **Tests:** **87 passed** (42 new). P5 confirmed NOT a blocker
  (`wireTransportSeam` already covers media once a binding is injected).
- ⛔ **Blocked on Azure/Teams creds + DB:** AAD app registration + cloud-communications/chat admin
  consent, public `POST /meetings/teams/notifications` webhook, live ACS media socket, the
  `Meeting.JoinByUrl` mutation (needs CodeGen), integration tests. See `spikes/M1-teams-binding-notes.md`.

### M2 — Calendar + identity provisioners
**Status: IN PROGRESS (delegated, offline) — see end-of-run note**

Implementing `GraphCalendarSource`/`GoogleCalendarSource.ListUpcomingInvites` + the identity
provisioner over injected SDK-free surfaces with unit tests, in `RealtimeBridge/Server`. Live
scheduler hooks (`CalendarWatcher.Sweep`, `ScheduledBridgeRunner.RunDueBridges`, orphan janitor) +
real Graph/Google tenant creds remain gated. _(Status finalized below once the build/test verify lands.)_

### M3 — Slack binding
**Status: PARKED** ⛔ — gated by M0 (NO-GO). Driver scaffold stays valid + unit-tested; do not build
until Slack ships a supported huddle media path (re-eval triggers in `spikes/M0-slack-media-findings.md`).
When parking is confirmed in the DB, set the Slack provider row `Status='Disabled'` (metadata; DB down now).

### M4 — Meeting shared hardening
**Status: NOT STARTED** ⛔ — Meeting Controls channel end-to-end, multi-node room-state affinity, and
recording governance all depend on the live meeting wiring (M1 activation) being in place first. No
offline-completable slice without that. Deferred.

---

## Open questions for the human

1. **Cross-guest conversation isolation (🔴 must-resolve before public deploy).** Anonymous guests
   share the seeded Anonymous principal, so per-UserID RLS won't isolate one guest's conversation from
   another's. What's the intended isolation key — per-session `mj_sid`, or a forge-proof owner column
   set at conversation create? This needs a metadata RLS filter design. (See `spikes/W6-hardening-notes.md` #1.)
2. **Magic-link upgrade endpoint.** `/magic-link/create` is authenticated, so a guest can't call it.
   OK to add a guest-scoped `POST /widget/upgrade` that mints an email magic-link on the guest session's
   behalf (scoped to the widget's app/role)? That's the missing piece for W5's upgrade path.
3. **Host public key storage.** W5 reads host-identity keys from `widget.hostPublicKeys` config (interim).
   Confirm adding a `HostPublicKey` column to `WidgetInstance` (a migration) for per-instance keys + rotation.
4. **Widget bundle size.** ~2.9 MB minified (full runtime + GraphQL provider). Acceptable to invest in
   code-splitting the voice path + tree-shaking, or ship as-is for v1?
5. **Pinned support agent for the example widget.** The seed uses `Sage` (general assistant) as a
   placeholder. Which agent should be the real support-scoped pinned agent (with a least-privilege tool set)?

---

## Commits (on `claude/bridges-widget-impl`, local only — not pushed)

In order: W0+M0 docs → W2 entity (migration+CodeGen) → W1 backend → T0 codec → W2 seed → journal →
W3 widget bundle → journal → W4 voice → T1 Twilio → journal → W5 host-identity → M1 Teams → journal →
W6 notes → T2+T3 Vonage/RingCentral → journal. (M2 pending verify at end of run.) Run `git log --oneline`
on the branch for the full list. Every code commit states its build + test results in the message.

## Test totals (offline, all green)

- `@memberjunction/web-widget`: 27 · `@memberjunction/server` (incl. widget+host-identity): 560 ·
  `ai-bridge-base` (incl. T0): 107 · Twilio: 67 · Vonage: 72 · RingCentral: 63 · Teams: 87.
  (M2 / RealtimeBridge-Server totals appended after verify.)
