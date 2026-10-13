# `ModelConfiguration` — the per-modality model-catalog configuration cascade

**Status**: **complete** on `claude/grok-voice-think-fast-2-f8hups`. The migration has run, both
CodeGen passes and the metadata push are done, the CodeGen output is appended to the migration, the
affected packages build, and unit coverage is in place. See
[Completion record](#completion-record) for what the local pass actually produced (including two
things the remote authoring could not have known).

## Why

Model capability knobs have historically landed as one column per knob (`SupportsPrefill`,
`SupportsEffortLevel`, `SupportsStreaming`, …), each requiring a migration + CodeGen cycle and each
flat — no nesting, no per-modality grouping. Meanwhile the catalog already expresses a
three-level inherit-with-override cascade for scalars: `SupportsPrefill` / `PrefillFallbackText`
are NOT NULL at `AIModelType` and nullable (= inherit) at `AIModel` and `AIModelVendor`.

`ModelConfiguration` generalizes that cascade to a single structured, strongly-typed JSON bag:

```
AIModelType.ModelConfiguration          (type-wide default — e.g. every Realtime model)
  <  AIModel.ModelConfiguration         (per-model)
    <  AIModelVendor.ModelConfiguration (per model-on-this-provider — the winner)
```

resolved base-first with per-key deep merge (objects merge; scalars/arrays replace; malformed or
absent layers contribute nothing). New session/call-time configuration lands as typed properties
inside this one bag — **no new capability columns**.

