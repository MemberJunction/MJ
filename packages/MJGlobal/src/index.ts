import * as MJ from './interface'
import { GetGlobalObjectStore } from './util';
import { Subject, ReplaySubject, Observable } from 'rxjs';
import { ClassFactory, ClassRegistration } from './ClassFactory'
import { ObjectCache } from './ObjectCache';
import { BaseSingleton } from './BaseSingleton';

export { ClassFactory, ClassRegistration } from './ClassFactory'
export * from './interface'
export * from './util'
export * from './ObjectCache'
export * from './BaseSingleton'

/**
 * Global class used for coordinating events, creating class instances, and managing components across MemberJunction
 */
export class MJGlobal extends BaseSingleton<MJGlobal> {
    // subjects for observables to handle eventing
    private _eventsSubject: Subject<MJ.MJEvent> = new Subject();
    private _eventsReplaySubject: ReplaySubject<MJ.MJEvent> = new ReplaySubject();

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
 * Decorate your class with this to register it with the MJGlobal class factory.
 * @param baseClass 
 * @param key a string that is later used to retrieve a given registration - this should be unique for each baseClass/key combination, if multiple registrations exist for a given baseClass/key combination, the highest priority registration will be used to create class instances
 * @param priority Higher priority registrations will be used over lower priority registrations. If there are multiple registrations for a given base class/sub-class/key combination, the one with the highest priority will be used. If there are multiple registrations with the same priority, the last one registered will be used. Finally, if you do NOT provide this setting, the order of registrations will increment the priority automatically so dependency injection will typically care care of this. That is, in order for Class B, a subclass of Class A, to be registered properly, Class A code has to already have been loaded and therefore Class A's RegisterClass decorator was run. In that scenario, if neither Class A or B has a priority setting, Class A would be 1 and Class B would be 2 automatically. For this reason, you only need to explicitly set priority if you want to do something atypical as this mechanism normally will solve for setting the priority correctly based on the furthest descendant class that is registered.
 * @param skipNullKeyWarning If true, will not print a warning if the key is null or undefined. This is useful for cases where you know that the key is not needed and you don't want to see the warning in the console.
 * @returns an instance of the class that was registered for the combination of baseClass/key (with highest priority if more than one)
 */
export function RegisterClass(baseClass: any, key: string = null, priority: number = 0, skipNullKeyWarning: boolean = false): (constructor: Function) => void {
    return function (constructor: Function) {
        // Invoke the registration method
        MJGlobal.Instance.ClassFactory.Register(baseClass, constructor, key, priority, skipNullKeyWarning);
    }
}
