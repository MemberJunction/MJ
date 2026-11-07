---
'@memberjunction/ai': patch
'@memberjunction/ai-realtime-client': patch
---

Gemini Live: when a session resumes on a new connection (Google closes one at about 600 s), the client now sends the conversation so far, so an agent no longer restarts an interview when an ephemeral-token resume comes back empty. Adds `RealtimeConversationMemory`. A tool result for a call from before the resume goes out as labelled text. Gemini Enterprise is unchanged: its relay would drop a seed.
