---
"@memberjunction/ai": minor
"@memberjunction/ai-huggingface": minor
"@memberjunction/ai-realtime-client": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/ng-conversations": minor
---

Add a self-hosted **HuggingFace speech-to-speech** realtime (voice) provider, sitting side-by-side with the cloud realtime providers (OpenAI, Gemini, ElevenLabs, AssemblyAI) with no host changes. It treats HuggingFace's open-source VAD → STT → LLM → TTS stack (in its OpenAI-Realtime-compatible `/v1/realtime` mode) as a `Realtime` model — private-by-design (audio never leaves owned infrastructure), cost-free, and component-swappable.

Because the endpoint is self-hosted, the shipped client-direct audio topology runs through a new provider-agnostic **MJAPI realtime proxy**: the driver mints a one-time ticket into a shared `RealtimeProxyRegistry` (`@memberjunction/ai`) and hands the browser a `wss://<mjapi-public>/realtime-proxy?ticket=…` URL, so the internal endpoint + auth never reach the browser and the box needs no browser-facing ingress. Adds the new `@memberjunction/ai-huggingface` driver package, the `HuggingFaceRealtimeClient` (`@memberjunction/ai-realtime-client`), the `RealtimeProxyServer` + single upgrade-router in `@memberjunction/server`, the class-registration manifest entry (`@memberjunction/server-bootstrap`), and the client-load wiring (`@memberjunction/ng-conversations`), plus the `Hugging Face` vendor + `HuggingFace Speech-to-Speech` model metadata (low PowerRank — opt-in). Additive only; endpoint/auth/sample-rate are deployment config.
