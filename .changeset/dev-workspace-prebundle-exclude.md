---
"@memberjunction/cli": patch
---

`mj dev workspace` adds the linked repos' npm scopes to each app shell's `angular.json` prebundle exclude on join, records them in the sentinel, reports them in `status`/`doctor`, and `clean` removes exactly those entries (#3875).
