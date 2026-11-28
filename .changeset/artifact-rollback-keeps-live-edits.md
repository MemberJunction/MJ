---
"@memberjunction/server": patch
"@memberjunction/ai-agents": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
---

Follow-up to the live artifact collaboration work: an agent edit that fails to commit no longer takes collaborators' work with it, and the rollback no longer needs a permission bypass.

Collaboration server (rollback):
- Rolling back a deferred agent edit now undoes only the agent's change. Before, it reset the room to the last saved version, which dropped unsaved edits typed before the agent call and edits made while the agent's version was being saved.
- On slides and spreadsheets, a slide, sheet, cell or deck field goes back to its earlier value only if it still holds the agent's value. Anything a person has since edited is kept.
- After a rollback the room is marked dirty when its content differs from the restored base version, so the remaining edits still get saved.

Collaboration server (reconcile):
- When a saved version is reconciled into a live slide deck or workbook, a slide, sheet, cell or field that the saved version left unchanged is no longer overwritten. A person's concurrent edit to it survives.
- If the saved version kept the original slide or sheet order, a concurrent reorder is kept as well.
- `ArtifactLiveMutationHookResult.rollback` is now typed with the `rolledBackVersionId` argument it already received.
- A failure to check for room peers is logged instead of ignored.

Agent tool manager (version rollback):
- The rollback loads and deletes (or reverts) the agent's version row as the system user, so a user who may edit but not delete versions no longer leaves a stray version behind.
- This replaces the trusted-rollback marker on `ArtifactPermissionDelegate` and `MJArtifactVersionEntityServer`, which is removed.
- A reused agent-run version is now always reverted, even when a newer version exists.
