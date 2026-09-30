/**
 * feature-pipeline-type-measurement.ts — compares the `LLM` and `Decision` Feature Pipeline types on
 * one real classification task with objective labels (plan Task 5.5): accuracy against the labels
 * (with a bootstrap CI), per-value recall, agreement between the types, repeatability, wall time and
 * cost per 1,000 records, Decision's calibration, and an escalation simulation (plan 5.4).
 *
 * The label is a value already stored on the record, for example an `MJ: Actions` row's Category,
 * predicted from its Name and Description. For a foreign key the label is the view's name column
 * (`Category`, not `CategoryID`); the rig resolves that from the entity metadata.
 *
 * WHAT IT RUNS. Two in-memory specs, identical except for `PipelineType` (and the prompt each type
 * runs), each with one enum output whose `ValueDescriptions` are each value's own description (for a
 * category, its `Description`; the value itself when there is none, which the report says). For each
 * rep and each type, a new processor runs the sample through `ProcessBatch` in batches of
 * `--batch-size` (RecordSetProcessor's default is 100), timed around each call: a plain
 * `InferProcessor` for Decision, and for LLM one that adds the value descriptions to its prompt data
 * (`CreateMeasurementProcessor` in `../src/pipeline-type-measurement/processors.ts`).
 *
 * WHAT IT NEVER DOES. It never writes a record back. The output's target is the label column only
 * because a Decision pipeline supports field targets alone. `InferProcessor.ProcessBatch` does not
 * write back: write-back is the `WriteBackProcessor` wrapper's job (`writeBack.ts`, reached only
 * through `RecordProcessExecutor.BuildProcessor`), and this rig never builds one. It runs with
 * `WritesHistory = false`, no `recordProcessID` (so no `MJ: Feature Values` rows) and
 * `Caching.Cacheable = false` (so no `MJ: Feature Value Cache` rows). The only rows a live run writes
 * are the `MJ: AI Prompt Runs` rows the prompt runners always write.
 *
 * PROMPT DATA (what the LLM prompt must be written to). Both types get the processor's prompt data:
 *
 *   {
 *     record: { <primary key field(s), e.g. ID>, <each --text-fields field, e.g. Name, Description> },
 *     constraints: "<the constraint block>",       // renderConstraintBlock(spec.Outputs)
 *     ConstraintBlock: "<the same text>"
 *   }
 *
 * The label field is never in `record`. The constraint block names the output (`- **Category**
 * ($.Category):`) and lists the allowed values. The LLM prompt must answer with a JSON object keyed
 * by the output's Name, which is the label column: `{ "Category": "<one of --values>" }`.
 *
 * THE VALUE DESCRIPTIONS reach both types. Decision receives the prompt data canonicalised as its
 * state, and one Choice question whose options carry the descriptions. For LLM, the constraint block
 * lists each allowed value with its description (`* "System": <description>`), and
 * `valueDescriptions` holds them as `{ <output Name>: { <value>: <description> } }`. The rig cannot see
 * the LLM prompt's template, so the template must render `{{ constraints }}`; it need not, and should
 * not, list the values or descriptions itself. A template that works for any entity:
 *
 *   You classify one record into exactly one allowed value of each output listed below.
 *
 *   ## The record
 *
 *   {% for key, value in record %}{% if key != 'ID' and key != 'RecordID' and key != 'EntityID' %}- **{{ key }}:** {{ value }}
 *   {% endif %}{% endfor %}
 *
 *   {{ constraints }}
 *
 *   ## Response
 *
 *   Respond with a JSON object and nothing else. Its keys are the output names listed in the
 *   constraints above (the bold names), and each value is exactly one of that output's allowed values.
 *   Add no other keys and no explanation.
 *
 * Bind it to one chat model, with `ResponseFormat` JSON.
 *
 * MODELS. The rig does not pin a model: each arm's prompt bindings choose, as in production, so a
 * model with no API key is skipped and a failing one fails over. `Default Decision` binds Jev first and
 * LLM Decision second, so without an OpenRouter key (or after a failover) "Decision" is LLM Decision.
 * Each answer's model is read from its prompt run (`Model`), recorded per record in `report.json`, and
 * checked against the model the arm is meant to measure: `--llm-model` / `--decision-model`, or else
 * the prompt's first-choice binding. Any other model is a warning at the top of both reports; with
 * `--require-model` it stops the run, after that arm's first batch or, if it happens later, at the end
 * (the report is still written).
 *
 * COST. Each prompt run's `TotalCost` (own plus descendant cost), falling back to `Cost`, read once
 * the rows reach a final status (their finalize save sets status and cost together). A Decision
 * failover or delegated chat run is a child prompt run whose cost reaches the parent's `TotalCost` only
 * on branches that carry #4880; the report says so.
 *
 * OUTPUT. `report.md` and `report.json` in `--out`, which must be outside every git working tree. The
 * report holds record IDs, labels, the value descriptions and numbers, never a measured record's text.
 * The logic (sampling, specs, processors, metrics, report) lives in `../src/pipeline-type-measurement/`
 * and is unit-tested there.
 *
 * THE DATABASE. The rig connects to whatever `mj.config.cjs` `databaseSettings` or the repo-root `.env`
 * `DB_*` name. Every run, dry run included, first prints that database (name, host and port, never a
 * credential). It then refuses a database whose name has none of the words that mark a development or
 * clean-room one (`dev`, `test`, `clean`, `local`, `sandbox`, … — see `db-guard.ts`), because a live
 * run writes prompt runs there and sends the `--text-fields` of its records to outside model vendors.
 * `--allow-db <name>` allows it, and must name the configured database exactly.
 *
 * USAGE (from the repo root, which holds `.env` for the database):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/feature-pipeline-type-measurement.ts \
 *     --entity "MJ: Actions" --text-fields Name,Description --label-field Category \
 *     --values "System,Data,Utilities,File Storage" --llm-prompt "Decision Eval - Action Category (LLM)" \
 *     [--decision-prompt "Default Decision"] [--llm-model "<model>"] [--decision-model Jev] [--require-model] \
 *     [--sample 200] [--reps 2] [--seed 7] [--batch-size 100] [--allow-db <database name>] \
 *     --out <dir outside any repo> [--dry-run]
 *
 * `--dry-run` prints the database, reads it to draw the sample, then prints the sample size, the
 * per-value counts, the value descriptions, the expected models and the planned calls, and runs no
 * prompt.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { CompositeKey, EntityFieldInfo, EntityInfo, RunView } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import type { RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';
import { BootstrapAI, Settle } from './lib/ai-bootstrap';
import type { AICtx } from './lib/ai-bootstrap';
import { LoadDbConfig, LoadEnv } from './lib/harness';
import type { DbConfig } from './lib/harness';
import { IsPromptRunFinished, PROMPT_RUN_COST_FIELDS, ToPromptRunCost } from '../src/pipeline-type-measurement/cost-and-time';
import type { PromptRunCostRow } from '../src/pipeline-type-measurement/cost-and-time';
import { FirstChoiceModel } from '../src/pipeline-type-measurement/models';
import { CreateMeasurementProcessor } from '../src/pipeline-type-measurement/processors';
import { RunMeasurementRig } from '../src/pipeline-type-measurement/rig';
import type { RigSession } from '../src/pipeline-type-measurement/rig';
import type { BatchProcessor, MeasurementBackend, MeasurementIO } from '../src/pipeline-type-measurement/run';
import { CanonicalLabel } from '../src/pipeline-type-measurement/sampling';
import { AssertTextFieldsExcludeLabel, ResolveLabelColumn } from '../src/pipeline-type-measurement/spec';
import type { LabelColumnResolution, LabelFieldStub } from '../src/pipeline-type-measurement/spec';
import type {
    ArmPrompt, CandidateSet, LabeledRecord, MeasuredPipelineType, MeasurementOptions, MeasurementSpec, PromptRunCost,
} from '../src/pipeline-type-measurement/types';

/** How long to wait for the prompt runs' fire-and-forget saves before reading what is there. */
const SAVE_WAIT_MS = 120_000;
/** How often to re-read prompt runs that have not finished saving. */
const SAVE_POLL_MS = 2_000;
/** IDs per `IN (…)` filter. */
const ID_CHUNK = 500;

