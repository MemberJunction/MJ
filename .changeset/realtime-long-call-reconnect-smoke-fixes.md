---
'@memberjunction/ai': patch
'@memberjunction/ai-agents': patch
'@memberjunction/ai-gemini': patch
'@memberjunction/ai-realtime-client': patch
'@memberjunction/ng-conversations': patch
'@memberjunction/ng-realtime-widget': patch
'@memberjunction/server': patch
'@memberjunction/realtime-runtime': patch
---

Realtime long-call reconnect fixes found by a live smoke test of #6462: catalog timing reaches browser clients; bounded reconnect recovery window; OpenAI/xAI recover from a lost transport; Gemini token uses and token-expiry moves; input and answers survive a move; seed order on OpenAI; refresh rate limit sized from the real move cadence; tab close closes the agent session.
