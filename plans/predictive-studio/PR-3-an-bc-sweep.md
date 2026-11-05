# PR 3 an-bc review: reader sweep (Task 5)

For each contract changed by the an-bc review fixes, this lists every reader class and the proof that it reads the new contract. All commands were run from the repository root at the sweep commit. "(empty)" means the command printed nothing.

## Changed contracts

| # | Contract | Old | New |
|---|---|---|---|
| C1 | Entity names | `MJ: Prediction Units`, `MJ: Evaluation Protocols`, `MJ: Training Snapshots` | `MJ: ML Prediction Units`, `MJ: ML Evaluation Protocols`, `MJ: ML Training Snapshots` |
| C2 | Tables, views, procs, constraints, classes | `PredictionUnit` / `vwPredictionUnits` / `MJPredictionUnitEntity` … | `MLPredictionUnit` / `vwMLPredictionUnits` / `MJMLPredictionUnitEntity` … (FK columns unchanged, R2) |
| C3 | `IArtifactLoader.load` | `load(fileId, contextUser)` | `Load(fileId, contextUser, provider)` (PascalCase after the final review, M2; `IArtifactStore` is `Save` / `Delete`), plus `IArtifactStore.AssertWritable` |
| C4 | Storage setting | `PS_SNAPSHOT_STORAGE_PROVIDER`, model files written to the *active* File Storage Provider (`MJFilesArtifactStore`, `ResolveActiveFileStorageProviderId`), local-disk fallback | `PS_STORAGE_PROVIDER` names the provider for snapshot **and** model files, whatever its `IsActive` flag; `PS_ARTIFACT_DIR` read only for files written before 6.3 |
| C5 | Migration file | `V2026110…__v6.2.x__PS_Honest_Training_Schema.sql` | `migrations/v6/V202611042040__v6.3.x__PS_Honest_Training_Schema.sql` |

## Reader classes

| Reader class | Contracts | Result |
|---|---|---|
| TypeScript (compiler) | C1–C4 | `pnpm run build` (Task 4, EXIT=0). Packages touched here rebuilt: TruthSuite, integration-test-suite (`tsc` + `tsc -p tsconfig.rigs.json`, the rigs are outside the package `include`) |
| Entity-name strings: `RunView` / `GetEntityObject` / `EntityByName`, Angular route and nav data, dashboards, record panels | C1 | E1, E2. The only plural concept names left in strings are the two Predictive Studio nav **labels** (`predictive-studio.nav.ts:26-27`), which are UI prose (R3) |
| Class / table identifiers in code (`MJ…Entity`, `MJ…Schema`, form keys, class-registration manifests) | C2 | E3, E6 |
| Metadata JSON: actions, agents, prompts (tool descriptions), remote-operation types, integration-test bundles | C1, C2 | E1, E2, E6. Matches in `metadata/` and `metadata-optional/` are prose only (action "Migrate Pipelines to Prediction Units and Evaluation Protocols", suite "Predictive Studio Gates — Prediction Units") |
| e2e specs (`e2e/specs/*.spec.ts`) | C1 | E1 (`ps-honest-training.spec.ts` names `MJ: ML …`) |
| SQL: migration DDL, `spDeleteEntityWithCoreDependencies`, constraint and extended-property names | C2, C5 | E4, E5. The CodeGen view aliases `AS [PredictionUnit]` / `[EvaluationProtocol]` / `[TrainingSnapshot]` and the matching `RelatedEntityNameFieldMap` values are the denormalised name fields derived from the unchanged FK columns (R2), not table references |
| SQL fixture: `CodeGenLib/src/__tests__/fixtures/entity-delete-fk-policy.json` | C2 | Uses `MLTrainingSnapshot`; article fixed ("an MLTrainingSnapshot row") |
| Old entity IDs | C1 | E7 |
| Artifact loader callers | C3 | E10: the two production callers (`auto-train.ts:135`, `ml-model-inference-processor.ts:325`) pass the provider |
| Removed exports | C3, C4 | E9 |
| Storage setting readers | C4 | E8. Readers of `PS_STORAGE_PROVIDER`: engine storage, snapshot store, artifact store, artifact loader, delegation, guide §Storage, changeset |
| Readers of the old "active provider" rule (truth-suite harness, training rigs, test helpers) | C4 | **Stale — fixed in this sweep**, see below. E11 now empty |
| Migration filename / label | C5 | E12 |
| Docs: guide, package READMEs, changeset | C1, C4 | Guide names `MJ: ML …` (7×) and `PS_STORAGE_PROVIDER`; Engine/Core/Sidecar READMEs use prose names only; TruthSuite README storage paragraph **fixed**; changeset names `MJ: ML …` and `PS_STORAGE_PROVIDER` |
| Config: `.env` examples, docker files, CI workflows | C4 | E13: no Predictive Studio setting is documented in any example env, docker or workflow file, so none names the old setting |

