# Conversations: Competitive UX Study & World-Class Roadmap

**Status:** Draft for review
**Scope:** `@memberjunction/ng-conversations` + `@memberjunction/conversations-runtime`
**Supersedes/extends:** `plans/conversations-librechat-parity-proposal.md` (the LibreChat-only first pass)
**Goal:** Not parity with any single product — a clear-eyed map of what *world-class* AI chat UX looks like in 2026 and where MJ should invest to lead.

---

## 1. Method

We inventoried our conversations stack, then ran parallel research across the full
competitive field as of mid-2026:

- **OSS / self-hostable field** (the LibreChat category): Open WebUI, LibreChat, Lobe
  Chat, Big-AGI, AnythingLLM, Cherry Studio, Jan, Chatbox, Hugging Face Chat UI, Msty,
  NextChat, SillyTavern, GPT4All, Khoj.
- **Flagship first-party clients**: ChatGPT, Claude (Claude.ai + Desktop + Cowork),
  Gemini.

This document synthesizes the recurring "world-class" UX patterns, scores MJ against
them, names where MJ already leads, and proposes a prioritized roadmap.

---

## 2. The field in one paragraph each

- **OSS leaders (Open WebUI, LibreChat, Lobe, Big-AGI).** 2026 table stakes converged
  on **MCP + RAG + artifacts + personas**; differentiation moved to *reasoning across
  models* (Big-AGI **Beam** multi-model merge, Msty Split Chat, Lobe branching trees +
  chain-of-thought visualization) and *team/enterprise readiness* (Open WebUI RBAC/SCIM,
  LibreChat multi-user + Admin Panel). Open WebUI's KV-backed **persistent artifacts**
  hint at "stateful apps inside chat."
- **ChatGPT.** Projects (scoped memory), two-tier editable memory + temporary chat,
  Deep Research / Agent (plan-review-before-run), Code Interpreter w/ interactive
  in-thread charts, multiplayer **group chats**, one-click share, proactive **scheduled
  tasks**, radically simplified intent-named model picker with quota-free auto-routing,
  **conversation branching** ("branch in new chat"), long-thread auto **TOC**. Notably
  *sunset Canvas* — betting artifact editing belongs **inline in the thread**.
- **Claude.** **Artifacts-as-apps** with viewer-pays economics (the standout of the whole
  field), live render + versioning + publish + remix; the **MCP connector "app store"**
  (500+ reviewed integrations, one-click `.mcpb` install, **interactive MCP Apps that
  render UI in-chat**); **project-scoped memory + incognito**; multi-agent **Research**
  with claim-level citations; **Cowork** autonomous desktop agent; real file creation
  (.xlsx/.pptx/.docx/.pdf); custom **styles from a writing sample**; effort slider over
  token budgets.
- **Gemini.** **Editable research plan** before Deep Research runs (most-praised control
  pattern), **Gemini Live** (interruptible voice + camera + screen-share, now with memory
  + live app data mid-session), **Canvas** live preview, **Workspace grounding via
  `@`-mentions**, two-tier memory, conversational image editing (Nano Banana),
  **Audio Overviews** chained onto research, **promote-a-prompt-to-a-schedule**,
  **forkable shared chats**. Weak spot: native conversation organization (folders).

---

## 3. The 2026 "world-class chat UX" rubric

Distilling what recurs across the leaders, a world-class chat product is expected to do
the following. Each row notes **where MJ stands**.

