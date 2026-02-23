import { MJGlobal } from "./Global";
import { IMJComponent, MJEventType } from "./interface";
import { v4 } from 'uuid';
import _ from 'lodash';

/**
 * Type definition for the global object store that allows arbitrary string indexing.
 * Uses 'any' intentionally as this is a dynamic storage mechanism for cross-module state.
 */
export interface GlobalObjectStore {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

/**
 * The Global Object Store is a place to store global objects that need to be shared across the application. Depending on the execution environment, this could be the window object in a browser, or the global object in a node environment, or something else in other contexts. The key here is that in some cases static variables are not truly shared
     * because it is possible that a given class might have copies of its code in multiple paths in a deployed application. This approach ensures that no matter how many code copies might exist, there is only one instance of the object in question by using the Global Object Store.
 * @returns
 */
export function GetGlobalObjectStore(): GlobalObjectStore | null {
    try    {
        // we might be running in a browser, in that case, we use the window object for our global stuff
        if (window)
            return window as unknown as GlobalObjectStore;
        else {
            // if we get here, we don't have a window object, so try the global object (node environment)
            // won't get here typically because attempting to access the global object will throw an exception if it doesn't exist
            if (global)
                return global as unknown as GlobalObjectStore;
            else
                return null; // won't get here typically because attempting to access the global object will throw an exception if it doesn't exist
        }
    }
    catch (e) {
        try {
            // if we get here, we don't have a window object, so try the global object (node environment)
            if (global)
                return global as unknown as GlobalObjectStore;
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
 * This utility function will copy all scalar and array properties from an object to a new object and return the new object.
 * This function will NOT copy functions or non-plain objects (unless resolveCircularReferences is true).
 *
 * @param input - The object to copy
 * @param resolveCircularReferences - If true, handles circular references and complex objects for safe JSON serialization.
 *                                     When enabled, circular references are replaced with '[Circular Reference]',
 *                                     complex objects (Sockets, Streams, etc.) are replaced with their type names,
 *                                     Error objects are specially handled to extract name/message/stack,
 *                                     and Dates are converted to ISO strings. Default: false
 * @param maxDepth - Maximum recursion depth when resolveCircularReferences is true (default: 10)
 * @returns A new object with scalars and arrays copied
 */
export function CopyScalarsAndArrays<T extends object>(
    input: T,
    resolveCircularReferences: boolean = false,
    maxDepth: number = 10
): Partial<T> {
    if (resolveCircularReferences) {
        // Use the enhanced version with circular reference detection
        const seen = new WeakSet();

        const copy = (value: any, depth: number): any => {
            // Stop at max depth
            if (depth > maxDepth) {
                return '[Max Depth Reached]';
            }

            // Handle null/undefined
            if (value === null || value === undefined) {
                return value;
            }

            // Handle primitives (string, number, boolean)
            if (typeof value !== 'object' && typeof value !== 'function') {
                return value;
            }

            // Skip functions
            if (typeof value === 'function') {
                return '[Function]';
            }

            // Detect circular references
            if (seen.has(value)) {
                return '[Circular Reference]';
            }
            seen.add(value);

            // Handle arrays
            if (_.isArray(value)) {
                return value.map(item => copy(item, depth + 1));
            }

            // Handle Date objects
            if (_.isDate(value)) {
                return value.toISOString();
            }

            // Handle Error objects specially to get their properties
            if (value instanceof Error) {
                return {
                    name: value.name,
                    message: value.message,
                    stack: value.stack,
                    // Spread any custom properties added to the error
                    ...copy(_.omit(value, ['name', 'message', 'stack']), depth + 1)
                };
            }

            // Handle plain objects (POJOs)
            if (_.isPlainObject(value)) {
                const result: any = {};
                for (const key in value) {
                    if (value.hasOwnProperty(key)) {
                        result[key] = copy(value[key], depth + 1);
                    }
                }
                return result;
            }

            // For complex objects (Socket, Stream, Buffer, etc.), just use the type name
            const typeName = value.constructor?.name || 'Object';
            if (typeName !== 'Object') {
                return `[${typeName}]`;
            }

            return '[Complex Object]';
        };

        return copy(input, 0);
    } else {
        // Original implementation for backward compatibility
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
}

/**
 * Combines CleanJSON and SafeJSONParse to clean, extract, and parse JSON in one operation.
 * This is a convenience function that first cleans the input string using CleanJSON to handle
 * various formats (double-escaped, markdown blocks, etc.), then safely parses the result.
 * 
 * @param inputString - The string to clean and parse, which may contain JSON in various formats
 * @param logErrors - If true, parsing errors will be logged to console (default: false)
 * @returns The parsed object of type T, or null if cleaning/parsing fails
 * 
 * @example
 * // Parse double-escaped JSON
 * const result = CleanAndParseJSON<{name: string}>('{\\"name\\": \\"test\\"}', true);
 * // Returns: {name: "test"}
 * 
 * @example
 * // Parse JSON from markdown
 * const data = CleanAndParseJSON<{id: number}>('```json\n{"id": 123}\n```', false);
 * // Returns: {id: 123}
 * 
 * @example
 * // Parse complex AI response with type safety
 * interface AIResponse {
 *   status: string;
 *   data: any;
 * }
 * const response = CleanAndParseJSON<AIResponse>(aiOutput, true);
 * // Returns typed object or null
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CleanAndParseJSON<T = any>(inputString: string | null, logErrors: boolean = false): T | null {
    if (!inputString) {
        return null;
    }
    const cleaned = CleanJSON(inputString);
    if (!cleaned) {
        return null;
    }
    return SafeJSONParse<T>(cleaned, logErrors);
}

/**
 * Cleans and extracts valid JSON from various input formats including double-escaped strings, 
 * strings with embedded JSON, and markdown code blocks.
 * 
 * This function handles multiple scenarios in the following priority order:
 * 1. **Valid JSON**: If the input is already valid JSON, it returns it formatted
 * 2. **Double-escaped JSON**: Handles strings with escaped quotes (\\") and newlines (\\n)
 * 3. **Markdown blocks**: Extracts JSON from ```json code blocks (only as last resort)
 * 4. **Mixed content**: Extracts JSON objects/arrays from strings with surrounding text
 * 
 * @param inputString - The string to process, which may contain JSON in various formats
 * @returns A formatted JSON string if valid JSON is found, otherwise null
 * 
 * @example
 * // Simple JSON
 * CleanJSON('{"name": "test"}') 
 * // Returns: '{\n  "name": "test"\n}'
 * 
 * @example
 * // Double-escaped JSON
 * CleanJSON('{\\"name\\": \\"test\\", \\"value\\": 123}')
 * // Returns: '{\n  "name": "test",\n  "value": 123\n}'
 * 
 * @example
 * // JSON with embedded markdown (preserves the markdown in string values)
 * CleanJSON('{"text": "```json\\n{\\"inner\\": true}\\n```"}')
 * // Returns: '{\n  "text": "```json\\n{\\"inner\\": true}\\n```"\n}'
 * 
 * @example
 * // Markdown block extraction (only when not valid JSON)
 * CleanJSON('Some text ```json\n{"extracted": true}\n``` more text')
 * // Returns: '{\n  "extracted": true\n}'
 */
export function CleanJSON(inputString: string | null): string | null {
    if (!inputString)
        return null;

    let processedString = inputString.trim();
    let originalException: Error | null = null;
    
    // First, try to parse the string as-is
    // This preserves any embedded JSON or markdown blocks within string values
    try {
        const parsed = JSON.parse(processedString);
        // If successful, return formatted JSON
        return JSON.stringify(parsed, null, 2);
    } catch (e) {
        // save the original exception to throw later if we can't find a path to valid JSON
        originalException = e instanceof Error ? e : new Error(String(e));

        // common JSON patterns from LLM often have extra } or missing final
        // } so let's test those two patterns quickly here and if they fail
        // then we'll continue with the rest of the logic
        if (processedString.endsWith('}')) {
            // first try to remove the last }
            const newString = processedString.slice(0, -1);
            // now try to parse again
            const result = SafeJSONParse(newString);
            if (result) { 
                return JSON.stringify(result, null, 2);
            }

            // if we get here the above didn't work so try to add
            // an extra } at the end and see if that works
            const nextString = processedString + '}';
            const nextResult = SafeJSONParse(nextString);
            if (nextResult) {
                return JSON.stringify(nextResult, null, 2);
            }
        }
    }

    // Now proceed with the extraction logic only as a last resort
    // Remove formatting newlines/tabs but preserve \n and \t inside strings
    processedString = processedString.replace(/(?<!\\)\n/g, '').replace(/(?<!\\)\t/g, '');

    // Handle double-escaped characters
    // This converts \\n to actual \n, \\" to actual ", etc.
    if (processedString.includes('\\\\') || processedString.includes('\\"')) {
        try {
            // Try to parse it as a JSON string to unescape it
            // This handles cases where the entire string is a JSON-encoded string
            processedString = JSON.parse('"' + processedString + '"');
        } catch (e) {
            // If that doesn't work, manually replace common double-escaped sequences
            processedString = processedString
                .replace(/\\\\n/g, '\n')     // \\n -> \n
                .replace(/\\\\t/g, '\t')     // \\t -> \t
                .replace(/\\\\r/g, '\r')     // \\r -> \r
                .replace(/\\\\"/g, '"')      // \\" -> "
                .replace(/\\\\\\/g, '\\');   // \\\\ -> \\
        }
    }

    // Try to parse the processed string after unescaping
    try {
        const parsed = JSON.parse(processedString);
        // If successful, return formatted JSON
        return JSON.stringify(parsed, null, 2);
    } catch (e) {
        // If direct parsing still fails, continue with extraction logic
    }

    // Regular expression to match JavaScript code blocks within Markdown fences
    // This regex looks for ``` (including when the ` is escaped like \`)
    // optionally followed by js or javascript (case-insensitive), then captures until the closing ```
    const markdownRegex = /(?:```|\\`\\`\\`)(?:json|JSON)?\s*([\s\S]*?)(?:```|\\`\\`\\`)/gi;

    // Check if the input contains Markdown code fences for JavaScript
    const matches = Array.from(processedString.matchAll(markdownRegex));

    if (matches.length > 0) {
        // If there are matches, concatenate all captured groups (in case there are multiple code blocks)
        const extracted = matches.map(match => match[1].trim()).join('\n');
        return CleanJSON(extracted); // Recursively clean the extracted JSON
    } else {
        // If there are no Markdown code fences, we could have a string that contains JSON, or is JUST JSON
        // Attempt to extract JSON from a mixed string
        const firstBracketIndex = processedString.indexOf('[');
        const firstBraceIndex = processedString.indexOf('{');
        let startIndex = -1;
        let endIndex = -1;
    
        // Determine the starting index based on the position of the first '[' and '{'
        if ((firstBracketIndex !== -1 && firstBracketIndex < firstBraceIndex) || firstBraceIndex === -1) {
            startIndex = firstBracketIndex;
            endIndex = processedString.lastIndexOf(']');
        } else if (firstBraceIndex !== -1) {
            startIndex = firstBraceIndex;
            endIndex = processedString.lastIndexOf('}');
        }
    
        if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
            console.warn("No JSON found in the input.");
            return processedString; // Return the processed string instead of jsonString
        }
    
        const potentialJSON = processedString.substring(startIndex, endIndex + 1);
        try {
            // Parse and stringify to format the JSON nicely
            // and to validate it's indeed a valid JSON.
            const jsonObject = JSON.parse(potentialJSON);
            return JSON.stringify(jsonObject, null, 2);
        } catch (error) {
            // that was our last attempt and it failed so we need
            // to throw an exception here with the orignal exception
            throw new Error(`Failed to find a path to CleanJSON\n\n${originalException?.message}`);
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
 * Simple wrapper method to JSON.parse that catches any errors and optionally logs them to the console. 
 * This method is useful when you want to parse JSON but don't want to crash the application if the JSON is invalid.
 * 
 * @param jsonString - The JSON string to parse
 * @param logErrors - If true, parsing errors will be logged to console (default: false)
 * @returns The parsed object of type T (default: any), or null if parsing fails or input is empty
 * 
 * @example
 * // Basic usage without type
 * const data = SafeJSONParse('{"name": "test"}');
 * 
 * @example
 * // With type parameter
 * interface User { name: string; age: number; }
 * const user = SafeJSONParse<User>('{"name": "John", "age": 30}', true);
 * 
 * @example
 * // Invalid JSON returns null
 * const result = SafeJSONParse('invalid json', true); // logs error, returns null
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SafeJSONParse<T = any>(jsonString: string, logErrors: boolean = false): T | null {
    if (!jsonString) {
        return null;
    }

    try {
        return JSON.parse(jsonString) as T;
    } catch (e) {
        if (logErrors)
            console.error("Error parsing JSON string:", e);
        return null;
    }
}

/**
 * This function takes in a string of text(assuming markdown, or just newline formatted), and converts it to an HTML list. The list type can be either ordered or unordered.
 * @param htmlListType 
 * @param text 
 * @returns 
 */
export function ConvertMarkdownStringToHtmlList(htmlListType: 'Ordered' | 'Unordered', text: string): string | null {
    try {
        const listTag = htmlListType === 'Unordered' ? 'ul' : 'ol';
        if (!text.includes('\n')) {
            return text;
        }
        const listItems = text.split('\n').map(line => `<li>${line.trim().replace(/^-\s*/, '')}</li>`).join('');
        return `<${listTag}>${listItems}</${listTag}>`;
    }
    catch (e) {
        console.error("Error converting markdown string to HTML list:", e);
        return null;
    }
}






/**
* Converts a string that uses camel casing or contains consecutive uppercase letters to have spaces between words.
* For example:
* "DatabaseVersion" -> "Database Version"
* "AIAgentLearningCycle" -> "AI Agent Learning Cycle"
*/
export function convertCamelCaseToHaveSpaces(s: string): string {
    let result = '';
    for (let i = 0; i < s.length; ++i) {
       if (
          i > 0 && // Not the first character
          ((s[i] === s[i].toUpperCase() && s[i - 1] !== s[i - 1].toUpperCase()) || // Transition from lowercase to uppercase
             (s[i] === s[i].toUpperCase() && s[i - 1] === s[i - 1].toUpperCase() && // Transition within consecutive uppercase letters
             i + 1 < s.length && s[i + 1] !== s[i + 1].toUpperCase())) // Followed by a lowercase
       ) {
          result += ' ';
       }
       result += s[i];
    }
    return result;
}


/**
 * Removes all whitespace characters (spaces, tabs, newlines) from a given string.
 *
 * @param s - The input string from which to remove whitespace.
 * @returns A new string with all whitespace characters removed.
 *
 * @example
 * ```typescript
 * stripWhitespace("  Hello   World  "); // "HelloWorld"
 * stripWhitespace("\tExample\nString "); // "ExampleString"
 * stripWhitespace(""); // ""
 * ```
 */
export function stripWhitespace(s: string): string {
    if (!s) {
        // Return the original string if it is null, undefined, or empty
        return s;
    }
    return s.replace(/\s+/g, ''); // Use \s+ for efficiency in case of consecutive whitespace
}






const __irregularPlurals: Record<string, string> = {
    child: 'children',
    person: 'people',
    mouse: 'mice',
    foot: 'feet',
    tooth: 'teeth',
    goose: 'geese',
    man: 'men',
    woman: 'women',
    ox: 'oxen',
    cactus: 'cacti',
    focus: 'foci',
    fungus: 'fungi',
    nucleus: 'nuclei',
    syllabus: 'syllabi',
    analysis: 'analyses',
    diagnosis: 'diagnoses',
    thesis: 'theses',
    crisis: 'crises',
    phenomenon: 'phenomena',
    criterion: 'criteria',
    datum: 'data',
    appendix: 'appendices',
    index: 'indices',
    matrix: 'matrices',
    vertex: 'vertices',
    vortex: 'vortices',
    radius: 'radii',
    corpus: 'corpora',
    genus: 'genera',
    locus: 'loci',
    alga: 'algae',
    antenna: 'antennae',
    formula: 'formulae',
    nebula: 'nebulae',
    vertebra: 'vertebrae',
    memorandum: 'memoranda',
    medium: 'media',
    bacterium: 'bacteria',
    curriculum: 'curricula',
    referendum: 'referenda',
    stimulus: 'stimuli',
    automaton: 'automata',
    beau: 'beaux',
    bureau: 'bureaux',
    tableau: 'tableaux',
    cherub: 'cherubim',
    seraph: 'seraphim',
    elf: 'elves',
    calf: 'calves',
    half: 'halves',
    knife: 'knives',
    leaf: 'leaves',
    life: 'lives',
    loaf: 'loaves',
    scarf: 'scarves',
    self: 'selves',
    sheaf: 'sheaves',
    shelf: 'shelves',
    thief: 'thieves',
    wife: 'wives',
    wolf: 'wolves',
};

/**
 * Retrieves the plural form of a word if it is an irregular plural.
 * 
 * @param singularName - The singular form of the word to check.
 * @returns The irregular plural form if found, or `null` if not found.
 * 
 * @example
 * ```typescript
 * getIrregularPlural('child'); // returns 'children'
 * getIrregularPlural('dog'); // returns null
 * ```
 */
export function getIrregularPlural(singularName: string): string | null {
    return __irregularPlurals[singularName.toLowerCase()] || null;
}

/**
 * Attempts to return a singular form of a given word, assuming it is already plural by reversing common pluralization rules.
 * 
 * @param word - The word to check.
 * @returns The singular form if detected, otherwise the original word since it would be assumed the original word is in fact singular
 */
function getSingularForm(word: string): string | null {
    const lowerWord = word.toLowerCase();

    // Reverse lookup from __irregularPlurals values to keys
    const singularFromIrregular = Object.entries(__irregularPlurals).find(
        ([singular, plural]) => plural === lowerWord
    );
    if (singularFromIrregular) {
        return singularFromIrregular[0]; // Return the singular form
    }

    // Detect regular plural forms
    if (lowerWord.endsWith('ies')) {
        return lowerWord.slice(0, -3) + 'y'; // "parties" -> "party"
    }

    if (/(s|ch|sh|x|z)es$/.test(lowerWord)) { // checks to see if the word ends with 'es'
        return lowerWord.slice(0, -2); // "boxes" -> "box"
    }

    if (lowerWord.endsWith('s') && !lowerWord.endsWith('ss')) {
        return lowerWord.slice(0, -1); // "dogs" -> "dog"
    }

    // if we get here, we return the word itself, because none of the reversals we
    // did above yielded anything, so it means that to best of this simplistic
    // algo's ability, we believe word is ALREADY plural
    return word;
}


/**
 * Converts a singular word to its plural form, handling common pluralization rules 
 * and irregular plurals.
 * 
 * @param singularName - The singular form of the word to pluralize.
 * @returns The plural form of the word.
 * 
 * @example
 * ```typescript
 * generatePluralName('child'); // returns 'children'
 * generatePluralName('box'); // returns 'boxes'
 * generatePluralName('party'); // returns 'parties'
 * generatePluralName('dog'); // returns 'dogs'
 * ```
 */
export function generatePluralName(singularName: string, options? : { capitalizeFirstLetterOnly?: boolean, capitalizeEntireWord?: boolean }): string {
    // Check if it's already plural
    const detectedSingular = getSingularForm(singularName);
    if (!detectedSingular) {
        // if we did NOT find a singular, assume it is already plural
        return adjustCasing(singularName, options); 
    }
    else if (detectedSingular.trim().toLowerCase() !== singularName.trim().toLowerCase()) {
        // here we did detect a singular form. Check to see if it is DIFFERENT from
        // the provided value. Because we're supposed to be provided a singular to this
        // function if we are given a plural - like Customers - we want to just throw it back
        // but if we were passed a true singular, then we keep on going
        return adjustCasing(singularName, options);
    }

    // Check for irregular plurals
    const irregularPlural = getIrregularPlural(singularName);
    if (irregularPlural) {
        return adjustCasing(irregularPlural, options);
    }

    // Handle common pluralization rules
    if (singularName.endsWith('y') && singularName.length > 1) {
        const secondLastChar = singularName[singularName.length - 2].toLowerCase();
        if ('aeiou'.includes(secondLastChar)) {
            // Ends with a vowel + y, just add 's'
            return adjustCasing(singularName + 's', options);
        } else {
            // Ends with a consonant + y, replace 'y' with 'ies'
            return adjustCasing(singularName.slice(0, -1) + 'ies', options);
        }
    }

    if (/(s|ch|sh|x|z)$/.test(singularName)) {
        // Ends with 's', 'ch', 'sh', 'x', or 'z', add 'es'
        return adjustCasing(singularName + 'es', options);
    }

    // Default case: Add 's' to the singular name
    return adjustCasing(singularName + 's', options);
}

/**
 * Utility method that will adjust the casing of a word based on the options provided. The options object can have two properties:
 * * capitalizeFirstLetterOnly: If true, only the first letter of the word will be capitalized, and the rest will be lower case.
 * * capitalizeEntireWord: If true, the entire word will be capitalized.
 * @param word 
 * @param options 
 * @returns 
 */
export function adjustCasing(word: string, options?: { 
    capitalizeFirstLetterOnly?: boolean, 
    capitalizeEntireWord?: boolean
    forceRestOfWordLowerCase?: boolean }): string {
    if (word && word.length > 0 && options) {
        if (options.capitalizeEntireWord) {
            return word.toUpperCase();
        }
        else if (options.capitalizeFirstLetterOnly) {   
            if (options.forceRestOfWordLowerCase) {
                // make the first character upper case and rest lower case
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            else {
                // make the first character upper case and leave the rest as is
                return word.charAt(0).toUpperCase() + word.slice(1);
            }
        }
        else {
            // no changes requested, do nothing
            return word;
        }
    }
    else {
        return word; //return whatever it is, blank string, null, or undefined, but no changes
    }
}



/**
 * Removes trailing characters from a string if they match the specified substring.
 *
 * @param s - The input string from which trailing characters should be stripped.
 * @param charsToStrip - The substring to remove if it appears at the end of the input string.
 * @param skipIfExactMatch - If `true`, does not strip the trailing characters when the string is exactly equal to `charsToStrip`.
 * @returns The modified string with trailing characters stripped, or the original string if no match is found.
 *
 * @example
 * ```typescript
 * stripTrailingChars("example.txt", ".txt", false); // "example"
 * stripTrailingChars("example.txt", ".txt", true);  // "example"
 * stripTrailingChars("file.txt", "txt", false);     // "file.txt" (no match)
 * stripTrailingChars(".txt", ".txt", true);         // ".txt" (exact match, not stripped)
 * ```
 */
export function stripTrailingChars(s: string, charsToStrip: string, skipIfExactMatch: boolean): string {
    if (!s || !charsToStrip) {
        // Return the original string if either input is empty
        return s;
    }

    const shouldStrip =
        s.endsWith(charsToStrip) &&
        (!skipIfExactMatch || s !== charsToStrip);

    if (shouldStrip) {
        return s.substring(0, s.length - charsToStrip.length);
    }

    return s;
}


/**
 * Recursively removes all spaces from a given string.
 *
 * @param s - The input string from which to remove all spaces.
 * @returns A new string with all spaces removed.
 *
 * @example
 * ```typescript
 * replaceAllSpaces("Hello World");       // "HelloWorld"
 * replaceAllSpaces("  Leading spaces"); // "Leadingspaces"
 * replaceAllSpaces("Trailing spaces  "); // "Trailingspaces"
 * replaceAllSpaces("NoSpacesHere");     // "NoSpacesHere"
 * replaceAllSpaces("");                 // ""
 * ```
 */
export function replaceAllSpaces(s: string): string {
    if (!s) {
        // Handle null, undefined, or empty string cases
        return s;
    }

    if (s.includes(' ')) {
        // Recursive case: Replace a single space and call the function again
        return replaceAllSpaces(s.replace(' ', ''));
    }

    // Base case: No spaces left to replace
    return s;
}
 
/**
 * This utility function sends a message to all components that are listening requesting a window resize. This is a cross-platform method of requesting a resize and is loosely coupled from
 * the actual implementation on a specific device/browser/etc.
 * @param delay 
 * @param component 
 */
export function InvokeManualResize(delay: number = 50, component: IMJComponent | null = null) {
    setTimeout(() => {
      MJGlobal.Instance.RaiseEvent({
        event: MJEventType.ManualResizeRequest,
        eventCode: '',
        args: null,
        component: component!
      })
    }, delay ); // give the tabstrip time to render
}

/**
 * Generates a version 4 UUID (Universally Unique Identifier) using the uuid library.
 * @returns the generated UUID as a string.
 */
export function uuidv4(): string {
    return v4();
}


/**
 * Compares two strings line by line and logs the differences to the console.
 * This function is useful for debugging purposes to identify discrepancies between two text inputs.
 * It will print the total number of lines in each string, and for each line that differs,
 * it will log the line number, the content of each line, and the first character difference
 * along with its position and character codes.
 * @param str1 
 * @param str2 
 * @returns An array of strings representing the differences found between the two input strings. If array is empty, it means no differences were found.
 */
export function compareStringsByLine(str1: string, str2: string, logToConsole: boolean = true): string[] {
    const lines1 = str1.split('\n');
    const lines2 = str2.split('\n');
    const maxLines = Math.max(lines1.length, lines2.length);
    const returnArray: string[] = [];
    function emit (message: string) {
        if (logToConsole) {
            console.log(message);
        }
        returnArray.push(message);
    }

    if (lines1.length !== lines2.length) {
        emit(`Total lines: ${lines1.length} vs ${lines2.length}`);
    }

    for (let i = 0; i < maxLines; i++) {
        const line1 = lines1[i] || '';
        const line2 = lines2[i] || '';

        if (line1 !== line2) {
            emit(`\n🔴 Difference at line ${i + 1}:`);
            emit(`Line 1: "${line1}"`);
            emit(`Line 2: "${line2}"`);

            // Find exact character difference within the line
            for (let j = 0; j < Math.max(line1.length, line2.length); j++) {
                if (line1[j] !== line2[j]) {
                    emit(`  First diff at column ${j + 1}:`);
                    emit(`  Char 1: "${line1[j]}" (code: ${line1.charCodeAt(j) || 'undefined'})`);
                    emit(`  Char 2: "${line2[j]}" (code: ${line2.charCodeAt(j) || 'undefined'})`);
                    emit(`  Context: "${line1.substring(Math.max(0, j - 10), j + 10)}"`);
                    break;
                }
            }

            // Show first few differences only to avoid spam
            if (i > 5) {
                emit(`\n... and ${maxLines - i - 1} more lines with differences`);
                break;
            }
        }
    }
    return returnArray;
}







 
/**
 * Options for the ParseJSONRecursive function
 */
export interface ParseJSONOptions {
  /** Maximum recursion depth to prevent infinite loops (default: 100) */
  maxDepth?: number;
  /** If true, extracts embedded JSON from strings and places it in a separate key with '_' suffix (default: false) */
  extractInlineJson?: boolean;
  /** If true, enables debug logging to console (default: false) */
  debug?: boolean;
}

/**
 * Internal options for the ParseJSONRecursive function
 * This interface extends the public options with internal tracking fields
 */
interface InternalParseJSONOptions {
  /** Public options */
  options: ParseJSONOptions;
  /** Current depth level (used for recursion tracking) */
  currentDepth: number;
  /** Set to track objects we've already processed to prevent circular references */
  processedObjects: WeakSet<object>;
  /** Set to track JSON strings we've already parsed to prevent infinite loops */
  processedStrings: Set<string>;
  /** Current path for debugging */
  currentPath: string;
}

/**
 * Recursively parse JSON strings within an object/array structure.
 * This function will traverse through objects and arrays, attempting to parse
 * any string values as JSON. If parsing succeeds, it continues recursively.
 * This is particularly useful for handling deeply nested JSON structures
 * where JSON is stored as strings within other JSON objects.
 * 
 * The function makes no assumptions about property names - it will attempt
 * to parse any string value it encounters, regardless of the key name.
 * 
 * @param obj The object to process
 * @param options Configuration options for parsing
 * @returns The object with all JSON strings parsed
 * 
 * @example
 * const input = {
 *   data: '{"nested": "{\\"deeply\\": \\"nested\\"}"}',
 *   payload: '{"foo": "bar"}',
 *   someOtherProp: '["a", "b", "c"]'
 * };
 * const output = ParseJSONRecursive(input);
 * // Returns: { 
 * //   data: { nested: { deeply: "nested" } },
 * //   payload: { foo: "bar" },
 * //   someOtherProp: ["a", "b", "c"]
 * // }
 * 
 * @example with options
 * const input = {
 *   content: 'Action results:\n[{"action": "test"}]'
 * };
 * const output = ParseJSONRecursive(input, { extractInlineJson: true, maxDepth: 50 });
 * // Returns: {
 * //   content: "Action results:",
 * //   content_: [{ action: "test" }]
 * // }
 */ 
export function ParseJSONRecursive(obj: any, options: ParseJSONOptions = {}): any {
  // Set default options with more conservative depth limit for performance
  const opts: Required<ParseJSONOptions> = {
    maxDepth: options.maxDepth ?? 100,
    extractInlineJson: options.extractInlineJson ?? false,
    debug: options.debug ?? false
  };

  // Start recursive parsing with depth 0
  return parseJSONRecursiveWithDepth(obj, opts, 0, 'root');
}

function parseJSONRecursiveWithDepth(obj: any, options: Required<ParseJSONOptions>, depth: number, path: string): any {
  // Check depth limit
  if (depth >= options.maxDepth) {
    if (options.debug) {
      console.warn(`[ParseJSONRecursive] Maximum depth of ${options.maxDepth} reached at path: ${path}`);
    }
    return obj;
  }

  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle non-objects
  if (typeof obj !== 'object') {
    return obj;
  }

  // Use recursiveReplaceKey which handles all types
  return recursiveReplaceKey(obj, options, depth, path);
}

function recursiveReplaceKey(value: any, options: Required<ParseJSONOptions>, depth: number, path: string): any {
  if (options.debug) {
    console.log(`[ParseJSONRecursive] Depth: ${depth}, Path: ${path}, Type: ${typeof value}${Array.isArray(value) ? ' (array)' : ''}`);
  }

  if (typeof value === 'string') {
    return recursiveReplaceString(value, options, depth, path);
  }
  else if (Array.isArray(value)) {
    // Create a new array instead of modifying the original
    const newArray = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      newArray[i] = recursiveReplaceKey(value[i], options, depth + 1, `${path}[${i}]`);
    }
    return newArray;
  }
  else if (typeof value === 'object' && value !== null) {
    // Create a new object instead of modifying the original
    const result: any = {};
    const keys = Object.keys(value);
    
    for (const key of keys) {
      if (options.debug) {
        console.log(`[ParseJSONRecursive] Processing key: ${key} at path: ${path}.${key}`);
      }
      result[key] = recursiveReplaceKey(value[key], options, depth + 1, `${path}.${key}`);
    }
    return result;
  }
  else {
    return value; // return as-is for non-string, non-array, and non-object types
  }
}

/**
 * Checks if two dates differ only by a timezone-like shift.
 * Returns true if the difference is EXACTLY a whole number of hours
 * (no variance in minutes/seconds/milliseconds) and within 23 hours.
 * This helps detect timezone interpretation issues with datetime/datetime2 fields
 * that don't store timezone information.
 *
 * @param date1 - The first date to compare
 * @param date2 - The second date to compare
 * @returns true if the dates differ only by a whole-hour timezone shift (1-23 hours)
 *
 * @example
 * // 6-hour timezone shift - returns true
 * IsOnlyTimezoneShift(new Date('2025-12-25T10:30:45.123Z'), new Date('2025-12-25T16:30:45.123Z'));
 *
 * @example
 * // Different by 1ms - returns false (real change)
 * IsOnlyTimezoneShift(new Date('2025-12-25T10:30:45.123Z'), new Date('2025-12-25T16:30:45.124Z'));
 */
export function IsOnlyTimezoneShift(date1: Date, date2: Date): boolean {
  const diffMs = Math.abs(date1.getTime() - date2.getTime());

  // Check if difference is exactly a whole number of hours
  const msPerHour = 1000 * 60 * 60;
  const isExactHours = diffMs % msPerHour === 0;

  if (!isExactHours) return false;

  // Check if within reasonable timezone range (1-23 hours)
  const hoursDiff = diffMs / msPerHour;
  return hoursDiff >= 1 && hoursDiff <= 23;
}

function recursiveReplaceString(str: string, options: Required<ParseJSONOptions>, depth: number, path: string): any {
  if (options.debug) {
    console.log(`[ParseJSONRecursive] String preview: ${str.substring(0, 100)}${str.length > 100 ? '...' : ''}`);
  }

  // PERFORMANCE OPTIMIZATION: Early exit for non-JSON strings
  // Check if the first non-whitespace character is { or [ - if not, it's definitely not JSON
  const trimmed = str.trim();
  if (trimmed.length === 0 || (trimmed[0] !== '{' && trimmed[0] !== '[' && trimmed[0] !== '"')) {
    // Not JSON-like, skip expensive JSON.parse() attempt unless extractInlineJson is enabled
    if (!options.extractInlineJson) {
      return str;
    }
    // With extractInlineJson, we still need to check for embedded JSON, but skip the initial parse
  } else {
    // Looks JSON-like, attempt to parse
    try {
      const parsed = JSON.parse(str);
      
      // Check if parsing returned the same value (e.g., JSON.parse('"user"') === "user")
      if (parsed === str) {
        if (options.debug) {
          console.log(`[ParseJSONRecursive] JSON.parse returned same value at path: ${path}, stopping`);
        }
        return str;
      }

      if (parsed && typeof parsed === 'object') {
        if (options.debug) {
          console.log(`[ParseJSONRecursive] Successfully parsed JSON at path: ${path}`);
        }
        return parseJSONRecursiveWithDepth(parsed, options, depth + 1, `${path}[parsed-json]`);
      } else {
        return parsed; // Keep simple values as-is
      }
    } catch (e) {
      // JSON.parse failed, continue to inline extraction if enabled
    }
  }

  // Handle extractInlineJson or return original string
  if (options?.extractInlineJson) {
      // Look for JSON patterns within the string
      // First try ```json blocks
      const codeBlockMatch = str.match(/```json\s*\n([\s\S]*?)\n```/);
      if (codeBlockMatch) {
        try {
          const parsedJson = JSON.parse(codeBlockMatch[1]);
          return {
            text: str.replace(codeBlockMatch[0], '').trim(),
            json: parseJSONRecursiveWithDepth(parsedJson, options, depth + 1, `${path}[embedded-json]`)
          };
        } catch (e) {
          // If parsing fails, continue
        }
      }

      // Simple approach: find first { or [ and try to parse from there
      const jsonStartIndex = str.search(/[{\[]/);
      if (jsonStartIndex !== -1) {
        // Try to parse from the JSON start to the end of string
        const possibleJson = str.substring(jsonStartIndex);
        try {
          const parsedJson = JSON.parse(possibleJson);
          const textBefore = str.substring(0, jsonStartIndex).trim();
          return {
            text: textBefore || undefined,
            json: parseJSONRecursiveWithDepth(parsedJson, options, depth + 1, `${path}[embedded-json]`)
          };
        } catch (e) {
          // JSON.parse failed, the string doesn't contain valid JSON
        }
      }
  }
  
  // If we get here, return the original string
  return str;
}

