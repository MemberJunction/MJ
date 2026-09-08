---
"@memberjunction/codegen-lib": patch
---

Smart Field Identification could clear `IsNameField` and nominate nothing in its place, leaving an
entity with **zero** name fields — and it did that by overriding a correct deterministic answer,
not by failing to produce one. The pending-fields SQL emits `IIF(sf.FieldName = 'Name', 1, 0)`, so
the flag was already right before the AI pass ran; the AI pass then removed it.

The trigger is an IS-A (Table-Per-Type) child. Its `Name` is virtual by construction — the column
lives on the parent table and reaches the child through the view's IS-A join — and
`isFieldEligibleForNameField` blanket-rejected virtual fields. With nothing eligible,
`selectNameFieldWinner` returned `null` and `applyNameFieldUpdates`' clear-loop wiped the flag it
found. Downstream, everything that resolves a record's display value loses it: FK lookups to that
entity render the raw UUID, and `getIsNameFieldForSingleEntity` has no field to denormalize into
referencing base views. Silent, and it *removes* correct metadata rather than merely failing to add
any.

Two independent guards, either of which would have prevented it:

**Virtual fields are no longer rejected wholesale.** An IS-A inherited field is eligible, identified
by `IsVirtual = 1 AND AllowUpdateAPI = 1` — the pair `syncISAParentFields` and
`buildParentChainContext` already use, and unambiguous here: every virtual column discovered from a
base view is inserted with `AllowUpdateAPI = 0`, and the IS-A sync is the only thing that sets it
back. A borrowed FK-name column therefore cannot qualify, so the reasons virtual fields were
rejected in the first place — the unbuildable self-FK view join, and a name that is itself a
borrowed FK-name resolving circularly — still hold everywhere they applied.

**Never clear without replacing.** Eligibility splits along the line that was being conflated:
`isNameFieldTypeSafe` (a primary key, a non-text type or unbounded MAX text is *wrong*, and
corrupts the SQL type of every FK-name virtual field that joins to this entity) versus virtuality (a
*worse* choice than a base-table column, not an invalid one). Winner selection gains a fourth tier
that preserves an existing type-safe flag rather than clearing it with nothing to put in its place;
an actively-wrong flag is still cleared with no replacement, so the v5.40 uniqueidentifier-PK
guardrail behaves exactly as before.

The sibling writers were checked while in the area — `applyDefaultInViewUpdates`,
`applySearchableFieldUpdates` and the field-level full-text path are all SET-only and never clear,
so this failure mode was unique to `IsNameField`.
