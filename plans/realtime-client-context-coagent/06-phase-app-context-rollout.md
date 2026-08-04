# Phase 5 (fast-follow) — Universal app context & tools rollout + governance

**Goal:** After Moves 1–4 land, make **every** MJ app/surface publish rich, continuously-flowing client context and register its client tools onto the unified substrate — and make that self-perpetuating so new/updated apps stay rich automatically.

**Depends on:** Moves 1–4 complete. This is the "make it universal + keep it universal" phase.

## Key discovery — we are standardizing, not inventing

There is **already** a per-surface mechanism: `NavigationService.SetAgentContext(this, {...})` and `NavigationService.SetAgentClientTools(this, [...])`, used today by Knowledge Hub (Analytics/Visualize/Config), the four AI surfaces (Autotagging/Tags/Vectors/Duplicates), and Form Builder. Global tools (`NavigateToRecord`, `NavigateToApp`, `Sleep`, `CopyToClipboard`, `ShowNotification`, `OpenBrowserTab`, `SetTheme`) are registered once in `explorer-app.component.ts` (`registerClientTools()`).

**This phase converges that existing pattern onto the new substrate** rather than adding a parallel one:
- `SetAgentContext(...)` already produces the existing `AppContextSnapshot` (`ai-core-plus/src/app-context.ts`) for async; it now also publishes (with the new `View`/`Capabilities` members, Move 3.2) over `ClientContextChannel` to realtime. One producer, two consumers.
- `SetAgentClientTools(...)` becomes dynamic-tier registration resolved by `ResolveClientTools` (Move 2) → available to both async and realtime.
- Result: **one call from a surface lights it up for async chat AND the realtime co-agent simultaneously.** Surfaces don't learn two APIs.

> Build implication for Move 3: `ClientContextChannelClient.PublishContext` / `RegisterClientTool` (Move 3.3) should be the **evolution of `NavigationService.SetAgentContext/SetAgentClientTools`**, not a sibling. Either fold the new behavior into `NavigationService`, or have `NavigationService` delegate to the channel. Decide at build time; do **not** ship two parallel surface APIs.

## Prepopulated inventory (high-level — phase does the exhaustive pass)

25 registered apps. Status legend: **A** embeds conversations · **B** registers client tools · **C** realtime/voice · **D** none.

### Already integrated (early adopters — enrich, don't build from zero)

| App / Surface | Status | Evidence | Gap to close |
|---|---|---|---|
| Knowledge Hub — Analytics | A+B | `analytics-resource.component.ts:448,457` | enrich context shape (entity meta, filter options, KPI defs) |
| Knowledge Hub — Visualize | A+B | `visualize-resource.component.ts:207,212` | cluster metadata + selection context |
| Knowledge Hub — Config | A+B | `knowledge-config-resource.component.ts:248,253` | full config-state context |
| Knowledge Hub — Search/Classify/Clusters/Dups/Vectors | partial | dashboards/CLAUDE.md table | make all 7 KH surfaces consistent (some context-only, no tools) |
| AI — Autotagging / Tags / Vectors / Duplicates | B | `autotagging…:450`, `tags…:358`, `vector-management…:234`, `duplicate-detection…:287` | add tools where context-only; enrich domain context |
| AI — Overview / Agents / Prompts / Models / MCP | D→ | (no agent context) | add `SetAgentContext` to the primary AI admin tabs |
| Component Studio / Form Studio (Form Builder) | A (+B partial) | `form-builder-resource.component.ts:39,725,827` | **missing tool suite** — register canvas-edit tools (add/delete field, toggle required, sections…) |
| Predictive Studio | A | `predictive-studio-dashboard.component.html:61` | per-panel context + training/pipeline tool suite |
| Chat (conversations workspace) | A | `explorer-app.component.ts:140-147` | richer client context for the workspace itself |
| Realtime Recordings / Meet | C | dedicated realtime dashboards | orthogonal; lower priority for this rollout |

### Long tail (status D — nothing today)

Home, Actions, Admin, Bulk Operations, Communication, Credentials, Data Explorer, File Browser, Integrations, Lists, Permissions, Scheduling, Testing, Version History, Archiving, Feedback.

