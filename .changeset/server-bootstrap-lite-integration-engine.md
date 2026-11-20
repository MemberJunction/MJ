---
"@memberjunction/server-bootstrap-lite": patch
"@memberjunction/server-bootstrap": patch
---

`server-bootstrap-lite` declares `@memberjunction/integration-engine`, which its regenerated class manifest now imports for `MemberJunctionConnector` (#6502). Without it the lite build failed with `TS2307: Cannot find module '@memberjunction/integration-engine'`. Both server class-registration manifests are regenerated to include the connector.
