---
"@memberjunction/codegen-lib": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Class-registration manifests are emitted in chunks, so the array stops being one union away from not compiling.

`mj codegen manifest` wrote every discovered `@RegisterClass` class into a single array literal. TypeScript computes the best common type of an array literal's elements **even when the declaration is annotated `any[]`**, so that literal produces a union with one member per distinct constructor. Past roughly a thousand members the checker refuses to represent it and the file fails with `TS2590: Expression produces a union type that is too complex to represent`, reported at the `[` with nothing else wrong.

It is a cliff, not a slope. The manifest compiles fine until the day one package registers one more class, and then every consumer of the bootstrap package stops building at once — with an error that points at generated code and names nothing that changed. `@memberjunction/server-bootstrap` was at 1,009 registrations; five new classes in one branch was enough to cross it.

The emitter now writes `CLASS_REGISTRATIONS_0…N` at 200 entries each and exports their concatenation, so each inferred union is bounded by the chunk size no matter how large the dependency tree grows. Consumers are unaffected: `CLASS_REGISTRATIONS` is the same `any[]` with the same contents in the same order, and every class reference is still a static code path the bundler cannot tree-shake. Verified against a 1,300-class reproduction: the flat literal fails with TS2590, the chunked form compiles.

Also makes the EntityField sequence park idempotent. `parkEntityFieldSequencesSQL` lifts existing rows to `Sequence + 100000` so a following INSERT can use the real BaseView ordinal without colliding on `UQ_EntityField_EntityID_Sequence`, guarded by `Sequence < 100000` — which does not make it safe to emit twice. After the first park the only rows left below the band are the ones that pass just INSERTED at their catalog ordinals, so a second park lifts *those* into the band, onto the row the first park moved from the same ordinal, and the migration dies with a duplicate key at 100000+ordinal. Any entity that gains fields in both CodeGen passes — real columns in pass 1, the denormalized name column a new foreign key introduces in pass 2 — reaches exactly that state. The park now runs only when nothing on the entity is parked yet.
