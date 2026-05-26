# List-Page Consistency Gameplan

> **Part of the UI consistency program.** Current commitments live in [`ui-consistency-okrs.md`](ui-consistency-okrs.md). This gameplan is the *playbook* for the list-page priority — the sequence and dependencies. KRs that draw from it are tracked in the OKR doc.
>
> **Status: gameplan draft.** Drafted 2026-05-22 after the list-page inventory audit. Anchored in empirical data from [`plans/list-page-inventory.md`](list-page-inventory.md). No dates, no execution — sequence + decisions + dependencies only.
>
> This gameplan is the *how* for the list-page consistency priority. The *what* lives in [`plans/list-page-standardization.md`](list-page-standardization.md) (the proposal); the broader program catalog is in [`plans/ui-consistency-program.md`](ui-consistency-program.md).

---

## What "done" looks like

For the list-page consistency priority specifically, the program is complete when:

1. **Every list page renders via canonical components.** No bespoke chrome, no inline card templates copied across files, no ad-hoc empty states.
2. **Every list page follows the documented control set.** Search, sort, filter, refresh, view-toggle (where applicable), primary CTA — same controls, same place, same order. Page-to-page parity, with documented exceptions.
3. **Cards collapse onto a small canonical set.** The ~25 inline card patterns reduce to one `<mj-card>` (with 3 archetype variants) plus a small number of legitimately specialized cards (action, integration, tag).
4. **View modes follow a stated taxonomy.** Each list page is explicitly `card-only`, `list-only`, or `both (toggle)` — documented per page, not invented per author.
5. **Empty states use a shared component.** Zero inline empty-state markup.
6. **CI prevents regression.** New PRs can't introduce bespoke chrome, hardcoded hex, or duplicate card patterns without an explicit override.

That's the destination. The gameplan below sequences how we get there.

---

## Phase 0 — Decisions to lock before any work starts

These are *design decisions*, not implementation. Lock them first so downstream work isn't churning on shifting foundations.

### 0.1 — View-mode taxonomy (canonical)

Three modes, declared per page:

| Mode | When it applies | Pages (from inventory) |
|---|---|---|
| `card-only` | Low-volume, visually distinguishable items; scannable metadata; ≤ ~100 items typical | User Mgmt, Role Mgmt, Apps, AI Agents, MCP Servers, Models, Connections, Integration Pipelines, Schedules, Credentials Categories/Types, Agent Requests |
| `list-only` | High-volume, dense, sortable; tabular data; logs/audits | Credentials Audit, Permissions Audit Log, Lists Operations, Integration Activity, Scheduling Activity, Vector Management, Autotagging Pipeline, Diffs, Labels, Restore |
| `both` (toggle) | Variable density; different users want different views | Lists Browse, My Lists, Shared With Me, Credentials, Action Explorer, Testing Explorer, Permissions (User Access, Resource Access), Test Runs |

**Decision needed**: Confirm this taxonomy. Adjust the per-page assignments based on design judgment. Once locked, document in `list-page-standardization.md` and the chrome conventions.

### 0.2 — Exception list (out of scope for "list-page consistency")

Pages that look like lists but follow different rules:

- **Visualizations**: Cluster Visualization, Version History Graph (graph/DAG renderers)
- **Home Dashboard**: KPI summary with pinned/recent — different page type
- **Data Explorer**: meta-dashboard that renders arbitrary query results
- **Workspace pages**: Component Studio, Flow Editor, AI Test Harness, Database Designer (separate page type, separate gameplan)
- **Embedded chat surfaces**: Conversations / Collections / Tasks (list sidebars within a chat UI)
- **Dashboard Browser**: needs manual verification before assigning

**Decision needed**: Confirm the exception list. Move "Dashboard Browser" off the unknown column with a manual read.

### 0.3 — Card archetype slot contracts

The 25 inline card patterns collapse to 3 archetypes:

**Archetype A — Icon + Title + Meta + Actions** (~12 cards)
- Left icon (FA class or themed circle)
- Primary title (bold)
- Optional sub-title / description
- Meta row: 1–3 small fields (status badges, dates, counts)
- Right-side actions (chevron OR action menu)
- *Examples*: Request, Role, Schedule, Job, Query, MCP, Model, Pipeline, Activity entry

