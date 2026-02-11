/*******************************************************************************************************
 * MJ Global Class Factory handles both the registration and instantiation of any class that we need to create across any MJ Project
 * 
 * The idea is to have a global place where we can register a subclass for a given base class and then call a simple class factory method to 
 * instantiate whatever class we need. This allows any module at any time to register their new class for a given base class as a sub-class 
 * and we will dynamically instantiate that sub-class from that point forward
 ******************************************************************************************************/

import { GetRootClass, IsRootClass } from './ClassUtils';

/**
 * Type for constructor functions that have a name property
 */
type NamedClass = { name: string };

/**
 * Data structure to track the class registrations
 */
export class ClassRegistration {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    BaseClass: any; // The TYPE of the base class, NOT an instance of the base class
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SubClass: any; // The TYPE of the sub-class, NOT an instance of the sub-class
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    RootClass: any; // The TYPE of the root class, NOT an instance of the root class. This is used to determine if the baseClass is a root class or not
    Key: string | null = null; // used to identify a special attribute that we use to determine if this is the right sub-class. For example, in the case of BaseEntity and Entity object subclasses we'll have a LOT of entries
                // in the registration list, so we'll use the key to identify which sub-class to use for a given entity
    Priority: number = 0; // if there are multiple entries for a given combination of baseClass and subClass and key, we will use the priority to determine which one to use. The higher the number, the higher the priority
}
 

/**
 * ClassFactory is used to register and create instances of classes. It is a singleton class that can be used to register a sub-class for a given base class and key. Do NOT directly attempt to instantiate this class, 
 * instead use the static Instance property of the MJGlobal class to get the instance of the ClassFactory for your application.
 */
export class ClassFactory {
    private _registrations: ClassRegistration[] = [];

    /**
     * Use this method or the @RegisterClass decorator to register a sub-class for a given base class.
     * @param baseClass A reference to the base class you are registering a sub-class for
     * @param subClass A reference to the sub-class you are registering
     * @param key A key can be used to differentiate registrations for the same base class/sub-class combination. For example, in the case of BaseEntity and Entity object subclasses we'll have a LOT of entries and we want to get the highest priority registered sub-class for a specific key. In that case, the key is the entity name, but the key can be any value you want to use to differentiate registrations.
     * @param priority Higher priority registrations will be used over lower priority registrations. If there are multiple registrations for a given base class/sub-class/key combination, the one with the highest priority will be used. If there are multiple registrations with the same priority, the last one registered will be used. Finally, if you do NOT provide this setting, the order of registrations will increment the priority automatically so dependency injection will typically care care of this. That is, in order for Class B, a subclass of Class A, to be registered properly, Class A code has to already have been loaded and therefore Class A's RegisterClass decorator was run. In that scenario, if neither Class A or B has a priority setting, Class A would be 1 and Class B would be 2 automatically. For this reason, you only need to explicitly set priority if you want to do something atypical as this mechanism normally will solve for setting the priority correctly based on the furthest descendant class that is registered.
     * @param skipNullKeyWarning If true, will not print a warning if the key is null or undefined. This is useful for cases where you know that the key is not needed and you don't want to see the warning in the console.
     * @param autoRegisterWithRootClass If true, will automatically register the subclass with the root class of the baseClass hierarchy. This ensures proper priority ordering when multiple subclasses are registered in a hierarchy. Defaults to false to preserve the original registration contract where classes are stored under the baseClass you specify.
     */
    public Register(baseClass: unknown, subClass: unknown, key: string | null = null, priority: number = 0, skipNullKeyWarning: boolean = false, autoRegisterWithRootClass: boolean = false): void {
        if (baseClass && subClass) {
            const baseClassName = (baseClass as NamedClass).name;
            const subClassName = (subClass as NamedClass).name;

            if (key === undefined || key === null && !skipNullKeyWarning) {
                console.warn(`ClassFactory.GetAllRegistrations: Registration for base class ${baseClassName} has no key set. This is not recommended and may lead to unintended behavior when trying to match registrations. Please set a key for this registration.`)
            }

            // Get the root class for this registration
            const rootClass = GetRootClass(baseClass);
            const rootClassName = (rootClass as NamedClass).name;

            // Determine which class to actually register against
            const effectiveBaseClass = autoRegisterWithRootClass ? rootClass : baseClass;
            const effectiveBaseClassName = (effectiveBaseClass as NamedClass).name;

            // Log if we're auto-registering with root class
            if (autoRegisterWithRootClass && effectiveBaseClass !== baseClass) {
                console.info(`ClassFactory.Register: Auto-registering ${subClassName} with root class ${rootClassName} instead of ${baseClassName}`);
            }

            // get all of the existing registrations for the effective base class and key
            const registrations = this.GetAllRegistrations(effectiveBaseClass, key);

            if (priority > 0) {
                // validate to make sure that the combination of base class and key for the provided priority # is not already registered, if it is, then print a warning
                const existing = registrations.filter(r => r.Priority === priority);
                if (existing && existing.length > 0) {
                    console.warn(`*** ClassFactory.Register: Registering class ${subClassName} for base class ${effectiveBaseClassName} and key/priority ${key}/${priority}. ${existing.length} registrations already exist for that combination. While this is allowed it is not desired and when matching class requests occur, we will simply use the LAST registration we happen to have which can lead to unintended behavior. ***`);
                }
            }
            else if (priority === 0 || priority === null || priority === undefined) {
                // when priority is not provided or is zero, which is logically the same, check to see what the highest earlier registration was and increment by 1
                // this automatically makes the most recent registration higher, IF IT DIDN'T ALREADY have a priority explicitly set
                let highestPriority = 0;
                for (let i = 0; i < registrations.length; i++) {
                    if (registrations[i].Priority > highestPriority)
                        highestPriority = registrations[i].Priority;
                }
                // now set the priority to one higher than the highest priority we found
                priority = highestPriority + 1;
            }

            // this combination of baseclass/key/priority is NOT already registered.
            let reg = new ClassRegistration();
            reg.BaseClass = effectiveBaseClass;
            reg.SubClass = subClass;
            reg.RootClass = rootClass;
            reg.Key = key;
            reg.Priority = priority;

            this._registrations.push(reg);
        }
    }

