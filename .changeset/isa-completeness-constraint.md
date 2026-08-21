---
"@memberjunction/core": minor
---

Add `Entity.IsTotalSpecialization` — the EER **completeness** constraint for ISA (table-per-type) specialization, the pair to `AllowMultipleSubtypes` (disjointness). MemberJunction modelled the disjoint/overlapping axis of specialization but not the total/partial axis; this adds it.

- **Migration** adds a nullable-with-default `IsTotalSpecialization` bit column to `__mj.Entity` (`0` = partial specialization, the default and pre-feature behaviour; additive, no existing rows change meaning).
- **`EntityInfo.IsTotalSpecialization`** surfaces the flag on entity metadata (set on the parent/superclass entity).
- **`BaseEntity` save enforcement**: when a parent entity is marked total (`IsTotalSpecialization = 1`) and disjoint (`AllowMultipleSubtypes = 0`), a **direct save of a standalone superclass record is refused** — the record must be created through a subclass, whose save persists the superclass and subclass rows together (the existing leaf-chain save path, which is unaffected). Overlapping parents, non-parent entities, and the default partial setting all behave exactly as before.
