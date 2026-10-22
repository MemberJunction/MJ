# @memberjunction/record-cloning

## 6.2.0-edge.5

### Minor Changes

- ce758af: Feature Pipelines: keyed, versioned Feature Values and honest runs (migration `V202610201100__v6.2.x__Feature_Value_Key_And_Versions.sql`).
  - Feature Values upsert on a key (record, feature, pipeline version, prompt version, primary model, parameters, input); a value a person entered (`Source='Human'`) is never overwritten unless the run sets `overwriteHumanValues`. Child write-back can `reconcile` rows on a key.
  - `MJ: Feature Pipeline Versions` registers each pipeline pin; a gated pipeline runs only under a version whose golden-set result meets its threshold. The `Steward Feature Pipeline Version` Action (`StewardFeaturePipelineVersionAction`) and `Feature Pipeline Version Steward` Record Process (`WorkType='Action'`, scheduled via `RecordProcessScheduledJobDriver`) evaluate and backfill changed versions; golden sets carry a label-quality record, `Required` and `ExpectAbstain` cases.
  - New `@memberjunction/feature-pipelines-engine` package houses server-side Feature Pipeline execution (`InferProcessor`, `BaseFeaturePipelineDriver`, `LLMFeaturePipelineDriver`, `DecisionFeaturePipelineDriver`, `FeaturePipelineEscalation`, `FeaturePipelineHumanValueGuard`, `FeaturePipelineErrors`), golden-set testing (`FeaturePipelineGoldenSetDriver`, `golden-set-scoring`, `golden-label-quality`), and version stewardship (`FeaturePipelineVersionSteward`, `StewardFeaturePipelineVersionAction`, `RegisterInferRecordProcessor`), keeping `@memberjunction/record-set-processor-base`, `@memberjunction/record-set-processor`, `@memberjunction/scheduling-engine`, and `@memberjunction/testing-engine` free of Feature Pipeline dependencies.
  - Outputs are checked against `lookup` constraints (per item with `ItemRef`); an output below its `MinConfidence` is withheld (`OnLowConfidence: 'null'`); `Context.RecordAsUserMessage` sends the record as a JSON user turn.
  - Dry runs write nothing, preview only what the real write would change, cap at 25 records and report `WouldRefuse`; a Feature Pipeline run with a failed record ends `Failed` with a `FeaturePipelineRunResult` summary; the breaker counts attempted records.
  - An output may omit its write target (builder target mode `Feature value only (no write-back)`): the answer is stored in `MJ: Feature Values` only, typed by its constraint (`numeric`/`money`, `boolean`, `date`), and no entity field is written. The Bulk Operations dry-run dialog shows each as a `<Feature> (feature value)` row with the previous and proposed value, and loads only the non-skipped details so a large scope counts every changed record.
  - A Feature Values panel on every record form shows the latest answer per pipeline and feature (Source, Confidence, version, Computed, Reasoning) and expands to its history; a latest answer that withheld its value reads "no value". `@memberjunction/ng-base-forms` re-resolves the form chrome when a panel mounts after first render, so a late panel gets its left-nav entry.
  - The Version Steward beats on a timer while its backfill runs, defers a backfill while a run is Running, marks only a clean run as backfilled, and ignores a Running Process Run not checkpointed for 30 minutes. A Feature Value insert that loses the race on its key to an equal value is `Unchanged`.
  - Bedrock sends a configured temperature of 0 as 0 (F-FP-13).
  - `AIPromptParams.templateAutoescape` (set by the Feature Pipeline drivers) renders a prompt template without HTML escaping; a Feature Pipeline run reads its prompt's template from the database at run start, so a template edit takes effect on the next run.
  - API moves & PascalCase standardization: `WriteBackResult`, `TagWriteBackPreview`, `FieldRulesResultPayload`, and `MetadataProviderCapabilities` live in `@memberjunction/record-set-processor-base`; `FeaturePipelineRunResults` lives in `@memberjunction/feature-pipelines`; `RunRecordProcessOptions`, `RecordProcessorContext`, `RecordSetProcessOptions`, `ProcessRunSummary`, and `WriteBackValuePreview` use `PascalCase` properties across `@memberjunction/record-set-processor-base` and `@memberjunction/record-set-processor`.

### Patch Changes

- Updated dependencies [0d81c53]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [db39145]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [5465489]
- Updated dependencies [d29b5c2]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [2274f42]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [7e72c86]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [8420f36]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/record-set-processor-base@6.2.0-edge.5
  - @memberjunction/record-cloning-base@6.2.0-edge.5
  - @memberjunction/record-graph@6.2.0-edge.5

## 6.2.0-edge.4

### Minor Changes

