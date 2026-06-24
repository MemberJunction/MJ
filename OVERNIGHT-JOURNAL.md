# Overnight Journal — Realtime Bridges & Public Widget Program

**Branch:** `claude/bridges-widget-impl` (local commits only — DO NOT push, no PR)
**Started:** 2026-06-24
**Operator:** Claude (autonomous overnight session)
**Plan:** `plans/realtime/bridges-and-widget/` (README + 3 work-stream docs)

---

## ⭐ Summary (read this first)

_Updated continuously. Newest status at the top of each phase section._

**Where things stand (updated through W0/M0/W1/W2/T0):**
- **W0 DONE** (empirical): D5 footgun confirmed — an unconstrained guest exposes all 17 active
  top-level agents as handoff targets. Constrained principal is mandatory.
- **M0 DONE**: Slack media bridge **NO-GO** (parked) with full evidence + re-eval triggers.
- **W2 DONE (entity)**: `MJ: Widget Instances` migration + CodeGen applied & committed; metadata
  seed (Widget Guest role + perms + example instance) authored & committed. Seed *push* + denied-
  RunView check blocked by the DB outage (below).
- **W1 DONE**: guest-session backend (`packages/MJServer/src/widget/`) — service + public router +
  pure core, **551/56-skip/0-fail** MJServer tests (incl. 21 new). Live curl Auth0-gated.
- **T0 DONE**: G.711 μ-law codec + PCM16 resampler in `ai-bridge-base`, 107 tests pass; P5 ruled
  out as a telephony blocker.
- **Next:** W3 (embeddable widget bundle) — the priority remaining piece; offline-buildable. Then
  T1 telephony native-SDK scaffolding, M1 Teams scaffolding (all offline + unit-tested).

**Review-first order (for tomorrow):**
1. `plans/realtime/bridges-and-widget/spikes/W0-findings.md` — the D5 confirmation that shapes W1/W2 (constrained principal is mandatory, not just pinning).
2. `plans/realtime/bridges-and-widget/spikes/M0-slack-media-findings.md` + the M0 gate added to `meeting-vendor-bindings-teams-slack.md` — Slack NO-GO with re-evaluation triggers.

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
| W3 | Embeddable bundle (text MVP) | TODO |
| W4 | Voice modality | TODO |
| W5 | Magic-link upgrade + host identity | TODO |
| W6 | Hardening & embed polish | TODO |
| T0 | Media-plane spike | ✅ DONE |
| T1 | Twilio end-to-end | TODO |
| T2 | Vonage | TODO |
| T3 | RingCentral | TODO |
| T4 | Telephony shared hardening | TODO |
| M0 | Slack media-access verification spike | ✅ DONE (NO-GO, parked) |
| M1 | Teams native SDK | TODO |
| M2 | Calendar + identity provisioners | TODO |
| M3 | Slack binding (gated on M0) | TODO |
| M4 | Meeting shared hardening | TODO |

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
_Status: TODO_

### W4 — Voice modality
_Status: TODO_

### W5 — Magic-link upgrade + host identity
_Status: TODO_

### W6 — Hardening & embed polish
_Status: TODO_

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
_Status: TODO_

### T2 — Vonage
_Status: TODO_

### T3 — RingCentral
_Status: TODO_

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
_Status: TODO_

### M2 — Calendar + identity provisioners
_Status: TODO_

### M3 — Slack binding
_Status: TODO_

### M4 — Meeting shared hardening
_Status: TODO_

---

## Open questions for the human

_(none yet)_

---

## Commits

_(local commits land on `claude/bridges-widget-impl`; listed here as they happen)_