## Stale readers found and fixed

The C4 change made model files go through the provider `PS_STORAGE_PROVIDER` names, **selected by name whatever its `IsActive` flag** (`PredictiveStudioStorage.resolveConfigured` searches `FileStorageEngine.Providers`, which loads every provider row unfiltered). The old store needed an *active* provider ("Provider ID cannot be null"), and three readers still implemented that old rule:

1. **Truth-suite harness** (`TruthSuite/src/harness/file-storage.ts`, `HarnessFileStorage`): on connect it switched on the first provider by `Priority` when none was active, and restored it at cleanup. On a fresh database that is **Azure Blob Storage** (priority 0), a provider training never uses. Removed `file-storage.ts`, its export, and the activation/restore in `run-fixtures.ts`.
2. **Training rigs** (`integration-test-suite/rigs/lib/rig-storage.ts`, `RigStorage`, called from 12 rigs) delegated to the same helper. Removed the helper and every `RigStorage.Activate` / `Restore` call. Removed `src/__tests__/rig-file-storage.test.ts`, which asserted the old rule.
3. **Docs/comments still describing the old store**:
   - TruthSuite README §Harness
   - `ps-train-pipeline-check.ts` header
   - the "local-disk artifact fallback" prerequisite in four live rigs (`ps-live-multimodel-lifecycle`, `ps-live-writeback-demo`, `ps-live-modelaction-generation`, `ps-live-recordprocess-scoring`)
   - Engine `operations/__tests__/helpers.ts` and `delegation-retrain.test.ts`, which said the deps builder "resolves the active File Storage Provider via RunView". It reads nothing now, because the storage resolves lazily.

4. **Truth-suite cleanup of model files** (`TruthSuite/src/harness/cleanup.ts`): it deleted a model's artifact `MJ: Files` rows (the model's own and every file a run's trainer result names) as rows only, which was right when the bytes lived under `PS_ARTIFACT_DIR` with no stored object. Now those files are stored objects, so each run left them behind. On this database, after Containment, Prediction Units and Training: 126 files under `predictive-studio/model-artifacts/` and 0 `MJ: Files` rows. Cleanup now deletes these files the way it already deleted snapshot files: the stored object first, then the row, and the row stays when the object cannot be deleted. One new and two updated unit tests cover this (`cleanup.test.ts`). Rerun after the fix (Prediction Units, 12/12): 0 files left on disk and 0 `MJ: Files` rows.

The behaviour is proven at runtime: every File Storage Provider on `MJ_PS_PR3_mlrename` is `IsActive = 0`, and the integration tier and truth-suite gates that train and score were run with nothing switched on (see the task report).

## Evidence

