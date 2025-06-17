import { MJGlobal } from ".";
import { MJEventType } from "./interface";
import { v4 } from 'uuid';

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
export function SafeJSONParse<T>(jsonString: string, logErrors: boolean = false): T {
    try {
        return <T>JSON.parse(jsonString);
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
export function ConvertMarkdownStringToHtmlList(htmlListType: 'Ordered' | 'Unordered', text: string): string {
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
export function InvokeManualResize(delay: number = 50, component: any = null) {
    setTimeout(() => {
      MJGlobal.Instance.RaiseEvent({
        event: MJEventType.ManualResizeRequest,
        eventCode: '',
        args: null,
        component: component || this
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