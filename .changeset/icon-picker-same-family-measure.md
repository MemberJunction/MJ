---
"@memberjunction/ng-ui-components": patch
---

The icon picker measures each font on its own, and says what it found.

Font Awesome Free ships two faces under ONE family name — solid at weight 900 and
regular at 400. A glyph missing from the requested weight is drawn from the other face
before any fallback is reached, so comparing the width against a second font stack read
that as a hit. The glyph is now compared against a codepoint no icon font defines,
measured in the same family with nothing behind it, so "the font has this" and "the
browser drew a box" can no longer look alike.

The note under the grid now breaks the catalogue down by style — `1,662 solid · 593
brands · 340 regular`. A catalogue that is all one style means the other fonts were never
measured, which was otherwise invisible until someone searched for an icon that was not
there.
