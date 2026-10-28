---
"@memberjunction/ng-dashboards": patch
"@memberjunction/core": patch
---

The vector management dashboard counts each entity document's vectors again. It read `TotalRowCount` off a `MaxRows: 1` read, and since #4450 a full `MaxRows: 1` read skips the total count, so every document showed 1 (or 0) vectors. It now reads two rows, which keeps the count query. `RunViewParams.MaxRows` documents the rule: with `MaxRows: 1`, `TotalRowCount` is the number of rows returned (#6000).
