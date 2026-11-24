---
"@memberjunction/core-actions": minor
"@memberjunction/communication-types": minor
"@memberjunction/communication-engine": minor
"@memberjunction/communication-sendgrid": minor
"@memberjunction/entity-communications-base": minor
"@memberjunction/entity-communications-server": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-communications": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/codegen-lib": minor
---

Implement MemberJunction Communications V2 (Comms V2): schema, metadata seeds, compliance gate with 9 rule drivers, endpoint resolution, link/pixel tracking, SendGrid webhook/domain auth, public preference center and admin dashboard, templated delivery, and IT187–IT191 integration test suites.

Key behavior details:
- V1 `SendSingleMessage` and `CoreActions` remain unchanged by default; opt into V1 compliance gating via `Message.CheckComplianceGate = true` or `MJ_COMMS_V1_COMPLIANCE_GATE=true`.
- `EntityCommunicationsEngine.RunEntityCommunication` supports V2 routing via `UseV2 = true` and tags V1 bulk sends as `Message.MessageClass = 'Operational'`.
- `MessageClass = 'Transactional'` sends require Owner privileges or the `Communications: Send Transactional` authorization.
- A `Marketing` message must be sent under a preference (`Envelope.PreferenceID`); without one it is blocked with `PreferenceRequired` in every enforcement mode.
- Every `Marketing` email carries the one-click unsubscribe header (`List-Unsubscribe`, `List-Unsubscribe-Post`), whether or not a compliance regime is enabled. The unsubscribe footer still comes only from an enabled regime.
- A link whose click-tracked form would exceed 2,000 characters is left untracked.
- The `MJ: Users` principal's email mapping is seeded (`metadata/entity-communication-message-types`), so users are reachable on a new installation.
- `spDeleteEntityWithCoreDependencies` removes an entity's communication principals, endpoint links, preferences and principal-only suppressions with it, including the consent audit rows that reference them. A suppression that also names an endpoint (a hard bounce or complaint recorded against a principal) is kept with its entity link cleared, so the address stays blocked. Communication logs and sender types keep their rows with the entity link cleared.
