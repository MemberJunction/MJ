/**
 * runquery-catalog.checks.ts — the 'runquery-catalog' bundle (QC1–QC6): run EVERY query in the
 * shipped catalog through `new RunQuery().RunQuery(...)` and pin the execution contract.
 *
 * READ-ONLY by construction — no fixtures, no lifecycle, zero DB writes: every check is a
 * catalog-query execution (SELECT) plus assertions on the returned `RunQueryResult`. The query
 * list is resolved DYNAMICALLY from `QueryEngine.Instance.Queries` (never hardcoded names), so
 * newly-seeded catalog queries are auto-covered and queries absent in a deployment skip-as-pass
 * LOUDLY (console.warn) instead of failing on an environment gap.
 *
 * ── CLASSIFICATION (runtime-derived, per test-catalog.md §0c) ───────────────────────────────
 * Approved catalog queries (integration-test fixtures excluded) split into four disjoint sets:
 *   • bare        — zero declared params, UsesTemplate=false            → QC1 (must succeed)
 *   • required    — ≥1 param with IsRequired=true                       → QC2 (bare call must FAIL clearly)
 *   • strict      — ≥1 param, no raw-SPLICE tokens                      → QC3 (derived params must succeed)
 *   • raw-splice  — ≥1 string/array/date param interpolated RAW (no `|` filter pipe — identifier
 *                   splicing like `[{{ SchemaName }}].[{{ BaseView }}]`) → QC4 (fed REAL identifiers
 *                   from a live EntityInfo: success OR clean SQL error, NEVER an unhandled throw)
 * QC5 pins the AppliedParameters echo; QC6 pins templated-but-param-less queries (composition-only
 * must succeed; residual variable tokens = the param-metadata round-trip gap → loud skip, RQ-C6).
 *
 * Raw NUMBER/BOOLEAN tokens (e.g. `DATEADD(DAY, -{{lookbackDays}}, ...)`) are NOT splice-risky:
 * the QueryParameterProcessor type-converts them to real numbers/bits before rendering, so those
 * queries stay in the strict set and must fully succeed.
 *
 * Parameter values are derived from each query's OWN parameter metadata (`MJ: Query Parameters`:
 * Type + SampleValue), with identifier-role params (SchemaName/BaseView/EntityID/...) resolved
 * against a real, deterministically-picked EntityInfo so raw-identifier queries execute against
 * genuine schema objects (test-catalog RQ-C4). Zero-row results are a PASS — the contract under
 * test is execution + shape, not data volume.
 */
import { RunQuery } from '@memberjunction/core';
import type { EntityInfo, IMetadataProvider, RunQueryParams, RunQueryResult, UserInfo } from '@memberjunction/core';
import { QueryEngine } from '@memberjunction/core-entities';
import type { MJQueryEntityExtended, MJQueryParameterEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, RowKeys } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

// ── shared vocabulary (exported — the runquery-params bundle reuses these helpers) ──────────

/** A value shape every derived parameter fits (matches QueryParameter.Type's 5-value union). */
export type SafeParamValue = string | number | boolean | Array<string | number>;

/** One catalog query plus its runtime-derived parameter classification. */
export interface CatalogQueryClass {
    /** The engine's extended query entity (child getters read the QueryEngine cache). */
    Query: MJQueryEntityExtended;
    /** Comment-stripped base SQL — the text raw-token detection runs against. */
    StrippedSQL: string;
    /** All declared parameter definitions for the query. */
    Params: MJQueryParameterEntity[];
    /** The subset with IsRequired=true. */
    RequiredParams: MJQueryParameterEntity[];
    /** Params whose token appears RAW in the SQL — `{{ name }}` with no `|` filter pipe. */
    RawParams: MJQueryParameterEntity[];
    /** Raw params that splice TEXT into SQL (string/array/date types) — the identifier hotspot. */
    RawSpliceParams: MJQueryParameterEntity[];
    /** True when the query is the referencing side of ≥1 composition dependency. */
    HasDependencies: boolean;
}

/** The outcome envelope for a catalog run — a throw is DATA here, not an abort. */
export interface QueryRunOutcome {
    Result?: RunQueryResult;
    Threw: boolean;
    Error?: string;
}

/** How many offenders to print in a failure message (the COUNT carries the rest). */
const SAMPLE_SIZE = 8;

