---
"@memberjunction/ai-mcp-server": patch
"@memberjunction/ai-openai": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/installer": patch
"@memberjunction/messaging-adapters": patch
---

Fix a set of resource-leak findings from the Round 14 memory-leak audit: `ai-mcp-server`'s `--list-tools` CLI path now attaches a pool `error` handler and guarantees the SQL connection pool is closed in a `finally` block, so a failed tool-discovery run no longer orphans the connection; `ai-openai`'s `OpenAIRealtimeSession.Close()` (inherited by the xAI provider) now clears its callback-handler fields on close, matching the Gemini and ElevenLabs realtime sessions; `ng-dashboards`'s `ConnectionsComponent` and `GraphQLConsoleComponent` now call `super.ngOnInit()`/`super.ngOnDestroy()` so `BaseResourceComponent`'s query-param subscription and `destroy$` teardown run correctly; `installer`'s `GitHubReleaseProvider` and `SmokeTestPhase` now drain discarded HTTP response bodies instead of leaving them unconsumed; and `messaging-adapters`'s `SlackAdapter.thinkingMessageIds` map now uses the same TTL/max-size eviction pattern already applied to its sibling per-thread maps.
