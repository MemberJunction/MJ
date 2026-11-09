---
"@memberjunction/db-auto-doc": patch
---

fix(db-auto-doc): relationship discovery reuses the column statistics the sampling pass already gathered instead of querying every column a second time. The statistics cache is seeded from the schema before PK and FK detection, FK cardinality checks read from that cache, and merging the cache back onto the schema keeps the fields only sampling records.
