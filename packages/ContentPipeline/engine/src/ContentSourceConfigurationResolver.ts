/**
 * @fileoverview {@link ContentSourceConfigurationResolver} — reads a Content Source's type-specific settings
 * with its type's declared defaults applied and the declaration validated. Stages and drivers call this
 * rather than parsing `Configuration` themselves.
 *
 * @module @memberjunction/content-pipeline
 */

import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    KnowledgeHubMetadataEngine,
    MJContentSourceEntity,
    MJContentSourceTypeEntity_IContentSourceTypeField,
} from '@memberjunction/core-entities';

type SourceTypeField = MJContentSourceTypeEntity_IContentSourceTypeField;

/** One thing wrong with a source's configuration. */
export interface ConfigurationProblem {
    /** The declared field key, or null for a source-level problem. */
    Key: string | null;
    Message: string;
}

/** A source's settings, resolved and checked. */
export interface ResolvedSourceConfiguration {
    ContentSourceID: string;
    URL: string;
    /** `SourceSpecificConfiguration`, with the type's declared defaults filled in. */
    Settings: Readonly<Record<string, unknown>>;
    /** {@link Settings} flattened to strings. */
    Parameters: Readonly<Record<string, string>>;
    /** The whole `Configuration`, for framework-level settings. */
    Configuration: Readonly<Record<string, unknown>>;
    /** `ContentSourceType.DriverClass`. */
    DriverClass: string | null;
    Problems: readonly ConfigurationProblem[];
    IsValid: boolean;
}

/** Resolves Content Source configuration from the cached Knowledge Hub metadata. */
export class ContentSourceConfigurationResolver {
    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser?: UserInfo,
    ) {}

    /** Resolve a source's configuration. Returns problems rather than throwing, so a caller can report them all. */
    public async Resolve(contentSourceID: string, contextUser?: UserInfo): Promise<ResolvedSourceConfiguration> {
        const user = contextUser ?? this.contextUser;
        if (!user) {
            throw new Error('ContentSourceConfigurationResolver: a context user is required');
        }
        const source = await this.loadSource(contentSourceID, user);
        const type = KnowledgeHubMetadataEngine.Instance.GetContentSourceTypeByID(source.ContentSourceTypeID ?? '');
        const configuration = { ...(source.ConfigurationObject ?? {}) };
        const declared = type?.ConfigurationObject?.RequiredFields ?? [];
        const settings = ApplySourceDefaults(declared, { ...(configuration.SourceSpecificConfiguration ?? {}) });
        const problems = ValidateSourceSettings(declared, settings);
        return {
            ContentSourceID: contentSourceID,
            URL: source.URL ?? '',
            Settings: settings,
            Parameters: flatten(settings),
            Configuration: configuration,
            DriverClass: type?.DriverClass ?? null,
            Problems: problems,
            IsValid: problems.length === 0,
        };
    }

    /** The source from the engine's cache, refreshed once on a miss so a worker started before the source existed still finds it. */
    private async loadSource(contentSourceID: string, contextUser: UserInfo): Promise<MJContentSourceEntity> {
        const engine = KnowledgeHubMetadataEngine.Instance;
        await engine.Config(false, contextUser, this.provider);
        let source = engine.GetContentSourceByID(contentSourceID);
        if (!source) {
            await engine.Config(true, contextUser, this.provider);
            source = engine.GetContentSourceByID(contentSourceID);
        }
        if (!source) {
            throw new Error(`Content Source '${contentSourceID}' not found`);
        }
        return source;
    }
}

/** Fill in the declared default for any field the source left empty. */
export function ApplySourceDefaults(
    declared: readonly SourceTypeField[],
    stored: Record<string, unknown>,
): Record<string, unknown> {
    const settings = { ...stored };
    for (const field of declared) {
        if (isEmpty(settings[field.Key]) && field.DefaultValue !== undefined) {
            settings[field.Key] = field.DefaultValue;
        }
    }
    return settings;
}

/** Check settings against the type's declaration. */
export function ValidateSourceSettings(
    declared: readonly SourceTypeField[],
    settings: Readonly<Record<string, unknown>>,
): ConfigurationProblem[] {
    const problems: ConfigurationProblem[] = [];
    for (const field of declared) {
        const value = settings[field.Key];
        const problem = isEmpty(value)
            ? field.Required ? `${field.Label ?? field.Key} is required` : null
            : checkType(field, value);
        if (problem) {
            problems.push({ Key: field.Key, Message: problem });
        }
    }
    return problems;
}

function checkType(field: SourceTypeField, value: unknown): string | null {
    const label = field.Label ?? field.Key;
    if (field.Type === 'dropdown') {
        const allowed = (field.Options ?? []).map((o) => o.Value);
        return allowed.length === 0 || allowed.includes(String(value)) ? null : `${label} must be one of: ${allowed.join(', ')}`;
    }
    if (field.Type === 'url') {
        try {
            void new URL(String(value));
        } catch {
            return `${label} must be a valid URL`;
        }
    }
    return null;
}

function isEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === '';
}

/** Settings as strings, JSON-encoding anything structured rather than dropping it. */
function flatten(settings: Readonly<Record<string, unknown>>): Record<string, string> {
    const flat: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings)) {
        if (value !== null && value !== undefined) {
            flat[key] = typeof value === 'string' ? value : JSON.stringify(value);
        }
    }
    return flat;
}
