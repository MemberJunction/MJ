---
"@memberjunction/ng-conversations": patch
---

Fix Save-to-Collection dialog so a new collection can be created from the empty state. Previously the "Create new collection…" affordance only rendered inside the collection tree, which is hidden when the user has no editable collections — leaving no way to create the first one.
