---
"@memberjunction/ng-trees": patch
---

Fix "Maximum call stack size exceeded" in the tree component when branch data contains a ParentID cycle. Added cycle detection in buildBranchHierarchy and ancestor tracking in cloneNode, using UUIDsEqual/NormalizeUUID for cross-platform UUID safety.
