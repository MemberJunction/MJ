---
"@memberjunction/codegen-lib": patch
---

Fix spDelete stored procedure generation for new tables

Fixed a bug introduced in PR #1229 where spDelete stored procedures were not being generated for new tables. The condition logic was incorrectly requiring spDeleteGenerated to be true AND other conditions, when it should have been OR. This prevented new tables from getting their delete stored procedures created during CodeGen.

The fix aligns the spDelete generation logic with spCreate and spUpdate, ensuring new tables properly get all their stored procedures generated.