---
"@memberjunction/ai-gemini": patch
---

Gemini and Vertex AI: a native tool loop no longer fails on Vertex AI with 400 "Requests ending with a model turn are not supported". The driver used to merge a tool-result turn and the user text after it (an agent's per-turn runtime-state message) into one user turn, which Vertex AI rejects; they now go out as separate user turns. The driver also never sends an empty model turn, keeps a trailing assistant turn as a model turn and follows it with a short user turn instead of relabelling it as the user's, and sends a short user turn instead of an empty message when a request has only a system prompt.
