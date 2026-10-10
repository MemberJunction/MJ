# Idea 1: "Show Me How" — Guided Walkthroughs That Teach the Software, Not Just Document It

**Week of 2026-10-10 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world

Associations and nonprofits run on people who come and go: part-time admins, seasonal staff, board
treasurers, volunteers who give four hours a month. Sector sources put nonprofit voluntary turnover
around a quarter of staff per year and note that constantly re-training newcomers "puts a significant
dent in the annual budget" ([Bloomerang](https://bloomerang.com/blog/4-ways-to-create-a-better-volunteer-onboarding-journey),
[VolunteerHub](https://volunteerhub.com/blog/combat-volunteer-coordinator-turnover-with-volunteerhub)
— vendor sources, directional only). Every departure takes the *tacit procedure* with it: "here is
how **we** record a pledge", "this is the order we process renewals".

Enterprises solve this with digital-adoption platforms (Pendo, WalkMe, Appcues — now with AI guide
builders) that cost real money and months of setup. A small organization cannot buy that, and a
framework that ships a rich UI but no way to *teach* it leaves the newest, least-trained person alone
in front of the most complex screen. When the person is stuck, the cost is not a support ticket — it
is a donor receipt that never goes out.

## What already exists (and what doesn't)

- **Stable, metadata-driven UI.** Generated forms are built from `EntityField`/`GeneratedFormSection`
  (`guides/FORMS_ARCHITECTURE_GUIDE.md`), so an entity+field is already a stable address for
  most of what people touch — we don't need brittle CSS selectors.
- **Explorer sitemap + `NavigationService`** (`plans/explorer-sitemap.md`) give routes a name.
- **Agents and the realtime co-agent** can already look at what the user sees
  (`plans/realtime-client-context-coagent`, `guides/REALTIME_CO_AGENTS_GUIDE.md`) — an agent *telling*
  you how is easy; an agent *pointing at the screen* is not.
- **Feedback dialog** (`packages/Angular/Generic/feedback`) routes problems *to developers*; nothing
  helps the user *before* they get stuck.
- **Gap, verified:** repo search finds no tour/walkthrough/coach-mark infrastructure in
  `packages/Angular` (no shepherd/driver.js/intro.js dependency, no walkthrough entity).

## Proposal — Walkthroughs as metadata, recorded by doing, repaired by CI

A walkthrough is a short, named, role-targeted sequence of highlighted steps that **runs on the real
screen with the real data**, can be paused at any time, and never blocks work.

### 1. Data model (additive)
| Entity | Purpose |
|---|---|
| `MJ: Walkthroughs` | Name, Description, Status (Draft/Published/Retired), Version, `AppliesToRoleID?`, `AppliesToApplicationID?`, `Trigger` (Manual / FirstVisit / AgentOffered), EstimatedMinutes, `OwnerUserID`. |
| `MJ: Walkthrough Steps` | WalkthroughID, Sequence, `TargetType` (`Field` \| `Section` \| `Button` \| `NavItem` \| `Anchor`), `TargetEntityID?`+`TargetFieldName?` or `AnchorKey`, `RouteHint`, Title, BodyMarkdown, `AdvanceOn` (Click / ValueEntered / RouteChanged / Manual), `FallbackText` (shown when target is absent, e.g. FLS-hidden field). |
| `MJ: Walkthrough Progress` | UserID, WalkthroughID, Version, LastStepSequence, CompletedAt?, DismissedAt?. Powers "resume where I left off" and "who has done onboarding" (per-user only; never a surveillance score). |

