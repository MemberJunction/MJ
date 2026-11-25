# @memberjunction/standards

## 6.3.0-edge.2

### Minor Changes

- 916fe91: Add the extensible Chief of Staff skills platform, typed core actions, offered rhythms, suggestions, and Agent Channels (`V202611201630`):
  - **Schema & CodeGen (`V202611201630`)**: Add `AISkillAction.Role` (`Tool` | `Briefing` | `Both`), `AIAgentSkill.AllowMetadataSyncUpdate`, `RowLevelSecurityFilter.PlatformVariants` (SQL Server + PostgreSQL dialect RLS), `MJ: AI Agent Rhythm Templates`, `MJ: AI Agent Suggestions`, `ConversationType` `AGENT_CHANNEL`, `MJ: Agent Channels` (IS-A `MJ: Conversations`), and `MJ: Agent Channel Participants`.
  - **Policy & Briefing Engine**: Introduce `TypedActionPolicyGuard` in `@memberjunction/ai-core-plus` with sub-agent policy ceiling propagation across `BaseAgent` and `AgentUserPolicyEngine`, plus `AIEngine.GetBriefingActionsForAgent` / `GetSkillBriefingActionIDs` for dynamic cross-app briefing fan-out.
  - **Core Typed Actions & Agent Channels**: Replace all raw SQL / generic CRUD actions on Chief of Staff with 13 scoped typed actions (including `Assemble My Briefing`, Offered Rhythms, Suggestions, Memory, and Agent Channel actions), add `AgentChannelConversationDriver` with loop-guard and hourly wake rate limits, and enforce recurring routine confirmation in `Schedule Next Agent Wake`.
  - **Inbound Utility Mailbox Adapter**: Add `InboundUtilityMailboxIngestionService` and `EmailUtilityMailboxExtension` (`BaseServerExtension`) in `@memberjunction/messaging-adapters`.
  - **Governance, Standards & UI**: Add `agent-skill-governance` repo standard, `ChiefOfStaffAgentChannelsComponent` and Governance `InstructionsOverride` size monitor in `@memberjunction/ng-dashboards`, and `IT157` (`COS9–COS12`) integration checks.

- e6b15b9: Harden Chief of Staff security, governance, email ingestion, agent channels, wake policy enforcement, and briefing resilience:
  - **Chief of Staff skill governance & SQL isolation (`@memberjunction/standards`, Chief of Staff metadata)**: Switched Chief of Staff `AcceptsSkills` from `All` to `Limited`, explicitly granted safe core skills (`Web Research`, `Data Visualization`, `Document Builder`) while excluding `Data Analysis & Queries`, and attached `Query Builder` as an explicit sub-agent bounded by the user's policy ceiling. Extended the `agent-skill-governance` repo standard to flag non-allow-listed agents setting `AcceptsSkills: 'All'` (or explicitly granting an SQL-bundling skill) when an active skill bundles `Run Ad-hoc Query`.
  - **Server-verified approval & rhythm validation (`@memberjunction/core-actions`)**: Added `VerifyApprovedAgentRequest` and `VerifyActiveRhythmTemplate` helpers; hardened `ScheduleNextAgentWakeAction`, `EnableAgentRhythmAction`, and `SendInterAgentRequestAction` so agent-context execution rejects self-attested `ConfirmedByUser = true` and unverified/inactive/wrong-agent `RhythmTemplateID` values, requiring a server-verified `Approved` `MJ: AI Agent Requests` row (`ConfirmedApprovalRequestID`). Direct human/UI calls continue to work without requiring an approval request.
  - **MS Graph & Gmail inbound mailbox ingestion + durable dedup (`@memberjunction/messaging-adapters`)**: Added `CommunicationProviderInboundMailboxFetcher` (supporting Microsoft Graph and Gmail via `CommunicationEngine`) and `InMemoryInboundMailboxFetcher`, auto-registered when `PollIntervalMs > 0`. Added native `POST <root>/inbound/msgraph` (including `validationToken` handshake) and `POST <root>/inbound/gmail` (Pub/Sub base64 payload) webhook normalizers and routes on `EmailUtilityMailboxExtension`. Added durable DB-backed deduplication in `InboundUtilityMailboxIngestionService` via `MJ: User Settings` under the System User so deduplication survives restarts and multi-instance concurrency.
  - **Human replies in Agent Channels wake peer agents (`@memberjunction/core-entities-server`, `@memberjunction/ai-agents`, `@memberjunction/ng-dashboards`)**: Added a decoupled `GetGlobalObjectStore()` hook (`RegisterAgentChannelHumanPostWakeHandler`) invoked by `AgentChannelConversationDriver.HandleHumanMessagePosted` and registered by `AgentWakeTriggerService`, ensuring human replies reopen paused channels and wake peer participant agents. Updated `ChiefOfStaffAgentChannelsComponent` to show clear resumed/notified confirmation banners.
  - **Active policy enforcement for workstream wakes (`@memberjunction/ai-agents`)**: Updated `AgentWakeTriggerService.TriggerWakeForWorkstream` to require an `Active` `MJ: AI Agent User Policies` row for `(AgentID, UserID)`, cleanly suppressing wakes (`POLICY_DENIED`) for users who have not onboarded.
  - **Briefing timeout/truncation & rhythm staggering (`@memberjunction/core-actions`, Chief of Staff metadata)**: Added per-contributor timeout (`ContributorTimeoutMs`, default 10s) and serialized payload truncation (`MaxContributorChars`, default 32,768 chars) to `AssembleMyBriefingAction`, and staggered the `Daily Calendar Guard & Conflict Check` rhythm template to `15 7 * * 1-5`.

