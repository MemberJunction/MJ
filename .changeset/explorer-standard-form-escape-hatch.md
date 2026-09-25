---
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-shared": patch
"@memberjunction/ng-explorer-core": patch
---

Explorer: a record shown in a custom form can now be opened in the standard (CodeGen) form, and an entity view can create a record directly in the standard form (MJ#4755).

- `<mj-entity-form-host>` shows a slim "Open standard form" / "Back to custom view" strip whenever a custom class form or an interactive override hides the generated form. New `FormMode` input, `FormModeChange` output, `ShowFormModeSwitch` opt-out. Refuses to switch a saved record that has unsaved changes; a new, unsaved record switches and keeps the values already entered.
- `FormResolverService.ResolveStandardForm()` + `HasStandardFormAlternative()`; `FormResolution` carries `standard`.
- Explorer: `NavigationOptions.formMode: 'standard'` and the `?form=standard` record deep link. The mode is the record tab's `form` query param, which round-trips through the URL, back/forward and tab re-focus, including switches made with the in-form strip (applied to an already-open tab too, through the host's unsaved-work guard). Entity views offer "New in standard form" when a custom form exists and the user can create.
