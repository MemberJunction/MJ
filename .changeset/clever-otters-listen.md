---
"@memberjunction/ng-entity-viewer": patch
---

Fix saved views not appearing in the view selector until a page reload. The selector now reacts to UserViewEngine cache changes via ObserveProperty, so created/updated/duplicated/deleted views refresh the dropdown immediately, eliminating the stale-cache race after a save.
