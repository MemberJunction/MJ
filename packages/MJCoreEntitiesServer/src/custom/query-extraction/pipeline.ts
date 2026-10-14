import type { QuerySyncContext, ExtractedField, ExtractedParameter, ParameterExtractionResult, ResolveResult } from "./types";
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
import { QueryParameterEnricher } from "./enrich";
import { SyncParameters, SyncFields, SyncEntities, SyncDependencies, RemoveAllRecords } from "./sync";
import { QueryEngine } from "@memberjunction/core-entities";

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
 *   3. ENRICH — AI fills in descriptions and sample values (best-effort; skipped when
 *      `ctx.SkipAIEnrichment` is set)
 *   4. MERGE — deterministic wins, AI fills gaps
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
    const aiResult = ctx.SkipAIEnrichment
        ? null
        : await QueryParameterEnricher.RunAIEnrichment(
              ctx.sql,
              resolveResult.EntityMetadata,
              ctx.contextUser,
              ctx.metadataProvider
          );

    // ── STAGE 4: MERGE ──
    const { finalParams, finalFields } = merge(resolveResult, aiResult, parseResult, ctx);

    // ── STAGE 5: SYNC (parallel DB writes) ──
    await sync(ctx, finalParams, finalFields, resolveResult);

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

    // Entity metadata (for AI context and entity sync)
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
    aiResult: ParameterExtractionResult | null,
    parseResult: ReturnType<typeof ParseQuerySQL>,
    ctx: QuerySyncContext
): { finalParams: ExtractedParameter[] | null; finalFields: ExtractedField[] | null } {
    const md = ctx.metadataProvider;

    // Parameters: merge deterministic + AI
    const finalParams = resolveResult.AllDeterministicParams.length > 0
        ? QueryParameterEnricher.MergeParameters(resolveResult.AllDeterministicParams, aiResult, resolveResult.PassthroughContext, ctx.parameterHints)
        : null;

    // Fields priority: deterministic (SELECT * or explicit columns) → AI selectClause
    const resolvedFields = resolveResult.ResolvedFields;
    const aiFields = aiResult?.selectClause && Array.isArray(aiResult.selectClause) && aiResult.selectClause.length > 0
        ? aiResult.selectClause
        : null;

    // When we have deterministic fields, supplement them with AI descriptions
    const rawFields = resolvedFields
        ? supplementDeterministicWithAI(resolvedFields, aiFields)
        : aiFields;

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

async function sync(
    ctx: QuerySyncContext,
    finalParams: ExtractedParameter[] | null,
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

    // Fields: when finalFields is null, preserve existing fields instead of deleting them.
    // Deletion only happens when we have a positive new field list (handled inside SyncFields via diff).
    if (finalFields) {
        syncPromises.push(SyncFields(ctx.queryID, finalFields, ctx.contextUser, ctx.metadataProvider, ctx.runViewProvider, ctx.isSaved, ctx.platform));
    }
    // When finalFields is null, we intentionally do NOT call RemoveAllRecords — existing fields are preserved.

    // Entities
    if (resolveResult.EntityMetadata.length > 0) {
        syncPromises.push(SyncEntities(ctx.queryID, resolveResult.EntityMetadata, ctx.contextUser, ctx.metadataProvider, ctx.runViewProvider, ctx.isSaved));
    } else {
        syncPromises.push(RemoveAllRecords(ctx.queryID, 'MJ: Query Entities', ctx.contextUser, ctx.runViewProvider, ctx.isSaved));
    }

    // Dependencies
    syncPromises.push(SyncDependencies(ctx.queryID, resolveResult.ResolvedCompositionRefs, ctx.contextUser, ctx.metadataProvider, ctx.runViewProvider, ctx.isSaved));

    await Promise.all(syncPromises);
}

/**
 * Supplements deterministic fields with richer descriptions from AI output.
 * The deterministic field list is authoritative for names; the AI may provide
 * better descriptions, type hints, and computation descriptions.
 */
function supplementDeterministicWithAI(
    resolvedFields: ExtractedField[],
    aiFields: ExtractedField[] | null
): ExtractedField[] {
    if (!aiFields || aiFields.length === 0) return resolvedFields;

    const aiByName = new Map<string, ExtractedField>();
    for (const lf of aiFields) {
        aiByName.set(lf.name.toLowerCase(), lf);
    }

    return resolvedFields.map(df => {
        const aiMatch = aiByName.get(df.name.toLowerCase());
        if (!aiMatch) return df;

        return {
            ...df,
            // AI provides richer descriptions than the deterministic defaults
            description: aiMatch.description || df.description,
            // AI may provide a better type guess for expression columns
            type: df.isComputed ? (aiMatch.type || df.type) : df.type,
            // AI may identify summary/computed nature better
            // ?? on purpose: false is a real isSummary answer and must win over the deterministic guess.
            isSummary: aiMatch.isSummary ?? df.isSummary,
            computationDescription: aiMatch.computationDescription || df.computationDescription,
            // AI may identify source entity for columns the parser can't resolve
            sourceEntity: df.sourceEntity || aiMatch.sourceEntity,
        };
    });
}
