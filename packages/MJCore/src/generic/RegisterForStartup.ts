import { BaseSingleton } from "@memberjunction/global";
import { UserInfo } from "./securityInfo";
import { IMetadataProvider } from "./interfaces";
import { Metadata } from "./metadata";
import { LocalCacheManager } from "./localCacheManager";
import { LogStatusEx } from "./logging";

/**
 * Options for the @RegisterForStartup decorator
 */
export interface RegisterForStartupOptions {
    /**
     * Loading priority. Lower numbers load first.
     * Classes with same priority load in parallel.
     * Default: 100
     */
    priority?: number;

    /**
     * What happens if HandleStartup() fails.
     * - 'fatal': Stop startup, throw error, process should terminate
     * - 'error': Log error, continue loading other classes (default)
     * - 'warn': Log warning, continue (for optional functionality)
     * - 'silent': Swallow error completely
     */
    severity?: 'fatal' | 'error' | 'warn' | 'silent';

    /**
     * Human-readable description for logging/debugging
     */
    description?: string;

    /**
     * When true, the engine's HandleStartup() is fired during startup but NOT awaited.
     * The shell/app boot sequence proceeds without waiting for the engine to finish loading.
     *
     * Use for engines that aren't required for first paint (e.g., admin-only or
     * feature-specific engines like AIEngineBase, IntegrationEngineBase).
     *
     * **Consumer contract:** code that reads engine state MUST call
     * `await Engine.Instance.EnsureLoaded()` (or `Config(false)`) first. BaseEngine
     * load is idempotent — a concurrent caller waits for the in-flight load promise
     * rather than re-loading, so the cost is just one microtask when the load is
     * already done or already running.
     *
     * Failures during deferred startup are logged according to `severity` but never
     * propagate up — they cannot abort the app boot since boot has already completed.
     * Default: false.
     */
    deferred?: boolean;

    /**
     * Optional delay in milliseconds before executing the deferred HandleStartup() method.
     * Only applies when deferred is true.
     * If specified, the startup manager will wait this amount of time using a timer (setTimeout)
     * before initiating the loading sequence for the deferred startup class.
     */
    deferredDelay?: number;
}

/**
 * Interface for any singleton class that needs initialization at application startup.
 * Implementing classes must follow the singleton pattern with a static Instance property.
 * Named "Sink" to indicate it receives/handles startup events.
 */
export interface IStartupSink {
    /**
     * Called during application bootstrap to initialize the singleton.
     * @param contextUser - The authenticated user context (required for server-side, optional for client-side)
     * @param provider - Optional metadata provider to use for initialization
     */
    HandleStartup(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void>;
}

/**
 * @deprecated Use IStartupSink instead
 */
export type IStartupClass = IStartupSink;

/**
 * Registration information for a startup class
 */
export interface StartupRegistration {
    /**
     * The constructor function of the registered class
     */
    constructor: new (...args: unknown[]) => IStartupSink;

    /**
     * Function to get the singleton instance of the class
     */
    getInstance: () => IStartupSink;

    /**
     * Options provided to the decorator
     */
    options: RegisterForStartupOptions;

    /**
     * When the class was successfully loaded (undefined if not yet loaded)
     */
    loadedAt?: Date;

    /**
     * How long the HandleStartup() call took in milliseconds
     */
    loadDurationMs?: number;
}

/**
 * Result of loading a single startup class
 */
export interface LoadResult {
    /**
     * Name of the class that was loaded
     */
    className: string;

    /**
     * Whether the load was successful
     */
    success: boolean;

    /**
     * Error that occurred during loading (if any)
     */
    error?: Error;

    /**
     * Severity level from the registration options
     */
    severity?: RegisterForStartupOptions['severity'];

    /**
     * How long the load took in milliseconds
     */
    durationMs: number;
}

/**
 * Result of the LoadAllStartupClasses operation
 */
export interface LoadAllResult {
    /**
     * Whether all required classes loaded successfully (no fatal errors)
     */
    success: boolean;

    /**
     * Results for each individual class load
     */
    results: LoadResult[];

    /**
     * Total time for all loading operations
     */
    totalDurationMs: number;

