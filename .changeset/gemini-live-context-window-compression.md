---
"@memberjunction/ai-gemini": patch
---

Gemini Live sessions now start with sliding-window context window compression, on both the server-bridged and the browser (client-direct) paths. Without it, Google ends a session when its context fills: about 2 minutes once video frames flow, about 15 minutes for audio only. A config-bag `contextWindowCompression` object still overrides the default; a malformed one is replaced with the default and reported.
