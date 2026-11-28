/**
 * Source language and `erasableSyntaxOnly` metadata contracts for
 * {@link ComponentSpec} (Wave S0, P6).
 *
 * Legacy component specs omit `language` and continue resolving to `'jsx'`
 * without modification (G9 backward compatibility).
 */

/**
 * Supported source languages for interactive component `code`.
 */
export const COMPONENT_LANGUAGES = ['jsx', 'tsx'] as const;

/**
 * Source code language identifier for {@link ComponentSpec.language}.
 */
export type ComponentLanguage = (typeof COMPONENT_LANGUAGES)[number];

/**
 * Default component source language when `ComponentSpec.language` is omitted.
 */
export const DEFAULT_COMPONENT_LANGUAGE: ComponentLanguage = 'jsx';

/**
 * Runtime-emitting TypeScript syntax constructs disallowed when
 * `erasableSyntaxOnly` is enabled.
 */
export const TSX_DISALLOWED_SYNTAX_KINDS = [
    'enum',
    'namespace',
    'parameter-property',
    'decorator',
] as const;

/**
 * Single disallowed TypeScript construct identifier for `erasableSyntaxOnly`.
 */
export type ComponentTsxDisallowedSyntax = (typeof TSX_DISALLOWED_SYNTAX_KINDS)[number];

/**
 * Supported JSX transform targets for TSX compilation.
 */
export type ComponentJsxTransform = 'react' | 'react-jsx';

/**
 * Detailed compilation & syntax-constraint metadata for TSX components (P6).
 */
export interface ComponentTsxMetadata {
    /**
     * Requires `code` to use only erasable TypeScript syntax (disallows `enum`,
     * value `namespace`, and constructor parameter properties), enabling fast
     * type-stripping without full TypeScript semantic emit.
     */
    erasableSyntaxOnly: boolean;

    /**
     * Optional JSX transform mode expected by the component code.
     */
    jsxTransform?: ComponentJsxTransform;

    /**
     * Optional minimum TypeScript language version targeted by the component.
     */
    targetTypeScriptVersion?: string;

    /**
     * Explicit list of runtime-emitting TypeScript constructs disallowed in `code`.
     */
    disallowedSyntax?: readonly ComponentTsxDisallowedSyntax[];
}

/**
 * Normalized language resolution output for a {@link ComponentSpec}.
 */
export interface ResolvedComponentLanguageInfo {
    language: ComponentLanguage;
    isTsx: boolean;
    erasableSyntaxOnly: boolean;
    jsxTransform: ComponentJsxTransform;
    disallowedSyntax: readonly ComponentTsxDisallowedSyntax[];
}

/**
 * Minimal structural projection of `ComponentSpec` language fields used by
 * pure resolvers and runtime validators.
 */
export interface ComponentLanguageSpecProjection {
    language?: ComponentLanguage;
    erasableSyntaxOnly?: boolean;
    tsxMetadata?: ComponentTsxMetadata;
}

/**
 * Runtime type guard for {@link ComponentLanguage}.
 */
export function IsComponentLanguage(value: unknown): value is ComponentLanguage {
    return value === 'jsx' || value === 'tsx';
}

/**
 * Runtime type guard for {@link ComponentTsxMetadata}.
 */
export function IsComponentTsxMetadata(value: unknown): value is ComponentTsxMetadata {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    if (!('erasableSyntaxOnly' in value) || typeof value.erasableSyntaxOnly !== 'boolean') {
        return false;
    }
    if ('jsxTransform' in value && value.jsxTransform !== undefined) {
        if (value.jsxTransform !== 'react' && value.jsxTransform !== 'react-jsx') {
            return false;
        }
    }
    if ('targetTypeScriptVersion' in value && value.targetTypeScriptVersion !== undefined) {
        if (typeof value.targetTypeScriptVersion !== 'string' || value.targetTypeScriptVersion.trim().length === 0) {
            return false;
        }
    }
    if ('disallowedSyntax' in value && value.disallowedSyntax !== undefined) {
        if (!isValidDisallowedSyntaxList(value.disallowedSyntax)) {
            return false;
        }
    }
    return true;
}

function isValidDisallowedSyntaxList(value: unknown): value is readonly ComponentTsxDisallowedSyntax[] {
    if (!Array.isArray(value)) {
        return false;
    }
    for (const item of value) {
        if (typeof item !== 'string' || !(TSX_DISALLOWED_SYNTAX_KINDS as readonly string[]).includes(item)) {
            return false;
        }
    }
    return true;
}

