---
"@memberjunction/server": patch
---

`IntegrationApplyAllBatch` matches `IntegrationApplyAll`: first-apply full-sync determination, and unselected entity maps are disabled on the no-restart path. Every schema build (ApplySchema, ApplyAll, ApplyAllBatch, the connector build, schema evolution) reads a per-connection catalog's field rows from the database instead of the engine's warm-on-demand cache, so an apply no longer builds tables with no columns; a failed read throws `PER_CONNECTION_FIELDS_UNREADABLE`.