E1: old entity names
```
$ git grep -nE "MJ: (Prediction Units|Evaluation Protocols|Training Snapshots)" -- ':!plans/**'
(empty)
```
E2: plural concept names used as quoted strings
```
$ git grep -nE "['\"\`](Prediction Units|Evaluation Protocols|Training Snapshots)['\"\`]" -- ':!plans/**'
packages/Angular/Explorer/dashboards/src/PredictiveStudio/predictive-studio.nav.ts:26:  { key: 'units', label: 'Prediction Units', … }
packages/Angular/Explorer/dashboards/src/PredictiveStudio/predictive-studio.nav.ts:27:  { key: 'protocols', label: 'Evaluation Protocols', … }
```
E3: old class identifiers
```
$ git grep -nE "(^|[^A-Za-z])MJ(PredictionUnit|EvaluationProtocol|TrainingSnapshot)" -- ':!plans/**'
(empty)
```
E4: old views and procs
```
$ git grep -nE "(vw|spCreate|spUpdate|spDelete)(PredictionUnit|EvaluationProtocol|TrainingSnapshot)s?" -- ':!plans/**'
(empty)
```
E5: old constraint and extended-property names
```
$ git grep -nE "level1name = N'(PredictionUnit|EvaluationProtocol|TrainingSnapshot)'|(PK|UQ|CK|FK|DF)_(PredictionUnit|EvaluationProtocol|TrainingSnapshot)_" -- migrations
(empty)
$ git grep -nE "(__mj|\$\{[^}]*\})\.\[?(PredictionUnit|EvaluationProtocol|TrainingSnapshot)" -- '*.ts' '*.py' '*.json' '*.md' '*.sql' ':!plans/**'
(empty)
```
E6: old form keys and registration names
```
$ git grep -nE "(MJ|mj)[: ]?(PredictionUnits|EvaluationProtocols|TrainingSnapshots)" -- ':!plans/**'
(empty)
```
E7: old entity IDs
```
$ git grep -n -iE "8f160ccc|0b0c469c|947ff197" -- ':!plans/**' ':!migrations/v5/**'
(empty)
```
E8: old storage setting
```
$ git grep -n "PS_SNAPSHOT_STORAGE_PROVIDER" -- ':!plans/**'
(empty)
```
E9: removed exports
```
$ git grep -nE "(MJFilesArtifactStore|BuildArtifactStore|ResolveActiveFileStorageProviderId|LocalArtifactLoader)" -- ':!plans/**'
(empty)
```
E10: artifact-loader call sites (the member is `Load` since the final-review fixes, M2)
```
$ git grep -nE "(artifactLoader|ArtifactLoader|loader)\??\.Load\(" -- 'packages/AI/PredictiveStudio/**/*.ts'
packages/AI/PredictiveStudio/Engine/src/scoring/__tests__/storage-provider-artifact-loader.test.ts:51,58,66,71,76,81,87  (all pass TestUser and files.Provider())
packages/AI/PredictiveStudio/Engine/src/scoring/auto-train.ts:135:  this.artifactLoader.Load(row.ArtifactFileID, contextUser, provider)
packages/AI/PredictiveStudio/Engine/src/scoring/ml-model-inference-processor.ts:325:  this.deps.artifactLoader.Load(artifactFileId, context.ContextUser, context.Provider)
```
E11: readers of the old "active provider" rule (after the fix)
```
$ git grep -nE "HarnessFileStorage|RigStorage|FileStorageActivation|local-disk artifact fallback|looks up the active File Storage Provider" -- ':!plans/**' ':!.changeset/**'
(empty)
```
The changeset is excluded because it names the removed `HarnessFileStorage` / `RigStorage` on purpose
(`.changeset/ps-honest-training.md`, the line saying they are removed); without the exclusion that is the one hit.
E12: old migration filenames
```
$ git grep -nE "V2026110[0-9]{6}__v6\.[0-9]\.x__PS_Honest" -- ':!plans/**' | grep -v V202611042040
(empty)
```
E13: Predictive Studio settings in config files
```
$ git grep -nE "PREDICTIVE_STUDIO|PS_[A-Z_]+=|STORAGE_LOCAL_ROOT" -- '*.env*' '*example*' 'docker/**' 'Dockerfile*' '*.yml' '*.yaml'
(empty)
```
