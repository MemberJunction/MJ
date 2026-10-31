/**
 * sqlpipe-scenarios.ts — turns one point of the scenario matrix (a value per dimension) into the
 * saved query it needs, the call it makes, and what that call must return.
 *
 * The MJ query and its plain-SQL oracle are built from the same shape, so they differ only where
 * MJ features stand: the composition tokens (oracle: CTEs of the dependencies' plain SQL), the
 * template (oracle: literal values), comments and hints the oracle leaves out. The oracle never
 * goes through MJ's rendering; it runs as written.
 */
import { createHash } from 'node:crypto';
import type { DatabasePlatform } from '@memberjunction/core';
import type { CompositionVariant, DepNaming, ExpectedDependency } from './sqlpipe-composition';
import { CompositionByKey, CteNames, DepAvailable, DepByKey } from './sqlpipe-composition';
import { Sql, SourceFor } from './sqlpipe-schema';
import type { SchemaKey } from './sqlpipe-schema';
import type { ShapeDef, ShapeText } from './sqlpipe-shapes';
import { AssembleWith, ShapeByKey } from './sqlpipe-shapes';
import type { ExpectedParameter, RunContext, TemplatingVariant, ValueCase, ValueOutcome } from './sqlpipe-templating';
import { TemplatingByKey } from './sqlpipe-templating';
import type { Assignment } from './sqlpipe-pairwise';

/** How a scenario reaches the query. */
/**
 * How a scenario reaches the query: a saved query by ID or by name (`cached`: one with result
 * caching on, called twice), ad hoc SQL (`adhoc`), or a transient execution spec (`spec`: the path
 * the TestQuerySQL resolver runs, with string parameter values and no saved definitions).
 */
export type PathKey = 'saved' | 'byName' | 'adhoc' | 'cached' | 'spec';

/** Values a transient spec cannot carry typed: arrays, and `+` arithmetic over a string value. */
const SPEC_EXCLUDED_TEMPLATING = new Set(['forArray', 'sqlIn', 'lengthGuard']);
const SPEC_EXCLUDED_COMPOSITIONS = new Set(['arithmetic', 'inFor'])

export const MAX_ROWS: Readonly<Record<string, number | undefined>> = { none: undefined, one: 1, few: 3, more: 100_000 };
export const START_ROWS: Readonly<Record<string, number | undefined>> = { none: undefined, middle: 2, past: 100_000 };

/** One point of the matrix. */
export interface ScenarioPoint {
    readonly Schema: SchemaKey;
    readonly Shape: string;
    readonly Templating: string;
    readonly Composition: string;
    readonly Values: ValueCase;
    readonly MaxRows: string;
    readonly StartRow: string;
    readonly Path: PathKey;
}

/** The saved query a scenario needs, and what extraction must write for it. */
export interface ScenarioQuery {
    /** Unique per distinct query text, schema and cache flag. */
    readonly Key: string;
    readonly Name: string;
    readonly Schema: SchemaKey;
    readonly SQL: string;
    readonly Cached: boolean;
    readonly Refusal: string | null;
    readonly Shape: ShapeDef;
    readonly CompositionKey: string;
    readonly Parameters: readonly ExpectedParameter[];
    readonly Dependencies: readonly ExpectedDependency[];
    readonly FieldDescriptions: Readonly<Record<string, string>>;
    /** The oracle for the `provided` values, whose output columns the stored fields must match. */
    readonly DescribeOracle: string | null;
}

/** A call and what it must return. */
export interface ScenarioRun {
    readonly Label: string;
    readonly Query: ScenarioQuery;
    readonly Path: PathKey;
    readonly Parameters: Record<string, unknown>;
    readonly MaxRows: number | undefined;
    readonly StartRow: number | undefined;
    readonly Expect: { readonly Kind: 'rows'; readonly Oracle: string; readonly Ordered: boolean; readonly CountOnly: boolean } | { readonly Kind: 'error'; readonly Includes: string | null };
}

/** What a build needs from the bundle: platform, run context and the dependency paths per schema. */
export interface BuildEnvironment {
    readonly Platform: DatabasePlatform;
    readonly Context: RunContext;
    readonly Prefix: string;
    Naming(schema: SchemaKey): DepNaming;
}

// ─── Validity ──────────────────────────────────────────────────────────────

function caseOf(cases: TemplatingVariant['Cases'] | CompositionVariant['Cases'], value: ValueCase): boolean {
    return cases[value] !== undefined;
}

