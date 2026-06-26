# Collapsible / Expand-Collapse Consolidation — Codebase Audit

Goal: consolidate every expand/collapse element in `packages/Angular/**` onto as few
shared components as possible. This is the full inventory behind that decision.

## Method
Behavior-based discovery (not class-name based): files containing a chevron/caret icon
(`fa-chevron|fa-caret|fa-angle`) **AND** an expand/collapse state signal (`(click)` toggle
handlers, `[class.expanded|collapsed]`, `isExpanded`, `*SectionExpanded`, `expandedSections`),
minus files already on a canonical component. 145 candidates; 32 already on components; **137
bespoke candidates** classified by 5 parallel agents (read-only).

## Headline numbers (instance-level, approximate)
| Shape | ~Instances | Target |
|---|---|---|
| **Disclosure** (header → content-sized body) | ~98 bespoke | `mj-accordion-panel` |
| **Fill-pane / rail** (fills flex region / collapses to strip) | ~15 (~7 files) | layout primitive (rail / `angular-split`) — NOT accordion |
| **Tree** (recursive node expanders) | ~20 | `mj-tree` (exists) |
| **False-positive** (dropdown/menu/popover/sort-caret/expand-all/table-row-detail/splitter/edit-swap) | ~60 | route to `mj-dropdown`/`mj-combobox`/`mj-filter-popover`/grid, or N/A |

Already on components: 19 `mj-accordion-panel` + 13 `mj-collapsible-panel` (form-coupled).
**Total genuine disclosure surface ≈ 130.**

## Decision: ONE collapsible component
- **`mj-accordion-panel`** is the single content-disclosure component. Fold the 13
  `mj-collapsible-panel` form usages into it (it has weaker a11y: `<div role=button>`, no
  `aria-expanded`).
- Fill-pane/rail cases are **layout**, handled by a rail/splitter primitive — not a 2nd
  "collapsible". (This is why nav-panel / Integration canvas fought the accordion.)
- Trees, dropdowns/menus, table row-detail → their existing specialized components.

## Component feature gaps to close on `mj-accordion-panel`
Already shipped: flex title slot, owned icon sizing, `[TitleIconMuted]`, header↔chevron gap,
host `display:block`, 8px margin, `.mj-accordion-badge` (+ status/muted/right), subtler
dark-mode header, full WAI-ARIA (`aria-expanded` + `aria-controls`/`aria-labelledby`).

Still needed to absorb the bespoke disclosure cases:
1. **`[headerActions]` slot** — sibling of the toggle `<button>`, for edit/copy/run/checkbox
   controls in the header. **Unlocks ~26 instances.** Highest leverage.
2. **`[FlushBody]`** — `padding:0` body for consumers that manage their own padding (query-form,
   templates-form `::ng-deep` re-skins; code-editor bodies).
3. **`[Size]`** (sm/md) — smaller sub-panel titles (sub-panel-title, ERD).
4. (Maybe) an **expandable-card** convention — the recurring "card grid, expand to reveal stats,
   separate card-actions footer" pattern (agent/model/prompt/component cards). Decide whether
   accordion+headerActions covers it or it deserves its own treatment.

## Migration buckets for the ~98 bespoke disclosure instances
- **~62 clean accordion** today (no new features).
- **~26 accordion + headerActions** (header has interactive controls).
- **~few accordion + flush-body/size.**

## Out of scope (route elsewhere, do NOT make them accordions)
- **Trees (~20):** action/query/credentials category trees, suite-tree, collection-tree,
  file-storage category-tree, ERD, deep-diff, dependency trees, left-nav, `mj-tree` itself.
- **False-positives (~60):** dropdown/combobox/menu chevrons, "Expand/Collapse ALL" buttons,
  sort carets, `<tr>` master-detail row expanders (run-history, scheduling, mcp tools/logs),
  sidebar/panel collapse buttons, splitter handles, edit-mode swaps, wizard nav, the dead
  14.5k-line `slack-style-v22.html` prototype.
- **Fill-pane / rail (~15):** DataExplorer navigation-panel (rail + 3 sections), FormBuilder
  rails/cockpit panes, Integration pipelines/visual-editor field-map canvas, user-app-config
  two-pane, realtime activity-rail, realtime surface-tabs, ComponentStudio workspace panes.

## Suggested sequencing
1. Add `[headerActions]` slot (+ `FlushBody`, `Size`) to `mj-accordion-panel`.
2. Sweep the ~62 clean + ~26 header-action disclosure cases onto it (by area), deleting bespoke
   chrome CSS (use `.mj-accordion-badge` / `[TitleIconMuted]`).
3. Converge `mj-collapsible-panel` → delegate to / replaced by `mj-accordion-panel` (a11y win
   across all form sections).
4. Separately: rail/splitter primitive for the fill-pane set; route dropdowns/menus to existing
   primitives; leave trees on `mj-tree`.

## Per-area candidate lists
Staged at `scratchpad/collapsible-audit/{g_dash1,g_dash2,g_conv,g_forms,g_tail}.txt`.
Full per-instance classification tables are in the audit agent transcripts.
