---
"@memberjunction/open-app-engine": patch
---

fix(open-app): anchor config edits on a LIVE `module.exports`, never one inside a comment.

`FindExportedObjectBrace` (and `InsertBeforeModuleExportsClose` before it) located the exported config object with `content.match(/module\.exports\s*=\s*\{/)`. `String.match` returns the FIRST hit, and MJ's own default MJAPI config scaffold documents an example `module.exports = {…}` inside its header comment — so on a stock host the anchor selects the commented example and every subsequent edit lands somewhere inert.

Reproduced against the built package: with that scaffold shape, `AddExcludeSchema` reported `Success: true` while the evaluated config was unchanged, and `RemoveExcludeSchema` reported success while the schema stayed excluded. That is the #3457 symptom — an app with tables and no entities — arriving by a different route.

The anchor now resolves through `MatchOutsideCommentsAndStrings`, which skips any match whose offset falls inside a comment or string literal. Same defect class as the open issue #3301 (`dynamicPackages` written into a comment); this fixes it for the schema-array editors.
