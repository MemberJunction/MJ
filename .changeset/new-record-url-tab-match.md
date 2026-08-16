---
"@memberjunction/core": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-shared": patch
---

New-record tabs store an empty recordId while the URL uses the `new` sentinel. URL sync treated those as different records and opened another tab, which synced the same URL again.

A second compare was permanently true even after the tab matched: `encodeURIComponent` writes `%3A` for the colon in `MJ_BizApps_Orders: Order Headers`, Angular's serializer leaves `:`. Combined with `onSameUrlNavigation: 'reload'`, Person → Orders → New navigated `/new` until Chrome died. URL compare now decodes path and query first.
