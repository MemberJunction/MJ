---
"@memberjunction/core-entities-server": minor
---

Fix server-side hook cooperation during record cloning:
- Support cloning generated actions and AI remote operations without erroneously triggering code regeneration when code is already provided.
- Forward `EntitySaveOptions` across `MJVectorIndexEntityServer`, `MJDuplicateRunEntityServer`, and `MJComponentEntityServer` `Save()` overrides.
- Introduce `MJRecordChangeEntityServer`: an update to an `MJ: Record Changes` row must change only `Comments`, and the user must hold the `Record Changes: Annotate` authorization as well as the entity's usual Update permission. Every other change to an audit record is refused.
