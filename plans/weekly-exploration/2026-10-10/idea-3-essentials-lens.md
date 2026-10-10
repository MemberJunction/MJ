# Idea 3: The Essentials Lens — Every Screen Can Be Calm for the People Who Only Need the Basics

**Week of 2026-10-10 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world

A powerful data platform's greatest strength is its greatest barrier to occasional users. A board
member checking a member's status, a volunteer logging a visit, a chapter officer confirming an
address — each opens a form with 60 fields, 14 sections and 9 related panels, and each concludes
"this system isn't for me". Staff then export to spreadsheets, and the data quality the organization
paid for erodes. Usability research calls the fix *progressive disclosure*: show the few things most
people need, one click from the rest. Consumer apps do this by default; business frameworks rarely do,
because the person who knows which fields matter is not the person who built the form.

MJ already generates a complete form and grid for **every** entity. That completeness is a feature for
the data steward and a wall for everyone else.

## What already exists

- `EntityField` knows `DefaultInView`, `IncludeInGeneratedForm`, `GeneratedFormSection`, `IsNameField`,
  `AllowsNull`, plus a free-form **`Configuration` JSON** column — a ready home for per-field hints
  without a schema change.
- Forms support **variants** with a per-user, per-entity persisted choice via `UserInfoEngine`
  (`mj.formVariant.<entity>`, `FORMS_ARCHITECTURE_GUIDE.md`), a section manager (hidden flags, order),
  and the form-chrome policy layer (`packages/Angular/Generic/base-forms/src/lib/chrome`).
- Grids have default-visible columns; nav has application grouping.
- **Gap, verified:** nothing expresses *how essential* a field/section/nav item is, and no per-user
  "show me less" switch exists. Variants are author-built alternates (work per entity), not a
  cross-cutting, metadata-light mode.

## Proposal — a presentation-only "lens" with three tiers

**Tiers:** `Essentials` · `Standard` · `Everything`. Each field, form section, related panel, grid
column and nav item can carry a tier. Untagged items default to `Standard`.

### How tiers get assigned (nobody hand-tags 4,000 fields)
1. **Heuristic first draft at CodeGen/metadata time:** primary name field, required fields,
   `DefaultInView` columns, first-section fields, and high fill-rate fields → Essentials; system/audit
   columns, JSON blobs, encrypted, raw IDs, and >95%-empty fields → Everything.
2. **Usage evidence (opt-in, aggregate):** which fields people actually edit/filter by feeds a ranked
   suggestion list per entity.
3. **AI proposal with human review:** a steward sees "Contacts: 9 Essentials, 17 Standard, 31 Everything"
   with reasons and approves/adjusts in a *Lens Designer* (live preview). Stored in
   `EntityField.Configuration.experienceTier` and `…Section` metadata — shipped via `mj sync`.

### How people use it
- A single, unmistakable **Lens switch** in the form chrome and the user menu: *Essentials / Everything*.
  Default comes from role (board/volunteer roles → Essentials; staff → Standard; admins → Everything);
  a person's explicit choice always wins and persists via `UserInfoEngine`.
- Forms collapse hidden content into one honest row — **"Show 31 more fields"** — never silently
  dropping anything. Grids show the Essentials columns; related panels collapse under "More".
- App nav groups Advanced items under "More tools".
- Agents and walkthroughs read the lens so the assistant talks about the three things on screen, not 60.

### Non-negotiable guardrails
1. **Presentation only. Never security.** The lens does not grant, deny, or hide for authorization; FLS
   and RLS stay the only access mechanisms. (Avoids anyone mistaking "hidden" for "protected".)
2. **Never hide what's required to save or what's wrong:** required-and-empty and validation-error
   fields auto-reveal with a visible reason; a failed save expands the section containing the error.
3. **Search and deep links still find everything**; opening a record to a hidden field reveals it.
4. Fully keyboard/screen-reader operable; the collapse state is announced; no content is removed from the DOM
   semantics in a way that breaks reading order.
5. Reversible and obvious: the active lens is always labeled; "Everything" is one click away.

## Why this matters beyond one org
It turns MJ's "complete by default" generation into "appropriate by default", which is the difference
between a database people tolerate and a tool they open on purpose — especially for the occasional,
non-technical contributors that associations and nonprofits depend on.

## Phased rollout
1. **P1** — tier vocabulary in `Configuration`, heuristic assigner in CodeGen (metadata-only), lens
   switch + "show N more" in the form container and entity grid, `UserInfoEngine` persistence.
2. **P2** — role-based defaults, Lens Designer (steward UI with live preview), nav "More tools".
3. **P3** — aggregate usage-based suggestions; agent/walkthrough integration.

## Success measures
Median time-to-first-save for Essentials-lens users; fraction of forms where Essentials ≤ 12 fields;
reduction in "export to spreadsheet" for simple lookups; no increase in validation-failure rate
(proof that guardrail 2 works).

## Risks / open questions
- Teams with strong opinions about which fields matter → solve via the Designer, not a global default.
- Interaction with form variants and section manager: lens applies *after* variant resolution.
- Custom/interactive forms: opt in through a tiny `LensContext` they can read.

## Mockup
[`mockups/idea-3-essentials-lens.html`](./mockups/idea-3-essentials-lens.html) — the same member record
in Essentials vs Everything side by side, plus the steward's Lens Designer suggestions.
