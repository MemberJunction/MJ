# UI Consistency — Key Results

> Measurable Key Results for the UI consistency program. Each KR is structured to enter into Align without modification: **Start = 0, Target = positive number**, progress measured by items completed.
>
> Detail / dependencies / effort sizing live in [`ui-consistency-okrs.md`](ui-consistency-okrs.md).

**Owner**: Matt Chriest
**Parent Priority**: Drive cross-app UI consistency in MJ Explorer

---

## Component consolidation

### Empty-state messages using one shared design
- **Start**: 0 | **Target**: 102
- 102 places in the app currently show "no data" / "no results" messages with their own bespoke styling. Migrate all to a single shared empty-state component.

### Right-side detail panels using one shared design
- **Start**: 0 | **Target**: 12
- 12 dashboards currently have their own bespoke right-side panels (about 1,000 lines of one-off styling code). Migrate to one shared detail-drawer component.

### Card layouts using one shared, reusable card design
- **Start**: 0 | **Target**: 23
- 23 card patterns across the app are copy-pasted markup. Extract them into one shared card component (covering the 3 main visual styles). 3 specialized cards (action, integration, tag) intentionally stay separate.

### Confirmation dialogs using one shared design
- **Start**: 0 | **Target**: 3
- 3 bespoke "are you sure?" dialogs migrated to one shared component.

### Status indicators using one shared design
- **Start**: 0 | **Target**: 6
- 6 bespoke "active / pending / error / running" indicators migrated to one shared component.

### Badges and pills using one shared design
- **Start**: 0 | **Target**: 69
- 69 of 79 small status / notification badges replaced with one shared badge component. ~10 specialized one-offs allowed.

### Alert and warning banners using one shared design
- **Start**: 0 | **Target**: 5
- 5 bespoke alert patterns (error banners, edit-mode banners, health banners, validation, generic alerts) migrated to canonical components.

### Expandable sections using one shared design
- **Start**: 0 | **Target**: 29
- 29 files each built their own expand/collapse pattern. Migrate to one shared collapsible-section component.

### Form sections using one shared design
- **Start**: 0 | **Target**: 29
- 29 files manually built their own form layout markup. Migrate to one shared form-section component.

### Overview-page stat cards using one shared design
- **Start**: 0 | **Target**: 10
- 10 overview pages each reinvent their own stat-tile grid. Migrate to one shared stat-tile component.

### Record-picker dialogs using one shared design
- **Start**: 0 | **Target**: 9
- 9 bespoke "pick a record / template / entity" pickers migrated to one shared selector component.

---

## Adoption percentage milestones

Each KR is a yes/no milestone: 0 = below 80%, 1 = at or above 80%. Live percentage progress is tracked separately by the monthly measurement script.

### Standard button design used on at least 80% of buttons
- **Start**: 0 | **Target**: 1
- April 15 baseline: 24%.

### Standard toggle switch design used on at least 80% of switches
- **Start**: 0 | **Target**: 1
- April 15 baseline: 5%.

### Shared loading indicator used on at least 80% of loading states
- **Start**: 0 | **Target**: 1
- April 15 baseline: 49%.

### Standard text input styling used on at least 80% of text inputs
- **Start**: 0 | **Target**: 1
- April 15 baseline: 36%.

### Standard checkbox styling used on at least 80% of checkboxes
- **Start**: 0 | **Target**: 1
- April 15 baseline: 17%.

### Standard numeric input used on at least 80% of numeric fields
- **Start**: 0 | **Target**: 1
- April 15 baseline: 50%.

### Standard date picker used on at least 80% of date fields
- **Start**: 0 | **Target**: 1
- April 15 baseline: 58%.

---

## Automation / CI

### Automated quality checks preventing inconsistency
- **Start**: 0 | **Target**: 4
- 4 automated checks running on every code change: hardcoded color enforcement, page-layout enforcement, button-style override prevention, bespoke-pattern detection.

### Monthly progress measurement running
- **Start**: 0 | **Target**: 1
- A script that produces current adoption percentages on demand, running monthly and producing date-stamped reports.

### AI-assisted developer shortcuts for MJ-specific work
- **Start**: 0 | **Target**: 2
- Two Claude shortcuts (skills) for scaffolding new MJ dashboards and entity forms — speeds up developer work and bakes in the standards.

---

## Audits / Discovery

### Main shell (header, nav, search, notifications, profile) reviewed
- **Start**: 0 | **Target**: 1
- Audit complete; specific work items sized.

### Workspace pages reviewed (Component Studio, Flow Editor, etc.)
- **Start**: 0 | **Target**: 1
- Audit complete; shared patterns identified and added to backlog.

### Record-detail pages reviewed (entity forms)
- **Start**: 0 | **Target**: 1
- Audit complete; shared patterns identified and added to backlog.

---

## List page consistency

### List pages with the standard set of controls
- **Start**: 0 | **Target**: 44
- All 44 "list of records" pages have the same controls (search, refresh, primary action, etc.) in the same place. Documented exceptions allowed where data shape forces it.

### Pages that previously only showed cards now also have a list view
- **Start**: 0 | **Target**: 12
- Per the "list-as-default" direction — 12 pages that currently only have a card view get a list view added.

### Standard card-grid layout applied across list pages
- **Start**: 0 | **Target**: 1
- Yes/no milestone: same cards-per-row count and grid behavior across all pages with card views.

---

## Main shell

### Notifications panel using standard MJ design
- **Start**: 0 | **Target**: 1
- Rebuilt to use the shared design system (no more one-off styling).

### About MJ and profile dialogs using the standard dialog design
- **Start**: 0 | **Target**: 2
- Both dialogs migrated to the shared dialog component. May reduce to 1 if the profile dialogs are deduplicated.

### Unified brand color across all apps *(pending stakeholder buy-in)*
- **Start**: 0 | **Target**: 1
- Yes/no milestone: per-app color accents (the "rainbow") removed; all apps use the single brand color.

---

## Notes

- All KRs go **0 → N**, so progress shows as upward movement in the tool.
- **Count KRs** — Target = total items to accomplish (e.g., 102 pages, 12 dashboards).
- **Yes/no milestone KRs** — Target = 1, captures a binary outcome (reached threshold, audit completed, gate shipped).
- Current values filled in by the monthly measurement script once that ships.
