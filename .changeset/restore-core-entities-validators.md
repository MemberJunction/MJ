---
"@memberjunction/core-entities": minor
---

Restore the 56 generated `Validate()` overrides on `MJCoreEntities`, absent since `197fdf8376`.

`v6.1.0-edge.5` shipped `packages/MJCoreEntities/src/generated/entities/__mj.ts` with 56 `public override Validate()` methods, covering 46 entity classes. `197fdf8376` ("100% CodeGen idempotency, field change tracking, and churn elimination") regenerated that file and emitted none, and the follow-up `9ef9321847` did not restore them. Neither commit's message nor its changeset mentions validation, so the removal was silent — no consumer of `@memberjunction/core-entities` had any signal that entity validation had stopped running for those classes.

Restored by regenerating from a database built only from this repo's own migrations and metadata. The regenerated set is byte-identical in membership to what `v6.1.0-edge.5` shipped — diffing the validator class sets between the tag and the regeneration returns nothing — and the file diff is purely additive: 2,854 insertions, 0 deletions.

Not included: `MJFormChromeRuleEntity`'s validator, added by `0654f69462` after the edge.5 tag and removed before any release, so it has never shipped. It cannot be regenerated on a fresh install because its `GeneratedCode` record was never seeded by a migration — a separate pre-existing gap, tracked independently rather than hand-patched into generated output.
