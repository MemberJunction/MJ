---
"@memberjunction/core": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-shared": patch
---

New-record tabs store an empty recordId while the URL uses the `new` sentinel. URL sync treated those as different records and opened another tab, which synced the same URL again — an infinite tab storm. Person → Orders → New was the first place this showed up because that click is OpenNewEntityRecord with join-field defaults on the `/new?NewRecordValues=` deeplink.
