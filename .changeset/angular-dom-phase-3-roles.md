---
"@memberjunction/ng-test-utils": minor
---

Angular DOM unit-testing — Phase 3 (`Angular/Explorer/**` rollout) toolkit growth.

`createFakeProvider` gains an additive **`roles`** option that populates `provider.Roles`, for DOM
specs of permission/role UIs that read `ProviderToUse.Roles` (e.g. the Explorer entity-permissions
grid). Mirrors the existing `entities` option; defaults to `[]` when omitted, so it's non-breaking.
