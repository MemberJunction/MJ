---
"@memberjunction/ng-explorer-core": patch
---

The My Profile dialog fits the screen and scrolls.

The identity card sized itself with `height: 100%` through four ancestors, the outermost of which is
`.mj-dialog-container` — opened by `ProfileDialogService` with a width and no height, so it keeps
`height: auto` and only `max-height: 90vh`. A percentage height resolves against a definite
containing block and `max-height` does not make one, so on the block path the card's height computed
to `auto`, it grew past the viewport, and its own `overflow: hidden` CLIPPED the excess rather than
letting the scroll region inside it take over. The lower half of the card — the notification
channels, the footer, Sign out — was unreachable on a short window.

The card now bounds itself at `100dvh` (with `100vh` first as the fallback) so it cannot exceed the
screen whatever an ancestor resolves to, and lays its children out with flex instead of percentages.
`.mj-profile__main` takes `flex: 1; min-height: 0` in place of `height: 100%`, which is what lets it
shrink below its content so the regions that already declare `flex: 1; min-height: 0; overflow-y:
auto` — `.mj-profile__section` and `.mj-profile__panel-body` — actually get a bounded height to
scroll within.

This is the same failure #4351 fixed for the user menu, one layer out: that was the dropdown under
the avatar, this is the dialog it opens.
