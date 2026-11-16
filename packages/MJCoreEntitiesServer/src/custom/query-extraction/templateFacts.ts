import type { DatabasePlatform } from "@memberjunction/core";
import type { CompositionCandidate, CompositionCandidateParameter } from "./compositionTargets";
import { GetQueryDialect } from "@memberjunction/sql-dialect";
import type { ParserDialect } from "@memberjunction/sql-dialect";
import {
    CompositionFullPath,
    CompositionPathSegments,
    MatchCompositionPath,
    QueryTemplate,
    SqlTokens,
    TemplateSqlViews,
} from "@memberjunction/sql-parser";
import type {
    CompositionArgument,
    CompositionReference,
    CompositionTarget,
    DeclaredTemplateParameter,
    Diagnostic,
    KnownTemplateParameterType,
    TableReference,
    TemplateParameter,
} from "@memberjunction/sql-parser";
import { IndexByUUID } from "@memberjunction/global";
import { FormatQueryDiagnostic, QueryTextPosition } from "@memberjunction/core-entities";
import { ExtractAliasFromSQL } from "./resolve";
import { BindTableReferences, EntityObjectIndex } from "./sourceBinding";
import type {
    QueryDependencyFact,
    QueryEntityFact,
    KnownQueryParameter,
    QueryExtractionInput,
    QueryParameterFact,
    QueryParameterType,
} from "./extractionTypes";

/** What MJ's own reading of the query (lexer, template layer, structural parser) establishes. */
export interface TemplateAnalysis {
    readonly Template: QueryTemplate;
    readonly UsesTemplate: boolean;
    readonly Parameters: readonly QueryParameterFact[];
    /** `null` when a composition could not be resolved, so the stored rows are kept. */
    readonly Dependencies: readonly QueryDependencyFact[] | null;
    /** `null` when the SQL could not be read completely, so the stored rows are kept. */
    readonly Entities: readonly QueryEntityFact[] | null;
    /** Output names the select list writes more than once (case-insensitive). */
    readonly DuplicateOutputNames: readonly string[];
    /**
     * Whether a table or view the query reads is named by a template parameter
     * (`FROM {{ Schema | sqlIdentifier }}.{{ View | sqlIdentifier }}`), so its output columns depend
     * on the arguments and no single render describes them.
     */
    readonly ReadsParameterNamedSource: boolean;
    /** `@field` / `--:` descriptions, by lower-cased field name. */
    readonly FieldDocs: ReadonlyMap<string, string>;
    /** Save-time rule errors and warnings (`QueryTemplate.Validate`), and doc-comment warnings. */
    readonly Errors: readonly Diagnostic[];
    readonly Warnings: readonly Diagnostic[];
    /** Notes about facts that could not be established. */
    readonly Notes: readonly string[];
}

/** A composition resolved to the query it names. */
interface ResolvedReference {
    readonly Reference: CompositionReference;
    readonly Target: CompositionCandidate;
}

/**
 * Reads the query with MJ's parser: whether it is a template, its parameters (with composition
 * pass-throughs), its compositions, the entities it reads, duplicate output names, doc comments
 * and the save-time rules. Never touches the database.
 */
export function AnalyzeQueryTemplate(input: QueryExtractionInput): TemplateAnalysis {
    const dialect = GetQueryDialect(input.Platform);
    const template = QueryTemplate.Parse(input.SQL, dialect);
    const validation = template.Validate({
        Mode: input.Mode,
        DeclaredParameters: DeclaredTemplateParameters(input.KnownParameters),
        KnownParameterTypes: DetectedTemplateParameterTypes(input.KnownParameters),
        QueryPath: input.QueryPath,
        ResolveComposition: path => resolveTarget(path, input.Queries),
    });
    const docs = template.DocComments();
    const resolved = resolveReferences(template.CompositionReferences().Value, input.Queries);
    const structure = readStructure(input.SQL, dialect, input);
    const diagnostics = [...validation.Diagnostics, ...docs.Diagnostics];
    return {
        Template: template,
        UsesTemplate: template.Tokens.HasTemplate,
        Parameters: parameterFacts(template, resolved.References, input.ParameterHints),
        Dependencies: resolved.Complete ? resolved.References.map(r => dependencyFact(r, input.SQL)) : null,
        Entities: structure.Entities,
        DuplicateOutputNames: structure.DuplicateOutputNames,
        ReadsParameterNamedSource: structure.ReadsParameterNamedSource,
        FieldDocs: new Map(docs.Value.Fields.map(f => [f.Name.toLowerCase(), f.Description])),
        Errors: diagnostics.filter(d => d.Severity === 'Error'),
        Warnings: diagnostics.filter(d => d.Severity === 'Warning'),
        Notes: [...resolved.Notes, ...structure.Notes],
    };
}

/**
 * The parameter rows that declare a type to the save-time rules: the rows a person wrote
 * (`DetectionMethod` `Manual`), and the server-set rows, whose flag only a person sets. A row
 * extraction detected records what the previous SQL implied, so it declares nothing: the SQL may
 * change that parameter's filter, and the row then follows the new type.
 */
