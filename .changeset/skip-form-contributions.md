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
"@memberjunction/ng-ui-components": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Form contributions can be metadata rows, not only compiled panels, and users can place, share, hide and remove them from the form itself.

**Contributions from metadata.** A `MJ: Entity Form Contributions` row (migration `V202609301051__v6.2.x__Entity_Form_Contributions`) mounts a `MJ: Components` row (`Type='Widget'`, spec `componentRole: 'form-panel'`) on an entity's form. It carries the same registration bag as `@RegisterClassEx` plus `Presentation`, `Title`, `Icon`, `Configuration`, `Precedence` and User/Role/Global scope. `CollectFormContributionRegistrations` merges rows with class registrations, so the composer, slot hosts and chrome layers treat both as peers; compiled wins a tie on the same `ContributionKey`. `InteractiveFormsEngine` caches the rows (`Contributions`, `Contributions$`, `GetApplicableContributions`) and `InteractiveFormPanelComponent` renders them. Rows on identity and authorization surfaces are dropped at Role or Global scope. A kill switch turns the source off: the `Forms.MetadataContributions.Enabled` instance configuration in Explorer (applied by the shell at startup), and `MJ_FORMS_METADATA_CONTRIBUTIONS=false` on Node hosts.

**What a panel can stand in for.** One claim per row, enforced by the database: a related grid, one or several field sections (`ReplacesSectionKey`, `ReplacesSectionKeys`), a group of fields (`ReplacesFieldNames`, rendered once inside that section), or a place inside a section (`InSectionKey` + `SectionPosition`). A compiled panel now renders at the slot it registered for, and a panel standing in for something takes its place.

**Authoring.** New actions `Create Form Contribution`, `Modify Form Contribution`, `Activate Form Contribution Version`, `Get Form Contributions For Entity` and `Get Form Composition For Entity`; agent writes are clamped to `Scope='User'`. The artifact viewer previews a form-panel spec and offers **Add to my form**, which opens a placement dialog: the entity's real form, read-only and scaled, with the panel drawn where it will go, the positions the form actually has, order within a position, what it replaces, and draft or active. New `mj-icon-picker` (`@memberjunction/ng-ui-components`) chooses a Font Awesome solid or regular icon by looking at it.

**Managing a form.** A "Manage this form" drawer lists the form choice and every panel. Any user can turn off, hide or remove their own panels; publishing a panel or a full custom form to a role or everyone needs the new `Manage Form Defaults` authorization (Developer and Integration; owners count). `MJEntityFormContributionEntityServer` and `MJEntityFormOverrideEntityServer` enforce it on every save and delete; `UserCanManageFormDefaults` is the same check for UI code. Two custom forms for one entity are alternatives, not versions; a full custom form (`OwnsEntireFormBody`) takes no panels or fill-in grids; `Get Form Composition For Entity` answers for the form the caller actually sees.

**Form context.** The record container publishes a composition snapshot (sections, related grids, contributions, slots). The record tab forwards it to the agent context, and the apply path uses it to check what a panel replaces.

**Section counts and empty sections.** A saved record fetches every related-section count and the tag, attachment and version badges in one `RunViews` call; an all-`count_only` batch runs as one `UNION ALL` statement in `GenericDatabaseProvider`, with each view's security path intact. New `whenEmpty` (`'show'` default | `'hide'` | `'more'`) and `showCount` on `EntityRelationship.Configuration.UI` and on contributions, with entity defaults `UI.Form.RelatedWhenEmpty` and `UI.Form.ShowRelatedCounts`.

**Fixes.** Eleven panel registrations that never mounted now do (six named their entity without `MJ: `, five used a `slot: 'header'` that is not a `FormPanelSlot`). CodeGen no longer corrupts generated validators that contain escapes.

**Deploy order:** deploy the server code before pushing the metadata. The metadata gives the UI role write access to `MJ: Entity Form Contributions` and `MJ: Entity Form Overrides`, and only the new server subclasses keep that access to the user's own rows.
