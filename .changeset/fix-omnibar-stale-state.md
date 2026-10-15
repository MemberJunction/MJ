---
'@memberjunction/ng-explorer-core': patch
---

Fix three stale-state bugs in the omnibar command palette.

- **Keyboard selection could target rows that were not rendered.** Arrowing could
  land on a recent row that was off screen.
- **A mode change now invalidates the row set outright.** A different provider
  answers a different question, so the previous list is not a stale approximation —
  it is the wrong list. (Typing `Admin` over a seeded `/` switches Go-to-App to
  Global Search; the app list must not survive.) Rows for the *same* mode are kept
  while the next fetch is in flight, which is conventional palette behaviour and
  avoids per-keystroke flicker.
- **A failed fetch now settles its generation.** The rejection previously escaped,
  leaving the spinner up forever and surfacing as an unhandled rejection, since the
  caller invokes it as `void fetchSuggestions(...)`.