export function DeclaredTemplateParameters(known: readonly KnownQueryParameter[]): DeclaredTemplateParameter[] {
    return known.filter(p => p.IsAuthored || p.IsServerSet).map(p => ({ Name: p.Name, Type: p.Type, IsServerSet: p.IsServerSet }));
}

/**
 * The types the detected parameter rows record (the rows {@link DeclaredTemplateParameters} leaves
 * out). They are not authoritative, so they never decide whether a filter fits. They only type a
 * value written without a filter when the SQL gives no type. Without them, a string written
 * unfiltered into a query whose rows were all detected would only be warned about, not refused.
 */
export function DetectedTemplateParameterTypes(known: readonly KnownQueryParameter[]): KnownTemplateParameterType[] {
    return known.filter(p => !p.IsAuthored && !p.IsServerSet).map(p => ({ Name: p.Name, Type: p.Type }));
}

/**
 * Whether `sql` holds any MJ template tag (`{{ }}`, `{% %}`, `{# #}`, a composition) outside SQL
 * comments, read by the lexer of `platform`'s dialect. This is what `UsesTemplate` records: a
 * lexical fact, whatever extraction finds.
 */
export function SQLUsesTemplate(sql: string, platform: DatabasePlatform): boolean {
    return SqlTokens.Lex(sql, GetQueryDialect(platform)).HasTemplate;
}

/**
 * A diagnostic as one line of `ExtractionMessage` or a refusal: code, location, message and fix,
 * in the shared format clients read back with `ParseQueryDiagnostic`. The location is the line and
 * column of the diagnostic's start in `sql`, the text it was found in; without `sql` it is left out.
 */
export function DescribeDiagnostic(diagnostic: Diagnostic, sql?: string): string {
    const at = sql !== undefined ? QueryTextPosition(sql, diagnostic.Span.Start) : null;
    return FormatQueryDiagnostic({
        Code: diagnostic.Code,
        Message: diagnostic.Message,
        FixHint: diagnostic.FixHint,
        Line: at?.Line ?? null,
        Column: at?.Column ?? null,
    });
}

// ─── Compositions ───────────────────────────────────────────────────────────

/** The composed query at a reference's full path, as `QueryTemplate.Validate` asks for it. */
function resolveTarget(fullPath: string, queries: readonly CompositionCandidate[]): CompositionTarget | null {
    const segments = CompositionPathSegments(fullPath);
    const name = segments.pop() ?? '';
    const match = MatchCompositionPath(segments, name, queries);
    if (match.Kind !== 'Exact' && match.Kind !== 'PartialPath') return null;
    const query = match.Target;
    return {
        Exists: true,
        Reusable: query.Reusable,
        FullPath: match.Kind === 'PartialPath' ? match.FullPath : undefined,
        // A server-set parameter is filled by the server on every run, never by an argument.
        Parameters: query.QueryParameters.map(p => ({ Name: p.Name, IsRequired: p.IsRequired === true && !p.IsServerSet })),
        Compositions: composedPaths(query, queries),
    };
}

/** The full paths of the queries `query` composes, from its stored dependency rows. */
function composedPaths(query: CompositionCandidate, queries: readonly CompositionCandidate[]): string[] {
    const byID = IndexByUUID(queries);
    return (query.QueryDependencies ?? [])
        .map(d => byID.Get(d.DependsOnQueryID))
        .filter((q): q is CompositionCandidate => q !== undefined)
        .map(q => CompositionFullPath(q));
}

/** Each composition with the query it names (exact path, or a unique partial path). */
function resolveReferences(references: readonly CompositionReference[], queries: readonly CompositionCandidate[]): { References: ResolvedReference[]; Complete: boolean; Notes: string[] } {
    const resolved: ResolvedReference[] = [];
    const notes: string[] = [];
    for (const reference of references) {
        const match = MatchCompositionPath(reference.CategoryPath, reference.Name, queries);
        if (match.Kind === 'Exact' || match.Kind === 'PartialPath') {
            resolved.push({ Reference: reference, Target: match.Target });
        } else {
            notes.push(`The composition "${reference.FullPath}" names no single query; its dependency rows were left as they are.`);
        }
    }
    return { References: resolved, Complete: notes.length === 0, Notes: notes };
}

function dependencyFact(resolved: ResolvedReference, sql: string): QueryDependencyFact {
    const reference = resolved.Reference;
    const mapping: Record<string, string> = {};
    for (const argument of reference.Arguments) mapping[argument.Name] = argumentText(argument, sql);
    return {
        DependsOnQueryID: resolved.Target.ID,
        ReferencePath: reference.FullPath,
        Alias: ExtractAliasFromSQL(sql, sql.slice(reference.Span.Start, reference.Span.End)),
        ParameterMapping: reference.Arguments.length > 0 ? JSON.stringify(mapping) : null,
    };
}

/** An argument as the dependency row records it: a literal's value, `@Name` for a pass-through, else the expression text. */
function argumentText(argument: CompositionArgument, sql: string): string {
    const expression = argument.Expression;
    if (expression.Kind === 'Literal') return String(expression.Value);
    if (expression.Kind === 'Name') return `@${expression.Name}`;
    return `@{${sql.slice(expression.Span.Start, expression.Span.End)}}`;
}

