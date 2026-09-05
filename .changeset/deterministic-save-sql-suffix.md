---
"@memberjunction/sqlserver-dataprovider": patch
---

Make MetadataSync save-call SQL variable suffixes a PK hash instead of a random uuid slice, so recaptures of an unchanged tree are byte-identical and large batches do not collide (loom #12 WP3).