/**
 * Resolves the effective source language of a component spec.
 * Omitted or nullish `language` defaults safely to `'jsx'` (G9).
 */
export function ResolveComponentLanguage(
    spec: Pick<ComponentLanguageSpecProjection, 'language'> | null | undefined
): ComponentLanguage {
    if (!spec || spec.language === undefined || spec.language === null) {
        return DEFAULT_COMPONENT_LANGUAGE;
    }
    return spec.language === 'tsx' ? 'tsx' : DEFAULT_COMPONENT_LANGUAGE;
}

/**
 * Resolves whether `erasableSyntaxOnly` enforcement applies to a component spec.
 * TSX components default to `true` unless explicitly set to `false`; JSX components
 * default to `false` unless explicitly configured.
 */
export function ResolveErasableSyntaxOnly(
    spec: ComponentLanguageSpecProjection | null | undefined
): boolean {
    if (!spec) {
        return false;
    }
    if (spec.tsxMetadata !== undefined) {
        return spec.tsxMetadata.erasableSyntaxOnly;
    }
    if (spec.erasableSyntaxOnly !== undefined) {
        return spec.erasableSyntaxOnly;
    }
    return ResolveComponentLanguage(spec) === 'tsx';
}

/**
 * Resolves full normalized language & TSX compilation metadata for a spec.
 */
export function ResolveComponentLanguageInfo(
    spec: ComponentLanguageSpecProjection | null | undefined
): ResolvedComponentLanguageInfo {
    const language = ResolveComponentLanguage(spec);
    const erasableSyntaxOnly = ResolveErasableSyntaxOnly(spec);
    const jsxTransform: ComponentJsxTransform = spec?.tsxMetadata?.jsxTransform ?? 'react';
    const disallowedSyntax: readonly ComponentTsxDisallowedSyntax[] =
        spec?.tsxMetadata?.disallowedSyntax ?? (erasableSyntaxOnly ? TSX_DISALLOWED_SYNTAX_KINDS : []);

    return {
        language,
        isTsx: language === 'tsx',
        erasableSyntaxOnly,
        jsxTransform,
        disallowedSyntax,
    };
}

/**
 * Validates language and `erasableSyntaxOnly` metadata fields on a runtime spec payload.
 * Returns structured errors when unsupported language strings or malformed `tsxMetadata`
 * are supplied. Omitted fields are valid and default to legacy `'jsx'` behavior.
 */
export function ValidateComponentLanguageSpec(
    value: unknown
): { valid: boolean; errors: string[]; resolved?: ResolvedComponentLanguageInfo } {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { valid: false, errors: ['Component spec must be a non-null object.'] };
    }

    const errors: string[] = [];
    if ('language' in value && value.language !== undefined && !IsComponentLanguage(value.language)) {
        errors.push(`Unsupported component language "${String(value.language)}". Expected "jsx" or "tsx".`);
    }
    if ('erasableSyntaxOnly' in value && value.erasableSyntaxOnly !== undefined && typeof value.erasableSyntaxOnly !== 'boolean') {
        errors.push('erasableSyntaxOnly must be a boolean when provided.');
    }
    if ('tsxMetadata' in value && value.tsxMetadata !== undefined && !IsComponentTsxMetadata(value.tsxMetadata)) {
        errors.push('tsxMetadata is malformed; expected { erasableSyntaxOnly: boolean, ... }.');
    }
    if (
        'erasableSyntaxOnly' in value &&
        typeof value.erasableSyntaxOnly === 'boolean' &&
        'tsxMetadata' in value &&
        IsComponentTsxMetadata(value.tsxMetadata) &&
        value.erasableSyntaxOnly !== value.tsxMetadata.erasableSyntaxOnly
    ) {
        errors.push('Conflicting erasableSyntaxOnly values between spec.erasableSyntaxOnly and spec.tsxMetadata.erasableSyntaxOnly.');
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    const projection: ComponentLanguageSpecProjection = {
        language: 'language' in value && IsComponentLanguage(value.language) ? value.language : undefined,
        erasableSyntaxOnly:
            'erasableSyntaxOnly' in value && typeof value.erasableSyntaxOnly === 'boolean'
                ? value.erasableSyntaxOnly
                : undefined,
        tsxMetadata:
            'tsxMetadata' in value && IsComponentTsxMetadata(value.tsxMetadata)
                ? value.tsxMetadata
                : undefined,
    };
    return {
        valid: true,
        errors: [],
        resolved: ResolveComponentLanguageInfo(projection),
    };
}
