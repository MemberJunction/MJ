---
"@memberjunction/core-entities": patch
---

Fix saved views disappearing from the view selector ("No saved views yet") once an entity has a view shared by another user. `MJUserViewEntityExtended.CalculateUserCanView()` resolved the User Views resource type by `ResourceType.Name === 'MJ: User Views'`, but the seeded name is `'User Views'` (the `'MJ: '` value lives on `.Entity`), so the lookup threw. That throw propagated out of `UserViewEngine.GetAccessibleViewsForEntity()`'s `.filter(v => v.UserCanView)`, emptying the entire list — including the current user's own views. It now resolves via `ViewResourceTypeID` (matching on `.Entity`), consistent with `UserCanEdit`/`UserCanDelete`.
