---
"@memberjunction/codegen-lib": minor
"@memberjunction/core": minor
"@memberjunction/core-actions": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/interactive-component-types": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-shared": minor
"@memberjunction/ng-ui-components": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Form contributions can be metadata rows, not only compiled panels, and users can place, share, hide and remove them from the form itself.

**Contributions from metadata.** A `MJ: Entity Form Contributions` row (migration `V202609301051__v6.2.x__Entity_Form_Contributions`) mounts a `MJ: Components` row (`Type='Widget'`, spec `componentRole: 'form-panel'`) on an entity's form. It carries the same registration bag as `@RegisterClassEx` plus `Presentation`, `Title`, `Icon`, `Configuration`, `Precedence` and User/Role/Global scope. `CollectFormContributionRegistrations` merges rows with class registrations, and the form collapses the list once per resolve (`ResolveFormContributionWinners`): one winner per `ContributionKey`, the higher rank wins, a compiled panel wins a tie against any row, and between rows `User` beats `Role` beats `Global` (`FormContributionOutranks`). `CollectFormPanelRegistrations` stays as a deprecated wrapper that returns compiled registrations only. Wildcard (`'*'`) registrations take part on every form, but their place claims are ignored. `InteractiveFormsEngine` caches the rows (in the browser, the shared ones and the signed-in user's own) and fetches each panel component by ID once (`GetComponentByID`); `InteractiveFormPanelComponent` renders them, and a panel can change only the fields it claims, in edit mode. On the 11 identity, permission and form-metadata entities in `RESTRICTED_FORM_ENTITIES`, only `User` rows and full custom forms render.

**One rule set, shared by the browser and the server.** The contribution key is derived once (`ResolveContributionWriteKey` in `@memberjunction/interactive-component-types/forms`). `@memberjunction/core-entities` `custom/FormScope/` holds the spec-to-row mapper (`ApplyContributionSpecToRow`), the claim validator (`ContributionClaimRefusal`), the scope rules (`FormScopeWriteRefusal`, which normalizes Scope and fails closed, `IsCanonicalFormScope`, `ContributionScopeRank`, `FormContributionOutranks`, `IsSelectableFormOverride`, `FormScopeAllowedOnEntity`, `UserCanManageFormDefaults`), the hide-setting key helpers, and the retire rule (`ActiveContributionSiblings`, which compares keys ignoring case as the SQL Server unique index does).

**What a panel can stand in for.** One claim per row, enforced by the database: a related grid, one or several field sections (`ReplacesSectionKey`, `ReplacesSectionKeys`), a group of fields (`ReplacesFieldNames`, rendered once inside that section), or a place inside a section (`InSectionKey` + `SectionPosition`). A compiled panel renders at the slot it registered for, and a panel standing in for something takes its place. The `top-area` slot is accepted by the CHECK constraint but no form emits it, so the placement dialog does not offer it.

**Authoring.** New actions `Create Form Contribution`, `Modify Form Contribution`, `Activate Form Contribution Version`, `Get Form Contributions For Entity` and `Get Form Composition For Entity`. The write actions, and the existing Modify / Activate / Revert Interactive Form actions, change only the caller's own `User` rows; a `Role` or `Global` row returns `FORBIDDEN` for every caller. A spec with more than one claim returns `INVALID_CLAIM` before any write. The contribution actions write the Component and the row in one transaction, and so do the Modify and Activate Interactive Form paths for a full form's Component and override; Create and Revert Interactive Form do not. `Modify Form Contribution` accepts an optional `Precedence`. `Get Form Composition For Entity` answers for the form the user sees (hidden panels, restricted entities, the same collapse) and returns `QUERY_FAILED` when a query fails. The artifact viewer previews a form-panel spec and offers **Add to my form**, which opens a placement dialog: the entity's real form, read-only and scaled, with the panel drawn where it will go, the positions the form actually has, order within a position, what it replaces, and draft or active. New `mj-icon-picker` (`@memberjunction/ng-ui-components`) chooses a Font Awesome solid or regular icon by looking at it.

