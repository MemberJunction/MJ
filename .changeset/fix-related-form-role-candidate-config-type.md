---
"@memberjunction/core": patch
---

fix(core): accept a parsed Configuration on RelatedFormRoleCandidate

`EntityRelationshipInfo.Configuration` became a lazily-parsed getter returning
`IEntityRelationshipConfiguration | null`, but `RelatedFormRoleCandidate.Configuration`
was left declared `string | null`. `resolve-form-chrome.ts` assigns one to the other, so
`@memberjunction/ng-base-forms` failed to compile and took the workspace build down with it:

```
resolve-form-chrome.ts:706:9 - error TS2322: Type 'IEntityRelationshipConfiguration | null'
is not assignable to type 'string | null | undefined'.
```

Widened the field to `string | IEntityRelationshipConfiguration | null` — the exact union
that `ReadRelationshipInclusion`, `ReadRelationshipSortKey` and `ReadRelationshipJoinFields`
already accept. Widening rather than swapping keeps callers that read a raw row value
working, while allowing the parsed object the getter now hands back.
