---
"@memberjunction/integration-engine": patch
---

Three fixes to make a discovery sample trustworthy: a provable key now requires no observed
duplicate, a capped scan admits it only saw a prefix, and the per-table sample target returns to 500.

**A duplicate in the sample disproves keyness.** `subsetKeyness` decided keyness purely by Chao1
domain saturation and never checked the sampled tuples were distinct. Chao1 estimates how large the
value domain is — evidence about future collisions, not about ones already in the sample — and its
bias-corrected branch grows quadratically in the singleton count. A column with nine copies of one
value among 100 rows scored D̂ ≈ 4187 and was reported as a *provable* primary key. Two source
records sharing that value then collapse onto one row: silent data loss, the mirror image of a
duplicate record. Keyness now requires `d === n` first, with Chao1 retained to separate an identifier
from a small category that merely has not collided yet. Genuine composite keys whose individual
columns repeat are unaffected.

**A record-capped scan is a prefix, not an exhausted source.** The cap is enforced by the generator
feeding the scan, which simply returns, so the stream ended indistinguishably from a table that ran
out of rows and the scan reported `exhausted`. That unlocked the lenient near-unique (0.9) soft-key
rule instead of the strict 1.0 reserved for partial corpora. `StoppedReason` gains `record-cap`, the
producer's target is passed in so the scan can recognise its own truncation, and completeness now
means `exhausted` rather than "not time-budget".

**The sample target returns to 500.** It was lowered to the primary-key significance floor on the
reasoning that 50 rows answer the other questions well enough. They do not: several connectors
declare no widths at all — YourMembership states `MaxLength: null` and unions in the sampler's result
— so the sample is the only source of column width, and a value too wide for its column is skipped at
sync time rather than truncated. A sparse custom column present on ~1% of records is also near-certain
in 500 rows and a coin flip in 50. A floor is a minimum, not a target to sample down to. Streaming
rows from one object is one paged read; what costs requests is descending into parents, which is
bounded separately by the child's own demand.