/** Whether a (partial) point can exist on this platform. */
export function ValidPoint(platform: DatabasePlatform, a: Assignment): boolean {
    const shape = a.Shape ? ShapeByKey(a.Shape) : null;
    const comp = a.Composition ? CompositionByKey(a.Composition) : null;
    const templ = a.Templating ? TemplatingByKey(a.Templating) : null;
    const schema = a.Schema as SchemaKey | undefined;
    if (shape?.Platforms && !shape.Platforms.includes(platform)) return false;
    if (shape && schema && shape.Schemas && !shape.Schemas.includes(schema)) return false;
    if (comp && !(schema ? [schema] : ['mock', 'core'] as const).some(sc => comp.Uses.every(d => DepAvailable(DepByKey(d), platform, sc)))) return false;
    if (a.Values && templ && comp && !caseOf(templ.Cases, a.Values as ValueCase) && !caseOf(comp.Cases, a.Values as ValueCase)) return false;
    if (a.Values && templ && !comp && !caseOf(templ.Cases, a.Values as ValueCase) && a.Values !== 'missing') return false;
    if (a.Path === 'adhoc' && ((templ && templ.Key !== 'none') || (comp && (!comp.Static || comp.Refusal)) || (shape && shape.Refusal))) return false;
    if (a.Path === 'adhoc' && a.Values && a.Values !== 'provided') return false;
    if (a.Path === 'spec' && ((templ && SPEC_EXCLUDED_TEMPLATING.has(templ.Key)) || (comp && (SPEC_EXCLUDED_COMPOSITIONS.has(comp.Key) || comp.Refusal))
        || (shape && shape.Refusal) || (a.StartRow !== undefined && a.StartRow !== 'none'))) return false;
    return true;
}

// ─── Building ──────────────────────────────────────────────────────────────

interface Parts {
    readonly Sql: Sql;
    readonly Shape: ShapeDef;
    readonly Templating: TemplatingVariant;
    readonly Composition: CompositionVariant;
    readonly Naming: DepNaming;
}

function partsOf(env: BuildEnvironment, p: ScenarioPoint): Parts {
    return {
        Sql: new Sql(env.Platform, SourceFor(p.Schema)), Shape: ShapeByKey(p.Shape), Templating: TemplatingByKey(p.Templating),
        Composition: CompositionByKey(p.Composition), Naming: env.Naming(p.Schema),
    };
}

function baseFor(parts: Parts): string {
    return parts.Composition.Key === 'none' ? parts.Sql.Base('s') : '1 = 1';
}

/** The MJ query text of a point. */
function mjText(parts: Parts): string {
    const { Sql: sql, Shape: shape, Templating: templ, Composition: comp } = parts;
    const extra = comp.ExtraPredicate ? ` AND ${comp.ExtraPredicate({ Sql: sql, Naming: parts.Naming })}` : '';
    const built: ShapeText = shape.Build({
        Sql: sql, Src: comp.Source({ Sql: sql, Naming: parts.Naming }), Base: baseFor(parts), Pred: `${templ.Predicate(sql)}${extra}`, Table: sql.Source.Table,
    });
    const text = `${templ.Header ?? ''}${built.MJPrefix ?? ''}${AssembleWith(sql, built.Ctes, built.Recursive, built.MJBody ?? built.Body)}`;
    return sql.Text(text);
}

/** The plain-SQL oracle for the outer parameter values and the oracle predicate. */
function oracleText(parts: Parts, values: Readonly<Record<string, unknown>>, predicate: string): string {
    const { Sql: sql, Shape: shape, Composition: comp } = parts;
    const names = new CteNames();
    const source = comp.Oracle(sql, values, names);
    const built = shape.Build({ Sql: sql, Src: source.Source, Base: baseFor(parts), Pred: predicate, Table: sql.Source.Table });
    const ctes = [...source.Ctes.map(c => `${c.Name} AS (${c.Sql})`), ...built.Ctes];
    const recursive = built.Recursive || source.Ctes.some(c => c.Recursive);
    return sql.Text(AssembleWith(sql, ctes, recursive, built.Body));
}

