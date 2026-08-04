---
"@memberjunction/codegen-lib": patch
---

perf(codegen): narrow the `vwSQLColumnsAndEntityFields` introspection view to user objects.

The view that drives CodeGen's per-field metadata sync scanned `sys.all_columns` / `sys.all_objects`, which include every system and internal-table column (~10× the rows actually needed). It now reads the user-object catalog views `sys.columns` / `sys.objects` instead — three catalog references swapped, no columns, joins, or predicates changed.

On a 500-table synthetic schema a full cold CodeGen run dropped **190.7s → 105.9s (−44.5%)**, almost entirely from the "update existing fields" phase (~53s → ~5s); the gain scales with schema size. Generated output (SQL objects, entity classes, Angular forms) is byte-for-byte identical, verified against a golden-diff gate.

The swap is behaviorally identical for every entity-bearing row CodeGen consumes. The only rows it drops are `sys`-internal objects (e.g. `sys.trace_xe_*`) that carry no `EntityID` and were already discarded downstream — so it is not a blanket "identical results" for arbitrary catalog introspection, only for the rows CodeGen uses.

Ships as migration `V202608041347__v6.1.x__CodeGen_Introspection_View_Perf.sql`.