**Archetype B — Avatar + Identity + Status** (~5 cards)
- Left avatar / initials
- Identity block: name (primary) + email or sub-text (secondary)
- Status badge (active/inactive/pending)
- Optional bulk-select checkbox
- Action menu on hover/click
- *Examples*: User, Permission, Test Review item, Application

**Archetype C — Compact List Item** (~6 cards)
- Single-line layout
- Timestamp (leading)
- Label / action
- Status indicator (icon or dot)
- Optional right-side detail
- *Examples*: Audit entry, Activity entry, Conversation, Label, Version, Operation log

**Decision needed**: Confirm the three archetypes are the right cut. Decide whether to ship them as one `<mj-card>` with `Variant` input, or as 3 separate components (`<mj-record-card>`, `<mj-identity-card>`, `<mj-list-item-card>`). Single-component approach is more elegant but harder to design well; multi-component is simpler but proliferates the API surface.

### 0.4 — Specialized cards staying separate

Three existing cards are genuinely specialized and shouldn't fold into the canonical archetypes:

- `mj-action-card` — has AI-generated badge, category links, complex tag display
- `mj-integration-card` — brand colors, sync status, test result inline
- Tag card (currently inline; multi-form per Tags tab)

**Decision needed**: Confirm these stay separate. Document why in the archetype design (avoids future authors wondering "shouldn't this fold in too").

### 0.5 — Empty-state variants

From earlier discussion: 3 variants — `empty` (no data yet), `no-results` (filter narrowed everything away), `error` (something went wrong).

**Decision needed**: Confirm 3 is right. Possibly a 4th: `loading` (initial fetch, before content exists) — though `<mj-loading>` may cover that.

### 0.6 — Bulk-action policy

Inventory shows bulk actions on User, Role, Credential only. Pages that could benefit but don't have it: Apps, MCP, Schedules, Pipelines, Connections, possibly more.

**Decision needed**: Should bulk actions be a *required* capability on every `card-only` and `both` list page, or *opt-in* per page based on need? If required, the bulk-action toolbar becomes a foundation component.

### 0.7 — The list-page control contract

Codify what every list page MUST have, with documented exceptions:

| Control | Required? | Notes |
|---|---|---|
| `<mj-page-search>` | Required | Unless the page has < ~10 items always |
| `<mj-refresh-button>` | Required | Always |
| Primary CTA | Required | Unless read-only |
| `<mj-view-toggle>` | Required IF `both` mode | Otherwise omit |
| `<mj-filter-popover>` + chips | Required IF page has filterable dimensions | Otherwise omit |
| Sort control | TBD | Currently scattered; needs a canonical home |
| Export | Optional | Pages with operational data |
| Stat badge (X of Y) | Required if filterable | Else simple count or omit |
| Empty state | Required | Always |
| Bulk actions | Per 0.6 | TBD |

**Decision needed**: Lock the contract. This is the spec the CI gate will eventually enforce.

---

## Phase 1 — Foundation (smallest, highest leverage)

Once Phase 0 decisions are locked, the foundation phase is cheap and unblocks everything else.

### 1.1 — `<mj-empty-state>` component
- Universal gap (zero list pages have a shared component today)
- Smallest component scope in the catalog
- Migrate ~10 highest-visibility consumers as reference set
- Full 102-instance migration is downstream work (Phase 5)

### 1.2 — View-mode taxonomy documented
- Update `list-page-standardization.md` with Phase 0.1's taxonomy
- Update chrome conventions to reference it
- No code; just documented decisions

### 1.3 — List-page control contract documented
- Phase 0.7's contract written into `list-page-standardization.md`
- Becomes the spec for Phase 4's CI gate

### 1.4 — CI hex gate
- Prevents regression while new work ships
- Doesn't depend on anything in Phase 0
- Could ship in parallel with anything

**Phase 1 unblocks Phase 2.** No work in Phase 2+ should start until Phase 1 lands — otherwise we're building on a foundation that can shift.

