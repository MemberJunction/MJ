import type { DatabasePlatform, QueryDependencySpec, QueryTemplateContext, UserInfo } from '@memberjunction/core';
import type { QueryParameterDefinition } from '@memberjunction/query-processor';
import type { SQLDialect } from '@memberjunction/sql-dialect';
import type { CompositionReference } from '@memberjunction/sql-parser';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { QueryParameterProcessor } from '@memberjunction/query-processor';
import { CompositionLookup } from './compositionLookup.js';
import type { CompositionPath, ResolvedComposition } from './compositionTypes.js';
import { COMPOSITION_RECORDER_NAME, TemplateUnit } from './templateUnit.js';

/** Maximum nesting of compositions: a query composing a query composing … ten levels deep. */
export const MAX_COMPOSITION_DEPTH = 10;

/** What one render of a composed query needs beside the outer query itself. */
export interface CompositionRenderOptions {
    readonly Platform: DatabasePlatform;
    /** The dialect the SQL is read in. */
    readonly Dialect: SQLDialect;
    /** The dialect key the SQL filters render for. */
    readonly DialectKey: string;
    readonly ContextUser?: UserInfo;
    /** The run's server-set values; an unpassed server-set parameter of a composed query reads its own name here. */
    readonly ServerParameters?: Record<string, unknown>;
    /** The `Context` object every template of this render reads (one clock for the whole render). */
    readonly Context: QueryTemplateContext;
    /** The ID of the query being rendered, when it is a saved query, so a composition leading back to it is a cycle. */
    readonly RootQueryID?: string;
    /**
     * Resolve compositions without rendering the outer query: every argument of its compositions
     * must be static, and the outer text keeps its own template tags.
     */
    readonly StaticArgumentsOnly?: boolean;
}

/** One query's SQL and values, to be rendered. */
export interface UnitRenderRequest {
    readonly SQL: string;
    /** Whether the query is flagged a template (`UsesTemplate`). SQL with template syntax renders either way. */
    readonly RendersTemplate: boolean;
    /** Names the query in errors. */
    readonly Label: string;
    readonly Definitions: ReadonlyArray<QueryParameterDefinition>;
    /** Values a caller supplied (or, for a composed query, arguments that came from caller values). */
    readonly Parameters?: Record<string, unknown>;
    /** Values only the server sets (or arguments that came only from server values and constants). */
    readonly ServerParameters?: Record<string, unknown>;
    /** Whether a value for an undeclared name is accepted; decided once the compositions are known. */
    readonly SkipUnknownParameterCheck: (unit: TemplateUnit) => boolean;
    readonly InlineDependencies: QueryDependencySpec[] | undefined;
    readonly Depth: number;
    /** IDs of the queries being rendered around this one, outermost first, this one included. */
    readonly Stack: readonly string[];
}

/** A rendered unit. */
export interface UnitRenderResult {
    /** Its SQL with each composition replaced by the instance's CTE name. */
    readonly SQL: string;
    readonly AppliedParameters: Record<string, string>;
    /** Whether it holds compositions that are SQL (rendered or in a branch not taken). */
    readonly HasCompositions: boolean;
}

/** One composed query with one set of evaluated arguments: rendered once, emitted as one CTE. */
export interface CompositionInstance {
    readonly Key: string;
    readonly CTEName: string;
    readonly Path: CompositionPath;
    readonly Resolved: ResolvedComposition;
    /** The evaluated arguments, keyed by the composed query's parameter names. */
    readonly Arguments: Record<string, unknown>;
    /** The argument names whose values came only from constants and server-set values. */
    readonly TrustedArguments: ReadonlySet<string>;
    readonly Depth: number;
    readonly ParentStack: readonly string[];
    State: 'Pending' | 'Rendering' | 'Done';
    /** The rendered SQL, once {@link State} is `Done`. */
    RenderedSQL: string;
}

/**
 * Render-then-compose for one render: the outer template renders once, each composition it
 * reaches records an instance (query + arguments evaluated in the caller's scope) and writes the
 * instance's CTE name; each instance then renders on its own, with only its arguments, its own
 * parameter definitions and the interpreter gate, recursively. All state lives on this object, so
 * renders are re-entrant and safe under concurrency.
 *
 * Instances are deduplicated by query ID and evaluated arguments, cycles and depth are checked,
 * and each saved composed query must be Reusable, Approved and runnable by the context user.
 * {@link Instances} lists them dependencies first (post-order).
 */
