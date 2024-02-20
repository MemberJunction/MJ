/**
 * The Global Object Store is a place to store global objects that need to be shared across the application. Depending on the execution environment, this could be the window object in a browser, or the global object in a node environment. 
 * This function will return the appropriate object based on the environment.
 * @returns 
 */
export function GetGlobalObjectStore() {
    try    {
        // we might be running in a browser, in that case, we use the window object for our global stuff
        if (window) 
            return window;
        else {
            // if we get here, we don't have a window object, so try the global object (node environment) 
            // won't get here typically because attempting to access the global object will throw an exception if it doesn't exist
            if (global) 
                return global;
            else 
                return null; // won't get here typically because attempting to access the global object will throw an exception if it doesn't exist
        }
    }
    catch (e) {
        try {
            // if we get here, we don't have a window object, so try the global object (node environment)
            if (global) 
                return global;
            else 
                return null; // won't get here typically because attempting to access the global object will throw an exception if it doesn't exist
        }
        catch (e) {
            // if we get here, we don't have a global object either, so we're not running in a browser or node, so we're probably running in a unit test
            // in that case, we don't have a provider saved, return null, we need to be either in node or a browser
            return null;
        }
    }
}

/**
 * This utility function will copy all scalar and array properties from an object to a new object and return the new object. This function will NOT copy functions or non-plain objects.
 * @param input 
 * @returns 
 */
export function CopyScalarsAndArrays<T extends object>(input: T): Partial<T> {
    const result: Partial<T> = {};
    Object.keys(input).forEach((key) => {
        const value = input[key as keyof T];
        // Check for null or scalar types directly
        if (value === null || typeof value !== 'object') {
            result[key as keyof T] = value;
        } else if (Array.isArray(value)) {
            // Handle arrays by creating a new array with the same elements
            result[key as keyof T] = [...value] as any;
        } else if (typeof value === 'object' && value.constructor === Object) {
            // Recursively copy plain objects
            result[key as keyof T] = CopyScalarsAndArrays(value) as any;
        }
        // Functions and non-plain objects are intentionally ignored
    });
    return result;
}