---

## Phase 2 — Card consolidation (one continuous block)

Per direction (2026-05-22): tackle all 3 archetypes at once, not split across phases. This is the largest single block in the gameplan.

To preserve fail-fast on a multi-archetype design, the block is internally sequenced as: thorough up-front survey → pilot one card from each archetype → bulk-migrate the rest.

### 2.1 — Lock slot contracts against all 23 consumers (the "Phase 0 deepening")

This is `C-0` in the master roadmap. The original Phase 0.3 of this gameplan said "confirm the 3 archetypes are right." Now that we're committing to all three at once, the survey has to be more thorough.

- Survey all 23 inline card templates side-by-side (data already collected in `list-page-inventory.md` — extend with field-level detail per consumer).
- For each archetype, draft slot contracts that satisfy every consumer in that archetype without escape hatches.
- Paper-prototype the contracts against every consumer before any code is written.
- Lock single-component-with-variants vs. three-separate-components decision (default proposed: three separate components — `<mj-record-card>` / `<mj-identity-card>` / `<mj-list-item-card>` — to keep slot APIs cohesive within each archetype).
- Document specialized cards (action, integration, tag) staying outside the consolidation.

**Effort**: ~3 days. **Risk**: HIGH if rushed — design failures here are expensive after build starts.

### 2.2 — Pilot one card from each archetype

The fail-fast checkpoint. Build the components, migrate one consumer per archetype, validate the slot contracts work in real consumers before bulk-migrating 20 others.

- Build the canonical component(s) for all 3 archetypes
- Migrate **3 pilot consumers** — one per archetype:
  - User card (Avatar + Identity + Status)
  - Schedule card (Icon + Title + Meta + Actions)
  - Audit entry (Compact List Item)
- Light + dark theme validate on the 3 pilots
- If any slot contract failed in pilot, **revise before continuing to bulk migration**. Cheap insurance.

**Effort**: ~3 days. **Risk**: Medium — first time the slot contracts meet real code.

### 2.3 — Bulk-migrate the remaining ~20 consumers

Pattern proven by 2.2; this is mechanical. Each migration deletes the inline template as the canonical component takes over.

**Per archetype**:

- **Avatar + Identity + Status** (~4 remaining after pilot): Role, Application, Permission card, Test Review item
- **Icon + Title + Meta + Actions** (~11 remaining after pilot): Request, Job, Pipeline, Query, MCP server, Model, Activity entry, Vector card, Tag card (basic), Test run card, Test case card
- **Compact List Item** (~5 remaining after pilot): Audit entry (Permissions side), Activity entry × 2 (Integration + Scheduling), Conversation item, Label card, Version card

**Effort**: ~16 days. **Risk**: Low (pattern proven in pilot).

### 2.4 — Specialized cards stay separate

`mj-action-card`, `mj-integration-card`, Tag card (multi-form) remain as bespoke components. Confirmed in Phase 0.4. Document why in `list-page-standardization.md` so future authors don't wonder why they weren't consolidated.

---

## Phase 3 — (removed — merged into Phase 2)

Phases 2 + 3 of the earlier gameplan have been collapsed per the "all cards at once" direction (2026-05-22). The card consolidation work is now a single 22-day block in Phase 2 above, internally sequenced as survey → pilot → bulk.

---

## Phase 4 — List-page contract enforcement

By this point, the visual layer is largely consolidated. Now lock it down.

### 4.1 — Address the chrome outliers
- **ActionListViewComponent**: migrate to shared chrome (no chrome today)
- **APIKeys hybrid**: decide overview-vs-list separation; align with chrome conventions
- **Dashboard Browser**: read template, classify, migrate if needed
- **Connections**: confirm intentional `[meta]` omission; document if so

### 4.2 — CI gate: chrome trio enforcement
- Fail PRs introducing list-page resource components without `<mj-page-layout>` / `<mj-page-header>` / `<mj-page-body>` (with exception list)

### 4.3 — CI gate: bespoke chrome detection
- Flag PRs introducing new `.detail-panel-*`, `.section-header`, `.empty-state`, `.card-grid` CSS patterns
- Points contributors to the canonical components

