---
'@memberjunction/integration-engine': patch
---

Discovery now samples the source when a declared object has fields but no primary key. The read-path gate tested "declared with zero fields" — the wrong property for the decision it guards — so a fields-but-keyless object skipped sampling entirely and its key fell to the name-convention classifier, which on a parent-scoped child elects the parent's foreign key and collapses every child row in a parent onto one record. The gate now fires whenever the key is unknown; a declared key still skips. When the object already carries declared fields, only the proven key is adopted — re-sampled widths and types never overwrite declared ones.
