---
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ng-conversations": patch
---

Let an agent tell the framework whether its payload is a **new** artifact or a **new version** of an existing one, instead of leaving that to be inferred at the write.

`ProcessAgentArtifacts` chose its target from continuity signals alone: an explicit `sourceArtifactId`, else the previous artifact on the conversation detail. Both signals say only "this conversation already has an artifact" — neither distinguishes a restyle of the current component from a request for a different one. So an agent that produced an unrelated deliverable mid-conversation had it saved as version N of whatever came before (Skip-Brain #529).

`BaseAgentNextStep` and `ExecuteAgentResult` now carry an optional `ArtifactDirective`: `create-new`, `version-source` (with an optional `targetArtifactId`), or `suppress`. `planArtifactTarget()` is exported from `@memberjunction/ai-agents` so the resulting precedence is testable without a database.

Precedence is deliberately narrow — the directive is advice from an agent, not a command, and is consulted only **after** the checks that already existed, so it can never widen what a caller or an agent's configuration refused:

1. `createArtifacts === false` → nothing written; a directive cannot re-enable creation.
2. `ArtifactCreationMode: 'Never'` → nothing written.
3. The directive.
4. **No directive → the historical chain, byte-for-byte unchanged.** Every existing agent is unaffected.

A directive-named `targetArtifactId` is model output, and it reaches the `ExtraFilter` fragments built by `GetMaxVersionForArtifact` / `CheckForDuplicateVersion`. It is therefore rejected unless it parses as a UUID **and** loads as a readable `MJ: Artifacts` row; either check failing logs and falls back to the historical chain exactly as if no target had been named. These checks run only for a directive-supplied id — a caller's `sourceArtifactId` reaches those filters exactly as before.

Two supporting changes ride along:

- **`PayloadManager` no longer leaves data-free shells in arrays.** When a sub-agent returns a *shorter* array than the parent holds, every scalar under the vacated index is deleted — and `_.unset` removes leaves while leaving the containers that held them. The result is an element that carries no data but is not key-free, which the previous `Object.keys().length === 0` cleanup could not see. Emptiness is now judged recursively, so such an element is dropped. Before this, a sub-agent legitimately removing one item from a structured array left a nameless residue that downstream consumers read as a real record; for component pipelines that meant a crash at the last step, after the full generation run.

- **`ng-conversations` stops guessing which artifact to open.** The chat area snapshots artifact versions before a turn and diffs after, with *created* beating *bumped*, so a newly created artifact wins the panel over one that merely gained a version — including when the panel is already open on something else, which the previous `!showArtifactPanel` gate suppressed. Dead `targetArtifactVersionId` plumbing in the message input is left intact on this line, where the Check Sage Intent prompt populates it.
