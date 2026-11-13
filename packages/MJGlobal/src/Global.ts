import * as MJ from './interface'
import { Subject, ReplaySubject, Observable } from 'rxjs';
import { ClassFactory } from './ClassFactory'
import { ObjectCache } from './ObjectCache';
import { BaseSingleton } from './BaseSingleton';
import { Uuidv4 } from './util';

/**
 * Global class used for coordinating events, creating class instances, and managing components across MemberJunction
 */
export class MJGlobal extends BaseSingleton<MJGlobal> {
    /**
     * Event codes excluded from {@link _eventsReplaySubject} retention while still delivered
     * synchronously to all live subscribers (both `GetEventListener(false)` and active
     * `GetEventListener(true)` listeners).
     *
     * `BaseEntityEvent` fires on every entity load, save, delete, and `NewRecord()` call and
     * carries the `BaseEntity` instance (plus its bound per-request `DatabaseProviderBase`) in
     * `event.args`. Retaining it in the 100-slot replay buffer pins up to 100 entity graphs in
     * memory for 30s and evicts one-shot initialization events such as `LoggedIn` during boot.
     */
    public static readonly NonReplayableEventCodes: Set<string> = new Set(['BaseEntityEvent']);

    // subjects for observables to handle eventing
    private _eventsSubject: Subject<MJ.MJEvent> = new Subject();
    // ReplaySubject configured to prevent memory leaks while supporting late subscribers:
    // - bufferSize: 100 events (sufficient for initialization scenarios like login events)
    // - windowTime: 30000ms (30 seconds - adequate for slow-loading components)
    // Note: High-frequency non-replayable events (see NonReplayableEventCodes) bypass this
    // buffer so initialization events are not evicted and entity instances are not retained.
    private _eventsReplaySubject: ReplaySubject<MJ.MJEvent> = new ReplaySubject(100, 30000);

    // Convert the Subjects to Observables for public use.
    private _events$: Observable<MJ.MJEvent> = this._eventsSubject.asObservable();
    private _eventsReplay$: Observable<MJ.MJEvent> = this.createReplayAndLiveObservable();

    private _components: MJ.IMJComponent[] = [];

    private _classFactory: ClassFactory = new ClassFactory();

    private _properties: MJ.MJGlobalProperty[] = [];

    private _processUUID: string | null = null;

    /**
     * Returns the global instance of the MJGlobal class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of MJGlobal, always use this method to get the instance.
     */
    public static get Instance(): MJGlobal {
        return super.getInstance<MJGlobal>();
    }

    /**
     * A unique identifier for this process instance, generated once on first access
     * using a v4 UUID. Used to distinguish this server from others in distributed
     * cache invalidation scenarios (e.g., Redis pub/sub). The value persists for
     * the lifetime of the process and is stable across multiple accesses.
     *
     * @example
     * ```typescript
     * const serverId = MJGlobal.Instance.ProcessUUID;
     * // e.g., "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
     * ```
     */
    public get ProcessUUID(): string {
        if (!this._processUUID) {
            this._processUUID = Uuidv4();
        }
        return this._processUUID;
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
        this._eventsReplay$ = this.createReplayAndLiveObservable();
    }

    /**
     * Builds an observable that synchronously drains the current {@link _eventsReplaySubject}
     * buffer on subscribe (matching `ReplaySubject` semantics) and then delegates live delivery
     * to {@link _eventsSubject}. This ensures active `GetEventListener(true)` subscribers still
     * receive live {@link NonReplayableEventCodes} events without retaining those events in the
     * replay buffer.
     */
    private createReplayAndLiveObservable(): Observable<MJ.MJEvent> {
        const replaySubject = this._eventsReplaySubject;
        const liveSubject = this._eventsSubject;
        return new Observable<MJ.MJEvent>((subscriber) => {
            const buffered: MJ.MJEvent[] = [];
            const replaySub = replaySubject.subscribe({
                next: (event) => buffered.push(event),
                error: (err) => subscriber.error(err),
            });
            replaySub.unsubscribe();
            if (subscriber.closed) {
                return undefined;
            }
            const liveSub = liveSubject.subscribe(subscriber);
            for (let i = 0; i < buffered.length && !subscriber.closed; i++) {
                subscriber.next(buffered[i]);
            }
            return liveSub;
        });
    }

    /**
     * Use this method to raise an event to all component who are listening for the event.
     * @param event
     */
    public RaiseEvent(event: MJ.MJEvent) {
        this._eventsSubject.next(event);
        if (!event.eventCode || !MJGlobal.NonReplayableEventCodes.has(event.eventCode)) {
            this._eventsReplaySubject.next(event);
        }
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
}

/**
 * This utility function sends a message to all components that are listening requesting a window resize. This is a cross-platform method of requesting a resize and is loosely coupled from
 * the actual implementation on a specific device/browser/etc.
 * @param delay
 * @param component
 */
export function InvokeManualResize(delay: number = 50, component: MJ.IMJComponent | null = null) {
    setTimeout(() => {
        MJGlobal.Instance.RaiseEvent({
            event: MJ.MJEventType.ManualResizeRequest,
            eventCode: '',
            args: null,
            component: component!
        });
    }, delay); // give the tabstrip time to render
}
