---
"@memberjunction/standards": patch
---

ui-layers: let the manifest half of the layer ban carry a reviewed exception.

The source half honours an `mj-ui-layers-allow` comment, but `package.json` carries no comments, so a
package whose blessed import forces it to declare a banned dependency has no green state: declaring
the dep trips the manifest half, and dropping it breaks the build the blessed import still needs.

Packages can now declare `"mjUILayerAllow": { "<dep>": "<reason>" }`. The reason is required — a blank
one fails, and so does an entry that no longer excuses anything, so the allowlist has to shrink on its
own rather than rotting into a permanent pass.

The alternative already available — relabelling the package to a layer where the dependency is legal —
stays the right call when the package really does belong to that layer. This is for the narrower case:
a package that is genuinely widgets apart from one reviewed import, where a whole-package downgrade
would drop the widget rules from every other file in it.

No change to what any layer forbids.