    /**
     * The fatal error that stopped loading (if any)
     */
    fatalError?: Error;
}

// Type for the class constructor that can be decorated.
// The decorator never calls `new` — it only accesses the static `Instance` property.
// Using Function + Instance instead of `new()` to accept both public and protected
// constructors (e.g. BaseSingleton-derived classes with protected constructors).
type StartupClassConstructor = Function & {
    Instance: IStartupSink;
    name: string;
};

/**
 * Internal function that performs the actual registration
 */
function registerStartupClass<T extends StartupClassConstructor>(
    constructor: T,
    options: RegisterForStartupOptions
): T {
    // Register with StartupManager
    StartupManager.Instance.Register({
        constructor: constructor as unknown as new (...args: unknown[]) => IStartupSink,
        getInstance: () => {
            // Access the Instance property at runtime when actually needed
            const ctor = constructor as unknown as { Instance: IStartupSink };
            if (!('Instance' in ctor)) {
                throw new Error(
                    `@RegisterForStartup requires singleton pattern. ${constructor.name} must have a static 'Instance' property.`
                );
            }
            return ctor.Instance;
        },
        options: options
    });

    return constructor;
}

/**
 * Decorator to mark a singleton class for automatic loading at application startup.
 * Similar naming convention to @RegisterClass for consistency.
 *
 * The decorated class must:
 * 1. Implement IStartupSink interface
 * 2. Have a static 'Instance' property (singleton pattern)
 *
 * This decorator also prevents tree-shaking by creating a runtime reference
 * to the class during module initialization.
 *
 * Can be used with or without parentheses:
 * - `@RegisterForStartup` - uses default options
 * - `@RegisterForStartup()` - uses default options
 * - `@RegisterForStartup({ priority: 10 })` - uses custom options
 *
 * @example
 * ```typescript
 * // With options
 * @RegisterForStartup({ priority: 10, severity: 'fatal', description: 'Encryption services' })
 * class EncryptionEngine extends BaseEngine<EncryptionEngine> implements IStartupSink {
 *   public async HandleStartup(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
 *     await this.Config(false, contextUser, provider);
 *   }
 * }
 *
 * // Without options (uses defaults)
 * @RegisterForStartup
 * class SimpleEngine extends BaseEngine<SimpleEngine> implements IStartupSink {
 *   public async HandleStartup(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
 *     await this.Config(false, contextUser, provider);
 *   }
 * }
 * ```
 */
export function RegisterForStartup<T extends StartupClassConstructor>(constructor: T): T;
export function RegisterForStartup(options?: RegisterForStartupOptions): <T extends StartupClassConstructor>(constructor: T) => T;
export function RegisterForStartup<T extends StartupClassConstructor>(
    constructorOrOptions?: T | RegisterForStartupOptions
): T | ((constructor: T) => T) {
    // Check if called directly on a class (without parentheses)
    // In that case, the first argument is the constructor function
    if (typeof constructorOrOptions === 'function') {
        // Direct decorator usage: @RegisterForStartup
        return registerStartupClass(constructorOrOptions, {});
    }

    // Called with options (or empty parentheses): @RegisterForStartup() or @RegisterForStartup({ ... })
    // The typeof check above guarantees this is not a constructor at this point
    const options = (constructorOrOptions || {}) as RegisterForStartupOptions;
    return function(constructor: T): T {
        return registerStartupClass(constructor, options);
    };
}

// ============================================================================
// STARTUP MANAGER - Handles all startup loading infrastructure
// ============================================================================

/**
 * Manages registration and loading of startup classes.
 * This is a singleton that handles the @RegisterForStartup decorator pattern.
 *
 * Uses BaseSingleton to guarantee a single instance across the entire process,
 * even if bundlers duplicate this module across multiple execution paths.
 */
export class StartupManager extends BaseSingleton<StartupManager> {
    private _registrations: StartupRegistration[] = [];
    private _loadCompleted: boolean = false;
    private _loadPromise: Promise<LoadAllResult> | null = null;
    private _lastResult: LoadAllResult | null = null;

    /**
     * Use StartupManager.Instance to get the singleton instance.
     */
    public constructor() {
        super();
    }

    /**
     * Returns the singleton instance of StartupManager
     */
    public static get Instance(): StartupManager {
        return StartupManager.getInstance<StartupManager>();
    }

    /**
     * Register a class for startup loading. Called by @RegisterForStartup decorator.
     */
    public Register(registration: Omit<StartupRegistration, 'loadedAt' | 'loadDurationMs'>): void {
        this._registrations.push(registration as StartupRegistration);
    }

