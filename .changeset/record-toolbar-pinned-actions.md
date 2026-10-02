---
"@memberjunction/ng-base-forms": patch
---

A simpler record toolbar on every form. Edit is an icon button. Each user chooses up to three actions to pin as buttons (`MaxPinnedActions`), saved once per user (setting `mj.form.toolbar.pinnedActions`) and shared by every form; until a user chooses, Favorite and History are pinned (`DefaultPinnedActions`). The other actions are in a More panel, with Delete set apart at the end. Section and layout controls and the form-variant picker move into a View panel; an active section filter stays visible as a clearable chip, and a non-default form variant shows on the View button. The IS-A breadcrumb gets its own row. Custom registered items stay inline unless they set `Pinnable: true`.

Both panels are disclosure panels (the trigger has `aria-expanded` and `aria-controls`): opening one moves focus into it, Escape closes it and returns focus to its button (in the section search, the first Escape clears the text), and every control in them, including the form-variant rows and the IS-A breadcrumb badges, is a keyboard-reachable button with a visible focus ring.

What moves for users: Refresh, Clone, Lists, Tags and Attachments take two clicks unless pinned; Delete is always in More; section search is behind View.
