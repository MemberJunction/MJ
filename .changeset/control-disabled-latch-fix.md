---
"@memberjunction/ng-ui-components": patch
---

Fix all five MJ form controls ignoring later changes to their `Disabled` input.

`mj-dropdown`, `mj-combobox`, `mj-datepicker`, `mj-switch` and `mj-numeric-input` each derive an internal `IsDisabled` gate, and the **only** thing that ever assigned it was `setDisabledState()` — the ControlValueAccessor hook. The `Disabled` input was a plain field with no setter and no `ngOnChanges`, so it had no recompute path of its own: the gate was frozen at whatever the first compose produced, and every later change to the input was silently dropped. Both directions were broken:

- `Disabled` **true** when the gate was last composed → the control stayed unusable forever, even after the binding went false. It still rendered its disabled affordance, so it looked disabled while its own `Disabled` input read `false`.
- `Disabled` **false** at that moment → the control could never be locked afterwards, so a read-only / receipt mode silently stayed editable.
- **No forms binding at all** → `setDisabledState()` is never called, so `[Disabled]` was completely inert: the control rendered fully enabled and responded to gestures regardless. This is the widest form of the defect — `Disabled` only ever worked as a side effect of a forms binding happening to compose it in.

The first direction is user-visible wherever a control is gated on "pick X first" (`[Disabled]="!draft.CompanyID"`): once the user picked the company, the control never came back to life. **20 dynamic `[Disabled]` bindings across this repo sit on these five controls** and were affected — including the five in `dynamic-form-field`, the renderer used by every generated entity form, which passes its own CVA-derived disabled state down into the inner controls.

Each control now keeps the input-driven and forms-driven disabled states as separate backing fields and recomposes `IsDisabled` whenever either one changes. The three overlay controls (`mj-dropdown`, `mj-combobox`, `mj-datepicker`) also close an open panel when they become disabled, and do so without a nested `detectChanges()` — the recompose can run from an `@Input` setter, i.e. during the parent's change-detection pass, where re-entering CD trips NG0100 on the parent's bindings.

No API change: `Disabled` and `IsDisabled` keep their names, types and meanings — the composed state simply stays correct over the control's lifetime. Note that controls which previously stayed enabled after their binding went true will now correctly disable.