All three ship via `metadata/` + `mj sync push`, so an organization's own procedures travel with its
configuration and across environments like any other metadata. (PostgreSQL counterparts are
build-engineer toolchain work per the repo's `CLAUDE.md`; this plan ships T-SQL only.)

### 2. Runtime — a Generic Angular widget (L1), hosted by Explorer (L3)
- New package `@memberjunction/ng-walkthroughs`: `WalkthroughService` (start/pause/resume/skip),
  `<mj-walkthrough-spotlight>` overlay and `<mj-walkthrough-launcher>` ("Show me how" menu).
  No Router import (per `packages/Angular/Generic/CLAUDE.md`); the Explorer shell supplies navigation
  through an injected `WalkthroughNavigator` interface, so the engine also works in non-Explorer apps.
- Targets resolve through a small `AnchorRegistry`: form fields self-register as
  `entity:Contacts.Email`; any hand-built component opts in with a `mjAnchor="…"` directive.
- Spotlight is **non-modal**: the user can type, click, scroll and navigate; the coach card follows.
  No focus trap; `Esc` always dismisses; announces via an `aria-live` region; honours
  `prefers-reduced-motion`; all text is localizable markdown. Satisfies the framework's accessibility
  direction instead of fighting it.
- Steps advance on *real* events (`ValueEntered` on the target field), so the walkthrough teaches by
  letting the user do the real thing — with real validation — rather than watching a slideshow.
- FLS/permissions respected: if the user can't see a target, the step shows its `FallbackText`
  ("Your role can't edit Fund Code — ask the treasurer") instead of pointing at nothing.

### 3. Authoring — three ways, from least to most effort
1. **Record mode.** An author turns on "Record a walkthrough", performs the task once; MJ captures the
   sequence of routes, entity fields touched and buttons pressed, then an LLM drafts titles and
   one-sentence explanations from entity/field *descriptions already in metadata* (so the words match
   the organization's vocabulary). The author edits in a side-by-side editor and publishes.
2. **Agent-composed on demand.** "How do I add a volunteer?" → an agent that knows the sitemap and
   entity metadata proposes an ad-hoc walkthrough (never persisted unless someone promotes it).
3. **Hand-written** in the metadata JSON for developers/consultants shipping templates.

### 4. Preventing "tour rot" (the reason most in-app guides die)
A scheduled `WalkthroughHealthCheck` (using the existing Scheduling driver pattern) replays every
published walkthrough's anchors against the current build/metadata (static resolve first; optional
Playwright replay in CI). Broken steps open a work item for the walkthrough owner and the launcher
shows "Updated guide coming soon" instead of a broken spotlight. After a deploy that renames a field,
the owner hears about it before a volunteer does.

### 5. Closing the loop for admins (privacy-respecting)
Aggregate-only analytics: "Step 4 of *Record a pledge* is where 38% of people stop" — a prompt to fix
the *software or the wording*, not to rank people. Per-user progress is visible to that user and their
administrator for onboarding checklists only.

## Phased rollout
1. **P1 (2–3 wks)** — entities, `AnchorRegistry`, spotlight + launcher, hand-written walkthroughs
   shipped for 3 core flows ("Find a record", "Edit and save", "Build a view").
2. **P2** — Record mode + AI copy drafting + editor in Explorer admin.
3. **P3** — Health check job, aggregate analytics, agent-composed walkthroughs, "Show me" tool
   exposed to agents (action: `StartWalkthrough`).

## Success measures
Time-to-first-successful-save for new users; support/feedback tickets tagged "how do I"; share of
walkthroughs with zero broken anchors; completion rate by step.

## Risks / open questions
- Anchor stability for hand-built (non-generated) components → mitigated by opt-in directive + health check.
- Mobile app (React Native) parity — out of scope for P1; the data model is renderer-agnostic.
- Should walkthroughs be shareable across tenants/orgs as "starter packs"? (Likely yes via metadata packs; defer.)
- Not a LMS: no quizzes/certification in v1.

## Mockup
[`mockups/idea-1-walkthrough.html`](./mockups/idea-1-walkthrough.html) — a volunteer mid-walkthrough on a
real-looking record form, plus the Record-mode authoring editor and the tour-health panel.
