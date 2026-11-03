---
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-explorer-core": patch
---

Chat search panel: debounce typed queries (250 ms), keep only the newest search's results, and look up artifact collections with two batched reads instead of one query per artifact.

Conversation export: every format now writes the output artifacts of each message (name, type, version, stored text content capped at 20,000 characters; MIME type for file-backed versions), with a deep link when the host supplies one. The export button is disabled when there is no conversation to export.