| # | Pattern (table stakes → differentiator) | Who exemplifies | MJ status |
|---|---|---|---|
| 1 | Streaming, edit, regenerate, copy, markdown/code | universal | ✅ Have |
| 2 | Conversation org: folders/projects, pin, search, archive | all | ✅ Have (projects, pin, cross-type search) |
| 3 | **Conversation branching/forking** into alternate paths | ChatGPT, Lobe, Claude, LibreChat | 🟡 Partial (thread panel; no first-class "fork from message") |
| 4 | Long-thread navigation (auto **TOC**), up-arrow-edit | ChatGPT | 🔴 Gap |
| 5 | **Quote / multi-quote** selected text | ChatGPT | 🔴 Gap *(in roadmap)* |
| 6 | **Keyboard-shortcut** system + cheat-sheet | all | 🟡 Partial (Ctrl+Enter only) *(in roadmap)* |
| 7 | Agents/personas/assistants, reusable | all | ✅✅ Lead (agents are first-class platform entities) |
| 8 | Simplified **intent-named model picker** + auto-routing | ChatGPT, Gemini, Claude | ✅ Have, MJ-shaped (Draft/Standard/High mode picker; **agents, not models**) |
| 9 | **Artifacts**: versioning + permissions | Claude, ChatGPT, OSS | ✅ Have (versioned, permissioned, collections, library) |
| 10 | **Artifacts: live render/preview** of interactive HTML/React | Claude, Gemini, Lobe, ChatGPT | 🔴 Gap |
| 11 | **Artifacts: publish/share link + remix** | Claude (flagship), Gemini | 🔴 Gap |
| 12 | **Artifacts-as-apps** (artifact calls the model; viewer-pays) | Claude only | 🔴 Gap (frontier) |
| 13 | **Context/cost transparency** gauge | ChatGPT, Gemini | 🔴 Gap *(in roadmap)* |
| 14 | **User-visible/editable memory** (two-tier) | all three majors | 🔴 Gap *(in roadmap; MJ has server-side Agent Memory)* |
| 15 | **Project-scoped memory + incognito/temporary chat** | Claude, ChatGPT, Gemini | 🔴 Gap |
| 16 | **Deep Research**: multi-step agentic, **cited** report | all three majors, Khoj | 🟡 Partial (agents can research; no packaged report UX) |
| 17 | **Editable research plan before the expensive run** | Gemini, ChatGPT | 🔴 Gap (highest-praised pattern) |
| 18 | Web search with **inline hover-preview citations** | all | 🟡 Partial (platform SearchEngine/RAG; not surfaced in-chat with citations) |
| 19 | RAG / **knowledge base / project knowledge** grounding | OSS field, Claude, Gemini | 🟡 Partial (linked entities/records; no "upload knowledge to this project") |
| 20 | **MCP / tool extensibility** with in-chat **interactive tool UI** | Claude (app store), OSS field | 🟡 Partial (MCP at server/agent layer; no in-chat interactive tool surface) |
| 21 | Code interpreter / **real file creation** (.xlsx/.pptx/.docx) | Claude, ChatGPT, LibreChat | 🟡 Covered by **CodeSmith** study (out of scope here) |
| 22 | Voice/realtime: interruptible + **camera/screen-share** | Gemini Live, ChatGPT, Claude | ✅✅ Lead (voice co-agents, whiteboard, remote-browser channels, session review) — verify camera/screen *input* |
| 23 | Proactive **scheduled / monitoring tasks** | ChatGPT, Gemini, Khoj | 🟡 Partial (platform Record Processes / scheduled actions; not surfaced in chat) |
| 24 | **Group chats** (multiple humans + agent) | ChatGPT | 🔴 Gap (MJ has multi-user + members) |
| 25 | Sharing: one-click, **forkable shared chats**, group | ChatGPT, Gemini | 🟡 Partial (share modal; not forkable/continuable) |
| 26 | Image generation / conversational image editing | Gemini, ChatGPT, OSS | 🔴 Gap (likely agent/action territory) |
| 27 | Multi-model parallel reasoning + **merge** (Beam) | Big-AGI, Msty | ⚪ Niche / non-goal under agent-not-model layering |
| 28 | Custom **styles/personas** (incl. from writing sample) | Claude, GPTs, Gems | 🟡 Partial (agent character/persona config; no per-user style presets) |
| 29 | Export (md/json/html), import | OSS field, MJ | ✅ Have |
| 30 | Enterprise: RBAC, SSO/SCIM, audit | Open WebUI, LibreChat, majors | ✅ Lead (MJ platform) |
| 31 | **Embeddable / framework-agnostic** chat engine | AnythingLLM widget (partial) | ✅✅ Lead (runtime + slots/events/tokens; React/Vue/Node consumable) |
| 32 | **Grounding in real business data/records** | — (none of the consumer tools) | ✅✅✅ Unique to MJ (entity mentions, linked records, actions on data) |

