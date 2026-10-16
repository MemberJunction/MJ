---
"@memberjunction/core-actions": patch
"@memberjunction/server": patch
---

Security hardening.

- **SSRF**: the two remaining raw `fetch(url)` calls on caller-controlled URLs in CoreActions — `BaseFileHandlerAction.loadFromURL` (the `FileURL` path every file-handling action shares) and `ReadRSSFeedAction.FetchFeed` — now route through the SSRF-guarded `SafeFetch` from `@memberjunction/network-utils`, matching Web Page Content / HTTP Request / URL Metadata Extractor. Private, loopback, link-local (incl. the 169.254.169.254 cloud-metadata endpoint) and reserved targets are blocked, and every redirect hop is re-validated.
- **SQL literal escaping**: three MJServer sites interpolating caller-supplied values into `ExtraFilter` without escaping now use `EscapeSQLString` per the repo standard — `UpdateQueryExtended`'s duplicate-name check (`input.Name` / `finalCategoryID`), `FetchEntityVectorsResolver.loadEntityDocument` (`entityDocumentID`), and the `ExampleNewUserSubClass` template's `Email` lookup (which breaks today on legitimate `O'Brien`-style addresses and is the snippet integrators copy).
