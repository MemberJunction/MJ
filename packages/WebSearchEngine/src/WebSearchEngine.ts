/**
 * @fileoverview Metadata-driven web search with priority failover.
 *
 * The engine loads Active `MJ: Web Search Providers` records, instantiates each one's driver via
 * ClassFactory, and serves a search from the highest-priority driver that is available and capable.
 *
 * @module @memberjunction/web-search-engine
 */

import {
    IMetadataProvider,
    LogError,
    LogStatus,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { MJWebSearchProviderEntity } from '@memberjunction/core-entities';
import { CredentialEngine } from '@memberjunction/credentials';
import { BaseSingleton, MJGlobal } from '@memberjunction/global';
import { BaseWebSearchProvider } from './BaseWebSearchProvider';
import {
    RegisteredWebSearchProviderInfo,
    WebSearchAttempt,
    WebSearchParams,
    WebSearchProviderConfig,
    WebSearchResult,
    WebSearchResultCode,
} from './types';

/** A loaded, initialised driver plus the metadata it came from. */
interface ProviderEntry {
    Name: string;
    DriverClass: string;
    Priority: number;
    Provider: BaseWebSearchProvider;
}

/** Internal shape for a fail-closed exit. */
interface FailureShape {
    code: WebSearchResultCode;
    message: string;
}

/**
 * Singleton engine that routes a web search to a configured external provider.
 *
 * ## Selection
 *
 * **With an explicit `Provider`** the engine resolves it by `Name` or `DriverClass` and then
 * fails closed with a specific code — it never substitutes another vendor. The caller asked for
 * a particular thing; quietly serving something else turns a deliberate choice into an invisible
 * one.
 *
 * **Without one** it filters to Active, available and capability-satisfying drivers, orders by
 * `Priority` ascending, and tries each in turn. A `transient` failure (rate limit, 5xx, timeout)
 * moves to the next driver; a `permanent` failure stops the run, because a request every
 * provider will reject should not cost five paid API calls and bury its own error message.
 *
 * Zero hits is a **success**. A narrow query legitimately matches nothing, and treating that as
 * failure makes the engine retry a query that will keep returning nothing.
 *
 * @example
 * ```typescript
 * await WebSearchEngine.Instance.Config(false, contextUser);
 * const result = await WebSearchEngine.Instance.Search(
 *     { Query: 'association management trends', MaxResults: 10 },
 *     contextUser,
 * );
 * if (result.Success) {
 *     for (const hit of result.Hits) console.log(hit.Title, hit.URL);
 * }
 * ```
 */
export class WebSearchEngine extends BaseSingleton<WebSearchEngine> {
    /** Entity holding the provider records. */
    private static readonly PROVIDER_ENTITY = 'MJ: Web Search Providers';

    private _entries: ProviderEntry[] = [];
    private _loaded = false;
    /**
     * Why the last provider load failed, or null if it succeeded. Held as state rather than
     * only logged: the log line fires once, at load, while callers keep arriving afterwards —
     * so without this the engine answers every later search with "nothing is configured" for
     * what was a read failure.
     */
    private _loadError: string | null = null;
    private _loading: Promise<void> | null = null;
    private _provider: IMetadataProvider | undefined;

    // Constructor must be public to satisfy BaseSingleton.getInstance()
    public constructor() {
        super();
    }

    public static get Instance(): WebSearchEngine {
        return WebSearchEngine.getInstance<WebSearchEngine>();
    }

    /** Providers currently loaded and available, in priority order. */
    public get AvailableProviders(): readonly { Name: string; DriverClass: string; Priority: number }[] {
        return this._entries.map((e) => ({ Name: e.Name, DriverClass: e.DriverClass, Priority: e.Priority }));
    }

    /** Every registered driver with its capabilities, for admin UI. */
    public GetRegisteredDrivers(): RegisteredWebSearchProviderInfo[] {
        return BaseWebSearchProvider.GetAvailableProviders();
    }

    /**
     * Load provider metadata and initialise every driver. Cheap no-op once loaded.
     *
     * Concurrent callers share one in-flight load rather than each issuing their own RunView —
     * an agent fan-out can call `Config` from a dozen places in the same tick.
     *
     * @param forceRefresh - reload even if already configured (after an admin edits providers)
     */
    public async Config(
        forceRefresh: boolean,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<void> {
        if (provider) {
            this._provider = provider;
        }
        if (this._loaded && !forceRefresh) {
            return;
        }
        if (this._loading && !forceRefresh) {
            return this._loading;
        }
        this._loading = this.loadProviders(contextUser);
        try {
            await this._loading;
        } finally {
            this._loading = null;
        }
    }

    /**
     * Run a web search.
     *
     * Never throws for a search-level failure — inspect `Success` and `ResultCode`, as with
     * `RunView`. Exceptions escaping a driver are caught and recorded as attempts.
     */
    public async Search(params: WebSearchParams, contextUser: UserInfo): Promise<WebSearchResult> {
        const attempts: WebSearchAttempt[] = [];

        const query = params.Query?.trim();
        if (!query) {
            return this.fail({ code: 'MISSING_QUERY', message: 'Query is required.' }, attempts);
        }

        await this.Config(false, contextUser);

        // Checked BEFORE the empty-list branch: a failed read also leaves the list empty, and
        // reporting that as "add a record" sends an operator to fix configuration that is fine.
        if (this._loadError) {
            return this.fail(
                {
                    code: 'PROVIDER_LOAD_FAILED',
                    message:
                        `Could not read "${WebSearchEngine.PROVIDER_ENTITY}": ${this._loadError}. ` +
                        'This is a read failure, not a missing configuration — check that the entity ' +
                        'exists in metadata and that the caller can read it.',
                },
                attempts,
            );
        }

        if (this._entries.length === 0) {
            return this.fail(
                {
                    code: 'NO_PROVIDERS_CONFIGURED',
                    message:
                        'No web search providers are configured. Add an Active record to ' +
                        `"${WebSearchEngine.PROVIDER_ENTITY}" whose DriverClass matches a registered driver.`,
                },
                attempts,
            );
        }

        const candidates = params.Provider
            ? this.resolveExplicit(params)
            : this.resolveByPriority(params);

        if ('code' in candidates) {
            return this.fail(candidates, attempts);
        }

        return this.runCandidates(candidates, { ...params, Query: query }, contextUser, attempts);
    }

    /** Try each candidate in order, honouring the transient/permanent distinction. */
    private async runCandidates(
        candidates: ProviderEntry[],
        params: WebSearchParams,
        contextUser: UserInfo,
        attempts: WebSearchAttempt[],
    ): Promise<WebSearchResult> {
        for (const entry of candidates) {
            const startedAt = Date.now();
            try {
                const response = await entry.Provider.ExecuteSearch(params, contextUser);
                const durationMs = Date.now() - startedAt;

                if (response.Success) {
                    attempts.push({
                        ProviderName: entry.Name,
                        DriverClass: entry.DriverClass,
                        Succeeded: true,
                        DurationMs: durationMs,
                        HitCount: response.Hits.length,
                    });
                    return {
                        Success: true,
                        ResultCode: 'SUCCESS',
                        Hits: response.Hits,
                        Answer: response.Answer,
                        ProviderUsed: entry.Name,
                        Attempts: attempts,
                    };
                }

                const failureKind = response.FailureKind ?? 'transient';
                attempts.push({
                    ProviderName: entry.Name,
                    DriverClass: entry.DriverClass,
                    Succeeded: false,
                    DurationMs: durationMs,
                    FailureKind: failureKind,
                    ErrorMessage: response.ErrorMessage,
                });

                // A rejected request is rejected everywhere. Stop rather than paying four more
                // vendors to tell us the same thing and hiding the real message behind theirs.
                if (failureKind === 'permanent') {
                    return this.fail(
                        {
                            code: 'INVALID_REQUEST',
                            message:
                                `${entry.Name} rejected the request and retrying elsewhere cannot help: ` +
                                `${response.ErrorMessage ?? 'no detail supplied'}`,
                        },
                        attempts,
                    );
                }
            } catch (e) {
                // A driver that throws is a bug in that driver, not a reason to fail the search.
                const message = e instanceof Error ? e.message : String(e);
                LogError(`WebSearchEngine: driver "${entry.DriverClass}" threw`, undefined, e);
                attempts.push({
                    ProviderName: entry.Name,
                    DriverClass: entry.DriverClass,
                    Succeeded: false,
                    DurationMs: Date.now() - startedAt,
                    FailureKind: 'transient',
                    ErrorMessage: message,
                });
            }
        }

        return this.fail(
            {
                code: 'ALL_PROVIDERS_FAILED',
                message: `All ${attempts.length} provider(s) failed: ${this.summarise(attempts)}`,
            },
            attempts,
        );
    }

    /**
     * Resolve an explicitly requested provider, or describe precisely why it cannot serve.
     *
     * Each rejection is a distinct code so a caller can tell "you never configured this" from
     * "its key is missing" from "it cannot do answers" — three different fixes.
     */
    private resolveExplicit(params: WebSearchParams): ProviderEntry[] | FailureShape {
        const wanted = params.Provider!.trim().toLowerCase();
        const entry = this._entries.find(
            (e) => e.Name.toLowerCase() === wanted || e.DriverClass.toLowerCase() === wanted,
        );

        if (!entry) {
            // _entries holds only Active + available providers, so distinguish the reasons by
            // re-reading what was loaded rather than reporting a blanket "not found".
            const known = this._unavailable.get(wanted);
            if (known) {
                return { code: known.code, message: known.message };
            }
            return {
                code: 'PROVIDER_NOT_FOUND',
                message:
                    `No web search provider named "${params.Provider}". Configured and available: ` +
                    `${this._entries.map((e) => e.Name).join(', ') || '(none)'}.`,
            };
        }

        if (params.IncludeAnswer && !entry.Provider.Capabilities.Answer) {
            return {
                code: 'PROVIDER_LACKS_CAPABILITY',
                message: `Provider "${entry.Name}" cannot produce a synthesized answer (IncludeAnswer was requested).`,
            };
        }

        return [entry];
    }

    /** Providers that loaded but cannot serve, keyed by lowercased name and driver class. */
    private _unavailable = new Map<string, FailureShape>();

    /** Eligible providers in priority order, or a failure describing why none qualified. */
    private resolveByPriority(params: WebSearchParams): ProviderEntry[] | FailureShape {
        const eligible = this._entries.filter(
            (e) => !params.IncludeAnswer || e.Provider.Capabilities.Answer,
        );
        if (eligible.length === 0) {
            return {
                code: 'NO_ELIGIBLE_PROVIDER',
                message: params.IncludeAnswer
                    ? 'No available provider can produce a synthesized answer. Configure Tavily or Perplexity, or drop IncludeAnswer.'
                    : 'No available web search provider.',
            };
        }
        return eligible;
    }

    private fail(failure: FailureShape, attempts: WebSearchAttempt[]): WebSearchResult {
        return {
            Success: false,
            ResultCode: failure.code,
            Hits: [],
            Attempts: attempts,
            ErrorMessage: failure.message,
        };
    }

    private summarise(attempts: WebSearchAttempt[]): string {
        return attempts
            .filter((a) => !a.Succeeded)
            .map((a) => `${a.ProviderName}: ${a.ErrorMessage ?? 'unknown error'}`)
            .join(' | ');
    }

    /** Load provider records, instantiate drivers, and keep the ones that are operational. */
    private async loadProviders(contextUser: UserInfo): Promise<void> {
        this._entries = [];
        this._unavailable = new Map();
        this._loadError = null;

        const rv = this._provider
            ? RunView.FromMetadataProvider(this._provider)
            : new RunView();

        // `entity_object` with the generated subclass, matching how SearchEngine types its own
        // provider records. `Fields` is deliberately absent — it is ignored for entity_object, and
        // a hand-listed projection is how a column added to the table later goes silently unread.
        const result = await rv.RunView<MJWebSearchProviderEntity>(
            {
                EntityName: WebSearchEngine.PROVIDER_ENTITY,
                ExtraFilter: `Status = 'Active'`,
                OrderBy: 'Priority ASC, Name ASC',
                ResultType: 'entity_object',
            },
            contextUser,
        );

        // RunView does not throw — branch on Success or the engine silently reports
        // "no providers configured" for what is actually a database error.
        if (!result.Success) {
            this._loadError = result.ErrorMessage || 'the provider view query failed without a message';
            LogError(`WebSearchEngine: failed to load providers — ${this._loadError}`);
            this._loaded = true;
            return;
        }
        this._loadError = null;

        for (const record of result.Results ?? []) {
            await this.initializeProvider(record, contextUser);
        }

        this._loaded = true;
        LogStatus(
            `WebSearchEngine: ${this._entries.length} provider(s) available ` +
                `(${this._entries.map((e) => e.Name).join(', ') || 'none'})`,
        );
    }

    /** Instantiate, configure and availability-check one provider record. */
    private async initializeProvider(
        record: MJWebSearchProviderEntity,
        contextUser: UserInfo,
    ): Promise<void> {
        const driverClass = record.DriverClass;
        try {
            const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseWebSearchProvider>(
                BaseWebSearchProvider,
                driverClass,
            );
            if (!driver) {
                const message = `No registered driver for DriverClass "${driverClass}" (provider "${record.Name}").`;
                LogError(`WebSearchEngine: ${message}`);
                this.recordUnavailable(record, { code: 'PROVIDER_UNAVAILABLE', message });
                return;
            }

            const config: WebSearchProviderConfig = {
                Name: record.Name,
                ProviderConfig: this.parseProviderConfig(record),
                CredentialValues: await this.resolveCredentialValues(record, contextUser),
                MaxResultsOverride: record.MaxResultsOverride ?? null,
                Priority: record.Priority,
            };

            await driver.Initialize(config, contextUser);
            await driver.CheckAvailability(contextUser);

            if (driver.IsAvailable()) {
                this._entries.push({
                    Name: record.Name,
                    DriverClass: driverClass,
                    Priority: record.Priority,
                    Provider: driver,
                });
            } else {
                this.recordUnavailable(record, {
                    code: 'PROVIDER_UNAVAILABLE',
                    message:
                        `Provider "${record.Name}" is Active but not operational: ` +
                        `${driver.UnavailableReason ?? 'no reason reported'}.`,
                });
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`WebSearchEngine: failed to initialize "${record.Name}"`, undefined, e);
            this.recordUnavailable(record, {
                code: 'PROVIDER_UNAVAILABLE',
                message: `Provider "${record.Name}" failed to initialize: ${message}`,
            });
        }
    }

    /** Remember why a configured provider is not serving, so an explicit request can say so. */
    private recordUnavailable(record: MJWebSearchProviderEntity, failure: FailureShape): void {
        this._unavailable.set(record.Name.toLowerCase(), failure);
        this._unavailable.set(record.DriverClass.toLowerCase(), failure);
    }

    private parseProviderConfig(record: MJWebSearchProviderEntity): Record<string, unknown> | null {
        if (!record.ProviderConfig) {
            return null;
        }
        try {
            return JSON.parse(record.ProviderConfig) as Record<string, unknown>;
        } catch {
            // Bad JSON disables tuning, not the provider — the driver's env fallback still works.
            LogError(`WebSearchEngine: invalid JSON in ProviderConfig for "${record.Name}"; ignoring it.`);
            return null;
        }
    }

    /** Decrypt the linked credential, when one is set. Null when absent or unreadable. */
    private async resolveCredentialValues(
        record: MJWebSearchProviderEntity,
        contextUser: UserInfo,
    ): Promise<Record<string, unknown> | null> {
        if (!record.CredentialID) {
            return null;
        }
        try {
            await CredentialEngine.Instance.Config(false, contextUser);
            const credential = CredentialEngine.Instance.getCredentialById(record.CredentialID);
            if (!credential) {
                LogError(
                    `WebSearchEngine: CredentialID ${record.CredentialID} on "${record.Name}" does not resolve.`,
                );
                return null;
            }
            const resolved = await CredentialEngine.Instance.getCredential(credential.Name, {
                credentialId: record.CredentialID,
                contextUser,
                subsystem: 'WebSearch',
            });
            return resolved.values ?? null;
        } catch (e) {
            // Returning null lets the driver fall back to its environment variable and
            // self-disable cleanly if that is missing too.
            LogError(`WebSearchEngine: could not decrypt credential for "${record.Name}"`, undefined, e);
            return null;
        }
    }
}