/** A row of the measured entity, as `RunView` returns it with `ResultType: 'simple'`. */
type EntityRow = Record<string, unknown>;

/** The console, the wall clock and the file system. */
const CONSOLE_IO: MeasurementIO = {
    Log: (line) => console.log(line),
    Now: () => performance.now(),
    Timestamp: () => new Date().toISOString(),
    WriteFile: (path, content) => {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, 'utf8');
    },
};

/** The live backend: MJ metadata, `RunView`, `AIEngine` and `InferProcessor`. It keeps record text to itself. */
class LiveMeasurementBackend implements MeasurementBackend {
    /** Each sampled candidate's prompt fields (primary key and text fields), by RecordID. Never the label. */
    private readonly promptFields = new Map<string, EntityRow>();
    private resolution: LabelColumnResolution | undefined;

    constructor(private readonly options: MeasurementOptions, private readonly ctx: AICtx) {}

    public async LoadCandidates(): Promise<CandidateSet> {
        const entity = this.entity();
        const resolution = ResolveLabelColumn(entity.Fields.map(toLabelFieldStub), this.options.LabelField);
        AssertTextFieldsExcludeLabel(this.options.TextFields, resolution);
        this.resolution = resolution;
        const textFields = this.options.TextFields.map((name) => fieldNamed(entity, name).Name);
        const rows = await this.loadCandidateRows(entity, textFields, resolution.LabelColumn);
        const records = rows.flatMap((row) => this.keepCandidate(entity, textFields, resolution.LabelColumn, row));
        return { LabelColumn: resolution.LabelColumn, Records: records };
    }

