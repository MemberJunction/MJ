---
"@memberjunction/ng-base-forms": minor
---

A simpler record toolbar on every form. Edit is an icon button. Each user chooses up to three actions to pin as buttons (`MaxPinnedActions`), saved once per user and shared by every form; nothing is pinned by default. The other actions are in a More panel, with Delete set apart at the end. Section and layout controls and the form-variant picker move into a View panel; an active section filter stays visible as a clearable chip. The IS-A breadcrumb gets its own row. Custom registered items stay inline unless they set `Pinnable: true`.

Both panels are disclosure panels (the trigger has `aria-expanded` and `aria-controls`): opening one moves focus into it, Escape closes it and returns focus to its button, and every control in them, including the form-variant rows, is a keyboard-reachable button.