**Reading the scorecard:** MJ is at or above the field on the *foundational* and
*structural* axes (orgs, agents, artifacts-as-entities, voice/realtime, embeddability,
enterprise, and — uniquely — **acting on real business data**). The gaps cluster in three
themes: **(A) artifact richness** (live render/publish/remix/apps), **(B) the
research/agentic-transparency loop** (cited reports + editable plan-before-run +
in-chat tool UI), and **(C) memory & personalization surfacing** (editable memory,
project scope, incognito, styles), plus a band of **UX polish** (quote, shortcuts, TOC,
fork, context gauge).

---

## 4. Where MJ already leads — defend and amplify

These are not gaps; they are moats. The roadmap should protect and market them.

1. **Agent-native, not model-native.** Everyone else is converging on a model picker;
   MJ users talk to **agents** that resolve across many providers/configs via the MJ AI
   framework. The mode picker (Draft/Standard/High) is the correct MJ-shaped control.
   *Implication:* we explicitly do **not** chase a raw model picker, Beam-style
   multi-model merge, or provider breadth-in-chat. Those invert our layering.
2. **Grounding in real business data (unique in the entire field).** No consumer tool can
   `@`-mention an entity, link a record, and have the agent act on governed business
   data. This is MJ's single biggest differentiator — *amplify it* (richer entity
   mentions, record-aware artifacts, action confirmation gates).
3. **Realtime/voice depth.** Voice co-agents + whiteboard + remote-browser channels +
   session review + delegation cards already match or exceed the majors' voice modes.
   The one thing to verify/close: **camera + screen-share as live inputs** (Gemini Live /
   ChatGPT have it).
4. **Artifacts + collections as first-class versioned, permissioned entities** with a
   library — structurally ahead of the ad-hoc artifacts in consumer tools.
5. **Embeddable framework-agnostic runtime** with slots/events/tokens — no competitor
   offers a reusable conversation engine consumable from React/Vue/Node.
6. **Enterprise posture** (RBAC, audit, multi-provider) inherited from the platform.

---

## 5. Proposed roadmap

Organized in tiers by leverage. Each item maps to MJ architecture, with effort (S/M/L)
and risk. Items marked *(carried)* come from the first LibreChat pass and remain valid.

### Tier 1 — Quick wins & transparency (ship first, low risk)

| Item | What | MJ mapping | Effort |
|---|---|---|---|
| **1.1 Context & Cost Gauge** *(carried)* | Per-conversation token/window/cost meter, opt-in | Aggregate existing `MJ: AI Agent/Prompt Runs` data already in peripheral data; model context limit from `AIEngineBase` | S |
| **1.2 Quote / Multi-Quote** *(carried)* | Select message text → quote into composer; multi-accumulate | Selection directive + composer state; back-ref to `ConversationDetailID` | S |
| **1.3 Keyboard-shortcut registry** *(carried)* | Widget-scoped shortcuts + `?` cheat-sheet | `ConversationKeyboardService`, host-focus-scoped | S–M |
| **1.4 Long-thread TOC + up-arrow-edit** | Auto section list for long threads; ↑ to edit last message | message-list scan; composer key handler | S |

### Tier 2 — Memory, personalization, and the agentic-transparency loop (highest differentiation)

