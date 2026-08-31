---
'@memberjunction/ng-explorer-core': patch
'@memberjunction/ng-whiteboard': patch
---

Fix two components that declared the same host event twice, silently disabling a handler.

Angular collects host listeners into an object keyed by event name, so a second
`@HostListener` for the same event **replaces** the first — no build error, no warning.

- `ShellComponent` declared `document:keydown` twice; the surviving handler did not
  handle the command-palette chord, so Ctrl/Cmd+/ never fired for the entire life of
  the feature.
- `WhiteboardHostComponent` had the same bug for `document:click`, killing the Sees
  dropdown's outside-click dismissal.

Adds a source-level guard test, because a behavioural test can only observe the
surviving handler — it cannot see that a second declaration clobbered the first.
