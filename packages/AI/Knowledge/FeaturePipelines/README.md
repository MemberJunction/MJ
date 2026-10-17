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
| `PipelineVersion` | `MJ: Feature Pipeline Versions.Version` that computed the value (null for values written before versions existed, and for runs without a Record Process) |
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
- `ComputeSpecHash(spec, outputMapping, escalationTargetPinHash)` — the spec parts that change what is computed or
  written, the Record Process's OutputMapping text, and a Decision pipeline's escalation target's pin hash
- `ComputeHash(pin)` — the pin hash a version is registered under

## Pipeline versions

`FeaturePipelineVersionService` numbers each distinct pin of a pipeline in `MJ: Feature Pipeline Versions` and decides
whether a run may write under it. `InferProcessor.Preflight` asks it once per run (`ResolveForRun`) and stamps the
version on every record's result and Feature Value. A record whose pin changed after that (the prompt, model,
parameters, spec or escalation target was edited mid-run) fails instead of being written under a version that did not
compute it.

- A new pin is registered as the next `Candidate` (`RegisterCandidate` does only this).
- **Ungated pipeline** (no `Activation` in the spec): a Candidate becomes `Active` on an `OnDemand` or `Manual` run,
  or when the pipeline has no Active version (its first version, whatever the trigger). A `Schedule` or `OnChange` run
  of a changed pipeline is refused with `FeaturePipelineVersionRefusedError`, which names the on-demand run that
  re-derives every record under the new version. A version gated before the pipeline dropped its `Activation` is
  ungated from then on.
- **Gated pipeline** (`Activation: { GoldenSetTestID, Metric, Threshold }`): a version runs only once a stored
  golden-set result meets its threshold (at the threshold included), whatever its status. A pipeline that adds a gate
  does not keep running the version it activated before. `RecordGoldenSetResult` stores an evaluation: `Active` when it
  passes, `Refused` otherwise; a Refused version is refused on every run.
- **Every write takes the pipeline lock first.** A real run's gate, `RegisterCandidate` and `RecordGoldenSetResult`
  each run in one entity transaction (on its own provider instance, `MetadataProviderCapabilities.RunIsolated`) whose
  first statement takes an update lock on the pipeline's version rows, so a pipeline never ends with two Active
  versions and a refusing golden-set result is never overwritten by a stale passing one.
- A dry run only reads (no lock): it creates and activates nothing, and reports in `WouldRefuse` why the real run
  would be refused (each dry-run record carries it as a warning).
- **Unattended version changes** (`PlanUnattended`, run every 15 minutes by the Feature Pipeline Version Steward
  scheduled job): a gated version without a golden-set result for its current `Activation` settings is evaluated; a
  changed version not yet backfilled gets one on-demand run over `BackfillRecordIDs` (records whose latest Pipeline
  value is under another version or none), then `MarkBackfilled`. A pipeline opts out per step with
  `Unattended: { AutoEvaluate: false }` / `{ AutoBackfill: false }`.
- **Decision pipelines that escalate**: a gated escalation target must have passed its golden set
  (`AssertRunnable`, read-only), or every escalating record fails.

`MJFeaturePipelineVersionEntityExtended` enforces the gate on every save path: a gated version cannot be saved `Active`
without a stored result at or above its threshold (`GetActivationProblems`, `HasPassingResult`).

## Normalisation

Cache keys normalise text inputs with `FeatureValueKey.NormalizeValue`: Unicode NFC, trimmed, internal whitespace
collapsed, lower-cased. Key fields are matched to record fields case-insensitively. Other value types are
hashed as they are.

## Lookup constraints

A `lookup` output constraint names the entity whose rows are the allowed answers (`Entity`, `MatchField`, optional
`DisplayFields` and `Filter`). `LookupConstraintValues.Load` reads those rows through the run's provider (field names
must be plain identifiers) and `LookupConstraintValues.Apply` attaches them to the resolved constraint. The runner
then renders them into the constraint block (each value with its display text) and `ValidateOutputValue`
accepts only an existing row's value, returned in the row's own form. An array output sets `ItemRef` (for example
`$.JobFunctionID`) and `ValidateOutputItems` checks every item there. An answer that fails its
constraints fails the record with `FailureKind: 'RejectedInvalid'`, and nothing is cached or recorded for it. The loaded
rows are part of the prompt version hash and the constraint hash, so a changed taxonomy is a new pipeline version.

## Reasoning and confidence

A Feature Value's `Reasoning` is the model's top-level `reasoning` key (matched in any case; empty or whitespace-only
is none; `ModelAnswer.Reasoning`) unless the spec sets `CaptureReasoning: false`. An output's `Confidence` is the
driver's own (a Decision driver produces one per output). Otherwise it is the number the answer states at the output's
`ConfidenceRef` (a result path such as `"$.SeniorityConfidence"`), and only when that number is in [0, 1].
`ValidateSpec` refuses a `ConfidenceRef` that does not name a property of the result. An output whose value the
constraint check replaced (`null` or `coerce-to-other`) gets no confidence.

