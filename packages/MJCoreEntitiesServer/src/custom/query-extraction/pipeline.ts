import type { QuerySyncContext, ExtractedField, ResolveResult } from "./types";
import { ParseQuerySQL } from "./parse";
import {
    ResolveCompositionReferences,
    BuildPassthroughParams,
    MergePassthroughParams,
    ExtractEntityMetadataFromSQL,
    BuildFieldsForSelectStar,
    BuildFieldsFromSelectColumns,
    EnrichFieldTypesFromCompositions,
    EnrichFieldTypesFromEntityMetadata,
} from "./resolve";
import { RunLLMEnrichment, MergeParametersWithLLM } from "./enrich";
import { SyncParameters, SyncFields, SyncEntities, SyncDependencies, RemoveAllRecords } from "./sync";
import { NO_DECLARED_QUERY_CHILDREN } from "./declared";
import { QueryEngine } from "@memberjunction/core-entities";
import { BaseEntity, LocalCacheManager } from "@memberjunction/core";
import { UUIDsEqual } from "@memberjunction/global";

/**
 * Result of running the full extraction pipeline.
 * The caller uses `usesTemplate` to update the entity's UsesTemplate flag.
 */
export interface PipelineResult {
    UsesTemplate: boolean;
}

/**
 * Runs the full query extraction pipeline:
 *   1. PARSE — single-pass SQL analysis
 *   2. RESOLVE — deterministic composition, parameter, field, and entity resolution
 *   3. ENRICH — LLM fills in descriptions and sample values (best-effort)
 *   4. MERGE — deterministic wins, LLM fills gaps
 *   5. SYNC — parallel database writes
 *
 * Throws on invalid composition references (non-existent, non-Reusable, circular).
 */
export async function RunExtractionPipeline(ctx: QuerySyncContext): Promise<PipelineResult> {
    // ── STAGE 1: PARSE ──
    const parseResult = ParseQuerySQL(ctx.sql, ctx.platform);

    // ── STAGE 2: RESOLVE ──
    const resolveResult = resolve(ctx, parseResult);

    // ── STAGE 3: ENRICH (best-effort, non-fatal; skipped on request, which merges like a failed call) ──
    const llmResult = ctx.SkipAIEnrichment
        ? null
        : await RunLLMEnrichment(ctx.sql, resolveResult.EntityMetadata, ctx.contextUser, ctx.metadataProvider);

    // ── STAGE 4: MERGE ──
    const { finalParams, finalFields } = merge(resolveResult, llmResult, parseResult, ctx);

    // ── STAGE 5: SYNC (parallel DB writes, cache slots rewritten once at the end) ──
    await runInEntityEventBatches(syncBatchOwners(ctx), () => sync(ctx, finalParams, finalFields, resolveResult));

    return {
        UsesTemplate: resolveResult.AllDeterministicParams.length > 0,
    };
}

/**
 * Removes all extraction data for a query (parameters, fields, entities, dependencies, SQL records).
 */
export async function CleanupQueryData(ctx: QuerySyncContext): Promise<void> {
    await Promise.all([
        RemoveAllRecords(ctx.queryID, 'MJ: Query Parameters', ctx.contextUser, ctx.runViewProvider, ctx.isSaved),
        RemoveAllRecords(ctx.queryID, 'MJ: Query Fields', ctx.contextUser, ctx.runViewProvider, ctx.isSaved),
        RemoveAllRecords(ctx.queryID, 'MJ: Query Entities', ctx.contextUser, ctx.runViewProvider, ctx.isSaved),
        RemoveAllRecords(ctx.queryID, 'MJ: Query Dependencies', ctx.contextUser, ctx.runViewProvider, ctx.isSaved),
        RemoveAllRecords(ctx.queryID, 'MJ: Query SQLs', ctx.contextUser, ctx.runViewProvider, ctx.isSaved),
    ]);
}

// ─── Internal stage helpers ──────────────────────────────────────────────────

