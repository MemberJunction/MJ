import { IMetadataProvider, LogError, UserInfo } from "@memberjunction/core";
import type { QuerySyncContext, ExtractedField, ResolveResult } from "./types";
import { parseQuerySQL } from "./parse";
import {
    ResolveCompositionReferences,
    BuildPassthroughParams,
    MergePassthroughParams,
    ExtractEntityMetadataFromSQL,
    BuildFieldsForSelectStar,
    EnrichFieldTypesFromCompositions,
    EnrichFieldTypesFromEntityMetadata,
    DetectDependencyCycles,
} from "./resolve";
import { RunLLMEnrichment, MergeParametersWithLLM } from "./enrich";
import { SyncParameters, SyncFields, SyncEntities, SyncDependencies, RemoveAllRecords } from "./sync";

/**
 * Result of running the full extraction pipeline.
 * The caller uses `usesTemplate` to update the entity's UsesTemplate flag.
 */
export interface PipelineResult {
    usesTemplate: boolean;
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
    const parseResult = parseQuerySQL(ctx.sql);

    // ── STAGE 2: RESOLVE ──
    const resolveResult = resolve(ctx, parseResult);

    // ── STAGE 3: ENRICH (best-effort, non-fatal) ──
    const llmResult = await RunLLMEnrichment(
        ctx.sql,
        resolveResult.entityMetadata,
        ctx.contextUser,
        ctx.metadataProvider
    );

    // ── STAGE 4: MERGE ──
    const { finalParams, finalFields } = merge(resolveResult, llmResult, parseResult, ctx);

    // ── STAGE 5: SYNC (parallel DB writes) ──
    await sync(ctx, finalParams, finalFields, resolveResult);

    return {
        usesTemplate: resolveResult.allDeterministicParams.length > 0,
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

function resolve(ctx: QuerySyncContext, parseResult: ReturnType<typeof parseQuerySQL>): ResolveResult {
    const md = ctx.metadataProvider;
    const allQueries = md.Queries;

    // Composition references
    const resolvedCompositionRefs = ResolveCompositionReferences(ctx.sql, ctx.queryName, allQueries);

    // Passthrough parameters
    const { params: passthroughParams, contextMap: passthroughContext } = BuildPassthroughParams(resolvedCompositionRefs);
    const allDeterministicParams = MergePassthroughParams(parseResult.deterministicParams, passthroughParams);

    // Entity metadata (for LLM context and entity sync)
    const entityMetadata = ExtractEntityMetadataFromSQL(ctx.sql, parseResult.tableRefs, md);

    // Field resolution: SELECT * expansion or null
    const selectStarFields = BuildFieldsForSelectStar(ctx.sql, parseResult.tableRefs, parseResult.selectColumns, md);

    return {
        resolvedCompositionRefs,
        allDeterministicParams,
        passthroughContext,
        entityMetadata,
        selectStarFields,
    };
}

function merge(
    resolveResult: ResolveResult,
    llmResult: ReturnType<typeof RunLLMEnrichment> extends Promise<infer T> ? T : never,
    parseResult: ReturnType<typeof parseQuerySQL>,
    ctx: QuerySyncContext
): { finalParams: ReturnType<typeof MergeParametersWithLLM> | null; finalFields: ExtractedField[] | null } {
    const md = ctx.metadataProvider;

    // Parameters: merge deterministic + LLM
    const finalParams = resolveResult.allDeterministicParams.length > 0
        ? MergeParametersWithLLM(resolveResult.allDeterministicParams, llmResult, resolveResult.passthroughContext, ctx.parameterHints)
        : null;

    // Fields: use SELECT * expansion or LLM select clause, then enrich
    const rawFields = resolveResult.selectStarFields
        ?? (llmResult?.selectClause && Array.isArray(llmResult.selectClause) && llmResult.selectClause.length > 0
            ? llmResult.selectClause
            : null);

    const finalFields = rawFields
        ? EnrichFieldTypesFromEntityMetadata(
              EnrichFieldTypesFromCompositions(rawFields, resolveResult.resolvedCompositionRefs, parseResult.selectColumns, md),
              parseResult.selectColumns,
              parseResult.tableRefs,
              md
          )
        : null;

    return { finalParams, finalFields };
}

async function sync(
    ctx: QuerySyncContext,
    finalParams: ReturnType<typeof MergeParametersWithLLM> | null,
    finalFields: ExtractedField[] | null,
    resolveResult: ResolveResult
): Promise<void> {
    const syncPromises: Promise<void>[] = [];

    // Parameters
    if (finalParams) {
        syncPromises.push(SyncParameters(ctx.queryID, finalParams, ctx.contextUser, ctx.metadataProvider, ctx.runViewProvider, ctx.isSaved));
    } else {
        syncPromises.push(RemoveAllRecords(ctx.queryID, 'MJ: Query Parameters', ctx.contextUser, ctx.runViewProvider, ctx.isSaved));
    }

    // Fields
    if (finalFields) {
        syncPromises.push(SyncFields(ctx.queryID, finalFields, ctx.contextUser, ctx.metadataProvider, ctx.runViewProvider, ctx.isSaved));
    } else {
        syncPromises.push(RemoveAllRecords(ctx.queryID, 'MJ: Query Fields', ctx.contextUser, ctx.runViewProvider, ctx.isSaved));
    }

    // Entities
    if (resolveResult.entityMetadata.length > 0) {
        syncPromises.push(SyncEntities(ctx.queryID, resolveResult.entityMetadata, ctx.contextUser, ctx.metadataProvider, ctx.runViewProvider, ctx.isSaved));
    } else {
        syncPromises.push(RemoveAllRecords(ctx.queryID, 'MJ: Query Entities', ctx.contextUser, ctx.runViewProvider, ctx.isSaved));
    }

    // Dependencies
    syncPromises.push(SyncDependencies(ctx.queryID, resolveResult.resolvedCompositionRefs, ctx.contextUser, ctx.metadataProvider, ctx.runViewProvider, ctx.isSaved));

    await Promise.all(syncPromises);
}
