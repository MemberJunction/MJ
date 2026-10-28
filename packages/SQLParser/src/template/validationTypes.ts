import type { TemplateParameterType } from './queryLanguage.js';

/**
 * Which save-time rules a validation applies.
 *
 * - `Save`: a new or edited query. Every rule is an error.
 * - `Refresh`: re-checking a query already saved. Two rules that existing queries may have
 *   relied on (a filter that does not fit the declared type, and an unpassed composition
 *   parameter named like an outer one) are warnings.
 */
export type QueryTemplateValidationMode = 'Save' | 'Refresh';

/** A parameter as declared in the query's metadata. */
export interface DeclaredTemplateParameter {
    readonly Name: string;
    /** The declared type: `string`, `number`, `date`, `boolean` or `array`. */
    readonly Type: TemplateParameterType | string;
    /** Whether only the server sets the value, never a caller. Such a value may be written without a filter. */
    readonly IsServerSet?: boolean;
}

/** A parameter of a composed query. */
export interface CompositionTargetParameter {
    readonly Name: string;
    readonly IsRequired: boolean;
}

/** What the resolver knows about a composed query. */
export interface CompositionTarget {
    readonly Exists: boolean;
    readonly Reusable: boolean;
    readonly Parameters: readonly CompositionTargetParameter[];
    /**
     * The query's own full path (category path and name), when the resolver found it by a partial
     * path: a whole-segment suffix of its category path (see `MatchCompositionPath`). A reference
     * that differs from it is reported (`MJQ_COMPOSITION_PARTIAL_PATH`).
     */
    readonly FullPath?: string;
    /** The full paths of the queries it composes in turn, for cycle detection. Leave out when unknown. */
    readonly Compositions?: readonly string[];
}

/** Looks up a composed query by its full path (category path and name); `null` or `undefined` when it does not exist. */
export type CompositionResolver = (fullPath: string) => CompositionTarget | null | undefined;

/** Options for `QueryTemplate.Validate`. */
export interface QueryTemplateValidateOptions {
    /** Defaults to `Save`. */
    readonly Mode?: QueryTemplateValidationMode;
    /** The query's declared parameters, for the type and filter rules. */
    readonly DeclaredParameters?: readonly DeclaredTemplateParameter[];
    /** The allowed `Context` tokens; defaults to the nine of the language. */
    readonly ContextTokens?: readonly string[];
    /** Resolves composed queries. Without it, composition targets are not checked and the result is incomplete. */
    readonly ResolveComposition?: CompositionResolver;
    /** The full path of the query being validated, so a composition that leads back to it is a cycle. */
    readonly QueryPath?: string;
}

/** The outcome of a validation. */
export interface QueryTemplateValidation {
    /** Whether no diagnostic is an error. */
    readonly IsValid: boolean;
    readonly ErrorCount: number;
    readonly WarningCount: number;
}
