import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { verifyParamRole, type VerifiedParamRole } from './materializationParamVerifier';
import { qualifyParameterizedQuery, type ParamClassification, type ParamQualification } from './materializationAnalysis';

/**
 * Phase 2c — deterministic parameter classification for query materialization
 * (plan /plans/query-entity-materialization.md §9 / §10).
 *
 * Orchestrates the render-and-diff oracle ({@link verifyParamRole}) across every parameter of a
 * query and folds the per-parameter verdicts into the overall {@link qualifyParameterizedQuery}
 * decision. For each parameter it renders the query template ≥2 times — that parameter varied
 * across distinct probe values while **all others are held fixed** — and asks the verifier whether
 * the variation is a clean row filter, a structural change, or unverifiable.
 *
 * **Deterministic-only (v1):** probe values are generated from each parameter's declared type; no
 * LLM is involved (the LLM proposer is deferred to the Bucket-2 / bounded-domain phase). The
 * verifier is the oracle — this module never trusts author intent.
 *
 * The renderer is **injected** ({@link VariantRenderer}) so this module stays free of the Nunjucks
 * engine and the per-request platform singleton: the soundness-critical orchestration is pure and
 * fully unit-testable, and the manage-metadata caller supplies the production renderer.
 */

/** A query parameter's declared type (mirrors `MJ: Query Parameter`.Type). */
export type QueryParamType = 'string' | 'number' | 'date' | 'boolean' | 'array';

/** Subset of a `MJ: Query Parameter` row needed to probe and classify the parameter. */
export interface QueryParamDef {
    /** Parameter name (the Nunjucks variable). */
    Name: string;
    /** Declared type — drives probe-value generation and the held value. */
    Type: QueryParamType;
    /** Author-provided example value (used as the held value for *other* params when valid). */
    SampleValue?: string | null;
}

/**
 * Renders the query template to final SQL for a complete parameter-value map. Deterministic and
 * side-effect free from this module's perspective. Supplied by the caller (production: the
 * Nunjucks render pipeline with SQL-safe filters). May throw if a value breaks the template.
 */
export type VariantRenderer = (paramValues: Record<string, unknown>) => string;

/** A single parameter's classification outcome (for logging / diagnostics). */
export interface ParamVerdict {
    name: string;
    verdict: VerifiedParamRole;
}

/** Result of classifying all of a query's parameters. */
export interface QueryParamClassification {
    /** The overall qualification (drives whether/how the query materializes). */
    qualification: ParamQualification;
    /** Per-parameter verdicts, in declaration order (for precise logs). */
    perParam: ParamVerdict[];
}

/**
 * Generates ≥2 distinct probe values for a parameter type. Booleans only have two, every other
 * type gets three so structural branching has a chance to reveal itself. Values are deliberately
 * unusual so they cannot collide with held values of other parameters.
 */
export function probeValues(type: QueryParamType): unknown[] {
    switch (type) {
        case 'string':
            return ['__mj_probe_alpha', '__mj_probe_beta', '__mj_probe_gamma'];
        case 'number':
            return [101, 202, 303];
        case 'date':
            return ['2020-01-15', '2021-06-15', '2022-12-31'];
        case 'boolean':
            return [true, false];
        case 'array':
            return [['__mj_a', '__mj_b'], ['__mj_c'], ['__mj_d', '__mj_e', '__mj_f']];
    }
}

/** Parses a parameter's SampleValue into the runtime shape its type expects (best-effort). */
function parseSampleValue(type: QueryParamType, sample: string): unknown {
    switch (type) {
        case 'number': {
            const n = Number(sample);
            return Number.isFinite(n) ? n : undefined;
        }
        case 'boolean':
            return sample.trim().toLowerCase() === 'true';
        case 'array':
            return sample.includes(',') ? sample.split(',').map((s) => s.trim()) : [sample];
        case 'string':
        case 'date':
            return sample;
    }
}

/** A stable value to hold a parameter at while a *different* parameter is varied. */
function holdValue(param: QueryParamDef): unknown {
    if (param.SampleValue != null && param.SampleValue.trim().length > 0) {
        const parsed = parseSampleValue(param.Type, param.SampleValue);
        if (parsed !== undefined) {
            return parsed;
        }
    }
    return defaultHoldValue(param.Type);
}

/** Type-based fallback held value when a parameter has no usable SampleValue. */
function defaultHoldValue(type: QueryParamType): unknown {
    switch (type) {
        case 'string':
            return '__mj_hold';
        case 'number':
            return 1;
        case 'date':
            return '2020-01-01';
        case 'boolean':
            return true;
        case 'array':
            return ['__mj_hold'];
    }
}

/** Builds the base value map with every parameter held at its stable value. */
export function buildHeldValues(params: QueryParamDef[]): Record<string, unknown> {
    const held: Record<string, unknown> = {};
    for (const p of params) {
        held[p.Name] = holdValue(p);
    }
    return held;
}

/**
 * Renders the variant SQL strings for one parameter varied across its probe values, all other
 * parameters held fixed. Returns null if any render throws (the parameter is then unverifiable).
 */
function renderVariantsForParam(
    param: QueryParamDef,
    held: Record<string, unknown>,
    render: VariantRenderer,
): string[] | null {
    const variants: string[] = [];
    for (const v of probeValues(param.Type)) {
        try {
            variants.push(render({ ...held, [param.Name]: v }));
        } catch {
            return null; // a probe value broke the template → cannot verify this parameter
        }
    }
    return variants;
}

/**
 * A distinctive sentinel value per parameter type for the value-passthrough guard, chosen so its verbatim
 * appearance in a rendered query is proof the value survived template rendering unchanged (extremely
 * unlikely to occur coincidentally). Booleans/dates use a plain value that a SQL-formatting filter will
 * typically coerce (`true`→`1`, a reformatted date) — which the guard then treats as non-passthrough.
 */
