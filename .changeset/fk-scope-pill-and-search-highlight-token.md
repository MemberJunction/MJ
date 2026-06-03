---
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-shared-generic": minor
---

feat(forms): FK dropdown scope picker, per-user persistence, and a centralized search-highlight theme token

Enhancements to `<mj-form-field>`'s foreign-key autocomplete in `@memberjunction/ng-base-forms`:

- **Search-field scope picker** — a pill (shown only while focused) lets the user
  choose which related-entity field the dropdown searches: the Name field by
  default, any shown column, or other searchable fields like ID. Exactly one
  targeted `LIKE` (DB) or one in-memory scan (cached) — never all columns.
- **Configurable visible columns** — an eye toggle per field shows/hides it as a
  grid column, letting users surface normally-hidden fields (e.g. ID) or drop
  defaults.
- **Per-user persistence** via a new `LinkedFieldOptionsStore` (backed by
  `UserInfoEngine`, one settings key): search scope, sort column/direction,
  column widths, and visible-column set are remembered per (entity, FK field).
  Nothing is written unless the user customizes.
- **Column resize** — drag a header's edge; widths persist.
- Plus polish: muted (theme-token) search highlight, fixed whitespace clipping in
  highlighted cells, body-portal render-timing fix for cached fields, and a
  scope/column menu that overlays the results list.

Design-token addition in `@memberjunction/ng-shared-generic`: new semantic
`--mj-search-highlight-bg` / `--mj-search-highlight-text` tokens (light + dark) so
the typed-query `<mark>` highlight is muted and theme-controlled in one place.

Also migrates the remaining primitive token usages in `ng-base-forms` CSS to
semantic tokens (package is now 100% semantic tokens), and adds
`STANDALONE_USAGE.md` documenting how to use these components as general-purpose
data-bindable controls outside the forms architecture.
