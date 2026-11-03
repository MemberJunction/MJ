---
"@memberjunction/ng-conversations": patch
---

Chat search panel: debounce typed queries (250 ms), keep only the newest search's results, and look up artifact collections with two batched reads instead of one query per artifact.
