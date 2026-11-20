---
"@memberjunction/ng-ui-components": patch
---

Expose Tier 3 `--mj-button-*` CSS custom properties across `mjButton` (`button.scss`), fix focus-ring and reduced-motion defects, and add `[FullWidth]` and `[Disabled]` inputs on `MJButtonDirective`:

- Every visual value in `button.scss` now reads `var(--mj-button-<...>, <stock default>)` across base, `sm`, `lg`, disabled, motion, `selected`, and all eight variants (`primary`, `secondary`, `outline`, `flat`, `danger`, `success`, `warning`, `icon`), unset on `:root` per `plans/ui-foundation/NAMING.md` so container-scoped overrides resolve on the button element.
- Wrap `:not(...)` exclusions on hover and active rules in `:where()`, lowering specificity from `(0,7,0)` to `(0,2,0)` so `:focus-visible` retains its focus ring when a focused button is hovered and downstream `.mj-btn:hover` rules no longer lose to a 7-class selector.
- Gate spatial `transform` lift/press behind `@media (prefers-reduced-motion: no-preference)` and add a `forced-colors: active` outline fallback on `:focus-visible`.
- Add `[FullWidth]="true"` (`.mj-btn--full`) and `[Disabled]="true"` (`aria-disabled="true"`, `tabindex="-1"`, and pointer/keyboard suppression on `a[mjButton]`, forwarding cleanly on `<button>` without clobbering existing lowercase `[disabled]` bindings).
- Resolve button height into private `--_mj-button-height` so `Shape="circle"` tracks custom button heights across sizes and `pointer: coarse`, and point `.mj-btn-group` outer corners at `--mj-button-radius`.
