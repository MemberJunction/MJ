---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/conversations-runtime": patch
---

Use lts/5 method names (`preload`, `initialize`, `parseMentions`) in code and tests that the #4943 and #5549 backports carried over from next, which renamed them to PascalCase. Fixes the lts/5 build of ng-explorer-core.