export class CompositionRender {
    /** Every rendered instance, each after the instances it composes. */
    readonly Instances: CompositionInstance[] = [];
    private readonly byKey = new Map<string, CompositionInstance>();

    constructor(private readonly options: CompositionRenderOptions) {}

    /** Renders the outer query and, through it, every composed instance. */
    RenderOuter(request: UnitRenderRequest): UnitRenderResult {
        return this.renderUnit(request, true);
    }

    private renderUnit(request: UnitRenderRequest, outer: boolean): UnitRenderResult {
        const staticOnly = outer && this.options.StaticArgumentsOnly === true;
        const unit = TemplateUnit.Read(request.SQL, this.options.Dialect, staticOnly);
        const recorder = new UnitRecorder(this, unit, request, this.trustedNames(unit, request));
        let sql: string;
        let applied: Record<string, string> = {};
        if (this.rendersAsTemplate(request, unit, outer) && !staticOnly) {
            unit.AssertRenderable(request.Label, request.Definitions);
            const result = this.process(request, unit, unit.TemplateText(), recorder, request.Definitions);
            sql = result.SQL;
            applied = result.Applied;
        } else if (unit.References.length > 0) {
            this.evaluateCalls(request, unit, recorder, staticOnly);
            sql = unit.WithNames(recorder.NamesByIndex);
        } else {
            sql = unit.SQL;
        }
        for (const instance of recorder.Used) {
            if (instance.State === 'Pending') this.renderInstance(instance);
        }
        return { SQL: sql, AppliedParameters: applied, HasCompositions: unit.References.length > 0 };
    }

    /**
     * Whether a unit renders as a template: when it is flagged one, and otherwise when its SQL holds
     * template syntax and it takes part in a composition (a composed instance, or an outer query that
     * composes), because the `UsesTemplate` flag can be stale (COMPAT-MAP B12) and such SQL always
     * rendered when composed. A query that composes nothing keeps the flag's meaning: unflagged
     * template-looking text stays verbatim.
     */
    private rendersAsTemplate(request: UnitRenderRequest, unit: TemplateUnit, outer: boolean): boolean {
        if (request.RendersTemplate) return true;
        return (!outer || unit.References.length > 0) && unit.HasTemplateSyntax();
    }

    /**
     * Evaluates the composition arguments of a query that is not rendered as a template. Static
     * arguments need no values; arguments that read the query's parameters are evaluated with its
     * validated values.
     */
    private evaluateCalls(request: UnitRenderRequest, unit: TemplateUnit, recorder: UnitRecorder, staticOnly: boolean): void {
        const allStatic = unit.References.every(r => r.Arguments.every(a => a.IsStatic));
        if (staticOnly && !allStatic) {
            const passed = unit.References.flatMap(r => r.Arguments.filter(a => !a.IsStatic).map(a => `"${a.Name}" of "${r.FullPath}"`));
            throw new Error(
                `Compositions resolved without rendering take static arguments only, but ${passed.join(', ')} reads a value of the outer query. ` +
                'Run the query through the render pipeline (RenderPipeline.Run) to pass values through.',
            );
        }
        // Static arguments need no validated values: the query's own definitions are left out, but a
        // caller value for a name a composed query protects is still refused.
        const values: UnitRenderRequest = allStatic ? { ...request, Definitions: [], SkipUnknownParameterCheck: () => true } : request;
        this.process(values, unit, unit.CallsText(), recorder, values.Definitions);
    }

    private process(
        request: UnitRenderRequest, unit: TemplateUnit, text: string, recorder: UnitRecorder, definitions: ReadonlyArray<QueryParameterDefinition>,
    ): { SQL: string; Applied: Record<string, string> } {
        const result = QueryParameterProcessor.ProcessQueryTemplate(
            { SQL: text, UsesTemplate: true, Parameters: definitions },
            request.Parameters,
            text,
            request.SkipUnknownParameterCheck(unit),
            { ServerParameters: request.ServerParameters, ProtectedNames: this.protectedNames(unit, request.InlineDependencies), Context: this.options.Context },
            { DialectKey: this.options.DialectKey, Scope: { [COMPOSITION_RECORDER_NAME]: recorder.Call } },
        );
        if (recorder.Failure) throw recorder.Failure;
        if (!result.success) throw new Error(result.error);
        return { SQL: result.processedSQL, Applied: (result.appliedParameters ?? {}) as Record<string, string> };
    }

