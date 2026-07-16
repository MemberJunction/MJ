---
"@memberjunction/codegen-lib": patch
---

feat(codegen): validate declared IS-A relationships, and advise on undeclared IS-A-shaped schema.

IS-A (Table-Per-Type) intent stays **declared, never inferred** — via `additionalSchemaInfo`'s `ISARelationships` or an `@lookup` on `Entity.ParentID` in a metadata-sync file. CodeGen now checks that work instead of guessing at it:

**Forward validation (new).** Every entity with a non-null `ParentID` is validated against what the IS-A runtime actually requires — channel-agnostic, because it reads the end state of `ParentID` rather than any one declaration mechanism. Severity is tiered on a single rule: fail only on a certainty, warn on an inference.

- _Hard error_ (the runtime provably cannot work): composite PK on the child or the parent; a `ParentID` that resolves to nothing (previously a **silent** no-op — `BaseEntity.InitializeParentEntity()` just `return`s when `ParentEntityInfo` is null); child PK type ≠ parent PK type (parent and child share one PK value, so it must be legal as both — a physical FK already guarantees this, so it only ever bites a soft/declared IS-A, which is exactly the case with no DB constraint to catch it).
- _Warning_ (may be perfectly valid, just uncorroborated): the child PK has no FK to the parent, or points at a different entity, or is backed by a soft FK. These work at runtime — IS-A keys off `ParentID`, never the FK metadata — so failing on them would block a valid declaration.

**Advisory (new, non-mutating).** Schema whose shape looks like an undeclared IS-A child (single PK that is also an FK to the parent's single PK) is now reported as a candidate with a greppable `IS-A CANDIDATE` warning naming both escape hatches — and **no metadata is written**. The shape is necessary but not sufficient: an ordinary 1:1 extension table is physically identical to a Disjoint subtype, and stamping `ParentID` on that false positive would silently enable delete-cascade-to-parent (`shouldDeleteParentAfterChildDelete`: _"Disjoint: always cascade delete to parent"_), so deleting the extension row would delete the row it extends. Candidate detection is additionally narrowed to physical evidence — soft/LLM-inferred FKs, self-references, and virtual entities are excluded.
