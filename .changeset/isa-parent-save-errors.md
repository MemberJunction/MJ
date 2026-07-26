---
"@memberjunction/core": patch
---

Surface parent errors when an IS-A (Table-Per-Type) parent save fails. Previously `BaseEntity.Save` rolled back and returned `false` without recording anything on the child, so callers saw `LatestResult === null` and an empty `ResultHistory` — every result had been written to the parent object, which callers have no reference to. A child whose parent has NOT NULL columns the child never set therefore failed with no diagnostic anywhere reachable. The child now records a result carrying the parent's field-level errors, naming which parent entity failed, and falling back to the joined error text when the parent reports no message (validation failures leave `Message` empty). Mirrors the existing transaction-group-failure and catch-block paths, including the `currentResultCount` guard against double-reporting. Adds regression tests.
