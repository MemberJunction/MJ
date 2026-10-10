---
"@memberjunction/ai": patch
"@memberjunction/ai-openai": patch
---

OpenAI Live's `brokerBaseUrl` setting no longer reaches other realtime providers. It is now registered in `REALTIME_SHARED_CONFIG_KEYS` (`@memberjunction/ai`), the list of MJ-side keys drivers keep off the provider wire, and the OpenAI-protocol scrub `ExtractRealtimeFeatures` (`@memberjunction/ai-openai`) removes it, as it does `proxyBaseUrl`. Before, a config bag that set it and reached another driver passed it on as an unknown session field. A co-agent's `realtime.voice.providers.openai` bag is filed onto OpenAI Realtime as well as OpenAI Live, and OpenAI Realtime (with xAI and Hugging Face, which share its scrub) spreads the rest of the bag into the session it sends. Inworld forwarded it the same way, and Gemini merged it into its connect config. OpenAI Live still reads `brokerBaseUrl` for its SDP broker URL.