### Patch Changes

- dfc0449: Add strongly-typed 5-tier `LimitsConfigResolver` with approved backstop defaults (`DEFAULT_MJ_LIMITS_CONFIG` / `CODE_FALLBACK_LIMITS`) in `@memberjunction/core`, migrate `RunawayGuard`, `ResourceGuard`, and `Tuning` work bounds across AI/TaskGraph/Actions/Bridge/Server to resolve through `LimitsConfigResolver.Instance`, commit the categorized `docs/limits-sweep-inventory.csv` sweep inventory, and enforce the `limits-literals` CI/Standards guard.

## 6.3.0-edge.1

## 6.3.0-edge.0

### Patch Changes

- d87bb40: Declare the repo-root data (metadata/, migrations/, metadata-optional/ and other repo-root files) that these packages' tests read as a turbo `test` input, so a change to that data re-runs them instead of replaying a cached pass. Adds a package `turbo.json` to each; no runtime change.
- f0c7dcd: Add `mj doctor value-lists`, which finds rows whose value-list field holds a value outside its list (they fail validation on their next save) and can set named fields to `ListOrUserEntry`. Add the `migration-string-collation` standard, which flags new string columns in migrations that do not declare a collation.

## 6.2.0

### Patch Changes

- 2517b11: Add two migration standards. `migration-existence-guards` flags `IF OBJECT_ID` / `IF COL_LENGTH` / `IF NOT EXISTS` (catalog) guards and `DROP … IF EXISTS` in the hand-written part of a migration. `readable-status-values` flags run-together and snake_case values in CHECK lists. Both read only migrations at or after a repo's `FromVersion` cutoff and skip CodeGen's appended output. Both are opt-in, like every standard.
- 0080f80: Add the `naming-conventions` standard — an AST-based check for MJ's inverted naming convention
  (PascalCase public class members and exported symbols, camelCase `private` members).

  The rule reaches the whole exported API surface: `export function` / `class` / `interface` / `type` /
  `enum` / `const` / `let`, names published through `export { Foo }`, **the members of an exported
  interface, type literal or enum**, and public constructor parameter properties. Members of a
  non-exported interface are an implementation detail and are not checked. An interface that `extends`
  another — or a class that `implements` one — inherits its names, so the finding lands on the
  declaring interface rather than on every implementor.

  **Severity is derived from whether a compatible fix exists**, not from which package a finding is
  in. Anything a `@deprecated` delegating stub can fix — class members, exported functions, consts —
  is an `error`. Members of an exported _data shape_ are a `warn`: an interface is erased at compile
  time, so there is no runtime carrier for a stub and no rename that keeps consumers compiling. Two
  kinds of data-shape member are still errors, because they do have a fix: one whose type is not
  published from its package's entry point, and one on an interface a class implements.
  `enforceTypeMembers` exists for repos willing to take a breaking change to their published types;
  it is off here, because renaming a published interface member breaks every consumer that names it
  and no stub can carry the old name.

  Anything carrying a `@deprecated` JSDoc tag is exempt, so the back-compat stub that fixes a finding
  is not itself a violation; the check reports how many findings it suppressed that way. Framework
  contracts are exempt automatically — Angular `ng*` lifecycle hooks, oclif command members, `Error`
  subclass members, `SCREAMING_SNAKE` constants, `__mj_*` system columns, `@HostListener`/
  `@HostBinding`, `$`-sigil names, and any member name declared by a class something in the repo
  `extends` or `implements`. Per-line escape hatch:
  `// case-violation-ok-legacy-back-compat: <reason>`.

  Also adds an optional `Severity` field to `Violation` so one check can mix severities in a single
  run — additive, so `ui-layers` behaviour is unchanged — and caps how many findings `FormatSummary`
  prints per severity, since a standard adopted against a large codebase is a worklist rather than a
  transcript. `mj-standards check --json <file>` writes the complete list for CI to keep.

  `typescript` is now an optional peer dependency, used only by this check.

