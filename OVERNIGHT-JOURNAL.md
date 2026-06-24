# Overnight Journal — Realtime Bridges & Public Widget Program

**Branch:** `claude/bridges-widget-impl` (local commits only — DO NOT push, no PR)
**Started:** 2026-06-24
**Operator:** Claude (autonomous overnight session)
**Plan:** `plans/realtime/bridges-and-widget/` (README + 3 work-stream docs)

---

## ⭐ Summary (read this first)

_Updated continuously. Newest status at the top of each phase section._

**Where things stand:**
- Read all four plan docs + CLAUDE.md; mapped the magic-link auth subsystem, ConversationsRuntime, and telephony bridges via parallel exploration.
- **W0 DONE** (empirically, on live DB): D5 footgun confirmed — a guest with no constrained principal would expose all 17 active top-level agents as handoff targets.
- **M0 DONE**: Slack media bridge is **NO-GO** (parked); thorough evidence chain recorded.
- Next: W2 migration (`MJ: Widget Instances`) → CodeGen → W1 backend.

**Review-first order (for tomorrow):**
1. `plans/realtime/bridges-and-widget/spikes/W0-findings.md` — the D5 confirmation that shapes W1/W2 (constrained principal is mandatory, not just pinning).
2. `plans/realtime/bridges-and-widget/spikes/M0-slack-media-findings.md` + the M0 gate added to `meeting-vendor-bindings-teams-slack.md` — Slack NO-GO with re-evaluation triggers.

**Hard blockers encountered:**
- **Auth0 / live MJAPI integration** — anticipated per mission; affects live acceptance curls (W1/W3) and credential-gated vendor integration tests (all of T1–T3, M1). Offline unit tests + ready-to-run integration tests are the mitigation. (Not yet hit; noted proactively.)
- `deep-research` skill unusable in sandbox (PreToolUse hook errors under `/bin/sh`: `set: Illegal option -o pipefail`). Worked around by running research via a general-purpose agent.

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
| W1 | Guest-session backend | TODO |
| W2 | Widget-instance metadata | TODO |
| W3 | Embeddable bundle (text MVP) | TODO |
| W4 | Voice modality | TODO |
| W5 | Magic-link upgrade + host identity | TODO |
| W6 | Hardening & embed polish | TODO |
| T0 | Media-plane spike | TODO |
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
_Status: TODO_

### W2 — Widget-instance metadata
_Status: TODO_

### W3 — Embeddable bundle (text MVP)
_Status: TODO_

### W4 — Voice modality
_Status: TODO_

### W5 — Magic-link upgrade + host identity
_Status: TODO_

### W6 — Hardening & embed polish
_Status: TODO_

### T0 — Media-plane spike
_Status: TODO_

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
