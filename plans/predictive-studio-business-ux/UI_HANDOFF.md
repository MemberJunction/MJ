# Predictive Studio — UI Handoff

**For:** Barnatt (taking the Predictive Studio UI to the finish line)
**From:** the business-UX pass (branch `predictive-studio-ux`)
**Last updated:** 2026-06-30

This doc explains **what's built in the UI today, how it's wired, the conventions to keep, and what's
left**. The deep platform (feature assembly, training, scoring, the agent) is documented separately in
[`guides/PREDICTIVE_STUDIO_GUIDE.md`](../../guides/PREDICTIVE_STUDIO_GUIDE.md) — **read §16 of that guide first**; this is the UI-specific
companion. The design lineage (brief → 3 divergent mockups → locked direction) lives next to this file:
[`design-brief.md`](design-brief.md), [`design-plan.md`](design-plan.md), and `mockups/` (the locked one is
`mockups/option-b-refined.html` — open it in a browser; it's the visual spec for the Predictions surface).

---

## TL;DR — current state

The app went from a **techie 8-tab tool** to a **business-first 3-door app**:

| Door | DriverClass | What it is |
|------|-------------|-----------|
| **Predictions** (default) | `PredictiveStudioPredictionsResource` | The business front door — a catalog of published models reframed as plain-language predictions, a **trust-gated** workspace, and a "+ New prediction" agent co-pilot. Zero ML jargon. |
| **Studio** | `PredictiveStudioStudioResource` | The analyst workbench — an internal left-nav (Overview · Build[Pipelines, Algorithm Catalog] · Run[Experiments, Compare Runs]) + a docked Model Dev Agent co-pilot. |
| **Models** | `PredictiveStudioModelsResource` | The trained-model lifecycle — an internal left-nav (Model Registry · Models in Production). |

All three live in `@memberjunction/ng-dashboards` under
[`packages/Angular/Explorer/dashboards/src/PredictiveStudio/`](../../packages/Angular/Explorer/dashboards/src/PredictiveStudio/).
Nav items are defined in [`metadata/applications/.predictive-studio-application.json`](../../metadata/applications/.predictive-studio-application.json) (already pushed to the dev DB).

**The big idea: progressive disclosure.** A non-technical user only ever needs *Predictions*. Everything
ML-shaped (pipelines, algorithms, experiments, registry, production) is one click into *Studio* or *Models*.
Don't undo that by promoting analyst surfaces back to the top nav.

---

## How to run & test

```bash
# build the two UI packages after any change to PS components
cd packages/Angular/Explorer/dashboards && npm run build      # the surfaces
cd packages/Angular/Bootstrap && npm run build                # only if you add/rename a @RegisterClass

# unit tests (pure logic) — run files individually; a pre-existing root vitest glob bug
# breaks the multi-file batch run (unrelated to PS):
cd packages/Angular/Explorer/dashboards
npx vitest run src/__tests__/predictive-studio-nav.test.ts        # 9  — nav model
npx vitest run src/__tests__/business-predictions.test.ts         # 5  — catalog VM + trust badges
npx vitest run src/__tests__/at-risk.test.ts                      # 4  — at-risk parsing/ranking

# e2e (needs MJAPI + MJExplorer running; persistent PW profile auth):
node e2e/predictive-studio/nav-consolidation.mjs                  # 3-door nav + Studio/Models left-navs
node e2e/predictive-studio/business-predictions.mjs               # Predictions catalog + trust gate

# if you change nav metadata:
npx mj sync push --dir=metadata --include="applications"
```

After a `@RegisterClass` add/rename, regenerate the manifests + lazy config so Explorer can find + lazy-load the class:
```bash
npm run mj:manifest:ng-bootstrap     # ng-bootstrap manifest
npm run mj:manifest:explorer         # explorer lazy-feature-config (+ a MJExplorer manifest — do NOT commit the MJExplorer one)
```

---

## Architecture map

```
PredictiveStudio/
├── resources/
│   ├── ps-resource-base.ts            ← shared base: loads the provider-scoped engine, NotifyLoadComplete,
│   │                                     publishAgentContext. Every door extends this.
│   ├── ps-predictions-resource.ts     ← Predictions door (catalog ↔ trust-gated workspace + co-pilot)
│   ├── ps-studio-resource.ts          ← Studio door (left-nav host over the build/run panels + co-pilot)
│   └── ps-models-resource.ts          ← Models door (left-nav host over registry/production)
├── components/                        ← the SECTION PANELS (standalone, [engine]-driven). Reused by the
│   │                                     door hosts; NOT registered as nav items themselves.
│   ├── ps-home / ps-pipelines / ps-catalog / ps-experiments / ps-compare / ps-registry / ps-production
│   └── ps-operate-dialog, ps-confirm-modal, ps-agent-starter-prompt (helpers)
├── engine/predictive-studio.engine.ts ← BaseEngine: caches Models/Sessions/etc. (the data layer)
├── predictive-studio.nav.ts           ← PURE nav model (door sections, grouping, routeHomeNavigate). Unit-tested.
├── business-predictions.view-models.ts← PURE: published model → catalog card + trust badge
├── at-risk.view-models.ts             ← PURE: Process Run Details → ranked at-risk rows + drivers
└── predictive-studio.types.ts         ← PSPanelKey + shared types
```

Trust logic is **shared** (UI badges + the agent's publish gate use the same rule):
[`packages/AI/PredictiveStudio/Core/src/trust.ts`](../../packages/AI/PredictiveStudio/Core/src/trust.ts) — `deriveTrustVerdict()` → Poor/Fair/Good/Excellent + a `canAct` gate.

The "+ New prediction" / co-pilot agent is the server-side **Model Development Agent** (a deterministic
builder under the hood). UI just embeds `<mj-conversation-chat-area>` pointed at it. See guide §12.4.

---

## What's BUILT (and verified)

- ✅ **3-door nav**, consolidated from 8 (metadata pushed, manifests + lazy-config regenerated).
- ✅ **Predictions catalog** — published models as cards with trust badges; Poor/unmeasured shows
  "Not ready — Needs an analyst" with Open disabled. **Verified live** (the lone Poor test model is
  correctly gated).
- ✅ **Trust-gated workspace** — verdict banner + 5-star dots, ranked at-risk list (high/med/low bars),
  "what's driving this" drivers, and a 4-action bar (Review · Save scores · Send to a list · Export).
  *Compile + unit-test verified; not yet clicked through live — see gap #1.*
- ✅ **Studio + Models left-nav hosts** — reuse the existing panels; active section round-trips through a
  `section` query param (deep links + back/forward).
- ✅ **Embedded co-pilot send** — the chat-area now has its full conversation lifecycle wiring (this was a
  real bug; see the gotcha below).
- ✅ **Trust translator** shared by UI + agent publish gate; pure VMs all unit-tested.

---

## ⚠️ Conventions & gotchas (read before editing)

1. **Embedded chat needs the conversation lifecycle, or it silently no-ops.** When you embed
   `<mj-conversation-chat-area>` with `[suppressNewConversationEmptyState]="true"`, you MUST also bind
   `[isNewConversation]` (start `true`), `[conversation]`/`[conversationId]`, and handle
   `(conversationCreated)` (capture the conversation + set `isNewConversation=false`) and
   `(pendingMessageConsumed)` (clear the seed). Without it the first send goes nowhere. The canonical
   reference is `FormBuilderResourceComponent`; both PS co-pilots (`ps-predictions-resource`,
   `ps-studio-resource`) follow it. **This was the "typing does nothing" bug.**
2. **Chrome:** these are sub-pages, so use `<mj-page-header-interior>` + `<mj-page-body-interior>`
   (NOT the full `<mj-page-layout>`/`<mj-page-header>` trio — that double-headers). Interior header has
   `Title`/`Subtitle` only (no `Icon` input). See [`packages/Angular/Explorer/dashboards/CLAUDE.md`](../../packages/Angular/Explorer/dashboards/CLAUDE.md).
3. **`NotifyLoadComplete()` is mandatory** for every `BaseResourceComponent` or the shell loading screen
   hangs on direct URL nav. `PSResourceBase` already calls it after the engine loads — don't remove it.
4. **Design tokens only — no hardcoded colors.** All PS styles use `--mj-*` tokens + `color-mix()`.
   The `npm run check:ui` gate enforces this on `.scss`; inline `.ts` styles aren't scanned, so self-police.
5. **Agent context:** the dashboards CLAUDE.md asks every surface to `SetAgentContext` (and, where safe,
   `SetAgentClientTools`). `PSResourceBase.publishAgentContext()` publishes a light snapshot today —
   deepening it is a "next" item (below).
6. **Don't instantiate the engine global directly** — `PSResourceBase` resolves a *provider-scoped*
   engine via `GetProviderInstance` (multi-provider correctness). Keep that.
7. **The panels are reused, not owned by one host.** `ps-home`, `ps-pipelines`, etc. are bound via
   `[engine]` in both the old (now-removed) wrappers' place and the new door hosts. Edit a panel = edits
   everywhere it's shown.

---

## What's NEXT (prioritized)

### P0 — finish the happy path (blocking real validation)
1. **Train + publish one trustworthy model** (Good/Fair) so the **workspace can actually be opened and
   clicked through**. Today the only published model is a deliberately-weak (AUC ~0.51) test model that's
   correctly gated, so the workspace interior (at-risk list + 4 actions) has never rendered live. This is
   a *data* gap, not a code gap — but it blocks visual verification of the whole workspace. Once a good
   model exists, run `node e2e/predictive-studio/business-predictions.mjs` and watch it open.
2. **Run the conversational build end-to-end through the chat UI.** Only the *deterministic builder* has
   been proven (via `AgentRunner` headless). The full LLM conversation ("predict who won't renew" →
   Goal Analyst → Data Scout → Experiment Designer → approve → builder → published model) has **not** been
   driven through the embedded co-pilot. Verify it lands a real pipeline + model.

### P1 — make the workspace genuinely useful
3. **At-risk list shows raw record IDs** (mono UUIDs) — resolve each to a **human label** (the member's
   name/email) from the model's target entity so the list reads like a call sheet, not a database dump.
   See `at-risk.view-models.ts` + how `ps-predictions-resource.loadAtRisk()` fetches `MJ: Process Run Details`.
4. **The 4 workspace actions are uneven.** "Save scores"/"Send to a list" route *conversationally* through
   the co-pilot (the agent does it); "Review" scrolls; "Export" is a client CSV. Consider promoting
   Save/Send to **one-click server actions** — there are Remote Ops for scheduled scoring + list creation
   (guide §15.6 / §16). A button beats a sentence the agent has to parse.
5. **"What's driving this" is GLOBAL feature importance, not per-record.** It's honest today (labeled
   generically) but a per-record explanation (SHAP-style) would be far stronger. Future platform work, but
   the UI slot is already there.

### P2 — polish & coverage
6. **Empty / loading / error states** across the Studio + Models panels. Some panels render *representative
   sample data* when the live arrays are empty (a build-speed shortcut) — for production, either clearly
   label it as sample or hide it. Audit `ps-pipelines`, `ps-experiments`, `ps-compare`, `ps-registry`,
   `ps-production`.
7. **Deepen agent context + add safe client tools** for the three doors to Data-Explorer depth, following
   the pattern + safety rules in [`packages/Angular/Explorer/dashboards/CLAUDE.md`](../../packages/Angular/Explorer/dashboards/CLAUDE.md) (read/filter/select/navigate
   only — no train/promote/delete exposed to the agent).
8. **Responsive + dark mode pass.** The docked co-pilot collapses below 1100px; verify the left-navs and
   the catalog grid at narrow widths, and spot-check dark mode (tokens should handle it).
9. **Confirm every panel is wired to live data** (not leftover sample/mocked arrays) once a real trained
   model + experiment history exist.

### Nice-to-have
10. The Studio/Models hosts have an `activeIcon` getter that's currently unused (the interior header has no
    `Icon` input). Either surface the icon some other way or drop the getter.
11. Cross-door deep links: `routeHomeNavigate` sends Overview's registry/production links to the Models
    door with `?section=`. Verify the inverse (a Models→Studio jump) reads well if you add such links.

---

## Definition of done (suggested)

- A business user can open **Predictions**, see a **trustworthy** prediction, open it, read a **named**
  at-risk list, and take one action — all without touching Studio/Models.
- "+ New prediction" builds a real model **through the conversation**, and it appears in the catalog.
- All PS unit tests green; both e2e drivers pass with **0 non-cosmetic console errors**; `check:ui` clean.
- Dark mode + narrow-width verified.

Ping me (this branch's history + the guide §16) for anything ambiguous. The bones are solid — it's
finish-work from here.