An output can set a confidence floor: `MinConfidence` (0 < floor <= 1) with `OnLowConfidence: 'null'`. `ValidateSpec` requires both together, a `ConfidenceRef` on an LLM pipeline, and refuses a floor on a
whole-answer (`$`) output when the spec has other outputs. `ConfidenceFloor.IsBelow`
treats a missing confidence as below the floor; `ConfidenceFloor.FindBelow` lists an answer's below-floor outputs. The
runner withholds a below-floor output (its Feature Value records the abstention with no value; write-back clears a
target value the pipeline wrote and keeps a person's). The floor is part of the outputs, so changing it changes the spec hash.

An LLM pipeline can opt in to `Context.RecordAsUserMessage: true` (with `Context.Fields`): the record's context fields are
then sent as one JSON object in the prompt's user message, with the template as the system message. `ValidateSpec`
refuses a non-boolean value, the flag on a non-LLM pipeline, and the flag without `Context.Fields`.

Reasoning and confidences are read from the payload the Dedup Cache stores for the record's key
(`InferProcessor.RecordedAnnotations`), so a re-run of an unchanged key records exactly what the first run recorded.
The payload carries keys the runner writes and a model's answer cannot set: `_violations` (the outputs the
constraint check replaced), `_confidence` (the driver's own per-output confidences) and `_belowConfidence` (the
outputs withheld below their floor).

## Upserts

`FeatureValueCacheService.RecordFeatureValues(params)` writes one row per output on its key: a key that already holds the
same value, reasoning and confidence is left untouched (`Unchanged`), a changed one is updated in place, a new one is
inserted (`Upserted`). The previous values of an updated row are in Record Changes. The outcome's `Previous` holds each
feature's latest `Source='Pipeline'` value before the call, on any key. Every key part is a required parameter.

## Outputs without a write target

An output may omit `Target`. Use this when the answer is a feature to keep and read later (a score, a label, a
summary) rather than a value to write onto the record. `OutputTargets.HasWriteTarget(output)` is the single check for
"does this output write anywhere".

In the pipeline builder, choose the target mode `Feature value only (no write-back)` to configure such an output.

- **Stored:** every output, with or without a target, is recorded in `MJ: Feature Values` on the record's key
  (value, `Source='Pipeline'`, confidence, reasoning, pipeline version). A target-less output is stored there and nowhere else:
  nothing is written to the entity, and the Human-value guard does not apply. A pipeline whose outputs are all
  target-less still reports `Upserted` or `Unchanged` per record from those Feature Values.
- **Visible:** the Feature Values panel on every record form (latest value per pipeline and feature, with Source,
  Confidence, version, Computed, Reasoning and history), and the Bulk Operations dry-run dialog.
- **Validator rules:** `ValidateSpec` accepts an output without `Target` but reports an error for the two constraints
  that need a field to resolve:
  - an `enum` constraint with `FromFieldMetadata: true` and no field target: list `Constraint.Values` or give the output a field target;
  - a `lookup` constraint without `Entity` and no field target: set `Constraint.Entity` or give the output a field target.
- **Dry run:** nothing is stored. The write-back result carries `previewFeatureValues` (`FeatureName`, `Previous`,
  `Proposed`) for each target-less output whose proposed value differs from the record's latest stored Pipeline
  value (the value a real run compares against for `Upserted` / `Unchanged`; a Human value is not consulted), or that
  has none; a withheld output is omitted. The dialog shows each as a `<Feature> (feature value)` row.
- **Coercion:** a string answer to a `numeric` / `money` or `boolean` constraint is checked as that type (the type the
  constraint implies stands in for the missing column's TSType), so `'0.75'` passes as `0.75` and `'true'` as `true`; a
  string that does not parse is a violation handled by `OnViolation`. When an answer still arrives as a string,
  `FeatureValueCacheService.ToTypedValue(value, constraintType)` stores it by the output's constraint: `numeric` / `money`
  with a trimmed, finite decimal/exponent numeric string (no hex; `'1e400'` stays text) in `ValueNumeric`, `boolean` with
  `'true'` / `'false'` (any case) in `ValueBoolean`, `date` with an ISO date string (`YYYY-MM-DD…`) that `Date.parse`
  accepts in `ValueDate`. Anything else is stored by its JavaScript type. This applies to outputs without a write target
  only: an output with a target keeps its storage by JavaScript type.

## Dedup Cache scope

Every cache call carries a `FeatureValueCacheScope`: the pipeline (or the whole prompt, `scope: 'prompt'`), the prompt,
its version hash, the constraint hash, and the pin's `aiModelID` and `parametersHash`, plus the caller's provider. `Store` refreshes an existing row for the key in place,
expired or not. A hit records its hit count unless `recordHit` is false; a hit count that cannot be saved is logged and
does not fail the lookup.
