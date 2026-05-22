---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/core": patch
---

Fix dashboard resource navigation to parse OpenEntityRecord recordId as a URL segment so single-PK composite keys round-trip correctly (was producing malformed `ID|ID|<value>` URLs and dropping the record ID), plus add regression tests for `CompositeKey.LoadFromURLSegment`.
