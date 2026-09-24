---
"@memberjunction/core-entities": minor
"@memberjunction/interactive-component-types": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/core-actions": minor
---

Form contributions can now be metadata rows, not only compiled panels. A `MJ: Entity Form Contributions` row points an entity's form at a `MJ: Components` row (`Type='Widget'`, spec `componentRole: 'form-panel'`) and carries the same registration bag as `@RegisterClassEx` plus `Presentation`, `Title`, `Icon`, `Configuration` and User/Role/Global scope. `CollectFormContributionRegistrations` merges rows and class registrations into one list, so the composer, slot hosts and chrome layers treat the two sources as peers — compiled wins a tie on the same `ContributionKey`.

`InteractiveFormsEngine` caches the rows and exposes `Contributions`, `Contributions$` and `GetApplicableContributions`. Contributions on identity and authorization surfaces are dropped at Global or Role scope when a form resolves them, whatever wrote the row. `MJ_FORMS_METADATA_CONTRIBUTIONS=false` disables the source outright in a running process.

New actions: `Create Form Contribution`, `Modify Form Contribution`, `Activate Form Contribution Version`, `Get Form Contributions For Entity`. Every write is clamped to `Scope='User'`. The artifact viewer previews a form-panel spec and offers **Add to my form**, which routes through those actions and honours the live form composition when deciding whether a `replacesSectionKey` matches and whether an installed contribution is being replaced.

Also repairs eleven existing panel registrations that never mounted — six named their entity without the `MJ: ` prefix, and five used a `slot: 'header'` that was never a member of `FormPanelSlot` — and restores the left-nav gap between a form hero, its overview strip and the active panel.
