# @memberjunction/feature-pipelines

Feature Pipeline building blocks for the Knowledge Hub: the `DataFeatureSpec` contract, output constraints and their
validation, materialization-target checks, the Dedup Cache (`MJ: Feature Value Caches`), and the keyed Feature Value
store (`MJ: Feature Values`). The pipeline runner itself is `InferProcessor` in `@memberjunction/record-set-processor`.

## The Feature Value key

A Feature Value is identified by its key (the contract's `FeatureValueKey` without `EffectiveAsOf`):

| Part | Meaning |
|---|---|
| `EntityID`, `RecordID` | the record (a UUID record ID is keyed case-insensitively; any other key string as given) |
| `FeatureName` | the output, case-insensitively |
| `PipelineVersion` | `MJ: Feature Pipeline Versions.Version` that computed the value (null until versions are resolved) |
| `PromptVersionHash`, `AIModelID`, `ParametersHash` | the pipeline pin that computed it (below) |
| `InputHash` | SHA-256 of the record's normalised inputs (the Dedup Cache key hash) |
| `Source` | `Pipeline` or `Human` |

`FeatureValueKey.ComputeHash(key)` gives the SHA-256 stored as `FeatureValue.ValueKeyHash`, unique per pipeline
(a filtered unique index; rows written before the key existed have no hash and are kept as history).

## The pipeline pin

`FeaturePipelinePinData` is what makes two runs compute the same value: the prompt, its version hash (template text,
outputs, constraint block, pipeline type, escalation settings), the primary AI model (the highest-priority Active
prompt model, ties broken by model ID, normalised and ordinal), the parameters hash and the spec hash. The statics on
`FeaturePipelinePin` select and hash it from plain data:

- `SelectPrimaryModel(models)`
- `ComputeParametersHash(params)` — temperature, topP, topK, minP, penalties, seed, response format, effort level and
  the primary model's `ModelParameters`; `null` and `0` hash differently
- `ComputeSpecHash(spec, outputMapping)` — the spec parts that change what is computed or written, plus the
  Record Process's OutputMapping text
- `ComputeHash(pin)` — the pin hash a version is registered under

## Normalisation

Cache keys normalise text inputs with `FeatureValueKey.NormalizeValue`: Unicode NFC, trimmed, internal whitespace
collapsed, lower-cased. Key fields are matched to record fields case-insensitively. Other value types are
hashed as they are.

## Upserts

`FeatureValueCacheService.RecordFeatureValues(params)` writes one row per output on its key: a key that already holds the
same value, reasoning and confidence is left untouched (`Unchanged`), a changed one is updated in place, a new one is
inserted (`Upserted`). The previous values of an updated row are in Record Changes. The outcome's `Previous` holds each
feature's latest `Source='Pipeline'` value before the call, on any key. Every key part is a required parameter.

**Race rule.** Two runs can insert the same new key at once. The loser's insert fails on the unique index; it then
re-reads the key, and when a row now exists it applies its output to that row (once). The race is recognised by the
row, never by the provider's error text. A failed insert with no row behind it is a real error and is thrown.

## Dedup Cache scope

Every cache call carries a `FeatureValueCacheScope`: the pipeline (or the whole prompt, `scope: 'prompt'`), the prompt,
its version hash, the constraint hash, and the pin's `aiModelID` and `parametersHash`, plus the caller's provider (cache
reads and writes never fall back to the process-wide provider). `Store` refreshes an existing row for the key in place,
expired or not. A hit records its hit count unless `recordHit` is false; a hit count that cannot be saved is logged and
does not fail the lookup.