    public async LoadDescriptionSources(values: readonly string[]): Promise<Record<string, string | null>> {
        const resolution = this.requireResolution();
        if (resolution.RelatedEntity) {
            return this.loadRelatedDescriptions(resolution.RelatedEntity, values);
        }
        const field = fieldNamed(this.entity(), resolution.LabelColumn);
        return Object.fromEntries((field.EntityFieldValues ?? []).map((v) => [v.Value, v.Description ?? null]));
    }

    public async ResolvePrompts(): Promise<Record<MeasuredPipelineType, ArmPrompt>> {
        await AIEngine.Instance.Config(false, this.ctx.user);
        return { LLM: armPrompt(this.options.LLMPromptName), Decision: armPrompt(this.options.DecisionPromptName) };
    }

    public CreateBatchProcessor(type: MeasuredPipelineType, spec: MeasurementSpec): BatchProcessor {
        // WritesHistory off; for LLM, the value descriptions in the prompt data.
        const processor = CreateMeasurementProcessor(type, spec);
        const entityID = this.entity().ID;
        // No recordProcessID or processRunID: nothing about this run is recorded as a pipeline run.
        const context: RecordProcessorContext = { contextUser: this.ctx.user, provider: this.ctx.provider, entityID };
        return { ProcessBatch: (ids) => processor.ProcessBatch(ids.map((id) => this.recordRef(entityID, id)), context) };
    }

    public async ReadPromptRunCosts(promptRunIDs: readonly string[]): Promise<Map<string, PromptRunCost>> {
        const deadline = Date.now() + SAVE_WAIT_MS;
        let rows = await this.readPromptRuns(promptRunIDs);
        while (promptRunIDs.some((id) => !IsPromptRunFinished(rows.get(id))) && Date.now() < deadline) {
            await Settle(SAVE_POLL_MS);
            rows = await this.readPromptRuns(promptRunIDs);
        }
        return new Map(promptRunIDs.map((id) => [id, ToPromptRunCost(id, rows.get(id))]));
    }

