---
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-ui-components": minor
"@memberjunction/ng-versions": patch
"@memberjunction/ng-record-changes": patch
"@memberjunction/ng-record-tags": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-explorer-dashboards": patch
---

feat: render any entity form as a tab, dialog, or slide-in (Generic, no regeneration)

Adds a presentation-agnostic form stack to `@memberjunction/ng-base-forms`:

- **`MjEntityFormHostComponent`** — headless host that resolves the form
  (generated / custom / interactive override + variants), loads the record,
  dynamically creates + binds the form, re-emits its events, and tears down.
  Extracted from Explorer's `SingleRecordComponent`, which is now a thin wrapper.
- **`MjFormDialogComponent` / `MjFormSlideInComponent`** + **`MJFormPresenterService`**
  — declarative and imperative ways to open any entity form as a modal dialog or
  slide-in panel.
- **`EntityFormConfig`** + presets — per-instance control over toolbar visibility,
  related-entity sections, section collapsibility, width, and in-form navigation.
  Applied via the form reference so existing generated forms honor it **without
  regeneration**.
- **`FormResolverService`** moved from `ng-explorer-core` into `ng-base-forms`
  (it had no Explorer/Router coupling), making the interactive-form + variant
  pathway first-class on every surface.
- **`MjSlidePanelComponent`** relocated from `ng-versions` into `ng-ui-components`
  as a first-class shared primitive; `ng-versions` and the other consumers
  (record-changes, record-tags, entity-viewer, dashboards, core-entity-forms) now
  import it from there.

Phase-1 consumer migrations: the Query Categories create flow now uses
`<mj-form-dialog>`, and editing the selected category uses `MJFormPresenterService`
slide-in — replacing the bespoke `query-category-dialog`.
