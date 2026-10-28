import type { MJQueryParameterEntity } from "@memberjunction/core-entities";
import { RenderPipeline } from "@memberjunction/generic-database-provider";
import type { DescribedColumn } from "@memberjunction/generic-database-provider";
import { BranchVariantValues } from "@memberjunction/sql-parser";
import type { BranchValue, QueryTemplate } from "@memberjunction/sql-parser";
import { NormalizeDefaultForType } from "./enrich";
import type { KnownQueryParameter, QueryExtractionInput, QueryParameterFact, QueryParameterType } from "./extractionTypes";

/** The output of every render of the query, as the database server described it. */
export interface DescribedOutput {
    /** The union of the renders' columns by name (case-insensitive): the base render's first, in order. */
    readonly Columns: readonly DescribedColumn[];
    /** Columns only some renders produce: the render that first produced each, or one that did not return it. */
    readonly BranchOnlyColumns: readonly string[];
    /** Output names a single render returns more than once (case-insensitive). */
    readonly DuplicateNames: readonly string[];
    /** Why the output could not be described (a render or the server failed); `null` on success. */
    readonly Failure: string | null;
}

/** A parameter as a render is given it. */
type RenderDefinition = Pick<MJQueryParameterEntity, 'Name' | 'Type' | 'IsRequired' | 'IsServerSet' | 'ValidationFilters'> & {
    readonly SampleValue: string | null;
};

/** The most branch renders described beyond the base, so a template with many blocks stays bounded. */
const MAX_VARIANT_RENDERS = 32;

/**
 * Renders the query with sample values, once for the base assignment and once per `{% if %}`
 * toggled on its own (`QueryTemplate.BranchVariants`), and describes each render on the database
 * server. Renders whose SQL repeats an earlier one are not described again. Plain SQL is
 * described once, as written.
 */
export async function DescribeQueryOutput(input: QueryExtractionInput, template: QueryTemplate, parameters: readonly QueryParameterFact[]): Promise<DescribedOutput> {
    if (!input.Describe) return failure('The database provider cannot describe a statement, so the output fields were not checked.');
    const definitions = renderDefinitions(parameters, input.KnownParameters);
    const renders = template.Tokens.HasTemplate ? renderAssignments(template) : [null];
    const columns: DescribedColumn[] = [];
    const branchOnly: string[] = [];
    const duplicates = new Set<string>();
    const seenSQL = new Set<string>();
    for (const [index, values] of renders.entries()) {
        const rendered = renderVariant(input, definitions, values);
        if (rendered.Error !== null) return failure(`Render ${index} could not be made: ${rendered.Error}`);
        if (seenSQL.has(rendered.SQL)) continue;
        seenSQL.add(rendered.SQL);
        const described = await input.Describe(rendered.SQL);
        if (!described.Success) return failure(`The database server could not describe the query: ${described.Diagnostics.join('; ') || 'no reason given'}`);
        for (const name of duplicateNames(described.Columns)) duplicates.add(name);
        if (index > 0) noteMissingColumns(columns, described.Columns, index, branchOnly);
        mergeColumns(columns, described.Columns, index, branchOnly);
    }
    return { Columns: columns, BranchOnlyColumns: branchOnly, DuplicateNames: [...duplicates], Failure: null };
}

function failure(message: string): DescribedOutput {
    return { Columns: [], BranchOnlyColumns: [], DuplicateNames: [], Failure: message };
}

/** Appends the columns of render `index` not yet in the union. */
function mergeColumns(union: DescribedColumn[], columns: readonly DescribedColumn[], index: number, branchOnly: string[]): void {
    const known = new Set(union.map(c => c.Name.toLowerCase()));
    for (const column of columns) {
        if (known.has(column.Name.toLowerCase())) continue;
        known.add(column.Name.toLowerCase());
        union.push(column);
        if (index > 0) branchOnly.push(`${column.Name} (render ${index})`);
    }
}

/** Notes the columns of the union so far that render `index` does not return (a column only the base branch returns). */
function noteMissingColumns(union: readonly DescribedColumn[], columns: readonly DescribedColumn[], index: number, branchOnly: string[]): void {
    const returned = new Set(columns.map(c => c.Name.toLowerCase()));
    for (const column of union) {
        if (!returned.has(column.Name.toLowerCase())) branchOnly.push(`${column.Name} (not in render ${index})`);
    }
}

