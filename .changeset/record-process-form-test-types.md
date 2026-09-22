---
"@memberjunction/ng-core-entity-forms": patch
---

Pin the RecordProcessFormPolicy group ordering: the reorder lifts `processOverview` to the lead
position and leaves every other group in its original order. The existing tests only asserted that
`processOverview` ends up first, which a sort-based implementation would also satisfy while
quietly shuffling the groups behind it.
