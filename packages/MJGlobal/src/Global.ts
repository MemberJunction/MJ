import * as MJ from './interface'
import { Subject, ReplaySubject, Observable } from 'rxjs';
import { ClassFactory } from './ClassFactory'
import { ObjectCache } from './ObjectCache';
import { BaseSingleton } from './BaseSingleton';

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
}
