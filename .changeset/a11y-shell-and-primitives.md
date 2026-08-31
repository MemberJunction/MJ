---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-ui-components": patch
"@memberjunction/ng-shared-generic": patch
"@memberjunction/ng-whiteboard": patch
---

Accessibility: shell landmarks + skip link, focus containment, and nameable primitives.

Fixes nine WCAG 2.1 A/AA findings raised against the Explorer shell and shared primitives.

**Shell (`ng-explorer-core`)**

- Adds a "Skip to main content" link as the first focusable element in the shell, and marks the routed content region as the `main` landmark (`role="main"`, focusable target). **Consuming apps that added their own skip link should remove it on upgrade** — the shell's now comes first in DOM order, and two stacked skip links is worse than none.
- The global search input, the account/avatar button and the mobile-nav toggle now carry real accessible names. The avatar's name lives on the button, so it survives the icon-fallback path when the avatar image fails to load.
- The closed mobile nav drawer and the closed search popup are now `inert` and `visibility: hidden` (transitioned so the slide-out still animates). They previously kept every control inside them in the tab order while closed. When the drawer closes with focus inside it, focus returns to the toggle instead of dropping to `<body>`.
- The command palette already had `role="dialog"`/`aria-modal`; it now also traps Tab while open and returns focus to whatever was focused when it opened. `aria-modal` never stopped Tab on its own.

**`mj-combobox` (`ng-ui-components`)**

- New `AriaLabel`, `AriaLabelledBy`, `AriaDescribedBy` and `InputId` inputs on the inner text input, mirroring the naming contract `mj-dropdown` gained in #3863 so the two sibling controls do not diverge. Unlike the dropdown's `div[role=combobox]` trigger, this component's focusable element is a native `<input>`, so a real `<label for>` plus `InputId` is the preferred route and needs no aria attribute; `AriaLabelledBy` / `AriaLabel` cover the no-label case.
- `mj-dropdown`'s own accessible name landed separately in #3863 and is not part of this changeset.

**Focus-ring tokens (`ng-shared-generic`)**

- New `--mj-focus-ring-color` companion to `--mj-focus-ring`. `--mj-focus-ring` is a two-part box-shadow value: `outline: 2px solid var(--mj-focus-ring)` looks correct, parses, and renders nothing. Use `--mj-focus-ring` in `box-shadow` and `--mj-focus-ring-color` in `outline`. A new `check:focus-ring` gate fails on the broken form.

**Whiteboard (`ng-whiteboard`)**

- The eleven bare single-character tool shortcuts (`v h p r s t m w i c e`) listened on `document` and fired anywhere on the page, failing WCAG 2.1.4. They are now scoped to focus being inside the whiteboard host, which is made click-focusable for that purpose. Scoping covers the host's whole keydown handler, so undo/redo (`Cmd/Ctrl+Z`, `+Y`), `Escape` and `Delete`/`Backspace` are focus-gated too — a board that swallows the document's `Cmd+Z` from anywhere on the page is its own bug. **Behavior change**: none of these fire while focus is elsewhere on the page. `EnableGlobalShortcuts` restores the old behavior for surfaces that accept the exposure.