| Item | What | MJ mapping | Effort |
|---|---|---|---|
| **2.1 User-visible/editable Memory panel** *(carried)* | View/edit/delete what the assistant remembers | Bridge UI onto existing **Agent Memory framework** (`guides/AGENT_MEMORY_GUIDE.md`); respect lifecycle + `*EntityServer` invariants; reactive via `ObserveProperty` | M |
| **2.2 Project-scoped memory + Incognito/Temporary chat** | Scope memory per conversation-project; a temporary mode that neither reads nor writes memory/history | Memory scoping + a `temporary` conversation flag honored by the runner | M |
| **2.3 Research report UX with editable plan-before-run** | Agent proposes a plan → user edits scope → runs → **cited** report, live progress, export | Wrap an MJ research/agent flow; render plan as an editable artifact; citations from agent sources; this is the **most-praised pattern in the field** | M–L |
| **2.4 In-chat web search with inline citations** | Synthesized answer + hover-preview source footnotes | Surface MJ `SearchEngine`/RAG results with citation rendering in the bubble | M |

### Tier 3 — Artifact richness (close the biggest structural gap)

| Item | What | MJ mapping | Effort |
|---|---|---|---|
| **3.1 Live artifact render/preview** | Render interactive HTML/React/Mermaid artifacts inline with a Preview toggle | We have the artifact entity + viewers; add safe sandboxed render. **Decide inline-in-thread (ChatGPT's bet) vs. side-panel (Claude/Gemini)** — recommend inline-first given our message-card artifacts | M–L |
| **3.2 Publish & share + remix** | One-click shareable artifact link (no account to view); "remix" opens an editable copy in a new conversation | Builds on artifact permissions + versioning already present; add publish scope + remix-as-new-conversation | M |
| **3.3 Artifacts-as-apps (frontier — evaluate)** | Artifacts that call an agent/model from inside, billed to the viewer | Claude's flagship; powerful but a big policy/runtime lift. **Evaluate, don't commit yet** — strong fit with MJ's component/app infra if pursued | L (spike first) |

### Tier 4 — Collaboration, proactivity, extensibility (bigger lifts, sequence later)

| Item | What | MJ mapping | Effort |
|---|---|---|---|
| **4.1 Forkable shared chats** | Recipient of a shared conversation can continue it from a copy | Extend share modal + conversation clone | M |
| **4.2 Proactive scheduled / monitoring chat tasks** | "Every weekday 8am, summarize X"; notify on change | Surface platform **Record Processes / scheduled actions** in the widget with a Scheduled view | M |
| **4.3 In-chat interactive tool UI (MCP-Apps style)** | Tool/agent results render as interactive cards/surfaces in-chat | Leverage the `demonstrationSurface` slot + realtime channel infra; map to MCP/tool outputs | M–L |
| **4.4 Group chats (multi-human + agent)** | Multiple users + agent(s) in one conversation | We have multi-user + members modal; add concurrent presence + turn handling | L |
| **4.5 In-chat skill capture (Phase A)** *(carried)* | "Save this flow as a reusable capability" → conversation starter / saved prompt; Phase B promotes to Action/Agent via **CodeSmith** | Reuse Actions/Agents/Record Processes; converge with CodeSmith for code gen. **Consider aligning the captured-capability format with the open `SKILL.md` standard** (agentskills.io — now cross-vendor: Claude, OpenAI/Codex, Copilot, Cursor, Gemini CLI) for portability, and adopt its **progressive-disclosure** loading idea so a large capability library doesn't bloat agent context | M (A) |

### Explicitly out of scope / non-goals

- **Code interpreter / real-file creation (.xlsx/.pptx/.docx)** — owned by the **CodeSmith
  agent** study.
- **Raw model picker, Beam-style multi-model merge, provider-breadth-in-chat** —
  architectural non-goals; invert MJ's agent-not-model layering (§4.1).
- **Consumer image/video generation in the composer** — agent/action territory, not a
  chat-widget concern.
- **Admin panel / settings app, SSO/SCIM** — platform/server layers, not the widget.

---

## 6. Recommended sequencing

1. **Tier 1** as a first PR — all low-risk, mostly data already present; immediate
   perceived-quality lift. Start with **1.1 Context & Cost Gauge**.
2. **Tier 2** next — this is where MJ moves from "solid" to "differentiated." **2.3
   editable-plan research** and **2.1 memory panel** are the headline differentiators;
   both lean on capabilities MJ already owns server-side.
3. **Tier 3** — artifact richness; do a **render-architecture spike** (inline vs.
   side-panel, sandboxing) before committing. 3.3 (artifacts-as-apps) gets a spike only.
4. **Tier 4** — collaboration/proactivity/extensibility; sequence by demand.

## 7. Cross-cutting conventions (all items)

Additive & opt-in behind `@Input()` flags · expose chrome via slots where possible ·
preferences via `UserInfoEngine` (never `localStorage`, per CLAUDE.md §9) · semantic
`--mj-chat-*` design tokens only (`npm run check:ui`) · reactivity via `BaseEngine` +
`ObserveProperty` · **runtime-first** for framework-agnostic logic so React/Vue/Node
hosts benefit (token rollup, quote accumulation, fork logic, plan model) · Vitest
coverage for new runtime logic (CLAUDE.md §6).

## 8. Open questions for review

1. **Artifact render placement** — inline-in-thread (ChatGPT's 2026 bet, less mode-switch)
   vs. side-panel (Claude/Gemini). Recommend inline-first; confirm.
2. **Memory scope** — user-global, per-agent, per-project, or all with a filter? (§2.1/2.2)
3. **Research report (2.3)** — wrap an existing MJ agent flow, or define a dedicated
   "Research" agent type with the plan-preview contract?
4. **Artifacts-as-apps (3.3)** — worth a spike this cycle, or park until artifact
   render/publish (3.1/3.2) land?

---

## 9. Sources

**OSS field:** Open WebUI ([docs](https://docs.openwebui.com/features/)), LibreChat
([repo](https://github.com/danny-avila/LibreChat), [2026 roadmap](https://www.librechat.ai/blog/2026-02-18_2026_roadmap)),
Lobe Chat ([repo](https://github.com/lobehub/lobe-chat)), Big-AGI **Beam**
([blog](https://big-agi.com/blog/beam-multi-model-ai-reasoning)), AnythingLLM
([docs](https://docs.anythingllm.com/introduction)), Cherry Studio
([repo](https://github.com/CherryHQ/cherry-studio)), Jan ([docs](https://www.jan.ai/docs)),
Chatbox ([changelog](https://chatboxai.app/en/help-center/changelog)), HF Chat UI
([docs](https://huggingface.co/docs/chat-ui/index)), Msty ([changelog](https://msty.ai/changelog/)),
landscape ([dev.to](https://dev.to/lightningdev123/best-open-source-chatgpt-alternatives-in-2026-53el)).
**ChatGPT:** [Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt),
[Memory FAQ](https://help.openai.com/en/articles/8590148-memory-faq),
[Deep research](https://openai.com/index/introducing-deep-research/),
[ChatGPT agent](https://openai.com/index/introducing-chatgpt-agent/),
[Scheduled tasks](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt),
[Group chats](https://openai.com/index/group-chats-in-chatgpt/),
[release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes).
**Claude:** [Artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them),
[Claude-powered Artifacts](https://claude.com/blog/claude-powered-artifacts),
[Connectors](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities),
[Projects](https://support.claude.com/en/articles/9517075-what-are-projects),
[Memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context),
[Research](https://www.anthropic.com/engineering/multi-agent-research-system),
[Cowork](https://www.anthropic.com/product/claude-cowork),
[Create files](https://claude.com/blog/create-files).
**Gemini:** [Gems](https://gemini.google/overview/gems/),
[Canvas](https://gemini.google/overview/canvas/),
[Deep Research](https://gemini.google/overview/deep-research/),
[Gemini Live](https://gemini.google/overview/gemini-live/),
[Connected apps](https://support.google.com/gemini/answer/14959807),
[Memory](https://support.google.com/gemini/answer/16598469),
[Scheduled actions](https://blog.google/products-and-platforms/products/gemini/scheduled-actions-gemini-app/),
[Share chats](https://support.google.com/gemini/answer/13743730).
**MJ:** `packages/Angular/Generic/conversations`, `packages/ConversationsRuntime`,
`guides/CONVERSATIONS_UX_STACK_GUIDE.md`, `guides/AGENT_MEMORY_GUIDE.md`.
