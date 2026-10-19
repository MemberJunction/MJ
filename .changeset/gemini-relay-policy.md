---
"@memberjunction/ai-gemini": patch
---

Gemini Live relay policy for MJAPI's realtime relay. `BuildGeminiLiveSetup` writes the Live `setup` message from a connect config the way `@google/genai` does, for the Gemini Developer API and Gemini Enterprise; a parity test runs the installed SDK against a local socket in both modes. `GeminiLiveRelayPolicy` opens every relayed connection with that server-written setup and reads only a resumption handle and an audio-only request from the browser's; after it, it forwards only realtime input, `user` turns and tool responses (camelCase or snake_case, known keys, Gemini's media types) and drops the rest, including a second setup, `contextUpdate`, and `system` or `model` turns. Nothing uses either yet.