- d296edd: - **Record Links Slide-In Drawer, Embeddable `<mj-record-links>` Widget & Core `GetRecordDependencies` Upgrades**:
  - Added `GetRecordDependenciesOptions` (`LinkType?: 'both' | 'hard' | 'soft'`, `IncludeSystemEntities?: boolean`, `EntityNames?: string[]`) and `FieldDisplayName` hydration across `@memberjunction/core`, `@memberjunction/sqlserver-dataprovider`, `@memberjunction/postgresql-dataprovider`, `@memberjunction/graphql-dataprovider`, and `@memberjunction/server`.
  - Updated `BuildSoftLinkDependencySQL` to match both canonical `ID|<guid>` and bare `<guid>` single-PK references and scan physical `[Schema].[BaseTable]` objects instead of views when all referenced columns are non-virtual.
  - Added `<mj-record-links>` and `<mj-record-links-drawer>` plus the built-in **Links** toolbar action (`'links'`) on `<mj-form-toolbar>` and `<mj-record-form-container>`.
  - **Generic `<mj-form-field>` Original-Value Popover, Clean-Field Live Auto-Merge & Dirty-Field Conflict Resolution**:
    - Added a subtle `fa-clock-rotate-left` original-value popover with one-click **Restore** on modified fields in `<mj-form-field>`.
    - Upgraded `record-form-container` and `FormRecordRefreshCoordinator` so remote record updates arriving during Edit Mode auto-merge clean fields in place and surface inline **Keep mine** / **Use new value** conflict resolution cards on dirty fields whose server value changed.
  - **Zero-Restart Cache Auto-Reconciliation (`GetDatasetByName` & `RunViewsWithCacheCheck`)**:
    - Added `lastVerifiedAt` tracking on `LocalCacheManager` RunView slots, bounded server-slot freshness verification (`ServerCacheVerificationTTLMs`), client-monotonicity guard in `RunViewsWithCacheCheck`, `GetDatasetByName` SQL status reconciliation, and per-item row-count verification in `adoptServerMetadata()`.
  - **`polymorphic-fk` Standard Check (`@memberjunction/standards`)**:
    - Added `PolymorphicFKCheck` (`polymorphic-fk`) to enforce that polymorphic Entity+Record FK pairs declare `EntityField.EntityIDFieldName` in metadata.
  - **Calm Voice-First Realtime UI Declutter (`@memberjunction/ng-conversations`)**:
    - Suppressed the top audio-only avatar notice alert by default (`ShowAvatarNotice = false`) and hid the bottom `"Agent can see"` perception chip until the user actively captures their camera or screen (`CameraOn || Sharing`, or `ShowPerceptionChip = true`), while giving `RemoteBrowserChannel` its proper descriptor `SourceID` and `Label` (`Remote Browser`).
    - Deduplicated live speaking/listening status pills between `<mj-realtime-agent-banner>` and the center hero orb (`[HideState]="ShowHero && !PresenterOnStage"`), and tucked inactive Camera/Screen Share controls into the `•••` More menu in orb/compact mode so the primary bottom dock stays a clean 4-button bar (`Mic`, `Captions`, `More •••`, `End call`).

## 6.2.0-edge.8

## 6.2.0-edge.7

## 6.2.0-edge.6

### Patch Changes

