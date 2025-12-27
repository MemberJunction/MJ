import * as MJ from './interface'
import { Subject, ReplaySubject, Observable } from 'rxjs';
import { ClassFactory } from './ClassFactory'
import { ObjectCache } from './ObjectCache';
import { BaseSingleton } from './BaseSingleton';
import { StartupRegistration, LoadResult, LoadAllResult, LoadOnStartupOptions, ILoadOnStartup } from './LoadOnStartup';

/**
 * Global class used for coordinating events, creating class instances, and managing components across MemberJunction
 */
export class MJGlobal extends BaseSingleton<MJGlobal> {
    // subjects for observables to handle eventing
    private _eventsSubject: Subject<MJ.MJEvent> = new Subject();
    // ReplaySubject configured to prevent memory leaks while supporting late subscribers:
    // - bufferSize: 100 events (sufficient for initialization scenarios like login events)
    // - windowTime: 30000ms (30 seconds - adequate for slow-loading components)
    // Note: Backend services primarily use non-replay mode, but events are still stored in
    // this buffer via RaiseEvent(). Time-based expiration prevents unbounded memory growth.
    private _eventsReplaySubject: ReplaySubject<MJ.MJEvent> = new ReplaySubject(100, 30000);

    // Convert the Subjects to Observables for public use.
    private _events$: Observable<MJ.MJEvent> = this._eventsSubject.asObservable();
    private _eventsReplay$: Observable<MJ.MJEvent> = this._eventsReplaySubject.asObservable();

    private _components: MJ.IMJComponent[] = [];

    private _classFactory: ClassFactory = new ClassFactory();

    private _properties: MJ.MJGlobalProperty[] = [];

    /**
     * Returns the global instance of the MJGlobal class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of MJGlobal, always use this method to get the instance.
     */
    public static get Instance(): MJGlobal {
        return super.getInstance<MJGlobal>();
    }

    public RegisterComponent(component: MJ.IMJComponent) {
        this._components.push(component);
    }

    /**
     * Resets the class to its initial state. Use very carefully and sparingly.
     */
    public Reset() {
        this._components = [];

        this._eventsSubject  = new Subject();
        this._eventsReplaySubject = new ReplaySubject(100, 30000);

        // Convert the Subjects to Observables for public use.
        this._events$ = this._eventsSubject.asObservable();
        this._eventsReplay$ = this._eventsReplaySubject.asObservable();
    }

    /**
     * Use this method to raise an event to all component who are listening for the event.
     * @param event 
     */
    public RaiseEvent(event: MJ.MJEvent) {
        this._eventsSubject.next(event);
        this._eventsReplaySubject.next(event);
    }

    /**
     * Use this method to get an observable that will fire when an event is raised.
     * @param withReplay 
     * @returns 
     */
    public GetEventListener(withReplay: boolean = false): Observable<MJ.MJEvent> {
        return withReplay ? this._eventsReplay$ : this._events$;
    }

    /**
     * Returns the instance of ClassFactory you should use in your application. Access this via the MJGlobal.Instance.ClassFactory property.
     */
    public get ClassFactory(): ClassFactory {
        return this._classFactory;
    }

    /**
     * Global property bag
     */
    public get Properties(): MJ.MJGlobalProperty[] {
        return this._properties;
    }


    private _objectCache: ObjectCache = new ObjectCache();
    /**
     * ObjectCache can be used to cache objects as needed by any application in memory. These objects are NOT persisted to disk or any other storage medium, so they are only good for the lifetime of the application
     */
    public get ObjectCache(): ObjectCache {
        return this._objectCache;
    }

    /***********************************************************************
     * STARTUP LOADING INFRASTRUCTURE
     *
     * These methods support the @LoadOnStartup decorator pattern for
     * automatic initialization of singleton classes at application startup.
     ***********************************************************************/

    private _startupRegistrations: StartupRegistration[] = [];
    private _startupLoadCompleted: boolean = false;

    /**
     * Register a class for startup loading. Called by @LoadOnStartup decorator.
     * @param registration - The registration information for the class
     */
    public RegisterForStartup(registration: Omit<StartupRegistration, 'loadedAt' | 'loadDurationMs'>): void {
        this._startupRegistrations.push(registration as StartupRegistration);
    }

    /**
     * Get all registered startup classes, sorted by priority (lower numbers first).
     * @returns Array of startup registrations sorted by priority
     */
    public GetStartupRegistrations(): StartupRegistration[] {
        return [...this._startupRegistrations].sort((a, b) => {
            const priorityA = this.ResolvePriority(a.options);
            const priorityB = this.ResolvePriority(b.options);
            return priorityA - priorityB;
        });
    }

    /**
     * Check if startup loading has been completed
     */
    public get StartupLoadCompleted(): boolean {
        return this._startupLoadCompleted;
    }

    /**
     * Load all registered startup classes in priority order.
     * Classes with the same priority are loaded in parallel.
     *
     * @param contextUser - The authenticated user context (type is unknown to avoid circular deps)
     * @returns Results of all load operations
     */
    public async LoadAll(contextUser?: unknown): Promise<LoadAllResult> {
        const startTime = Date.now();
        const registrations = this.GetStartupRegistrations();
        const groups = this.GroupByPriority(registrations);
        const results: LoadResult[] = [];

        for (const group of groups) {
            const groupResults = await Promise.all(
                group.map(async (reg): Promise<LoadResult> => {
                    const loadStart = Date.now();
                    try {
                        const instance = reg.getInstance();
                        await instance.Load(contextUser);

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
                        console.error(`[MJGlobal] Error loading ${result.className}:`, result.error);
                    } else if (result.severity === 'warn') {
                        console.warn(`[MJGlobal] Warning loading ${result.className}:`, result.error);
                    }
                    // 'silent' - do nothing
                }
            }
        }

        this._startupLoadCompleted = true;

        return {
            success: results.every(r => r.success || r.severity !== 'fatal'),
            results,
            totalDurationMs: Date.now() - startTime
        };
    }

    /**
     * Resolve the priority from options, defaulting to 100 if not specified.
     */
    private ResolvePriority(options: LoadOnStartupOptions): number {
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
    public ResetStartupRegistrations(): void {
        this._startupRegistrations = [];
        this._startupLoadCompleted = false;
    }
}