### 4.4 — Update chrome-conventions.md
- Add a Section 12 (or similar) on list-page contract
- Reference the taxonomy, the control set, the archetype card shapes

---

## Phase 5 — Migration tail and bulk actions

The work that doesn't fit neatly into earlier phases.

### 5.1 — Migrate the remaining ~92 empty-state inline patterns
- Phase 1 did 10 references; this is the full sweep
- Mechanical; runs in parallel with Phase 4

### 5.2 — Bulk-action toolbar (if Phase 0.6 says required)
- Build `<mj-bulk-action-toolbar>` with selection state binding
- Add to Apps, MCP, Schedules, Pipelines, Connections, and any other identified candidates

### 5.3 — Sort control standardization
- Phase 0.7 marked sort as TBD
- Decide: dropdown in `[actions]`? Inline column-header sort? Inside filter popover?
- Implement and migrate

---

## Phase 6 — Hand off to next priority (workspace pages)

Once the list-page priority is closed (or close to it), the next priority needs its own gameplan. Workspace pages and record-detail pages are the obvious next discoveries.

### 6.1 — Workspace pages audit
- Solo audit via Explore agent (acknowledged shallower than engineer-paired)
- Output: similar inventory artifact for workspace pages
- Identifies the canvas / palette / inspector / properties-panel patterns

### 6.2 — Record-detail pages audit
- Similar approach
- Most are generated entity forms (templated identically); 7 custom forms get the deep pass

### 6.3 — Build a next-priority gameplan
- Same shape as this one
- Phase 0 decisions, then sequenced phases

---

## What's NOT in this gameplan

These exist but aren't part of the list-page priority:

- `<mj-detail-drawer>` and the 12 right-side panel migrations (separate UX issue, has its own contract in chrome-conventions Section 11)
- `<mj-stat-tile>` for Overview pages (different page type)
- Adoption-percentage push (button, switch, loading) — separate workstream
- Workspace and record-detail audits (Phase 6, after this priority lands)
- Brand color verification, icon vocab audit, typography audit (broader visual identity work)
- Entity-forms launch-path retrofit (architectural, multi-quarter)

These remain in the master catalog ([`plans/ui-consistency-program.md`](ui-consistency-program.md)) but don't need decisions for this gameplan to move forward.

---

## Open questions / blockers

Things that prevent Phase 0 from closing:

1. **Naming convention for cards** (Phase 0.3): single `<mj-card>` with variant, or three separate components? Affects API design and downstream migration ergonomics.
2. **Bulk action policy** (Phase 0.6): required on every card-only/both page, or opt-in?
3. **Sort control home** (Phase 0.7 / Phase 5.3): where does sort live in the chrome?
4. **Dashboard Browser status**: needs manual verification to classify.
5. **Engineering input** (long-term): some decisions probably benefit from a conversation with the engineers who own Action Explorer (most complex chrome) and Connections (intentional `[meta]` omission). Not blocking, but quality of decisions improves.

---

## Relationship to other artifacts

```
This gameplan  →  list-page-standardization.md (the proposal — gets updated as Phase 0 decisions lock in)
              ↘
                chrome-conventions.md (gets a new section in Phase 4 documenting list-page contract)
              ↘
                ui-consistency-program.md (catalog items A1, A12 get refined contracts and updated tiers)

list-page-inventory.md (the data) feeds all of the above
```

---

## Cadence of decisions vs. execution

Phase 0 is *purely decisions*. No code. Even running solo, this phase can be worked through in 2–4 hour blocks of focused thinking. Each decision (0.1 through 0.7) can be locked individually; they don't all need to happen at once.

Phases 1–5 are execution. They're sequenced because dependencies are real:
- Can't migrate cards without the archetype design (Phase 0.3 → Phase 2)
- Can't enforce a contract that isn't documented (Phase 0.7 → Phase 4)
- Can't do bulk migration without proof the contract works (Phase 2 → Phase 3)

The honest order of operations is: **lock the decisions, ship the foundation, prove the consolidation pattern on the easiest archetype, then bulk-migrate, then enforce.**

That's the gameplan.
