---
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/aiengine": patch
"@memberjunction/skip-types": patch
"@memberjunction/server": patch
---

- Optimize AIEngine embedding generation to eliminate wasteful auto-refresh regeneration (~3s → <1ms)
- Enhance Skip artifact retrieval with optimized query and conversationDetailID for reliable modification workflow
- Add Query Parameter Processor to SQLServerDataProvider index exports
- Replace 4 RunView calls with single optimized query for Skip artifact retrieval
