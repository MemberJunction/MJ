# @memberjunction/ng-bootstrap-lite

## 6.2.0-edge.3

### Minor Changes

- 60bd774: Form contributions can be metadata rows, not only compiled panels, and users can place, share, hide and remove them from the form itself.

  **Contributions from metadata.** A `MJ: Entity Form Contributions` row (migration `V202610051244__v6.2.x__Entity_Form_Contributions`) mounts a `MJ: Components` row (`Type='Widget'`, spec `componentRole: 'form-panel'`) on an entity's form. It carries the same registration bag as `@RegisterClassEx` plus `Presentation`, `Title`, `Icon`, `Configuration`, `Precedence` and User/Role/Global scope. `CollectFormContributionRegistrations` merges rows with class registrations, and the form collapses the list once per resolve (`ResolveFormContributionWinners`): one winner per `ContributionKey`, the higher rank wins, a compiled panel wins a tie against any row, and between rows `User` beats `Role` beats `Global` (`FormContributionOutranks`). `CollectFormPanelRegistrations` stays as a deprecated wrapper that returns compiled registrations only. Wildcard (`'*'`) registrations take part on every form, but their place claims are ignored: one that claims a grid, a section or a tab replaces nothing, and one that names a section to draw in draws at its slot. `InteractiveFormsEngine` caches the rows and the full custom forms (in the browser, the shared ones and the signed-in user's own) and fetches each panel component by ID once (`GetComponentByID`); `InteractiveFormPanelComponent` renders them, and a panel can change only the fields it claims, in edit mode. On the 11 identity, permission and form-metadata entities in `RESTRICTED_FORM_ENTITIES`, only `User` rows and full custom forms render.

  **One rule set, shared by the browser and the server.** The contribution key is derived once (`ResolveContributionWriteKey` in `@memberjunction/interactive-component-types/forms`). `@memberjunction/core-entities` `custom/FormScope/` holds the spec-to-row mapper (`ApplyContributionSpecToRow`), the claim validator (`ContributionClaimRefusal`), the scope rules (`FormScopeWriteRefusal`, which normalizes Scope and fails closed, `ComponentWriteRefusal`, `FormRowComponentRefusal`, `ComponentNameCollisionRefusal`, `IsCallersOwnComponent`, `IsCanonicalFormScope`, `ContributionScopeRank`, `FormContributionOutranks`, `IsSelectableFormOverride`, `FormScopeAllowedOnEntity`, `UserCanManageFormDefaults`), the hide-setting key helpers, and the retire rule (`ActiveContributionSiblings`, which compares keys ignoring case as the SQL Server unique index does).

  **What a panel can stand in for.** One claim per row, enforced by the database: a related grid, one or several field sections (`ReplacesSectionKey`, `ReplacesSectionKeys`), a group of fields (`ReplacesFieldNames`, rendered once inside that section), or a place inside a section (`InSectionKey` + `SectionPosition`). A compiled panel renders at the slot it registered for, and a panel standing in for something takes its place. The `top-area` slot is accepted by the CHECK constraint but no form emits it, so the placement dialog does not offer it.

  **Authoring.** New actions `Create Form Contribution`, `Modify Form Contribution`, `Activate Form Contribution Version`, `Get Form Contributions For Entity` and `Get Form Composition For Entity`. The write actions, and the existing Modify / Activate / Revert Interactive Form actions, change only the caller's own `User` rows; a `Role` or `Global` row returns `FORBIDDEN` for every caller. A spec with more than one claim returns `INVALID_CLAIM` before any write. The contribution actions write the Component and the row in one transaction, and so do the Modify and Activate Interactive Form paths for a full form's Component and override; Create and Revert Interactive Form do not. Modify and Activate Interactive Form set the prior version aside after that transaction, and Activate returns `PERSIST_FAILED`, with the new form already Active, when it cannot. Activating a target that is already Active also sets aside the caller's other Active personal forms for that entity. `Modify Form Contribution` accepts an optional `Precedence`. `Get Form Composition For Entity` answers for the form the user sees as far as metadata can tell (hidden panels, restricted entities, the same collapse; no compiled panels, and no rows while the kill switch is off) and returns `QUERY_FAILED` when a query fails. The artifact viewer previews a form-panel spec and offers **Add to my form**, which opens a placement dialog: the entity's real form, read-only and scaled, with the panel drawn where it will go, the positions the form actually has, order within a position, what it replaces, and draft or active. The dialog starts from the claims the panel proposes that it offers on the open form, and on a full custom form the panel starts as a draft. New `mj-icon-picker` (`@memberjunction/ng-ui-components`) chooses a Font Awesome solid or regular icon by looking at it.

  **Managing a form.** A "Manage this form" drawer lists the form choice and every panel; Escape closes it and focus stays inside it. Any user can hide a panel shared with them and remove their own. Hide and Show change the open form at once: its slot-mounted panels remount, and a stock grid comes back when the panel that took it over is hidden. Publishing a panel or a full custom form to a role or everyone needs the new `Manage Form Defaults` authorization (Developer and Integration; owners count). `MJEntityFormContributionEntityServer` and `MJEntityFormOverrideEntityServer` enforce it on every save, replayed save and delete. Turning a panel on, or publishing it, retires the Active sibling for the same audience and key in the same transaction and sets the panel component's status. The stock UI role can create and update `MJ: Components` (not delete), so any user can create or change their own panel through the actions and turn it on, off or to a draft in the drawer. Without `Manage Form Defaults` the server requires the component to be the caller's own (`IsCallersOwnComponent`): used only by their own personal rows, or used by no row and created by them, as its Internal `Create` record in `MJ: Record Changes` shows. That applies to any update or delete of the component, whatever columns it changes (`MJComponentEntityServer`, `ComponentWriteRefusal`), to a contribution or override row created or re-pointed at it (`FormRowComponentRefusal`), and to reusing its name (`ComponentNameCollisionRefusal`, names compared trimmed and lower-cased, in any namespace, and sent as a Unicode literal on SQL Server); a form can also load a component by name, so a component no row uses still matters. With the grant, a delete or a change to a component's specification, status, name, namespace or type, and pointing a row at it, are refused only when another user's personal row uses the component. The reads run as the caller in one batch, the changed columns come from the stored row, and a failed read refuses the write. Publishing a draft, an off panel or a set-aside form turns it on, and the chooser says so. A set-aside (`Inactive`) shared form is retracted; a set-aside personal form stays in its owner's picker. The placement preview never saves form state.

  **Form context.** The record container publishes its full composition snapshot to `FormCompositionRegistry` (`@memberjunction/ng-base-forms`), where the apply path reads it. Agents get a compact `FormAgentContext` in `AdditionalContext.Form` (entity, record key, form choice, and each section's key, title, variant, hidden flag and holding contribution), published by the record tab while it is the tab on screen. `RecordPrimaryKey` is a `CompositeKey.ToURLSegment()` string, or null for an unsaved record. The `SkipFormContext` mirror in `@askskip/types` must follow this shape.

  **Kill switch.** On a Node host, `MJ_FORMS_METADATA_CONTRIBUTIONS=false` makes the engine on that process load no row. In Explorer, the `MJ: Instance Configurations` key `Forms.MetadataContributions.Enabled` set to `false` turns rows off on every form; the shell applies it after `InstanceConfigEngine.Config()` and before any form opens, it can only turn the source off, and the source stays on when Instance Config fails to load. `Get Form Contributions For Entity` and `Get Form Composition For Entity` list no row when either setting is off and report `MetadataContributionsEnabled`. The write actions still write rows. The seed row reaches a database through `mj sync push`.

  **Section counts and empty sections.** A saved record fetches every related-section count and the tag, attachment and version badges in one `RunViews` call; an all-`count_only` batch runs as one `UNION ALL` statement in `GenericDatabaseProvider`, with each view's security path intact. New `whenEmpty` (`'show'` default | `'hide'` | `'more'`) and `showCount` on `EntityRelationship.Configuration.UI` and on contributions, with entity defaults `UI.Form.RelatedWhenEmpty` and `UI.Form.ShowRelatedCounts`.

  **Fixes.** Eleven compiled panel registrations named their entity without the `MJ: ` prefix: the five overview cards and the realtime panel mounted only through the slot host's loose name match, which the rail did not apply, and the five header panels also used `slot: 'header'`, which is not a `FormPanelSlot`, so they never rendered. All eleven now use `MJ: ` names and the slot host matches names exactly, so the hero headers render above the overview cards on `MJ: Users`, `MJ: Companies`, `MJ: Employees`, `MJ: Conversations` and `MJ: AI Agent Categories`. The overview cards query `MJ: ` entity names (four of them queried unprefixed names and showed empty states), the overview cards and the realtime panel show a load error instead of an empty state when a query fails, and conversation turn pills and counts use the stored `User`/`AI` roles. CodeGen no longer corrupts generated validators that contain escapes, and a table-level validator's metadata guard includes the validator's `Name`.

  **Behaviour changes to know about.** `BaseFormPanel.Validate()` now runs on Save (through `BaseFormComponent.ValidateAsync()`) and may return a Promise. A React panel whose `Validate` throws does not block the save and shows the failure in the panel, as it does an error from `<mj-react-component>`; a field edit from a panel that the record refuses is logged and dropped. After upgrade, editing or deleting an existing `Role` or `Global` full custom form needs `Manage Form Defaults`, and an `mj sync push` of `Global` rows needs a sync user who holds it or is an Owner. The UI role gains Create and Update on `MJ: Components`. Without `Manage Form Defaults`, whatever role grants component rights, a caller can change or delete a component, on any column, only when it is their own (used only by their own personal rows, or used by none and created by them), and two such users cannot give components the same name. With the grant, a delete or a change to one of the five guarded columns (specification, status, name, namespace or type) is refused only when another user's personal row uses the component, and a change to any other column passes. `MJRecordChangeEntityServer` refuses a caller creating a record change whose `Source` is `Internal` and `Type` is `Create` through the API; other record changes, such as version-label snapshots, are unchanged. `mj sync push` runs as the `System` user, which must hold the Developer role and so holds the grant by default; a sync user that is neither an Owner nor a holder of the grant can push changes only to components of its own. Every `mj-form-field` carries `data-field-name` and `data-field-label`. Collapsible-panel move up/down follows the visual order. New user setting `mj.formPanels.hidden.<entity>`; the existing `mj.formVariant.<entity>` is also read by `Get Form Composition For Entity`. `ng-conversations` gains a type-only dependency on `ng-base-forms`. `Get Active Form For Entity` applies the restricted-entity rule, so a Role or Global form on one of those entities is neither active nor listed. A `form-panel` spec must set `entityName`; the artifact viewer no longer falls back to `dataRequirements` for a panel.

  **PostgreSQL.** `UQ_EntityFormContribution_Key` and `UQ_EntityFormContribution_RelatedClaim` include nullable columns (`UserID`, `RoleID`, `RelatedJoinField`). SQL Server treats NULLs as equal in a unique index; PostgreSQL does not, so the converted indexes need `NULLS NOT DISTINCT` (PostgreSQL 15+) or a `COALESCE` expression index to refuse the same duplicates. PostgreSQL also compares the key case-sensitively, so there the case-insensitive retire rule is stricter than the index.

  **Deploy order:** deploy the server code before pushing the metadata. The UI role's grants ship as metadata only: write access to `MJ: Entity Form Contributions` and `MJ: Entity Form Overrides`, and Create and Update on `MJ: Components`. Only the new server subclasses keep that access to the user's own rows and components, so the component guard must be live before the UI role gains Update: apply the release build's consolidated metadata-sync migration together with the server deploy, never before it. A development database that already ran an earlier copy of the migration needs a Flyway repair or a rebuild.

- 49e0bd8: Add the MemberJunction Durable Work Queue and Messaging Framework:
  - **Core & Data Layer**: Transport-neutral queue contracts, database schema and entities for transports, topics, subscriptions, messages, deliveries, and deduplication ledger, backed by guarded-write stored procedures (`spWorkQueue*`) with SQL Server and PostgreSQL support.
  - **Transports**: Native Database transport driver, consumer, and operator; AWS transport (`@memberjunction/work-queue-aws` with SNS topic publishing, SQS FIFO consumer, visibility-timeout leases, dead-letter redrive, binding validation, and LocalStack conformance); and in-memory reference transport.
  - **Runtime & Host**: Competing-consumer `WorkQueueHost` (supporting continuous daemon and one-shot `RunOnce` container modes), `WorkQueueSweeper` (handling lease expiry and retention purging under a distributed sweep lock), REST publish endpoint (`POST /work-queue/topics/{topic}/messages` with API-key and scope authorization), and seven Remote Operations for operator control (`WorkQueue.GetSubscriptionStats`, `ReplayDeadLetter`, `DiscardDelivery`, `ValidateBindings`, etc.).
  - **Operator Surface**: Explorer `WorkQueueDashboard` with Overview, Dead Letters (envelope/payload inspection and replay/discard), Partitions (blocked, in-flight, and idle keys), and Bindings validation tabs, plus a new "Work Queue" application record.
  - **Tooling & Samples**: `mj queue` CLI commands (stats, dead-letters, partitions, replay, discard, backlog, work, export-topology, import-bindings, validate-bindings) and `@memberjunction/work-queue-samples` (`HelloWorldHandler` with sample topologies).

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [5037000]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [fe39606]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [279b93e]
- Updated dependencies [5acbec6]
- Updated dependencies [66fd011]
- Updated dependencies [093e0dd]
- Updated dependencies [f41442f]
- Updated dependencies [196160a]
- Updated dependencies [bea2386]
- Updated dependencies [d046715]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [72e082b]
- Updated dependencies [28c92e0]
- Updated dependencies [d0a8dbf]
- Updated dependencies [fbad999]
- Updated dependencies [ec97ad4]
- Updated dependencies [b1b6d3d]
- Updated dependencies [28df136]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/graphql-dataprovider@6.2.0-edge.3
  - @memberjunction/ng-core-entity-forms@6.2.0-edge.3
  - @memberjunction/ai-vectors-memory@6.2.0-edge.3
  - @memberjunction/ai-engine-base@6.2.0-edge.3
  - @memberjunction/ng-conversations@6.2.0-edge.3
  - @memberjunction/ng-entity-viewer@6.2.0-edge.3
  - @memberjunction/ng-explorer-core@6.2.0-edge.3
  - @memberjunction/ai-realtime-client@6.2.0-edge.3
  - @memberjunction/ng-shared@6.2.0-edge.3
  - @memberjunction/ai-core-plus@6.2.0-edge.3
  - @memberjunction/actions-base@6.2.0-edge.3
  - @memberjunction/ng-artifacts@6.2.0-edge.3
  - @memberjunction/feature-pipelines@6.2.0-edge.3
  - @memberjunction/ng-dashboard-viewer@6.2.0-edge.3
  - @memberjunction/ng-entity-action-ux@6.2.0-edge.3
  - @memberjunction/ng-file-storage@6.2.0-edge.3
  - @memberjunction/communication-types@6.2.0-edge.3
  - @memberjunction/entity-communications-base@6.2.0-edge.3
  - @memberjunction/ng-auth-services@6.2.0-edge.3
  - @memberjunction/rubrics-base@6.2.0-edge.3

## 6.2.0-edge.2

### Minor Changes

- 4d647e6: Add Rubrics, a core way to score any record against a published set of weighted criteria.

  What ships:
  - Schema for rubrics, versions, criteria, scales, anchors, bands, evaluations, and score rows, plus layered consensus views. Published versions are frozen. Raw writes to a frozen row throw 51101–51110. A draft version delete is an `INSTEAD OF DELETE` trigger. `MJ: Test Rubrics` is deprecated in metadata.
  - `RubricScoring` and `RubricVersionDiff` in `@memberjunction/rubrics-base`. The outcome ladder is Incomplete, NotApplicableFailure, GateFailed, Passed or BelowThreshold, then Scored. The publish base is the highest Published or Retired version.
  - `@memberjunction/rubrics`: LLM, agent, deterministic, and human evaluators. Actions are Evaluate Record Against Rubric, Get Rubric, Get Rubric Subject, Get Rubric Consensus, Create Rubric Draft, and Submit Human Rubric. Create Rubric Draft and the architect import do not publish. The evaluation agent does not call Get Rubric Consensus.
  - Presentational widgets in `@memberjunction/ng-rubrics`, Explorer forms, and a Rubrics application. The agent form has a Rubrics tab.
  - Six guide-example rubrics stay Draft. Seven agent rubrics publish at 1.0.0 and bind to their agents. Marketing Agent is not bound. Shipped self-check links and the sampling job stay Disabled. A test that already has an `llm-judge` oracle keeps it.
  - Testing: rubric resolution, a `rubric` oracle, judge calibration, per-criterion spread on `--flaky-check`, `mj rubric`, and `mj test promote-criteria`. `Test.RubricID` and `TestSuite.RubricID` select a rubric. `TestSuiteRun.Score` is stored.
  - The deterministic integration bundle is IT98 at sequence 49.

  `GeneratePluralName` keeps the head of a name verbatim and pluralizes only the tail, preserving that tail's case. A linear scan finds the tail, so `user_profile` and `userProfile` no longer produce the same view name, a leading character such as Ä stays on the head, and `Contact Person` pluralizes to `Contact People`. The base view for a criterion is `vwRubricCriteria`.

### Patch Changes

- 513e608: Add pipeline type picker, capability-aware output filtering and validation, Decision-specific constraint editors, and type badges for Feature Pipelines. What each pipeline type can produce is now one rule set, shared by the server, the builder and the save check. A Decision pipeline reads enum values and descriptions from its own entity's fields only; before, it read them from any entity with a field of the same name. An enum reads field metadata only when it sets FromFieldMetadata or lists no values, and only a type that needs listed values (Decision) requires them.

  A Record Process now refuses at save an Infer pipeline its type cannot run, on both tiers and every save path, through the shared MJRecordProcessEntityExtended; the Record Process form also refuses while the builder reports errors. The builder loads and edits CaptureReasoning, and keeps Watermark. Its pickers now show the saved pipeline type, prompt, entity document, target and constraint, not the first option, and a placeholder when the saved value is not offered.

- 2ceedb4: Register the record-cloning classes at startup: the server bootstraps depend on `@memberjunction/record-cloning` and load its `RecordClone.*` remote operations (and, through them, the `Clone` record-process work type). All three register the new `MJ: Record Clone Logs` and `MJ: Record Clone Log Items` entity classes.
- Updated dependencies [f555162]
- Updated dependencies [043f418]
- Updated dependencies [e97d95c]
- Updated dependencies [2552b1e]
- Updated dependencies [5114c10]
- Updated dependencies [660ef45]
- Updated dependencies [21f9e15]
- Updated dependencies [75d4e8c]
- Updated dependencies [a3d6182]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [664baea]
- Updated dependencies [f3c6161]
- Updated dependencies [0adaf76]
- Updated dependencies [5ee02db]
- Updated dependencies [a9e96dd]
- Updated dependencies [513e608]
- Updated dependencies [ef43cf3]
- Updated dependencies [ea4080e]
- Updated dependencies [b44c7cf]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [7e57b48]
- Updated dependencies [705ab4e]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [e9ab27b]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [8655198]
- Updated dependencies [4d647e6]
- Updated dependencies [7bcba8c]
- Updated dependencies [c35f7e5]
- Updated dependencies [bb33c77]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [fb267da]
- Updated dependencies [74c5280]
- Updated dependencies [2854a2e]
- Updated dependencies [8766e99]
  - @memberjunction/ai-core-plus@6.2.0-edge.2
  - @memberjunction/ng-conversations@6.2.0-edge.2
  - @memberjunction/ng-explorer-core@6.2.0-edge.2
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/ng-artifacts@6.2.0-edge.2
  - @memberjunction/graphql-dataprovider@6.2.0-edge.2
  - @memberjunction/ng-entity-viewer@6.2.0-edge.2
  - @memberjunction/feature-pipelines@6.2.0-edge.2
  - @memberjunction/ng-core-entity-forms@6.2.0-edge.2
  - @memberjunction/rubrics-base@6.2.0-edge.2
  - @memberjunction/ai-engine-base@6.2.0-edge.2
  - @memberjunction/ng-shared@6.2.0-edge.2
  - @memberjunction/ai-vectors-memory@6.2.0-edge.2
  - @memberjunction/actions-base@6.2.0-edge.2
  - @memberjunction/ng-auth-services@6.2.0-edge.2
  - @memberjunction/ng-dashboard-viewer@6.2.0-edge.2
  - @memberjunction/ng-entity-action-ux@6.2.0-edge.2
  - @memberjunction/ng-file-storage@6.2.0-edge.2
  - @memberjunction/communication-types@6.2.0-edge.2
  - @memberjunction/entity-communications-base@6.2.0-edge.2
  - @memberjunction/ai-realtime-client@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [beacbb2]
- Updated dependencies [520bd09]
- Updated dependencies [2d4bf8d]
- Updated dependencies [307da67]
- Updated dependencies [d67c8c0]
- Updated dependencies [f78fd63]
- Updated dependencies [6aa41c7]
- Updated dependencies [67f6c85]
- Updated dependencies [a7da50b]
- Updated dependencies [2cb5498]
- Updated dependencies [1d43161]
- Updated dependencies [7110019]
- Updated dependencies [87aa6e0]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [8a26af6]
- Updated dependencies [6b08ebf]
- Updated dependencies [9845c00]
- Updated dependencies [e2fa695]
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/ai-core-plus@6.2.0-edge.1
  - @memberjunction/ng-core-entity-forms@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/ng-entity-viewer@6.2.0-edge.1
  - @memberjunction/ng-conversations@6.2.0-edge.1
  - @memberjunction/graphql-dataprovider@6.2.0-edge.1
  - @memberjunction/actions-base@6.2.0-edge.1
  - @memberjunction/ng-explorer-core@6.2.0-edge.1
  - @memberjunction/ai-realtime-client@6.2.0-edge.1
  - @memberjunction/communication-types@6.2.0-edge.1
  - @memberjunction/ng-artifacts@6.2.0-edge.1
  - @memberjunction/ng-auth-services@6.2.0-edge.1
  - @memberjunction/ng-dashboard-viewer@6.2.0-edge.1
  - @memberjunction/ng-entity-action-ux@6.2.0-edge.1
  - @memberjunction/ng-file-storage@6.2.0-edge.1
  - @memberjunction/ng-shared@6.2.0-edge.1
  - @memberjunction/ai-engine-base@6.2.0-edge.1
  - @memberjunction/entity-communications-base@6.2.0-edge.1
  - @memberjunction/ai-vectors-memory@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- f0db019: Regenerate the class-registration manifests so `RecordProcessFormComponentExtended` and `RecordProcessFormPolicy` are wired in. Both were added with `@RegisterClassEx` in #4636 without regenerating the manifests, leaving `Build` red on `next` at the freshness gate — and, more importantly, leaving the policy eligible for tree-shaking in bundled apps, which would silently drop the Record Processes form's lead-group decoration.
- Updated dependencies [abf8778]
- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [37891d3]
- Updated dependencies [6ad6434]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [d665a6e]
- Updated dependencies [50241c8]
- Updated dependencies [6207578]
- Updated dependencies [6fd16d2]
- Updated dependencies [5df9486]
- Updated dependencies [90eea38]
- Updated dependencies [e225ece]
- Updated dependencies [c157749]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [7658d68]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [575bfae]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [3977917]
- Updated dependencies [d61b425]
- Updated dependencies [104125c]
- Updated dependencies [dc04823]
- Updated dependencies [5513c2a]
- Updated dependencies [8d1a373]
- Updated dependencies [8a5d2c0]
- Updated dependencies [e962151]
- Updated dependencies [af57e8d]
- Updated dependencies [2c590b0]
- Updated dependencies [fc3da91]
  - @memberjunction/actions-base@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/ai-core-plus@6.2.0-edge.0
  - @memberjunction/ng-conversations@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/ng-entity-viewer@6.2.0-edge.0
  - @memberjunction/ng-explorer-core@6.2.0-edge.0
  - @memberjunction/ng-core-entity-forms@6.2.0-edge.0
  - @memberjunction/ai-realtime-client@6.2.0-edge.0
  - @memberjunction/graphql-dataprovider@6.2.0-edge.0
  - @memberjunction/ng-auth-services@6.2.0-edge.0
  - @memberjunction/ng-shared@6.2.0-edge.0
  - @memberjunction/ai-engine-base@6.2.0-edge.0
  - @memberjunction/ng-artifacts@6.2.0-edge.0
  - @memberjunction/ng-dashboard-viewer@6.2.0-edge.0
  - @memberjunction/ng-entity-action-ux@6.2.0-edge.0
  - @memberjunction/ng-file-storage@6.2.0-edge.0
  - @memberjunction/communication-types@6.2.0-edge.0
  - @memberjunction/entity-communications-base@6.2.0-edge.0
  - @memberjunction/ai-vectors-memory@6.2.0-edge.0

## 6.1.0

### Minor Changes

- ee15cf7: Add AI Persona foundation schema (`AIPersona`, `AIPersonaVendor`, `AIModelPersona`, `AIAgentPersona`) and strongly typed JSONType interfaces (`IAIPersonaStyleDescriptors`, `IAIPersonaVendorSettings`, `IAIAgentPersonaStyleOverride`).
  - Introduce `AIPersona` catalog table with deterministic global name uniqueness for cross-modality catalog curation.
  - Introduce `AIPersonaVendor` for concrete vendor and modality bindings with typed `VendorSettingsObject` (`IAIPersonaVendorSettings` with native ElevenLabs settings).
  - Introduce `AIModelPersona` for model availability and priority sequences.
  - Introduce `AIAgentPersona` for agent persona assignments with filtered unique index `UQ_AIAgentPersona_OneDefaultPerAgent` and typed `StyleOverrideObject` (`IAIAgentPersonaStyleOverride`).
  - Add strongly-typed `<Field>Object` accessors in `MJAIPersonaEntity`, `MJAIPersonaVendorEntity`, and `MJAIAgentPersonaEntity`.
  - Scope CodeGen remote operations emission to `includeSchemas` and partition core vs non-core operations.

- 00a2483: Introduces Identity Claims infrastructure in MemberJunction core for guest record claiming, account linking, and invite verification workflows (#4012).
  - Schema & Entities: Adds `IdentityClaimType` and `IdentityClaim` entities with lifecycle state transitions (`Pending`, `Claimed`, `Expired`, `Revoked`).
  - Pluggable Driver Substrate: Supports custom claim handler implementations via `BaseIdentityClaimDriver` and `@RegisterClass`.
  - Server Engine: `IdentityClaimEngineServer` handles cryptographic claim creation, SHA-256 token hashing at rest, timing-safe token verification, email notifications via MJ Communications framework with HTML escaping, configurable email providers, polymorphic entity resolution, and atomic claim redemption.

- 394d276: Phase 0 of the unified workflow DAG engine program (plan: PR #3456) — retires three dead or superseded subsystems so the **Workflow** name is freed for the program's user-facing vocabulary, and so the task-graph engine isn't built alongside a parallel, non-functioning orchestration model.

  **Eleven tables dropped** — the Skip v1-era workflow schema (`Workflow`, `WorkflowRun`, `WorkflowEngine`), the Skip v1-era report artifact (`Report`, `ReportCategory`, `ReportSnapshot`, `ReportUserState`, `ReportVersion`), the legacy `ScheduledAction` / `ScheduledActionParam` pair, and the report-era `OutputTriggerType`. All were verified dead or superseded: nothing outside generated code read the workflow tables, the `Reports` resource type named a `DriverClass` (`ReportResource`) that exists nowhere in the repo, and the legacy scheduled-action cron due-check is mathematically always-false so authored schedules could never fire.

  **Breaking — the report execution surface is gone.** `RunReport` was already marked `@deprecated` ("Reports are no longer supported... Interactive Components and Artifacts are replacements") and read `vwReports`, which this migration drops. Removed: `IRunReportProvider`, the `RunReport` class, `RunReportParams` / `RunReportResult`, `BaseEntity.RunReportProviderToUse`, `BaseAngularComponent.RunReportToUse`, `GraphQLDataProvider.GetReportData`, the `GetReportData` GraphQL query and `CreateReportFromConversationDetailID` mutation, and the `GET /reports/:reportId` REST endpoint. Accepted deliberately in the open v6 breaking-change window. Consumers should use Interactive Components and Artifacts.

  **Scheduled Actions are superseded by Scheduled Jobs, and the UI moved with them.** Contrary to the original plan's read, the entities were live authoring surface: four Knowledge Hub / AI dashboards created and read them. Those surfaces now author a `MJ: Scheduled Jobs` row of type **Action** — the same work, executed by `ActionScheduledJobDriver`, with the action and its parameters carried in the job's `Configuration` JSON rather than in child parameter rows. `ContentSource.ScheduledActionID` becomes `ContentSource.ScheduledJobID`. A shared `action-scheduled-job` helper in `ng-dashboards` owns the mapping so it isn't triplicated across surfaces.

  **Also removed:** the `@memberjunction/scheduled-actions` and `@memberjunction/scheduled-actions-server` packages (nothing depended on either), the `MJScheduledActionEntityExtended` subclass, the "coming soon" Scheduled Actions placeholder dashboard, and the Explorer report wiring (route, `TabService.OpenReport`, `NavigationService.OpenReport`, resource-type map entry, home-pin matcher, and the dashboard add-item Reports branch).

- ac96bb6: Empty turbo's global hash, and make every in-repo `mj` invocation resolve.

  `hashOfInternalDependencies` — a hash over every non-gitignored file in the root manifest's
  workspace-dependency closure — is an input to _every_ task hash in the repo. The root
  `package.json` declared three `workspace:*` devDependencies (`cli`,
  `integration-test-suite`, `server-bootstrap-lite`) whose combined closure was 154 of 310
  packages, so editing any file in any of them invalidated all 310, builds and tests alike.
  Task-level `inputs` cannot reach this; it is upstream of them. Removing the three drops a
  one-file edit from 310/310 to 37/310 (`AI/Agents`) and 8/310 (Explorer dashboards).

  Removing them also removes the workspace-root `node_modules/.bin/mj` that a number of things
  quietly resolved through. Every consumer is repaired:
  - The 15 root scripts, plus `check:ui-layers`, `check:standards` and `test:integration`, now
    call `node packages/MJCLI/bin/run.js` directly.
  - `mj.config.cjs`'s `checkModules` used a bare specifier that only worked via the symlink the
    devDependency created. `check-module-loader.ts` _collects_ load failures rather than
    throwing, so this would have silently degraded `mj test` to "Unknown integration check
    bundle". Now an absolute `__dirname`-based path, asserted by `sibling-parity.test.ts`.
  - Seven `prebuild`/`postbuild` hooks across `ng-bootstrap`, `ng-bootstrap-lite`,
    `ng-explorer-core`, `server-bootstrap` and `server-bootstrap-lite` ran bare `mj codegen
manifest` behind `|| echo 'Warning: …'`, so a lost CLI exits 0 and the build proceeds
    against a stale class-registration manifest — a new `@RegisterClass` class never reaches it
    and tree-shaking then drops it from bundled apps. Each now calls the workspace entry point
    by path. Deliberately not a `@memberjunction/cli` devDependency: `ng-explorer-core` has six
    dependents and `ng-bootstrap` two, so a devDep there would take a CLI edit from 6/310 to
    12/310 invalidated packages, and `cli` itself depends on `server-bootstrap-lite`, where it
    would be a build-graph cycle. A path call adds no graph edge.
  - `a2aserver`, `ai-mcp-server` and `mj_codegen_api` ran bare `mj` in a fallback-less
    `prestart`, exiting 127 where no global CLI existed and silently resolving a version-skewed
    one where it did. Each now declares `@memberjunction/cli` — leaf packages only, so
    `hashOfInternalDependencies` stays `""`.
  - `pg-migrations.yml` invoked `npx mj` at four sites. With no root bin `npx` falls through to
    the npm registry, where the package named `mj` is unrelated mongodb-js tooling — in a job
    holding database credentials, in a workflow that does not trigger on `package.json`, so it
    would have stayed silent until the next release-time PG run.

  A new `check-mj-cli-resolution.mjs` gate in the `guards` job permits only the two forms that
  actually resolve, so this cannot regress silently again.

  `@memberjunction/testing-cli` carries a comment-only change to `check-module-loader.ts`
  documenting why MJ's own root config cannot use a bare specifier while an adopter's can.

  ***

  **On the level:** this is `minor` to satisfy `check:changeset`, not because anything touches
  the database. The branch adds no migration and edits no declarative metadata. The only file
  it changes under `metadata/` is `metadata/CLAUDE.md` — an instruction document, part of the
  repo-wide `npx mj` → `pnpm mj` rewrite — and the gate's trigger is `/^metadata\/.+/`, which
  matches any path under that directory including Markdown. The rule's own justification for
  metadata-⇒-minor is that "metadata counts as a migration because it becomes one" via the
  release-time `mj sync push`; a `CLAUDE.md` never becomes one. Under permanent pre mode a
  stray `minor` moves no version, so the cost is meaning rather than digits — hence this note,
  so the next reader does not take it as precedent. Narrowing that pattern to exclude
  Markdown belongs in its own PR against the gate.

### Patch Changes

- 3b893b4: Regenerate the browser class-registration manifests to include MJFileFormComponentExtended so the Files custom form is not tree-shaken out of Bootstrap / BootstrapLite.
- 8b78695: Regenerate the class-registration manifests so every one of them is on the chunked format.

  The chunked manifest format (`CLASS_REGISTRATIONS_0`, `CLASS_REGISTRATIONS_1`, …) was introduced to keep
  TypeScript from hitting TS2590 on a single union that had grown too large. Only `server-bootstrap` and
  `server-bootstrap-lite` were regenerated at the time, so the remaining manifests stayed on the old
  single-array shape and the `Build` job's manifest gate has been failing on `next` ever since.

  This regenerates all of them from a fully-built workspace. Alongside the format change the sweep picks up
  registrations that had drifted out: `MJAIUsageTypeEntity` and the `LinearPriceUnitType` /
  `PerImagePriceUnitType` / `TimePerHourPriceUnitType` / `TimePerMinutePriceUnitType` pricing unit types in the
  Angular bootstraps, and `MJEntityPermissionEntityServer` / `MJTenantFilterMiddleware` / `RateLimitMiddleware`
  from `@memberjunction/server` in the server bootstrap.

  Generated output only; no hand edits, no runtime behaviour change.

  One thing worth knowing for anyone regenerating these in future: **the manifest generator is sensitive to
  build state.** `resolveSubpathExportsDetailed()` resolves a package's lazy-loading subpaths by reading the
  `.d.ts` each `exports` entry points at, and it `continue`s past any that is missing. Run `mj codegen manifest`
  against a workspace whose `dist/` folders are absent and the subpaths silently resolve to nothing — the
  package falls through to the whole-package branch and `lazy-feature-config.ts` collapses its twelve
  per-dashboard chunks into one eager import, with no warning. Build the workspace first.

- cdd25c0: Regenerate the class-registration manifests for `AuthorizationCheckServerOperation`.

  #4185 added `AuthorizationCheckServerOperation` in `@memberjunction/core-entities`, decorated `@RegisterClass(BaseRemotableOperation, 'Authorization.Check')`, without regenerating the committed class-registration manifests. Every push to `next` since has failed the Build job's manifest freshness gate. The four bootstrap manifests now import and register the class (one more registration each), which is what `pnpm run mj:manifest` produces. Without the entry, tree-shaking can drop the operation from bundled apps and the remotable `Authorization.Check` operation silently never registers.

- Updated dependencies [4273317]
- Updated dependencies [394d276]
- Updated dependencies [634aa8c]
- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b915983]
- Updated dependencies [b895f92]
- Updated dependencies [b895f92]
- Updated dependencies [1bced7c]
- Updated dependencies [05b4cb5]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [c1fea88]
- Updated dependencies [22ec804]
- Updated dependencies [197fdf8]
- Updated dependencies [b8c2e33]
- Updated dependencies [d38845a]
- Updated dependencies [67e4c9e]
- Updated dependencies [2792d97]
- Updated dependencies [3fa1fb8]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [241c2c1]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [199eb2b]
- Updated dependencies [1940a4d]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [deea1a3]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [e2ad3c0]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [e9c5b90]
- Updated dependencies [59def38]
- Updated dependencies [2412415]
- Updated dependencies [06ccfb2]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [78ea840]
- Updated dependencies [43f9133]
- Updated dependencies [469461a]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [394d276]
- Updated dependencies [05865ea]
- Updated dependencies [c996a56]
- Updated dependencies [394d276]
- Updated dependencies [de6eb14]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [ea003fc]
- Updated dependencies [052b4c7]
- Updated dependencies [8ec1515]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [8de5f7e]
- Updated dependencies [c996a56]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [47930ef]
- Updated dependencies [8d880cc]
- Updated dependencies [1fa6f6b]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [394d276]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [919f0c7]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [c643ba3]
- Updated dependencies [e9e9873]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [34d9501]
- Updated dependencies [8288711]
- Updated dependencies [be0bdb2]
- Updated dependencies [5f33ca8]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [d26e202]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [85a8f15]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [8d0d45a]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [2e2879e]
- Updated dependencies [394d276]
- Updated dependencies [dd6d1f0]
- Updated dependencies [9fc0e2d]
- Updated dependencies [71ccf29]
- Updated dependencies [a8710bf]
- Updated dependencies [97cbf5f]
- Updated dependencies [ceb8e46]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [e1ebab9]
- Updated dependencies [0db4f4f]
- Updated dependencies [53d256f]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [9a29da4]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [ea2d1da]
- Updated dependencies [4cdfdcf]
- Updated dependencies [0db6105]
- Updated dependencies [938cd9e]
- Updated dependencies [dbaa967]
- Updated dependencies [d7feeae]
- Updated dependencies [7fefca2]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [394d276]
- Updated dependencies [34d19a9]
- Updated dependencies [ca3657d]
- Updated dependencies [394d276]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [2644a76]
- Updated dependencies [ac96bb6]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [b46330e]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [63ea273]
- Updated dependencies [6cd337d]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [768980d]
- Updated dependencies [1c0d586]
  - @memberjunction/ng-explorer-core@6.1.0
  - @memberjunction/ng-entity-viewer@6.1.0
  - @memberjunction/ai-core-plus@6.1.0
  - @memberjunction/ng-conversations@6.1.0
  - @memberjunction/ng-artifacts@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/ai-engine-base@6.1.0
  - @memberjunction/ng-core-entity-forms@6.1.0
  - @memberjunction/ng-auth-services@6.1.0
  - @memberjunction/ng-dashboard-viewer@6.1.0
  - @memberjunction/ng-entity-action-ux@6.1.0
  - @memberjunction/ng-file-storage@6.1.0
  - @memberjunction/ng-shared@6.1.0
  - @memberjunction/communication-types@6.1.0
  - @memberjunction/graphql-dataprovider@6.1.0
  - @memberjunction/actions-base@6.1.0
  - @memberjunction/ai-realtime-client@6.1.0
  - @memberjunction/ai-vectors-memory@6.1.0
  - @memberjunction/entity-communications-base@6.1.0

## 6.1.0-edge.7

### Minor Changes

- ee15cf7: Add AI Persona foundation schema (`AIPersona`, `AIPersonaVendor`, `AIModelPersona`, `AIAgentPersona`) and strongly typed JSONType interfaces (`IAIPersonaStyleDescriptors`, `IAIPersonaVendorSettings`, `IAIAgentPersonaStyleOverride`).
  - Introduce `AIPersona` catalog table with deterministic global name uniqueness for cross-modality catalog curation.
  - Introduce `AIPersonaVendor` for concrete vendor and modality bindings with typed `VendorSettingsObject` (`IAIPersonaVendorSettings` with native ElevenLabs settings).
  - Introduce `AIModelPersona` for model availability and priority sequences.
  - Introduce `AIAgentPersona` for agent persona assignments with filtered unique index `UQ_AIAgentPersona_OneDefaultPerAgent` and typed `StyleOverrideObject` (`IAIAgentPersonaStyleOverride`).
  - Add strongly-typed `<Field>Object` accessors in `MJAIPersonaEntity`, `MJAIPersonaVendorEntity`, and `MJAIAgentPersonaEntity`.
  - Scope CodeGen remote operations emission to `includeSchemas` and partition core vs non-core operations.

### Patch Changes

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [919f0c7]
- Updated dependencies [076fa5d]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/ai-engine-base@6.1.0-edge.7
  - @memberjunction/ng-core-entity-forms@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/graphql-dataprovider@6.1.0-edge.7
  - @memberjunction/ng-entity-viewer@6.1.0-edge.7
  - @memberjunction/ng-conversations@6.1.0-edge.7
  - @memberjunction/ai-core-plus@6.1.0-edge.7
  - @memberjunction/actions-base@6.1.0-edge.7
  - @memberjunction/ng-explorer-core@6.1.0-edge.7
  - @memberjunction/ng-shared@6.1.0-edge.7
  - @memberjunction/ng-artifacts@6.1.0-edge.7
  - @memberjunction/ng-dashboard-viewer@6.1.0-edge.7
  - @memberjunction/ng-entity-action-ux@6.1.0-edge.7
  - @memberjunction/ng-file-storage@6.1.0-edge.7
  - @memberjunction/communication-types@6.1.0-edge.7
  - @memberjunction/entity-communications-base@6.1.0-edge.7
  - @memberjunction/ai-realtime-client@6.1.0-edge.7
  - @memberjunction/ai-vectors-memory@6.1.0-edge.7
  - @memberjunction/ng-auth-services@6.1.0-edge.7

## 6.1.0-edge.6

### Minor Changes

- ac96bb6: Empty turbo's global hash, and make every in-repo `mj` invocation resolve.

  `hashOfInternalDependencies` — a hash over every non-gitignored file in the root manifest's
  workspace-dependency closure — is an input to _every_ task hash in the repo. The root
  `package.json` declared three `workspace:*` devDependencies (`cli`,
  `integration-test-suite`, `server-bootstrap-lite`) whose combined closure was 154 of 310
  packages, so editing any file in any of them invalidated all 310, builds and tests alike.
  Task-level `inputs` cannot reach this; it is upstream of them. Removing the three drops a
  one-file edit from 310/310 to 37/310 (`AI/Agents`) and 8/310 (Explorer dashboards).

  Removing them also removes the workspace-root `node_modules/.bin/mj` that a number of things
  quietly resolved through. Every consumer is repaired:
  - The 15 root scripts, plus `check:ui-layers`, `check:standards` and `test:integration`, now
    call `node packages/MJCLI/bin/run.js` directly.
  - `mj.config.cjs`'s `checkModules` used a bare specifier that only worked via the symlink the
    devDependency created. `check-module-loader.ts` _collects_ load failures rather than
    throwing, so this would have silently degraded `mj test` to "Unknown integration check
    bundle". Now an absolute `__dirname`-based path, asserted by `sibling-parity.test.ts`.
  - Seven `prebuild`/`postbuild` hooks across `ng-bootstrap`, `ng-bootstrap-lite`,
    `ng-explorer-core`, `server-bootstrap` and `server-bootstrap-lite` ran bare `mj codegen
manifest` behind `|| echo 'Warning: …'`, so a lost CLI exits 0 and the build proceeds
    against a stale class-registration manifest — a new `@RegisterClass` class never reaches it
    and tree-shaking then drops it from bundled apps. Each now calls the workspace entry point
    by path. Deliberately not a `@memberjunction/cli` devDependency: `ng-explorer-core` has six
    dependents and `ng-bootstrap` two, so a devDep there would take a CLI edit from 6/310 to
    12/310 invalidated packages, and `cli` itself depends on `server-bootstrap-lite`, where it
    would be a build-graph cycle. A path call adds no graph edge.
  - `a2aserver`, `ai-mcp-server` and `mj_codegen_api` ran bare `mj` in a fallback-less
    `prestart`, exiting 127 where no global CLI existed and silently resolving a version-skewed
    one where it did. Each now declares `@memberjunction/cli` — leaf packages only, so
    `hashOfInternalDependencies` stays `""`.
  - `pg-migrations.yml` invoked `npx mj` at four sites. With no root bin `npx` falls through to
    the npm registry, where the package named `mj` is unrelated mongodb-js tooling — in a job
    holding database credentials, in a workflow that does not trigger on `package.json`, so it
    would have stayed silent until the next release-time PG run.

  A new `check-mj-cli-resolution.mjs` gate in the `guards` job permits only the two forms that
  actually resolve, so this cannot regress silently again.

  `@memberjunction/testing-cli` carries a comment-only change to `check-module-loader.ts`
  documenting why MJ's own root config cannot use a bare specifier while an adopter's can.

  ***

  **On the level:** this is `minor` to satisfy `check:changeset`, not because anything touches
  the database. The branch adds no migration and edits no declarative metadata. The only file
  it changes under `metadata/` is `metadata/CLAUDE.md` — an instruction document, part of the
  repo-wide `npx mj` → `pnpm mj` rewrite — and the gate's trigger is `/^metadata\/.+/`, which
  matches any path under that directory including Markdown. The rule's own justification for
  metadata-⇒-minor is that "metadata counts as a migration because it becomes one" via the
  release-time `mj sync push`; a `CLAUDE.md` never becomes one. Under permanent pre mode a
  stray `minor` moves no version, so the cost is meaning rather than digits — hence this note,
  so the next reader does not take it as precedent. Narrowing that pattern to exclude
  Markdown belongs in its own PR against the gate.

### Patch Changes

- cdd25c0: Regenerate the class-registration manifests for `AuthorizationCheckServerOperation`.

  #4185 added `AuthorizationCheckServerOperation` in `@memberjunction/core-entities`, decorated `@RegisterClass(BaseRemotableOperation, 'Authorization.Check')`, without regenerating the committed class-registration manifests. Every push to `next` since has failed the Build job's manifest freshness gate. The four bootstrap manifests now import and register the class (one more registration each), which is what `pnpm run mj:manifest` produces. Without the entry, tree-shaking can drop the operation from bundled apps and the remotable `Authorization.Check` operation silently never registers.

- Updated dependencies [634aa8c]
- Updated dependencies [2c826f7]
- Updated dependencies [b915983]
- Updated dependencies [1bced7c]
- Updated dependencies [05b4cb5]
- Updated dependencies [b7819d2]
- Updated dependencies [c1fea88]
- Updated dependencies [197fdf8]
- Updated dependencies [b8c2e33]
- Updated dependencies [d38845a]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [241c2c1]
- Updated dependencies [0ec1980]
- Updated dependencies [e9c5b90]
- Updated dependencies [78ea840]
- Updated dependencies [43f9133]
- Updated dependencies [469461a]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [ceb8e46]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [ea2d1da]
- Updated dependencies [0db6105]
- Updated dependencies [938cd9e]
- Updated dependencies [dbaa967]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [ac96bb6]
  - @memberjunction/ai-core-plus@6.1.0-edge.6
  - @memberjunction/ng-conversations@6.1.0-edge.6
  - @memberjunction/ng-artifacts@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/ng-auth-services@6.1.0-edge.6
  - @memberjunction/ng-core-entity-forms@6.1.0-edge.6
  - @memberjunction/ng-dashboard-viewer@6.1.0-edge.6
  - @memberjunction/ng-entity-action-ux@6.1.0-edge.6
  - @memberjunction/ng-entity-viewer@6.1.0-edge.6
  - @memberjunction/ng-explorer-core@6.1.0-edge.6
  - @memberjunction/ng-file-storage@6.1.0-edge.6
  - @memberjunction/ng-shared@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/communication-types@6.1.0-edge.6
  - @memberjunction/graphql-dataprovider@6.1.0-edge.6
  - @memberjunction/ai-vectors-memory@6.1.0-edge.6
  - @memberjunction/ai-engine-base@6.1.0-edge.6
  - @memberjunction/ai-realtime-client@6.1.0-edge.6
  - @memberjunction/actions-base@6.1.0-edge.6
  - @memberjunction/entity-communications-base@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- 8b78695: Regenerate the class-registration manifests so every one of them is on the chunked format.

  The chunked manifest format (`CLASS_REGISTRATIONS_0`, `CLASS_REGISTRATIONS_1`, …) was introduced to keep
  TypeScript from hitting TS2590 on a single union that had grown too large. Only `server-bootstrap` and
  `server-bootstrap-lite` were regenerated at the time, so the remaining manifests stayed on the old
  single-array shape and the `Build` job's manifest gate has been failing on `next` ever since.

  This regenerates all of them from a fully-built workspace. Alongside the format change the sweep picks up
  registrations that had drifted out: `MJAIUsageTypeEntity` and the `LinearPriceUnitType` /
  `PerImagePriceUnitType` / `TimePerHourPriceUnitType` / `TimePerMinutePriceUnitType` pricing unit types in the
  Angular bootstraps, and `MJEntityPermissionEntityServer` / `MJTenantFilterMiddleware` / `RateLimitMiddleware`
  from `@memberjunction/server` in the server bootstrap.

  Generated output only; no hand edits, no runtime behaviour change.

  One thing worth knowing for anyone regenerating these in future: **the manifest generator is sensitive to
  build state.** `resolveSubpathExportsDetailed()` resolves a package's lazy-loading subpaths by reading the
  `.d.ts` each `exports` entry points at, and it `continue`s past any that is missing. Run `mj codegen manifest`
  against a workspace whose `dist/` folders are absent and the subpaths silently resolve to nothing — the
  package falls through to the whole-package branch and `lazy-feature-config.ts` collapses its twelve
  per-dashboard chunks into one eager import, with no warning. Build the workspace first.

- Updated dependencies [4273317]
- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [22ec804]
- Updated dependencies [3fa1fb8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [34d9501]
- Updated dependencies [5f33ca8]
- Updated dependencies [dd6d1f0]
- Updated dependencies [71ccf29]
- Updated dependencies [a8710bf]
- Updated dependencies [e1ebab9]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [905820a]
- Updated dependencies [34d19a9]
- Updated dependencies [2644a76]
  - @memberjunction/ng-explorer-core@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-core-plus@6.1.0-edge.5
  - @memberjunction/ng-conversations@6.1.0-edge.5
  - @memberjunction/ai-engine-base@6.1.0-edge.5
  - @memberjunction/ng-core-entity-forms@6.1.0-edge.5
  - @memberjunction/ng-artifacts@6.1.0-edge.5
  - @memberjunction/graphql-dataprovider@6.1.0-edge.5
  - @memberjunction/ng-shared@6.1.0-edge.5
  - @memberjunction/ng-dashboard-viewer@6.1.0-edge.5
  - @memberjunction/ng-entity-viewer@6.1.0-edge.5
  - @memberjunction/ng-file-storage@6.1.0-edge.5
  - @memberjunction/ai-realtime-client@6.1.0-edge.5
  - @memberjunction/actions-base@6.1.0-edge.5
  - @memberjunction/ng-entity-action-ux@6.1.0-edge.5
  - @memberjunction/communication-types@6.1.0-edge.5
  - @memberjunction/entity-communications-base@6.1.0-edge.5
  - @memberjunction/ai-vectors-memory@6.1.0-edge.5
  - @memberjunction/ng-auth-services@6.1.0-edge.5

## 6.1.0-edge.4

### Minor Changes

- 00a2483: Introduces Identity Claims infrastructure in MemberJunction core for guest record claiming, account linking, and invite verification workflows (#4012).
  - Schema & Entities: Adds `IdentityClaimType` and `IdentityClaim` entities with lifecycle state transitions (`Pending`, `Claimed`, `Expired`, `Revoked`).
  - Pluggable Driver Substrate: Supports custom claim handler implementations via `BaseIdentityClaimDriver` and `@RegisterClass`.
  - Server Engine: `IdentityClaimEngineServer` handles cryptographic claim creation, SHA-256 token hashing at rest, timing-safe token verification, email notifications via MJ Communications framework with HTML escaping, configurable email providers, polymorphic entity resolution, and atomic claim redemption.

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [e2ad3c0]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ng-core-entity-forms@6.1.0-edge.4
  - @memberjunction/ng-explorer-core@6.1.0-edge.4
  - @memberjunction/ai-engine-base@6.1.0-edge.4
  - @memberjunction/ai-core-plus@6.1.0-edge.4
  - @memberjunction/ai-realtime-client@6.1.0-edge.4
  - @memberjunction/ng-conversations@6.1.0-edge.4
  - @memberjunction/actions-base@6.1.0-edge.4
  - @memberjunction/ng-shared@6.1.0-edge.4
  - @memberjunction/ng-artifacts@6.1.0-edge.4
  - @memberjunction/ng-dashboard-viewer@6.1.0-edge.4
  - @memberjunction/ng-entity-action-ux@6.1.0-edge.4
  - @memberjunction/ng-entity-viewer@6.1.0-edge.4
  - @memberjunction/ng-file-storage@6.1.0-edge.4
  - @memberjunction/communication-types@6.1.0-edge.4
  - @memberjunction/entity-communications-base@6.1.0-edge.4
  - @memberjunction/graphql-dataprovider@6.1.0-edge.4
  - @memberjunction/ai-vectors-memory@6.1.0-edge.4
  - @memberjunction/ng-auth-services@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- 3b893b4: Regenerate the browser class-registration manifests to include MJFileFormComponentExtended so the Files custom form is not tree-shaken out of Bootstrap / BootstrapLite.
- Updated dependencies [834f8d7]
- Updated dependencies [199eb2b]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [deea1a3]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [05865ea]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [47930ef]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [2e2879e]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [d0a2a55]
- Updated dependencies [b46330e]
- Updated dependencies [4b1257f]
- Updated dependencies [63ea273]
- Updated dependencies [6cd337d]
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/graphql-dataprovider@6.1.0-edge.3
  - @memberjunction/ng-core-entity-forms@6.1.0-edge.3
  - @memberjunction/ng-file-storage@6.1.0-edge.3
  - @memberjunction/ng-shared@6.1.0-edge.3
  - @memberjunction/ng-explorer-core@6.1.0-edge.3
  - @memberjunction/ng-auth-services@6.1.0-edge.3
  - @memberjunction/ng-entity-viewer@6.1.0-edge.3
  - @memberjunction/ng-conversations@6.1.0-edge.3
  - @memberjunction/ai-engine-base@6.1.0-edge.3
  - @memberjunction/ai-realtime-client@6.1.0-edge.3
  - @memberjunction/ai-vectors-memory@6.1.0-edge.3
  - @memberjunction/actions-base@6.1.0-edge.3
  - @memberjunction/ng-artifacts@6.1.0-edge.3
  - @memberjunction/ng-dashboard-viewer@6.1.0-edge.3
  - @memberjunction/ng-entity-action-ux@6.1.0-edge.3
  - @memberjunction/communication-types@6.1.0-edge.3
  - @memberjunction/entity-communications-base@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [2792d97]
- Updated dependencies [255d506]
- Updated dependencies [59def38]
- Updated dependencies [8de5f7e]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [9fc0e2d]
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [768980d]
- Updated dependencies [1c0d586]
  - @memberjunction/ng-conversations@6.1.0-edge.2
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/actions-base@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/ng-core-entity-forms@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/graphql-dataprovider@6.1.0-edge.2
  - @memberjunction/ai-engine-base@6.1.0-edge.2
  - @memberjunction/ai-realtime-client@6.1.0-edge.2
  - @memberjunction/ng-explorer-core@6.1.0-edge.2
  - @memberjunction/ng-shared@6.1.0-edge.2
  - @memberjunction/ng-artifacts@6.1.0-edge.2
  - @memberjunction/ng-dashboard-viewer@6.1.0-edge.2
  - @memberjunction/ng-entity-action-ux@6.1.0-edge.2
  - @memberjunction/ng-entity-viewer@6.1.0-edge.2
  - @memberjunction/ng-file-storage@6.1.0-edge.2
  - @memberjunction/communication-types@6.1.0-edge.2
  - @memberjunction/entity-communications-base@6.1.0-edge.2
  - @memberjunction/ai-vectors-memory@6.1.0-edge.2
  - @memberjunction/ng-auth-services@6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

- 394d276: Phase 0 of the unified workflow DAG engine program (plan: PR #3456) — retires three dead or superseded subsystems so the **Workflow** name is freed for the program's user-facing vocabulary, and so the task-graph engine isn't built alongside a parallel, non-functioning orchestration model.

  **Eleven tables dropped** — the Skip v1-era workflow schema (`Workflow`, `WorkflowRun`, `WorkflowEngine`), the Skip v1-era report artifact (`Report`, `ReportCategory`, `ReportSnapshot`, `ReportUserState`, `ReportVersion`), the legacy `ScheduledAction` / `ScheduledActionParam` pair, and the report-era `OutputTriggerType`. All were verified dead or superseded: nothing outside generated code read the workflow tables, the `Reports` resource type named a `DriverClass` (`ReportResource`) that exists nowhere in the repo, and the legacy scheduled-action cron due-check is mathematically always-false so authored schedules could never fire.

  **Breaking — the report execution surface is gone.** `RunReport` was already marked `@deprecated` ("Reports are no longer supported... Interactive Components and Artifacts are replacements") and read `vwReports`, which this migration drops. Removed: `IRunReportProvider`, the `RunReport` class, `RunReportParams` / `RunReportResult`, `BaseEntity.RunReportProviderToUse`, `BaseAngularComponent.RunReportToUse`, `GraphQLDataProvider.GetReportData`, the `GetReportData` GraphQL query and `CreateReportFromConversationDetailID` mutation, and the `GET /reports/:reportId` REST endpoint. Accepted deliberately in the open v6 breaking-change window. Consumers should use Interactive Components and Artifacts.

  **Scheduled Actions are superseded by Scheduled Jobs, and the UI moved with them.** Contrary to the original plan's read, the entities were live authoring surface: four Knowledge Hub / AI dashboards created and read them. Those surfaces now author a `MJ: Scheduled Jobs` row of type **Action** — the same work, executed by `ActionScheduledJobDriver`, with the action and its parameters carried in the job's `Configuration` JSON rather than in child parameter rows. `ContentSource.ScheduledActionID` becomes `ContentSource.ScheduledJobID`. A shared `action-scheduled-job` helper in `ng-dashboards` owns the mapping so it isn't triplicated across surfaces.

  **Also removed:** the `@memberjunction/scheduled-actions` and `@memberjunction/scheduled-actions-server` packages (nothing depended on either), the `MJScheduledActionEntityExtended` subclass, the "coming soon" Scheduled Actions placeholder dashboard, and the Explorer report wiring (route, `TabService.OpenReport`, `NavigationService.OpenReport`, resource-type map entry, home-pin matcher, and the dashboard add-item Reports branch).

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/ng-entity-viewer@6.1.0-edge.1
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ng-file-storage@6.1.0-edge.1
  - @memberjunction/ng-artifacts@6.1.0-edge.1
  - @memberjunction/ng-auth-services@6.1.0-edge.1
  - @memberjunction/ng-conversations@6.1.0-edge.1
  - @memberjunction/ng-core-entity-forms@6.1.0-edge.1
  - @memberjunction/ng-dashboard-viewer@6.1.0-edge.1
  - @memberjunction/ng-entity-action-ux@6.1.0-edge.1
  - @memberjunction/ng-explorer-core@6.1.0-edge.1
  - @memberjunction/ng-shared@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/graphql-dataprovider@6.1.0-edge.1
  - @memberjunction/ai-engine-base@6.1.0-edge.1
  - @memberjunction/ai-vectors-memory@6.1.0-edge.1
  - @memberjunction/actions-base@6.1.0-edge.1
  - @memberjunction/communication-types@6.1.0-edge.1
  - @memberjunction/entity-communications-base@6.1.0-edge.1
  - @memberjunction/ai-realtime-client@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [b895f92]
- Updated dependencies [b895f92]
- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [ea003fc]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [d26e202]
- Updated dependencies [85a8f15]
- Updated dependencies [27e4d09]
- Updated dependencies [8d0d45a]
  - @memberjunction/ng-conversations@6.1.0-edge.0
  - @memberjunction/ng-entity-viewer@6.1.0-edge.0
  - @memberjunction/ng-artifacts@6.1.0-edge.0
  - @memberjunction/ng-entity-action-ux@6.1.0-edge.0
  - @memberjunction/ng-core-entity-forms@6.1.0-edge.0
  - @memberjunction/ng-explorer-core@6.1.0-edge.0
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/actions-base@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/ng-shared@6.1.0-edge.0
  - @memberjunction/ng-file-storage@6.1.0-edge.0
  - @memberjunction/ng-auth-services@6.1.0-edge.0
  - @memberjunction/ng-dashboard-viewer@6.1.0-edge.0
  - @memberjunction/ai-engine-base@6.1.0-edge.0
  - @memberjunction/ai-core-plus@6.1.0-edge.0
  - @memberjunction/communication-types@6.1.0-edge.0
  - @memberjunction/entity-communications-base@6.1.0-edge.0
  - @memberjunction/graphql-dataprovider@6.1.0-edge.0
  - @memberjunction/ai-vectors-memory@6.1.0-edge.0
  - @memberjunction/ai-realtime-client@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-engine-base@6.0.0
  - @memberjunction/ai-core-plus@6.0.0
  - @memberjunction/ai-vectors-memory@6.0.0
  - @memberjunction/actions-base@6.0.0
  - @memberjunction/ng-auth-services@6.0.0
  - @memberjunction/ng-core-entity-forms@6.0.0
  - @memberjunction/ng-explorer-core@6.0.0
  - @memberjunction/ng-shared@6.0.0
  - @memberjunction/ng-artifacts@6.0.0
  - @memberjunction/ng-conversations@6.0.0
  - @memberjunction/ng-dashboard-viewer@6.0.0
  - @memberjunction/ng-entity-action-ux@6.0.0
  - @memberjunction/ng-entity-viewer@6.0.0
  - @memberjunction/ng-file-storage@6.0.0
  - @memberjunction/communication-types@6.0.0
  - @memberjunction/entity-communications-base@6.0.0
  - @memberjunction/graphql-dataprovider@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/ai-realtime-client@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [1e048ef]
- Updated dependencies [a8fc549]
  - @memberjunction/ng-explorer-core@5.51.0
  - @memberjunction/core@5.51.0
  - @memberjunction/ng-shared@5.51.0
  - @memberjunction/ai-engine-base@5.51.0
  - @memberjunction/ai-core-plus@5.51.0
  - @memberjunction/ai-vectors-memory@5.51.0
  - @memberjunction/actions-base@5.51.0
  - @memberjunction/ng-auth-services@5.51.0
  - @memberjunction/ng-core-entity-forms@5.51.0
  - @memberjunction/ng-artifacts@5.51.0
  - @memberjunction/ng-conversations@5.51.0
  - @memberjunction/ng-dashboard-viewer@5.51.0
  - @memberjunction/ng-entity-action-ux@5.51.0
  - @memberjunction/ng-entity-viewer@5.51.0
  - @memberjunction/ng-file-storage@5.51.0
  - @memberjunction/communication-types@5.51.0
  - @memberjunction/entity-communications-base@5.51.0
  - @memberjunction/graphql-dataprovider@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/ai-realtime-client@5.51.0

## 5.50.0

### Patch Changes

- 623dfc5: Break CodeGen FK cycle between AIAgentRun, AIPromptRun, and ConversationDetail. Move SummaryPromptRunID from ConversationDetail to a new ConversationCompactionRun audit table. Remove AgentRunID from AIPromptRun (derivable via AIAgentRunStep.TargetLogID). Remove agentRunId from AIPromptParams and all write sites across the prompt/agent stack.
- Updated dependencies [1c991f7]
- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [28c1dcd]
- Updated dependencies [d36131a]
- Updated dependencies [8580aef]
- Updated dependencies [35fb5e3]
- Updated dependencies [abab5dc]
- Updated dependencies [ce6374c]
- Updated dependencies [86832fa]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [03fc891]
- Updated dependencies [fe1b8e7]
- Updated dependencies [dd04a24]
  - @memberjunction/ng-explorer-core@5.50.0
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/ng-conversations@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai-core-plus@5.50.0
  - @memberjunction/ng-core-entity-forms@5.50.0
  - @memberjunction/ng-artifacts@5.50.0
  - @memberjunction/communication-types@5.50.0
  - @memberjunction/ng-entity-viewer@5.50.0
  - @memberjunction/actions-base@5.50.0
  - @memberjunction/ng-file-storage@5.50.0
  - @memberjunction/ai-engine-base@5.50.0
  - @memberjunction/ng-shared@5.50.0
  - @memberjunction/ng-dashboard-viewer@5.50.0
  - @memberjunction/ng-entity-action-ux@5.50.0
  - @memberjunction/entity-communications-base@5.50.0
  - @memberjunction/graphql-dataprovider@5.50.0
  - @memberjunction/ai-vectors-memory@5.50.0
  - @memberjunction/ng-auth-services@5.50.0
  - @memberjunction/ai-realtime-client@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [d3f9d77]
- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [88d707b]
- Updated dependencies [02c8a15]
- Updated dependencies [505c8b5]
- Updated dependencies [88d707b]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [14e2117]
- Updated dependencies [3993034]
- Updated dependencies [9e2278c]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [c220620]
- Updated dependencies [70c658c]
- Updated dependencies [b5a8e3f]
  - @memberjunction/ng-core-entity-forms@5.49.0
  - @memberjunction/ng-explorer-core@5.49.0
  - @memberjunction/core@5.49.0
  - @memberjunction/ai-core-plus@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/ng-conversations@5.49.0
  - @memberjunction/graphql-dataprovider@5.49.0
  - @memberjunction/communication-types@5.49.0
  - @memberjunction/ai-realtime-client@5.49.0
  - @memberjunction/ng-artifacts@5.49.0
  - @memberjunction/ng-dashboard-viewer@5.49.0
  - @memberjunction/ng-entity-viewer@5.49.0
  - @memberjunction/ng-file-storage@5.49.0
  - @memberjunction/ai-engine-base@5.49.0
  - @memberjunction/ai-vectors-memory@5.49.0
  - @memberjunction/actions-base@5.49.0
  - @memberjunction/ng-auth-services@5.49.0
  - @memberjunction/ng-shared@5.49.0
  - @memberjunction/ng-entity-action-ux@5.49.0
  - @memberjunction/entity-communications-base@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [c20723a]
- Updated dependencies [bda123a]
- Updated dependencies [f613d0d]
- Updated dependencies [d1e1a15]
  - @memberjunction/ng-artifacts@5.48.0
  - @memberjunction/ng-conversations@5.48.0
  - @memberjunction/ng-explorer-core@5.48.0
  - @memberjunction/core@5.48.0
  - @memberjunction/ai-realtime-client@5.48.0
  - @memberjunction/ng-core-entity-forms@5.48.0
  - @memberjunction/ng-shared@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/ng-dashboard-viewer@5.48.0
  - @memberjunction/ai-engine-base@5.48.0
  - @memberjunction/ai-core-plus@5.48.0
  - @memberjunction/ai-vectors-memory@5.48.0
  - @memberjunction/actions-base@5.48.0
  - @memberjunction/ng-auth-services@5.48.0
  - @memberjunction/ng-entity-action-ux@5.48.0
  - @memberjunction/ng-entity-viewer@5.48.0
  - @memberjunction/ng-file-storage@5.48.0
  - @memberjunction/communication-types@5.48.0
  - @memberjunction/entity-communications-base@5.48.0
  - @memberjunction/graphql-dataprovider@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ai-engine-base@5.47.0
  - @memberjunction/ai-core-plus@5.47.0
  - @memberjunction/ai-vectors-memory@5.47.0
  - @memberjunction/actions-base@5.47.0
  - @memberjunction/ng-auth-services@5.47.0
  - @memberjunction/ng-core-entity-forms@5.47.0
  - @memberjunction/ng-explorer-core@5.47.0
  - @memberjunction/ng-shared@5.47.0
  - @memberjunction/ng-artifacts@5.47.0
  - @memberjunction/ng-conversations@5.47.0
  - @memberjunction/ng-dashboard-viewer@5.47.0
  - @memberjunction/ng-entity-action-ux@5.47.0
  - @memberjunction/ng-entity-viewer@5.47.0
  - @memberjunction/ng-file-storage@5.47.0
  - @memberjunction/communication-types@5.47.0
  - @memberjunction/entity-communications-base@5.47.0
  - @memberjunction/graphql-dataprovider@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/ai-realtime-client@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/ng-core-entity-forms@5.46.0
  - @memberjunction/ai-engine-base@5.46.0
  - @memberjunction/ai-core-plus@5.46.0
  - @memberjunction/ai-vectors-memory@5.46.0
  - @memberjunction/actions-base@5.46.0
  - @memberjunction/ng-auth-services@5.46.0
  - @memberjunction/ng-explorer-core@5.46.0
  - @memberjunction/ng-shared@5.46.0
  - @memberjunction/ng-artifacts@5.46.0
  - @memberjunction/ng-conversations@5.46.0
  - @memberjunction/ng-dashboard-viewer@5.46.0
  - @memberjunction/ng-entity-action-ux@5.46.0
  - @memberjunction/ng-entity-viewer@5.46.0
  - @memberjunction/ng-file-storage@5.46.0
  - @memberjunction/communication-types@5.46.0
  - @memberjunction/entity-communications-base@5.46.0
  - @memberjunction/graphql-dataprovider@5.46.0
  - @memberjunction/ai-realtime-client@5.46.0

## 5.45.1

### Patch Changes

- Updated dependencies [572d219]
  - @memberjunction/ai-core-plus@5.45.1
  - @memberjunction/ng-conversations@5.45.1
  - @memberjunction/ai-engine-base@5.45.1
  - @memberjunction/ng-core-entity-forms@5.45.1
  - @memberjunction/ng-explorer-core@5.45.1
  - @memberjunction/ng-shared@5.45.1
  - @memberjunction/graphql-dataprovider@5.45.1
  - @memberjunction/ng-file-storage@5.45.1
  - @memberjunction/ng-artifacts@5.45.1
  - @memberjunction/ng-entity-action-ux@5.45.1
  - @memberjunction/ng-entity-viewer@5.45.1
  - @memberjunction/ng-dashboard-viewer@5.45.1
  - @memberjunction/ai-realtime-client@5.45.1
  - @memberjunction/ai-vectors-memory@5.45.1
  - @memberjunction/actions-base@5.45.1
  - @memberjunction/ng-auth-services@5.45.1
  - @memberjunction/communication-types@5.45.1
  - @memberjunction/entity-communications-base@5.45.1
  - @memberjunction/core@5.45.1
  - @memberjunction/core-entities@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [13716e4]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [6e10f66]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [ad9f4a3]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/graphql-dataprovider@5.45.0
  - @memberjunction/ng-core-entity-forms@5.45.0
  - @memberjunction/ng-artifacts@5.45.0
  - @memberjunction/ng-conversations@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/ng-explorer-core@5.45.0
  - @memberjunction/ai-engine-base@5.45.0
  - @memberjunction/ai-core-plus@5.45.0
  - @memberjunction/ai-vectors-memory@5.45.0
  - @memberjunction/actions-base@5.45.0
  - @memberjunction/ng-auth-services@5.45.0
  - @memberjunction/ng-shared@5.45.0
  - @memberjunction/ng-dashboard-viewer@5.45.0
  - @memberjunction/ng-entity-action-ux@5.45.0
  - @memberjunction/ng-entity-viewer@5.45.0
  - @memberjunction/ng-file-storage@5.45.0
  - @memberjunction/communication-types@5.45.0
  - @memberjunction/entity-communications-base@5.45.0
  - @memberjunction/ai-realtime-client@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [e84c85b]
- Updated dependencies [f8be8a0]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [914acd4]
- Updated dependencies [18b5bf0]
- Updated dependencies [be5ab50]
- Updated dependencies [45df197]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [0476455]
- Updated dependencies [9f96357]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/ai-engine-base@5.44.0
  - @memberjunction/ai-core-plus@5.44.0
  - @memberjunction/ng-core-entity-forms@5.44.0
  - @memberjunction/ng-conversations@5.44.0
  - @memberjunction/graphql-dataprovider@5.44.0
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/ng-entity-viewer@5.44.0
  - @memberjunction/ng-dashboard-viewer@5.44.0
  - @memberjunction/ng-explorer-core@5.44.0
  - @memberjunction/ai-vectors-memory@5.44.0
  - @memberjunction/ng-shared@5.44.0
  - @memberjunction/ng-artifacts@5.44.0
  - @memberjunction/ai-realtime-client@5.44.0
  - @memberjunction/ng-entity-action-ux@5.44.0
  - @memberjunction/ng-file-storage@5.44.0
  - @memberjunction/ng-auth-services@5.44.0
  - @memberjunction/actions-base@5.44.0
  - @memberjunction/communication-types@5.44.0
  - @memberjunction/entity-communications-base@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
- Updated dependencies [3eaa05a]
  - @memberjunction/core@5.43.0
  - @memberjunction/ai-core-plus@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/ng-conversations@5.43.0
  - @memberjunction/ai-engine-base@5.43.0
  - @memberjunction/ai-vectors-memory@5.43.0
  - @memberjunction/actions-base@5.43.0
  - @memberjunction/ng-auth-services@5.43.0
  - @memberjunction/ng-core-entity-forms@5.43.0
  - @memberjunction/ng-explorer-core@5.43.0
  - @memberjunction/ng-shared@5.43.0
  - @memberjunction/ng-artifacts@5.43.0
  - @memberjunction/ng-dashboard-viewer@5.43.0
  - @memberjunction/ng-entity-action-ux@5.43.0
  - @memberjunction/ng-entity-viewer@5.43.0
  - @memberjunction/ng-file-storage@5.43.0
  - @memberjunction/communication-types@5.43.0
  - @memberjunction/entity-communications-base@5.43.0
  - @memberjunction/graphql-dataprovider@5.43.0
  - @memberjunction/ai-realtime-client@5.43.0

## 5.42.0

### Patch Changes

- 08c016c: Add `@memberjunction/ai-bridge-livekit-native` — the real native LiveKit room client that wraps `@livekit/rtc-node` behind the `NativeRoomModule` contract `LiveKitNativeMeetingSdk` expects, giving the agent two-way audio (publish the agent's voice + subscribe to per-participant audio for diarized hearing) in a live LiveKit room. `@livekit/rtc-node` is an optionalDependency loaded lazily, so the package builds/tests with no addon (fake-module tests). Also regenerates the pre-built class-registration manifests to include `LoopbackBridge` from `@memberjunction/ai-bridge-server`.
- Updated dependencies [313c1c5]
- Updated dependencies [256ab06]
- Updated dependencies [9b9b484]
- Updated dependencies [e7c2437]
- Updated dependencies [37c73f6]
- Updated dependencies [0c6bf61]
- Updated dependencies [5fde509]
- Updated dependencies [4ec1732]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [ccaf49b]
- Updated dependencies [0fa3cbc]
- Updated dependencies [e4235fd]
- Updated dependencies [3ee0f22]
- Updated dependencies [a5d4a15]
- Updated dependencies [da5a3dd]
  - @memberjunction/ng-explorer-core@5.42.0
  - @memberjunction/ai-core-plus@5.42.0
  - @memberjunction/core@5.42.0
  - @memberjunction/ng-conversations@5.42.0
  - @memberjunction/communication-types@5.42.0
  - @memberjunction/ai-vectors-memory@5.42.0
  - @memberjunction/graphql-dataprovider@5.42.0
  - @memberjunction/actions-base@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/ng-entity-viewer@5.42.0
  - @memberjunction/ng-core-entity-forms@5.42.0
  - @memberjunction/ng-artifacts@5.42.0
  - @memberjunction/ng-file-storage@5.42.0
  - @memberjunction/ai-engine-base@5.42.0
  - @memberjunction/ng-shared@5.42.0
  - @memberjunction/ng-auth-services@5.42.0
  - @memberjunction/ng-dashboard-viewer@5.42.0
  - @memberjunction/entity-communications-base@5.42.0
  - @memberjunction/ai-realtime-client@5.42.0

## 5.41.0

### Minor Changes

- cd6c5f0: Realtime AI Agents wave 3: consolidated v5.41 migration (sessions, channels, co-agent schema) with the AIAgentCoAgent affinity registry replacing AIAgentPairedAgent — typed relationship vocabulary (CoAgent implemented; Peer/Delegate/Fallback/Reviewer/Observer reserved), type-level co-agent defaults as junction rows (removing the only FK cycle in core MJ), and the full code sweep (engine cache, resolver resolution chain, server-side invariants, client pairing reads, regenerated manifests). Realtime UX: progressive-disclosure voice console with persisted captions preference, user-owned composer and tabs toggles, audio-reactive visuals; whiteboard pages/multi-select and review-persistence fixes. Gemini Live triggering turns ride realtime text so widget clicks/typed input/narration speak immediately on native-audio models. CodeGen: single-winner IsNameField enforcement with eligibility guardrail fixes, SCC-based cycle diagnostics, and clean-database bootstrap robustness (conditional engine registry datasets).
- a5f5472: Remote Browser channel + new realtime voice providers + computer-use enrichment.
  - **Remote Browser channel** (`@memberjunction/remote-browser-*`): an in-house realtime channel where an agent drives a live, CDP-connected browser while it talks (sales demos, support walkthroughs, trainer agents). New `AIRemoteBrowserProvider` registry (migration V202606161000) with JSONType capability gating; a universal `remote-browser-base` (driver family + `RemoteBrowserEngineBase`), a shared `remote-browser-cdp` kit (one lossless action mapper + `CdpRemoteBrowserSession`), a `remote-browser-server` engine + `RemoteBrowserChannel` (control arbiter, control modes AgentOnly/ViewOnly/Collaborative vs strategies ComputerUse/NativeAI), and five thin backends (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).
  - **computer-use** enriched additively into a complete browser-I/O + perception engine: CSS-selector-aware actions, CDP screencast, MouseMove, accessibility-snapshot/QueryElement/GetVisibleText/GetTitle/WaitForLoadState — every consumer benefits, existing vision/coordinate path unchanged.
  - **New realtime model providers**: xAI Grok Voice (`@memberjunction/ai-xai`, OpenAI-Realtime-compatible) and Inworld (`@memberjunction/ai-inworld`), with vendor/model seeds.
  - **Console logging improvements** across `@memberjunction/ai-core-plus`, `ai-engine-base`, `ai-prompts`, `aiengine`, `cli`, `generic-database-provider`, `metadata-sync`, and the bootstrap/forms packages.

### Patch Changes

- 15b743b: Real-Time AI Agents — Sessions, Channels & the Realtime Model (plans/ai-agent-sessions.md). Adds the AIAgentSession/AIAgentChannel/AIAgentSessionChannel schema (+ AgentSessionID on AIAgentRun/ConversationDetail, CloseReason on AIAgentSession); the BaseRealtimeModel server primitive with OpenAIRealtime + GeminiRealtime drivers (server-bridged StartSession and client-direct ephemeral-token CreateClientSession, optional SendContextNote/RequestSpokenUpdate interim updates); the new @memberjunction/ai-realtime-client package with the BaseRealtimeClient browser abstraction + OpenAI/Gemini client drivers resolved via ClassFactory by provider key; the Realtime agent type + Voice Co-Agent with RealtimeSessionRunner/RealtimeToolBroker, AgentMemoryContextBuilder extraction, server session lifecycle (SessionManager, SessionJanitor, start/close/heartbeat + client-direct resolvers with delegated-run progress streaming, AwaitingFeedback resume, co-agent observability runs, user-selectable realtime model); the full-panel realtime voice call UX in ng-conversations (phone trigger + agent/model picker, banner/thread/activity rail, delegation working/result cards with provenance, ephemeral paced first-person progress narration driven by DB prompt templates, in-call text composer); Realtime Voice admin (AI Analytics dashboard sections, session/channel custom forms, agent Runs|Sessions execution history); and Query Builder/Strategist reliability fixes (entity catalog in prompt, Get Entity Details sample caps + semantic fallback, plan formatting). Also: the standalone @memberjunction/ng-whiteboard package (collaborative board with agent tool API, sandboxed interactive widgets + input bridge, markdown panels, exports, cancelable before/after events); ElevenLabs Agents + AssemblyAI Voice Agent realtime provider pairs (4-provider matrix, zero contract changes); session review mode with multi-leg resume carryover (timeline dividers, artifact junction closure, prior-transcript model hydration); delegation cancel channel; usage telemetry relay; Realtime Co-Agent rename with run-step/prompt-run observability.
- Updated dependencies [8fd6f59]
- Updated dependencies [6f227ab]
- Updated dependencies [2e48d1a]
- Updated dependencies [34d17e2]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [4b30726]
- Updated dependencies [ef5a5d7]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
- Updated dependencies [4b3fb9d]
- Updated dependencies [fb2a22f]
- Updated dependencies [c5d93a0]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ng-core-entity-forms@5.41.0
  - @memberjunction/ai-realtime-client@5.41.0
  - @memberjunction/ng-conversations@5.41.0
  - @memberjunction/graphql-dataprovider@5.41.0
  - @memberjunction/ai-engine-base@5.41.0
  - @memberjunction/ai-core-plus@5.41.0
  - @memberjunction/ng-artifacts@5.41.0
  - @memberjunction/ai-vectors-memory@5.41.0
  - @memberjunction/actions-base@5.41.0
  - @memberjunction/ng-auth-services@5.41.0
  - @memberjunction/ng-explorer-core@5.41.0
  - @memberjunction/ng-shared@5.41.0
  - @memberjunction/ng-dashboard-viewer@5.41.0
  - @memberjunction/ng-entity-viewer@5.41.0
  - @memberjunction/ng-file-storage@5.41.0
  - @memberjunction/communication-types@5.41.0
  - @memberjunction/entity-communications-base@5.41.0

## 5.40.2

### Patch Changes

- Updated dependencies [3da89ef]
  - @memberjunction/ng-artifacts@5.40.2
  - @memberjunction/ng-explorer-core@5.40.2
  - @memberjunction/ng-dashboard-viewer@5.40.2
  - @memberjunction/ai-engine-base@5.40.2
  - @memberjunction/ai-core-plus@5.40.2
  - @memberjunction/ai-vectors-memory@5.40.2
  - @memberjunction/actions-base@5.40.2
  - @memberjunction/ng-auth-services@5.40.2
  - @memberjunction/ng-core-entity-forms@5.40.2
  - @memberjunction/ng-shared@5.40.2
  - @memberjunction/ng-entity-viewer@5.40.2
  - @memberjunction/ng-file-storage@5.40.2
  - @memberjunction/communication-types@5.40.2
  - @memberjunction/entity-communications-base@5.40.2
  - @memberjunction/graphql-dataprovider@5.40.2
  - @memberjunction/core@5.40.2
  - @memberjunction/core-entities@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-engine-base@5.40.1
  - @memberjunction/ai-core-plus@5.40.1
  - @memberjunction/ai-vectors-memory@5.40.1
  - @memberjunction/actions-base@5.40.1
  - @memberjunction/ng-auth-services@5.40.1
  - @memberjunction/ng-core-entity-forms@5.40.1
  - @memberjunction/ng-explorer-core@5.40.1
  - @memberjunction/ng-shared@5.40.1
  - @memberjunction/ng-artifacts@5.40.1
  - @memberjunction/ng-dashboard-viewer@5.40.1
  - @memberjunction/ng-entity-viewer@5.40.1
  - @memberjunction/ng-file-storage@5.40.1
  - @memberjunction/communication-types@5.40.1
  - @memberjunction/entity-communications-base@5.40.1
  - @memberjunction/graphql-dataprovider@5.40.1
  - @memberjunction/core-entities@5.40.1

## 5.40.0

### Minor Changes

- 253a188: Knowledge Hub Classify redesign
  - **Clustering**: new `@memberjunction/clustering-engine` (framework-agnostic fetch → cluster → reduce → LLM-name pipeline), a "Run Cluster Analysis" action, a `RunClusterAnalysis` GraphQL resolver, a `GraphQLClusterClient` transport, and the Angular `ClusteringService` thinned to delegate to the server.
  - **View-type plug-in architecture (entity viewer)**: `ViewType` registry + `ViewTypeEngine` + `IViewTypeDescriptor`/`IViewRenderer`/`IViewPropSheet` contracts in `ng-entity-viewer`, with Grid/Cards/Timeline/Map descriptors. The host now **dynamic-mounts** any registered plug-in view type (via `ViewContainerRef`) with zero host changes, and the switcher shows the active type's icon + label, collapsing from an icon strip to a dropdown as the list grows. **Cluster view type** added in `@memberjunction/ng-clustering` (descriptor + `IViewRenderer` wrapper over the scatter + `IViewPropSheet` + an Entity-Document availability engine) — available on any entity with vectors, reusing the same `ClusteringService`. The active view type persists to `UserView.ViewTypeID` (new source of truth; backfilled from the legacy `DisplayState.defaultMode`) and per-view-type config to `UserView.DisplayState.viewTypeConfigs` (new typed `IViewTypeConfigEntry`). `ViewType.Icon` is now `ExtendedType='Icon'` for the admin icon picker. See `packages/Angular/Generic/entity-viewer/VIEW_TYPE_PLUGINS.md`.
  - **Classify UX**: per-tab scroll fix, Refresh buttons, meaningful content-item display names, loading states, `BaseEntityEvent` reactivity, and load-more pagination.
  - **Audit & analytics**: direct tag→prompt-run lineage (`AIPromptRunID` + `Reasoning` on Content Item Tags), `ClassifyAnalyticsEngine`, reusable item grid + drilldown, and an Overview analytics section.
  - **Setup & onboarding**: contextual prompt injection (org/content-type/source aggregation), `generateSeedTaxonomy` (clustering-backed) + resolver, source-form domain-context UI, org-context editor, inline Entity Document creation, seed-taxonomy review, and a guided setup wizard.
  - **Visualize surface**: Knowledge Hub "Clusters" tab generalized to a "Visualize" host with Clusters / Tag Cloud modes, a `TagCloudEngine`, and a shared record drilldown.
  - **Foundations**: `ApplicationSettingEngine` (global + app-scoped settings), and the `tag-engine` → `tag-engine-base` split so browser code no longer pulls server-only AI dependencies.
  - **Fix**: stop server-only packages (`templates` → `aiengine`/`ai-provider-bundle`, storage, vector-DB and LLM provider SDKs) from leaking into the browser class-registration manifest, which previously broke the MJExplorer cold build. Added CLAUDE.md guardrails to the Bootstrap and BootstrapLite packages.

### Patch Changes

- 7bbfd62: Add PreShellGuard for request-scoped TenantContext and auth fixes in MJServer CurrentUserContextResolver
- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [7bbfd62]
- Updated dependencies [f2cca15]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
- Updated dependencies [40e90fa]
- Updated dependencies [6957711]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/ng-entity-viewer@5.40.0
  - @memberjunction/ng-core-entity-forms@5.40.0
  - @memberjunction/graphql-dataprovider@5.40.0
  - @memberjunction/ng-artifacts@5.40.0
  - @memberjunction/ng-auth-services@5.40.0
  - @memberjunction/ng-explorer-core@5.40.0
  - @memberjunction/ng-shared@5.40.0
  - @memberjunction/ai-engine-base@5.40.0
  - @memberjunction/ai-core-plus@5.40.0
  - @memberjunction/ai-vectors-memory@5.40.0
  - @memberjunction/actions-base@5.40.0
  - @memberjunction/ng-dashboard-viewer@5.40.0
  - @memberjunction/ng-file-storage@5.40.0
  - @memberjunction/communication-types@5.40.0
  - @memberjunction/entity-communications-base@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [f60e340]
- Updated dependencies [bd95e83]
- Updated dependencies [3c53858]
- Updated dependencies [3b29882]
- Updated dependencies [d1cc0ad]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/graphql-dataprovider@5.39.0
  - @memberjunction/ng-explorer-core@5.39.0
  - @memberjunction/ng-core-entity-forms@5.39.0
  - @memberjunction/ai-core-plus@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ai-engine-base@5.39.0
  - @memberjunction/ai-vectors-memory@5.39.0
  - @memberjunction/actions-base@5.39.0
  - @memberjunction/ng-auth-services@5.39.0
  - @memberjunction/ng-shared@5.39.0
  - @memberjunction/ng-artifacts@5.39.0
  - @memberjunction/ng-dashboard-viewer@5.39.0
  - @memberjunction/ng-file-storage@5.39.0
  - @memberjunction/communication-types@5.39.0
  - @memberjunction/entity-communications-base@5.39.0

## 5.38.0

### Patch Changes

- 60947be: Fix several entity-record save flow issues in MJ Explorer: re-key the tab and component cache when a "Create New Record" form transitions to a saved record so subsequent new-record clicks open a blank form; correct the URL-segment format used by ResourceRecordSaved so the form no longer fails to reload after save with a doubled-prefix key; wire up the previously no-op tab title refresh after save (including refreshing the Home app's dynamic nav-item label) so the user sees the latest entity name without navigating away.
- ebb0e3d: Eliminate provider.Refresh() from query save/delete paths, introduce MJQueryEntityExtended with child-relationship getters and business logic, migrate all QueryInfo consumers outside MJCore to use QueryEngine and entity types, remove dead QueryCacheManager, and replace 12 redundant RunView calls with QueryEngine cache reads. Fixes major performance bottleneck on large-entity deployments where every query save reloaded the entire metadata graph.
- Updated dependencies [6b6c321]
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [6a571d3]
- Updated dependencies [275afda]
- Updated dependencies [d285996]
- Updated dependencies [8bd97f3]
- Updated dependencies [6a3ac36]
- Updated dependencies [918d663]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [b26d0ee]
- Updated dependencies [60947be]
- Updated dependencies [ebb0e3d]
  - @memberjunction/ai-core-plus@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/ng-core-entity-forms@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/ng-shared@5.38.0
  - @memberjunction/ng-explorer-core@5.38.0
  - @memberjunction/ng-artifacts@5.38.0
  - @memberjunction/graphql-dataprovider@5.38.0
  - @memberjunction/ai-engine-base@5.38.0
  - @memberjunction/ai-vectors-memory@5.38.0
  - @memberjunction/actions-base@5.38.0
  - @memberjunction/ng-auth-services@5.38.0
  - @memberjunction/ng-dashboard-viewer@5.38.0
  - @memberjunction/ng-file-storage@5.38.0
  - @memberjunction/communication-types@5.38.0
  - @memberjunction/entity-communications-base@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [dadbde9]
- Updated dependencies [22b775f]
- Updated dependencies [4f15f31]
  - @memberjunction/graphql-dataprovider@5.37.0
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ng-core-entity-forms@5.37.0
  - @memberjunction/ng-explorer-core@5.37.0
  - @memberjunction/ng-shared@5.37.0
  - @memberjunction/ng-artifacts@5.37.0
  - @memberjunction/ng-file-storage@5.37.0
  - @memberjunction/ai-engine-base@5.37.0
  - @memberjunction/ai-vectors-memory@5.37.0
  - @memberjunction/actions-base@5.37.0
  - @memberjunction/ng-auth-services@5.37.0
  - @memberjunction/ng-dashboard-viewer@5.37.0
  - @memberjunction/communication-types@5.37.0
  - @memberjunction/entity-communications-base@5.37.0

## 5.36.0

### Patch Changes

- 91036ee: Refreshable, shareable, taggable Lists with an agent-callable Actions surface.
  - New `@memberjunction/lists` core: ListOperations (delta + drop-guard + materialize/refresh/set-op), ListSharing, AudienceResolver.
  - `MJ: Lists` lineage fields (SourceViewID, SourceFilterSnapshot, LastRefreshedAt, RefreshMode, UseSnapshot) wired into Refresh-from-source.
  - GraphQL: ListOperationsResolver + GraphQLListsClient. New `SendToAudience` in communication-engine.
  - 12 new Actions covering materialize / refresh / share / invite / move / compose / resolve-audience / send-to-audience.
  - UI: Save-as-List, mixed list+view operands, compose-into-target, Shared With Me tab, invitations + audit-log dialogs, viewer-perspective gating, bulk Move/Copy with delta-confirm, tag chips + filter, list-stats sidebar, audience picker, Communications New Message page, Excel/CSV/JSON column-picker export.

- Updated dependencies [f29b7c0]
- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/graphql-dataprovider@5.36.0
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/ng-explorer-core@5.36.0
  - @memberjunction/ng-core-entity-forms@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ng-shared@5.36.0
  - @memberjunction/ng-artifacts@5.36.0
  - @memberjunction/ng-file-storage@5.36.0
  - @memberjunction/ng-dashboard-viewer@5.36.0
  - @memberjunction/ai-engine-base@5.36.0
  - @memberjunction/ai-core-plus@5.36.0
  - @memberjunction/actions-base@5.36.0
  - @memberjunction/communication-types@5.36.0
  - @memberjunction/entity-communications-base@5.36.0
  - @memberjunction/ai-vectors-memory@5.36.0
  - @memberjunction/ng-auth-services@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [ee380f7]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [eb54def]
- Updated dependencies [77e4782]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [383784c]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/ng-file-storage@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/ng-core-entity-forms@5.35.0
  - @memberjunction/graphql-dataprovider@5.35.0
  - @memberjunction/ai-core-plus@5.35.0
  - @memberjunction/ng-shared@5.35.0
  - @memberjunction/ng-explorer-core@5.35.0
  - @memberjunction/ai-engine-base@5.35.0
  - @memberjunction/ai-vectors-memory@5.35.0
  - @memberjunction/actions-base@5.35.0
  - @memberjunction/ng-auth-services@5.35.0
  - @memberjunction/ng-artifacts@5.35.0
  - @memberjunction/ng-dashboard-viewer@5.35.0
  - @memberjunction/communication-types@5.35.0
  - @memberjunction/entity-communications-base@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [8695f65]
- Updated dependencies [5abf790]
  - @memberjunction/core@5.34.1
  - @memberjunction/graphql-dataprovider@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/ai-engine-base@5.34.1
  - @memberjunction/ai-vectors-memory@5.34.1
  - @memberjunction/actions-base@5.34.1
  - @memberjunction/ng-auth-services@5.34.1
  - @memberjunction/ng-core-entity-forms@5.34.1
  - @memberjunction/ng-explorer-core@5.34.1
  - @memberjunction/ng-shared@5.34.1
  - @memberjunction/ng-artifacts@5.34.1
  - @memberjunction/ng-dashboard-viewer@5.34.1
  - @memberjunction/ng-file-storage@5.34.1
  - @memberjunction/communication-types@5.34.1
  - @memberjunction/entity-communications-base@5.34.1
  - @memberjunction/core-entities@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [b03bfb4]
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [11ae7e6]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [ad61267]
- Updated dependencies [72cb92e]
  - @memberjunction/ng-core-entity-forms@5.34.0
  - @memberjunction/ng-explorer-core@5.34.0
  - @memberjunction/ng-artifacts@5.34.0
  - @memberjunction/ai-engine-base@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/ai-vectors-memory@5.34.0
  - @memberjunction/actions-base@5.34.0
  - @memberjunction/ng-auth-services@5.34.0
  - @memberjunction/ng-shared@5.34.0
  - @memberjunction/ng-dashboard-viewer@5.34.0
  - @memberjunction/ng-file-storage@5.34.0
  - @memberjunction/communication-types@5.34.0
  - @memberjunction/entity-communications-base@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/graphql-dataprovider@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [97ed790]
- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/ng-explorer-core@5.33.0
  - @memberjunction/graphql-dataprovider@5.33.0
  - @memberjunction/core@5.33.0
  - @memberjunction/ng-core-entity-forms@5.33.0
  - @memberjunction/ng-shared@5.33.0
  - @memberjunction/ng-artifacts@5.33.0
  - @memberjunction/ng-file-storage@5.33.0
  - @memberjunction/ai-engine-base@5.33.0
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/actions-base@5.33.0
  - @memberjunction/ng-auth-services@5.33.0
  - @memberjunction/ng-dashboard-viewer@5.33.0
  - @memberjunction/communication-types@5.33.0
  - @memberjunction/entity-communications-base@5.33.0
  - @memberjunction/core-entities@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ai-engine-base@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/actions-base@5.32.0
  - @memberjunction/ng-auth-services@5.32.0
  - @memberjunction/ng-core-entity-forms@5.32.0
  - @memberjunction/ng-explorer-core@5.32.0
  - @memberjunction/ng-shared@5.32.0
  - @memberjunction/ng-artifacts@5.32.0
  - @memberjunction/ng-dashboard-viewer@5.32.0
  - @memberjunction/ng-file-storage@5.32.0
  - @memberjunction/communication-types@5.32.0
  - @memberjunction/entity-communications-base@5.32.0
  - @memberjunction/graphql-dataprovider@5.32.0
  - @memberjunction/core-entities@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [c8b6f8a]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
- Updated dependencies [0e3365f]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/graphql-dataprovider@5.31.0
  - @memberjunction/ng-core-entity-forms@5.31.0
  - @memberjunction/ai-engine-base@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/actions-base@5.31.0
  - @memberjunction/ng-auth-services@5.31.0
  - @memberjunction/ng-explorer-core@5.31.0
  - @memberjunction/ng-shared@5.31.0
  - @memberjunction/ng-artifacts@5.31.0
  - @memberjunction/ng-dashboard-viewer@5.31.0
  - @memberjunction/ng-file-storage@5.31.0
  - @memberjunction/communication-types@5.31.0
  - @memberjunction/entity-communications-base@5.31.0
  - @memberjunction/core@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-engine-base@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/actions-base@5.30.1
- @memberjunction/ng-auth-services@5.30.1
- @memberjunction/ng-core-entity-forms@5.30.1
- @memberjunction/ng-explorer-core@5.30.1
- @memberjunction/ng-shared@5.30.1
- @memberjunction/ng-artifacts@5.30.1
- @memberjunction/ng-dashboard-viewer@5.30.1
- @memberjunction/ng-file-storage@5.30.1
- @memberjunction/communication-types@5.30.1
- @memberjunction/entity-communications-base@5.30.1
- @memberjunction/graphql-dataprovider@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1

## 5.30.0

### Patch Changes

- c199f3b: Phase 2 of the unified permissions architecture: introduces the `IPermissionProvider` interface with 9 domain providers (Entity, Application Role, Dashboard, Resource, Artifact, AI Agent, Collection, Query, Access Control Rule) aggregated by a new `PermissionEngine` singleton, adds explicit Allow/Deny support to `EntityPermission`, and ships the Permissions admin dashboard. Includes migrations for the Permission Domain catalog, EntityPermission.Type column, Dashboard FK cascade delete, ResourcePermission.SharedByUserID, and UI role permission fixes.
- Updated dependencies [8980b38]
- Updated dependencies [c2c5892]
- Updated dependencies [11df18d]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [9154ac7]
- Updated dependencies [b1f32a4]
- Updated dependencies [a00af98]
- Updated dependencies [c199f3b]
- Updated dependencies [216ddc3]
  - @memberjunction/ng-core-entity-forms@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/ng-dashboard-viewer@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/actions-base@5.30.0
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/graphql-dataprovider@5.30.0
  - @memberjunction/ai-engine-base@5.30.0
  - @memberjunction/ng-artifacts@5.30.0
  - @memberjunction/ng-explorer-core@5.30.0
  - @memberjunction/ng-shared@5.30.0
  - @memberjunction/ng-file-storage@5.30.0
  - @memberjunction/communication-types@5.30.0
  - @memberjunction/entity-communications-base@5.30.0
  - @memberjunction/ng-auth-services@5.30.0

## 5.29.0

### Patch Changes

- 5c7a57f: Add in-app feedback system with mj-dialog UI, GitHub App authentication for issue creation, and shell header integration. Feedback submissions create formatted GitHub issues with labels, severity, environment info, and browser details.
- Updated dependencies [5c7a57f]
- Updated dependencies [e02e24e]
- Updated dependencies [5585961]
- Updated dependencies [7006276]
  - @memberjunction/ng-explorer-core@5.29.0
  - @memberjunction/core@5.29.0
  - @memberjunction/ng-core-entity-forms@5.29.0
  - @memberjunction/ng-file-storage@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ai-engine-base@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/actions-base@5.29.0
  - @memberjunction/ng-auth-services@5.29.0
  - @memberjunction/ng-shared@5.29.0
  - @memberjunction/ng-artifacts@5.29.0
  - @memberjunction/ng-dashboard-viewer@5.29.0
  - @memberjunction/communication-types@5.29.0
  - @memberjunction/entity-communications-base@5.29.0
  - @memberjunction/graphql-dataprovider@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [2542615]
- Updated dependencies [115e4da]
  - @memberjunction/ng-shared@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ng-explorer-core@5.28.0
  - @memberjunction/ng-core-entity-forms@5.28.0
  - @memberjunction/ng-file-storage@5.28.0
  - @memberjunction/ai-engine-base@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/actions-base@5.28.0
  - @memberjunction/ng-auth-services@5.28.0
  - @memberjunction/ng-artifacts@5.28.0
  - @memberjunction/ng-dashboard-viewer@5.28.0
  - @memberjunction/communication-types@5.28.0
  - @memberjunction/entity-communications-base@5.28.0
  - @memberjunction/graphql-dataprovider@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
- Updated dependencies [6c39ff0]
  - @memberjunction/ng-dashboard-viewer@5.27.1
  - @memberjunction/graphql-dataprovider@5.27.1
  - @memberjunction/ng-explorer-core@5.27.1
  - @memberjunction/ai-engine-base@5.27.1
  - @memberjunction/ai-core-plus@5.27.1
  - @memberjunction/actions-base@5.27.1
  - @memberjunction/ng-auth-services@5.27.1
  - @memberjunction/ng-core-entity-forms@5.27.1
  - @memberjunction/ng-shared@5.27.1
  - @memberjunction/ng-artifacts@5.27.1
  - @memberjunction/ng-file-storage@5.27.1
  - @memberjunction/communication-types@5.27.1
  - @memberjunction/entity-communications-base@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1

## 5.27.0

### Patch Changes

- Updated dependencies [6fd2886]
  - @memberjunction/ng-explorer-core@5.27.0
  - @memberjunction/ng-core-entity-forms@5.27.0
  - @memberjunction/ng-artifacts@5.27.0
  - @memberjunction/ng-dashboard-viewer@5.27.0
  - @memberjunction/ai-engine-base@5.27.0
  - @memberjunction/ai-core-plus@5.27.0
  - @memberjunction/actions-base@5.27.0
  - @memberjunction/ng-auth-services@5.27.0
  - @memberjunction/ng-shared@5.27.0
  - @memberjunction/ng-file-storage@5.27.0
  - @memberjunction/communication-types@5.27.0
  - @memberjunction/entity-communications-base@5.27.0
  - @memberjunction/graphql-dataprovider@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/core-entities@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/ng-core-entity-forms@5.26.0
  - @memberjunction/ng-dashboard-viewer@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-engine-base@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/actions-base@5.26.0
  - @memberjunction/ng-explorer-core@5.26.0
  - @memberjunction/ng-shared@5.26.0
  - @memberjunction/ng-artifacts@5.26.0
  - @memberjunction/ng-file-storage@5.26.0
  - @memberjunction/communication-types@5.26.0
  - @memberjunction/entity-communications-base@5.26.0
  - @memberjunction/graphql-dataprovider@5.26.0
  - @memberjunction/ng-auth-services@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [a24ff53]
- Updated dependencies [d6370e8]
- Updated dependencies [008a62d]
- Updated dependencies [7ddf732]
- Updated dependencies [5e2a64f]
- Updated dependencies [1eb9f6e]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/graphql-dataprovider@5.25.0
  - @memberjunction/ng-core-entity-forms@5.25.0
  - @memberjunction/ng-explorer-core@5.25.0
  - @memberjunction/ng-dashboard-viewer@5.25.0
  - @memberjunction/ng-artifacts@5.25.0
  - @memberjunction/ai-engine-base@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/actions-base@5.25.0
  - @memberjunction/ng-auth-services@5.25.0
  - @memberjunction/ng-shared@5.25.0
  - @memberjunction/ng-file-storage@5.25.0
  - @memberjunction/communication-types@5.25.0
  - @memberjunction/entity-communications-base@5.25.0

## 5.24.0

### Minor Changes

- c318a0c: metadata + migrations in this PR == minor

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [3a35955]
- Updated dependencies [1912726]
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/ng-explorer-core@5.24.0
  - @memberjunction/graphql-dataprovider@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/ng-auth-services@5.24.0
  - @memberjunction/ng-artifacts@5.24.0
  - @memberjunction/ai-engine-base@5.24.0
  - @memberjunction/ng-core-entity-forms@5.24.0
  - @memberjunction/ng-shared@5.24.0
  - @memberjunction/ng-file-storage@5.24.0
  - @memberjunction/actions-base@5.24.0
  - @memberjunction/ng-dashboard-viewer@5.24.0
  - @memberjunction/communication-types@5.24.0
  - @memberjunction/entity-communications-base@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [1d1e02e]
- Updated dependencies [c17be20]
  - @memberjunction/core@5.23.0
  - @memberjunction/ng-explorer-core@5.23.0
  - @memberjunction/ng-artifacts@5.23.0
  - @memberjunction/ng-dashboard-viewer@5.23.0
  - @memberjunction/graphql-dataprovider@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/ai-engine-base@5.23.0
  - @memberjunction/actions-base@5.23.0
  - @memberjunction/ng-auth-services@5.23.0
  - @memberjunction/ng-core-entity-forms@5.23.0
  - @memberjunction/ng-shared@5.23.0
  - @memberjunction/ng-file-storage@5.23.0
  - @memberjunction/communication-types@5.23.0
  - @memberjunction/entity-communications-base@5.23.0

## 5.22.0

### Minor Changes

- a42aba6: metadata

### Patch Changes

- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [e5993ff]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/ng-explorer-core@5.22.0
  - @memberjunction/ng-artifacts@5.22.0
  - @memberjunction/ng-dashboard-viewer@5.22.0
  - @memberjunction/ai-engine-base@5.22.0
  - @memberjunction/ng-core-entity-forms@5.22.0
  - @memberjunction/graphql-dataprovider@5.22.0
  - @memberjunction/actions-base@5.22.0
  - @memberjunction/ng-auth-services@5.22.0
  - @memberjunction/ng-shared@5.22.0
  - @memberjunction/ng-file-storage@5.22.0
  - @memberjunction/communication-types@5.22.0
  - @memberjunction/entity-communications-base@5.22.0
  - @memberjunction/core-entities@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
- Updated dependencies [76cd2bc]
  - @memberjunction/core@5.21.0
  - @memberjunction/ai-core-plus@5.21.0
  - @memberjunction/ai-engine-base@5.21.0
  - @memberjunction/actions-base@5.21.0
  - @memberjunction/ng-auth-services@5.21.0
  - @memberjunction/ng-core-entity-forms@5.21.0
  - @memberjunction/ng-explorer-core@5.21.0
  - @memberjunction/ng-shared@5.21.0
  - @memberjunction/ng-artifacts@5.21.0
  - @memberjunction/ng-dashboard-viewer@5.21.0
  - @memberjunction/ng-file-storage@5.21.0
  - @memberjunction/communication-types@5.21.0
  - @memberjunction/entity-communications-base@5.21.0
  - @memberjunction/graphql-dataprovider@5.21.0
  - @memberjunction/core-entities@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ai-engine-base@5.20.0
  - @memberjunction/ai-core-plus@5.20.0
  - @memberjunction/actions-base@5.20.0
  - @memberjunction/ng-auth-services@5.20.0
  - @memberjunction/ng-core-entity-forms@5.20.0
  - @memberjunction/ng-explorer-core@5.20.0
  - @memberjunction/ng-shared@5.20.0
  - @memberjunction/ng-artifacts@5.20.0
  - @memberjunction/ng-dashboard-viewer@5.20.0
  - @memberjunction/ng-file-storage@5.20.0
  - @memberjunction/communication-types@5.20.0
  - @memberjunction/entity-communications-base@5.20.0
  - @memberjunction/graphql-dataprovider@5.20.0
  - @memberjunction/core-entities@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai-engine-base@5.19.0
- @memberjunction/ai-core-plus@5.19.0
- @memberjunction/actions-base@5.19.0
- @memberjunction/ng-auth-services@5.19.0
- @memberjunction/ng-core-entity-forms@5.19.0
- @memberjunction/ng-explorer-core@5.19.0
- @memberjunction/ng-shared@5.19.0
- @memberjunction/ng-artifacts@5.19.0
- @memberjunction/ng-dashboard-viewer@5.19.0
- @memberjunction/ng-file-storage@5.19.0
- @memberjunction/communication-types@5.19.0
- @memberjunction/entity-communications-base@5.19.0
- @memberjunction/graphql-dataprovider@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [322dac6]
- Updated dependencies [ee4bf94]
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/ng-core-entity-forms@5.18.0
  - @memberjunction/ai-engine-base@5.18.0
  - @memberjunction/ng-explorer-core@5.18.0
  - @memberjunction/graphql-dataprovider@5.18.0
  - @memberjunction/ng-artifacts@5.18.0
  - @memberjunction/ng-shared@5.18.0
  - @memberjunction/ng-file-storage@5.18.0
  - @memberjunction/ng-dashboard-viewer@5.18.0
  - @memberjunction/actions-base@5.18.0
  - @memberjunction/ng-auth-services@5.18.0
  - @memberjunction/communication-types@5.18.0
  - @memberjunction/entity-communications-base@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [bbfbf5e]
- Updated dependencies [001fd3e]
- Updated dependencies [9881045]
  - @memberjunction/graphql-dataprovider@5.17.0
  - @memberjunction/ng-core-entity-forms@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/ng-explorer-core@5.17.0
  - @memberjunction/ng-shared@5.17.0
  - @memberjunction/ng-file-storage@5.17.0
  - @memberjunction/ai-engine-base@5.17.0
  - @memberjunction/ai-core-plus@5.17.0
  - @memberjunction/actions-base@5.17.0
  - @memberjunction/ng-auth-services@5.17.0
  - @memberjunction/ng-artifacts@5.17.0
  - @memberjunction/ng-dashboard-viewer@5.17.0
  - @memberjunction/communication-types@5.17.0
  - @memberjunction/entity-communications-base@5.17.0
  - @memberjunction/core-entities@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [179a4ce]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/graphql-dataprovider@5.16.0
  - @memberjunction/ai-engine-base@5.16.0
  - @memberjunction/ai-core-plus@5.16.0
  - @memberjunction/actions-base@5.16.0
  - @memberjunction/ng-auth-services@5.16.0
  - @memberjunction/ng-core-entity-forms@5.16.0
  - @memberjunction/ng-explorer-core@5.16.0
  - @memberjunction/ng-shared@5.16.0
  - @memberjunction/ng-artifacts@5.16.0
  - @memberjunction/ng-dashboard-viewer@5.16.0
  - @memberjunction/ng-file-storage@5.16.0
  - @memberjunction/communication-types@5.16.0
  - @memberjunction/entity-communications-base@5.16.0
  - @memberjunction/core-entities@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/ng-core-entity-forms@5.15.0
  - @memberjunction/core@5.15.0
  - @memberjunction/ai-core-plus@5.15.0
  - @memberjunction/ai-engine-base@5.15.0
  - @memberjunction/actions-base@5.15.0
  - @memberjunction/ng-auth-services@5.15.0
  - @memberjunction/ng-explorer-core@5.15.0
  - @memberjunction/ng-shared@5.15.0
  - @memberjunction/ng-artifacts@5.15.0
  - @memberjunction/ng-dashboard-viewer@5.15.0
  - @memberjunction/ng-file-storage@5.15.0
  - @memberjunction/communication-types@5.15.0
  - @memberjunction/entity-communications-base@5.15.0
  - @memberjunction/graphql-dataprovider@5.15.0
  - @memberjunction/core-entities@5.15.0
