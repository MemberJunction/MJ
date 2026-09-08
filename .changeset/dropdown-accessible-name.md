---
"@memberjunction/ng-ui-components": patch
"@memberjunction/ng-test-utils": patch
---

MJDropdown can finally be given an accessible name (#3860)

`mj-dropdown` renders a `div[role="combobox"]` with no way to name it, so every one of the ~94 call
sites in this repo announced as "combobox, collapsed" with no hint of what it selects — WCAG 2.1
4.1.2 (Name, Role, Value). Four optional passthroughs close it, all applied to the popup listbox as
well as the trigger so both halves announce the same name:

- **`AriaLabelledBy`** — the id of a VISIBLE label, and the preferred wiring when one exists. Not
  `<label for>`: the trigger is a `div`, which label-for neither names nor focuses.
- **`AriaLabel`** — for when no visible label exists.
- **`AriaDescribedBy`** — hint and error text.
- **`InputId`** — an id on the trigger so other markup can reference it.

Absent beats empty: none of the four renders an attribute when unset, because `aria-label=""` is
worse than no attribute — it overrides every other naming source with an explicitly empty name.

The filterable panel's filter box is named from the same source rather than being a second unnamed
control. Under `AriaLabelledBy` it composes "Filter" with the visible label's own text through an
`aria-labelledby` id list, so six filterable dropdowns on one form no longer announce as six
identical "Filter options" boxes. A name that already begins with "Filter" (this repo's house habit,
e.g. `AriaLabel="Filter roles"`) is not prefixed again.

Also in the same attribute cluster:

- The trigger now points `aria-controls` at a generated listbox id while open — `aria-expanded`
  alone says something expanded without saying what.
- A disabled dropdown renders `aria-disabled` and leaves the tab order. Previously `tabindex` was
  static, and since the SCSS suppresses the focus ring when disabled, a keyboard user landed on
  something invisible that then silently ignored Enter.

**One visible change for existing `Filterable` callers:** the filter box's placeholder is now
"Filter..." rather than "Search...". This is deliberate — the accessible name is "Filter <name>", and
a visible "Search" that is not in the accessible name breaks WCAG 2.5.3 (Label in Name): a
voice-control user says "click Search" and nothing matches.

`StubDropdownComponent` in `@memberjunction/ng-test-utils` gains the same four inputs, keeping its
"mirrors the real inputs" contract true. Without it the first consumer spec binding `[AriaLabel]` on
a stubbed dropdown throws NG0303 under `errorOnUnknownProperties`, and a static attribute would land
silently as a vacuous pass.