    /**
     * The names a caller value may not use because they reach a server-set parameter of a query
     * this unit composes: the outer names an argument for it reads, or the parameter's own name
     * when no argument is passed for it. A composition that does not resolve protects nothing (it
     * fails when reached).
     */
    private protectedNames(unit: TemplateUnit, inline: QueryDependencySpec[] | undefined): string[] {
        const names = new Set<string>();
        for (const reference of unit.References) {
            const resolved = CompositionLookup.TryResolve(reference, inline);
            for (const parameter of resolved?.ParameterDefinitions.filter(p => p.IsServerSet) ?? []) {
                const argument = reference.Arguments.find(a => a.Name.toLowerCase() === parameter.Name.toLowerCase());
                if (!argument) names.add(parameter.Name);
                else if (!argument.IsStatic) argument.ReferencedNames.forEach(n => names.add(n));
            }
        }
        return [...names];
    }

    /** The names in a unit's scope whose values only the server sets. Template-assigned names never count. */
    private trustedNames(unit: TemplateUnit, request: UnitRenderRequest): ReadonlySet<string> {
        const assigned = unit.AssignedNames();
        const trusted = [
            ...request.Definitions.filter(d => d.IsServerSet).map(d => d.Name),
            ...this.protectedNames(unit, request.InlineDependencies),
            ...Object.keys(request.ServerParameters ?? {}),
        ];
        return new Set(trusted.filter(n => !assigned.has(n)));
    }

    // ─── Instances ──────────────────────────────────────────

    /**
     * Records the instance a composition reaches with evaluated arguments and returns its CTE
     * name. A repeat (same query, same arguments) returns the existing instance.
     * @throws Error when the query is not found, may not be composed, or leads back to a query being rendered.
     */
    RecordInstance(reference: CompositionReference, args: Record<string, unknown>, trusted: ReadonlySet<string>, request: UnitRenderRequest): CompositionInstance {
        const resolved = CompositionLookup.Resolve(reference, request.InlineDependencies);
        const id = resolved.Query.ID;
        const key = `${NormalizeUUID(id)}|${StableArguments(args)}|${[...trusted].sort().join(',')}`;
        const existing = this.byKey.get(key);
        if (existing) {
            if (existing.State === 'Rendering') throw cycleError([...request.Stack, id], resolved.Query.Name);
            return existing;
        }
        if (request.Stack.some(s => UUIDsEqual(s, id))) throw cycleError([...request.Stack, id], resolved.Query.Name);
        CompositionLookup.AssertComposable(resolved, reference, this.options.ContextUser);
        const instance: CompositionInstance = {
            Key: key, CTEName: this.cteName(resolved.Query.Name, key), Path: reference, Resolved: resolved, Arguments: args,
            TrustedArguments: trusted, Depth: request.Depth + 1, ParentStack: request.Stack, State: 'Pending', RenderedSQL: '',
        };
        this.byKey.set(key, instance);
        return instance;
    }

    private renderInstance(instance: CompositionInstance): void {
        if (instance.Depth > MAX_COMPOSITION_DEPTH) {
            throw new Error(`Query composition depth exceeds maximum of ${MAX_COMPOSITION_DEPTH}. This likely indicates an overly deep nesting chain.`);
        }
        instance.State = 'Rendering';
        const query = instance.Resolved.Query;
        const values = this.instanceValues(instance);
        const result = this.renderUnit({
            SQL: query.GetPlatformSQL(this.options.Platform) ?? '',
            RendersTemplate: query.UsesTemplate === true,
            Label: `"${instance.Path.FullPath}"`,
            Definitions: instance.Resolved.ParameterDefinitions,
            Parameters: values.Caller,
            ServerParameters: values.Server,
            SkipUnknownParameterCheck: () => true,
            InlineDependencies: instance.Resolved.InlineDependencies,
            Depth: instance.Depth,
            Stack: [...instance.ParentStack, query.ID],
        }, false);
        instance.RenderedSQL = result.SQL;
        instance.State = 'Done';
        this.Instances.push(instance);
    }

