/**
 * Utility functions for working with class hierarchies and reflection
 */

export interface ClassInfo {
    /**
     * The name of the class
     */
    name: string;
    /**
     * Reference to the class constructor
     */
    reference: any;
}

/**
 * Gets the immediate superclass of the given class
 * @param ClassRef The class constructor reference
 * @returns The superclass constructor or null if no superclass
 */
export function GetSuperclass(ClassRef: any): any | null {
    if (!ClassRef || typeof ClassRef !== 'function') {
        return null;
    }
    
    const superclass = Object.getPrototypeOf(ClassRef);
    
    // Check if we've reached the top of the chain (built-in prototypes)
    if (!superclass || superclass === Function.prototype) {
        return null;
    }

    return superclass;
}

/**
 * Gets the root class in the inheritance chain (the topmost user-defined class)
 * @param ClassRef The class constructor reference
 * @returns The root class constructor
 */
export function GetRootClass(ClassRef: any): any {
    if (!ClassRef || typeof ClassRef !== 'function') {
        return ClassRef;
    }
    
    let current = ClassRef;

    while (current) {
        const superclass = Object.getPrototypeOf(current);

        // Stop when we reach built-in prototypes
        if (!superclass || superclass === Function.prototype) {
            break;
        }

        current = superclass;
    }

    return current;
}

/**
 * Checks if a class is a subclass of another class (at any level in the inheritance hierarchy)
 * Note: This checks the entire inheritance chain, not just the immediate parent
 * @param PotentialSubclass The potential subclass constructor
 * @param PotentialAncestor The potential ancestor class constructor
 * @returns True if PotentialSubclass inherits from PotentialAncestor at any level
 */
export function IsSubclassOf(PotentialSubclass: any, PotentialAncestor: any): boolean {
    if (!PotentialSubclass || !PotentialAncestor || 
        typeof PotentialSubclass !== 'function' || 
        typeof PotentialAncestor !== 'function') {
        return false;
    }
    
    // Check if they're the same class
    if (PotentialSubclass === PotentialAncestor) {
        return false; // A class is not a subclass of itself
    }
    
    // Walk up the prototype chain
    let current = PotentialSubclass;
    
    while (current) {
        current = Object.getPrototypeOf(current);
        
        if (current === PotentialAncestor) {
            return true;
        }

        // Stop when we reach built-in prototypes
        if (!current || current === Function.prototype) {
            break;
        }
    }
    
    return false;
}

/**
 * Checks if a class is a root class (has no user-defined superclass)
 * @param ClassRef The class constructor reference
 * @returns True if the class has no superclass
 */
export function IsRootClass(ClassRef: any): boolean {
    if (!ClassRef || typeof ClassRef !== 'function') {
        return false;
    }
    
    const superclass = Object.getPrototypeOf(ClassRef);
    
    // It's a root class if it has no superclass or only inherits from built-in prototypes
    return !superclass || superclass === Function.prototype;
}

/**
 * Checks if a class is a descendant of another class (at any level in the hierarchy)
 * This is an alias for IsSubclassOf with a more descriptive name
 * @param PotentialDescendant The potential descendant class constructor
 * @param PotentialAncestor The potential ancestor class constructor  
 * @returns True if PotentialDescendant inherits from PotentialAncestor at any level
 */
export function IsDescendantClassOf(PotentialDescendant: any, PotentialAncestor: any): boolean {
    return IsSubclassOf(PotentialDescendant, PotentialAncestor);
}

/**
 * Gets the complete inheritance chain for a class
 * @param ClassRef The class constructor reference
 * @returns Array of ClassInfo objects, ordered from immediate superclass to root
 */
export function GetClassInheritance(ClassRef: any): ClassInfo[] {
    const chain: ClassInfo[] = [];
    
    if (!ClassRef || typeof ClassRef !== 'function') {
        return chain;
    }
    
    let current = Object.getPrototypeOf(ClassRef);
    
    while (current) {
        // Stop when we reach built-in prototypes
        if (current === Function.prototype) {
            break;
        }

        chain.push({
            name: current.name || 'Anonymous',
            reference: current
        });

        current = Object.getPrototypeOf(current);
    }

    return chain;
}

/**
 * Gets the complete class hierarchy including the class itself
 * @param ClassRef The class constructor reference
 * @returns Array of ClassInfo objects, ordered from the class itself up to root
 */
export function GetFullClassHierarchy(ClassRef: any): ClassInfo[] {
    const chain: ClassInfo[] = [];

    if (!ClassRef || typeof ClassRef !== 'function') {
        return chain;
    }

    let current = ClassRef;

    while (current) {
        // Stop when we reach built-in prototypes
        if (current === Function.prototype) {
            break;
        }
        
        chain.push({
            name: current.name || 'Anonymous',
            reference: current
        });
        
        current = Object.getPrototypeOf(current);
    }
    
    return chain;
}

