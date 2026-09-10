---
"@memberjunction/integration-engine": patch
---

Fix a duplicate-record defect in the create-path prefetch elision.

`extractMappedPrimaryKey` returns the primary key value(s) already `'|'`-joined — the same shape
`PrefetchContentHashes` keys its `Present` set with. Two call sites instead treated that string as a
field map and re-derived a key from it (`mappedPK[f.Name]`), which evaluates to `''` for every
record. `provablyAbsent` was therefore unconditionally true whenever the prefetch covered the batch,
`existed` was permanently false, and any existing row reaching the create path was blind-INSERTed
instead of loaded and updated — a silent duplicate row on soft-primary-key tables, a duplicate-key
error on hard ones. It also made both content-hash skips on that path unreachable, since they sit
behind `existed`.

Reachable whenever an existing row reaches `CreateRecord`: a cleared record map, a new
CompanyIntegration over pre-existing rows, a `Create` verdict from matching, or `UpdateRecord`'s
unmatched fallback.

Both sites now use `mappedPK` directly. The decision moves into `isProvablyAbsent` so it can be
tested against the real extractor's output rather than a re-implementation of it, and `CreateRecord`
now records a key it creates into `Present` — a mid-batch flush commits part of a batch, and the
per-record fallback re-applies that batch against the same precheck, where an already-inserted row
would otherwise still "prove" absent.

The regression was invisible to its own tests: they stubbed `extractMappedPrimaryKey` with an
object-returning fake while the real method returns a string, and asserted the buggy expression's
source text rather than its behaviour. The suite now drives the real extractor, the real prefetch and
the real decision end to end, including the duplicate scenario and composite keys.