High-value tool candidates in the tail: **Bulk Operations** (`ExecuteBulkOperation`), **Data Explorer** (`RunDataQuery`/`ExportCSV`), **Testing** (run/inspect), **Scheduling** (`TriggerScheduledJob`/status), **Lists** (`GetRecordsByList`), **Actions** (`ExecuteAction`). The rest get read-only context at most.

## Rollout tiers

- **Tier 1 (enrich existing):** the 7 KH + 4 AI surfaces already wired — upgrade their `SetAgentContext` payloads to populate the new `AppContextSnapshot.View`/`Capabilities`, fill in missing tools. Low effort, high signal.
- **Tier 2 (finish the studios):** Form Builder canvas-edit tool suite; Predictive Studio per-panel context + tools; AI admin tabs get context. Higher effort, flagship surfaces.
- **Tier 3 (long tail):** the high-value D apps get a narrow tool set + context using the Tier-1 template; remaining D apps get baseline location/selection context only.

Each tier is independently shippable. Exhaustive per-surface task breakdown is produced at the start of this phase (the inventory above is the high-level prepopulation the user asked for).

## Governance — keep it rich automatically (the durable part)

Three mechanisms so new/updated apps stay rich without anyone remembering:

### G1. Promote the dashboards CLAUDE.md rule from "KH-only" to "every dashboard"
`packages/Angular/Explorer/dashboards/CLAUDE.md` currently documents the context/tools pattern as a Knowledge-Hub convention (≈ lines 97–117). Rewrite it as a **mandatory baseline for every `BaseResourceComponent` / `BaseDashboard`**, tied to the new substrate:

> **Every dashboard MUST publish client context and register client tools.** In `ngAfterViewInit()` (and on every meaningful state change) call `SetAgentContext(this, {...})` to populate the `AppContextSnapshot` (location via App/nav, plus `View` + `Capabilities`), and `SetAgentClientTools(this, [...])` to register the surface's agent-actionable operations. One call lights the surface up for both the async chat agent and the realtime co-agent. A surface that skips this leaves the agent blind to its state and unable to act in it. Keep context ≤ ~15 salient fields; send deltas. Reference: the unified resolver + `ClientContextChannel` (plans/realtime-client-context-coagent). Examples: `analytics-resource` (context+tools), `form-builder-resource` (embedded chat + context).

Keep the per-surface table, but make it a living registry of which surfaces are wired (so gaps are visible in review).

### G2. Bake it into the scaffold skill
The `scaffold-mj-dashboard` skill generates new dashboards. Update its template + checklist so **every scaffolded dashboard is born** with: a `PublishContext(...)` call stub in `ngAfterViewInit()`, a `RegisterClientTool(...)` example, and the `super.ngOnInit/ngOnDestroy` wiring. New apps are rich by default — the "automatic" the user asked for.

### G3. Lightweight enforcement (optional, recommended)
Add a check (mirroring the `check:ui` gates) that flags `BaseResourceComponent`/`BaseDashboard` subclasses with no context-publish call — a warning in review, not a hard gate initially. Prevents silent drift back to status D.

## Tasks
1. Converge `NavigationService.SetAgentContext/SetAgentClientTools` onto the extended `AppContextSnapshot` + unified resolver, and route the realtime channel publish through the same call (no parallel API).
2. Produce the exhaustive per-surface inventory (extend the table above to every nav item) and check each surface's actual wiring.
3. Tier 1 → Tier 2 → Tier 3 rollout.
4. G1 CLAUDE.md rewrite + G2 scaffold-skill update + G3 optional check.

## Tests / verification
- Per-surface: the realtime co-agent, on that surface, can read its context and invoke at least one registered tool (manual `verify` pass on flagship surfaces).
- Governance: a freshly scaffolded dashboard compiles with a working context publish + one tool out of the box.
- Regression: the existing `SetAgentContext`/`SetAgentClientTools` consumers keep working after convergence.

## Risks / notes
- **Don't fork the surface API** — the single biggest risk is shipping `PublishContext` alongside the live `SetAgentContext`. Converge them.
- **Token budget** — universal context means many surfaces streaming manifests; rely on Move 3's delta + trim + cap, and log trims.
- **Security** — registering a tool ≠ authorizing it; the agent still passes per-tool/per-agent authorization. The manifest is affordance, not permission (mirror Move 4's note).
