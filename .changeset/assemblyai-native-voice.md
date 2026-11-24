---
"@memberjunction/ai": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-assemblyai": minor
"@memberjunction/ai-realtime-client": minor
"@memberjunction/server": minor
"@memberjunction/realtime-runtime": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ai-provider-bundle": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/core": minor
---

Add AssemblyAI's current voice stack as a realtime model. `AssemblyAIVoiceRealtime` runs STT 3.7 Realtime Agent, an LLM Gateway model and TTS-1 as one voice agent inside MJAPI, and replaces the Voice Agent API that AssemblyAI retires on February 1, 2027 (`AssemblyAIRealtime`, unchanged here). Set `AI_VENDOR_API_KEY__AssemblyAIVoiceRealtime` to use it. MJAPI's realtime proxy can now connect a browser to an upstream that runs inside the process (`RealtimeProxyIssueParams.OpenInProcess`), so such a driver needs no host of its own and the prompt, tools and key stay on the server.
