---
"@memberjunction/geo-maps": patch
"@memberjunction/ng-map-view": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-react": patch
"@memberjunction/interactive-component-types": patch
---

Fix map-view regressions in Regions and Boundary modes, drop text-based location guessing in favor of pre-geocoded coordinates only, and auto-resolve lat/lng field names from EntityField.ExtendedType so entities like MJ: Countries / State Provinces use their direct Latitude/Longitude columns. Hides the Boundary toolbar button on entities without per-record GeoJSON, tears the map engine down on Entity change to fix blank-map regressions, and reloads data when crossing the grid ↔ map boundary.
