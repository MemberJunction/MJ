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