---
"@memberjunction/ng-base-forms": patch
---

Related-entity grid heights now budget the real rendered chrome: a reserve for AG Grid's horizontal scrollbar (which was clipping the last row mid-glyph whenever columns overflowed), the measured 49px toolbar and header rows, and the 4px of wrapper borders. Fixes both the clipped row and the needless vertical scrollbar on grids whose rows all fit.
