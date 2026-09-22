---
"@memberjunction/ng-ui-components": patch
---

The icon picker fetches each Font Awesome style before measuring it.

Which font holds a given glyph is measured, because nothing in the CSS says it — but
canvas can only measure a font the browser has already fetched, and a browser fetches a
web font when the page first uses one. An app that draws solid icons has the solid font
and neither of the others, so every brands and regular icon measured as missing and was
dropped: `accusoft`, `angular`, `apple` and several hundred more simply were not there.

`document.fonts.load` now runs for each style first, and a style whose font never
arrives is dropped whole rather than measured — measuring it would quietly halve the
catalogue again. The grid says it is reading while that happens, instead of showing a
short list and then replacing it.
