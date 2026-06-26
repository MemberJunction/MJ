# @memberjunction/geo-maps

## 5.43.0

## 5.42.0

## 5.41.0

## 5.40.2

## 5.40.1

## 5.40.0

## 5.39.0

## 5.38.0

## 5.37.0

## 5.36.0

## 5.35.0

## 5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.

## 5.33.0

### Patch Changes

- 3e84676: Fix map-view regressions in Regions and Boundary modes, drop text-based location guessing in favor of pre-geocoded coordinates only, and auto-resolve lat/lng field names from EntityField.ExtendedType so entities like MJ: Countries / State Provinces use their direct Latitude/Longitude columns. Hides the Boundary toolbar button on entities without per-record GeoJSON, tears the map engine down on Entity change to fix blank-map regressions, and reloads data when crossing the grid ↔ map boundary.

## 5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes

## 5.30.1

## 5.30.0

### Patch Changes

- 00b5c26: Extract shared map-core library from Angular and React map components into a single source of truth. Add boundary render mode for per-record GeoJSON polygon rendering. Expose GeoDataEngine on React runtime utilities.
