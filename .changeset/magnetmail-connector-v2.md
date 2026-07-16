---
"@memberjunction/integration-connectors": minor
---

Add the MagnetMail (Higher Logic / Real Magnet) connector v2 — a SOAP-over-`BaseRESTIntegrationConnector` connector for the `mmapi.asmx` API (two-step `<mmAuthHeader>` session auth, per-operation `ListOperation`/CRUD wiring, `getMessagesUTC` incremental watermark, full-record pass-through). Wires the never-shrink sample-union in `IntrospectSchema` (`@memberjunction/connector-schema-merge`) so tenant custom columns are captured. Verified with a full-lifecycle GENUINE-GREEN-MOCK e2e (all 21 phases green: forward sync, coverage over every object, delta CRUD, idempotent, custom-column capture, pagination, watermark, bidirectional writes) and 37 unit tests.
