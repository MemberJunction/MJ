---
"@memberjunction/core-entities-server": patch
---

The query description pass no longer undoes changes made while it waits for the LLM. It read its rows before the call and saved them after, and a save sends every loaded column, so a parameter marked server-set during the wait lost the mark and a description written meanwhile was replaced. It now re-reads the rows after the call.
