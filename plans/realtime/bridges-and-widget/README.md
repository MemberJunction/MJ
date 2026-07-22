# Agent Bridges & Public Widget — Execution Program

**Status:** Planning complete, ready for execution
**Owner:** _(assign tech fellow)_
**Branch:** `claude/agent-architecture-bridges-mtqsnw` (develop here; do not push to `next`)
**Audience:** A tech fellow driving a future Claude Code session. Each work-stream doc is written to be executed largely top-to-bottom with acceptance criteria you can verify.

---

## 1. Why this program exists

MemberJunction already has a **unified realtime agent architecture**: one agent, one session-prep producer, one tool broker, one identity-framing function, one narration engine. Every endpoint (Explorer voice, LiveKit, Zoom, Teams, telephony, a future web widget) is meant to be a **coupler/bridge** onto that single pathway — never a re-implementation.

The architecture is built and tested. What remains is **finishing the edges**:

1. **Public web widget** — a droppable, embeddable customer-support surface (text **and** voice) that reuses `conversations-runtime` + the realtime client stack, with a **pluggable public-auth** model (anonymous guest + magic-link upgrade + host-passed identity).
2. **Vendor SDK bindings** — the bridge drivers are code-complete and unit-tested against in-memory fakes; production needs the **real vendor clients** wired behind the already-stubbed seams, plus the inbound webhook/media-stream infrastructure and integration tests. **Telephony first** (Twilio, Vonage, RingCentral), then **Teams + Slack**.

> **Read first:** [`../realtime-bridges-architecture.md`](../realtime-bridges-architecture.md) (canonical bridge design) and [`../../../guides/REALTIME_CO_AGENTS_GUIDE.md`](../../../guides/REALTIME_CO_AGENTS_GUIDE.md), [`../../../guides/REALTIME_BRIDGES_GUIDE.md`](../../../guides/REALTIME_BRIDGES_GUIDE.md), [`../../../guides/CONVERSATIONS_UX_STACK_GUIDE.md`](../../../guides/CONVERSATIONS_UX_STACK_GUIDE.md), [`../../../guides/MAGIC_LINK_GUIDE.md`](../../../guides/MAGIC_LINK_GUIDE.md). This program assumes that context.

---

## 2. The one pathway (do not fork it)

Every doc in this program plugs into the **same** seams. If you find yourself re-implementing any of these, stop — you're drifting.

| Concern | Single source of truth | File |
|---|---|---|
| Session prep (model+prompt+tools+voice+memory) | `RealtimeClientSessionService.PrepareClientSession` | `packages/AI/Agents/src/realtime/realtime-client-session-service.ts` |
| Tool execution (both topologies) | `RealtimeToolBroker` | `packages/AI/Agents/src/realtime/realtime-tool-broker.ts` |
| Agent dispatch (text) | `ConversationsRuntime.Instance.AgentRunner.processMessage` | `packages/ConversationsRuntime/src/agent-runner/ConversationAgentRunner.ts` |
| Default-agent resolution | `DefaultAgentResolver.resolve` | `packages/ConversationsRuntime/src/default-agent/DefaultAgentResolver.ts` |
| Bridge media transport seam | `bridge.OnMedia → session.SendInput` / `session.OnOutput → bridge.SendMedia` | `packages/AI/RealtimeBridge/Server/src/ai-bridge-engine.ts` |
| Bridge driver contract | `BaseRealtimeBridge` / `BaseTelephonyBridge` | `packages/AI/RealtimeBridge/Base/src/` |
| Public/guest auth | Magic-link `anonymous-embed` path + `AuthProviderFactory` | `packages/MJServer/src/auth/magicLink/`, `packages/AuthProviders/src/` |

---

## 3. Decisions (locked for this program)

These were decided up front. Alternatives are recorded so a future owner can revisit with eyes open.

| # | Decision | Chosen | Alternatives considered | Rationale |
|---|---|---|---|---|
| D1 | **Widget auth model** | **Pluggable**: anonymous guest **default**, magic-link **upgrade**, host-passed signed identity **supported** | Magic-link required up front; host-passed only | A "drop on any site" widget can't gate every visitor behind email. Guest-first maximizes conversion; magic-link is the *escalation* path (verify identity to pull up an account); host-passed covers authenticated portals. The magic-link `anonymous-embed` Kind already exists — reuse it. |
| D2 | **Widget MVP modality** | **Text + voice together** | Text-first; voice-first | The unified core gives voice for ~the same auth/embed work. Ship both, but test surfaces are doubled — budget for it. |
| D3 | **Vendor binding scope, this push** | **All telephony** (Twilio, Vonage, RingCentral) now; **Teams + Slack** next tier | Twilio+LiveKit first; everything | Telephony shares one base (`BaseTelephonyBridge`) — proving Twilio makes Vonage/RingCentral near-repeats. Teams/Slack are higher-effort (entitlements, undocumented APIs). |
| D4 | **Deliverable** | **Detailed `/plans` markdown docs** on the feature branch | Spec-kit; GitHub issues | Self-contained, executable by a future Claude session, version-controlled with the code. |
| D5 | **Guest principal safety** | Guest sessions run under a **constrained server-side principal + pinned support agent** | Rely on runtime's "no user ⇒ unfiltered agents" graceful path | The runtime degrades to an *unfiltered* agent list when no user is present — the **opposite** of what a public endpoint wants. Must pin the agent and scope the principal. See widget doc §4. |
| D6 | **LiveKit** | Treated as **proven reference**, not in the binding backlog | — | LiveKit room + UI work today; its agent-as-bot path is the lowest-risk meeting analog and is the template the other meeting bridges follow. Bind on demand, not as scheduled work here. |