- 0e5a4cd: Template users: an account set up to be copied, with its pinned apps, views, settings, dashboards and Skip conversations, so a new user starts with all of it.
  - **`User.IsTemplate`** (migration). The User form shows it under Account Settings. A copy is never a template itself.
  - **The `template` preset on `MJ: Users`** copies a template user whole: views, settings, dashboards with their categories and links, conversations with their messages, and the artifacts and versions in them. Dashboard layouts, pinned items and artifact references point at the copies. The planner refuses the preset for any user not flagged `IsTemplate` (`TEMPLATE_SOURCE_REQUIRED`), so one person's private work is never copied to another. Only a template-mode preset may open a Locked edge or copy an entity marked `CloneableFromTemplate` (conversations and their messages); request overrides still cannot.
  - **First sign-in.** `userHandling.newUserTemplate: { email, preset }` in `mj.config.cjs` makes MJAPI create each new user as a copy of that template. Any problem falls back to a plain user, so sign-in never breaks.
  - **`mj user clone`** creates a user as a copy of another: `--from`, `--email`, `--first`, `--last`, `--preset` (default `template`), `--inactive`, `--dry-run`.
  - **Open Apps can ship a template user.** `templateUser: { email, description?, preset?, newUsers?: offer | always | never }` in `mj-app.json`. After install, the installer gets their own copy, from `MJ_INSTALL_USER_EMAIL` / `_FIRST_NAME` / `_LAST_NAME` or prompts. The template can also be set for later sign-ins (`MJ_INSTALL_TEMPLATE_FOR_NEW_USERS`). The step only warns on failure; it never fails the install.
  - **Explorer** shows a red banner while a template user is signed in, because everything changed there reaches every later copy.

  Fixes found on the way:
  - **CurrentUser** now returns `IsTemplate`, `FirstLast` and the `Employee*` fields. It returned null for every `UserInfo` field missing from its hand-written list. The list is now `SessionUserFields`, with a test that it covers every field the client requests.
  - **Artifact version saves inside a transaction.** `MJArtifactVersionEntityServer` read attributes through the global provider. On a server's per-request provider, inside a clone's transaction, each read waited about 30 s on the transaction's own locks. A 23-version copy took 11 minutes instead of seconds. It now reads through the entity's provider.
  - **Copies keep their rows' order.** The dependency walker reads children oldest first (`__mj_CreatedAt`). A row whose remapped column points only at its own ancestors, such as a copied user's messages naming the new user, now saves within the graph save instead of after it. Copied conversations kept their messages, but showed each answer above its question.
  - **User copies keep dashboard and view names.** The entities' `(copy)` rename applies only where a name could collide. A user copy owns its rows, so the rename only mislabelled them.
  - Record cloning: `Child.JoinField` preset keys, case-insensitive key lookup in JSON remap, Golden Layout and top-level-array JSON remap paths, and a descendant's `JsonRemap` merged with the entity's own.
  - A conversation message can be created during a clone save (`CloneContext`) by a user who doesn't own the conversation yet. Updates and deletes are still checked.

### Patch Changes

- Updated dependencies [a709bb6]
- Updated dependencies [432cb73]
- Updated dependencies [1d6e3e8]
- Updated dependencies [49f26d9]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [7316ac3]
- Updated dependencies [08b3d7b]
- Updated dependencies [21175fa]
- Updated dependencies [1ea4085]
- Updated dependencies [aee2d53]
- Updated dependencies [25f7b82]
- Updated dependencies [90829e3]
- Updated dependencies [aac148b]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/record-set-processor-base@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/record-cloning-base@6.2.0-edge.4
  - @memberjunction/record-graph@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [ec97ad4]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/record-cloning-base@6.2.0-edge.3
  - @memberjunction/record-graph@6.2.0-edge.3
  - @memberjunction/record-set-processor-base@6.2.0-edge.3

## 6.2.0-edge.2

### Minor Changes

- 7e57b48: Introduce `@memberjunction/record-cloning-base` and `@memberjunction/record-cloning` engine packages.
  Includes deterministic clone planning, graph policy resolution, 12-stage field transformation pipeline, SHA-256 plan hash validation, transactional entity graph materialization, and remote operation handlers (RecordClone.Describe, RecordClone.Plan, RecordClone.Execute, and RecordClone.GetLineage).
  - A bare child key in a root's `Relationships` (`"MJ: AI Agent Actions"`) applies only to edges from the root's entity. Relationship-ID and `"<Child>.<JoinField>"` keys apply at any depth. The validator refuses a bare key that names no relationship of the root.
  - A row that points at another new row (a step path at a later step, a step at a copied sub-agent) is saved after that row.
  - A plan warns with `CHILD_ROWS_UNREADABLE` when the rows of an edge it copies can't be read, instead of planning a copy without them.

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [2552b1e]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [664baea]
- Updated dependencies [0adaf76]
- Updated dependencies [ef43cf3]
- Updated dependencies [b44c7cf]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/record-set-processor-base@6.2.0-edge.2
  - @memberjunction/record-cloning-base@6.2.0-edge.2
  - @memberjunction/record-graph@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
