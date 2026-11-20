---
"@memberjunction/global": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-explorer-core": patch
---

Record form display and error fixes: a cleared textbox on a UUID, date, number or boolean field stores null instead of an empty string; a refused delete (and save) shows the server's reason from `LatestResult.CompleteMessage`; a new record's edit banner and tab title read "New <singular display name>" (new `GenerateSingularName` in `@memberjunction/global`), and a saved record with no name shows its bare key; the IS-A breadcrumb shows entity display names; an IS-A child entity with no form of its own opens with its nearest parent's class form.