function duplicateNames(columns: readonly DescribedColumn[]): string[] {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const column of columns) {
        const key = column.Name.toLowerCase();
        if (seen.has(key)) repeated.add(column.Name);
        seen.add(key);
    }
    return [...repeated];
}

/** The base assignment, then one per `{% if %}` that parameter values can move to another branch. */
function renderAssignments(template: QueryTemplate): Array<Record<string, BranchValue>> {
    const set = template.BranchVariants().Value;
    const toggles = set.Variants.filter(v => v.Toggle !== null && v.Satisfiable && v.Toggle.ToBranch !== null);
    return [set.Base, ...toggles.slice(0, MAX_VARIANT_RENDERS).map(v => BranchVariantValues(set, v))];
}

/** Every parameter a render may be given: the template's, typed from the known rows where they say more. */
function renderDefinitions(parameters: readonly QueryParameterFact[], known: readonly KnownQueryParameter[]): RenderDefinition[] {
    const byName = new Map(known.map(k => [k.Name.toLowerCase(), k]));
    const definitions: RenderDefinition[] = parameters.map(p => {
        const row = byName.get(p.Name.toLowerCase());
        return {
            Name: p.Name,
            Type: row?.Type ?? p.Type ?? 'string',
            IsRequired: p.IsRequired,
            IsServerSet: row?.IsServerSet ?? false,
            ValidationFilters: row?.ValidationFilters ?? null,
            SampleValue: p.SampleValue ?? row?.SampleValue ?? null,
        };
    });
    return definitions;
}

/** One render's SQL for `values` (`null`: plain SQL, rendered as written), or why it failed. */
function renderVariant(input: QueryExtractionInput, definitions: readonly RenderDefinition[], values: Record<string, BranchValue> | null): { SQL: string; Error: string | null } {
    if (values === null) return { SQL: input.SQL, Error: null };
    const callerValues: Record<string, string> = {};
    const serverValues: Record<string, string> = {};
    for (const definition of definitions) {
        const value = renderValue(values[definition.Name], definition);
        if (value === undefined) continue;
        (definition.IsServerSet ? serverValues : callerValues)[definition.Name] = value;
    }
    try {
        const result = RenderPipeline.Run(input.SQL, {
            Platform: input.Platform,
            QueryID: input.QueryID ?? undefined,
            ContextUser: input.ContextUser,
            Parameters: callerValues,
            ServerParameters: serverValues,
            QueryInfo: { SQL: input.SQL, UsesTemplate: true, Parameters: definitions },
            UsesTemplate: true,
            OriginalSQL: input.SQL,
            Dependencies: input.CompositionDependencies && input.CompositionDependencies.length > 0 ? [...input.CompositionDependencies] : undefined,
        });
        return { SQL: result.FinalSQL, Error: null };
    } catch (e) {
        return { SQL: '', Error: e instanceof Error ? e.message : String(e) };
    }
}

/** The value a branch value gives a parameter in a render; `undefined` leaves it out. */
function renderValue(branch: BranchValue | undefined, definition: RenderDefinition): string | undefined {
    if (!branch || branch.Kind === 'Absent') return undefined;
    if (branch.Kind === 'Literal') return branch.Value === null ? undefined : String(branch.Value);
    return SampleValueFor(definition.Type, definition.SampleValue);
}

/**
 * A truthy sample value of `type`, as a render takes it: the row's sample when it fits the type,
 * otherwise a fixed value (`Sample`, `1`, `2024-01-01`, `true`, `["Sample"]`).
 */
export function SampleValueFor(type: QueryParameterType, sample: string | null): string {
    const given = sample?.trim() ? sample : null;
    switch (type) {
        case 'number': return given !== null && !isNaN(Number(given)) && Number(given) !== 0 ? given : '1';
        case 'date': return given !== null && !isNaN(new Date(given).getTime()) ? given : '2024-01-01';
        case 'boolean': return 'true';
        case 'array': return given !== null ? NormalizeDefaultForType(given, 'array') : '["Sample"]';
        default: return given ?? 'Sample';
    }
}
