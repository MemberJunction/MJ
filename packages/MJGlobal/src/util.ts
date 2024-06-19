/**
 * The Global Object Store is a place to store global objects that need to be shared across the application. Depending on the execution environment, this could be the window object in a browser, or the global object in a node environment, or something else in other contexts. The key here is that in some cases static variables are not truly shared
     * because it is possible that a given class might have copies of its code in multiple paths in a deployed application. This approach ensures that no matter how many code copies might exist, there is only one instance of the object in question by using the Global Object Store.
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


/**
 * This function takes in an input string and attempts to clean it up to return a valid JSON string. This function will attempt to extract JSON from a Markdown code block if it exists, 
 * otherwise it will attempt to extract JSON from the input string itself. If the input string is not valid JSON, this function will return null.
 * @param inputString 
 * @returns 
 */
export function CleanJSON(inputString: string | null): string | null {
    if (!inputString)
        return null;

    // replace all \n and \t with nothing
    const jsonString = inputString.trim().replace(/\n/g, "").replace(/\t/g, "");

    // Regular expression to match JavaScript code blocks within Markdown fences
    // This regex looks for ``` optionally followed by js or javascript (case-insensitive), then captures until the closing ```
    const markdownRegex = /```(?:json|JSON)?\s*([\s\S]*?)```/gi;

    // Check if the input contains Markdown code fences for JavaScript
    const matches = Array.from(jsonString.matchAll(markdownRegex));

    if (matches.length > 0) {
        // If there are matches, concatenate all captured groups (in case there are multiple code blocks)
        return matches.map(match => match[1].trim()).join('\n');
    } else {
        // If there are no Markdown code fences, we could have a string that contains JSON, or is JUST JSON
        // Attempt to extract JSON from a mixed string
        const firstBracketIndex = jsonString.indexOf('[');
        const firstBraceIndex = jsonString.indexOf('{');
        let startIndex = -1;
        let endIndex = -1;
    
        // Determine the starting index based on the position of the first '[' and '{'
        if ((firstBracketIndex !== -1 && firstBracketIndex < firstBraceIndex) || firstBraceIndex === -1) {
            startIndex = firstBracketIndex;
            endIndex = jsonString.lastIndexOf(']');
        } else if (firstBraceIndex !== -1) {
            startIndex = firstBraceIndex;
            endIndex = jsonString.lastIndexOf('}');
        }
    
        if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
            console.warn("No JSON found in the input.");
            return jsonString.trim();
        }
    
        const potentialJSON = jsonString.substring(startIndex, endIndex + 1);
        try {
            // Parse and stringify to format the JSON nicely
            // and to validate it's indeed a valid JSON.
            const jsonObject = JSON.parse(potentialJSON);
            return JSON.stringify(jsonObject, null, 2);
        } catch (error) {
            console.error("Failed to parse extracted string as JSON:", error);
            // Return null or potentially invalid JSON text as a fallback
            return null;
        }     
    }
}

/**
 * This function takes in a string that may contain JavaScript code in a markdown code block and returns the JavaScript code without the code block.
 * @param javaScriptCode 
 * @returns 
 */
export function CleanJavaScript(javaScriptCode: string): string {
    // Regular expression to match JavaScript code blocks within Markdown fences
    // This regex looks for ``` optionally followed by js or javascript (case-insensitive), then captures until the closing ```
    const markdownRegex = /```(?:js|javascript)?\s*([\s\S]*?)```/gi;

    // Check if the input contains Markdown code fences for JavaScript
    const matches = Array.from(javaScriptCode.matchAll(markdownRegex));

    if (matches.length > 0) {
        // If there are matches, concatenate all captured groups (in case there are multiple code blocks)
        return matches.map(match => match[1].trim()).join('\n');
    } else {
        // If there are no Markdown code fences, assume the input is plain JavaScript code
        return javaScriptCode.trim();
    }
}

/**
 * Simple wrapper method to JSON.parse that catches any errors and logs them to the console. This method is useful when you want to parse JSON but don't want to crash the application if the JSON is invalid.
 * @param jsonString 
 * @returns 
 */
export function SafeJSONParse<T>(jsonString: string): T {
    try {
        return <T>JSON.parse(jsonString);
    } catch (e) {
        console.error("Error parsing JSON string:", e);
        return null;
    }
}