/** Cap per-row shape scanning so huge result sets don't dominate runtime. */
const SHAPE_SCAN_LIMIT = 500;

/** Loud skip-as-pass — an environment gap is announced, never silent. */
export function SkipAsPass(checkId: string, reason: string): void {
    console.warn(`  ⚠ ${checkId} SKIPPED (pass) — ${reason}`);
}

/** Escape a literal for embedding in a RegExp. */
function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strip SQL comments before token scanning — the server's RenderPipeline strips them before
 * Nunjucks too (Step 1.5), so tokens inside `--`/`/* *​/` comments are documentation, not code.
 */
export function StripSqlComments(sql: string | null): string {
    return (sql ?? '')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--[^\n]*/g, ' ');
}

/** True when the param's token appears RAW (no filter pipe) in the comment-stripped SQL. */
function isRawToken(strippedSql: string, paramName: string): boolean {
    return new RegExp(`\\{\\{\\s*${escapeRegExp(paramName)}\\s*\\}\\}`).test(strippedSql);
}

/** True for queries created by OTHER integration bundles (runquery-cache fixtures, etc.). */
function isIntegrationFixtureQuery(q: MJQueryEntityExtended): boolean {
    return /integration test/i.test(q.CategoryPath) || /^CacheTest /.test(q.Name);
}

/**
 * Load + classify the shipped catalog: Approved queries (minus integration-bundle fixtures),
 * deterministically ordered by CategoryPath/Name. Uses the lazy-load engine pattern —
 * `Config(false, ...)` is a no-op when already loaded.
 */
export async function LoadCatalog(ctx: IntegrationCheckContext): Promise<CatalogQueryClass[]> {
    await QueryEngine.Instance.Config(false, ctx.User, ctx.Provider);
    const catalog: CatalogQueryClass[] = [];
    for (const q of QueryEngine.Instance.Queries) {
        if (q.Status !== 'Approved' || isIntegrationFixtureQuery(q)) {
            continue;
        }
        const strippedSql = StripSqlComments(q.SQL);
        const params = QueryEngine.Instance.GetQueryParameters(q.ID);
        const rawParams = params.filter(p => isRawToken(strippedSql, p.Name));
        catalog.push({
            Query: q,
            StrippedSQL: strippedSql,
            Params: params,
            RequiredParams: params.filter(p => p.IsRequired === true),
            RawParams: rawParams,
            RawSpliceParams: rawParams.filter(p => p.Type === 'string' || p.Type === 'array' || p.Type === 'date'),
            HasDependencies: QueryEngine.Instance.Dependencies.some(d => UUIDsEqual(d.QueryID, q.ID))
        });
    }
    catalog.sort((a, b) => `${a.Query.CategoryPath}/${a.Query.Name}`.localeCompare(`${b.Query.CategoryPath}/${b.Query.Name}`));
    return catalog;
}

/**
 * Deterministically pick a real entity for identifier-role parameters: non-virtual, API-visible,
 * single-column PK, physical base view, carrying the __mj timestamp pair (so CreatedAtField /
 * UpdatedAtField roles resolve). Sorted by Name → the same entity every run.
 */
export function PickReferenceEntity(provider: IMetadataProvider): EntityInfo | undefined {
    const candidates = provider.Entities.filter(e =>
        !e.VirtualEntity &&
        e.IncludeInAPI &&
        !!e.BaseView &&
        !!e.SchemaName &&
        e.PrimaryKeys.length === 1 &&
        e.Fields.some(f => f.Name.toLowerCase() === '__mj_createdat') &&
        e.Fields.some(f => f.Name.toLowerCase() === '__mj_updatedat')
    );
    candidates.sort((a, b) => a.Name.localeCompare(b.Name));
    return candidates[0];
}

/**
 * Identifier-role values for the raw-splice params the shipped catalog uses (External Change
 * Detection / geocode): resolved from a REAL EntityInfo so the spliced identifiers reference
 * genuine schema objects (test-catalog RQ-C4 — "fed real SchemaName/BaseView/EntityID").
 * Returns undefined for names with no identifier role (falls through to type derivation).
 */
