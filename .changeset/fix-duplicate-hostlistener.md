---
'@memberjunction/ng-explorer-core': patch
'@memberjunction/ng-whiteboard': patch
'@memberjunction/ng-dashboards': patch
---

Ctrl/Cmd+/ opens the command palette, and the whiteboard's Sees dropdown closes on an
outside click.

Two components declared the same host event twice, silently disabling a handler. Angular
collects host listeners into an object keyed by event name, so a second `@HostListener`
for the same event **replaces** the first — no build error, no warning.

- `ShellComponent` declared `document:keydown` twice; the surviving handler did not
  handle the command-palette chord, so Ctrl/Cmd+/ never fired for the entire life of
  the feature.
- `RealtimeWhiteboardHostComponent` had the same bug for `document:click`, killing the
  Sees dropdown's outside-click dismissal.

Both packages get a source-level guard test, because a behavioural test can only observe
the surviving handler — it cannot see that a second declaration clobbered the first.

With the chord live, Ctrl/Cmd+/ no longer collides with places that already used it:

- The shell leaves the chord to an element that already handled it, so Ctrl/Cmd+/ in a
  code editor toggles a comment without also opening the palette.
- Component Studio's shortcuts panel opens with `?` only, and Data Explorer's `/` filter
  shortcut ignores Ctrl/Cmd+/.

The palette could not be opened before, so two of its own bugs are fixed with it:

- It lists only the user's own apps — the same list Home, the app switcher and the
  omnibar show — instead of every app in the system.
- Its search row, now "Search everything", opens Search Results; nothing handled its
  event before. It shows only while the chrome shows search (`Shell.SearchBar.Enabled`),
  like the header search.
