---
"@memberjunction/ng-explorer-core": patch
---

The My Profile dialog fits the screen and scrolls.

`ProfileDialogService` opens the dialog with a width and no height, so `.mj-dialog-container` is
`height: auto` with `max-height: 90vh`, and the boxes between it and the card are shrinkable flex
items. That already bounded the card at 90vh. What it could not bound was `.mj-profile__main`: the
card was `display: block`, so `__main`'s `height: 100%` had no definite height to resolve against,
computed to `auto`, and grew to its full content. The card's `overflow: hidden` then clipped the
bottom of it — the notification channels, the footer, Sign out — with nothing left to scroll.

The fix is a flex chain. The card is now a flex column, `.mj-profile__main` takes `flex: 1;
min-height: 0` in place of `height: 100%`, and one new `.mj-profile__scroll` region (`flex: 1;
min-height: 0; overflow-y: auto`) wraps the field list and the Command Palette and Notifications
sections. The hero, avatar, identity and footer hold their size, the footer stays pinned, and only
the settings rows scroll. The sections no longer scroll on their own: as two peer scrollers they
split the leftover height, each shrank to its padding on a short window, and Sign out went out of
reach again. With one region the only floor left is the fixed parts themselves — hero, avatar,
identity and footer — so the footer clips only on a window shorter than roughly 335px.

The card also caps itself at `max-height: 100dvh` (`100vh` first as the fallback), but that is only
a backstop. On desktop it never binds, because the container's 90vh is tighter. It can bind on a
phone, where the dialog forces the container to `height: 100vh` and a dynamic browser toolbar can
make `100dvh` shorter.

This is the same failure #4351 fixed for the user menu, one layer out: that was the dropdown under
the avatar, this is the dialog it opens.