---

## 4. Work-streams

| Doc | Scope | Risk | Rough size |
|---|---|---|---|
| [`public-web-widget.md`](./public-web-widget.md) | Droppable text+voice support widget; pluggable public auth; abuse/rate-limit hardening; embed packaging | Medium (public attack surface, new bundle target) | Large |
| [`telephony-vendor-bindings.md`](./telephony-vendor-bindings.md) | Real Twilio/Vonage/RingCentral clients behind native loaders; inbound webhook + Media-Streams endpoint in MJAPI; integration tests | Medium (real-money calls, media plane) | Medium |
| [`meeting-vendor-bindings-teams-slack.md`](./meeting-vendor-bindings-teams-slack.md) | Real Teams (ACS+Graph) binding; Slack huddle binding **gated on media-API verification**; calendar + identity provisioner bindings | High (entitlements; Slack media API may not exist) | Medium |
| [`returning-visitor-memory.md`](./returning-visitor-memory.md) | Cross-session continuity: durable visitor cookie anchor, polymorphic resolved identity (`EntityID`+`RecordID`) on the conversation, recap-as-agent-memory, per-widget opt-in toggle | Medium (privacy/consent surface, memory-scoping ripple) | Medium |

**Operational docs** (how to turn this on / verify it on a real instance):

| Doc | Scope |
|---|---|
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Everything to enable bridges + widget on an MJ instance — migrations, metadata seed order, `mj.config.cjs` blocks, env vars, ngrok/Twilio setup, and a gotchas table of every non-obvious thing hit during bring-up |

---

## 5. Recommended sequencing

```
Phase A (parallelizable):
  A1. Telephony — Twilio end-to-end (prove the seam on live media + money)
  A2. Widget — guest-auth backend + text MVP (no vendor dependency)

Phase B:
  B1. Telephony — Vonage + RingCentral (repeat A1 with provider deltas)
  B2. Widget — voice modality + magic-link upgrade + host-passed auth
  B3. Server-bridged media plane (shared dependency for "real" Teams/telephony at scale) — see §6

Phase C:
  C1. Meetings — Teams (ACS + Graph) + calendar/identity provisioners
  C2. Meetings — Slack (ONLY after huddle-media access is verified; else park)
  C3. Widget — embed packaging hardening, multi-tenant config, abuse analytics
```

A1 and A2 have **no shared files** and should run as parallel tracks.

---

## 6. Cross-cutting dependency: the server-bridged media plane

Most external bridges assume the **server** owns the provider socket (server-bridged topology). That topology is fully architected but its **browser-audio ↔ server-socket media track is not wired** (it's the realtime plan's "P5"). The widget's voice path uses the *client-direct* topology (already shipped), so the widget does **not** block on P5. But "Zoom/Teams/telephony at production scale" does. Track P5 as its own item; the binding docs note where they depend on it vs. where the native SDK carries media itself.

Reference: [`../realtime-session-lifecycle-and-followups.md`](../realtime-session-lifecycle-and-followups.md).

---

## 7. How to execute with a future Claude Code session

1. **Open the relevant work-stream doc.** Each has a `Current state (verified)` section with real signatures, a phased task list, and acceptance criteria.
2. **Confirm the branch:** `git branch --show-current` → `claude/agent-architecture-bridges-mtqsnw`. Never push to `next`.
3. **Work one phase at a time.** Build the affected package (`cd packages/<pkg> && npm run build`) and run its tests (`npm run test`) before moving on — per the repo's CRITICAL RULES.
4. **Tests are part of done.** Every binding ships with the same in-memory-fake unit pattern the drivers already use, PLUS an integration test plan (gated behind env credentials, skipped in CI).
5. **Metadata over SQL inserts.** New providers/scenarios are seeded via `mj-sync` metadata, not migration `INSERT`s.
6. **No `any`, PascalCase public members, design tokens for all colors** — the repo CLAUDE.md rules apply to every file you touch.
7. **Commit only when the human asks.** Do not auto-commit.

---

## 8. Definition of done (program level)

> **Status (2026-06-28):** Telephony (Twilio live-proven) + widget (localhost) are the demoable core. Vonage/RingCentral, Teams, and calendar auto-join are code-complete + unit-tested but gated on a vendor account / entitled tenant to verify live. Slack is formally parked. Per-work-stream detail: each doc's **Status** banner.

- [x] Public widget renders on a blank third-party HTML page via a single `<script>` tag and a mount element, isolated in shadow DOM (no CSS bleed).
- [x] A guest visitor can hold a text **and** voice support conversation with a pinned agent, with no MJ login. — _Demo-grade; not public-safe until the guest run-entity grants are scoped (see widget doc Status)._
- [x] A guest can optionally upgrade to a magic-link-verified session that resolves their account.
- [ ] Twilio, Vonage, RingCentral place/receive a real call end-to-end through the agent, with passing integration tests (credential-gated). — _Twilio ✅ live-proven; Vonage/RingCentral code-complete + unit-tested, blocked on a vendor account each._
- [ ] Teams bridge joins a real meeting with two-way audio + roster (entitlement permitting). — _Blocked on a live ACS media-socket adapter (code) **and** an entitled Azure tenant (procurement). Control plane + ingress + unit tests done._
- [x] Slack: either bound (if media access verified) or formally parked with the blocker documented. — _Formally parked (NO-GO); row `Disabled`._
- [x] Every touched package builds and its unit tests pass.
- [x] No secrets in code; all credentials resolve via MJ config/credential system.
