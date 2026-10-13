---
'@memberjunction/ng-base-forms': patch
---

The IS-A related-records side panel (`<mj-isa-related-panel>`) now re-discovers a record's subtypes
when the form leaves edit mode. Creating a record together with its subtype in one save left the
panel empty — the record plainly had a Dog, the panel said it had nothing — until the user pressed
the in-app Refresh. The panel only re-asked on a new `Record` object (which the form deliberately
does not swap across a save of the same record) or on `Refreshed$` (reached only from the Refresh
button). Leaving edit mode is the third trigger; on a disjoint hierarchy it walks the in-memory
`ISAChild` chain and issues no query.
