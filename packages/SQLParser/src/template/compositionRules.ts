import { MakeDiagnostic } from '../common/analysis.js';
import type { Diagnostic, DiagnosticSeverity, Span } from '../common/analysis.js';
import { MJQueryDiagnosticCodes } from '../common/diagnosticCodes.js';
import type { CompositionReference } from './compositionReferences.js';
import type { CompositionResolver, CompositionTarget, QueryTemplateValidateOptions } from './validationTypes.js';

/** What {@link CompositionRules.Check} found. */
export interface CompositionCheck {
    readonly Diagnostics: readonly Diagnostic[];
    /** Whether every composition's target was checked. */
    readonly Complete: boolean;
}

/**
 * The save-time rules for compositions: the table-source position, argument names, and (with a
 * resolver) the target's existence, reusability, parameters and cycles. Arguments are explicit,
 * like a function call: an inner parameter that is not passed has no value.
 */
export class CompositionRules {
    private readonly diagnostics: Diagnostic[] = [];
    private readonly outerNames: ReadonlySet<string>;
    private readonly resolved = new Map<string, CompositionTarget | null>();

    private constructor(private readonly options: QueryTemplateValidateOptions, outerNames: readonly string[]) {
        this.outerNames = new Set(outerNames.map(n => n.toLowerCase()));
    }

    /**
     * Applies the composition rules.
     * @param outerNames - The outer query's parameter names (from the template and its declarations).
     */
    static Check(references: readonly CompositionReference[], options: QueryTemplateValidateOptions, outerNames: readonly string[]): CompositionCheck {
        const rules = new CompositionRules(options, outerNames);
        for (const reference of references) rules.checkReference(reference);
        const unchecked = references.length > 0 && options.ResolveComposition === undefined;
        if (unchecked) {
            rules.add(MJQueryDiagnosticCodes.CompositionUnchecked, 'Info', references[0].Span,
                'No resolver was given, so the composed queries were not checked.', 'Validate with a ResolveComposition callback.');
        }
        return { Diagnostics: rules.diagnostics, Complete: !unchecked };
    }

    private checkReference(reference: CompositionReference): void {
        if (!reference.InTablePosition) {
            this.add(MJQueryDiagnosticCodes.CompositionPosition, 'Error', reference.Span,
                'A composition can stand only where a table source goes: after FROM, JOIN or APPLY, or after a comma in a FROM list.',
                'Write FROM {{query:"…"}} alias, or JOIN {{query:"…"}} alias ON ….');
        }
        this.checkDuplicateArguments(reference);
        const resolver = this.options.ResolveComposition;
        if (resolver === undefined) return;
        const target = this.resolve(resolver, reference.FullPath);
        if (target === null) {
            this.add(MJQueryDiagnosticCodes.CompositionNotFound, 'Error', reference.PathSpan, `No query exists at "${reference.FullPath}".`,
                'Give the full category path and query name, e.g. "Sales/Reports/Top Customers".');
            return;
        }
        if (!target.Reusable) {
            this.add(MJQueryDiagnosticCodes.CompositionNotReusable, 'Error', reference.PathSpan, `"${reference.FullPath}" is not marked Reusable.`,
                'Mark the composed query Reusable, or copy its SQL in.');
        }
        this.checkArguments(reference, target);
        this.checkCycle(reference, resolver);
    }

    private checkDuplicateArguments(reference: CompositionReference): void {
        const seen = new Set<string>();
        for (const argument of reference.Arguments) {
            const key = argument.Name.toLowerCase();
            if (seen.has(key)) {
                this.add(MJQueryDiagnosticCodes.CompositionDuplicateArgument, 'Error', argument.NameSpan, `"${argument.Name}" is passed twice.`, 'Pass each argument once.');
            }
            seen.add(key);
        }
    }

    private checkArguments(reference: CompositionReference, target: CompositionTarget): void {
        const passed = new Set(reference.Arguments.map(a => a.Name.toLowerCase()));
        const declared = new Set(target.Parameters.map(p => p.Name.toLowerCase()));
        for (const argument of reference.Arguments) {
            if (declared.has(argument.Name.toLowerCase())) continue;
            this.add(MJQueryDiagnosticCodes.CompositionUnknownArgument, 'Error', argument.NameSpan,
                `"${reference.FullPath}" has no parameter "${argument.Name}".`, `Use one of: ${target.Parameters.map(p => p.Name).join(', ') || '(none)'}.`);
        }
        for (const parameter of target.Parameters) {
            if (passed.has(parameter.Name.toLowerCase())) continue;
            if (parameter.IsRequired) this.missing(reference, parameter.Name);
            else if (this.outerNames.has(parameter.Name.toLowerCase())) this.implicit(reference, parameter.Name);
        }
    }

    private missing(reference: CompositionReference, name: string): void {
        this.add(MJQueryDiagnosticCodes.CompositionMissingArgument, 'Error', reference.Span,
            `"${reference.FullPath}" requires "${name}", and it is not passed.`, `Pass it explicitly: (${name}=${name}) or (${name}='value').`);
    }

    private implicit(reference: CompositionReference, name: string): void {
        const severity: DiagnosticSeverity = this.options.Mode === 'Refresh' ? 'Warning' : 'Error';
        this.add(MJQueryDiagnosticCodes.CompositionImplicitArgument, severity, reference.Span,
            `"${name}" is a parameter of both queries but is not passed to "${reference.FullPath}"; values never flow implicitly.`,
            `Pass it explicitly as (${name}=${name}), or rename one of them.`);
    }

    /** Follows compositions from the target; reaching the query being validated, or a query twice on one path, is a cycle. */
    private checkCycle(reference: CompositionReference, resolver: CompositionResolver): void {
        const self = this.options.QueryPath?.toLowerCase();
        const path = this.findCycle(reference.FullPath, resolver, self, new Set<string>(), new Set<string>());
        if (path === null) return;
        this.add(MJQueryDiagnosticCodes.CompositionCycle, 'Error', reference.Span, `Compositions loop: ${[reference.FullPath, ...path].join(' → ')}.`,
            'Remove one of the compositions in the loop.');
    }

    private findCycle(fullPath: string, resolver: CompositionResolver, self: string | undefined, onPath: Set<string>, done: Set<string>): string[] | null {
        const key = fullPath.toLowerCase();
        if (key === self) return [];
        if (onPath.has(key)) return [];
        if (done.has(key)) return null;
        onPath.add(key);
        for (const next of this.resolve(resolver, fullPath)?.Compositions ?? []) {
            const tail = this.findCycle(next, resolver, self, onPath, done);
            if (tail !== null) return [next, ...tail];
        }
        onPath.delete(key);
        done.add(key);
        return null;
    }

    private resolve(resolver: CompositionResolver, fullPath: string): CompositionTarget | null {
        const key = fullPath.toLowerCase();
        if (!this.resolved.has(key)) {
            const target = resolver(fullPath);
            this.resolved.set(key, target && target.Exists ? target : null);
        }
        return this.resolved.get(key) ?? null;
    }

    private add(code: string, severity: DiagnosticSeverity, span: Span, message: string, hint: string): void {
        this.diagnostics.push(MakeDiagnostic(code, severity, span, message, hint));
    }
}
