---
"@memberjunction/ng-map-view": patch
---

fix(map-view): isolate stacking context so the map no longer paints over app overlays

Leaflet's internal panes/controls and the map toolbar use z-index values up to
~1000 but the component never established its own stacking context, so those
values competed directly with overlays opened above the map (e.g. the Data
Explorer view-selector "new view" dropdown) — and since the map renders later in
the DOM, equal z-index meant the map won and obscured the menu. Adding
`isolation: isolate` to the component `:host` flattens Leaflet's z-indices into
the map's own stacking context so external overlays layer correctly. No z-index
values changed; the map's internal layering is unaffected.
