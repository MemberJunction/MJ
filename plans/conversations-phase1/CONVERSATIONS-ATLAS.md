# Next-Gen Conversations — Application Atlas

> **The one-page answer to "what does this application actually do?"** Every functional area, two
> lines each, with status and a pointer to depth. Inventory swept from code 2026-07-07 (packages:
> `ng-conversations`, `ng-composer`, `ConversationsRuntime`, Explorer wrapper). Companion depth docs:
> [EXECUTION.md](EXECUTION.md) · [projects-hierarchy.html](projects-hierarchy.html) ·
> [redesign-directions.html](redesign-directions.html) (3-directions canvas) ·
> [prototype](prototype/index.html) · repo `guides/`.
>
> **Status legend:** ✅ shipped · 🔨 building now · ⚠️ shipped-but-partial/cosmetic · 📐 designed,
> not built (prototype/mockups exist) · 💡 proposed only

## Shell & navigation
| Feature | What it does | Status |
|---|---|---|
| Workspace tabs | Conversations / Collections / Tasks switcher; `full` + overlay layouts | ✅ |
| Top navigation | project selector, search shortcut, notifications entry | ✅ |
| Chat overlay mode | embeddable floating chat surface for host apps | ✅ |
| Slot system | host apps override header/empty-state/bubble/presence/demo surfaces | ✅ |
| Explorer deep links | query params open conversation / artifact@version / session review; cross-resource nav with pending message+attachments | ✅ |

## Sidebar & organization
| Feature | What it does | Status |
|---|---|---|
| Conversation list | list/select/rename, AI **auto-naming** of new conversations | ✅ |
| Projects ("Folders") | group conversations; create/edit modal; nestable underneath | ✅ (rename + presentation = 💡 Projects v1, see below) |
| Collections tree | nested artifact collections in sidebar + full view | ✅ |
| Routines section | pinned bottom entry → command center slide-in; `ShowRoutines` + permission gated | ✅ |
| Search | conversation/message search panel + keyboard shortcut | ✅ |
| Pinned conversations & sidebar pin/collapse | | ✅ |

## Chat & messages
| Feature | What it does | Status |
|---|---|---|
| Message rendering | markdown w/ collapsible headings, streaming updates, structured field blocks | ✅ |
| Message actions | pin/unpin, edit, delete, retry (gear menu); **no quote/fork** | ✅ (quote/fork = 📐 polish parcel H) |
| Pinned messages panel | per-conversation pinned view | ✅ |
| **Threads** | reply-in-thread side panel (`thread-panel.component`) | ✅ — *predates group chat; P1.8's threaded model builds on this* |
| Ratings & feedback | thumbs on latest AI reply + full rating dialog; test-run feedback | ✅ |
| Agent run inspector | expandable per-message run details | ✅ |
| Actionable commands | agent-emitted clickable action chips | ✅ |
| Empty/error/loading states | configurable agent-character empty state; error vs streaming states | ✅ |
| Attachments viewer | image thumbnails + fullscreen viewer | ✅ |
| Export | conversation → JSON / Markdown / HTML / Text | ✅ |

## Composer (`ng-composer`, extracted + AI plugins)
| Feature | What it does | Status |
|---|---|---|
| Mentions | `@` agents/users · `#` entity/query records · `/` skills — pluggable trigger providers | ✅ |
| Attachments | upload (10 max, 20MB, MIME-filtered) + attach-from-artifacts picker | ✅ |
| Plan Mode toggle | sticky per-conversation pref; approve auto-disables | ✅ ⚠️ drifts from per-request design — see EXECUTION drift table |
| Mode & agent pickers | Draft/Standard/High config presets; agent picker | ✅ |
| Voice input hooks | voiceActive/voiceRequested wiring | ✅ |
| Draft persistence | pending message+attachments survive conversation switches | ✅ |
| Context gauge | tokens/cost/window % chip + ~85% nudge | 📐 parcel C — nothing exists |

## Agents & orchestration
| Feature | What it does | Status | Depth |
|---|---|---|---|
| Agent runs + streaming | normal chat turn = `AIAgentRun`, streamed | ✅ | CONVERSATIONS_UX_STACK_GUIDE |
| Plan Mode (framework) | HITL plan-approval gate, `RequirePlanMode`, run stamping | ✅ #2996/#3017 | AGENT_SKILLS_AND_PLAN_MODE_GUIDE |
| Skills | `/skill` invocation, double activation gate, per-step provenance; **no catalog/admin UI** | ✅ framework ⚠️ admin UI = parcel B′ | same guide |
| Workflows (task graphs) | Sage decomposes multi-step asks → tasks+dependencies, sequential agent execution, live panels + Gantt | ✅ (`Task.ProjectID` never stamped) | `TaskOrchestrator` (MJServer) · `ng-tasks`/`ng-gantt` |
| Active/global task panels | live task tracking dropdown + widget + full view | ✅ | |
| Agent presence/process | active-agent indicator, process panel, thinking status | ✅ | |

