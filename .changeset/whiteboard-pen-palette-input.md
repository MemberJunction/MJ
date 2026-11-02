---
"@memberjunction/ng-whiteboard": patch
---

The whiteboard host gains a `PenPalette` input (LXP P14.3). The pen palette was a closed constant led by pale slate, tuned for MJ's dark canvas and near-invisible on a light host theme, and it was also the default pen; a host could remap the stroke with a CSS attribute selector on the hex, but the toolbar swatch still showed slate.

- `[PenPalette]` on `<mj-realtime-whiteboard-host>` (array of hexes; `null` keeps the five MJ colors) is threaded to the toolbar, whose `PenColors` is now an input. When a palette arrives that excludes the current pen color, the pen moves to the palette's first entry. A non-array reads as no palette, the same defensive rule as `ToolRoster`; blank and non-string entries are dropped and a palette with nothing usable reads as none. Membership is compared case-insensitively, so a host's `#1D4ED8` keeps a pen holding `#1d4ed8`.
- An input rather than CSS custom properties on purpose: ink items persist the chosen hex, so a `var()` palette would make saved boards theme-dependent. MJ's default palette is unchanged.
