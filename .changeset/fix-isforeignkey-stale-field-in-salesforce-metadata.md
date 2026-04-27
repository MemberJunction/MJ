---
"@memberjunction/integration-connectors": minor
---

fix(metadata): replace stale `IsForeignKey` flag with `RelatedIntegrationObjectFieldName` in salesforce metadata

`metadata/integrations/.salesforce.json` had 1,395 fields with `"IsForeignKey": true` — a property that does not exist on the `MJ: Integration Object Fields` entity. Every `mj sync` run failed validation with:

```
Field "IsForeignKey" does not exist on entity "MJ: Integration Object Fields"
```

Blocked any push to `next` that touched the metadata directory.

The entity already exposes the FK linkage via `RelatedIntegrationObjectFieldName` (and `RelatedIntegrationObjectID` for the resolved target). Salesforce FKs always reference `Id` on the target sObject, so this PR transforms each `"IsForeignKey": true` into `"RelatedIntegrationObjectFieldName": "Id"` — preserving the FK signal using a real entity field that mj-sync will accept.

The salesforce connector's metadata generator should be updated in a follow-up to emit `RelatedIntegrationObjectFieldName` directly instead of the deprecated `IsForeignKey` flag.
