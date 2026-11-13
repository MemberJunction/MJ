---
"@memberjunction/server": patch
---

Wave 4.7 columnar wire, schema diet, and serialization optimizations:
- Single-pass built-in directives transformation via `ApplyBuiltInDirectivesTransformer` applying both `@RequireSystemUser` and `@Public` rules in a single `mapSchema` pass without cloning the schema twice.
- Short-circuit `RequireSystemUserDirective.transformer` to return `fieldConfig` unchanged for fields lacking the directive.
- Synchronous resolver execution in `PublicDirective.transformer` and `ApplyBuiltInDirectivesTransformer` to eliminate Promise overhead for scalar field reads.
- Opt-in `schema.gql` file emission controlled by `MJ_EMIT_SCHEMA_GQL=1` during development/build boots.
- Frozen-row `WeakMap` serialization cache in `RunViewResolver.processRawData` and short-circuit `ReplaceByteArraysWithBase64` on entities without binary fields.
- Frozen dataset-item `WeakMap` JSON serialization cache in `DatasetResolverBase.SerializeDatasetItems` for O(1) repeated dataset serialization.
