---
"@memberjunction/core-entities": patch
"@memberjunction/server": patch
"@memberjunction/ai-agents": patch
---

Realtime voice sessions from magic-link (anonymous) users now save their hidden tool-execution and artifact-anchor conversation turns. These were refused because they were written as the system user, who does not own the conversation. A refused conversation-detail write now reports why, instead of logging "unknown error" (#4791). Agent runs started from a conversation now include that reason when saving their conversation messages fails.
