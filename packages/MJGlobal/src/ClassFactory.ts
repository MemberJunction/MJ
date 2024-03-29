/*******************************************************************************************************
 * MJ Global Class Factory handles both the registration and instantiation of any class that we need to create across any MJ Project
 * 
 * The idea is to have a global place where we can register a subclass for a given base class and then call a simple class factory method to 
 * instantiate whatever class we need. This allows any module at any time to register their new class for a given base class as a sub-class 
 * and we will dynamically instantiate that sub-class from that point forward
 ******************************************************************************************************/


export class ClassRegistration {
    BaseClass: any // The TYPE of the base class, NOT an instance of the base class
    SubClass: any // The TYPE of the sub-class, NOT an instance of the sub-class
    Key: string // used to identify a special attribute that we use to determine if this is the right sub-class. For example, in the case of BaseEntity and Entity object subclasses we'll have a LOT of entries
                // in the registration list, so we'll use the key to identify which sub-class to use for a given entity
    Priority: number // if there are multiple entries for a given combination of baseClass and subClass and key, we will use the priority to determine which one to use. The higher the number, the higher the priority
}


export class ClassFactory {
    private _registrations: ClassRegistration[] = [];

    public Register(baseClass: any, subClass: any, key: string = null, priority: number = 0) {
        if (baseClass && subClass) {
            // get all of hte existing registrations for this baseClass and key
            const registrations = this.GetAllRegistrations(baseClass, key);
            // validate to make sure that the comabintion of base class and key for the provided priority # is not already registered, if it is, then throw an exception
            const existing = registrations.filter(r => r.Priority === priority);
            if (existing && existing.length > 0) {
                console.warn(`*** ClassFactory.Register: Registering class ${subClass.name} for base class ${baseClass.name} and key/priority ${key}/${priority}. ${existing.length} registrations already exist for that combination. While this is allowed it is not desired and when matching class requests occur, we will simply use the LAST registration we happen to have which can lead to unintended behavior. ***`);
            }
            // this combination of baseclass/key/priority is NOT already registered.
            let reg = new ClassRegistration();
            reg.BaseClass = baseClass;
            reg.SubClass = subClass;
            reg.Key = key;
            reg.Priority = priority;

            this._registrations.push(reg);
        }
    }

    public CreateInstance<T>(baseClass: any, key: string = null, ...params: any[]): T | null {
        if (baseClass) {
            let reg = this.GetRegistration(baseClass, key);
            if (reg) {
                let instance: T | null = null;
                if (params !== undefined)
                    instance = new reg.SubClass(...params);
                else
                    instance = new reg.SubClass(); // dont pass in anything if we got undefined for that parameter into our function because it is different to call a function with no params than to pass in a single null/undefined param

                return instance;
            }
            else {
                console.log(`ClassFactory.CreateInstance: Could not find registration for base class ${baseClass && baseClass.name ? baseClass.name : baseClass} and key ${key}, using the base class instead.`);  
                return new baseClass(...params); // if we can't find a registration, just return a new instance of the base class
            }
        }

        return null;
    }

    public GetAllRegistrations(baseClass: any, key: string = undefined): ClassRegistration[] {
        if (baseClass) {
            return this._registrations.filter(r => {
                return  r.BaseClass.name === baseClass.name && // we use the name of the class instead of the class itself because JS is finicky about this since a given module can be loaded in various places (like from multiple other modules) and the class itself will be different in each case
                        ( key === undefined || key === null ? true : r.Key.trim().toLowerCase() === key.trim().toLowerCase())
            } );
        }
        else
            return null;
    }

    public GetRegistration(baseClass: any, key: string = undefined): ClassRegistration {
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
}


