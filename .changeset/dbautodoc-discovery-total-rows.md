---
"@memberjunction/db-auto-doc": patch
---

Fix: relationship discovery now uses each column's real row count. `GetColumnStatisticsForDiscovery` ignored the full-table count the drivers return and estimated it instead:
- **No nulls:** the estimate was `nullCount + distinctCount`, which equals the distinct count. Every non-null column looked 100% unique, however many duplicates it had.
- **With nulls:** the estimate was `nullCount / nullPercentage`, but `nullPercentage` is a 0–100 percentage, so the row count came out near 0.

PK uniqueness checks and FK null-percentage and orphan estimates now see the true counts. This can change discovered keys.

The row-count bug was hiding a second one: an LLM-proposed primary key was accepted only if **every column was 100% unique on its own**. That rule is wrong for composite keys like `(ProductID, StartDate)` and only passed because every non-null column looked unique. Composite proposals now require each column to have no nulls and the **combination** to be unique, checked in the database (`checkColumnCombinationUniqueness`). Single-column proposals are unchanged. The gate moved to `CheckPKProposal` (`core/PKProposalGate.ts`), and `AnalysisEngine` takes an optional driver for the check.
