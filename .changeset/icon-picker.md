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
Awesome the host really has, rather than a list in source that drifts from it and offers
icons that render as blank squares. A stylesheet served without CORS headers cannot be
read from script, so a short fallback list covers that; the text box stays either way,
for a user who knows the name and for a value arriving from elsewhere.

`NormalizeIconClass` completes a bare name, and a contribution panel runs its stored icon
through it, so rows written before this renders rather than each needing to be edited. A
value that already names a style is left alone, including the one-class `fa fa-folder`
form the generated forms use.