- 2517b11: Add two migration standards. `migration-existence-guards` flags `IF OBJECT_ID` / `IF COL_LENGTH` / `IF NOT EXISTS` (catalog) guards and `DROP … IF EXISTS` in the hand-written part of a migration. `readable-status-values` flags run-together and snake_case values in CHECK lists. Both read only migrations at or after a repo's `FromVersion` cutoff and skip CodeGen's appended output. Both are opt-in, like every standard.
- d296edd: - **Record Links Slide-In Drawer, Embeddable `<mj-record-links>` Widget & Core `GetRecordDependencies` Upgrades**:
  - Added `GetRecordDependenciesOptions` (`LinkType?: 'both' | 'hard' | 'soft'`, `IncludeSystemEntities?: boolean`, `EntityNames?: string[]`) and `FieldDisplayName` hydration across `@memberjunction/core`, `@memberjunction/sqlserver-dataprovider`, `@memberjunction/postgresql-dataprovider`, `@memberjunction/graphql-dataprovider`, and `@memberjunction/server`.
  - Updated `BuildSoftLinkDependencySQL` to match both canonical `ID|<guid>` and bare `<guid>` single-PK references and scan physical `[Schema].[BaseTable]` objects instead of views when all referenced columns are non-virtual.
  - Added `<mj-record-links>` and `<mj-record-links-drawer>` plus the built-in **Links** toolbar action (`'links'`) on `<mj-form-toolbar>` and `<mj-record-form-container>`.
  - **Generic `<mj-form-field>` Original-Value Popover, Clean-Field Live Auto-Merge & Dirty-Field Conflict Resolution**:
    - Added a subtle `fa-clock-rotate-left` original-value popover with one-click **Restore** on modified fields in `<mj-form-field>`.
    - Upgraded `record-form-container` and `FormRecordRefreshCoordinator` so remote record updates arriving during Edit Mode auto-merge clean fields in place and surface inline **Keep mine** / **Use new value** conflict resolution cards on dirty fields whose server value changed.
  - **Zero-Restart Cache Auto-Reconciliation (`GetDatasetByName` & `RunViewsWithCacheCheck`)**:
    - Added `lastVerifiedAt` tracking on `LocalCacheManager` RunView slots, bounded server-slot freshness verification (`ServerCacheVerificationTTLMs`), client-monotonicity guard in `RunViewsWithCacheCheck`, `GetDatasetByName` SQL status reconciliation, and per-item row-count verification in `adoptServerMetadata()`.
  - **`polymorphic-fk` Standard Check (`@memberjunction/standards`)**:
    - Added `PolymorphicFKCheck` (`polymorphic-fk`) to enforce that polymorphic Entity+Record FK pairs declare `EntityField.EntityIDFieldName` in metadata.
  - **Calm Voice-First Realtime UI Declutter (`@memberjunction/ng-conversations`)**:
    - Suppressed the top audio-only avatar notice alert by default (`ShowAvatarNotice = false`) and hid the bottom `"Agent can see"` perception chip until the user actively captures their camera or screen (`CameraOn || Sharing`, or `ShowPerceptionChip = true`), while giving `RemoteBrowserChannel` its proper descriptor `SourceID` and `Label` (`Remote Browser`).
    - Deduplicated live speaking/listening status pills between `<mj-realtime-agent-banner>` and the center hero orb (`[HideState]="ShowHero && !PresenterOnStage"`), and tucked inactive Camera/Screen Share controls into the `•••` More menu in orb/compact mode so the primary bottom dock stays a clean 4-button bar (`Mic`, `Captions`, `More •••`, `End call`).

## 6.2.0-edge.5

## 6.2.0-edge.4

## 6.2.0-edge.3

## 6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- 0080f80: Add the `naming-conventions` standard — an AST-based check for MJ's inverted naming convention
  (PascalCase public class members and exported symbols, camelCase `private` members).

  The rule reaches the whole exported API surface: `export function` / `class` / `interface` / `type` /
  `enum` / `const` / `let`, names published through `export { Foo }`, **the members of an exported
  interface, type literal or enum**, and public constructor parameter properties. Members of a
  non-exported interface are an implementation detail and are not checked. An interface that `extends`
  another — or a class that `implements` one — inherits its names, so the finding lands on the
  declaring interface rather than on every implementor.

  **Severity is derived from whether a compatible fix exists**, not from which package a finding is
  in. Anything a `@deprecated` delegating stub can fix — class members, exported functions, consts —
  is an `error`. Members of an exported _data shape_ are a `warn`: an interface is erased at compile
  time, so there is no runtime carrier for a stub and no rename that keeps consumers compiling. Two
  kinds of data-shape member are still errors, because they do have a fix: one whose type is not
  published from its package's entry point, and one on an interface a class implements.
  `enforceTypeMembers` exists for repos willing to take a breaking change to their published types;
  it is off here, because renaming a published interface member breaks every consumer that names it
  and no stub can carry the old name.

  Anything carrying a `@deprecated` JSDoc tag is exempt, so the back-compat stub that fixes a finding
  is not itself a violation; the check reports how many findings it suppressed that way. Framework
  contracts are exempt automatically — Angular `ng*` lifecycle hooks, oclif command members, `Error`
  subclass members, `SCREAMING_SNAKE` constants, `__mj_*` system columns, `@HostListener`/
  `@HostBinding`, `$`-sigil names, and any member name declared by a class something in the repo
  `extends` or `implements`. Per-line escape hatch:
  `// case-violation-ok-legacy-back-compat: <reason>`.

  Also adds an optional `Severity` field to `Violation` so one check can mix severities in a single
  run — additive, so `ui-layers` behaviour is unchanged — and caps how many findings `FormatSummary`
  prints per severity, since a standard adopted against a large codebase is a worklist rather than a
  transcript. `mj-standards check --json <file>` writes the complete list for CI to keep.

  `typescript` is now an optional peer dependency, used only by this check.

