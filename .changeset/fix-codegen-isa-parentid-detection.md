---
"@memberjunction/codegen-lib": patch
---

feat(codegen): validate declared IS-A (Table-Per-Type) relationships.

IS-A intent is **declared, never inferred** — via the `additionalSchemaInfo` `ISARelationships` config or an `@lookup` on `Entity.ParentID` in a metadata-sync file. CodeGen now verifies that the declaration actually qualifies, instead of leaving a malformed one to fail confusingly at runtime.

**Gated on declared intent.** The check reads only entities with a non-null `ParentID`, so it is channel-agnostic (one check covers `ISARelationships`, `@lookup`, and any future mechanism) and has no blast radius: schema nobody declared as IS-A — including customer or external schema — is never examined and cannot be false-positived. There is no schema-shape inference anywhere in this change. On a 385-entity install it inspects 3 rows in ~9ms.

It reports **only provable-cannot-work defects** — never inference. A declared IS-A either passes silently or hard-fails on a certain defect: a composite PK on the child or the parent (the runtime routes one shared PK value and has no model for a multi-column subtype key), or a child PK type ≠ parent PK type (parent and child share one PK value, so it must be legal as both). Shapes that merely "look off" but still function — no physical FK to the parent, an FK to a different entity, a soft FK — pass silently: the runtime keys off `ParentID`, not the child PK's FK metadata, so those are valid working declarations and flagging them would misfire on correct schema.

Also included: an unresolvable-`ParentID` guard, kept as defense-in-depth only and documented as such — `FK_Entity_ParentID` makes that state unstorable, but the parent JOIN must be a `LEFT JOIN` regardless, and without the guard an unresolved parent would silently skip the remaining checks rather than fail.
