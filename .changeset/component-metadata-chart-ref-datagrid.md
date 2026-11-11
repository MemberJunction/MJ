---
"@memberjunction/core": patch
---

Two component metadata fixes:
- **ApexCharts chart-ref lint rule.** `check-chart-ref-management` reset its cached state on every AST node, so it re-ran its whole walk node by node. In a component that exports a chart it also threw on every node. It now runs once per lint, and also covers arrow-function components.
- **DataGrid row-click guidance.** The DataGrid spec's example called `OpenEntityRecord` from `onRowClick` while `entityName` was set and cancelled only afterwards, so a component that followed it opened the record twice. The example and the `entityName`, `entityPrimaryKeys` and `rowClick` descriptions now show the two correct patterns: let the grid open the record, or cancel first and open it yourself.
