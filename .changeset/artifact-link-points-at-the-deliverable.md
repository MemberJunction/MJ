---
"@memberjunction/ai-agents": patch
"@memberjunction/messaging-adapters": patch
---

Make "open the artifact" point at the file the agent produced, not its internal payload

Ask an agent for a document and the reply's artifact link opened raw JSON. Two causes:

- **`ai-agents`:** `RunAgentInConversation` derived `artifactInfo` only from the *payload* artifact. `ProcessFileArtifacts` was awaited and its result discarded, so a run whose entire purpose was a .docx or .pdf never reported the artifact it created. File-artifact creation now returns `CreatedArtifactInfo` through `createArtifactWithVersion` → `createFileArtifact`/`createInlineFileArtifact` → `processFileOutput` → `ProcessFileArtifacts`, and `selectPrimaryArtifact` prefers a file artifact over the payload one.
- **`messaging-adapters`:** the bridge linked whatever artifact it was handed, including artifacts MJ marks `Visibility = 'System Only'` — which the Explorer UI hides precisely because they are internal state. Those are no longer linked. Checked on the artifact rather than the agent's `ArtifactCreationMode`, since a System-Only agent can still produce a user-facing file artifact. Fails open: an unreadable artifact keeps its link.

**Behavior change:** callers that relied on `artifactInfo` always being the payload artifact will now receive the file artifact when a run produced one. That is the deliverable in every case we could find, and it is what both MJ Explorer and the messaging bridge present as "open the artifact".

Tests: ai-agents 1901/1901 (4 added), messaging-adapters 341/341 (3 added); both mutation-checked.
