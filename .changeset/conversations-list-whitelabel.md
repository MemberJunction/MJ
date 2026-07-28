---
"@memberjunction/ng-conversations": minor
---

White-label theming + chrome toggles for the conversation list panel. Nine new public design tokens (`--mj-chat-list-{bg,ink,hover-bg,active-bg,active-ink,active-hover-bg,accent,accent-ink,accent-hover}`) let a host remap the list off the stock brand-secondary rail and onto surface tokens so it matches the chat area; hover, border, divider, preview, badge, and placeholder tints all derive from the ink (or the active-row ink) via `color-mix`, so they follow a remap automatically. They resolve in the component's `:host` onto private `--conv-list-*` names — a custom property cannot name itself in its own fallback without forming a cycle, so the two-name indirection is required rather than stylistic.

Four chrome toggles (`showSearch`, `showNewConversationButton`, `showHeaderMenu`, `showSectionHeaders`, all default `true`) remove list chrome for embedded and end-user surfaces; the header strip drops out entirely when nothing would occupy it, and `showSectionHeaders=false` renders a flat, fully-expanded list. `mj-conversation-sidebar` passes all four through and now re-emits the list's `(conversationDeleted)` and `(refreshRequested)` outputs, which previously died at the sidebar boundary.

Defaults are unchanged with one exception: the rename-flash keyframes were hardcoded `rgba()` values that ignored theming entirely (inline `styles:` blocks in `.ts` files escape the repo's CSS token gate) and now run on brand/status tokens at the same alpha ramp — same animation, theme-following hue.
