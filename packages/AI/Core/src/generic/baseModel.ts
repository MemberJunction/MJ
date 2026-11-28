import {
    AITransportManager,
    type FetchFunction,
    type LongRunningFetchDispatcherOptions,
} from './aiTransportManager';

export {
    BaseParams,
    BaseResult,
    MODEL_USAGE_UNIT_KINDS,
    ModelUsage,
    type ModelUsageUnitKind,
} from './baseModel.types';

/**
 * Base AI model class, used for everything else in the MemberJunction AI environment.
 *
 * Provides shared API key storage, provider-specific {@link AdditionalSettings} with change hooks,
 * AI-scoped HTTP transport access ({@link CustomFetch}, {@link BoundFetch},
 * {@link BuildTransportClientOptions}), and lazy/invalidatable SDK client caching
 * ({@link GetOrCreateClient}, {@link InvalidateClient}) across all 11 AI modalities.
 */
export abstract class BaseModel {
    private _apiKey: string;
    private _cachedClient: unknown = undefined;
    private _hasCachedClient: boolean = false;
    private _boundFetch: FetchFunction | undefined = undefined;

    /**
     * Protected property to store additional provider-specific settings.
     * Shared across all AI modalities (`BaseLLM`, `BaseEmbeddings`, `BaseVideoGenerator`,
     * `BaseSpeechToText`, `BaseTextToSpeech`, `BaseImageGenerator`, etc.).
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Preserves BaseLLM/BaseEmbeddings subclass override compatibility
    protected _additionalSettings: Record<string, any> = {};

    /**
     * Only sub-classes can access the API key
     */
    protected get apiKey(): string {
        return this._apiKey;
    }

    constructor (apiKey: string) {
        if (!apiKey || apiKey.trim().length === 0)
            console.warn('BaseModel: API key is empty, this might cause issues with model execution');

        this._apiKey = apiKey;
    }

    /**
     * Get the current additional settings
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Preserves BaseLLM/BaseEmbeddings public signature
    public get AdditionalSettings(): Record<string, any> {
        return this._additionalSettings;
    }

    /**
     * Set additional provider-specific settings and notify {@link OnAdditionalSettingsChanged}
     * (which invalidates any SDK client cached via {@link GetOrCreateClient}).
     * Subclasses may override this method to validate required settings and should call `super.SetAdditionalSettings(settings)`.
     *
     * @param settings Provider-specific settings
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Preserves BaseLLM/BaseEmbeddings subclass override compatibility
    public SetAdditionalSettings(settings: Record<string, any>): void {
        this._additionalSettings = { ...this._additionalSettings, ...settings };
        this.OnAdditionalSettingsChanged();
    }

    /**
     * Clear all additional settings and notify {@link OnAdditionalSettingsChanged}.
     * Useful for resetting provider state or switching between configurations.
     */
    public ClearAdditionalSettings(): void {
        this._additionalSettings = {};
        this.OnAdditionalSettingsChanged();
    }

    /**
     * Lifecycle hook invoked after {@link SetAdditionalSettings} or {@link ClearAdditionalSettings}.
     * Default implementation invalidates any cached SDK client built through {@link GetOrCreateClient}.
     */
    protected OnAdditionalSettingsChanged(): void {
        this.InvalidateClient();
    }

    /**
     * Reads optional per-model HTTP transport overrides from {@link _additionalSettings}.
     * Supports either a nested `transport` object ({@link LongRunningFetchDispatcherOptions})
     * or flat timeout keys (`headersTimeoutMs`, `bodyTimeoutMs`, `connectTimeoutMs`,
     * `keepAliveTimeoutMs`, `keepAliveMaxTimeoutMs`, `transportDisabled`).
     */
    protected ResolveTransportOverrides(): LongRunningFetchDispatcherOptions | undefined {
        const settings = this._additionalSettings;
        if (!settings || typeof settings !== 'object') {
            return undefined;
        }

        const nested = settings['transport'];
        if (nested && typeof nested === 'object') {
            return nested as LongRunningFetchDispatcherOptions;
        }

        const overrides: LongRunningFetchDispatcherOptions = {};
        let hasAny = false;

        if (typeof settings['headersTimeoutMs'] === 'number') {
            overrides.headersTimeoutMs = settings['headersTimeoutMs'];
            hasAny = true;
        }
        if (typeof settings['bodyTimeoutMs'] === 'number') {
            overrides.bodyTimeoutMs = settings['bodyTimeoutMs'];
            hasAny = true;
        }
        if (typeof settings['connectTimeoutMs'] === 'number') {
            overrides.connectTimeoutMs = settings['connectTimeoutMs'];
            hasAny = true;
        }
        if (typeof settings['keepAliveTimeoutMs'] === 'number') {
            overrides.keepAliveTimeoutMs = settings['keepAliveTimeoutMs'];
            hasAny = true;
        }
        if (typeof settings['keepAliveMaxTimeoutMs'] === 'number') {
            overrides.keepAliveMaxTimeoutMs = settings['keepAliveMaxTimeoutMs'];
            hasAny = true;
        }
        if (typeof settings['transportDisabled'] === 'boolean') {
            overrides.disabled = settings['transportDisabled'];
            hasAny = true;
        }

        return hasAny ? overrides : undefined;
    }

    /**
     * Returns the AI-scoped long-running `fetch` wrapper from {@link AITransportManager.Instance}
     * (applying any per-model overrides from {@link ResolveTransportOverrides}), or `undefined` when
     * no custom transport is active or configured.
     */
    protected get CustomFetch(): FetchFunction | undefined {
        return AITransportManager.Instance.ResolveFetch(this.ResolveTransportOverrides());
    }

    /**
     * Memoized per-instance late-bound `fetch` wrapper that resolves {@link CustomFetch} at request
     * execution time (falling back to `globalThis.fetch` when unconfigured).
     *
     * SDK clients initialized in `constructor()` with `fetch: this.BoundFetch` automatically pick up
     * `AITransportManager.Instance.Configure(...)` or `SetAdditionalSettings(...)` changes made
     * after model instantiation.
     */
    protected get BoundFetch(): FetchFunction {
        if (!this._boundFetch) {
            this._boundFetch = AITransportManager.Instance.CreateBoundFetch(() => this.ResolveTransportOverrides());
        }
        return this._boundFetch;
    }

    /**
     * Returns `{ fetch: this.CustomFetch }` when a custom AI transport is configured, or `{}`
     * when unconfigured, so SDK constructor options never receive `{ fetch: undefined }`.
     */
    protected BuildTransportClientOptions(): { fetch?: FetchFunction } {
        const customFetch = this.CustomFetch;
        return customFetch ? { fetch: customFetch } : {};
    }

    /**
     * Lazily creates and caches a provider SDK client instance. Calling {@link InvalidateClient}
     * (automatically invoked by {@link OnAdditionalSettingsChanged}) clears the cached instance so
     * the next call rebuilds it with updated settings.
     */
    protected GetOrCreateClient<TClient>(factory: () => TClient): TClient {
        if (!this._hasCachedClient) {
            this._cachedClient = factory();
            this._hasCachedClient = true;
        }
        return this._cachedClient as TClient;
    }

    /**
     * Discards the cached SDK client created by {@link GetOrCreateClient}, forcing lazy
     * reconstruction on the next access.
     */
    protected InvalidateClient(): void {
        this._cachedClient = undefined;
        this._hasCachedClient = false;
    }
}