    /**
     * Get all registered startup classes, sorted by priority (lower numbers first).
     */
    public GetRegistrations(): StartupRegistration[] {
        return [...this._registrations].sort((a, b) => {
            const priorityA = this.ResolvePriority(a.options);
            const priorityB = this.ResolvePriority(b.options);
            return priorityA - priorityB;
        });
    }

    /**
     * Check if startup loading has been completed
     */
    public get LoadCompleted(): boolean {
        return this._loadCompleted;
    }

    /**
     * Handles all startup activities including initializing the local cache manager and then
     * loading all registered startup classes in priority order.
     * 
     * Classes with the same priority are loaded in parallel.
     *
     * This method is idempotent - multiple callers will receive the same promise
     * and startup classes are only loaded once unless forceRefresh is true.
     * This prevents race conditions when multiple components await startup completion.
     *
     * @param forceRefresh - If true, reload all startup classes even if already loaded
     * @param contextUser - The authenticated user context
     * @param provider - Optional metadata provider
     * @returns Results of all load operations
     */
    public async Startup(
        forceRefresh: boolean = false,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<LoadAllResult> {
        // If already completed and not forcing refresh, return cached result
        if (this._loadCompleted && !forceRefresh && this._lastResult) {
            return this._lastResult;
        }

        // If currently loading (and not forcing refresh), return the existing promise
        // This allows multiple callers to await the same loading operation
        if (this._loadPromise && !forceRefresh) {
            return this._loadPromise;
        }

        // If forcing refresh, reset state
        if (forceRefresh) {
            this._loadCompleted = false;
            this._loadPromise = null;
            this._lastResult = null;
        }

        // Start loading and store the promise so other callers can await it
        this._loadPromise = this.ExecuteLoad(contextUser, provider);

        try {
            this._lastResult = await this._loadPromise;
            return this._lastResult;
        } finally {
            // Clear the promise reference after completion (result is cached in _lastResult)
            this._loadPromise = null;
        }
    }

    /**
     * Internal method that performs the actual startup loading work.
     */
    private async ExecuteLoad(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<LoadAllResult> {
        // first, init the LocalCacheManager and await its completion
        // Get the storage provider from the metadata provider (uses IndexedDB)
        const cacheStart = Date.now();
        const storageProvider = (provider ?? Metadata.Provider).LocalStorageProvider;
        await LocalCacheManager.Instance.Initialize(storageProvider);
        LogStatusEx({ message: `LocalCacheManager initialized in ${Date.now() - cacheStart}ms`, verboseOnly: true });



        const startTime = Date.now();
        const allRegistrations = this.GetRegistrations();

        // Split into synchronous (awaited, gates startup completion) and deferred
        // (fired but not awaited; consumers must call Engine.Instance.EnsureLoaded()
        // before reading state). Deferred engines start AFTER sync engines complete
        // so they don't compete with the shell-render-critical batch for the same
        // GraphQL coalesce window.
        const syncRegistrations = allRegistrations.filter(r => !r.options.deferred);
        const deferredRegistrations = allRegistrations.filter(r => r.options.deferred);

        const groups = this.GroupByPriority(syncRegistrations);
        const results: LoadResult[] = [];

        for (const group of groups) {
            const groupResults = await Promise.all(
                group.map(async (reg): Promise<LoadResult> => {
                    const loadStart = Date.now();
                    try {
                        const instance = reg.getInstance();
                        await instance.HandleStartup(contextUser, provider);

                        reg.loadedAt = new Date();
                        reg.loadDurationMs = Date.now() - loadStart;

                        return {
                            className: reg.constructor.name,
                            success: true,
                            durationMs: reg.loadDurationMs
                        };
                    } catch (error) {
                        const durationMs = Date.now() - loadStart;
                        return {
                            className: reg.constructor.name,
                            success: false,
                            error: error as Error,
                            severity: reg.options.severity || 'error',
                            durationMs
                        };
                    }
                })
            );

            results.push(...groupResults);

            // Check for fatal errors - stop immediately
            const fatal = groupResults.find(r => !r.success && r.severity === 'fatal');
            if (fatal) {
                return {
                    success: false,
                    results,
                    totalDurationMs: Date.now() - startTime,
                    fatalError: fatal.error
                };
            }

            // Log non-fatal errors
            for (const result of groupResults) {
                if (!result.success) {
                    if (result.severity === 'error') {
                        console.error(`[StartupManager] Error loading ${result.className}:`, result.error);
                    } else if (result.severity === 'warn') {
                        console.warn(`[StartupManager] Warning loading ${result.className}:`, result.error);
                    }
                    // 'silent' - do nothing
                }
            }
        }

        this._loadCompleted = true;

        // Log per-engine timing summary so slow engines are visible
        const totalMs = Date.now() - startTime;
        const sorted = [...results].sort((a, b) => b.durationMs - a.durationMs);
        const lines = sorted.map(r =>
            `  ${r.success ? '✅' : '❌'} ${r.className}: ${r.durationMs}ms`
        );
        LogStatusEx({ message: `[StartupManager] All engines loaded in ${totalMs}ms:\n${lines.join('\n')}`, verboseOnly: true });

        // Fire deferred engines AFTER sync completes — fire-and-forget, no await.
        // The Promise here is never awaited; consumers reach a deferred engine via
        // its own .EnsureLoaded() call which dedupes against the in-flight load
        // (BaseEngine._loadingSubject handles concurrent callers).
        if (deferredRegistrations.length > 0) {
            this.KickOffDeferredEngines(deferredRegistrations, contextUser, provider);
        }

        return {
            success: results.every(r => r.success || r.severity !== 'fatal'),
            results,
            totalDurationMs: totalMs
        };
    }

    /**
     * Fires HandleStartup() for each deferred registration in parallel without
     * awaiting. Logs per-engine completion / failure so the dev console shows
     * when background loads finish. Errors are logged at the registration's
     * configured severity but never propagate — the app boot has already
     * returned by the time this runs.
     */
    private KickOffDeferredEngines(
        registrations: StartupRegistration[],
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): void {
        const names = registrations.map(r => r.constructor.name).join(', ');
        LogStatusEx({ message: `[StartupManager] Kicking off ${registrations.length} deferred engine(s) in background: [${names}]`, verboseOnly: true });

        for (const reg of registrations) {
            const delay = reg.options.deferredDelay || 0;
            const run = () => {
                const loadStart = Date.now();
                reg.getInstance().HandleStartup(contextUser, provider).then(() => {
                    reg.loadedAt = new Date();
                    reg.loadDurationMs = Date.now() - loadStart;
                    LogStatusEx({ message: `[StartupManager] ⏱️  Deferred engine loaded: ${reg.constructor.name} (${reg.loadDurationMs}ms)`, verboseOnly: true });
                }).catch((error: unknown) => {
                    const durationMs = Date.now() - loadStart;
                    const severity = reg.options.severity || 'error';
                    if (severity === 'error') {
                        console.error(`[StartupManager] Deferred engine failed: ${reg.constructor.name} (${durationMs}ms)`, error);
                    } else if (severity === 'warn') {
                        console.warn(`[StartupManager] Deferred engine warning: ${reg.constructor.name} (${durationMs}ms)`, error);
                    }
                    // 'silent' / 'fatal' — fatal is meaningless for deferred since boot already returned
                });
            };

            if (delay > 0) {
                LogStatusEx({ message: `[StartupManager] Delaying startup of deferred engine ${reg.constructor.name} by ${delay}ms`, verboseOnly: true });
                setTimeout(run, delay);
            } else {
                run();
            }
        }
    }

    /**
     * Resolve the priority from options, defaulting to 100 if not specified.
     */
    private ResolvePriority(options: RegisterForStartupOptions): number {
        return options.priority ?? 100;
    }

    /**
     * Group registrations by their priority for parallel loading within priority levels.
     */
    private GroupByPriority(registrations: StartupRegistration[]): StartupRegistration[][] {
        const groups = new Map<number, StartupRegistration[]>();

        for (const reg of registrations) {
            const priority = this.ResolvePriority(reg.options);
            if (!groups.has(priority)) {
                groups.set(priority, []);
            }
            groups.get(priority)!.push(reg);
        }

        return Array.from(groups.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([_, group]) => group);
    }

    /**
     * Reset startup registrations. Use with caution, primarily for testing.
     */
    public Reset(): void {
        this._registrations = [];
        this._loadCompleted = false;
        this._loadPromise = null;
        this._lastResult = null;
    }
}

// ============================================================================
// BACKWARD COMPATIBILITY ALIASES
// ============================================================================

/**
 * @deprecated Use RegisterForStartupOptions instead
 */
export type LoadOnStartupOptions = RegisterForStartupOptions;

/**
 * @deprecated Use IStartupSink instead
 */
export type ILoadOnStartup = IStartupSink;

/**
 * @deprecated Use RegisterForStartup instead
 */
export const LoadOnStartup = RegisterForStartup;
