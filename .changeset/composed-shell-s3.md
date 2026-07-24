---
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-ui-components": minor
---

Composed shell SLICE-S3: the Front Door landing surface (`mj-shell-front-door`) — hero
composer (real mj-message-input in empty-state mode; send creates the conversation and
auto-sends via the pinned pendingMessage contract), Needs-you (pending agent requests +
failed runs, capped at 3 with inline All/Show-less expand), Continue (recent-conversation
cards), Ran overnight (routine runs), loading/error/first-run states. "New conversation"
now lands on the Front Door (the shell's one starting surface). Fixed the frame's
conversationCreated round-trip so empty-state first-sends deliver. Shell-wide
token-normalization pass (spacing/type/radius/shadow onto --mj-* tokens). ui-components
gains `.mj-input--sm` — a 32px compact input variant height-matched to `mjButton size="sm"`
for toolbars — applied to the shell's filter inputs; InputDialogComponent gets the standard
dialog content inset and inter-field spacing.
