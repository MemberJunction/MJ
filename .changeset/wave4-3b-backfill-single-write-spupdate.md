---
"@memberjunction/integration-test-suite": patch
---

Backfill single-write `__mj_UpdatedAt = GETUTCDATE()` into all core `spUpdate*` stored procedures and guard all `trgUpdate*` triggers with `IF NOT UPDATE([__mj_UpdatedAt])` (`V202611121645__v6.3.x__Single_Write_spUpdate_And_Trigger_Guard.sql`), and add the `metadata-consistency.MC9` catalog + live integration test.
