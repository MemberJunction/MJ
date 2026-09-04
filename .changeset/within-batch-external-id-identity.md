---
"@memberjunction/integration-engine": patch
---

Enforce within-batch ExternalID identity before mapping.

ExternalID is the identity the record map keys on, so two records in one batch carrying the same one
are two observations of a single source record — never two rows. The write path cannot detect this:
it decides insert-vs-update by asking whether the identity exists in the DATABASE, and for a
first-time record neither copy does, so both insert and the pair re-inserts on every later sync. The
existing fingerprint guard only catches a batch repeated in full (the infinite-loop case), not
duplicates inside one batch.

Measured on a live tenant: one object held 54,119 rows for 42,519 distinct keys — 11,632 excess,
across 11,200 duplicate groups that were byte-identical on every captured column and written within
the same second, i.e. the source listed the same element twice inside one batch.

The engine now collapses duplicate identities per batch, keeping the last occurrence (upsert
semantics: the later entry is the more recent observation), and reports the count as a
`DUPLICATE_IDENTITIES_IN_BATCH` warning rather than silently — a connector emitting duplicate
identities is a defect worth fixing at its source. Records with no ExternalID pass through
untouched, since collapsing those would merge unrelated rows.