## 6.2.0-edge.0

## 6.1.0

### Minor Changes

- 394d276: Phase 0 of the unified workflow DAG engine program (plan: PR #3456) — retires three dead or superseded subsystems so the **Workflow** name is freed for the program's user-facing vocabulary, and so the task-graph engine isn't built alongside a parallel, non-functioning orchestration model.

  **Eleven tables dropped** — the Skip v1-era workflow schema (`Workflow`, `WorkflowRun`, `WorkflowEngine`), the Skip v1-era report artifact (`Report`, `ReportCategory`, `ReportSnapshot`, `ReportUserState`, `ReportVersion`), the legacy `ScheduledAction` / `ScheduledActionParam` pair, and the report-era `OutputTriggerType`. All were verified dead or superseded: nothing outside generated code read the workflow tables, the `Reports` resource type named a `DriverClass` (`ReportResource`) that exists nowhere in the repo, and the legacy scheduled-action cron due-check is mathematically always-false so authored schedules could never fire.

  **Breaking — the report execution surface is gone.** `RunReport` was already marked `@deprecated` ("Reports are no longer supported... Interactive Components and Artifacts are replacements") and read `vwReports`, which this migration drops. Removed: `IRunReportProvider`, the `RunReport` class, `RunReportParams` / `RunReportResult`, `BaseEntity.RunReportProviderToUse`, `BaseAngularComponent.RunReportToUse`, `GraphQLDataProvider.GetReportData`, the `GetReportData` GraphQL query and `CreateReportFromConversationDetailID` mutation, and the `GET /reports/:reportId` REST endpoint. Accepted deliberately in the open v6 breaking-change window. Consumers should use Interactive Components and Artifacts.

  **Scheduled Actions are superseded by Scheduled Jobs, and the UI moved with them.** Contrary to the original plan's read, the entities were live authoring surface: four Knowledge Hub / AI dashboards created and read them. Those surfaces now author a `MJ: Scheduled Jobs` row of type **Action** — the same work, executed by `ActionScheduledJobDriver`, with the action and its parameters carried in the job's `Configuration` JSON rather than in child parameter rows. `ContentSource.ScheduledActionID` becomes `ContentSource.ScheduledJobID`. A shared `action-scheduled-job` helper in `ng-dashboards` owns the mapping so it isn't triplicated across surfaces.

  **Also removed:** the `@memberjunction/scheduled-actions` and `@memberjunction/scheduled-actions-server` packages (nothing depended on either), the `MJScheduledActionEntityExtended` subclass, the "coming soon" Scheduled Actions placeholder dashboard, and the Explorer report wiring (route, `TabService.OpenReport`, `NavigationService.OpenReport`, resource-type map entry, home-pin matcher, and the dashboard add-item Reports branch).

### Patch Changes

- Key the `Ensure migrations are valid` workflow's concurrency group by ref.

  It used the constant group `"changes"` with `cancel-in-progress: true`. A constant group is repo-wide, not per-PR: any push to any open PR cancelled the in-flight migration check on every _other_ PR, so the gate could only report on whichever PR pushed most recently, and re-running one simply moved the cancellation elsewhere. In practice the check was structurally unable to be green on more than one PR at a time — and a genuinely failing migration could go unreported because its run was cancelled rather than executed.

  Every other PR-scoped workflow in the repo (`test.yml`, `integration.yml`, `docs-site-ci.yml`) already keys its group by `github.ref`. This brings the migration gate in line. No change to what the gate checks.

- 190db45: ui-layers: stop flagging a manifest dependency declaration when it backs a
  marker-excused import. Knip's dependency-check gate requires every real import
  to be declared, so an `mj-ui-layers-allow`-excused import forces a declaration —
  flagging that declaration put the two gates in deadlock (seen with
  `@memberjunction/ng-shared` in `ng-file-storage`, tracked in MJ#3404). An
  unexcused import of the same module still flags on its own line, and a
  declaration with no excused import behind it still flags.

## 6.1.0-edge.7

## 6.1.0-edge.6

## 6.1.0-edge.5

## 6.1.0-edge.4

## 6.1.0-edge.3

## 6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

- 394d276: Phase 0 of the unified workflow DAG engine program (plan: PR #3456) — retires three dead or superseded subsystems so the **Workflow** name is freed for the program's user-facing vocabulary, and so the task-graph engine isn't built alongside a parallel, non-functioning orchestration model.

  **Eleven tables dropped** — the Skip v1-era workflow schema (`Workflow`, `WorkflowRun`, `WorkflowEngine`), the Skip v1-era report artifact (`Report`, `ReportCategory`, `ReportSnapshot`, `ReportUserState`, `ReportVersion`), the legacy `ScheduledAction` / `ScheduledActionParam` pair, and the report-era `OutputTriggerType`. All were verified dead or superseded: nothing outside generated code read the workflow tables, the `Reports` resource type named a `DriverClass` (`ReportResource`) that exists nowhere in the repo, and the legacy scheduled-action cron due-check is mathematically always-false so authored schedules could never fire.

  **Breaking — the report execution surface is gone.** `RunReport` was already marked `@deprecated` ("Reports are no longer supported... Interactive Components and Artifacts are replacements") and read `vwReports`, which this migration drops. Removed: `IRunReportProvider`, the `RunReport` class, `RunReportParams` / `RunReportResult`, `BaseEntity.RunReportProviderToUse`, `BaseAngularComponent.RunReportToUse`, `GraphQLDataProvider.GetReportData`, the `GetReportData` GraphQL query and `CreateReportFromConversationDetailID` mutation, and the `GET /reports/:reportId` REST endpoint. Accepted deliberately in the open v6 breaking-change window. Consumers should use Interactive Components and Artifacts.

  **Scheduled Actions are superseded by Scheduled Jobs, and the UI moved with them.** Contrary to the original plan's read, the entities were live authoring surface: four Knowledge Hub / AI dashboards created and read them. Those surfaces now author a `MJ: Scheduled Jobs` row of type **Action** — the same work, executed by `ActionScheduledJobDriver`, with the action and its parameters carried in the job's `Configuration` JSON rather than in child parameter rows. `ContentSource.ScheduledActionID` becomes `ContentSource.ScheduledJobID`. A shared `action-scheduled-job` helper in `ng-dashboards` owns the mapping so it isn't triplicated across surfaces.

  **Also removed:** the `@memberjunction/scheduled-actions` and `@memberjunction/scheduled-actions-server` packages (nothing depended on either), the `MJScheduledActionEntityExtended` subclass, the "coming soon" Scheduled Actions placeholder dashboard, and the Explorer report wiring (route, `TabService.OpenReport`, `NavigationService.OpenReport`, resource-type map entry, home-pin matcher, and the dashboard add-item Reports branch).

## 6.1.0-edge.0

### Patch Changes

- Key the `Ensure migrations are valid` workflow's concurrency group by ref.

  It used the constant group `"changes"` with `cancel-in-progress: true`. A constant group is repo-wide, not per-PR: any push to any open PR cancelled the in-flight migration check on every _other_ PR, so the gate could only report on whichever PR pushed most recently, and re-running one simply moved the cancellation elsewhere. In practice the check was structurally unable to be green on more than one PR at a time — and a genuinely failing migration could go unreported because its run was cancelled rather than executed.

  Every other PR-scoped workflow in the repo (`test.yml`, `integration.yml`, `docs-site-ci.yml`) already keys its group by `github.ref`. This brings the migration gate in line. No change to what the gate checks.

- 190db45: ui-layers: stop flagging a manifest dependency declaration when it backs a
  marker-excused import. Knip's dependency-check gate requires every real import
  to be declared, so an `mj-ui-layers-allow`-excused import forces a declaration —
  flagging that declaration put the two gates in deadlock (seen with
  `@memberjunction/ng-shared` in `ng-file-storage`, tracked in MJ#3404). An
  unexcused import of the same module still flags on its own line, and a
  declaration with no excused import behind it still flags.