function resolve(ctx: QuerySyncContext, parseResult: ReturnType<typeof ParseQuerySQL>): ResolveResult {
    const md = ctx.metadataProvider;
    const allQueries = QueryEngine.Instance.Queries;

    // Composition references
    const resolvedCompositionRefs = ResolveCompositionReferences(ctx.sql, ctx.queryName, allQueries);

    // Passthrough parameters
    const { params: passthroughParams, contextMap: passthroughContext } = BuildPassthroughParams(resolvedCompositionRefs);
    const allDeterministicParams = MergePassthroughParams(parseResult.DeterministicParams, passthroughParams);

    // Entity metadata (for LLM context and entity sync)
    const entityMetadata = ExtractEntityMetadataFromSQL(ctx.sql, parseResult.TableRefs, md, ctx.platform);

    // Field resolution: try SELECT * expansion first (uses entity metadata), fall back to explicit SELECT columns
    const resolvedFields = BuildFieldsForSelectStar(ctx.sql, parseResult.TableRefs, parseResult.SelectColumns, md)
        ?? BuildFieldsFromSelectColumns(parseResult.SelectColumns);

    return {
        ResolvedCompositionRefs: resolvedCompositionRefs,
        AllDeterministicParams: allDeterministicParams,
        PassthroughContext: passthroughContext,
        EntityMetadata: entityMetadata,
        ResolvedFields: resolvedFields,
    };
}

function merge(
    resolveResult: ResolveResult,
    llmResult: ReturnType<typeof RunLLMEnrichment> extends Promise<infer T> ? T : never,
    parseResult: ReturnType<typeof ParseQuerySQL>,
    ctx: QuerySyncContext
): { finalParams: ReturnType<typeof MergeParametersWithLLM> | null; finalFields: ExtractedField[] | null } {
    const md = ctx.metadataProvider;

    // Parameters: merge deterministic + LLM
    const finalParams = resolveResult.AllDeterministicParams.length > 0
        ? MergeParametersWithLLM(resolveResult.AllDeterministicParams, llmResult, resolveResult.PassthroughContext, ctx.parameterHints)
        : null;

    // Fields priority: deterministic (SELECT * or explicit columns) → LLM selectClause
    const resolvedFields = resolveResult.ResolvedFields;
    const llmFields = llmResult?.selectClause && Array.isArray(llmResult.selectClause) && llmResult.selectClause.length > 0
        ? llmResult.selectClause
        : null;

    // When we have deterministic fields, supplement them with LLM descriptions
    const rawFields = resolvedFields
        ? supplementDeterministicWithLLM(resolvedFields, llmFields)
        : llmFields;

    const finalFields = rawFields
        ? EnrichFieldTypesFromEntityMetadata(
              EnrichFieldTypesFromCompositions(rawFields, resolveResult.ResolvedCompositionRefs, parseResult.SelectColumns, md),
              parseResult.SelectColumns,
              parseResult.TableRefs,
              md
          )
        : null;

    return { finalParams, finalFields };
}

/**
 * The objects the sync stage's saves raise their events through. New rows use the pipeline's
 * provider. Existing rows come from `QueryEngine`'s cache and keep whatever provider they were
 * loaded or saved through: the engine's own, or, for a row an earlier request created, that
 * request's provider instance. Each distinct one gets a batch, or its saves would rewrite and
 * publish their slots one save at a time.
 */
function syncBatchOwners(ctx: QuerySyncContext): object[] {
    const engine = QueryEngine.Instance;
    const owners = new Set<object>([ctx.metadataProvider]);
    if (engine.ProviderToUse) {
        owners.add(engine.ProviderToUse);
    }
    if (engine.Loaded) {
        const existingRows: BaseEntity[] = [
            ...engine.GetQueryParameters(ctx.queryID),
            ...engine.GetQueryFields(ctx.queryID),
            ...engine.QueryEntities.filter(e => UUIDsEqual(e.QueryID, ctx.queryID)),
            ...engine.Dependencies.filter(d => UUIDsEqual(d.QueryID, ctx.queryID)),
        ];
        for (const row of existingRows) {
            if (row.ProviderToUse) {
                owners.add(row.ProviderToUse);
            }
        }
    }
    return [...owners];
}

/**
 * Runs `work` inside an entity-event batch for every owner. Each row save would otherwise rewrite
 * and publish its entity's whole shared cache slot (every field of every query, for Query Fields);
 * in a batch each slot is rewritten once when the batch closes. When `work` fails the batch closes
 * as failed and the touched slots are invalidated instead, so every server reloads them.
 */
async function runInEntityEventBatches(owners: object[], work: () => Promise<void>): Promise<void> {
    if (owners.length === 0) {
        return work();
    }
    const [owner, ...rest] = owners;
    return LocalCacheManager.Instance.RunInEntityEventBatch(owner, () => runInEntityEventBatches(rest, work));
}

