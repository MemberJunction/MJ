---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/server": patch
---

Add `client:capture-snapshot` actionable command so agents can request the user's live view of a Component artifact (including client-side filter/sort/selection state) before answering. Wires the command through SkipProxyAgent and adds a chat-UI handler that captures the snapshot, attaches it as a Data Snapshot artifact, and auto-sends the followup question.
