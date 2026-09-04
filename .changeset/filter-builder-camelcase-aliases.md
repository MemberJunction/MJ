---
"@memberjunction/ng-filter-builder": patch
---

Re-export camelCase aliases (`createEmptyFilter`, `createFilterRule`, `isCompositeFilter`, and the operator helpers) alongside the PascalCase names from #4185 so existing compiled consumers keep resolving.
