---
"@memberjunction/integration-engine": patch
---

Pull entity maps can now drop source records and resolve parent references, both declared on the entity map's `Configuration` (#5254).

- **`recordFilter`** — conditions on the source record's own fields, e.g. `{"recordFilter":[{"field":"accountType","notIn":["Heading","Total","Begin-Total","End-Total"]}]}`. Every condition must hold for a record to be kept. Excluded records count as skipped, not errored, and are still seen by orphan detection. Deletes are never filtered. A malformed filter fails the map before anything is fetched.
- **`resolveReferences`** — destination foreign-key fields whose mapped value is the parent's external id, e.g. `{"resolveReferences":["DimensionID"]}`. The engine swaps each value for the parent's MJ id through this company integration's record maps for the field's related entity (written when the parent's map synced, which the dependency layers run first). A value with no record map is a `MATCH_RESOLUTION_ERROR` on that record, which is not written. A field that is not a foreign key fails the map.
- New sync log event `sync.entity-map.filtered`. New exports from `RecordFilter` and `ReferenceResolver`.