function identifierRoleValue(paramName: string, entity: EntityInfo): string | undefined {
    const pk = entity.PrimaryKeys[0]?.Name ?? 'ID';
    switch (paramName.trim().toLowerCase()) {
        case 'schemaname': return entity.SchemaName;
        case 'baseview': return entity.BaseView;
        case 'entityid': return entity.ID;
        case 'createdatfield': return '__mj_CreatedAt';
        case 'updatedatfield': return '__mj_UpdatedAt';
        case 'primarykeyjoin': return `ot.${pk}`;
        case 'primarykeyorderby': return `ot.${pk}`;
        case 'primarykeyisnull': return `ot.${pk} IS NULL`;
        default: return undefined;
    }
}

/**
 * Derive a safe, valid value for one parameter from its OWN metadata: identifier role first
 * (real EntityInfo), then SampleValue coerced per the declared Type, then a benign typed
 * fallback. Never invents SQL — string fallbacks are inert literals.
 */
export function DeriveSafeValue(param: MJQueryParameterEntity, refEntity: EntityInfo | undefined): SafeParamValue {
    if (refEntity) {
        const role = identifierRoleValue(param.Name, refEntity);
        if (role !== undefined) {
            return role;
        }
    }
    const sample = param.SampleValue?.trim() ?? '';
    switch (param.Type) {
        case 'number': {
            const n = sample === '' ? Number.NaN : Number(sample);
            return Number.isFinite(n) ? n : 1;
        }
        case 'date': {
            const parsed = sample === '' ? Number.NaN : Date.parse(sample);
            return Number.isNaN(parsed) ? '2024-01-01T00:00:00.000Z' : sample;
        }
        case 'boolean':
            return sample.toLowerCase() !== 'false';
        case 'array': {
            try {
                const parsed: unknown = sample === '' ? undefined : JSON.parse(sample);
                if (Array.isArray(parsed) && parsed.length > 0 &&
                    parsed.every((el): el is string | number => typeof el === 'string' || typeof el === 'number')) {
                    return parsed;
                }
            } catch {
                // fall through to the benign fixed array (e.g. the seeded truncated '[' sample)
            }
            return ['00000000-0000-0000-0000-000000000000'];
        }
        case 'string':
        default:
            return sample !== '' ? sample : 'mj-integration-test';
    }
}

/** Derive a complete, valid Parameters bag for a classified catalog query. */
export function DeriveAllParams(cls: CatalogQueryClass, refEntity: EntityInfo | undefined): Record<string, SafeParamValue> {
    const bag: Record<string, SafeParamValue> = {};
    for (const p of cls.Params) {
        bag[p.Name] = DeriveSafeValue(p, refEntity);
    }
    return bag;
}

/** Run one catalog query, converting a throw into data — sweeps must never abort mid-flight. */
export async function RunCatalogQuery(params: RunQueryParams, user: UserInfo): Promise<QueryRunOutcome> {
    try {
        const result = await new RunQuery().RunQuery(params, user);
        return { Result: result, Threw: false };
    } catch (e) {
        return { Threw: true, Error: e instanceof Error ? e.message : String(e) };
    }
}

/**
 * Shape sanity for a SUCCESSFUL result: Results is an array, RowCount is truthful,
 * TotalRowCount is coherent, and every row (bounded scan) has the same non-empty key set.
 * Zero rows pass — the shape contract is about what IS returned.
 */
export function AssertSaneResultShape(label: string, result: RunQueryResult): void {
    Assert(Array.isArray(result.Results), `${label}: Results must be an array`);
    AssertEqual(result.RowCount, result.Results.length, `${label}: RowCount must equal Results.length`);
    Assert(result.TotalRowCount >= result.RowCount,
        `${label}: TotalRowCount (${result.TotalRowCount}) must be >= RowCount (${result.RowCount})`);
    if (result.Results.length > 0) {
        const firstRow = result.Results[0] as Record<string, unknown>;
        const shape = RowKeys(firstRow);
        Assert(shape.length > 0, `${label}: result rows must have at least one column`);
        const scanCount = Math.min(result.Results.length, SHAPE_SCAN_LIMIT);
        for (let i = 1; i < scanCount; i++) {
            const rowShape = RowKeys(result.Results[i] as Record<string, unknown>);
            Assert(rowShape.length === shape.length && rowShape.every((k, idx) => k === shape[idx]),
                `${label}: row ${i} key shape [${rowShape.join(',')}] differs from row 0 [${shape.join(',')}]`);
        }
    }
}

