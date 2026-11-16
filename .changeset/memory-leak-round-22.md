---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/server": patch
---

Memory-leak audit Round 22 fixes.

- `AgentUserPolicyEngine` keeps its policy cache in a bounded `MJLruCache` (2,000 slots, 15 min TTL). MJServer builds a provider per request and the cache is scoped by provider, so every agent run, wake trigger and policy-guarded CRUD action used to add a slot that was never read again.
- `BaseModelRunner` drops saved prompt runs from its parent-chaining table and caps it at 256, so long-lived runners that never call `FlushPendingSaves()` no longer keep every prompt-run entity.
- `ArtifactCollaborationServer` evicts its per-artifact compacted-vector index past 256 artifacts instead of keeping one entry per artifact ever compacted.
- The Tasks view and message rows no longer restart their polling / elapsed-time intervals when a task load settles after the component is destroyed.
