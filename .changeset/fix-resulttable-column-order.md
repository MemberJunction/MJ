---
"@memberjunction/sqlserver-dataprovider": patch
---

Fix value mis-routing in the save / record-change capture table (`@ResultTable`). The capture column list was built in EntityField **Sequence** order, but the positional `INSERT INTO @ResultTable EXEC` copies the base view's `SELECT [base].*, <joins>` output (base columns first, virtual/related fields last). For entities where CodeGen sequenced a base column **after** a virtual field (newly-added columns get a `maxSequence + 100000` offset), the two orders diverged and values landed in the wrong column — producing truncation or string→bit type-conversion errors on save. The capture list is now emitted base-columns-first then virtual fields, matching the view. This is a stable partition: byte-for-byte identical output for every entity whose virtual fields already sort last (the overwhelming majority), and a correction only for the affected entities.
