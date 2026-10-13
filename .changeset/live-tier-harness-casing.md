---
'@memberjunction/integration-test-suite': patch
---

Fix three live-tier false failures left by the naming refactor: IT56 PG2/PG7 read the payload-guard audit through a hand-copied PascalCase mirror of PayloadManager's camelCase `PayloadChangeResultSummary`, so every violation read back empty; IT54 SA4 forwarded a stale `conversationId` option that `RunAgentOverWire` no longer reads, so the run was never linked to its conversation. Checks now read the audit via `ReadPayloadAudit`, typed against the product's own summary type, and `runAndVerify` takes the shared `WireRunOptions`, so either drift now fails to compile.