    private entity(): EntityInfo {
        const entity = this.ctx.provider.EntityByName(this.options.EntityName);
        if (!entity) {
            throw new Error(`Entity '${this.options.EntityName}' not found in metadata.`);
        }
        return entity;
    }

    private requireResolution(): LabelColumnResolution {
        if (!this.resolution) {
            throw new Error('LoadCandidates must run before the value descriptions are loaded.');
        }
        return this.resolution;
    }

    /** The entity's rows whose label is one of the values: primary key, text fields and label only. */
    private async loadCandidateRows(entity: EntityInfo, textFields: string[], labelColumn: string): Promise<EntityRow[]> {
        const result = await new RunView(this.ctx.provider).RunView<EntityRow>({
            EntityName: entity.Name,
            Fields: [...entity.PrimaryKeys.map((pk) => pk.Name), ...textFields, labelColumn],
            ExtraFilter: `${labelColumn} IN (${sqlList(this.options.Values)})`,
            ResultType: 'simple',
            BypassCache: true,
        }, this.ctx.user);
        if (!result.Success) {
            throw new Error(`Loading ${entity.Name} failed: ${result.ErrorMessage}`);
        }
        return result.Results;
    }

    /** Keeps a row's prompt fields (never its label) and returns its ID and canonical label. */
    private keepCandidate(entity: EntityInfo, textFields: string[], labelColumn: string, row: EntityRow): LabeledRecord[] {
        const raw = row[labelColumn];
        const label = CanonicalLabel(this.options.Values, typeof raw === 'string' ? raw : null);
        if (!label) {
            return [];
        }
        const recordID = CompositeKey.FromEntityRecord(entity, row).ToCompactURLSegment();
        const fields = [...entity.PrimaryKeys.map((pk) => pk.Name), ...textFields];
        this.promptFields.set(recordID, Object.fromEntries(fields.map((f) => [f, row[f] ?? null])));
        return [{ RecordID: recordID, Label: label }];
    }

    /** A fresh RecordRef carrying a copy of the record's prompt fields, so the processor needs no reload. */
    private recordRef(entityID: string, recordID: string): RecordRef {
        return { EntityID: entityID, RecordID: recordID, Record: { ...this.promptFields.get(recordID) } };
    }

    /** Each value's description from the related entity (for a category, its Description). */
    private async loadRelatedDescriptions(relatedEntityName: string, values: readonly string[]): Promise<Record<string, string | null>> {
        const related = this.ctx.provider.EntityByName(relatedEntityName);
        const nameField = related?.NameField;
        const descriptionField = related?.Fields.find((f) => f.Name.toLowerCase() === 'description');
        if (!related || !nameField || !descriptionField) {
            console.log(`${relatedEntityName} has no name field or no Description field; every value will describe itself.`);
            return {};
        }
        const result = await new RunView(this.ctx.provider).RunView<EntityRow>({
            EntityName: related.Name,
            Fields: [nameField.Name, descriptionField.Name],
            ExtraFilter: `${nameField.Name} IN (${sqlList(values)})`,
            ResultType: 'simple',
            BypassCache: true,
        }, this.ctx.user);
        if (!result.Success) {
            throw new Error(`Loading ${related.Name} descriptions failed: ${result.ErrorMessage}`);
        }
        return firstDescriptionPerName(result.Results, nameField.Name, descriptionField.Name);
    }

