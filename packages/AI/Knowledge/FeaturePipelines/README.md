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
  written, plus the Record Process's OutputMapping text, plus (for a Decision pipeline that escalates) its escalation
  target's pin hash, so editing the target makes a new version of the Decision pipeline. A pipeline without a target
  hashes as before.
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
- **Every write takes the pipeline lock first.** A real run's gate (read, register, decide, retire and activate),
  `RegisterCandidate` and `RecordGoldenSetResult` each run in one entity transaction whose first statement takes an
  update lock on the pipeline's version rows and their key range (SQL Server). Writers of one pipeline are serialised
  in one lock order, so they cannot deadlock each other, and each decides on rows no other writer can change before it
  saves. The transaction runs on its own provider instance (`MetadataProviderCapabilities.RunIsolated`), so two runs
  sharing one provider (as scheduled jobs do) hold two transactions and wait on each other; a caller that already holds
  a transaction is joined instead (it must not have touched the pipeline's version rows in it). So the pipeline never
  ends with two Active versions, a scheduled run cannot activate past a concurrent on-demand
  activation, and a refusing golden-set result is never overwritten by a stale passing one. A refusal is thrown after
  the transaction committed, so the Candidate it registered stays. A version-number collision on registration (only
  possible from a writer that bypasses the lock) retries with the next number, bounded by
  `MAX_VERSION_REGISTRATION_ATTEMPTS`.
- A dry run only reads (no lock): it creates and activates nothing, and reports in `WouldRefuse` why the real run
  would be refused (each dry-run record carries it as a warning).
- **Unattended version changes** (`PlanUnattended`, run every 15 minutes by the scheduling engine's Feature Pipeline
  Version Steward job): for a gated pipeline whose current version has no stored golden-set result, or one measured
  under other `Activation` settings (threshold, metric and test are outside the pin, so changing them re-evaluates the
  same version), the plan is to run the golden-set test; for a version not yet backfilled that changed from another
  version, or a first version while Pipeline values written before any version exist (`PipelineVersion` NULL), the plan
  is one on-demand run over `BackfillRecordIDs` (the records whose latest Pipeline value, by `ComputedAt`, is under
  another version or none), after which `MarkBackfilled` stamps `BackfilledAt`. A Refused version is reported, not retried. A pipeline opts out per step with
  `Unattended: { AutoEvaluate: false }` / `{ AutoBackfill: false }` (outside the spec hash). A version that becomes
  Active again has its `BackfilledAt` cleared, so its records are re-derived under it.
- **Decision pipelines that escalate**: the Decision pipeline's spec hash covers its escalation target's pin, so a
  change to the target is a new Decision version (held or gated like any other). The target itself writes no Feature
  Values and registers no versions; when it is gated, `AssertRunnable` checks, read-only, that its current version
  passed its golden set, or every escalating record fails. A target that cannot be used as configured leaves the
  Decision pin without a target hash (its escalating records fail); a failure to load the target fails the run instead,
  so a transient error never makes a new version.

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
then renders them into the constraint block (each value with its display text) and `OutputValidator.ValidateOutputValue`
accepts only an existing row's value, returned in the row's own form. An array output sets `ItemRef` (for example
`$.JobFunctionID`) and `OutputValidator.ValidateOutputItems` checks every item there. An answer that fails its
constraints fails the record with `FailureKind: 'RejectedInvalid'`, and nothing is cached or recorded for it. The loaded
rows are part of the prompt version hash and the constraint hash, so a changed taxonomy is a new pipeline version.

## Reasoning and confidence

A Feature Value's `Reasoning` is the model's top-level `reasoning` key (matched in any case; empty or whitespace-only
is none; `ModelAnswer.Reasoning`) unless the spec sets `CaptureReasoning: false`. An output's `Confidence` is the
driver's own (a Decision driver produces one per output). Otherwise it is the number the answer states at the output's
`ConfidenceRef` (a result path such as `"$.SeniorityConfidence"`), and only when that number is in [0, 1].
`ValidateSpec` refuses a `ConfidenceRef` that does not name a property of the result. An output whose value the
constraint check replaced (`null` or `coerce-to-other`) gets no confidence.

An output can set a confidence floor: `MinConfidence` (0 < floor <= 1) with `OnLowConfidence` (`'null'` or
`'fail'`). `ValidateSpec` requires both together, a `ConfidenceRef` on an LLM pipeline, and refuses a floor on a
whole-answer (`$`) output when the spec has other outputs. `ConfidenceFloor.IsBelow`
treats a missing confidence as below the floor; `ConfidenceFloor.FindBelow` lists an answer's below-floor outputs. The
runner withholds a `'null'` output (its Feature Value records the abstention with no value; write-back clears a
target value the pipeline wrote and keeps a person's) and fails the record on a `'fail'` one
(`FailureKind: 'BelowConfidence'`). The floor is part of the outputs, so changing it changes the spec hash.

An LLM pipeline can opt in to `Context.RecordAsUserMessage: true` (with `Context.Fields`): the record's context fields are
then sent as one JSON object in the prompt's user message, with the template as the system message. `ValidateSpec`
refuses a non-boolean value, the flag on a non-LLM pipeline, and the flag without `Context.Fields`.

Reasoning and confidences are read from the payload the Dedup Cache stores for the record's key, by one function
(`InferProcessor.RecordedAnnotations`). That function serves the miss that computed the payload, every other record
of the miss's key group, and every later cache hit. So a re-run of an unchanged key records exactly what the first
run recorded (`Unchanged`), for a Decision pipeline too, and a hit's result reports the same `Confidence`.

**Reserved payload keys.** The payload (the stored `OutputsJSON` and the record's `ResultPayload`) is the model's
answer plus two keys the runner writes:
- `_violations`: the outputs the constraint check replaced.
- `_confidence`: the driver's own per-output confidences.

A model's answer cannot set either: they are removed from the answer before the runner adds its own. A write-back
that maps the whole payload (`$`) carries them too. Cache rows stored before `_confidence` existed carry no driver
confidence, so a Decision pipeline's first cached re-run after the upgrade records none.

Lookup rows load in one order (by match value, ordinal) whatever order the database returns them in, so an unchanged
taxonomy keeps its constraint hash and prompt text. `OutputConstraintResolver` resolves every output's constraint the
one way the runner and the Record Process Studio preview both use, so the preview shows the block the model is sent.

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
