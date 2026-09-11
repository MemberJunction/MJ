---
"@memberjunction/server": minor
"@memberjunction/integration-engine": minor
---

Sync lifecycle: `IntegrationGetResourcePressure` plus run warnings before a host runs out of memory or disk; deactivating a connection pauses its schedules, requests cancel of an in-flight sync and refuses refresh/evolution with a named reason; schema evolution offers accumulated custom columns and materialises accepted ones in the same migration; connectors declare a `SettingsSchema` exposed by `IntegrationGetConnectorSettingsSchema`.
