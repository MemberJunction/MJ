---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/server": patch
---

Memory-leak audit Round 22 fixes.

- `AgentUserPolicyEngine` scopes per-request `IMetadataProvider` policy caches via a `WeakMap` (with O(1) generation-stamped pair invalidation across live providers) instead of stringifying per-request provider IDs into a singleton `Map` that pinned dead request providers.
- `BaseModelRunner` removes prompt runs from `_trackedPromptRunsById` deterministically in `_promptRunQueue.Settled(promptRun).finally(...)` as soon as each INSERT settles, so long-lived runners never accumulate prompt-run entities while keeping all concurrent in-flight parent runs tracked.
- `ArtifactCollaborationServer` removes entries from `CompactedVectorKeysByArtifact` when `CompactedStateVectors` evicts their last vector key instead of keeping orphan per-artifact entries for the life of the process.
- The Tasks view and message rows no longer restart their polling / elapsed-time intervals when a task load settles after the component is destroyed.
