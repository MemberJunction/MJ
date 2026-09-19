# Entity Record Cloning — Use-Case Catalog

**Companion to**: [`README.md`](./README.md) (the master plan)
**Status**: normative for phases 4 and 6; each entry is executed by the PR named in it
**Owner**: MJ Core (§1), each app repo's owner (§2)

This catalog is the list of everything the feature clones, in MJ core and in every app repo, with the configuration each entity ships. It was built from the entity classes and server subclasses of every repo (the generated ORM is the schema's source of truth; migrations were read only for constraints and triggers). Each entry has the same shape:

- **Why** — the user story the clone serves.
- **Graph** — every relationship the discovery walk finds, the edge kind, the policy, and the reason.
- **Resets and rules** — what changes on the copy and why.
- **Hooks** — the server `Save()` behaviour the engine must cooperate with.
- **Configuration** — the `Clone` section of the entity's `Configuration` bag, exactly as seeded (schema in the master plan §4). Placed in the entity's single Configuration file per §4.6.
- **Adoption** — the `RelatedRecordCollection` declarations added so the Deep children are collections on the generated class (§6.6).
- **Retires** — hand-rolled copy code deleted by the PR.
- **Checks** — the integration checks the PR adds (`IT95` for core, the app's own suite for apps).

Policy vocabulary: **Deep** creates a copy; **Reference** points the clone at the same row; **Skip** leaves it out. Edge kinds are those of the master plan §2.3. "Locked" means the UI cannot change the policy.

---

## 1. MJ core (phase 4)

### 1.1 `MJ: Users` — P4.1, IT94 RC1 and IT95 RCU1

**Why**: onboard a user "like Alice": same roles, application entries, settings and notification preferences, without Alice's inbox, favorites, views or history. This is the first study case and the live regression test.

**Graph** (210 FK columns point at Users; only ownership edges are followed; everything else is authorship or audit and is Skip by built-in exclusion):

| Child | Edge | Policy | Why |
|---|---|---|---|
| `MJ: User Roles` | Relationship | Deep, Locked | Membership rows; far side (Role) referenced |
| `MJ: User Applications` | Relationship | Deep | Carries `Sequence`, `IsActive`; `UQ_UserApplication_UserID_ApplicationID` is parent-scoped |
| `MJ: User Application Entities` | Relationship (under User Applications) | Deep | Two-level remap through the User Application key |
| `MJ: User Settings` | Relationship | Deep | Opaque namespaced key/value pairs |
| `MJ: User Notification Preferences` | Relationship | Deep | Real configuration |
| `MJ: User Views` | Relationship | Skip (preset `with-views` makes it Deep) | Saved views are optional onboarding content; when cloned, `IsDefault` and `IsShared` reset |
| `MJ: User Favorites` | Relationship | Skip | Noise |
| `MJ: User Notifications`, `MJ: User Record Logs`, `MJ: User View Runs`, `MJ: Audit Logs`, `MJ: Record Changes` | Relationship | Skip, Locked | Inbox and history |
| `MJ: User Routines` (+ recipients, runs) | Relationship | Skip, Locked | Personal automations fire real work |
| `MJ: Dashboards`, `MJ: Lists`, `MJ: Conversations`, `MJ: Templates`, `MJ: Queries` … via `UserID` | InboundFK | Skip, Locked | Authorship, not ownership |

**Resets and rules**: `Name` and `Email` prompted (Email is a global unique; `Name = Email` by convention, so the rule sets `Name` from the prompted email); `FirstName`, `LastName` prompted; `Type` reset to `'User'` (never copy `'Owner'`); `IsActive` reset to `false`; `LinkedEntityID`, `LinkedEntityRecordID`, `LinkedRecordType`, `EmployeeID`, `UserImageURL`, `UserImageIconClass` reset to null (they identify one person).

**Hooks**: `MJUserEntityServer` refuses creates by non-Owners and `ReplayOnly` saves; `MJUserRoleEntityServer` guards role grants. The clone is an Owner-only operation (`RequiredUserType`), and the engine never bypasses `Validate()`.

**Configuration**:

```json
{
  "Enabled": true,
  "RequiredUserType": "Owner",
  "MaxDepth": 2,
  "MaxRecords": 500,
  "Naming": { "Strategy": "prompt", "Fields": ["Email"] },
  "Fields": {
    "Strict": true,
    "PromptFor": ["Email", "FirstName", "LastName"],
    "Reset": { "Type": "User", "IsActive": false, "LinkedEntityID": null, "LinkedEntityRecordID": null, "LinkedRecordType": null, "EmployeeID": null, "UserImageURL": null, "UserImageIconClass": null },
    "Rules": { "Rules": [ { "Field": "Name", "Source": { "Kind": "field", "Field": "Email" } } ] },
    "Copy": ["Title"]
  },
  "Relationships": {
    "MJ: User Roles": { "Policy": "Deep", "Locked": true },
    "MJ: User Applications": { "Policy": "Deep" },
    "MJ: User Settings": { "Policy": "Deep" },
    "MJ: User Notification Preferences": { "Policy": "Deep" },
    "MJ: User Views": { "Policy": "Skip", "Fields": { "Reset": { "IsDefault": false, "IsShared": false } } },
    "MJ: User Favorites": { "Policy": "Skip" },
    "MJ: User Routines": { "Policy": "Skip", "Locked": true }
  },
  "Descendants": {
    "MJ: User Applications": { "Fields": { "Copy": ["Sequence", "IsActive"] } }
  },
  "Hooks": { "EntityActions": "suppress" },
  "Presets": [
    { "Key": "with-views", "Label": "Include saved views", "Options": { "MaxDepth": 2 } }
  ],
  "UI": { "Label": "Clone user", "Icon": "fa-solid fa-user-plus", "ConfirmationMessage": "The new user is created inactive and must be activated after review." }
}
```

The `with-views` preset flips the `MJ: User Views` relationship to Deep through an `EdgeOverride` the preset carries; the schema allows presets to include `EdgeOverrides` (added to `IClonePreset.Options` as part of P2.1).

**Adoption**: `RelatedRecordCollection` declarations for `MJ: Users` → `MJ: User Roles` (`Roles`), `MJ: User Applications` (`Applications`), `MJ: User Settings` (`Settings`), `MJ: User Notification Preferences` (`NotificationPreferences`); `MJ: User Applications` → `MJ: User Application Entities` (`Entities`, `Sequence { Field: 'Sequence', From: 1 }`). All `Source: 'database'`, `Load: 'explicit'`, `OnRemove: 'delete'`.

**Retires**: nothing.

**Checks**: IT94 RC1 (live clone, counts match, source untouched, clone inactive and not Owner); IT95 RCU1 (the `with-views` preset carries views with `IsDefault`/`IsShared` reset; a non-Owner is blocked at plan time with the entity's reason).

### 1.2 `MJ: AI Prompts` with `MJ: Templates` — P4.2, IT94 RC2 and IT95 RCU2

**Why**: iterate on a prompt without editing the original. The killer defect this prevents: `MJAIPromptEntityServer.Save()` writes prompt text into the linked template, so two prompts sharing one `TemplateID` silently edit each other.

**Graph**:

| Child | Edge | Policy | Why |
|---|---|---|---|
| `MJ: Templates` via `TemplateID` | ForwardFK (owned 1:1) | Deep, Locked | Owned; must exist before the prompt row (FK direction Prompt → Template) |
| `MJ: Template Contents` | Relationship (under Templates) | Deep | The text |
| `MJ: Template Params` | Relationship (under Templates) | Deep | `TemplateContentID` is a second parent pointer remapped through the content key map; null stays null |
| `MJ: AI Prompt Models` | Collection `Models` (cache-sourced, read-only today) | Deep via a database-sourced dynamic declaration until the metadata declaration is switched to `Source: 'database'` | Carries priority, execution group, model parameters |
| `MJ: AI Prompt Categories` via `CategoryID` | ForwardFK | Reference | Shared catalog |
| `MJ: AI Prompts` via `ResultSelectorPromptID` | SelfPointer | Reference (Remap when in set) | Linear pointer |
| `MJ: AI Prompt Runs`, run medias, `MJ: AI Result Cache`, scoped prompt configs | Relationship | Skip, Locked | History and cache |

**Resets and rules**: `Name` suffix strategy; `Status` reset to `'Pending'`; template `Name` follows the prompt's new name through a descendant rule; template `UserID` ownership.

**Hooks**: `MJAIPromptEntityServer.Save()` mints a template only when `TemplateID` is null; with the remapped id it does nothing. `MJTemplateContentEntityServer.Save()` runs the extraction pipeline on new content and syncs `MJ: Template Params`; because the engine clones params itself, `ServerGeneratedChildren` on `MJ: Template Contents` names `MJ: Template Params`, and the engine leaves param creation to the hook for content-scoped params while cloning template-scoped params (those with null `TemplateContentID`) through the template. The use case records this as the decision the study asked for: accept the pipeline's regeneration for content-scoped params.

**Configuration** (`MJ: AI Prompts`):

```json
{
  "Enabled": true,
  "MaxDepth": 3,
  "Naming": { "Template": "{Name} (copy)", "Strategy": "suffix" },
  "Fields": { "Reset": { "Status": "Pending" } },
  "Relationships": {
    "MJ: Templates": { "Policy": "Deep", "Locked": true },
    "MJ: AI Prompt Models": { "Policy": "Deep" },
    "MJ: AI Prompt Runs": { "Policy": "Skip", "Locked": true },
    "MJ: AI Result Cache": { "Policy": "Skip", "Locked": true }
  },
  "Descendants": {
    "MJ: Templates": { "Fields": { "Ownership": ["UserID"], "Reset": { "ActiveAt": null, "DisabledAt": null } }, "Naming": { "Template": "{Name} (copy)" } },
    "MJ: Template Contents": { "Fields": { "Copy": ["TypeID", "TemplateText", "Priority", "IsActive"] } }
  },
  "UI": { "Label": "Clone prompt", "Icon": "fa-solid fa-clone" }
}
```

`MJ: Templates` gets its own bag (`Enabled: true`, `Ownership: ['UserID']`, contents and params Deep, `Hooks.ServerGeneratedChildren` on contents as above) so it is cloneable standalone (RCU4 in 1.6).

**Adoption**: declarations `MJ: Templates` → `MJ: Template Contents` (`Contents`, `OrderBy: 'Priority ASC'`), `MJ: Templates` → `MJ: Template Params` (`Params`); the `MJ: AI Prompts` → `MJ: AI Prompt Models` declaration switches to `Source: 'database'`, `ReadOnly: false` (the engine cache stays the read path for the runtime; the clone writes through the database-backed collection).

**Checks**: IT94 RC2 (the clone's `TemplateID` differs from the source and the content count matches); IT95 RCU2 (prompt models cloned with priorities; runs not cloned; editing the clone's text leaves the source template untouched).

### 1.3 `MJ: AI Agents` — P4.3, IT95 RCU3

**Why**: fork an agent, including its sub-agent tree, steps and paths, to experiment without touching production.

**Graph** (25 entities carry `AgentID`):

| Child | Edge | Policy | Why |
|---|---|---|---|
| `MJ: AI Agents` via `ParentID` | Hierarchy (`IsHierarchy`) | Deep subtree | Sub-agents; parents remapped |
| `MJ: AI Agent Prompts` | Collection `Prompts` (database, writable) | Deep; prompt referenced | Junction with `ExecutionOrder`; a preset `deep-prompts` sets `MJ: AI Prompts` Deep |
| `MJ: AI Agent Actions` | Collection `Actions` (cache, read-only → dynamic) | Deep; action referenced | Carries execution limits and compaction settings |
| `MJ: AI Agent Steps` | Relationship | Deep | `SubAgentID` remapped when the sub-agent is in the set; `ActionID`/`PromptID` referenced |
| `MJ: AI Agent Step Paths` | Relationship (under Steps) | Deep | Both `OriginStepID` and `DestinationStepID` remapped through the step key map |
| `MJ: AI Agent Relationships` | Relationship | Deep | `SubAgentID` remapped when in set; `UX_AIAgentRelationship_Agent_SubAgent` parent-scoped |
| `MJ: AI Agent Artifact Types`, `Skills`, `Models`, `Modalities`, `Search Scopes`, `Client Tools`, `Credentials`, `Channels`, `Personas`, `Harnesses`, `Co Agents` | Relationship | Deep; far side referenced | Configuration rows; `AIAgentCoAgent.CoAgentID`/`TargetAgentID` remapped when in set |
| `MJ: AI Agent Data Sources`, `MJ: AI Agent Configurations` | Relationship | Deep | Parent-scoped uniques; `IsDefault` preserved (exactly one per agent) |
| `MJ: AI Agent Permissions` | Relationship | Skip (preset `with-permissions`) | A clone is private to its creator by default |
| `MJ: AI Agent Notes`, `MJ: AI Agent Examples`, `MJ: AI Agent Learning Cycles` | Relationship | Skip, Locked; `NotCloneable` on the entities | Learned memory with embeddings |
| `MJ: AI Agent Runs`, run steps, medias, sessions, requests, bridges | Relationship | Skip, Locked | Runtime |

**Resets and rules**: `Name` suffix; `Status` reset to `'Pending'`; `OwnerUserID` ownership; `ParentID` on the root reset to the request's parent or null; hierarchy computed columns not writable; JSON remaps: `RerankerConfiguration.rerankerModelId` and `.rerankPromptId` (remap prompts, reuse models), `ScopeConfig.dimensions[*].entityId` (reuse), `TypeConfiguration` and `AgentTypePromptParams` (copy; validated by `ValidateAsync`). Step and relationship mapping JSON columns are path maps with no ids and copy verbatim.

**Hooks**: `MJAIAgentEntityServer.ValidateAsync` validates `TypeConfiguration` against the type schema (`DefaultSkipAsyncValidation` false, so it runs); `MJAIAgentCoAgentEntityServer.ValidateAsync` enforces the target XOR. Notes and Examples regenerate embeddings on save, which is another reason they are `NotCloneable`.

**Configuration**: as the table implies; `MaxDepth: 4`, `MaxRecords: 1000`, `Hierarchy: 'subtree'`, `JsonRemap` for the two configuration columns, presets `deep-prompts` and `with-permissions`, `Hooks.EntityActions: 'suppress'`.

**Adoption**: declarations for Steps (`Steps`, `OrderBy: 'Name'`), Step Paths on Steps (`Paths`), Relationships (`SubAgentLinks`), Data Sources (`DataSources`), Configurations (`Configurations`), Models (`Models`), Modalities (`Modalities`); the `Actions` collection switches to database-sourced for writes as in 1.2.

**Checks**: IT95 RCU3 (a two-level agent with steps and paths clones with all step-path endpoints inside the clone; notes are not cloned; `Status` is Pending).

### 1.4 `MJ: Actions`, `MJ: Queries`, `MJ: Scheduled Jobs` — P4.4, IT94 RC8 and IT95 RCU5, RCU6, RCU7

**`MJ: Actions`** — Why: derive a variant of a generated or custom action. Graph: `MJ: Action Params` (Deep; parent-scoped unique `(Name, ActionID)`), `MJ: Action Result Codes` (Deep), `MJ: Action Libraries` (Deep; library referenced), `MJ: Action Authorizations`, `Action Contexts`, `Action Filters` (Deep; far side referenced), `MJ: Action Categories` (Reference), `ParentID` (Hierarchy, subtree), `MJ: Action Execution Logs` (Skip, Locked), `MJ: Entity Actions` (Skip, Locked: binding a clone to entity lifecycles must be a deliberate act; the uniqueness was dropped in 6.1 so duplicates would be accepted silently), `MJ: AI Agent Actions` (InboundFK, Skip). Resets: `Name` suffix (the unique is `(Name, CategoryID, ParentID)`, so the classifier declares it as a composite global key), `Status` and `CodeApprovalStatus` to `'Pending'`, `CodeApprovedByUserID`, `CodeApprovedAt`, `CreatedByAgentID` to null, `ForceCodeGeneration` false; JSON remap `RuntimeActionConfiguration.allowedEntities[*].id`, `allowedActions[*].id`, `allowedAgents[*].id` (remap when in set, else reuse). Hooks: the code-generation condition fixed in P1.6; until then `PreSaveOverrides: { CodeLocked: true }` with `RestoreAfterSave`; `ServerGeneratedChildren` empty after the fix. Adoption: the three cache-sourced collections (`Params`, `ResultCodes`, `Libraries`) switch to database-sourced for writes. Check RC8 in IT94; RCU5 covers the hierarchy subtree.

**`MJ: Queries`** — Why: copy a query as a starting point. Graph: `MJ: Query SQLs` (Deep; hand-authored dialect variants), `MJ: Query Permissions` (Deep; role referenced), `MJ: Query Dependencies` (Skip; regenerated by the hook), `MJ: Query Fields`, `MJ: Query Parameters`, `MJ: Query Entities` (Skip, Locked, `ServerGeneratedChildren`: `MJQueryEntityServer.Save()` regenerates them from `SQL` on a new record), `MJ: Query Categories` (Reference), `MJ: Materialized Result Queries` (Skip). Resets: `Name` suffix within category (filtered uniques `UX_Query_Name_CategoryID` and `UX_Query_Name_NullCategory` declared as `LiveState`-style composite keys scoped by `CategoryID`), `Status` to `'Pending'`, `EmbeddingVector` and `EmbeddingModelID` to null (`Embeddings: 'regenerate'`), `Feedback` null, `IsMaterialized` false. Check RCU6: cloned query has exactly one set of fields and parameters (the hook's), plus the cloned SQL variants and permissions.

**`MJ: Scheduled Jobs`** — Why: schedule the same job with a different cadence. Graph: `MJ: Scheduled Job Runs` (Skip, Locked), `MJ: Scheduled Job Types` (Reference). Resets: `Name`, `Status` to `'Pending'` (a clone must not start firing), `LastRunAt`, `NextRunAt`, `RunCount`, `SuccessCount`, `FailureCount`, `LockToken`, `LockedAt`, `LockedByInstance`, `ExpectedCompletionAt`, `StartAt`, `EndAt` to null or zero; JSON remap preset `scheduled-job-configuration` on `Configuration` (`ConversationID` nulled, `ActionParamID[]` remapped when the action was cloned, `AgentID`/`ActionID`/`CompanyIntegrationID` reused). Check RCU7: cloned job is Pending with zeroed counters and no lock.

### 1.5 `MJ: Dashboards`, `MJ: User Views`, `MJ: Lists`, `MJ: Themes`, `MJ: Data Contexts` — P4.5, IT95 RCU8 to RCU12

**`MJ: Dashboards`** — Why: copy a dashboard, keeping the same views and queries unless they are cloned too. Graph: `MJ: Dashboard Categories` (Reference), `MJ: Dashboard Category Links`, `Permissions`, `User Preferences`, `User States` (Skip, Locked: per-user placement and state, several filtered uniques). Resets: `Name` suffix, `UserID` ownership, `Thumbnail` null; JSON remap preset `dashboard-ui-config` on `UIConfigDetails` (panel `id` regenerated, `partTypeId` reused, `config.viewId` and `config.queryId` remapped when in set else reused). `MJDashboardEntityExtended.persistedUserID()` is a fail-closed ownership check on updates; a new record has no old value, so it is untouched. Check RCU8: panel ids differ, `viewId` unchanged when views are not cloned.

**`MJ: User Views`** — Why: the existing duplicate feature in `view-workspace.component.ts` (`persistDuplicate`) copies from a hand-written allow-list that rots as columns are added; the engine replaces it. Graph: none followed (`MJ: User View Runs` Skip). Resets: `Name` suffix (unique per user, so parent-scoped by `UserID`), `UserID` ownership, `IsShared` and `IsDefault` false, `SmartFilterWhereClause` and `SmartFilterExplanation` null (derived). JSON columns (`GridState`, `FilterState`, `SortState`, `CardState`, `DisplayState`) are field-name keyed and copy verbatim. Hook: `MJUserViewEntityServer` regenerates the smart filter when enabled; that is correct behaviour for a clone. Retires `persistDuplicate` and its allow-list; `Strict: true` replaces the guard. Check RCU9.

**`MJ: Lists`** — Why: replace `duplicateList` in the Lists dashboard. Graph: `MJ: List Details` (Deep; `Sequence { Field: 'Sequence', From: 1 }`; `Status` reset to `'Pending'`), `MJ: List Categories` (Reference), sharing and invitation rows (Skip, Locked). Resets: `Name` suffix, `UserID` ownership, `SourceViewID`, `SourceFilterSnapshot`, `LastRefreshedAt`, `LastRefreshedByUserID`, `ExternalSystemRecordID`, `CompanyIntegrationID` null. Retires `duplicateList`. Check RCU10.

**`MJ: Themes`** — Why: replace the Theme Studio `duplicate` routine. Graph: none. Resets: `Name` suffix, ownership, `IsDefault`-style flags false. Retires the routine in `theme-manager-dashboard.component.ts`. Check RCU11.

**`MJ: Data Contexts`** — Why: reuse a data context definition. Graph: `MJ: Data Context Items` (Deep; `RecordID`-style pointers inside items are soft links and are referenced, never remapped, because the items point at views, queries and records that are not in the set). Resets: `Name` suffix, `UserID` ownership. No hand-rolled copy routine exists for this entity. Check RCU12.

### 1.6 `MJ: Applications`, `MJ: Roles`, `MJ: Components`, `MJ: Record Processes`, `MJ: Templates` — P4.6, IT95 RCU13 to RCU17

**`MJ: Applications`** — Graph: `MJ: Application Entities` (Deep; entity referenced), `MJ: Application Settings` (Deep), `MJ: Application Roles` (Deep; role referenced), `MJ: User Applications`, `Dashboards`, `Conversations`, `Magic Link Invites` (Skip, Locked). Resets: `Name` (global unique, suffix), `Path` (`ServerAllocated`: `MJApplicationEntityServer` derives the slug and de-duplicates with `-2`, `-3`, the platform's own suffix algorithm), `DefaultForNewUser` false (otherwise the hook creates a `UserApplication` row per user), `Status`; JSON `DefaultNavItems` and `AgentSettings` copy verbatim. `Strict: true`. Check RCU13.

**`MJ: Roles`** — Why: the purest "clone a policy set". Graph: `MJ: Entity Permissions`, `MJ: Query Permissions`, `MJ: Authorization Roles`, `MJ: Application Roles`, `MJ: Entity Field Permissions`, `MJ: AI Agent Permissions`, `MJ: AI Skill Permissions`, `MJ: Search Scope Permissions`, `MJ: File Storage Account Permissions`, `MJ: MCP Server Connection Permissions`, `MJ: Resource Permissions` (all Deep; far side referenced), `MJ: User Roles`, `MJ: Employee Roles`, `MJ: Magic Link Invite Roles` (Skip, Locked: membership). Resets: `Name` (global unique, suffix), `SQLName` (`ServerAllocated`; CodeGen emits grants from it), `DirectoryID` null. `RequiredUserType: 'Owner'` (`MJRoleEntityServer` refuses creates by users of type User). `Strict: true`. Confirmation message names it as a permission-surface change. Check RCU14.

**`MJ: Components`** — Graph: `MJ: Component Dependencies` and `MJ: Component Library Links` (Deep; far side referenced; parent-scoped uniques). Resets: `Name`/`Version` suffix, `Status` to `'Draft'`, both vector columns and their model ids null (`Embeddings: 'regenerate'`), `SourceRegistryID`, `ReplicatedAt`, `LastSyncedAt` null; JSON rule rewrites `Specification.name` and `.namespace` to match. The description columns are read-only and synchronized from the specification, so they are not writable. Check RCU15.

**`MJ: Record Processes`** — Graph: `MJ: Process Runs` and details (Skip, Locked), `MJ: Record Process Watermarks` (Skip). Resets: `Name` suffix, `Status` to the initial value, `Configuration` copied (its `Options` may reference an entity by id; reused). Check RCU16.

**`MJ: Templates`** standalone — as in 1.2; check RCU17 (a template with content-scoped and template-scoped params clones with the expected param set after the extraction pipeline).

### 1.7 The negative catalog — P4.7

Seeded as `{ "Clone": { "NotCloneable": true, "NotCloneableReason": "…" } }`:

| Entities | Reason |
|---|---|
| `MJ: Entities`, `MJ: Entity Fields`, `MJ: Entity Relationships`, `MJ: Entity Field Values` (permission rows are not in this list; they are cloned under Roles) | A copy points at the same table and procedures; CodeGen reconciles these from the schema and would delete or corrupt a hand-made copy |
| `MJ: Record Changes`, `MJ: Audit Logs`, `MJ: Error Logs`, `MJ: User Record Logs`, `MJ: Record Clone Logs`, `MJ: Record Clone Log Items`, `MJ: Record Merge Logs`, `MJ: Record Merge Deletion Logs` | Immutable history |
| Every `*Runs`, `*Run Steps`, `*Run Details`, `*Logs`, `*Cache`, `*Watermarks` entity (the list is produced by name suffix and reviewed in the PR) | Runtime output |
| `MJ: Tasks`, `MJ: Task Dependencies` (core) | Run records of a task graph |
| `MJ: API Keys`, `MJ: Credentials`, `MJ: Encryption Keys`, `MJ: OAuth Tokens`, `MJ: Magic Link Invites` | Secrets and credentials |
| `MJ: AI Agent Notes`, `MJ: AI Agent Examples`, `MJ: AI Agent Learning Cycles` | Learned memory |
| `MJ: Conversations`, `MJ: Conversation Details`, artifacts and versions | Transcripts |

---

## 2. App repos (phase 6)

Each app PR: the `Clone` sections below in the app's entity Configuration file (declarative JSON, `uuidgen` keys where new records are created, no `sync` block, no `*__Metadata_Sync.sql`), the `RelatedRecordCollection` declarations listed, per-entity authorization leaves where the app wants narrow grants, the app's own integration checks, the retirement named, and a `CLAUDE.md` section. The release engineer folds the metadata into the app's next Metadata Sync migration; nothing in CI detects a pending seed, so the PR description says it.

Cross-cutting facts the entries rely on: `metadata/` ships only through a Metadata Sync migration; `RelatedRecordCollection` is declared by the app that owns the child table, so a child in a consumer app is cloned under a Common root only when the consumer contributes the relationship policy (the relationship row exists in the consumer's metadata); IS-A children share the parent's key and are written by the leaf's `Save()`; server-minted numbers are `ServerAllocated`; immutability triggers require `Reset` to the initial state; polymorphic `(EntityID, RecordID)` rows are soft links and default Skip.

### 2.1 bizapps-common — P6.1

**`MJ_BizApps_Common: People`** — Why: split or duplicate a person record, and the registry a future merge reads. Graph: `MJ_BizApps_Common: Contact Methods` (Collection `ContactMethods`, Deep), `MJ_BizApps_Common: Address Links` (SoftLink `EntityID`/`RecordID`, Deep with the address referenced: links are cloned, addresses shared by design), `MJ_BizApps_Common: Relationships` via `FromPersonID` (Collection `OutgoingRelationships`, Deep) and via `ToPersonID` (Relationship with no collection, Skip by default), `Activities` and `Activity Links` (Skip, Locked), IS-A subtypes from consumer apps (`Subtypes: 'include'`; `AllowMultipleSubtypes` is 1 since `V202608061617`, so every subtype row is attached with `AttachToParent`), consumer FKs (invisible by consumer blindness; nothing to configure). Resets: `LinkedUserID` null (filtered unique and deprecated column), `Status` to `'Active'`, `Email` and `Phone` prompted; `DisplayName` is computed and not writable; `ContactMethod.IsPrimary` preserved. Hooks: none that block. Configuration: `Enabled: true`, `Subtypes: 'include'`, `SoftLinks: 'include'` with `MJ_BizApps_Common: Address Links` Deep and its `AddressID` referenced, `Naming: { Strategy: 'prompt', Fields: ['Email'] }`. Adoption: none new (collections exist). Check: a person with two contact methods and one address link clones with the same address row referenced and the link duplicated.

**`MJ_BizApps_Common: Organizations`** — Same shape; `ChildOrganizations` is declared `OnRemove: 'orphan'`, which the built-in defaults read as Reference (never Deep) for the subtree; `ParentID` prompted; `TaxID` reset to null (a legal identifier); `Status` reset. Check: child organizations are not duplicated.

### 2.2 bizapps-orders — P6.2

**`MJ_BizApps_Orders: Products`** (the owner's named case) — Graph: `MJ_BizApps_Orders: Product Prices` (Collection `Prices`, Deep), `MJ_BizApps_Orders: Price Tiers` (Relationship under Product Prices, Deep; add a `Tiers` collection), `MJ_BizApps_Orders: Product Entitlements` (Deep; `(ProductID, Code)` parent-scoped), `MJ_BizApps_Orders: Product Bundle Items` where the product is the bundle (Deep; `ComponentProductID` referenced) and where it is a component (InboundFK, Skip, Locked), `MJ_BizApps_Orders: Event Products` (IsASubtype, dispatched by `ProductType.ProductExtensionEntity`, included), `Order Lines`, `Subscriptions`, `Entitlement Grants`, `Promotion Targets` (Skip, Locked), lookups (`ProductTypeID`, `ProductCategoryID`, `CompanyID`, `RevenueRecognitionTypeID`, `SubscriptionTypeID`, `PriceListID`, `VenueAddressID`) referenced, accounting's `GL Account Links` (soft link in another app's schema; contributed by accounting's own relationship policy, Deep with the GL account referenced, see 2.3). Resets: `SKU` null (filtered unique allows null), `Name` suffix, `Status` to `'Draft'`, `SuccessorProductID` null, `AvailableFrom`/`AvailableTo` prompted; every cloned price gets `EffectiveFrom` prompted or set to today by a rule (NOT NULL); the planner's parent-scoped unique pre-check covers `Priority` ties within a price list and window so `ProductPriceEntityServer.ValidateAsync` (which reads the engine cache and cannot see the in-flight rows) is not the first line. Hooks: none on Product; the price validator as noted. Adoption: `Tiers` on Product Prices, `Entitlements` and `BundleItems` on Products, `EventProduct` extension via the IS-A chain. Retires: nothing. Checks: product with two tiered prices and an event extension clones with tiers and the extension on the new key; a clone into the same price list with equal priorities is blocked at plan time with the reason.

**`MJ_BizApps_Orders: Order Headers`** as a new draft — Graph: `Lines` (Collection, Deep; `LineNumber` renumbered), `Event Order Lines` (IsASubtype on lines through `OrderLineExtensionCompanion`), `Adjustments` and `Charges` (Collections, Deep by preset only; allocations are engine-derived and Skip), embedded `BillToAddressID_Object` and `ShipToAddressID_Object` (Embedded, Reference: shared documents), `InitialPaymentDetailID` (Embedded, Reset to null: one order per payment detail), payments, entitlement grants, subscriptions, price components, allocations (Skip, Locked). Resets: `OrderNumber` `ServerAllocated`, `Status` to `'Draft'`, `OrderDate` today, `DueDate`/`RequestedDeliveryDate` prompted, `ConfirmedAt`, `PostedAt`, `PostedByUserID`, `ReversesOrderHeaderID`, `ReversalReason`, `ApprovalTaskID`, `ExternalDocumentNumber` null, totals and payment status not writable by intent (`Exclude`); per line `JournalEntryID`, `ReversesOrderLineID`, `SubscriptionID`, `RenewsSubscriptionID` null, `FulfillmentStatus` reset, `CheckInAt` null on event lines. Hooks: `OrderEntityServer.Save()` books journal entries on the first flip to Confirmed, so the clone must land in Draft (Locked reset). Checks: a confirmed order clones as a draft with renumbered lines and no journal entries.

**`MJ_BizApps_Orders: Promotions`** — `Promotion Targets` Deep (product and category referenced), `Promotion Codes` Deep with `Code` prompted or regenerated and redemption counters reset, window dates prompted, `Status` reset.

**`MJ_BizApps_Orders: Price Lists`** — `Code` reset (global unique); the prices that reference the list belong to products, so "copy list L to L2" is a retarget clone of the price rows: the configuration exposes it as a preset on `MJ_BizApps_Orders: Product Prices` with `Retarget: [{ Field: 'PriceListID' }]` and `IncludeWhen: "fields.PriceListID = clone.Options.Source"` documented as the filtered re-parent shape; it stresses the design deliberately and ships after the tree cases.

### 2.3 bizapps-accounting — P6.3

**Chart of accounts to a new company** (`MJ_BizApps_Accounting: GL Accounts`, set-valued) — Graph: `ParentGLAccountID` (Hierarchy, subtree; parents remapped inside the set), `MJ_BizApps_Accounting: GL Account Links` (SoftLink rows on the account, Deep; `RecordID` re-pointed at the new company's records through a rule), `MJ_BizApps_Accounting: GL Account Link Dimensions` (Deep), `Journal Entry Lines` (Skip, Locked), `Intercompany Account Matches` (Skip). Resets: `CompanyID` retarget (the whole point; `UI.RetargetFields: ['CompanyID']`), `Code` copied (per-company unique), `ExternalSystem`/`ExternalAccountID` null, `IsSystemSeeded` false, `Status` to `'Pending'`. Prerequisite: the target company has an `Accounting Company Profiles` row (IS-A child of `MJ: Companies`). Multi-root request: the UI offers "Copy chart to company…" from the GL Accounts grid with all accounts of the source company selected. Hooks: `GLAccountEntityServer.ValidateAsync` runs per row. Checks: a 3-level chart copies with parents remapped and codes intact.

**`MJ_BizApps_Accounting: Dimensions`** — `Dimension Values` Deep with `ParentDimensionValueID` hierarchy; `Code` reset (global), value codes copied (per-dimension); `EffectiveFrom`/`EffectiveTo` prompted.

**`MJ_BizApps_Accounting: Tax Jurisdictions`** — `Tax Rates` Deep; `Code` reset; per-rate `EffectiveFrom` prompted; the plan warns that no unique guards overlapping windows.

**Pending `MJ_BizApps_Accounting: Journal Entries`** — lines and line dimensions Deep; `Status` reset to `'Pending'` (Locked; any other status is refused by the immutability trigger), `EntryNumber` `ServerAllocated`, `JournalEntryBatchID`, `GLPostedAt`, `GLReferenceID`, reversal pointers null, `LineNumber` renumbered. The balance invariant is inherited because lines are cloned atomically.

### 2.4 bizapps-sales — P6.4

**`MJ_BizApps_Sales: Deals`** — Graph: `Team` (Collection, Deep), `PaymentSchedule` (Collection, Deep, `DisplayOrder` renumbered), `Deal Contact Roles` (Relationship without a collection today; add one, Deep), `Deal Stage Events` (Skip, Locked: append-only provenance whose rows stamp amounts and probabilities), `Forecast Snapshots` (Skip), the embedded order via `OrderID` (Reset to null; never re-pointed at the source's order), lookups referenced. Resets: `DealNumber` `ServerAllocated`, `DealStatusTypeID` set by a lookup rule choosing `IsActive = 1 AND IsOpen = 1 AND LocksDeal = 0` (by flag, never by name; the vocabulary gate applies), `PipelineStageID` first stage by lookup, `Probability` from the stage, `ClosedAt`, `ClosedByUserID`, `LossReasonID` null, `AmountIsComputed` false, `AmountComputedAt` and `AmountSourceHash` null (copy the value, drop the claim), `OwnerEmployeeID` `Exclude` (server-maintained stamp). Hooks: `DealEntityServer.Save()` enforces the close lock and company match. Checks: a closed deal clones as an open deal with its team and no stage events.

**`MJ_BizApps_Sales: Pipelines`** — `Pipeline Stages` Deep; `Code` reset when cloning within a company, copied when retargeting (`UniqueKeys: [{ Fields: ['CompanyID','Code'], Scope: 'Global' }]` with a rule that keeps the code when `CompanyID` changes); `UI.RetargetFields: ['CompanyID']`. The shipped pipeline seeds are the metadata cousin of this runtime clone.

**`MJ_BizApps_Sales: Sales Contacts` and `Sales Accounts`** — the IS-A up-reach case: the root is the sales entity; the engine constructs the leaf, `NewRecord()` mints one key, and the `Person`/`Organization` row is written first by the chain. Resets: `OptedOutOfOutreach`, `DoNotContactReason`, `LastEngagedAt` null, `OwnerEmployeeID` prompted; lookups referenced; deal roles Skip. Sales' configuration reaches up into common's table through the chain; common's configuration never reaches down.

### 2.5 bizapps-contracts — P6.5

**`MJ_BizApps_Contracts: Contract Templates`** (new version) — `Provisions` (Collection, Deep; `ProvisionSortKey` is a persisted computed column and is not writable), `Contracts` and `Modifications` (Skip). Resets: `Name` (plain unique, suffix or version), `VersionLabel` increment, `IntroducedDate` today, `SourceURL` null, `Status` to `'Draft'` (Locked: the immutability trigger refuses inserts into a Published template, so the clone is created Draft, filled, then published by the user). Hooks: `ContractTemplateEntityServer.ValidateAsync` one-way publish. Checks: a published template clones as a draft with all provisions.

**`MJ_BizApps_Contracts: Contracts`** (renewal) — `Modifications` (Collection, Deep; `ContractTemplateProvisionID` translated through a rule when the clone re-points at a newer template version), lookups referenced, `SupersededByContractID` and `ParentContractID` prompted, `ContractNumber` `ServerAllocated` (plain unique with one NULL allowed: sidecar saves are serialized), dates null or prompted, `CreatingEntityID`/`CreatingRecordID` cleared together (`ClearTogether`), `SigningProviderURL` null. `Contracts.Supersede` remains the sibling operation.

### 2.6 bizapps-tasks — P6.6

**`MJ_BizApps_Tasks: Tasks`** — `Task Assignments` (Deep; `Status` to `'Pending'`, `AssignedAt` now, `AssignedByPersonID` ownership), `Task Links` (SoftLink, Deep by preset), `Task Tag Links` (Deep), sub-tasks via `ParentID` (Hierarchy, subtree), `Task Dependencies` (Deep; both FKs remapped inside the set), `Comments`, `Activities`, `Decisions`, `Notification Logs` (Skip, Locked). Resets: `Status` to `'Open'` and `TaskTypeStatusID` to the type's non-terminal entry status by lookup (`IsTerminal = 0`), `PercentComplete` 0, `HoursActual`, `StartedAt`, `CompletedAt`, `OverdueNotifiedAt`, `CompletionNotes`, `BlockedReason` null, `DueAt` shifted by a rule, `CreatedByPersonID` ownership. Hooks: `TaskEntityServer.Save()` fires `OnCreate`, `OnAssign` and status hooks; suppressed by default (this is the case that makes suppression non-negotiable). Checks: a template of ten tasks clones with dependencies remapped and no notifications.

**`MJ_BizApps_Tasks: Task Types`** — `Task Type Status` (Deep), `Task Notification Configs` (Deep; one per type), `Tasks` Skip; `Name` and `Code` both reset (two global uniques).

**`MJ_BizApps_Tasks: Task Templates`** — `Items` (Deep; `ParentItemID` hierarchy), `Item Dependencies` (Deep; remap), `Item Roles` (Deep). Retires `TaskTemplateService.instantiateTemplate` and the write half of the template wizard; the wizard keeps its date and assignee inputs and passes them as `FieldRules` (`DueAt = clone.Now + fields.DaysFromStart days`) and `Retarget`. If the engine cannot express the instantiation, the design is incomplete; that is this PR's acceptance test.

### 2.7 bizapps-forms — P6.7 (deletes the app's own engine)

**`MJ_BizApps_Forms: Forms`** — Graph: `Form Pages` (Deep), `Form Questions` (Deep; `PageID` remapped), `Form Question Options` (Deep under questions), `Form Screens` (Deep), `Form Entity Bindings` (Deep; `FieldMappings` remapped), `Form Automations` (Deep; `BindingID` remapped), `Form Versions` (Skip, Locked), `Form Distributions` (Skip, Locked; `NotCloneable`: a live public link with its own magic-link credential), responses, answers, uploads, automation runs, binding records (Skip, Locked), categories and styles referenced. Resets: `Name` prompted, `Description` prompted, `Status` to `'Draft'`, `IsTemplate` from the preset (`duplicate` false, `save-as-template` true), `TemplateSourceFormID` set only by the `save-as-template` preset through a rule (`clone.Root.SourceKey`), `OwnerUserID` ownership. JSON remap: `ConditionalRule` on pages, questions, screens and automations (`show.all[*].questionId`, `show.any[*].questionId`, `jump[*].target` as page or question ids; ending targets dropped; score conditions untouched; unconditional jumps preserved; empty arms removed), `FieldMappings.fields[*].source.questionId` (remap; a binding whose mappings cannot be rewritten is saved `Status: 'Disabled'` through a rule on the drop count). The three presets carry the two directions. Configuration `Strict: true` replaces `form-clone-columns.spec.ts`. Retires `FormCloneService`, `clone-remap.ts` and the spec; the two callers (`forms-home-dashboard`, `form-builder`) open the generic panel with the preset. Checks: port the existing clone specs as integration checks (conditional rules remapped, unmappable references dropped and counted, disabled binding, distributions not cloned).

### 2.8 bizapps-sonar — P6.8

**`MJ_BizApps_Sonar: Score Models`** — `Model Related Entities` (Deep), `Factors` where `ScoreModelID` is the model (Deep) and library factors with null `ScoreModelID` (Reference), `Model Factors` (Deep; `FactorID` remapped when in set), `Score Band Sets` and `Score Bands` (Reference by default; preset `deep-bands`), `Time Windows` (Reference), `Score Model Versions`, scores, contributions, histories, transitions, recompute runs, audit events (Skip, Locked). Resets: `Name` suffix, `Slug` (global unique, `ServerAllocated` if the app mints, else prompted), `Status` to `'Draft'` (Locked: the publish lock refuses child writes on a published model, so the root is created Draft before any child), `CurrentVersionID` null, `OwnerUserID` ownership, `EffectiveFrom`/`EffectiveTo` prompted, `IsCalibrated` false. Sonar's `restoreVersion` stays: it is a reverse operation matched by natural key, not a clone.

### 2.9 bizapps-caliber — P6.9

**`Caliber: Blueprints`** — `Blueprint Steps` (Deep), `Caliber: Steps` (the `Protocol` table) via `BlueprintStep.ProtocolID` and `Blueprint.EntryProtocolID` (Deep, Locked, `PolicySource: 'Constraint'`: `UQ_BlueprintStep_Protocol` makes Reference impossible), `Blueprint Routes` (Deep; `FromProtocolID` and `TargetProtocolID` remapped), `Blueprint Detection Rules` (Deep), personas, difficulty profiles, rubrics (Reference; preset `deep-assets`), engagements, assessments, sessions, outcomes, notes, digests, intake submissions, invite scopes, bindings (Skip, Locked). Resets: `Name`, `IsActive`, `CompanyID` retarget; on each cloned step `MJFormsDistributionSlug` and `ExternalFormID` null, `NativeFormID` prompted or null. JSON columns (`ModelPreference`, `ContextProviderRefs`, `ExternalFormSchema`, `SubjectEntityConfig`, route `Condition`, `CarryForward`) are reviewed for ids in the PR and given remap specs where needed. `Caliber: Steps` also ships `Derivation: { Field: 'BasedOnID', Label: 'Create derived step' }` so the panel offers inheritance instead of copying for an app built on config inheritance.

**`Caliber: Rubric Versions`** — `Rubric Sections` and `Criteria` (Deep), assessments Skip; `VersionNumber` increment, `Status` to `'Draft'`, `PublishedAt` null. Retires the empty-draft behaviour of `newVersion()` in the rubric editor: the button calls the engine with the `new-version` preset.

### 2.10 bizapps-ats — P6.10

**`ATS: Jobs`** — types and categories referenced (global name uniques forbid copies), `Job.ProtocolID` is a loose reference into Caliber (Reference by default; a cross-app deep clone of the protocol is a P7 extra because the FK graph does not describe the boundary), applications, applicants and interview stages Skip. Resets: `Title` suffix, `Status` to `'Draft'`, `PublishedAt` and `ClosesAt` null, `HiringManagerUserID` prompted, `CompanyID` retarget.

### 2.11 bizapps-marketing — P6.11

**`MJ_BizApps_Marketing: Programs`** — `CreationPath: { Kind: 'Action', Name: 'Propose Program', InputMapping: {…}, OutputKeyParam: 'ChildProgramID' }` so the root is created by the app's own proposal path (code, approval request and confidence score minted the normal way, as `ScaleProgramAction` already does); the engine then clones `Program Variants`, `Program Contents`, `Program Update Targets`, `Program Entity Links` (Deep) against the created root, with `Program Platform Refs`, observations, segment results, learnings, metrics and sprint programs Skip. The input mapping carries the budget factor and baseline rules from the existing action. `ScaleProgramAction` stays as the action-facing wrapper and is re-pointed at the engine.

**`MJ_BizApps_Marketing: Strategy Document Versions`** (and content-plan versions) — `Strategy Sections` (Deep), section entity links (Deep), objectives and pillars referenced; `VersionNumber` increment, `Status` to `'Active'` with a `PostCloneAction` that supersedes the prior active version, approval fields `Exclude`. `strategyEditService.writeNewVersion` is re-implemented on the engine so the copy is transactional (today it says so itself: a failed copy is "left incomplete").

### 2.12 bizapps-committees — P6.12

**`Committees: Terms`** (renewal) — `Memberships` (Deep with `IncludeWhen: "fields.RenewalIntent IN ('carry','carry-unconfirmed')"`; per membership `StartDate`, `EndDate`, `EndReason` reset by rules), roles referenced, meetings and the governance record Skip, Locked. Resets: `Name` prompted (the wizard's duplicate-name guard becomes the naming probe), `StartDate` rule (day after the previous `EndDate`, or today when the lapse exceeds 180 days), `EndDate` prompted, `Status` by rule. `PostCloneAction: 'Close Previous Term'` (a new action wrapping the wizard's close step) closes open memberships and completes the previous term only when it is not still active. Retires the wizard's write half; `TermRenewalService` keeps the pure planning math and feeds it as rules and a reason string per row.

**`Committees: Meetings`** — `Agenda Items` (Deep; `ParentAgendaItemID` hierarchy remapped), attendances, minutes, motions, votes, ballots, comments, artifacts Skip. Resets: `Name`, `StartDateTime`/`EndDateTime` shifted, `Status` to `'Draft'`, `VideoMeetingID`, `VideoJoinURL`, `VideoRecordingURL`, `TranscriptURL`, `CalendarEventID` null (external handles), per item `Status` to `'Pending'`, `Notes` null.

### 2.13 bizapps-issues — P6.13

**`MJ_BizApps_Issues: Issue Types`** — leaf configuration; five action hooks referenced; `Name` reset (global unique), `IsActive`, `DefaultPriority` copied.

**`MJ_BizApps_Issues: Issues`** — cloneable with `IssueNumber` `ServerAllocated` (the server subclass allocates on insert), `StatusID` reset to the type's initial status by lookup so no `ClosedAt` stamping or `OnClose` fires, `ResolvedAt`/`ClosedAt` null, source and assignee pairs `ClearTogether`, comments Skip, hooks suppressed by default.

### 2.14 bizapps-fpna — P6.14

**`MJ_BizApps_FPNA: Plans`** (budget roll) — `Budget Lines` (Deep with rules: `PeriodStart = fields.PeriodStart + 12 months`, `Amount = fields.Amount * clone.Options.PromptedValues.GrowthFactor`, `OriginEntityID` and `OriginRecordID` cleared together), `Assumption Sets` (Deep; `EffectiveFrom` shifted, `Status` to `'Draft'`), `Collection Lag Overrides` (Deep), distribution policies and waterfall specs with tiers, bands and holders (Deep by preset), forecast runs and lines, snapshots, bridges, manual adjustments, cash balances, simulation periods (Skip, Locked; snapshot and bridge entities are `NotCloneable` because their server classes throw on unauthorized inserts). Resets: `Code` prompted (global unique), `Name` prompted, `Status`, `Statement` copied, `CurrencyID` copied. The prompted `GrowthFactor` is a request-level prompt the entity configuration declares under `PromptFor` with a non-field name, which `IEntityCloneConfiguration.Prompts` (added in P2.1 as `Prompts?: Array<{ Name; Label; Type; Default? }>`) makes possible.

### 2.15 bizapps-secure-messaging — P6.15

Every entity `NotCloneable` with a reason: threads and messages are correspondence, portal links and sessions are credentials, file requests are bound to a session and a thread. The app's PR is the negative catalog and a `CLAUDE.md` note.

### 2.16 bizapps-credentialing — P6.16

No tables yet. The PR adds the contract to the app's docs: credential program definitions (program, requirements, renewal rules) will be Deep; issued credentials Skip; configuration authored before the tables exist is rejected by the validator, so this PR ships text only.

### 2.17 more-cheese — P6.17

**`MoreCheese: Events` with `MJ_BizApps_Orders: Products`** — a two-root request (the event and its registration product with the event extension) sharing one key map; product prices Deep; registrations, competition entries, orders and payments Skip. Resets: `EventKey` prompted (global unique), `Name`, `EventDate` shifted by a rule, `IsSharedDemo` copied; product `SKU` suffixed by rule, `Status`, extension dates and capacity by rules. The seed format of this repo (`fields`, `extension`, `collections`, `@lookup`, `@parent:ID`) is the vocabulary the P7 cross-instance export uses. **`Committee Meetings`** as in 2.12.

---

## 3. Coverage summary

| Repo | Cloneable roots | Negative entries | Retired code |
|---|---|---|---|
| MJ core | Users, AI Prompts, Templates, AI Agents, Actions, Queries, Scheduled Jobs, Dashboards, User Views, Lists, Themes, Data Contexts, Applications, Roles, Components, Record Processes | metadata trio, history, runs and logs, caches, secrets, memory, transcripts | `persistDuplicate` (view workspace), `duplicateList` (Lists dashboard), `duplicate` (Theme Studio) |
| common | People, Organizations | activities | — |
| orders | Products, Order Headers, Promotions, Price Lists (retarget) | transactions, grants, subscriptions | — |
| accounting | GL Accounts (set), Dimensions, Tax Jurisdictions, pending Journal Entries | ledger history, matches | — |
| sales | Deals, Pipelines, Sales Contacts, Sales Accounts | stage events, forecasts | — |
| contracts | Contract Templates, Contracts | — | — |
| tasks | Tasks, Task Types, Task Templates | comments, activities, decisions, logs | `instantiateTemplate`, wizard writes |
| forms | Forms | versions, distributions, responses | `FormCloneService`, `clone-remap.ts`, column spec |
| sonar | Score Models | versions, scores, runs | — |
| caliber | Blueprints, Rubric Versions (+ derivation on Steps) | runtime and respondent data | `newVersion()` empty draft |
| ats | Jobs | applications | — |
| marketing | Programs (creation path), Strategy Document Versions | measurements, platform refs | `writeNewVersion` copy loop |
| committees | Terms, Meetings | governance record | wizard write half |
| issues | Issue Types, Issues | comments | — |
| fpna | Plans | snapshots, bridges, runs | — |
| secure-messaging | none | everything | — |
| credentialing | contract only | — | — |
| more-cheese | Events + Products, Committee Meetings | registrations, entries, orders | — |
