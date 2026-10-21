---
"@memberjunction/ng-ui-components": patch
---

`mjButton` gains a `Shape` input. `Shape="circle"` draws an icon-only button as a circle, as wide as it is tall (32, 44 or 52 px by `Size`; a small circle grows to 44 px on touch screens), for call controls such as a microphone, camera or leave button. It combines with any `Variant`, such as `danger` for a muted microphone. Dev mode warns when a circle has no accessible name, as it already does for the `icon` variant. The default shape is unchanged.
