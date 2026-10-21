---
"@memberjunction/react-linter": patch
---

Export the semantic-validator API from the package root: `SemanticValidator`, `SemanticValidatorRegistry`, and the types `ValidationContext`, `EntityMetadata`, `EntityFieldInfo`, `QueryMetadata`, `QueryParameter`, `DynamicValue` and `ExtractedValue`. Apps that register a custom constraint validator no longer need to deep-import compiled `dist/` paths.
