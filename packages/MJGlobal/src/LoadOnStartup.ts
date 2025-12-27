import { MJGlobal } from './Global';

/**
 * Options for the @LoadOnStartup decorator
 */
export interface LoadOnStartupOptions {
    /**
     * Loading priority. Lower numbers load first.
     * Classes with same priority load in parallel.
     * Default: 100
     */
    priority?: number;

    /**
     * What happens if Load() fails.
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
}

/**
 * Interface for any singleton class that needs initialization at application startup.
 * Implementing classes must follow the singleton pattern with a static Instance property.
 */
export interface ILoadOnStartup {
    /**
     * Called during application bootstrap to initialize the singleton.
     * @param contextUser - The authenticated user context (required for server-side, optional for client-side)
     */
    Load(contextUser?: unknown): Promise<void>;
}

/**
 * Registration information for a startup class
 */
export interface StartupRegistration {
    /**
     * The constructor function of the registered class
     */
    constructor: new (...args: unknown[]) => ILoadOnStartup;

    /**
     * Function to get the singleton instance of the class
     */
    getInstance: () => ILoadOnStartup;

    /**
     * Options provided to the decorator
     */
    options: LoadOnStartupOptions;

    /**
     * When the class was successfully loaded (undefined if not yet loaded)
     */
    loadedAt?: Date;

    /**
     * How long the Load() call took in milliseconds
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
    severity?: LoadOnStartupOptions['severity'];

    /**
     * How long the load took in milliseconds
     */
    durationMs: number;
}

/**
 * Result of the LoadAll operation
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

/**
 * Decorator to mark a singleton class for automatic loading at application startup.
 *
 * The decorated class must:
 * 1. Implement ILoadOnStartup interface
 * 2. Have a static 'Instance' property (singleton pattern)
 *
 * This decorator also prevents tree-shaking by creating a runtime reference
 * to the class during module initialization.
 *
 * @example
 * ```typescript
 * @LoadOnStartup({ priority: 10, severity: 'fatal', description: 'Encryption services' })
 * class EncryptionEngine extends BaseEngine<EncryptionEngine> implements ILoadOnStartup {
 *   public async Load(contextUser?: UserInfo): Promise<void> {
 *     await this.Config(false, contextUser);
 *   }
 * }
 * ```
 */
export function LoadOnStartup(options?: LoadOnStartupOptions) {
    return function<T extends {
        new(...args: unknown[]): ILoadOnStartup;
        Instance: ILoadOnStartup;
    }>(constructor: T): T {
        // Validate singleton pattern - check if Instance property exists
        // Note: At decoration time, the Instance getter may not be accessible yet
        // because the class is still being defined. We check for the property descriptor instead.
        const descriptor = Object.getOwnPropertyDescriptor(constructor, 'Instance');
        const hasInstanceOnPrototype = Object.getOwnPropertyDescriptor(constructor.prototype, 'Instance');

        // For classes that use BaseSingleton pattern, Instance is typically a static getter
        // We need to be lenient here because the property might be defined via inheritance
        // The actual validation happens at LoadAll time when we try to get the instance

        // Register with MJGlobal - this creates the side effect that prevents tree-shaking
        MJGlobal.Instance.RegisterForStartup({
            constructor: constructor as unknown as new (...args: unknown[]) => ILoadOnStartup,
            getInstance: () => {
                // Access the Instance property at runtime when actually needed
                const ctor = constructor as unknown as { Instance: ILoadOnStartup };
                if (!('Instance' in ctor)) {
                    throw new Error(
                        `@LoadOnStartup requires singleton pattern. ${constructor.name} must have a static 'Instance' property.`
                    );
                }
                return ctor.Instance;
            },
            options: options || {}
        });

        return constructor;
    };
}
