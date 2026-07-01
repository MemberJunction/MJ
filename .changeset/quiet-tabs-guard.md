---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-shared": patch
---

Guard Explorer tab query-param writes against reused tabs so a cached conversation component can no longer write conversation params onto a tab reused for a record, fixing the stuck loading overlay bug.
