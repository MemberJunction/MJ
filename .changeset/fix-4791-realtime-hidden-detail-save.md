---
"@memberjunction/core-entities": patch
"@memberjunction/server": patch
---

Realtime voice sessions from magic-link (anonymous) users now save their hidden tool-execution and artifact-anchor conversation turns. These were refused because they were written as the system user, who does not own the conversation. A refused conversation-detail write now reports why, instead of logging "unknown error" (#4791).
