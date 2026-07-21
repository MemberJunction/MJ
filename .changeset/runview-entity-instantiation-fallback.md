---
"@memberjunction/core": patch
"@memberjunction/server-bootstrap": patch
---

Fix a null-dereference crash when a `RunView` with `ResultType: 'entity_object'` (or a `Fields` projection) materializes an entity whose registered class cannot be constructed in the current runtime context — for example a server-only `*EntityServer` subclass instantiated inside a client/GraphQL process, where its constructor intentionally throws. `ProviderBase.GetEntityObject` now falls back to the generic `BaseEntity` (the same class a context without that subclass registered — a real browser client — resolves), and `TransformSimpleObjectToEntityObject` emits a clear, actionable error instead of dereferencing `null.constructor`. Surfaced by a client-first integration RunView sweep across all entities. Also corrects the ServerBootstrap class-registration manifest count constant (975 → 976) to match the actual registration array length.
