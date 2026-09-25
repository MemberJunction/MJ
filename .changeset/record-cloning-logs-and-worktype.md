---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
---

Support Record Clone Logs, Record Process 'Clone' WorkType, and typed clone metadata configurations (§3.4, §4.1, §4.2, §4.3, §10.5):
- Add `RecordCloneLog` and `RecordCloneLogItem` database tables, CodeGen entities (`MJRecordCloneLogEntity`, `MJRecordCloneLogItemEntity`), and typed `PlanJSONObject` accessor backed by `IClonePlan` JSONType definition.
- Expand `CK_RecordProcess_WorkType` to include `'Clone'`.
- Define `IClonePlan`, `IEntityCloneConfiguration`, `ICloneRelationshipPolicy`, and `IEntityFieldCloneConfiguration` JSONType interfaces. `ICloneRelationshipPolicy.ExcludeRows` leaves matching child rows (and their descendants) out of a clone, e.g. device tokens and drafts among a user's settings.
- Add typed `CloneConfig`, `CloneEnabled`, and `NotCloneable` getters to `EntityInfo`, `EntityRelationshipInfo`, and `EntityFieldInfo` in `@memberjunction/core`.
- Seed metadata for `recordclone` API scopes, `Record Cloned` audit log type, `Record Cloning` remote operation category, and the `Record Cloning` authorization tree: `Clone Records` (with `Clone Records in Platform Schema` and `Clone Records in Custom Schemas` under it), and its siblings `Clone Records: Fire Hooks`, `Clone Records: Batch` and `Clone Records: Override Scope`, which holding `Clone Records` does not grant. Also the `Record Changes: Annotate` and `Manage Authorizations` authorizations. Developer holds each explicitly.
