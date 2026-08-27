---
'@memberjunction/server': patch
---

fix(server): map GraphQL transport field names onto copies, never onto the cache's own rows

`ResolverBase` renamed `__mj_*` keys to their `_mj__*` wire aliases by writing onto its
argument. Those arguments are routinely rows straight out of `findBy`/`RunView` — the server
cache's own objects, held **by reference** under a reference-sharing storage provider. Preparing
one GraphQL response therefore rewrote `__mj_CreatedAt` inside the live cache, and because that
cache is process-wide, a single response left every later read across every worker serving
transport-shaped rows that `BaseEntity.SetMany` rejects.

It reached both halves of the transport rename:

- `MapFieldNamesToCodeNames` (single-record) — every `UserByEmail` / `UserByID` /
  `UserByEmployeeID` call, and every CodeGen-generated single-record resolver whose entity has
  caching enabled.
- The `RunView` result path — `FieldMapper.MapFields` renames by mutating, and
  `ArrayFilterEncryptedFieldsForAPI` mutates too.

Both now map onto copies. `MapFieldNamesToCodeNames` shallow-copies its argument up front and
returns the copy; `ArrayMapFieldNamesToCodeNames` returns a new array of new objects rather than
mapping in place and handing back the caller's array. Shallow is sufficient — the only post-map
mutators rename top-level keys and redact scalar fields.

Behaviour is unchanged for callers: the same transport-shaped result comes back. What changes is
that the provider's own row objects are no longer written to.

Extracted from #3425 for the 5.x line; the freeze-on-write half of that PR is deliberately not
included here, since converting in-place row mutation into a `TypeError` is a behaviour change
that does not belong in a patch on a certified line.
