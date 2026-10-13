import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { AIEngine } from "@memberjunction/aiengine";
import { BaseEntity, CompositeKey, EntityField, IMetadataProvider, RunView, UserInfo } from "@memberjunction/core";
import type { MJAIAgentExampleEntity, MJAIAgentNoteEntity, MJComponentEntity, MJQueryEntity, MJTagEntity } from "@memberjunction/core-entities";
import { EscapeSQLString, RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { FunctionRecordProcessor, RecordSetProcessor } from "@memberjunction/record-set-processor";
import { KeysetSource, RecordRef, RecordResult } from "@memberjunction/record-set-processor-base";

/** A stored-vector column and the column naming the model that produced it. */
interface ColumnPair {
    Vector: string;
    Model: string;
}

/** A column pair whose names are checked against the entity's generated class. */
function columns<T extends BaseEntity>(vector: keyof T & string, model: keyof T & string): ColumnPair {
    return { Vector: vector, Model: model };
}

/** The entities whose server save hooks embed with the default local model, so a save re-embeds a stale row. */
const TARGETS: ReadonlyArray<{ EntityName: string; Columns: ColumnPair[] }> = [
    { EntityName: 'MJ: AI Agent Notes', Columns: [columns<MJAIAgentNoteEntity>('EmbeddingVector', 'EmbeddingModelID')] },
    { EntityName: 'MJ: AI Agent Examples', Columns: [columns<MJAIAgentExampleEntity>('EmbeddingVector', 'EmbeddingModelID')] },
    { EntityName: 'MJ: Tags', Columns: [columns<MJTagEntity>('EmbeddingVector', 'EmbeddingModelID')] },
    { EntityName: 'MJ: Queries', Columns: [columns<MJQueryEntity>('EmbeddingVector', 'EmbeddingModelID')] },
    {
        EntityName: 'MJ: Components',
        Columns: [
            columns<MJComponentEntity>('FunctionalRequirementsVector', 'FunctionalRequirementsVectorEmbeddingModelID'),
            columns<MJComponentEntity>('TechnicalDesignVector', 'TechnicalDesignVectorEmbeddingModelID'),
        ],
    },
];

type Target = (typeof TARGETS)[number];

/** One entity's counts, as reported in the `Report` output. A dry run fills in only `Found`. */
interface EntityReport {
    EntityName: string;
    /** Rows to re-embed: vectors from another model, or every stored vector with Force. */
    Found: number;
    Reembedded: number;
    Failed: number;
    /** Why the entity's run stopped early (e.g. the error-rate circuit breaker). */
    Error?: string;
}

/**
 * Re-embeds persisted local vectors (agent notes and examples, tags, queries, components) that were
 * produced by a model other than the platform's default local embedding model. Run it after changing
 * `MJ_DEFAULT_LOCAL_EMBEDDING_MODEL`, and with Force after an upgrade that changed what a local model
 * produces. Safe to re-run: without Force, rows already on the default model are skipped. Restart the
 * MJ server processes afterwards so their in-memory indexes reload the new vectors.
 *
 * Each row is loaded and saved through the record set processor; the entity's server subclass sees the
 * stale model (`IsEmbeddingStale`) and re-embeds the row with its own text rules. Entity search
 * vectors (`MJ: Entity Record Documents`) are not covered: entity vector sync re-embeds those.
 *
 * From the CLI: `mj ai actions run -n "Re-embed Local Vectors" --param "DryRun=true"`.
 *
 * Params:
 *   - EntityNames (optional): entity names, comma-separated or an array; default all
 *   - DryRun (optional, default false): count the rows without saving
 *   - Force (optional, default false): re-embed every stored local vector, even those recorded as the
 *     default model
 * Output:
 *   - Report: `{ ModelName, DryRun, Force, Entities: EntityReport[] }`
 */
@RegisterClass(BaseAction, "Re-embed Local Vectors")
export class ReembedLocalVectorsAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const { ContextUser: contextUser, Provider: provider } = params;
            await AIEngine.Instance.Config(false, contextUser, provider);
            const model = AIEngine.Instance.DefaultLocalEmbeddingModel;
            if (!model) {
                throw new Error('No active local embedding model is configured, so there is nothing to re-embed to.');
            }
            const targets = this.targets(params);
            const dryRun = this.booleanParam(params, 'dryrun');
            const force = this.booleanParam(params, 'force');
            if (!dryRun && !(await AIEngine.Instance.EmbedTextLocal('re-embed preflight'))) {
                // A model that can't load would fail every row, and Force would churn every row's model column.
                throw new Error(`The default local embedding model "${model.Name}" could not embed a test text, so no rows were changed. Check the server log for the model load error.`);
            }

            const entities: EntityReport[] = [];
            for (const target of targets) {
                const filter = this.filter(target, model.ID, force);
                entities.push(dryRun
                    ? await this.count(target, filter, contextUser, provider)
                    : await this.reembed(target, filter, model.ID, force, contextUser, provider));
            }
            params.Params.push({ Name: 'Report', Type: 'Output', Value: { ModelName: model.Name, DryRun: dryRun, Force: force, Entities: entities } });

            const counts = entities.map(e => dryRun
                ? `${e.EntityName}: ${e.Found} to re-embed`
                : `${e.EntityName}: ${e.Reembedded} re-embedded, ${e.Failed} failed${e.Error ? ` (${e.Error})` : ''}`);
            const message = `${dryRun ? 'Dry run — ' : ''}${force ? 'Forced — ' : ''}target model ${model.Name}. ${counts.join('; ')}`;
            return entities.some(e => e.Failed > 0 || e.Error)
                ? { Success: false, ResultCode: 'PARTIAL_FAILURE', Message: message }
                : { Success: true, ResultCode: 'SUCCESS', Message: message };
        } catch (error) {
            return { Success: false, ResultCode: 'FAILED', Message: error instanceof Error ? error.message : String(error) };
        }
    }

    /** Rows holding a vector from a model other than `modelID` or an unrecorded one; with `force`, any stored vector. */
    private filter(target: Target, modelID: string, force: boolean): string {
        const id = EscapeSQLString(modelID);
        return target.Columns
            .map(c => force
                ? `(${c.Vector} IS NOT NULL)`
                : `(${c.Vector} IS NOT NULL AND (${c.Model} IS NULL OR ${c.Model} <> '${id}'))`)
            .join(' OR ');
    }

    private async count(target: Target, filter: string, contextUser: UserInfo, provider: IMetadataProvider | undefined): Promise<EntityReport> {
        const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
        const result = await rv.RunView({ EntityName: target.EntityName, ExtraFilter: filter, ResultType: 'count_only' }, contextUser);
        if (!result.Success) {
            throw new Error(`${target.EntityName}: ${result.ErrorMessage}`);
        }
        return { EntityName: target.EntityName, Found: result.TotalRowCount, Reembedded: 0, Failed: 0 };
    }

    private async reembed(
        target: Target,
        filter: string,
        modelID: string,
        force: boolean,
        contextUser: UserInfo,
        provider: IMetadataProvider | undefined
    ): Promise<EntityReport> {
        const run = await RecordSetProcessor.Instance.Process({
            source: new KeysetSource(target.EntityName, filter),
            processor: new FunctionRecordProcessor((record, ctx) => this.reembedRow(target, record, ctx.provider, ctx.contextUser, modelID, force)),
            contextUser,
            provider,
            configuration: { Action: 'Re-embed Local Vectors', ModelID: modelID, Force: force },
        });
        return {
            EntityName: target.EntityName,
            Found: run.Processed,
            Reembedded: run.Success,
            Failed: run.Error,
            ...(run.Status === 'Completed' ? {} : { Error: run.ErrorMessage ?? run.Status }),
        };
    }

    /**
     * Loads the row fresh and saves it, so its server subclass re-embeds the stale vector. Succeeds when
     * every column that held a vector still holds one, now from `modelID`. With `force`, the model
     * columns are cleared first so the subclass treats the vectors as stale; if that re-embed fails,
     * they are put back, so a failed row is left as it was.
     */
    private async reembedRow(
        target: Target,
        record: RecordRef,
        provider: IMetadataProvider,
        contextUser: UserInfo,
        modelID: string,
        force: boolean
    ): Promise<RecordResult> {
        const entity = await provider.GetEntityObject<BaseEntity>(target.EntityName, contextUser);
        if (!(await entity.InnerLoad(CompositeKey.FromURLSegment(entity.EntityInfo, record.RecordID)))) {
            return { Status: 'Failed', ErrorMessage: 'Record not found' };
        }
        const embedded = target.Columns
            .map(c => ({ vector: entity.GetFieldByName(c.Vector), model: entity.GetFieldByName(c.Model) }))
            .filter((c): c is { vector: EntityField; model: EntityField } => c.vector?.Value != null && c.model != null);
        const storedModels = embedded.map(c => c.model.Value);
        if (force) {
            embedded.forEach(c => { c.model.Value = null; });
        }
        if (!(await entity.Save())) {
            return { Status: 'Failed', ErrorMessage: entity.LatestResult?.CompleteMessage ?? 'Save failed' };
        }
        if (embedded.every(c => c.vector.Value != null && UUIDsEqual(c.model.Value, modelID))) {
            return { Status: 'Succeeded' };
        }
        if (force) {
            embedded.forEach((c, i) => { if (c.model.Value == null) c.model.Value = storedModels[i]; });
            if (!(await entity.Save())) {
                return { Status: 'Failed', ErrorMessage: `Not re-embedded, and its model ID was left empty: ${entity.LatestResult?.CompleteMessage ?? 'save failed'}` };
            }
        }
        return { Status: 'Failed', ErrorMessage: 'The row was not re-embedded by the default model; see the server log' };
    }

    /** The requested targets; an unknown name is an error rather than a silent no-op. */
    private targets(params: RunActionParams): Target[] {
        const value = params.Params.find(p => p.Name.trim().toLowerCase() === 'entitynames')?.Value;
        const names = (Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(',') : [])
            .map(n => n.trim().toLowerCase())
            .filter(n => n.length > 0);
        if (names.length === 0) {
            return [...TARGETS];
        }
        const unknown = names.filter(n => !TARGETS.some(t => t.EntityName.toLowerCase() === n));
        if (unknown.length > 0) {
            throw new Error(`Not a locally embedded entity: ${unknown.join(', ')}. Choose from: ${TARGETS.map(t => t.EntityName).join(', ')}.`);
        }
        return TARGETS.filter(t => names.includes(t.EntityName.toLowerCase()));
    }

    private booleanParam(params: RunActionParams, lowerName: string): boolean {
        const value = params.Params.find(p => p.Name.trim().toLowerCase() === lowerName)?.Value;
        return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
    }
}
