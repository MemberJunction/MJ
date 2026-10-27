---
"@memberjunction/ai-engine-base": patch
"@memberjunction/aiengine": patch
"@memberjunction/ai-agents": patch
"@memberjunction/core-actions": patch
---

Record CRUD actions accept every primary-key shape and fail fast on unknown fields; agent request types are cached on the AI engine.

- `Get Record`, `Update Record` and `Delete Record` now accept the `PrimaryKey` parameter as a plain key-column map, the `CompositeKey` `{ KeyValuePairs }` shape, a JSON string of either, or (single-column keys only) the bare key value, which is mapped onto the entity's key column whatever it is called. A bare value for a composite key is rejected with the required columns listed, and a partial key reports every missing column at once.
- `Create Record` and `Update Record` return `INVALID_FIELD_NAMES` (with the valid updatable field names) when `Fields` names a field the entity does not have, instead of dropping it and reporting success. Field names resolve case-insensitively against entity metadata, which also covers dynamic entities without a generated class.
- `AIEngineBase` caches `MJ: AI Agent Request Types` and exposes `AgentRequestTypes` / `GetAgentRequestTypeByName`; `AIEngine` delegates to them and `BaseAgent` resolves a request's type through the cache instead of a private per-run query.