/**
 * Checks if a value is a class constructor (not an instance)
 * @param value The value to check
 * @returns True if the value is a class constructor
 */
export function IsClassConstructor(value: any): boolean {
    if (typeof value !== 'function') {
        return false;
    }
    
    // Check if it's a class by looking at its string representation
    const fnString = value.toString();
    
    // ES6 classes start with "class"
    if (fnString.startsWith('class ')) {
        return true;
    }
    
    // Check for constructor functions that might be transpiled classes
    // They typically have a prototype with a constructor property
    if (value.prototype && value.prototype.constructor === value) {
        // Additional check: does it look like it's meant to be instantiated?
        return fnString.includes('this.') || Object.getOwnPropertyNames(value.prototype).length > 1;
    }
    
    return false;
}

/**
 * Gets the class name safely, handling minification and anonymous classes
 * @param ClassRef The class constructor reference
 * @returns The class name or a fallback string
 */
export function GetClassName(ClassRef: any): string {
    if (!ClassRef || typeof ClassRef !== 'function') {
        return 'Unknown';
    }
    
    // Try to get the name property
    if (ClassRef.name) {
        return ClassRef.name;
    }
    
    // Try to extract from toString() as fallback
    const fnString = ClassRef.toString();
    const match = fnString.match(/^class\s+(\w+)/);
    if (match && match[1]) {
        return match[1];
    }

    return 'Anonymous';
}

/**
 * Cache for {@link IsMemberOverridden}. Keyed by the subclass constructor, then by the member name
 * plus the base class, because the answer is a property of that class pair and a hot path should
 * not walk a prototype chain on every call.
 */
const __memberOverrideCache = new WeakMap<Function, Map<string, boolean>>();

/**
 * Determines whether a subclass has replaced `member` somewhere between `instance` and `BaseClassRef`.
 *
 * Distinguishes "the author made no choice" from "the author chose the value that happens to be the
 * default" — something a getter cannot express on its own. A base class member returning `true`
 * looks identical whether a subclass deliberately opted in or never knew the member existed, so an
 * API whose default sits in the *off* position silently disables the subclasses that most wanted it
 * on. Asking whether the member was overridden recovers the intent.
 *
 * Handles methods and accessors alike by comparing property descriptors, and finds an override
 * declared anywhere in a multi-level chain — a generated class, an application subclass, a
 * server-side subclass layered on top of it.
 *
 * @param instance The object whose class chain is inspected. A non-object returns false.
 * @param member The property name to look for.
 * @param BaseClassRef The class declaring the default implementation. A member `BaseClassRef` does
 *                     not itself declare returns false — there is no baseline to have overridden.
 * @returns True when some class below `BaseClassRef` declares `member`.
 */
export function IsMemberOverridden(instance: any, member: string, BaseClassRef: any): boolean {
    if (!instance || typeof instance !== 'object' || !member || typeof BaseClassRef !== 'function') {
        return false;
    }
    const ctor = instance.constructor;
    if (typeof ctor !== 'function') {
        return false;
    }
    // "Overridden relative to a class this object does not descend from" is not a meaningful
    // question, and answering it by walking anyway is actively wrong: the walk terminates on the
    // base prototype, so an unrelated chain is traversed to its end and the first same-named member
    // found anywhere reads as an override.
    if (!(instance instanceof BaseClassRef)) {
        return false;
    }

    // The base class is part of the answer's identity, so two different bases asked about the same
    // member on the same class cannot collide in the cache.
    const key = member + ' ' + GetClassName(BaseClassRef);
    let perClass = __memberOverrideCache.get(ctor);
    if (perClass && perClass.has(key)) {
        return perClass.get(key)!;
    }
    if (!perClass) {
        perClass = new Map<string, boolean>();
        __memberOverrideCache.set(ctor, perClass);
    }

    const basePrototype = BaseClassRef.prototype;
    const base = basePrototype ? Object.getOwnPropertyDescriptor(basePrototype, member) : undefined;
    let answer = false;
    if (base) {
        let proto = Object.getPrototypeOf(instance);
        while (proto && proto !== basePrototype) {
            const own = Object.getOwnPropertyDescriptor(proto, member);
            if (own && (own.get !== base.get || own.value !== base.value)) {
                answer = true;
                break;
            }
            proto = Object.getPrototypeOf(proto);
        }
    }
    perClass.set(key, answer);
    return answer;
}