---
"@memberjunction/dynamic-packages": patch
---

Pass `DynamicPackageStartupContext` with `ProcessId` to dynamic package `StartupExport` functions so startup kicks can distinguish host environments (e.g. `mjapi` vs `cli:<cmd>` vs test runners) without heuristic argv sniffing.