**Managing a form.** A "Manage this form" drawer lists the form choice and every panel; Escape closes it and focus stays inside it. Any user can turn off, hide or remove their own panels. Publishing a panel or a full custom form to a role or everyone needs the new `Manage Form Defaults` authorization (Developer and Integration; owners count). `MJEntityFormContributionEntityServer` and `MJEntityFormOverrideEntityServer` enforce it on every save, replayed save and delete. Turning a panel on, or publishing it, retires the Active sibling for the same audience and key in the same transaction and sets the panel component's status, so the caller also needs update rights on `MJ: Components`. Publishing a draft, an off panel or a set-aside form turns it on, and the chooser says so. A set-aside (`Inactive`) shared form is retracted; a set-aside personal form stays in its owner's picker. The placement preview never saves form state.

**Form context.** The record container publishes its full composition snapshot to `FormCompositionRegistry` (`@memberjunction/ng-base-forms`), where the apply path reads it. Agents get a compact `FormAgentContext` in `AdditionalContext.Form` (entity, record key, form choice, and each section's key, title, variant, hidden flag and holding contribution), published by the record tab while it is the tab on screen. `RecordPrimaryKey` is a `CompositeKey.ToURLSegment()` string, or null for an unsaved record. The `SkipFormContext` mirror in `@askskip/types` must follow this shape.

**Kill switch.** `MJ_FORMS_METADATA_CONTRIBUTIONS=false` turns rows off on Node hosts. In Explorer, the `MJ: Instance Configurations` key `Forms.MetadataContributions.Enabled` set to `false` turns them off; the shell applies it after `InstanceConfigEngine.Config()` and before any form opens. It can only turn the source off, the source stays on when Instance Config fails to load, and the seed row reaches a database through `mj sync push`.

**Section counts and empty sections.** A saved record fetches every related-section count and the tag, attachment and version badges in one `RunViews` call; an all-`count_only` batch runs as one `UNION ALL` statement in `GenericDatabaseProvider`, with each view's security path intact. New `whenEmpty` (`'show'` default | `'hide'` | `'more'`) and `showCount` on `EntityRelationship.Configuration.UI` and on contributions, with entity defaults `UI.Form.RelatedWhenEmpty` and `UI.Form.ShowRelatedCounts`.

**Fixes.** Eleven compiled panel registrations never mounted: all eleven named their entity without the `MJ: ` prefix, and five of them also used `slot: 'header'`, which is not a `FormPanelSlot`. They now mount, which turns on the hero header and overview cards on `MJ: Users`, `MJ: Companies`, `MJ: Employees`, `MJ: Conversations` and `MJ: AI Agent Categories` (header above the overview), and the realtime panel on `MJ: AI Agents`. CodeGen no longer corrupts generated validators that contain escapes, and a table-level validator's metadata guard includes the validator's `Name`.

**Behaviour changes to know about.** `BaseFormPanel.Validate()` now runs on Save (through `BaseFormComponent.ValidateAsync()`) and may return a Promise. After upgrade, editing or deleting an existing `Role` or `Global` full custom form needs `Manage Form Defaults`, and an `mj sync push` of `Global` rows needs a sync user who holds it or is an Owner. Every `mj-form-field` carries `data-field-name` and `data-field-label`. Collapsible-panel move up/down follows the visual order. New user setting `mj.formPanels.hidden.<entity>`; the existing `mj.formVariant.<entity>` is also read by `Get Form Composition For Entity`. `ng-conversations` gains a type-only dependency on `ng-base-forms`.

**PostgreSQL.** `UQ_EntityFormContribution_Key` and `UQ_EntityFormContribution_RelatedClaim` include nullable columns (`UserID`, `RoleID`, `RelatedJoinField`). SQL Server treats NULLs as equal in a unique index; PostgreSQL does not, so the converted indexes need `NULLS NOT DISTINCT` (PostgreSQL 15+) or a `COALESCE` expression index to refuse the same duplicates. PostgreSQL also compares the key case-sensitively, so there the case-insensitive retire rule is stricter than the index.

**Deploy order:** deploy the server code before pushing the metadata. The metadata gives the UI role write access to `MJ: Entity Form Contributions` and `MJ: Entity Form Overrides`, and only the new server subclasses keep that access to the user's own rows. A development database that already ran an earlier copy of the migration needs a Flyway repair or a rebuild.
