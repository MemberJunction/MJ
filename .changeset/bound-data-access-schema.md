---
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
---

Schema for bound data access, approvals and calendar links (plan: `plans/bound-data-access-and-calendars.md`). `MJ: AI Agent Runs.BoundActionParams` stores a run's bound action parameters. `MJ: Query Parameters.IsServerSet` marks a parameter only server code may set. `MJ: User Views.Properties` holds a view's declared, typed inputs (JSONType `IUserViewProperty`). Queries, user views, dashboards and components gain an approval bound to a fingerprint of the approved definition (`ApprovedFingerprint`, `ApprovedByUserID`, `ApprovedAt`, `ApprovalComments`; `ApprovalStatus` on all but queries, which keep `Status`). New entities `MJ: Calendar Event Links` and `MJ: Calendar Sync States`. Additive only; nothing uses the new columns until the features that read them are built.