function passthroughSentinel(type: QueryParamType): unknown {
    // The string/array sentinels deliberately combine features the common value-transforming filters would
    // alter, so the verbatim-contains check catches them: leading/trailing + interior WHITESPACE (trim,
    // ltrim, rtrim, collapse), MIXED CASE (upper, lower, capitalize, title), and SEPARATORS (replace, split).
    // No single-quote (which sqlString escapes → would false-refuse an identity render). A pathological
    // custom filter that happens to be identity on this exact value could still slip through — the guard is
    // conservative best-effort, not a proof; documented in plan §9.
    switch (type) {
        case 'string': return '  Mj_Pt zQ9x_Kw  ';
        case 'number': return 305419896; // 0x12345678 — distinctive, unlikely to appear coincidentally
        case 'date': return '2019-03-14';
        case 'boolean': return true;
        case 'array': return ['  Mj_PtA zQ9x  ', '  Mj_PtB zQ9x  '];
    }
}

/**
 * Phase-2 value-passthrough guard (plan §9). A proven `RowFilter` is only safe to inject at read time if
 * the template renders the parameter's value UNCHANGED into the predicate literal — because the read path
 * binds the caller's **raw** value. If the template transforms it (`{{ x | upper | sqlString }}`, a custom
 * filter) the materialized read would filter on a different value than the live query → silently wrong rows.
 *
 * We render the query with a distinctive sentinel and require it to appear VERBATIM in the rendered SQL.
 * If it doesn't (a value transform, or a type coercion we can't verify), the parameter is refused. This is
 * **conservative by design** (§10 refuse-under-uncertainty): a coerced-but-faithful value (e.g. a boolean
 * rendered as `1`) refuses too, leaving the query live-only — a missed optimization, never wrong.
 */
function isValuePassthrough(param: QueryParamDef, held: Record<string, unknown>, render: VariantRenderer): boolean {
    const sentinel = passthroughSentinel(param.Type);
    let rendered: string;
    try {
        rendered = render({ ...held, [param.Name]: sentinel });
    } catch {
        return false; // cannot render the sentinel → cannot prove passthrough → refuse
    }
    const parts = Array.isArray(sentinel) ? sentinel : [sentinel];
    return parts.every((part) => rendered.includes(String(part)));
}

/**
 * Verifies a single parameter's role by rendering its variants and running the AST oracle. `held` is the
 * shared base value map (all params at their stable values) — computed ONCE by the caller and reused, since
 * the baseline is identical for every parameter being probed (renderVariantsForParam overrides just the one
 * varied param). Rebuilding it per-call would make classification O(N^2) in parameter count.
 */
function verifyOneParam(param: QueryParamDef, held: Record<string, unknown>, dialect: SQLParserDialect, render: VariantRenderer): VerifiedParamRole {
    const variants = renderVariantsForParam(param, held, render);
    if (variants == null) {
        return { role: 'Unbounded', reason: `parameter "${param.Name}" produced a template error while probing — cannot verify; refusing under uncertainty` };
    }
    const verdict = verifyParamRole(variants, dialect);
    // Value-passthrough guard: a proven row filter is only injectable if the raw value survives rendering
    // into the predicate literal. A transforming template would make the materialized read diverge from live.
    if (verdict.role === 'RowFilter' && !isValuePassthrough(param, held, render)) {
        return {
            role: 'Unbounded',
            reason: `parameter "${param.Name}" filters on "${verdict.filterColumn ?? '?'}" but the template transforms its value before the predicate literal (the raw value does not survive rendering) — a materialized read would filter on a different value than the live query; refusing (query stays live-only)`,
        };
    }
    return verdict;
}

/**
 * Classifies every parameter of a query and folds the verdicts into the overall qualification.
 *
 * Pure orchestration: pass the rendered-SQL producer via `render`. Returns both the qualification
 * (feeds the materialization gate) and the per-parameter verdicts (for precise logging).
 *
 * Note: bounded-domain (`Structural` Bucket-2) classification is **not** populated in v1 — verdicts
 * carry no `boundedDomain`, so a structural parameter qualifies only if `allowPerValueCache` is on
 * (off by default) *and* a domain is supplied, which it never is here → structural ⇒ refuse. This is
 * intentional: per-value caching is a later phase.
 */
export function classifyQueryParameters(opts: {
    queryName: string;
    params: QueryParamDef[];
    outputColumns: string[];
    dialect: SQLParserDialect;
    render: VariantRenderer;
    allowPerValueCache?: boolean;
    /** Phase-2 enablement for Bucket-1 row-filter broad materialization (default false → refuse, stay live-only). */
    allowRowFilterBroad?: boolean;
}): QueryParamClassification {
    const { queryName, params, outputColumns, dialect, render } = opts;

    // Compute the held baseline ONCE (not per-parameter) — see verifyOneParam.
    const held = buildHeldValues(params);
    const perParam: ParamVerdict[] = params.map((p) => ({
        name: p.Name,
        verdict: verifyOneParam(p, held, dialect, render),
    }));

    const classifications: ParamClassification[] = perParam.map((pv) => ({
        name: pv.name,
        role: pv.verdict.role,
        filterColumn: pv.verdict.filterColumn,
        filterOperator: pv.verdict.filterOperator,
        filterKind: pv.verdict.filterKind,
    }));

    const qualification = qualifyParameterizedQuery({
        queryName,
        params: classifications,
        outputColumns,
        allowPerValueCache: opts.allowPerValueCache ?? false,
        allowRowFilterBroad: opts.allowRowFilterBroad ?? false,
    });

    return { qualification, perParam };
}
