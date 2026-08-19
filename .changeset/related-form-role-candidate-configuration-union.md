---
"@memberjunction/core": patch
---

`RelatedFormRoleCandidate.Configuration` now accepts `IEntityRelationshipConfiguration` as well as the raw JSON string.

`EntityRelationshipInfo.Configuration` became a lazily-parsed getter returning the typed object, and the three readers that consume a candidate's bag (`ReadRelationshipInclusion`, `ReadRelationshipSortKey`, `ReadRelationshipJoinFields`) were widened to take either shape — but the candidate DTO itself was left declared `string | null`, so every caller that builds a candidate from an `EntityRelationshipInfo` failed to compile. Widening the field to the same union unbreaks `@memberjunction/ng-base-forms` and `@memberjunction/ng-core-entity-forms`; candidates built straight from a metadata row still pass the string.
