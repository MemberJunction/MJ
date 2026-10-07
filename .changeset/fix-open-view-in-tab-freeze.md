---
"@memberjunction/ng-explorer-core": patch
---

Opening a saved view in its own tab no longer freezes Explorer.

`NavigationService.OpenView` stores the prefixed resource type (`MJ: User Views`) in the tab configuration. The loaded view component carries the stored ResourceType row name (`User Views`). `syncTabsWithConfiguration` compared the two exactly, so it saw every configuration emission as a content change. It then tore the tab down and reloaded it, and that reload emitted again, so the page never yielded.

The reload check now uses `TabContainerComponent.IsSameResourceType`, which ignores case and the `MJ: ` prefix. This is the same rule `findResourceTypeTolerant` already used to resolve the type. A tab that points at a different view or a different type still reloads.

Dynamic views (`NavigationService.OpenDynamicView`, e.g. `#Accounts` from the omnibar) all share the record ID `'dynamic'`, so the reload check now also compares the tab's `Entity`: opening `#Contacts` into a tab showing `#Accounts` reloads it instead of retitling the tab over the Accounts grid. `ComponentCacheManager` folds the entity into its key for the `'dynamic'` marker too, as it already did for an empty record ID. Without that, every dynamic view in an app shared one cache entry, so the reload was handed back the Accounts component it had just detached, and closing a dynamic tab left its component to be reused by the next dynamic view of any entity.
