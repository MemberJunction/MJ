import { MJGlobal } from './Global';

/**
 * Decorate your class with this to register it with the MJGlobal class factory.
 * @param baseClass 
 * @param key a string that is later used to retrieve a given registration - this should be unique for each baseClass/key combination, if multiple registrations exist for a given baseClass/key combination, the highest priority registration will be used to create class instances
 * @param priority Higher priority registrations will be used over lower priority registrations. If there are multiple registrations for a given base class/sub-class/key combination, the one with the highest priority will be used. If there are multiple registrations with the same priority, the last one registered will be used. Finally, if you do NOT provide this setting, the order of registrations will increment the priority automatically so dependency injection will typically care care of this. That is, in order for Class B, a subclass of Class A, to be registered properly, Class A code has to already have been loaded and therefore Class A's RegisterClass decorator was run. In that scenario, if neither Class A or B has a priority setting, Class A would be 1 and Class B would be 2 automatically. For this reason, you only need to explicitly set priority if you want to do something atypical as this mechanism normally will solve for setting the priority correctly based on the furthest descendant class that is registered.
 * @param skipNullKeyWarning If true, will not print a warning if the key is null or undefined. This is useful for cases where you know that the key is not needed and you don't want to see the warning in the console.
 * @param autoRegisterWithRootClass If true (default), will automatically register the subclass with the root class of the baseClass hierarchy. This ensures proper priority ordering when multiple subclasses are registered in a hierarchy.
 * @returns an instance of the class that was registered for the combination of baseClass/key (with highest priority if more than one)
 */
export function RegisterClass(baseClass: unknown, key: string | null = null, priority: number = 0, skipNullKeyWarning: boolean = false, autoRegisterWithRootClass: boolean = true): (constructor: Function) => void {
    return function (constructor: Function) {
        // Invoke the registration method
        MJGlobal.Instance.ClassFactory.Register(baseClass, constructor, key, priority, skipNullKeyWarning, autoRegisterWithRootClass);
    }
}