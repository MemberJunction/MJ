---
"@memberjunction/codegen-lib": patch
---

Remove the dead `innerTabStripHTML` generator path.

It was deprecated in favour of `innerCollapsiblePanelsHTML` and has had **zero call sites** since `6f88c60dee` — both HTML entry points call the collapsible path, and no config option selects a tabstrip layout. It was also internally incoherent: every `TabCode` producer now emits `<mj-collapsible-panel>`, while `MJTabStripComponent` finds its children via `@ContentChildren(MJTabComponent)`, so calling it would have produced an empty strip. Left in place it was a live trap — a downstream subclass could still reach it, and the markup it emitted now sizes to content after `ng-tabstrip` stopped hardcoding viewport height. No generated form has contained `<mj-tabstrip>` since that switch, so deleting it changes no output.
