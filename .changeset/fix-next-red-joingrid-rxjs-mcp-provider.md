---
"@memberjunction/ng-join-grid": patch
"@memberjunction/ai-mcp-server": patch
---

Fix the `next` build: declare `rxjs` as a dependency of `ng-join-grid`, and mark the MCP server's process-wide tool-cache key as an intentional global-provider use so the multi-provider compliance guard passes.
