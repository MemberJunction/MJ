---
"@memberjunction/core": minor
"@memberjunction/generic-database-provider": patch
"@memberjunction/ng-base-forms": patch
---

feat(forms): prefetch every section and toolbar count in one round trip; hide or demote empty related sections.

- `RunViews` batches that are all `count_only` now run as ONE `UNION ALL` statement in `GenericDatabaseProvider` (each view keeps the full per-view security path; a failing view keeps its own `Success:false`; a failing combined statement falls back to per-view).
- `<mj-record-form-container>` fetches every related-section count plus the tag / attachment / version badges in a single `RunViews` call when a saved record loads (replacing three full-row badge queries), and badges appear before grids load.
- New metadata: `whenEmpty` (`'show'` default | `'hide'` | `'more'`) and `showCount` (default `true`) on `EntityRelationship.Configuration.UI` and form contribution registrations; entity defaults `UI.Form.RelatedWhenEmpty` / `UI.Form.ShowRelatedCounts`. Contributions may declare `count: { entity, joinFields }`.
- The collapsed More folder shows the sum of its children's counts; fill-in related grids now show their count in the accordion header.
