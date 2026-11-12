---
"@memberjunction/ng-explorer-core": patch
---

Notifications screen: choosing "All Types" in the Type dropdown shows every notification again instead of none (the option bound the string `"null"`, which matched no type). A new "Other (no type)" option shows notifications that have no type.
