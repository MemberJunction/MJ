---
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
---

Fresh installs migrate again. The `V202610171900` migration (AI Agent User Policies and User Routine wake) refreshed entity field metadata for the whole core schema, which collided on `UQ_EntityField_EntityID_Sequence` on any new database; the refresh is now limited to the entities that migration changes. Generated code is regenerated to match a clean database: deprecated fields (AI Agent Run `AgentState`; Conversation Detail `SuggestedResponses`, `ArtifactID`, `ArtifactVersionID`) no longer appear on their generated forms, and AI Agent User Policy's `CalendarChannelMode` moves to its column position.
