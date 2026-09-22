---
"@memberjunction/ng-ui-components": patch
---

The icon picker offers no brands icons.

They are company logos — Angular, Apple, Amazon Pay — and a section header or a rail
label is not a place for one. Six hundred of them also bury the icons that do belong
behind names nobody is searching for. The brands font is no longer probed, fetched or
measured.

Excluded from what is OFFERED, not from what renders: `fa-brands` is still a style
`NormalizeIconClass` leaves alone, so a brands class already stored, or typed by hand,
still draws.

The per-style count under the grid is gone with it. A count of what loaded correctly is
noise on every open; the one case worth saying is when the stylesheet could NOT be read,
which is why a name the user expects would be absent, and that notice stays.
