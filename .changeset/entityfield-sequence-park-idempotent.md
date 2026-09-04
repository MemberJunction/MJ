---
"@memberjunction/codegen-lib": patch
---

The EntityField sequence park is idempotent across CodeGen passes.

`parkEntityFieldSequencesSQL` lifts an entity's existing `EntityField.Sequence` values into a `+100000` band so a following INSERT can use the real BaseView column ordinal without colliding on `UQ_EntityField_EntityID_Sequence`. It was guarded by `Sequence < 100000`, which does not make it safe to emit twice.

After the first park, the only rows left below the band are precisely the ones that pass just INSERTED at their catalog ordinals. A second park therefore lifts *those* into the band — landing on the row the first park moved from the same ordinal — and the migration dies with a duplicate key at `100000 + ordinal`.

Any entity that gains fields in **both** CodeGen passes reaches that state: the real columns in pass 1, and in pass 2 the denormalized name column that a new foreign key introduces. `AIPromptRun` does exactly that, and a from-scratch `mj migrate` caught it.

The park now runs only when nothing on the entity is parked yet, so a second emission is a no-op. A regression test pins the guard, because the previous condition looked correct in isolation and only failed on the second pass.
