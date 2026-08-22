---
"@memberjunction/ng-ui-components": patch
---

Fix all five MJ form controls latching their disabled state at ControlValueAccessor registration.

`mj-dropdown`, `mj-combobox`, `mj-datepicker`, `mj-switch` and `mj-numeric-input` each computed their internal `IsDisabled` gate **only** inside `setDisabledState()`. Angular Forms calls that exactly once, when it registers the CVA (`setUpControl`, with the default `CALL_SET_DISABLED_STATE: 'always'`), and the `Disabled` input was a plain field with no setter and no `ngOnChanges` — so `IsDisabled` was permanently a snapshot of whatever `Disabled` happened to be at that instant, and every later change to the input was silently dropped. Both directions were broken:

- `Disabled` **true** at registration → the control stayed unusable forever, even after the binding went false. The control still rendered its disabled affordance, so it looked disabled while its own `Disabled` input read `false`.
- `Disabled` **false** at registration → the control could never be locked afterwards, so a read-only / receipt mode silently stayed editable.

The first direction is user-visible wherever a control is gated on "pick X first" (`[Disabled]="!draft.CompanyID"`): once the user picked the company, the control never came back to life. 47 dynamic `[Disabled]` bindings across this repo were affected, including `dynamic-form-field`, the renderer used by every generated entity form.

Each control now keeps the input-driven and forms-driven disabled states as separate backing fields and recomposes `IsDisabled` whenever either one changes. The two overlay controls (`mj-combobox`, `mj-dropdown`) also close an open panel when they become disabled, and do so without a nested `detectChanges()` — the recompose can run from an `@Input` setter, i.e. during the parent's change-detection pass, where re-entering CD trips NG0100 on the parent's bindings.

No API change: `Disabled` and `IsDisabled` keep their names, types and meanings — the composed state simply stays correct over the control's lifetime. Note that controls which previously stayed enabled after their binding went true will now correctly disable.