async function sync(
    ctx: QuerySyncContext,
    finalParams: ReturnType<typeof MergeParametersWithLLM> | null,
    finalFields: ExtractedField[] | null,
    resolveResult: ResolveResult
): Promise<void> {
    const syncPromises: Promise<void>[] = [];
    const declared = ctx.DeclaredChildren ?? NO_DECLARED_QUERY_CHILDREN;

    // Parameters
    if (finalParams) {
        syncPromises.push(SyncParameters(ctx.queryID, finalParams, ctx.contextUser, ctx.metadataProvider, ctx.runViewProvider, ctx.isSaved, declared.ParameterNames));
    } else if (declared.ParameterNames.size > 0) {
        // No parameter in the SQL, but the save declared some: sync an empty list so the declared
        // rows stay and only the undeclared ones go.
        syncPromises.push(SyncParameters(ctx.queryID, [], ctx.contextUser, ctx.metadataProvider, ctx.runViewProvider, ctx.isSaved, declared.ParameterNames));
    } else {
        syncPromises.push(RemoveAllRecords(ctx.queryID, 'MJ: Query Parameters', ctx.contextUser, ctx.runViewProvider, ctx.isSaved));
    }

    // Fields: when finalFields is null, preserve existing fields instead of deleting them.
    // Deletion only happens when we have a positive new field list (handled inside SyncFields via diff).
    if (finalFields) {
        syncPromises.push(SyncFields(ctx.queryID, finalFields, ctx.contextUser, ctx.metadataProvider, ctx.runViewProvider, ctx.isSaved, ctx.platform, declared.FieldNames));
    }
    // When finalFields is null, we intentionally do NOT call RemoveAllRecords — existing fields are preserved.

    // Entities
    if (resolveResult.EntityMetadata.length > 0) {
        syncPromises.push(SyncEntities(ctx.queryID, resolveResult.EntityMetadata, ctx.contextUser, ctx.metadataProvider, ctx.runViewProvider, ctx.isSaved, declared.EntityKeys));
    } else if (declared.EntityKeys.size > 0) {
        syncPromises.push(SyncEntities(ctx.queryID, [], ctx.contextUser, ctx.metadataProvider, ctx.runViewProvider, ctx.isSaved, declared.EntityKeys));
    } else {
        syncPromises.push(RemoveAllRecords(ctx.queryID, 'MJ: Query Entities', ctx.contextUser, ctx.runViewProvider, ctx.isSaved));
    }

    // Dependencies
    syncPromises.push(SyncDependencies(ctx.queryID, resolveResult.ResolvedCompositionRefs, ctx.contextUser, ctx.metadataProvider, ctx.runViewProvider, ctx.isSaved));

    // Wait for every write before failing, so the enclosing event batch closes after the last one
    // instead of while some are still in flight.
    const outcomes = await Promise.allSettled(syncPromises);
    const failure = outcomes.find((o): o is PromiseRejectedResult => o.status === 'rejected');
    if (failure) {
        throw failure.reason;
    }
}

/**
 * Supplements deterministic fields with richer descriptions from LLM output.
 * The deterministic field list is authoritative for names; the LLM may provide
 * better descriptions, type hints, and computation descriptions.
 */
function supplementDeterministicWithLLM(
    resolvedFields: ExtractedField[],
    llmFields: ExtractedField[] | null
): ExtractedField[] {
    if (!llmFields || llmFields.length === 0) return resolvedFields;

    const llmByName = new Map<string, ExtractedField>();
    for (const lf of llmFields) {
        llmByName.set(lf.name.toLowerCase(), lf);
    }

    return resolvedFields.map(df => {
        const llmMatch = llmByName.get(df.name.toLowerCase());
        if (!llmMatch) return df;

        return {
            ...df,
            // LLM provides richer descriptions than the deterministic defaults
            description: llmMatch.description || df.description,
            // LLM may provide a better type guess for expression columns
            type: df.isComputed ? (llmMatch.type || df.type) : df.type,
            // LLM may identify summary/computed nature better
            isSummary: llmMatch.isSummary ?? df.isSummary,
            computationDescription: llmMatch.computationDescription ?? df.computationDescription,
            // LLM may identify source entity for columns the parser can't resolve
            sourceEntity: df.sourceEntity ?? llmMatch.sourceEntity,
        };
    });
}