    /**
     * Creates an instance of the class registered for the given base class and key. 
     * If no registration is found, will return an instance of the base class.
     */
    public CreateInstance<T>(baseClass: unknown, key: string | null = null, ...params: unknown[]): T | null {
        if (baseClass) {
            let reg = this.GetRegistration(baseClass, key);
            if (reg) {
                const SubClassConstructor = reg.SubClass as new (...args: unknown[]) => T;
                let instance: T | null = null;
                if (params !== undefined)
                    instance = new SubClassConstructor(...params);
                else
                    instance = new SubClassConstructor(); // dont pass in anything if we got undefined for that parameter into our function because it is different to call a function with no params than to pass in a single null/undefined param

                return instance;
            }
            else {
                // this is a normal condition to use the base class if we can't find a registration
                const BaseClassConstructor = baseClass as new (...args: unknown[]) => T;
                return new BaseClassConstructor(...params); // if we can't find a registration, just return a new instance of the base class
            }
        }

        return null;
    }

    /**
     * Returns all registrations for a given base class and key. If key is not provided, will return all registrations for the base class.
     * @param baseClass 
     * @param key 
     * @returns 
     */
    public GetAllRegistrations(baseClass: unknown, key?: string | null): ClassRegistration[] {
        if (baseClass) {
            return this._registrations.filter(r => {
                const baseClassName = (baseClass as { name: string }).name;
                const regBaseClassName = (r.BaseClass as { name: string }).name;
                return  regBaseClassName === baseClassName && // we use the name of the class instead of the class itself because JS is finicky about this since a given module can be loaded in various places (like from multiple other modules) and the class itself will be different in each case
                        ( key === undefined || key === null ? true : r.Key?.trim().toLowerCase() === key.trim().toLowerCase())
            } );
        }
        else
            return [];
    }

    /**
     * Returns the registration with the highest priority for a given base class and key. If key is not provided, will return the registration with the highest priority for the base class.
     */
    public GetRegistration(baseClass: unknown, key?: string | null): ClassRegistration | null {
        let matches = this.GetAllRegistrations(baseClass, key)
        if (matches && matches.length > 0) {
            // figure out the highest priority for all the matching registrations
            let highestPriority = 0;
            for (let i = 0; i < matches.length; i++) {
                if (matches[i].Priority > highestPriority)
                    highestPriority = matches[i].Priority;
            }

            // now filter the matches to only those that have the highest priority
            const highest = matches.filter(r => r.Priority === highestPriority);

            // return the last one in the list, which will be the last one registered - so that if everyone has the same priority number, we use the LAST one registered
            return highest[highest.length - 1];
        }

        return null;
    }

    /**
     * Returns all registrations that have the specified root class, regardless of what base class was used in the registration.
     * This is useful for finding all registrations in a class hierarchy.
     * @param rootClass The root class to search for
     * @param key Optional key to filter results
     * @returns Array of matching registrations
     */
    public GetRegistrationsByRootClass(rootClass: unknown, key?: string | null): ClassRegistration[] {
        if (rootClass) {
            const rootClassName = (rootClass as { name: string }).name;
            return this._registrations.filter(r => {
                const regRootClassName = (r.RootClass as { name?: string })?.name;
                return regRootClassName === rootClassName &&
                       (key === undefined || key === null ? true : r.Key?.trim().toLowerCase() === key.trim().toLowerCase())
            });
        }
        return [];
    }
}