    /**
     * An instance's values: arguments from caller values as caller values, the rest as server
     * values, and, for a server-set parameter no argument is passed for, the run's server value of
     * that name.
     */
    private instanceValues(instance: CompositionInstance): { Caller: Record<string, unknown>; Server: Record<string, unknown> } {
        const caller: Record<string, unknown> = {};
        const server: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(instance.Arguments)) {
            (instance.TrustedArguments.has(name) ? server : caller)[name] = value;
        }
        for (const parameter of instance.Resolved.ParameterDefinitions.filter(p => p.IsServerSet)) {
            const runValue = this.options.ServerParameters?.[parameter.Name];
            if (!(parameter.Name in instance.Arguments) && runValue !== undefined) server[parameter.Name] = runValue;
        }
        return { Caller: caller, Server: server };
    }

    private cteName(queryName: string, key: string): string {
        const sanitized = queryName.replace(/[^a-zA-Z0-9_ ]/g, '').replace(/\s+/g, '_').substring(0, 50);
        return this.options.Dialect.QuoteIdentifier(`__cte_${sanitized}_${ShortHash(key)}`);
    }
}

/**
 * The composition recorder of one unit's render: the function the template calls for each
 * composition. It evaluates nothing itself (Nunjucks evaluated the arguments in the template's
 * scope); it maps them to the composed query's parameters, records the instance and returns its
 * CTE name. A failure is kept and rethrown after the render, unchanged.
 */
class UnitRecorder {
    readonly NamesByIndex: string[] = [];
    readonly Used = new Set<CompositionInstance>();
    Failure: Error | null = null;

    constructor(
        private readonly render: CompositionRender,
        private readonly unit: TemplateUnit,
        private readonly request: UnitRenderRequest,
        private readonly trustedNames: ReadonlySet<string>,
    ) {}

    /** Called by the template as `__mjComposition(index, [argument values])`. */
    readonly Call = (index: number, values: unknown[]): string => {
        try {
            const reference = this.unit.References[index];
            const resolvedParameters = CompositionLookup.TryResolve(reference, this.request.InlineDependencies)?.ParameterDefinitions ?? [];
            const mapped = mapArguments(reference, values, resolvedParameters, this.trustedNames);
            const instance = this.render.RecordInstance(reference, mapped.Arguments, mapped.Trusted, this.request);
            this.Used.add(instance);
            this.NamesByIndex[index] = instance.CTEName;
            return instance.CTEName;
        } catch (error: unknown) {
            this.Failure ??= error instanceof Error ? error : new Error(String(error));
            throw this.Failure;
        }
    };
}

/**
 * Pairs a composition's evaluated argument values with the composed query's parameters (names
 * matched ignoring case, written as the parameter declares them). An argument that evaluated to
 * nothing is absent. A boolean parameter given the dialect's 1/0 gets the boolean back, so its own
 * validation reads it right.
 */
function mapArguments(
    reference: CompositionReference, values: unknown[], parameters: ReadonlyArray<QueryParameterDefinition>, trustedNames: ReadonlySet<string>,
): { Arguments: Record<string, unknown>; Trusted: Set<string> } {
    const args: Record<string, unknown> = {};
    const trusted = new Set<string>();
    reference.Arguments.forEach((argument, i) => {
        const value = values[i];
        if (value === undefined) return;
        const parameter = parameters.find(p => p.Name.toLowerCase() === argument.Name.toLowerCase());
        const name = parameter?.Name ?? argument.Name;
        args[name] = parameter?.Type === 'boolean' && (value === 1 || value === 0) ? value === 1 : value;
        if (argument.IsStatic || argument.ReferencedNames.every(n => trustedNames.has(n))) trusted.add(name);
    });
    return { Arguments: args, Trusted: trusted };
}

/** The arguments as a stable string: sorted by name, dates as ISO text. */
export function StableArguments(args: Record<string, unknown>): string {
    return JSON.stringify(Object.keys(args).sort().map(k => {
        const value = args[k];
        return [k, value instanceof Date ? value.toISOString() : value];
    }));
}

/** A short deterministic hash of `input`, base 36. */
export function ShortHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36).substring(0, 6);
}

function cycleError(path: readonly string[], name: string): Error {
    return new Error(`Circular query dependency detected: ${path.join(' → ')}. Query "${name}" is already being resolved.`);
}