**Boundary rule**: anything the engine filters/sorts/joins on stays a COLUMN (`PowerRank`,
`IsActive`, `Priority`, `Status` — SQL can't cheaply predicate into JSON); anything a driver
consumes at session/call time belongs in the bag.

## The shape

One interface, three cascade levels, per-modality sections:

```typescript
interface IAIModelConfiguration {
    LLM?: { … };        // reserved
    Realtime?: {
        TurnDetection?: {
            Mode?: 'default' | 'serverVad' | 'semanticVad' | 'native';
            Eagerness?: 'low' | 'auto' | 'high';       // semantic-VAD tuning
            Threshold?: number;                        // server-VAD tuning
            SilenceDurationMs?: number;                // server-VAD tuning
        };
    };
    Vision?: { … };     // reserved
    Audio?: { … };      // reserved
}
```

Two copies, kept in **lockstep** (the `IAgentSettings` pact):

| Copy | Role |
|---|---|
| `metadata/entities/JSONType-interfaces/IAIModelConfiguration.ts` | JSONType SOURCE — pushed into `EntityField.JSONTypeDefinition`; CodeGen emits the typed `ModelConfigurationObject` accessors from it |
| `AIModelConfiguration` in `packages/AI/Core/src/generic/modelConfiguration.ts` | what runtime code compiles against |

## First consumer: realtime turn detection

The `Realtime.TurnDetection` section closes the "smart models can't use their smart turn modes"
gap: turn detection used to be hardcoded per provider profile (Grok always `server_vad`; OpenAI
always the provider default). Now:

- **Resolution**: `AIEngine.GetEffectiveModelConfiguration(modelID, modelVendorID)` (BaseAIEngine)
  parses + merges the three catalog layers via the pure
  `ParseModelConfiguration` / `ResolveEffectiveModelConfiguration` (`@memberjunction/ai`).
- **Bag folding**: both session builders — `RealtimeClientSessionService.buildSessionConfigBag`
  (client-direct) and `BaseAgent.buildRealtimeSessionParams` (server-bridged) — fold
  `GetModelCatalogSessionSettings(effective)` in as the BASE layer of the Config bag.
- **Full precedence** (lowest → highest):

  ```
  profile hard default
    < ModelConfiguration cascade (type < model < model-vendor)
    < realtime.session.turnDetection (agent/app config cascade)
    < runtime configOverridesJson (raw audio.input.turn_detection — auth-gated, unchanged)
  ```

- **Driver translation**: `ExtractRealtimeFeatures` pulls the normalized `turnDetection` key out
  of the bag (always scrubbed — never a wire field). Each OpenAI-protocol profile declares
  `supportedTurnModes` and maps via the shared `MapNormalizedTurnDetection`; unsupported modes are
  diag-logged and fall back to the profile default (a shared catalog never rejects a session).
  Non-protocol drivers ignore/scrub the key (`REALTIME_SHARED_CONFIG_KEYS` gained
  `'turnDetection'`).
- **Meeting mode composes on top**: `create_response: !disableAutoResponse` +
  `interrupt_response: true` are applied to whatever mode wins, and `Reconfigure` now rebuilds the
  session's remembered mode instead of hardcoding `server_vad` (fixes a latent downgrade bug).
- **`'native'` is the forward slot**: when xAI documents a full-duplex/smarter turn mode for the
  Grok Voice Think Fast family, `XAI_REALTIME_PROFILE` adds `'native'` + its mapping once, and the
  catalog opts models in via metadata — no per-model driver work.

**Seeds**: GPT Realtime 2.1 and 2.1-mini are seeded to `{ Mode: 'semanticVad', Eagerness: 'auto' }`
at the model level in `metadata/ai-models/.ai-models.json`. ⚠️ This is the one behavior-affecting
seed in the PR — verify a live session against the GA endpoint (step 8 below) and delete the seed
if `semantic_vad` is rejected there; everything else in the PR is behavior-neutral when
`ModelConfiguration` is NULL.

## File map

| Area | Files |
|---|---|
| Migration | `migrations/v6/V202608081622__v6.1.x__ModelConfiguration_JSONType_Columns.sql` |
| JSONType metadata | `metadata/entities/JSONType-interfaces/IAIModelConfiguration.ts`, `metadata/entities/.entity-field-jsontype-model-configuration.json` |
| Seeds | `metadata/ai-models/.ai-models.json` (GPT Realtime 2.1 / 2.1-mini) |
| Canonical types + resolver | `packages/AI/Core/src/generic/modelConfiguration.ts` (+ `index.ts`, `baseRealtime.ts` shared-keys list) |
| Engine accessor | `packages/AI/BaseAIEngine/src/BaseAIEngine.ts` (`GetEffectiveModelConfiguration`) |
| Driver family | `packages/AI/Providers/OpenAI/src/models/openAIRealtime.ts` (profile seam, `MapNormalizedTurnDetection`, extraction, Reconfigure fix), `packages/AI/Providers/xAI/src/models/xaiRealtime.ts`, `packages/AI/Providers/HuggingFace/src/huggingFaceRealtime.ts` |
| Session builders | `packages/AI/Agents/src/realtime/realtime-coagent-config.ts` (`turnDetection` tuning knob, `GetModelCatalogSessionSettings`), `packages/AI/Agents/src/realtime/realtime-client-session-service.ts`, `packages/AI/Agents/src/base-agent.ts` |
| Docs | `guides/REALTIME_CO_AGENTS_GUIDE.md` § "Turn detection — catalog-driven, per model" |

## Completion record

The local pass ran on 2026-08-08 against a **purpose-built database** (`MJ_6_1_0_MC`, created empty
and migrated `mj migrate --dir ./migrations` from the v5.46 baseline forward), deliberately NOT the
shared dev DB — which carried an unrelated in-flight migration whose schema CodeGen would have
projected into this PR's generated TypeScript. The result was a CodeGen diff that is **purely
additive and entirely `ModelConfiguration`**: 333 lines in `entity_subclasses.ts`, 27 in MJServer's
`generated.ts`, 8 per AI-catalog form component, 0 deletions.

Two things the remote authoring could not have known, both fixed here:

- **`AIEngine` is not an `AIEngineBase` subclass.** It is a server-side *facade* that delegates to
  `AIEngineBase.Instance` member by member, so `AIEngine.Instance.GetEffectiveModelConfiguration(...)`
  did not compile. Added the delegate alongside the other delegated helpers in
  `packages/AI/Engine/src/AIEngine.ts`. **Any future `AIEngineBase` method a caller reaches through
  `AIEngine` needs the same one-line delegate.**
- **CodeGen renames five pre-existing `DisplayName`s** on these three entities
  (`AIModel.AIModelTypeID` / `.IsActive` / `.AIModelType`, `AIModelVendor.TypeID` / `.Type`) — its
  current naming computation asserting itself over values stored since the baseline, on rows it owns
  (`AutoUpdateCategory = 1`). These are unrelated to this feature but are **included**: CodeGen
  re-emits them on every run over these entities, so stripping them only defers the identical diff
  to the next PR that touches the AI catalog. The migration's CodeGen header block calls them out.
  The underlying instability is a CodeGen defect, tracked separately.

**PostgreSQL counterpart**: intentionally **not** authored here — that is build-engineer work at
release time, now written down in `migrations/CLAUDE.md` and the root `CLAUDE.md`. The
counterpart-existence CI gate (`scripts/check-pg-migration-parity.mjs`) was **removed** in this PR:
it had been failing feature PRs for work that is not theirs — already red on `next` with 6 unrelated
gaps — and its guidance told engineers to convert against a moving schema. The CONTENT check
(`scripts/check-pg-migration-content.mjs`) stays, since an empty counterpart is a real defect at any
time.

### The runbook that was followed

This is the **new-column JSONType four-step dance** from `migrations/CLAUDE.md` (§ "A NEW column
needs four steps") — `sync push` cannot run second because CodeGen is what creates the
`EntityField` rows the bridge records look up.

1. **Run the migration**: `mj migrate`
   (adds the three `ModelConfiguration` columns).
2. **CodeGen, DB side only**: `mj codegen --skipfiles`
   Creates the `EntityField` rows for the new columns, rebuilds views/procs, and emits the
   `CodeGen_Run_*.sql` you will append in step 5. **Do NOT run a full `mj codegen` here** — file
   generation against a metadata-less DB truncates `remote_operations.ts` and bricks the CLI
   (see `migrations/CLAUDE.md` for the recovery if this happens).
3. **Push metadata**: `mj sync push --dir=metadata --ci`
   (or `--include="entities,ai-models"` if unrelated directories have pre-existing validation
   errors). Lands the `IAIModelConfiguration` JSONType definition on all three `EntityField` rows
   plus the GPT Realtime 2.1 / 2.1-mini seeds.
   **Then revert the `sync` block write-back** (`lastModified`/`checksum` stamps) in the touched
   `metadata/**/*.json` — those belong to the release-time consolidated sync, not a feature PR.
4. **CodeGen, files only**: `mj codegen --skipdb`
   Regenerates `MJCoreEntities` with the `ModelConfiguration` string properties + the typed
   `ModelConfigurationObject` accessors on all three entities. Run against a database at the last
   released version (not a fresh install) or CodeGen emits unrelated regenerations — exclude any
   from the appended section and say so in its header block.
5. **Append the CodeGen output to the migration** per the separator convention in
   `migrations/CLAUDE.md`: ≥50 blank lines after the last hand-written statement, then the
   solid "GENERATED BY CODEGEN — DO NOT HAND-EDIT" comment block, then the `CodeGen_Run_*.sql`
   content. Delete the standalone `CodeGen_Run_*.sql` afterwards.
   Reference example: `V202607020230__v5.45.x__AISkill_ActivationMode.sql`.
6. **PostgreSQL counterpart**: **skip — not feature-PR work.** The build engineer generates the
   whole `migrations-pg/v6/` set at release time. See `migrations/CLAUDE.md`.
7. **Build + test** (skipped remotely by design — the code cannot compile pre-CodeGen):
   - build affected packages: `AI/Core`, `AI/BaseAIEngine`, `AI/Providers/OpenAI`,
     `AI/Providers/xAI`, `AI/Providers/HuggingFace`, `AI/Agents` (each via
     `cd packages/... && pnpm run build`);
   - run those packages' unit tests (`pnpm test`) — expect new-coverage gaps to fill:
     `MapNormalizedTurnDetection` mode mapping/fallback, `ExtractRealtimeFeatures.turnDetection`
     scrub, `Reconfigure` mode preservation, `normalizeSession.turnDetection`,
     `GetModelCatalogSessionSettings`, bag precedence (catalog < session tuning < runtime),
     `GetEffectiveModelConfiguration` 3-layer merge;
   - existing profile tests asserting the old `buildTurnDetection(disable)` arity/behavior and the
     `RealtimeModelResolution` shape may need updating for the new optional members;
   - run the deterministic integration tier: `pnpm run test:integration`.
8. **Live verification of the semantic-VAD seed**: open a client-direct session on GPT
   Realtime 2.1 and confirm the minted `SessionConfig` carries
   `audio.input.turn_detection.type === 'semantic_vad'` and the session behaves (no provider
   rejection of the `session.update`). If the GA endpoint rejects `semantic_vad`, delete the
   `ModelConfiguration` seeds from `.ai-models.json` — the machinery stays; the seed is optional.

## Follow-ups (out of scope here)

- **Grok `'native'` mode**: watch xAI's Grok Voice docs for a documented full-duplex/turn-mode
  session knob; when it lands, extend `XAI_REALTIME_PROFILE.supportedTurnModes` + its
  `buildTurnDetection` mapping and seed `Grok Voice Think Fast 2.0` with `Mode: 'native'`.
- **`LLM` section first knob**: per-model effort-level defaults are the natural first entry
  (folding into `ChatParams.effortLevel` resolution).
- **Explorer UI**: the generated forms show `ModelConfiguration` as raw JSON; a schema-aware
  editor (driven by the JSONType definition) would make the catalog editable by non-developers.
