---
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-shared": patch
"@memberjunction/ng-explorer-core": patch
---

Fix two new-record form lifecycle issues in MJ Explorer: add an entity-name discriminator to the component cache key so distinct "new record" tabs of different entities no longer collide (clicking "+ New Record" on one entity after opening another no longer reuses the wrong form), and close the tab when the user clicks Discard on a never-saved record (via a new 'dismiss' FormNavigationEvent kind that destroys the cached component so the next "Create New Record" click for the same entity gets a fresh edit-mode form instead of the stale view-mode one).
