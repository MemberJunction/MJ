---
"@memberjunction/ai-agents": patch
---

Add array indexing support to ActionInputMapping in Flow agents. Flow
agent ActionInputMapping now supports JavaScript-style array indexing
syntax (e.g., `payload.array[0]`, `payload.nested.records[5].field`) for
accessing specific array elements in payload references.
