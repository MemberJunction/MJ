---
"@memberjunction/ai-gemini": minor
---

Consecutive user text messages are no longer combined into one Gemini turn: they are kept apart by a short model turn (`GEMINI_USER_TURN_SEPARATOR_TEXT`, "OK"). Gemini's implicit cache reuses a previous request only when the new request repeats it, and a user turn that grows from one request to the next is never reused. An agent on the envelope path keeps action results, retries and runtime state as user messages, so every request was the system prompt plus one changing turn and nothing after the system prompt was cached. Measured on Gemini 3.8 Flash, the separated form caches everything up to about 2,050 tokens before the end of the previous request. Function-response turns are unchanged: they still follow the model turn that made the calls. Vertex AI shares this code.
