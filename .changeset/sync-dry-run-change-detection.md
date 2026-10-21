---
"@memberjunction/metadata-sync": patch
---

`mj sync push --dry-run` now reports the same counts a real push would (#4529). The dry run used to report every existing record as "Would update". It now runs the same change detection as a real push (dirty fields, `alwaysPush`, checksum) before stopping, so an in-sync record counts as unchanged, and a changed record's field diff appears in the changes recap.
