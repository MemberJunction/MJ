/**
 * @fileoverview {@link ContentSourceConfigurationResolver} — the one supported way to read a
 * Content Source's type-specific settings.
 *
 * Drivers and stages call this instead of each parsing `Configuration` their own way. It returns a
 * source's settings with the type's declared defaults applied, the declaration validated, and the
 * credential resolved to a reference.
 *
 * **Why one place.** `ContentSource.Configuration` holds two different things: framework-level
 * settings a deployment may set and the person creating a source should never need to understand
 * (taxonomy mode, budgets, vectorization, vector metadata), and the type-specific values that
 * source genuinely owns, under `SourceSpecificConfiguration`. Code reaching into the column
 * directly tends to confuse the two, and writing it back tends to drop whatever it did not know
 * about.
 *
 * @module @memberjunction/content-pipeline
 */

import { IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';

/** One field a Content Source Type declares its sources must provide. */
export interface SourceTypeField {
    Key: string;
    Label?: string;
    Type: string;
    Description?: string;
    Required?: boolean;
    DefaultValue?: string;
    Options?: { Label: string; Value: string }[];
    Minimum?: number;
    Maximum?: number;
}

/** A single thing wrong with a source's configuration. */
export interface ConfigurationProblem {
    /** The declared field key the problem concerns, or null for a source-level problem. */
    Key: string | null;
    /** What is wrong, phrased for whoever has to fix it. */
    Message: string;
}

/** A source's settings, resolved and checked. */
export interface ResolvedSourceConfiguration {
    /** The source's primary key. */
    ContentSourceID: string;
    /** The source's URL column. */
    URL: string;
    /** Type-specific values, with the type's declared defaults filled in for anything unset. */
    Settings: Readonly<Record<string, unknown>>;
    /** The same values flattened to strings, for a driver that wants them that way. */
    Parameters: Readonly<Record<string, string>>;
    /** The whole parsed `Configuration`, for framework-level settings. */
    Configuration: Readonly<Record<string, unknown>>;
    /** What the type declares its sources must provide. */
    DeclaredFields: readonly SourceTypeField[];
    /** Anything that does not meet the type's declaration. Empty when the source is valid. */
    Problems: readonly ConfigurationProblem[];
    /** Convenience: whether {@link Problems} is empty. */
    IsValid: boolean;
}

/**
 * Resolves Content Source configuration.
 *
 * Caches per source for its lifetime — the processor builds one per run, and many records for one
 * source would otherwise each repeat the lookup.
 */
export class ContentSourceConfigurationResolver {
    private readonly cache = new Map<string, Promise<ResolvedSourceConfiguration>>();

    constructor(
        private readonly provider: IMetadataProvider = Metadata.Provider,
        private readonly contextUser?: UserInfo,
    ) {}

    /**
     * Resolve a source's configuration.
     *
     * Returns problems rather than throwing: a stage decides whether a given problem is fatal for
     * what it is about to do, and a connectivity-testing tool wants to show every problem at once
     * rather than the first.
     */
    public Resolve(contentSourceID: string, contextUser?: UserInfo): Promise<ResolvedSourceConfiguration> {
        const existing = this.cache.get(contentSourceID);
        if (existing) {
            return existing;
        }
        const user = contextUser ?? this.contextUser;
        if (!user) {
            return Promise.reject(new Error('ContentSourceConfigurationResolver: a context user is required'));
        }
        const promise = this.load(contentSourceID, user).catch((error: unknown) => {
            this.cache.delete(contentSourceID);
            throw error;
        });
        this.cache.set(contentSourceID, promise);
        return promise;
    }

    /** Forget a source, so the next call re-reads it. */
    public Evict(contentSourceID: string): void {
        this.cache.delete(contentSourceID);
    }

    /** Read the source and its type, then merge, validate and resolve. */
    private async load(contentSourceID: string, contextUser: UserInfo): Promise<ResolvedSourceConfiguration> {
        const rv = RunView.FromMetadataProvider(this.provider);
        const sources = await rv.RunView(
            { EntityName: 'MJ: Content Sources', ExtraFilter: `ID='${contentSourceID}'` },
            contextUser,
        );
        if (!sources.Success || sources.Results.length === 0) {
            throw new Error(`Content Source '${contentSourceID}' not found`);
        }
        const source = sources.Results[0] as Record<string, unknown>;
        const sourceConfig = this.parse(source.Configuration, `Content Source '${contentSourceID}'`);
        const typeConfig = await this.loadTypeConfiguration(source, contextUser);

        const declared = Array.isArray(typeConfig.RequiredFields)
            ? (typeConfig.RequiredFields as SourceTypeField[])
            : [];
        const stored = this.asObject(sourceConfig.SourceSpecificConfiguration);
        const settings = this.applyDefaults(declared, stored);
        const problems = this.validate(declared, settings);

        return {
            ContentSourceID: contentSourceID,
            URL: typeof source.URL === 'string' ? source.URL : '',
            Settings: settings,
            Parameters: this.flatten(settings),
            Configuration: sourceConfig,
            DeclaredFields: declared,
            Problems: problems,
            IsValid: problems.length === 0,
        };
    }

    /** The parsed `Configuration` of the source's type. */
    private async loadTypeConfiguration(
        source: Record<string, unknown>,
        contextUser: UserInfo,
    ): Promise<Record<string, unknown>> {
        const typeID = source.ContentSourceTypeID;
        if (typeof typeID !== 'string') {
            return {};
        }
        const rv = RunView.FromMetadataProvider(this.provider);
        const types = await rv.RunView(
            { EntityName: 'MJ: Content Source Types', ExtraFilter: `ID='${typeID}'` },
            contextUser,
        );
        const type = types.Results?.[0] as Record<string, unknown> | undefined;
        if (!type) {
            return {};
        }
        return this.parse(type.Configuration, `Content Source Type '${typeID}'`);
    }

    /**
     * Fill in the type's declared default for any field the source left empty.
     *
     * A new source therefore starts from the applicable defaults rather than an empty object.
     */
    private applyDefaults(
        declared: readonly SourceTypeField[],
        stored: Record<string, unknown>,
    ): Record<string, unknown> {
        const settings: Record<string, unknown> = { ...stored };
        for (const field of declared) {
            const current = settings[field.Key];
            if ((current === undefined || current === null || current === '') && field.DefaultValue !== undefined) {
                settings[field.Key] = this.coerce(field, field.DefaultValue);
            }
        }
        return settings;
    }

    /** Check the source against its type's declaration. */
    private validate(
        declared: readonly SourceTypeField[],
        settings: Record<string, unknown>,
    ): ConfigurationProblem[] {
        const problems: ConfigurationProblem[] = [];
        for (const field of declared) {
            const value = settings[field.Key];
            if (value === undefined || value === null || value === '') {
                if (field.Required) {
                    problems.push({ Key: field.Key, Message: `${field.Label ?? field.Key} is required` });
                }
                continue;
            }
            const typeProblem = this.checkType(field, value);
            if (typeProblem) {
                problems.push({ Key: field.Key, Message: typeProblem });
            }
        }
        return problems;
    }

    /** Whether a value matches its declared field type. */
    private checkType(field: SourceTypeField, value: unknown): string | null {
        const label = field.Label ?? field.Key;
        switch (field.Type) {
            case 'number': {
                const n = typeof value === 'number' ? value : Number(value);
                if (!Number.isFinite(n)) {
                    return `${label} must be a number`;
                }
                if (field.Minimum !== undefined && n < field.Minimum) {
                    return `${label} must be at least ${field.Minimum}`;
                }
                if (field.Maximum !== undefined && n > field.Maximum) {
                    return `${label} must be at most ${field.Maximum}`;
                }
                return null;
            }
            case 'boolean':
                return typeof value === 'boolean' ? null : `${label} must be true or false`;
            case 'dropdown': {
                const allowed = (field.Options ?? []).map((o) => o.Value);
                return allowed.length === 0 || allowed.includes(String(value))
                    ? null
                    : `${label} must be one of: ${allowed.join(', ')}`;
            }
            case 'url':
                try {
                    void new URL(String(value));
                    return null;
                } catch {
                    return `${label} must be a valid URL`;
                }
            default:
                return null;
        }
    }

    /** Turn a declared default string into the field's real type. */
    private coerce(field: SourceTypeField, raw: string): unknown {
        if (field.Type === 'number') {
            const n = Number(raw);
            return Number.isFinite(n) ? n : raw;
        }
        if (field.Type === 'boolean') {
            return raw === 'true' || raw === '1';
        }
        return raw;
    }

    /** Flatten settings to strings, JSON-encoding anything structured rather than dropping it. */
    private flatten(settings: Record<string, unknown>): Record<string, string> {
        const flat: Record<string, string> = {};
        for (const [key, value] of Object.entries(settings)) {
            if (value === null || value === undefined) {
                continue;
            }
            flat[key] = typeof value === 'string' ? value : JSON.stringify(value);
        }
        return flat;
    }

    /** Parse a `Configuration` column, tolerating absence and malformed JSON. */
    private parse(raw: unknown, who: string): Record<string, unknown> {
        if (typeof raw !== 'string' || raw.trim().length === 0) {
            return {};
        }
        try {
            const parsed: unknown = JSON.parse(raw);
            return this.asObject(parsed);
        } catch {
            LogError(`ContentSourceConfigurationResolver: ${who} has unparseable Configuration JSON`);
            return {};
        }
    }

    /** Narrow to a plain object, or an empty one. */
    private asObject(value: unknown): Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value)
            ? { ...(value as Record<string, unknown>) }
            : {};
    }
}
