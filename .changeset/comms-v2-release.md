---
"@memberjunction/core": minor
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
---

Implement MemberJunction Communications V2 (Comms V2): schema, metadata seeds, compliance gate with 9 rule drivers, endpoint resolution, link/pixel tracking, SendGrid webhook/domain auth, public preference center and admin dashboard, templated delivery, and IT186–IT190 integration test suites.

Key behavior details:
- V1 `SendSingleMessage` and `CoreActions` remain unchanged by default; opt into V1 compliance gating via `Message.CheckComplianceGate = true` or `MJ_COMMS_V1_COMPLIANCE_GATE=true`.
- `EntityCommunicationsEngine.RunEntityCommunication` supports V2 routing via `UseV2 = true` and tags V1 bulk sends as `Message.MessageClass = 'Operational'`.
- `MessageClass = 'Transactional'` sends require Owner privileges or the `Communications: Send Transactional` authorization.
