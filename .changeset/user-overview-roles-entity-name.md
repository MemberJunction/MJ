---
"@memberjunction/ng-core-entity-forms": patch
---

The Users form's Assigned Security Roles panel queried the legacy entity name 'User Roles', which no longer resolves, so it always showed "0 Roles" and logged errors. It now queries 'MJ: User Roles'.
