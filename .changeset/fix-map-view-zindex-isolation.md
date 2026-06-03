---
"@memberjunction/ng-map-view": patch
"@memberjunction/ng-dashboards": patch
---

fix(data-explorer): stop body view content from painting over header dropdowns

After #2701 lowered the Data Explorer `.content-header` to `z-index: 2` (to keep
it below the shell header), body view content that leaks a higher z-index began
painting over the header's own dropdowns. The map view was the visible symptom —
its Leaflet panes/toolbar (z-index up to ~1000) covered the view-selector "new
view" dropdown — and the entity grid's option menu (z-index 1000) is the same
latent class.

Two complementary fixes, both pure containment (no z-index values changed):

- **`@memberjunction/ng-map-view`** — add `isolation: isolate` to the component
  `:host` so Leaflet's z-indices stay contained in the map's own stacking
  context. Generic hygiene that protects the map in any consumer.
- **`@memberjunction/ng-dashboards`** — add `isolation: isolate` to the Data
  Explorer `.content-body` so all body view content (grid menus, map, cards,
  timeline, future view modes) is contained beneath the header in one stacking
  context. Safe because modals and the record detail panel render at the
  dashboard root, outside `.content-body`, so they still overlay everything.