/** Aggregate offenders and throw once with count + bounded sample (metadata-consistency style). */
function failOnOffenders(checkLabel: string, offenders: string[], exercised: number): void {
    if (offenders.length > 0) {
        const sample = offenders.slice(0, SAMPLE_SIZE).join('\n    ');
        throw new Error(`${checkLabel}: ${offenders.length} of ${exercised} catalog quer${exercised === 1 ? 'y' : 'ies'} failed:\n    ${sample}`);
    }
    console.log(`      → ${checkLabel}: ${exercised} catalog quer${exercised === 1 ? 'y' : 'ies'} exercised, all clean`);
}

/** Label a query for offender messages — path + name + ID prefix is unambiguous. */
function queryLabel(cls: CatalogQueryClass): string {
    return `'${cls.Query.CategoryPath}/${cls.Query.Name}' (${cls.Query.ID.slice(0, 8)})`;
}

// ── the ordered runquery-catalog bundle ─────────────────────────────────────────────────────

export const RunQueryCatalogChecks: NamedCheck[] = [
    {
        Id: 'runquery-catalog.QC1',
        Name: 'QC1: every no-param catalog query runs bare — Success, truthful counts, consistent row shape',
        Fn: async (ctx): Promise<void> => {
            const catalog = await LoadCatalog(ctx);
            Assert(catalog.length > 0 || QueryEngine.Instance.Queries.length === 0,
                'catalog classification must not drop every Approved query');
            if (catalog.length === 0) {
                SkipAsPass('runquery-catalog.QC1', 'no Approved catalog queries in this deployment (seed metadata/queries)');
                return;
            }
            const bare = catalog.filter(c => c.Params.length === 0 && !c.Query.UsesTemplate);
            if (bare.length === 0) {
                SkipAsPass('runquery-catalog.QC1', 'no zero-parameter, non-templated catalog queries in this deployment');
                return;
            }
            const offenders: string[] = [];
            for (const cls of bare) {
                const run = await RunCatalogQuery({ QueryID: cls.Query.ID }, ctx.User);
                if (run.Threw) {
                    offenders.push(`${queryLabel(cls)} THREW: ${run.Error}`);
                    continue;
                }
                const result = run.Result!;
                if (!result.Success) {
                    offenders.push(`${queryLabel(cls)} failed: ${result.ErrorMessage}`);
                    continue;
                }
                try {
                    AssertSaneResultShape(queryLabel(cls), result);
                } catch (e) {
                    offenders.push(e instanceof Error ? e.message : String(e));
                }
            }
            failOnOffenders('QC1 bare-query sweep', offenders, bare.length);
        }
    },
    {
        Id: 'runquery-catalog.QC2',
        Name: 'QC2: required-param enforcement — invoking WITHOUT params must fail clearly, never run silently',
        Fn: async (ctx): Promise<void> => {
            const catalog = await LoadCatalog(ctx);
            const required = catalog.filter(c => c.RequiredParams.length > 0);
            if (required.length === 0) {
                SkipAsPass('runquery-catalog.QC2', 'no catalog query declares a required parameter in this deployment');
                return;
            }
            const offenders: string[] = [];
            for (const cls of required) {
                // No Parameters at all — the laziest possible caller.
                const run = await RunCatalogQuery({ QueryID: cls.Query.ID }, ctx.User);
                if (run.Threw) {
                    // A thrown, described error IS a clear failure surface — but never an empty one.
                    if (!run.Error || run.Error.trim().length === 0) {
                        offenders.push(`${queryLabel(cls)} threw an EMPTY error — not a clear failure`);
                    }
                    continue;
                }
                const result = run.Result!;
                if (result.Success) {
                    offenders.push(`${queryLabel(cls)} SILENTLY SUCCEEDED without its required param(s) ` +
                        `[${cls.RequiredParams.map(p => p.Name).join(', ')}] — enforcement hole`);
                    continue;
                }
                if (!result.ErrorMessage || result.ErrorMessage.trim().length === 0) {
                    offenders.push(`${queryLabel(cls)} failed with an EMPTY ErrorMessage — not a clear failure`);
                    continue;
                }
                if (!/required|missing|parameter|validation|template/i.test(result.ErrorMessage)) {
                    offenders.push(`${queryLabel(cls)} failed but the message doesn't identify a parameter problem: ` +
                        `"${result.ErrorMessage.slice(0, 160)}"`);
                    continue;
                }
                if (Array.isArray(result.Results) && result.Results.length > 0) {
                    offenders.push(`${queryLabel(cls)} reported failure but still carried ${result.Results.length} row(s)`);
                }
            }
            failOnOffenders('QC2 required-enforcement sweep', offenders, required.length);
        }
    },
    {
        Id: 'runquery-catalog.QC3',
        Name: 'QC3: every filtered parameterized query with metadata-derived params → Success + sane shape (zero rows pass)',
        Fn: async (ctx): Promise<void> => {
            const catalog = await LoadCatalog(ctx);
            const strict = catalog.filter(c => c.Params.length > 0 && c.RawSpliceParams.length === 0);
            if (strict.length === 0) {
                SkipAsPass('runquery-catalog.QC3', 'no filtered parameterized catalog queries in this deployment');
                return;
            }
            const refEntity = PickReferenceEntity(ctx.Provider);
            const offenders: string[] = [];
            for (const cls of strict) {
                const parameters = DeriveAllParams(cls, refEntity);
                const run = await RunCatalogQuery({ QueryID: cls.Query.ID, Parameters: parameters }, ctx.User);
                if (run.Threw) {
                    offenders.push(`${queryLabel(cls)} THREW with derived params ${JSON.stringify(parameters)}: ${run.Error}`);
                    continue;
                }
                const result = run.Result!;
                if (!result.Success) {
                    offenders.push(`${queryLabel(cls)} failed with derived params ${JSON.stringify(parameters)}: ${result.ErrorMessage}`);
                    continue;
                }
                try {
                    AssertSaneResultShape(queryLabel(cls), result);
                } catch (e) {
                    offenders.push(e instanceof Error ? e.message : String(e));
                }
            }
            failOnOffenders('QC3 derived-param sweep', offenders, strict.length);
        }
    },
    {
        Id: 'runquery-catalog.QC4',
        Name: 'QC4: raw-identifier queries fed REAL schema objects → success OR clean SQL error, never an unhandled throw',
        Fn: async (ctx): Promise<void> => {
            const catalog = await LoadCatalog(ctx);
            const rawSet = catalog.filter(c => c.RawSpliceParams.length > 0);
            if (rawSet.length === 0) {
                SkipAsPass('runquery-catalog.QC4', 'no raw-identifier catalog queries in this deployment');
                return;
            }
            const refEntity = PickReferenceEntity(ctx.Provider);
            Assert(!!refEntity, 'QC4 precondition: a reference entity must be resolvable from live metadata');
            const offenders: string[] = [];
            let succeeded = 0;
            for (const cls of rawSet) {
                const parameters = DeriveAllParams(cls, refEntity);
                const run = await RunCatalogQuery({ QueryID: cls.Query.ID, Parameters: parameters }, ctx.User);
                if (run.Threw) {
                    offenders.push(`${queryLabel(cls)} THREW (must always be a clean result object): ${run.Error}`);
                    continue;
                }
                const result = run.Result!;
                if (result.Success) {
                    succeeded++;
                    try {
                        AssertSaneResultShape(queryLabel(cls), result);
                    } catch (e) {
                        offenders.push(e instanceof Error ? e.message : String(e));
                    }
                } else if (!result.ErrorMessage || result.ErrorMessage.trim().length === 0) {
                    offenders.push(`${queryLabel(cls)} failed with an EMPTY ErrorMessage — not a clean SQL error`);
                } else {
                    // A clean, described SQL error against synthesized-but-real identifiers is within
                    // contract (RQ-C4) — announce it so drift is visible in the log.
                    console.warn(`      ⚠ QC4 ${queryLabel(cls)} clean failure (allowed): ${result.ErrorMessage.slice(0, 140)}`);
                }
            }
            console.log(`      → QC4: ${rawSet.length} raw-identifier quer${rawSet.length === 1 ? 'y' : 'ies'}, ${succeeded} fully succeeded against '${refEntity!.Name}'`);
            failOnOffenders('QC4 raw-identifier sweep', offenders, rawSet.length);
        }
    },
    {
        Id: 'runquery-catalog.QC5',
        Name: 'QC5: AppliedParameters echoes every supplied key on a successful parameterized run',
        Fn: async (ctx): Promise<void> => {
            const catalog = await LoadCatalog(ctx);
            const strict = catalog.filter(c => c.Params.length > 0 && c.RawSpliceParams.length === 0);
            if (strict.length === 0) {
                SkipAsPass('runquery-catalog.QC5', 'no filtered parameterized catalog queries in this deployment');
                return;
            }
            const refEntity = PickReferenceEntity(ctx.Provider);
            for (const cls of strict) {
                const parameters = DeriveAllParams(cls, refEntity);
                const run = await RunCatalogQuery({ QueryID: cls.Query.ID, Parameters: parameters }, ctx.User);
                if (run.Threw || !run.Result!.Success) {
                    continue; // QC3 owns failures; QC5 only needs ONE successful run to pin the echo
                }
                const result = run.Result!;
                const applied = result.AppliedParameters;
                Assert(applied !== undefined && applied !== null,
                    `${queryLabel(cls)}: a successful parameterized run must carry AppliedParameters`);
                const appliedKeys = new Set(Object.keys(applied as Record<string, unknown>));
                const missing = Object.keys(parameters).filter(k => !appliedKeys.has(k));
                Assert(missing.length === 0,
                    `${queryLabel(cls)}: AppliedParameters must echo every supplied key — missing [${missing.join(', ')}]; ` +
                    `echoed [${[...appliedKeys].join(', ')}]`);
                console.log(`      → QC5 pinned on ${queryLabel(cls)}: ${appliedKeys.size} key(s) echoed`);
                return;
            }
            SkipAsPass('runquery-catalog.QC5', 'no parameterized catalog query succeeded with derived params (QC3 reports the failures)');
        }
    },
    {
        Id: 'runquery-catalog.QC6',
        Name: 'QC6: templated no-param queries — composition-only must succeed; residual variable tokens = param-metadata gap (loud)',
        Fn: async (ctx): Promise<void> => {
            const catalog = await LoadCatalog(ctx);
            const templatedNoParam = catalog.filter(c => c.Params.length === 0 && c.Query.UsesTemplate);
            if (templatedNoParam.length === 0) {
                SkipAsPass('runquery-catalog.QC6', 'no templated zero-parameter catalog queries in this deployment');
                return;
            }
            const offenders: string[] = [];
            for (const cls of templatedNoParam) {
                // Remove {{query:"..."}} composition tokens; whatever {{...}} / {% ... %} remains
                // needs parameter metadata this deployment does not declare.
                const withoutComposition = cls.StrippedSQL.replace(/\{\{\s*query\s*:\s*"[^"]*"\s*\}\}/g, ' ');
                const hasResidualTokens = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/.test(withoutComposition);
                const run = await RunCatalogQuery({ QueryID: cls.Query.ID }, ctx.User);
                if (run.Threw) {
                    offenders.push(`${queryLabel(cls)} THREW on a bare run (must always be a clean result object): ${run.Error}`);
                    continue;
                }
                const result = run.Result!;
                if (hasResidualTokens) {
                    if (result.Success) {
                        try {
                            AssertSaneResultShape(queryLabel(cls), result);
                        } catch (e) {
                            offenders.push(e instanceof Error ? e.message : String(e));
                        }
                    } else if (!result.ErrorMessage || result.ErrorMessage.trim().length === 0) {
                        offenders.push(`${queryLabel(cls)} failed with an EMPTY ErrorMessage`);
                    } else {
                        // Declares no params yet references template variables — the known
                        // param-metadata round-trip gap (test-catalog RQ-C6). Deployment data,
                        // not an engine defect → loud skip, never silent.
                        SkipAsPass('runquery-catalog.QC6',
                            `${queryLabel(cls)} references template variables but declares no parameters — ` +
                            `parameter metadata not seeded here (RQ-C6 dotfile round-trip gap): ${result.ErrorMessage.slice(0, 120)}`);
                    }
                    continue;
                }
                // Composition-only template — must fully succeed.
                if (!result.Success) {
                    offenders.push(`${queryLabel(cls)} (composition-only) failed: ${result.ErrorMessage}`);
                    continue;
                }
                try {
                    AssertSaneResultShape(queryLabel(cls), result);
                } catch (e) {
                    offenders.push(e instanceof Error ? e.message : String(e));
                }
            }
            failOnOffenders('QC6 templated no-param sweep', offenders, templatedNoParam.length);
        }
    }
];

for (const check of RunQueryCatalogChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// Deliberately NO RegisterLifecycle — this bundle is read-only: nothing to create, nothing to tear down.
