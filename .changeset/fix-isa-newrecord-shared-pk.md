---
"@memberjunction/core": patch
---

fix(MJCore): mint the shared IS-A primary key at the root in BaseEntity.NewRecord

IS-A (Table-Per-Type) child entities share one primary key with their parent chain. NewRecord generated the child's key first, then the parent's own NewRecord() discarded and regenerated it, leaving the child's own PK field stranded at a stale value that the save-SQL builder then INSERTed — causing a foreign-key violation (e.g. FK_ACP_Company). NewRecord now creates the parent chain first (the root mints the single shared key), adopts it onto each level (authoritative routed read + local write), and applies caller newValues last so an explicit PK is honored rather than clobbered. Non-IS-A entities are unaffected.
