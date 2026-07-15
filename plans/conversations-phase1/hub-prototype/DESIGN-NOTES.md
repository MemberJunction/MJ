# Project Hub — Quiet Execution · Design Notes

> Companion to the interactive prototype. Records the positions the prototype takes (so drift from
> them is a decision, not an accident) and the boundaries deliberately NOT drawn. Sources: the three
> design audits (functional coverage / design-language / UX heuristics, 2026-07-13) and the batch
> fixes that followed. Spec anchors: projects-ux-brief.md, conversations-phase1-plan.md (D5, D11,
> D15, D17–D20), EXECUTION.md.

## Positions the prototype takes (veto by playing with it)

| # | Position | Where to feel it |
|---|---|---|
| 1 | **Type hierarchy never uses the disabled token.** Metadata is `--mj-text-muted`; `--mj-text-disabled` is reserved for genuinely disabled things. The quiet aesthetic must survive WCAG AA. | everywhere |
| 2 | **Agent choice and "Plan first" are per-conversation state**, stored with the draft. Nothing about the composer is globally sticky. | C5, S13 |
| 3 | **Capability loss is shown, not hidden**: under a remote agent the plan chip is disabled-with-reason, not removed. | C5 |
| 4 | **Abandoned plans decay**: a pending plan card collapses to "Plan not run · Re-plan" once the conversation moves past it. | S13 |
| 5 | **@ separates "Send to" (agents — reroutes the message) from "Reference" (people — adds context).** These are different verbs and the picker says so. | C1 |
| 6 | **Viewer = read everything, change nothing.** No composer (a quiet notice instead), no memory ops, no settings. Editor adds writing + memory; Owner adds sharing, members, settings, delete. | V1, V2 |
| 7 | **Archive is the default way to remove a project; delete is the escalation.** Both have Undo. Delete moves conversations to Ungrouped, keeps artifacts available in Collections, removes project memory. | V3 |
| 8 | **Failed workflows are visible on the hub** with a Retry; completed ones live behind History (which is where the "Gantt" link goes). Nothing retries silently. | V5, S1 |
| 9 | **Teammate activity = one quiet dot on the sidebar row + a "new" tag on the specific rows.** No counts, no badges. Opening the item clears it. | V4 |
| 10 | **Memory scope is managed in the Memory tab** (project vs global sections, scope dropdowns); forgetting a global note demands a confirm because the blast radius is org-wide. | S5 |
| 11 | **Incognito is a creation-time choice that locks at first send** (D20). The chip lives on the new-chat composer only. | S12, S9 |
| 12 | **Project icon + color are settable but never demanded** — create modal offers them under "optional — defaults are fine"; the default is a colored folder. | M2 |
| 13 | **Messages are flat avatar rows for BOTH parties** — the shipped product idiom (avatar + name + time header, generation-time pill on agent replies). Bubbles were a prototype invention, rejected 2026-07-15; this also resolves the pass-6 "only filled shape" critique. | S8 |

## Deliberately undrawn (boundaries — each needs one line of ratified intent, not a build)

1. **Collections ↔ project artifacts.** Position proposed: project = origin/workspace of an artifact;
   collection = curated cross-project library; an artifact can be in both. The hub shows origin,
   Collections shows curation. NOT drawn: pinning indicators, add-existing-artifact-to-project.
2. **Search scope.** Proposed: the omnibar (#3042's lane) gains a project pre-filter when invoked
   from a hub. The sidebar search stays global. NOT drawn here — belongs to the omnibar work.
3. **Routines × projects.** Proposed boundary for v1: routines are personal and project-agnostic
   (matches the canvas C12 position: "personal chrome that visibly does not belong to the project").
   A routine's output landing in a project is a P2 question tied to D17's `ProjectID` columns.
4. **Nesting.** Untouched, per the canvas's "deliberately undrawn" discipline — the six hierarchy
   questions in projects-hierarchy.html get ratified first.
5. **Drag-drop + create-in-place parity.** The June folders drag-drop carries over unchanged in
   production; the prototype's move-modal is an *additional* path, not a replacement. (Brief
   criterion 3 requires nothing gets harder.)
6. **Group chat / multi-human presence.** P1.8's lane. The member list here is access control, not presence.

## Baseline parity checklist (from PARITY-AUDIT.md §2 — live behavior the redesign must keep)

> Principle (Matt, 2026-07-15): anything the shipped product does either WORKS in this prototype
> or carries an explicit conscious-regression entry here. An audit doc alone is not an answer.

| Baseline behavior (shipped today) | Prototype status |
|---|---|
| Drag conversation → project / → Ungrouped, with drop-target highlight | ✅ implemented 2026-07-15 |
| Nested folders: subfolder create, drag reparent, descendant counts | ⬜ OPEN — conflicts with "nesting undrawn"; Amith-review agenda item |
| Sidebar filter box (live name/description filter) | ✅ implemented 2026-07-15 (filters projects + conversations + summaries, empty state) |
| Group-by-folder / flat toggle | ⬜ |
| Multi-select mode + bulk delete | ⬜ |
| Rename = dialog w/ Name + Description (agents read description) | ✅ implemented 2026-07-15 |
| Folder modal: 20 colors + custom, 20-icon grid, live preview | ◐ prototype has 6 icons / 5 swatches — sketch-level, upgrade at build |
| Conversation description previews under sidebar titles | ✅ implemented 2026-07-15 |
| @agent chips w/ per-mention config-preset dropdown | ⬜ |
| @ mentions include human users; paste-image; drag-drop files | ◐ people-as-reference exists; paste/drop absent |
| Message actions: inline edit, delete-last-and-below, retry, elapsed pill, command chips, per-message artifact cards | ⬜ chat idiom reconciliation first (see below) |
| Header state chips: pins, artifacts, members, shared-by | ⬜ decision: quiet direction may consolidate — decide against the list |
| Flat avatar-row message idiom (BOTH parties; no user bubbles in product) | ✅ implemented 2026-07-15 (position #13) — unblocks the message-actions row |
| Live component artifacts (React, interactive) + 7-tab viewer | ⬜ prototype artifact page is a sketch; note scale honestly in reviews |
| Agent run inspector (gear: steps/tokens/cost/links) | ⬜ |
| Rating (1–10 dialog + consent), export modal, share modal parity | ⬜ |

## Prototype-only shortcuts (do not copy to production)

- All `data-act` divs/spans become real buttons/links in Angular; the event delegation here is a
  prototype convenience. Tabs and rows need roles + keyboard activation.
- Modals have dialog semantics + focus return but no full focus trap.
- The state map, personas, and demo toasts are review tooling, not product.
- Auto-naming truncates words; production names from the agent's semantic summary (and should
  dedupe within a project).