/** The outcome of one value case: the templating's and the composition's, merged. */
function outcomeOf(parts: Parts, value: ValueCase, context: RunContext): ValueOutcome {
    const sql = parts.Sql;
    const templ = (parts.Templating.Cases[value] ?? parts.Templating.Cases.provided)!(sql, context);
    const comp = (parts.Composition.Cases[value] ?? parts.Composition.Cases.provided)!(sql);
    const parameters = { ...templ.Parameters, ...comp.Parameters };
    if (templ.Kind === 'error') return { ...templ, Parameters: parameters };
    if (comp.Kind === 'error') return { ...comp, Parameters: parameters };
    return { Kind: 'rows', Parameters: parameters, Oracle: templ.Oracle };
}

function mergeParameters(templ: TemplatingVariant, comp: CompositionVariant): ExpectedParameter[] {
    const byName = new Map<string, ExpectedParameter>();
    for (const p of [...templ.Parameters, ...comp.OuterParameters]) {
        const prior = byName.get(p.Name);
        byName.set(p.Name, prior ? { ...prior, IsRequired: prior.IsRequired || p.IsRequired } : p);
    }
    return [...byName.values()];
}

/** The saved query a point needs (also built for ad hoc points, which run its text). */
export function BuildQuery(env: BuildEnvironment, p: ScenarioPoint): ScenarioQuery {
    const parts = partsOf(env, p);
    const sqlText = mjText(parts);
    const cached = p.Path === 'cached';
    const key = createHash('sha256').update(`${p.Schema}|${cached}|${sqlText}`).digest('hex').slice(0, 12);
    const refusal = parts.Shape.Refusal ?? parts.Composition.Refusal ?? null;
    const provided = outcomeOf(parts, 'provided', env.Context);
    return {
        Key: key, Name: `${env.Prefix} ${p.Schema} ${p.Shape} ${p.Templating} ${p.Composition} ${key.slice(0, 6)}`, Schema: p.Schema, SQL: sqlText,
        Cached: cached, Refusal: refusal, Shape: parts.Shape, CompositionKey: parts.Composition.Key,
        Parameters: mergeParameters(parts.Templating, parts.Composition), Dependencies: parts.Composition.Dependencies(parts.Sql),
        FieldDescriptions: parts.Templating.FieldDescriptions ?? {},
        DescribeOracle: refusal || provided.Kind === 'error' ? null : oracleText(parts, provided.Parameters, provided.Oracle),
    };
}

/** The call a point makes and what it must return. A refused query has no run. */
export function BuildRun(env: BuildEnvironment, p: ScenarioPoint, query: ScenarioQuery): ScenarioRun | null {
    if (query.Refusal) return null;
    const parts = partsOf(env, p);
    const outcome = outcomeOf(parts, p.Values, env.Context);
    const label = `${p.Schema}/${p.Shape}/${p.Templating}/${p.Composition}/${p.Values}/max=${p.MaxRows}/start=${p.StartRow}/${p.Path}`;
    const base = { Label: label, Query: query, Path: p.Path, Parameters: p.Path === 'adhoc' ? {} : outcome.Parameters, MaxRows: MAX_ROWS[p.MaxRows], StartRow: START_ROWS[p.StartRow] };
    if (p.Path === 'spec' && outcome.Kind === 'error' && outcome.ErrorIncludes?.startsWith('Required parameter')) return null;
    if (p.Path === 'adhoc' && parts.Shape.AdhocRefusal) return { ...base, Expect: { Kind: 'error', Includes: parts.Shape.AdhocRefusal } };
    // A transient spec has no parameter definitions, so it fails in the filter, with the filter's wording.
    if (outcome.Kind === 'error') return { ...base, Expect: { Kind: 'error', Includes: p.Path === 'spec' ? null : outcome.ErrorIncludes } };
    return { ...base, Expect: { Kind: 'rows', Oracle: oracleText(parts, outcome.Parameters, outcome.Oracle), Ordered: parts.Shape.Ordered, CountOnly: parts.Shape.CountOnly === true } };
}

/** A point from a generated assignment. */
export function PointOf(a: Assignment, defaults: Partial<ScenarioPoint> = {}): ScenarioPoint {
    const pick = <K extends keyof ScenarioPoint>(k: K, fallback: ScenarioPoint[K]): ScenarioPoint[K] => (a[k] as ScenarioPoint[K] | undefined) ?? defaults[k] ?? fallback;
    return {
        Schema: pick('Schema', 'mock'), Shape: pick('Shape', 'plain'), Templating: pick('Templating', 'none'), Composition: pick('Composition', 'none'),
        Values: pick('Values', 'provided'), MaxRows: pick('MaxRows', 'none'), StartRow: pick('StartRow', 'none'), Path: pick('Path', 'saved'),
    };
}
