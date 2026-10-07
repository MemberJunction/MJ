# @memberjunction/record-cloning-base

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [dfe40a4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/record-graph@6.2.0-edge.3

## 6.2.0-edge.2

### Minor Changes

- 7e57b48: Introduce `@memberjunction/record-cloning-base` and `@memberjunction/record-cloning` engine packages.
  Includes deterministic clone planning, graph policy resolution, 12-stage field transformation pipeline, SHA-256 plan hash validation, transactional entity graph materialization, and remote operation handlers (RecordClone.Describe, RecordClone.Plan, RecordClone.Execute, and RecordClone.GetLineage).
  - A bare child key in a root's `Relationships` (`"MJ: AI Agent Actions"`) applies only to edges from the root's entity. Relationship-ID and `"<Child>.<JoinField>"` keys apply at any depth. The validator refuses a bare key that names no relationship of the root.
  - A row that points at another new row (a step path at a later step, a step at a copied sub-agent) is saved after that row.
  - A plan warns with `CHILD_ROWS_UNREADABLE` when the rows of an edge it copies can't be read, instead of planning a copy without them.

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [0adaf76]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [369e229]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/record-graph@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