    /** The prompt runs' cost rows, by ID (fresh from the database, never from a cache). */
    private async readPromptRuns(ids: readonly string[]): Promise<Map<string, PromptRunCostRow>> {
        const rows = new Map<string, PromptRunCostRow>();
        for (let i = 0; i < ids.length; i += ID_CHUNK) {
            const result = await new RunView(this.ctx.provider).RunView<PromptRunCostRow>({
                EntityName: 'MJ: AI Prompt Runs',
                Fields: [...PROMPT_RUN_COST_FIELDS],
                ExtraFilter: `ID IN (${sqlList(ids.slice(i, i + ID_CHUNK))})`,
                ResultType: 'simple',
                BypassCache: true,
            }, this.ctx.user);
            if (!result.Success) {
                throw new Error(`Reading MJ: AI Prompt Runs failed: ${result.ErrorMessage}`);
            }
            result.Results.forEach((row) => rows.set(row.ID.toLowerCase(), row));
        }
        // Keyed by the IDs as the caller has them; the database may return a UUID in another case.
        const byCallerID = new Map<string, PromptRunCostRow>();
        for (const id of ids) {
            const row = rows.get(id.toLowerCase());
            if (row) {
                byCallerID.set(id, row);
            }
        }
        return byCallerID;
    }
}

function toLabelFieldStub(field: EntityFieldInfo): LabelFieldStub {
    return { Name: field.Name, RelatedEntity: field.RelatedEntity || null, RelatedEntityNameFieldMap: field.RelatedEntityNameFieldMap || null };
}

function fieldNamed(entity: EntityInfo, name: string): EntityFieldInfo {
    const field = entity.Fields.find((f) => f.Name.toLowerCase() === name.trim().toLowerCase());
    if (!field) {
        throw new Error(`'${name}' is not a field of ${entity.Name}.`);
    }
    return field;
}

/** The one AI prompt with this name (trimmed, case-insensitive). */
function promptIDNamed(name: string): string {
    const wanted = name.trim().toLowerCase();
    const matches = AIEngine.Instance.Prompts.filter((p) => p.Name?.trim().toLowerCase() === wanted);
    if (matches.length !== 1) {
        throw new Error(`Expected exactly one AI prompt named '${name}', found ${matches.length}.`);
    }
    return matches[0].ID;
}

/** The prompt with this name, and the model its bindings try first. */
function armPrompt(name: string): ArmPrompt {
    const promptID = promptIDNamed(name);
    const bindings = AIEngine.Instance.PromptModels.filter((pm) => UUIDsEqual(pm.PromptID, promptID));
    return { PromptID: promptID, FirstChoiceModel: FirstChoiceModel(bindings) };
}

/** A SQL `IN` list of escaped string literals. */
function sqlList(values: readonly string[]): string {
    return values.map((v) => `'${EscapeSQLString(v)}'`).join(', ');
}

/** Name to description, taking the first non-empty description when several rows share a name. */
function firstDescriptionPerName(rows: EntityRow[], nameField: string, descriptionField: string): Record<string, string | null> {
    const descriptions: Record<string, string | null> = {};
    for (const row of rows) {
        const name = row[nameField];
        const text = row[descriptionField];
        if (typeof name !== 'string') {
            continue;
        }
        if (name in descriptions) {
            console.log(`More than one row is named '${name}'; using the first non-empty description.`);
        }
        descriptions[name] = descriptions[name] || (typeof text === 'string' && text.trim() ? text : null);
    }
    return descriptions;
}

/** Connects to the database the guards allowed, and wraps it in the live backend. */
async function connect(db: DbConfig, options: MeasurementOptions): Promise<RigSession> {
    const ctx = await BootstrapAI(db);
    return { Backend: new LiveMeasurementBackend(options, ctx), Close: () => ctx.pool.close() };
}

async function main(): Promise<number> {
    // Prints the target database, and refuses a repo output path or a non-development database, before connecting.
    await RunMeasurementRig(process.argv.slice(2), {
        LoadDatabaseTarget: async () => {
            LoadEnv();
            return LoadDbConfig();
        },
        Connect: connect,
        IO: CONSOLE_IO,
    });
    return 0;
}

main().then(
    (code) => process.exit(code),
    (error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
);
