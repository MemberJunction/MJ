---
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-shared": patch
"@memberjunction/ng-explorer-core": patch
---

Explorer: a record shown in a custom form can now be opened in the standard (CodeGen) form, and an entity view can create a record directly in the standard form (MJ#4755).

- `<mj-entity-form-host>` shows a slim "Open standard form" / "Back to custom view" strip whenever a custom class form or an interactive override hides the generated form. New `FormMode` input, `FormModeChange` output, `ShowFormModeSwitch` opt-out. Refuses to switch a saved record that has unsaved changes, or a form in edit mode that holds pending related-record changes (for example a removed action on the AI Agent form); a new, unsaved record switches and keeps the values already entered.
- `FormResolverService.ResolveStandardForm()` + `HasStandardFormAlternative()`; `FormResolution` carries `standard`.
- Explorer: `NavigationOptions.formMode: 'standard'` and the `?form=standard` record deep link. The mode is the record tab's `form` query param, which round-trips through the URL, back/forward and tab re-focus, including switches made with the in-form strip (applied to an already-open tab too, through the host's unsaved-work guard). Entity views offer "New in standard form" when a custom form exists and the user can create.
- Fix (`ng-shared`): the tab identity guard no longer drops query-param writes (`UpdateQueryParams`) from a resource whose tab does not persist a driver class, and it compares record ids case-insensitively. Record tabs are the visible case: their query-param writes were always dropped before.
- Fix (`ng-shared`): opening a record that is already open from a URL (bare id) now focuses that tab instead of opening a second tab for the same record. Record-tab dedup matches ids the same way `RecordTabShowsRecord` does (`Field|value` and case insensitive).
- Fix (`ng-base-forms`): when `<mj-entity-form-host>` reloads while an earlier load is still in flight (a form switch, an input change, or destroy), only the newest load mounts. A superseded load no longer mounts a second form, registers a second save handler (which emitted `Saved` twice per save), shows its failure over the newer form, ends the newer load's loading state, or mounts after the host is destroyed.
