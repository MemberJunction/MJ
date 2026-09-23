---
"@memberjunction/core-entities-server": minor
---

Fix server-side hook cooperation during record cloning:
- Support cloning generated actions and AI remote operations without erroneously triggering code regeneration when code is already provided.
- Forward `EntitySaveOptions` across `MJVectorIndexEntityServer`, `MJDuplicateRunEntityServer`, and `MJComponentEntityServer` `Save()` overrides.
- Introduce `MJRecordChangeEntityServer` to permit Comments-only updates for users holding the `Record Changes: Annotate` authorization while blocking all other mutations to audit records.
