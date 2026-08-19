---
"@memberjunction/core": patch
---

Widen `RelatedFormRoleCandidate.Configuration` to `string | IEntityRelationshipConfiguration | null`.

`EntityRelationshipInfo.Configuration` now returns the parsed bag rather than the raw JSON
string, and `ReadRelationshipInclusion` / `ReadRelationshipJoinFields` were updated to accept
either form — but this DTO still declared `string | null`, so every site copying
`rel.Configuration` onto a candidate failed to compile (TS2322). That broke `ng-base-forms`,
and with it the unit-test and native-ESM-guard jobs, on `next` and on every branch cut from it.
`ng-core-entity-forms` carried the same assignment and was the next to fail.

The union keeps `string` because metadata rows still supply one; both readers already accept
both, as does the `EntityRelationshipInfo.Configuration` setter.
