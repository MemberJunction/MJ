---
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-base-forms": minor
---

Two custom forms for one entity are alternatives, not versions of each other.

Applying a whole-form artifact used to rename it onto whatever form was already there and
push it into that form's version history. That is a merge: the new form lost its name and the
old one was buried inside the new one's lineage. A spec carrying the incumbent's own name is
still a new version of it; anything else now gets its own override, and activating it sets
the previous one aside with both rows intact.

The toolbar's form picker is where they swap. It lists the live form and the ones set aside —
the newest per form, not every version, and never an unfinished draft — and the resolver
honours a pick of a set-aside form, so choosing one renders it without a write.