## Memory
| Feature | What it does | Status | Depth |
|---|---|---|---|
| Agent notes/examples | durable learned facts; Provisional→Active; consolidation | ✅ framework, **no user-facing UI** | AGENT_MEMORY_GUIDE (internals = flagged gap) |
| Project scoping + incognito | `ProjectID` on notes/examples/runs; `IsTemporary` | 🔨 P1.6 (AN-BC) — D17–D20 pending | AGENT_MEMORY_GUIDE |
| Memory chips + manage surface | consent-at-learning + ledger UI | 📐 parcel E — agreed pairing: inline chips + one manage surface | prototype |

## Artifacts & collections
| Feature | What it does | Status | Depth |
|---|---|---|---|
| Artifacts + versions | identity + versioned content (text inline / files); per-agent creation policy; live React rendering for Component/Report types; extraction attributes; use tracking | ✅ | [projects-hierarchy.html](projects-hierarchy.html) |
| Artifact pane + cards | split-pane viewer, versions, per-message artifact cards | ✅ | |
| Collections | multi-home artifact organization (junction pins a **version**); share modals; library view | ✅ | [projects-hierarchy.html](projects-hierarchy.html) |
| Artifact edit → new version (user) · remix | | 📐 parcel G | prototype |
| Public link publish | tokenized anonymous access + privilege gate | ⚠️ **cosmetic today** (writes nothing) → parcel G greenfield | [EXECUTION.md](EXECUTION.md) §1 drift table |

## Routines
| Feature | What it does | Status | Depth |
|---|---|---|---|
| Standing orders end-to-end | 3 entities, 1-min dispatcher, Scheduled/Monitoring+OnChange, friendly cron builder, hidden per-routine conversations, command center + Explorer app | ✅ #3035 | USER_ROUTINES_GUIDE |
| Chat-native half | turn-message-into-routine, prefill, Upcoming agenda, alerts feed | 📐 parcel R+ | prototype |

## Voice & realtime
| Feature | What it does | Status | Depth |
|---|---|---|---|
| Voice sessions | co-agent voices target agent; transcript = tagged normal messages ("session blocks"); call overlay via phone pill; review mode; recording | ✅ | REALTIME_CO_AGENTS_GUIDE |
| Channels | Whiteboard / Media / Remote Browser / headless client-context, per-session state | ✅ | same |
| Session observability | co-agent `AIAgentRun` + nested delegated runs | ✅ | |

## Sharing & collaboration
| Feature | What it does | Status | Depth |
|---|---|---|---|
| Person-to-person sharing | conversations & artifacts via Resource Permissions (View/Edit/Owner); members modal; Sharing Center inbox/outbox | ✅ | UNIFIED_PERMISSIONS_GUIDE |
| Public links | anonymous token access | ⚠️ cosmetic (see artifacts) | |
| Group chat | participants/roster/invites/runtime | 💡 P1.8: schema in mega migration (unshipped), runtime Phase 2; threads component already exists | prototype · flow spec |
| Magic Links | scoped external *user* provisioning (different thing) | ✅ framework | MAGIC_LINK_GUIDE |

## Notifications & cross-cutting
| Feature | What it does | Status |
|---|---|---|
| Notification subsystem | badge, activity indicator, toasts, agent-error surfacing | ✅ (5 design docs in package root) |
| Dark mode + responsive | `prefers-color-scheme` + mobile breakpoints throughout | ✅ |
| Keyboard | Ctrl+Enter send, search shortcut; **no shortcut service / cheat-sheet / ⌘K** | ✅ basics (rest = 📐 parcel H; omnibar #3042 in flight) |
| Dialog & toast services | shared UI services | ✅ |

## Headless runtime & embedding (`ConversationsRuntime`)
Facade + DefaultAgentResolver (app/env default agent) + MentionParser + ConversationStreaming +
SessionsObserver/ISessionsAdapter + ConversationAgentRunner (client tools, planMode/skills threading) +
ConversationBridge + notification/task adapters — the framework-agnostic layer host apps consume. ✅
Depth: `guides/CONVERSATIONS_UX_STACK_GUIDE.md`.

## Future / decision-stage
| Area | State |
|---|---|
| **Projects v1** (rename + presentation + satellites re-homed) | 💡 direction deliberating (~2 wks, Amith); 3 mockups + brief + [hierarchy illustration](projects-hierarchy.html) + [redesign canvas](redesign-directions.html); my review conditions → PR #2953 |
| Proxy / remote agents (Skip standardization) | 💡 design-only P1.9; nothing in code |
| Concurrency (parallel agent turns) | 💡 Phase 2, ADR owed (P1.0.3) |

---
*Maintenance rule: new feature work should add/flip a row here in the same PR — this file is only
valuable while it's true. Snapshot verified 2026-07-07.*
