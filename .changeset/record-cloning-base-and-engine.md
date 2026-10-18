---
"@memberjunction/record-cloning-base": minor
"@memberjunction/record-cloning": minor
---

Introduce `@memberjunction/record-cloning-base` and `@memberjunction/record-cloning` engine packages.
Includes deterministic clone planning, graph policy resolution, 12-stage field transformation pipeline, SHA-256 plan hash validation, transactional entity graph materialization, and remote operation handlers (RecordClone.Describe, RecordClone.Plan, RecordClone.Execute, and RecordClone.GetLineage).
- A bare child key in a root's `Relationships` (`"MJ: AI Agent Actions"`) applies only to edges from the root's entity. Relationship-ID and `"<Child>.<JoinField>"` keys apply at any depth. The validator refuses a bare key that names no relationship of the root.
- A row that points at another new row (a step path at a later step, a step at a copied sub-agent) is saved after that row.
- A plan warns with `CHILD_ROWS_UNREADABLE` when the rows of an edge it copies can't be read, instead of planning a copy without them.
