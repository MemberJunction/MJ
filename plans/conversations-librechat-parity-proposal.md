# Proposal: Conversations Widget Enhancements (LibreChat v0.8.7 Study)

**Status:** Draft for review
**Author:** Conversations stack working notes
**Scope:** `@memberjunction/ng-conversations` + `@memberjunction/conversations-runtime`
**Origin:** Feature study of [LibreChat v0.8.7](https://www.librechat.ai/changelog/v0.8.7) compared against MJ's conversations UX stack.

---

## 1. Background

We studied LibreChat's v0.8.7 release against our conversations stack
(`@memberjunction/ng-conversations` widget + `@memberjunction/conversations-runtime`).
The full feature-by-feature comparison concluded:

- **MJ leads** on realtime/voice co-agents, whiteboard + remote-browser channels,
  session review, artifacts + collections (versioned/permissioned/library), tasks,
  export, message ratings, cross-type search, and **architecture** (a framework-agnostic
  runtime with slots/events/tokens that is embeddable and consumable outside Angular).
- **LibreChat leads** on a handful of *chat-surface* affordances that are genuinely
  worth adopting.

This proposal turns the agreed-upon gaps into a scoped, phased work plan.

### Items explicitly OUT of scope

| LibreChat 0.8.7 item | Why it's not in this proposal |
|---|---|
| **Code Interpreter sandbox** | Already being addressed by the **CodeSmith agent** study — tracked separately. |
| Provider/model breadth (Fable 5, Anthropic custom endpoints, prompt-cache TTL, Google URL Context, reasoning replay) | **Architectural non-gap** — see §2. In MJ you talk to *agents*, not models; agents already select across a wide array of providers via the MJ AI framework. Surfacing raw model pickers in chat would invert our layering. |
| MCP OBO tokens, OpenID role sync, admin panel, bundled compose files | Live in MJ's **platform/server layers**, not the chat widget. Not `ng-conversations` concerns. |

---

## 2. Architectural framing: agents, not models

LibreChat's provider breadth is a *model-selector* story — the user picks Claude vs.
GPT vs. Gemini per message. MJ deliberately sits one layer up: **the user converses
with agents**, and each agent resolves its own model/provider/configuration through the
MJ AI framework (`AI Configurations`, model vendors, fallbacks, cost/priority routing).

This is a strength, not a gap, and the proposal preserves it:

- We do **not** add a raw model picker to the composer.
- The existing **mode picker** (Draft / Standard / High → the agent's AI
  configuration) is the correct MJ-shaped analog and stays the primary control.
- Where transparency matters (cost/tokens — §3.1), we surface the *outcome* of the
  agent's model choices, not the choices themselves.

---

## 3. Proposed work

Five workstreams, ordered by value-to-effort. Each is independently shippable.

### 3.1 — Context & Cost Gauge  *(highest value-to-effort — do first)*

**What:** A compact, per-conversation indicator showing context-window usage
(% / tokens) and running cost. Optional, off by default, host-toggleable.

**Why it's cheap:** The data already exists. Every agent turn writes token and cost
data to `MJ: AI Agent Runs` / `MJ: AI Prompt Runs` (input/output tokens, cost). We are
*surfacing* existing data, not instrumenting anything new.

**Design:**
- New presentational component `mj-conversation-context-gauge` in
  `packages/Angular/Generic/conversations/src/lib/components/conversation/`.
- Aggregates token/cost from the agent-run peripheral data already loaded into
  `ConversationDetailPeripheralData` (`agentRunsByDetailId`). No new round trips for
  the running total; the per-message data is already in the chat-area.
- Context-window % needs the active agent's effective model context limit. Read from
  the AI model metadata (`AIEngineBase`) for the model the agent resolved to. When the
  limit is unknown, render tokens + cost only (degrade gracefully, no %).
- Place it in the chat-area header (or expose via the existing `header` slot so hosts
  can relocate it). New `@Input() ShowContextGauge: boolean = false`.
- Persist the user's show/hide choice via `UserInfoEngine` per the MJ preferences rule —
  key `mj.conversations.contextGauge.v1` (NOT `localStorage`).

**Effort:** S (1 component + aggregation helper + a preference toggle).
**Risk:** Low. Read-only, additive, off by default.

---

### 3.2 — User-Visible / Editable Memory

**What:** A "what the assistant remembers about you" surface — view, edit, and delete
memory entries from within the chat widget. This is LibreChat's most differentiated
0.8.7 feature and we already own the hard part server-side.

**Why we're well positioned:** MJ already has the **Agent Memory framework**
(see `guides/AGENT_MEMORY_GUIDE.md`) — note lifecycle (Provisional → Active →
Archived), injection/scoping, in-flight `memoryWrites`, and the Memory Manager's
hardening/consolidation/decay phases. What's missing is **a user-facing chat surface**
onto that framework. LibreChat's value isn't the store — it's that the user can *see and
correct* it.

**Design:**
- A `mj-conversation-memory-panel` component (sidebar drawer, sibling to the pinned-
  messages / active-tasks panels) listing the user's Active memory notes scoped to the
  current user (and optionally the current agent/app).
- Read/write through the existing memory entities + `*EntityServer` invariants — **no
  new bypassing of the framework**. Edits/deletes flow through `BaseEntity.Save()` /
  `Delete()` so the hardening/decay pipeline and record-change tracking stay intact.
- Respect note lifecycle: surface **Active** notes for edit; show **Provisional** as
  "pending" read-only (or hide behind a toggle); never expose Archived in the primary view.
- Reactivity via the engine + `ObserveProperty` pattern — the panel subscribes to the
  memory engine's observable so external writes (the agent learning something mid-chat)
  reflect live without manual reload.
- Gate behind `@Input() ShowMemoryPanel: boolean = false`.

**Open questions for review:**
1. Scope of what the user sees — user-global memory, per-agent, or both with a filter?
2. Do we let users *add* memory directly, or only view/edit/delete what the agent wrote?
   (LibreChat allows manual create; recommend starting view/edit/delete only.)

**Effort:** M (UI panel is straightforward; the careful part is wiring to the memory
framework's lifecycle/invariants correctly — needs a short design pass with whoever owns
Agent Memory).
**Risk:** Medium — touches a framework with consolidation/decay semantics; must not
write around the `*EntityServer` guards.

---

### 3.3 — In-Chat Skill Capture

**What:** "That worked — save it as a reusable skill." A lightweight loop to capture a
successful conversation flow as a reusable, named capability, surfaced back in the agent
picker / mentions.

**MJ mapping:** LibreChat "skills" map onto MJ's existing primitives — **Actions**,
**Agents**, and **Record Processes**. We do *not* need a parallel "skills" concept; we
need a *capture UX* that produces one of these existing artifacts from a conversation.

**Design (phased — capture first, authoring later):**
- **Phase A (capture stub):** A message/conversation affordance ("Save as skill") that
  packages the relevant turn(s) + the agent + parameters into a draft. Initially this can
  produce a **saved prompt / parameterized conversation starter** rather than full code.
- **Phase B (promote to Action/Agent):** Hand the draft to the appropriate MJ authoring
  path. This is where it overlaps with the **CodeSmith agent** (§ out-of-scope item 4) —
  CodeSmith is the natural engine for turning a captured flow into executable code.
  Coordinate so skill-capture *feeds* CodeSmith rather than duplicating it.

**Recommendation:** Ship Phase A in this round (capture → conversation starter / saved
prompt) and defer Phase B until the CodeSmith study lands, so the two efforts converge
instead of competing.

**Effort:** Phase A = M; Phase B = L (and dependent on CodeSmith).
**Risk:** Medium — mostly product-definition risk (what exactly is "a skill" in MJ
terms). Keep Phase A deliberately small.

---

### 3.4 — Quote / Multi-Quote Selected Text

**What:** Select text in any message → "Quote" popup → inserts a quoted reference into
the composer. Multi-quote accumulates several selections before sending.

**Design:**
- Selection-handler directive on the message-list / message-item; a small floating
  "Quote" button on text selection.
- Quoted text is prepended to the `mj-mention-editor` composer as a blockquote with a
  back-reference to the source `ConversationDetailID` (so we can later render "in reply
  to" context).
- Multi-quote = an accumulator in the composer state; each quote appends.

**Effort:** S.
**Risk:** Low. Pure UI; integrates with the existing composer.

---

### 3.5 — Keyboard Shortcut Registry

**What:** Move beyond Ctrl+Enter to a small, discoverable shortcut set (new
conversation, focus composer, toggle sidebar, search, send, escape/close panels) with a
"?" cheat-sheet overlay.

**Design:**
- A lightweight `ConversationKeyboardService` (Angular) holding a registry of
  `{ combo, description, handler, scope }`. Keep it widget-local — do not introduce a
  global app shortcut system.
- A `mj-keyboard-shortcuts-overlay` cheat-sheet triggered by `?`.
- Respect host context: shortcuts only fire when focus is within the conversation widget,
  so embeds (Form Builder cockpit, etc.) don't hijack host keys.
- Persist any user remaps (future) via `UserInfoEngine`; v1 ships fixed bindings.

**Effort:** S–M.
**Risk:** Low–Medium — main care is scoping so we don't steal keystrokes from host apps
or other embeds.

---

## 4. Sequencing

| Order | Item | Effort | Depends on |
|---|---|---|---|
| 1 | Context & Cost Gauge (3.1) | S | — |
| 2 | Quote / Multi-Quote (3.4) | S | — |
| 3 | Keyboard Shortcuts (3.5) | S–M | — |
| 4 | Memory Panel (3.2) | M | Agent Memory framework design pass |
| 5 | Skill Capture Phase A (3.3) | M | — (Phase B waits on CodeSmith) |

Items 1–3 are quick, low-risk wins that can ship in a first PR. Item 4 needs a short
design alignment with the Agent Memory owner. Item 5 Phase A is independent; Phase B
intentionally defers to converge with CodeSmith.

---

## 5. Cross-cutting conventions (apply to all items)

- **Additive & opt-in.** Every new surface is behind an `@Input()` flag defaulting to
  off, so existing embeds see zero change.
- **Slots where it makes sense.** Prefer exposing new chrome via the existing slot system
  so hosts can relocate/replace it.
- **Preferences via `UserInfoEngine`**, never `localStorage` (per CLAUDE.md §9).
- **Design tokens only** — `--mj-chat-*` / semantic tokens, no hardcoded colors; must
  pass `npm run check:ui`.
- **Reactivity via `BaseEngine` + `ObserveProperty`** for anything reading cached
  entity state (memory panel especially).
- **Runtime-first where logic is framework-agnostic.** Aggregation/parse logic that a
  React/Vue host would also want (e.g., token/cost rollup) belongs in
  `@memberjunction/conversations-runtime`; only the rendering lives in the Angular widget.
- **Tests.** Vitest unit coverage for new runtime logic (token rollup, quote
  accumulation, shortcut registry) per CLAUDE.md §6.

---

## 6. What we are NOT doing (and why)

- **No raw model picker in chat** — would invert MJ's agent-centric layering (§2).
- **No parallel "skills" entity** — reuse Actions / Agents / Record Processes.
- **No code-interpreter surface here** — owned by the CodeSmith study.
- **No admin/settings app** — `ng-conversations` is an embeddable widget; settings belong
  to the host app.

---

## 7. Next step

On approval, I'll start with **3.1 (Context & Cost Gauge)** as the first PR — it's the
lowest-risk, the data already exists, and it gives users immediate transparency into the
agent-resolved model costs that our layering otherwise hides.