// ─── Parameters ─────────────────────────────────────────────────────────────

/** The template's parameters, typed and described from the composed query a pass-through argument feeds. */
function parameterFacts(template: QueryTemplate, references: readonly ResolvedReference[], hints?: ReadonlyMap<string, string>): QueryParameterFact[] {
    const docs = new Map(template.DocComments().Value.Parameters.map(p => [p.Name.toLowerCase(), p.Description]));
    return template.Parameters().Value.map(p => {
        const fed = passThroughTarget(p.Name, references);
        return {
            Name: p.Name,
            Type: inferredType(p) ?? (fed ? fed.Type : arithmeticTargetType(p.Name, references)),
            IsRequired: p.IsRequired,
            DefaultValue: p.DefaultValue === null ? null : String(p.DefaultValue),
            SampleValue: hintFor(p.Name, hints) ?? fed?.SampleValue ?? null,
            DocDescription: docs.get(p.Name.toLowerCase()) ?? null,
            InheritedDescription: fed ? inheritedDescription(fed) : null,
        };
    });
}

function inferredType(parameter: TemplateParameter): QueryParameterType | null {
    return parameter.InferredType === 'unknown' ? null : parameter.InferredType;
}

function hintFor(name: string, hints?: ReadonlyMap<string, string>): string | null {
    return hints?.get(name) ?? hints?.get(name.toLowerCase()) ?? null;
}

/** The composed query's parameter an explicit `(Arg=Name)` argument passes `name` to; the first one wins. */
function passThroughTarget(name: string, references: readonly ResolvedReference[]): CompositionCandidateParameter | undefined {
    const wanted = name.toLowerCase();
    for (const { Reference, Target } of references) {
        const argument = Reference.Arguments.find(a => a.Expression.Kind === 'Name' && a.Expression.Name.toLowerCase() === wanted);
        const parameter = argument ? Target.QueryParameters.find(tp => tp.Name.toLowerCase() === argument.Name.toLowerCase()) : undefined;
        if (parameter) return parameter;
    }
    return undefined;
}

const ARITHMETIC_OPERATORS = new Set(['+', '-', '*', '/', '%']);

/**
 * `number` when `name` is read by an arithmetic composition argument (`Lo=Floor + 4`) that feeds a
 * number parameter of the composed query: the outer value must be a number for the arithmetic to
 * mean what it says (a string value would be concatenated by `+`). Otherwise no type.
 */
function arithmeticTargetType(name: string, references: readonly ResolvedReference[]): QueryParameterType | null {
    const wanted = name.toLowerCase();
    for (const { Reference, Target } of references) {
        for (const argument of Reference.Arguments) {
            const expression = argument.Expression;
            if (expression.Kind !== 'Binary' || !ARITHMETIC_OPERATORS.has(expression.Operator)) continue;
            if (!argument.ReferencedNames.some(n => n.toLowerCase() === wanted)) continue;
            const parameter = Target.QueryParameters.find(tp => tp.Name.toLowerCase() === argument.Name.toLowerCase());
            if (parameter?.Type === 'number') return 'number';
        }
    }
    return null;
}

function inheritedDescription(parameter: CompositionCandidateParameter): string | null {
    return parameter.Description ? `${parameter.Description} (passed through to "${parameter.Query}" as "${parameter.Name}")` : null;
}

// ─── Structure: entities read, duplicate output names ───────────────────────

/** The table references and duplicate output names of every SQL reading of the template (one per branch variant). */
function readStructure(sql: string, dialect: ParserDialect, input: QueryExtractionInput): { Entities: QueryEntityFact[] | null; DuplicateOutputNames: string[]; ReadsParameterNamedSource: boolean; Notes: string[] } {
    const views = TemplateSqlViews(sql, dialect);
    const references: TableReference[] = views.flatMap(v => [...v.Document.TableReferences().Value]);
    const duplicates = new Map<string, string>();
    for (const view of views) {
        for (const d of view.Document.DuplicateOutputNames().Value) duplicates.set(d.Name.toLowerCase(), d.Name);
    }
    const complete = views.every(v => v.Complete);
    const entities = BindTableReferences(references, new EntityObjectIndex(input.Entities), dialect.Grammar.DefaultSchema);
    return {
        Entities: complete ? entities : null,
        DuplicateOutputNames: [...duplicates.values()],
        ReadsParameterNamedSource: references.some(isParameterNamedReference),
        Notes: complete ? [] : ['The SQL could not be read completely, so its Query Entities were left as they are.'],
    };
}

/** The placeholder a template view writes for a `{{ }}` hole that stands where a name goes. */
const IDENTIFIER_PLACEHOLDER = /^__MJI_\w+__$/;

/** Whether a table reference's name (any part of it) is a template hole, not a name written in the SQL. */
function isParameterNamedReference(reference: TableReference): boolean {
    if (reference.CTE !== null || reference.Kind !== 'Table') return false;
    return reference.Name.Parts.some(part => IDENTIFIER_PLACEHOLDER.test(part.Value));
}
