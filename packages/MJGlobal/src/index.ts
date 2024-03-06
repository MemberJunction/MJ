import * as MJ from './interface'
import { GetGlobalObjectStore } from './util';
import { Subject, ReplaySubject, Observable } from 'rxjs';
import { ClassFactory, ClassRegistration } from './ClassFactory'
import { ObjectCache } from './ObjectCache';

export { ClassFactory, ClassRegistration } from './ClassFactory'
export * from './interface'
export * from './util'
export * from './ObjectCache'

/**
 * Global class used for coordinating events and components across MemberJunction
 */
export class MJGlobal {
    // subjects for observables to handle eventing
    private _eventsSubject: Subject<MJ.MJEvent> = new Subject();
    private _eventsReplaySubject: ReplaySubject<MJ.MJEvent> = new ReplaySubject();

    // Convert the Subjects to Observables for public use.
    private _events$: Observable<MJ.MJEvent> = this._eventsSubject.asObservable();
    private _eventsReplay$: Observable<MJ.MJEvent> = this._eventsReplaySubject.asObservable();

    private _globalObjectKey: string = 'MJGlobalInstance';
    private _components: MJ.IMJComponent[] = [];
    private static _instance: MJGlobal;

    private _classFactory: ClassFactory = new ClassFactory();

    private _properties: MJ.MJGlobalProperty[] = [];

    constructor() {
        if (MJGlobal._instance) 
            return MJGlobal._instance;
        else {
            const g = GetGlobalObjectStore();
            if (g && g[this._globalObjectKey]) {
                MJGlobal._instance = g[this._globalObjectKey];
                return MJGlobal._instance;
            }

            // finally, if we get here, we are the first instance of this class, so create it
            if (!MJGlobal._instance) {
                MJGlobal._instance = this;
            
                // try to put this in global object store if there is a window/e.g. we're in a browser, a global object, we're in node, etc...
                if (g)
                    g[this._globalObjectKey] = MJGlobal._instance;
                
                return this;
            }
        }
    }

    public RegisterComponent(component: MJ.IMJComponent) {
        this._components.push(component);
    }

    public Reset() {
        this._components = [];

        this._eventsSubject  = new Subject();
        this._eventsReplaySubject = new ReplaySubject();

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

    public static get Instance(): MJGlobal {
        if (!MJGlobal._instance)
            MJGlobal._instance = new MJGlobal();

        return MJGlobal._instance;
    }

    public get ClassFactory(): ClassFactory {
        return this._classFactory;
    }

    /**
     * Global property bag
     */
    public get Properties(): MJ.MJGlobalProperty[] {
        return this._properties;
    }

    public GetGlobalObjectStore(): any {
        return GetGlobalObjectStore(); // wrap the function in a method here so that other modules can use it easily.
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
 * Decorate your class with this to register it with the MJGlobal class factory.
 * @param baseClass 
 * @param key a string that is later used to retrieve a given registration - this should be unique for each baseClass/key combination, if multiple registrations exist for a given baseClass/key combination, the highest priority registration will be used to create class instances
 * @param priority the higher the number the more priority a registration has. If there are multiple registrations for a given combination of baseClass/key the highest priority registration will be used to create class instances
 * @returns an instance of the class that was registered for the combination of baseClass/key (with highest priority if more than one)
 */
export function RegisterClass(baseClass: any, key: string = null, priority: number = 0) {
    return function (constructor: Function) {
        // Invoke the registration method
        MJGlobal.Instance.ClassFactory.Register(baseClass, constructor, key, priority);
    }
}
