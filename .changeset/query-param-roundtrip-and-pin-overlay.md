---
"@memberjunction/ng-shared": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-dashboards": patch
---

Fix query-param state so it round-trips for deep links, Home pins, and browser back/forward — resource components now restore sub-state when params change after initial load (e.g. clicking a second conversation pin no longer reopens the already-cached chat). Also fixes the "Pinning..." overlay hanging when pinning from the Data Explorer by backgrounding the thumbnail capture and skipping it for very large DOM trees.
