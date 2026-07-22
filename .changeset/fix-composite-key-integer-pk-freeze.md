---
"@memberjunction/core": patch
"@memberjunction/ng-explorer-core": patch
---

Fix browser freeze on entity record views whose entity has an integer (non-UUID) primary key.

`CompositeKey.EqualsKey` compared a loaded entity's raw scalar PK (a JS `number`, e.g. `5`)
against the URL/tab-derived string form (`"5"`, produced by URL-segment parsing). The strict
`!==` between a number and a string is always true, so record-identity checks never converged
for integer PKs — the record view re-ran its work every change-detection/navigation cycle and
looped indefinitely, freezing the browser tab (most visibly on back/forward navigation). UUID
PKs are strings on both sides, so they were unaffected. Scalar values are now string-coerced
before comparison; the case-insensitive `UUIDsEqual` path for string/string values is unchanged.

Also hardens the Explorer shell's record URL building: the `CompositeKey` URL segment (`ID|<value>`)
now has its `|` encoded so the built URL matches Angular's serialized `router.url` (which
percent-encodes `|` to `%7C`). Previously the raw pipe made `syncUrlWithWorkspace`'s
`currentUrl !== newUrl` check permanently true, a latent re-navigation loop under
`onSameUrlNavigation: 'reload'`. The read side already `decodeURIComponent()`s this segment, so
both sides stay consistent.
