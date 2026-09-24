---
"@memberjunction/ng-ui-components": minor
"@memberjunction/ng-base-forms": patch
---

`mj-icon-picker` — choose a Font Awesome icon by looking at it.

Typing a class name asked the user to recall it exactly AND to know that Font Awesome
needs a style class beside it. `fa-chart-column` alone matches a rule that sets a glyph
but no font family, so nothing renders — which reads as a broken panel rather than as a
value missing a word. The placement dialog's own placeholder taught that mistake.

The picker searches the icons the page has actually loaded, by scanning the loaded
stylesheets for the rules that attach a glyph. The catalogue is therefore whatever Font
Awesome the host really has, rather than a list in source that drifts from it.

Each icon carries the style that draws it. Font Awesome splits its icons across several
fonts and gives them all the same kind of CSS rule, so a name alone is not enough — a
brands icon drawn as solid renders as a missing-glyph box, which is half a grid of empty
squares. Which font holds a glyph is written down nowhere, so it is measured: a glyph a
font lacks falls back and measures exactly as it does with no Font Awesome at all. An
icon no loaded font has is dropped rather than offered.

The grid opens in a CDK overlay. Anchored inside the field it sat in whatever scrolling
box the host had, widened it, and left the surrounding panel scrolling sideways — a
picker must not resize the form it is part of.

A stylesheet served without CORS headers cannot be read from script, so a short fallback
list covers that; the text box stays either way, for a user who knows the name and for a
value arriving from elsewhere.

`NormalizeIconClass` completes a bare name, and a contribution panel runs its stored icon
through it, so rows written before this renders rather than each needing to be edited. A
value that already names a style is left alone, including the one-class `fa fa-folder`
form the generated forms use.
