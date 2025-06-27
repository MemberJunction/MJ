/**
 * Shared utility functions for core-entity-forms
 */

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
// export function ParseJSONRecursive(obj: any, options: ParseJSONOptions = {}): any {
//   try {
//     // Set default options
//     const defaultedOptions: ParseJSONOptions = {
//       maxDepth: 100,
//       extractInlineJson: false,
//       debug: false,
//       ...options
//     };

//     // Create internal options for the recursive function
//     const internalOptions: InternalParseJSONOptions = {
//       options: defaultedOptions,
//       currentDepth: 0,
//       processedObjects: new WeakSet<object>(),
//       processedStrings: new Set<string>(),
//       currentPath: 'root'
//     };

//     // Call the internal recursive function
//     return parseJSONRecursiveInternal(obj, internalOptions);
//   } catch (error) {
//     console.error(`[ParseJSONRecursive] Error at path ${options.debug ? 'root' : ''}:`, error);
//     console.error(`[ParseJSONRecursive] Object being processed:`, obj);
//     console.error(`[ParseJSONRecursive] Options:`, options);
//     throw error; // Re-throw after logging
//   }
// }

// /**
//  * Internal recursive function that does the actual parsing
//  */
// function parseJSONRecursiveInternal(obj: any, internal: InternalParseJSONOptions): any {
//   const { options, currentDepth, processedObjects, processedStrings, currentPath } = internal;
//   const { maxDepth, extractInlineJson, debug } = options;
  
//   // Debug logging
//   if (debug) {
//     console.log(`[ParseJSONRecursive] Depth: ${currentDepth}, Path: ${currentPath}, Type: ${typeof obj}`);
//     if (typeof obj === 'string') {
//       console.log(`[ParseJSONRecursive] String preview: ${obj.substring(0, 100)}${obj.length > 100 ? '...' : ''}`);
//     }
//   }
  
//   // Check if we've exceeded max depth
//   if (currentDepth >= maxDepth!) {
//     console.warn(`ParseJSONRecursive: Maximum depth of ${maxDepth} reached at path: ${currentPath}. Stopping recursion to prevent infinite loop.`);
//     return obj;
//   }
  
//   if (obj === null || obj === undefined) {
//     return obj;
//   }
  
//   // Check for circular references for objects and arrays
//   if (typeof obj === 'object' && processedObjects.has(obj)) {
//     if (debug) {
//       console.log(`[ParseJSONRecursive] Circular reference detected at path: ${currentPath}, returning as-is`);
//     }
//     // We've already processed this object, return it as-is to prevent infinite recursion
//     return obj;
//   }
  
//   // Mark this object as being processed
//   if (typeof obj === 'object') {
//     processedObjects.add(obj);
//   }
  
//   // If it's a string, try to parse it as JSON
//   if (typeof obj === 'string') {
//     // Skip strings that are clearly not JSON (performance optimization)
//     const trimmed = obj.trim();
//     if (!trimmed) {
//       return obj;
//     }
    
//     // CRITICAL: Check if we've already tried to parse this exact string
//     // This prevents infinite loops where JSON strings contain themselves
//     // For example: {"data": "{\"data\": \"{\\\"data\\\": ...}\"}"}
//     if (processedStrings.has(trimmed)) {
//       if (debug) {
//         console.log(`[ParseJSONRecursive] String already processed at path: ${currentPath}, skipping`);
//       }
//       return obj; // Return the string as-is, don't try to parse it again
//     }
    
//     // Check if string starts with JSON-like characters
//     const firstChar = trimmed[0];
//     const lastChar = trimmed[trimmed.length - 1];
//     const isLikelyJson = (
//       (firstChar === '{' && lastChar === '}') ||
//       (firstChar === '[' && lastChar === ']')
//       // Removed the quoted string check - simple strings like "user" shouldn't be parsed
//     );
    
//     // Mark this string as being processed
//     processedStrings.add(trimmed);
    
//     // If extractInlineJson is true, look for embedded JSON within the string
//     if (extractInlineJson && !isLikelyJson) {
//       // Look for JSON patterns within the string
//       // Match JSON objects, arrays, or code blocks
//       const jsonPatterns = [
//         /```json\s*\n([\s\S]*?)\n```/,  // ```json blocks
//         /([\[{](?:[^{}[\]]*|[\[{](?:[^{}[\]]*|[\[{][^{}[\]]*[}\]])*[}\]])*[}\]])/  // Nested JSON structures
//       ];
      
//       for (const pattern of jsonPatterns) {
//         const match = obj.match(pattern);
//         if (match) {
//           const jsonStr = match[1] || match[0];
//           try {
//             const parsed = JSON.parse(jsonStr);
            
//             // Check if parsing returned the same value
//             if (parsed === jsonStr) {
//               continue; // Skip to next pattern
//             }
            
//             // Successfully parsed - return an object with the prefix text and parsed JSON
//             const matchIndex = match.index || 0;
//             const prefix = obj.substring(0, matchIndex).trim();
//             const suffix = obj.substring(matchIndex + match[0].length).trim();
            
//             // Combine prefix and suffix, removing extra whitespace
//             let textPart = prefix;
//             if (suffix) {
//               textPart = prefix ? `${prefix} ${suffix}` : suffix;
//             }
            
//             // CRITICAL: Check if the parsed object is the same as one we've already processed
//             // This can happen with self-referential JSON
//             if (typeof parsed === 'object' && parsed !== null && processedObjects.has(parsed)) {
//               return {
//                 text: textPart || undefined,
//                 json: parsed // Return as-is, don't recurse
//               };
//             }
            
//             // Recursively parse the extracted JSON
//             const recursiveInternal: InternalParseJSONOptions = {
//               options,
//               currentDepth: currentDepth + 1,
//               processedObjects,
//               processedStrings,
//               currentPath: `${currentPath}[embedded-json]`
//             };
//             const parsedJson = parseJSONRecursiveInternal(parsed, recursiveInternal);
            
//             // Return object with extracted text and JSON
//             return {
//               text: textPart || undefined,
//               json: parsedJson
//             };
//           } catch (e) {
//             // If parsing failed, continue to next pattern
//           }
//         }
//       }
//     }
    
//     if (!isLikelyJson) {
//       return obj;
//     }
    
//     try {
//       const parsed = JSON.parse(obj);
      
//       // CRITICAL: Check if parsing returned the same value (e.g., JSON.parse('"user"') === "user")
//       // This prevents infinite loops with simple JSON strings
//       if (parsed === obj) {
//         if (debug) {
//           console.log(`[ParseJSONRecursive] JSON.parse returned same value at path: ${currentPath}, stopping`);
//         }
//         return obj;
//       }
      
//       // CRITICAL: Check if the parsed object is the same as one we've already processed
//       // This can happen with self-referential JSON
//       if (typeof parsed === 'object' && parsed !== null && processedObjects.has(parsed)) {
//         return parsed; // Return as-is, don't recurse
//       }
      
//       // If parsing succeeded, recursively parse the result
//       // This is CRITICAL: the parsed result might contain more JSON strings
//       // We must continue processing the entire tree
//       const recursiveInternal: InternalParseJSONOptions = {
//         options,
//         currentDepth: currentDepth + 1,
//         processedObjects,
//         processedStrings,
//         currentPath: `${currentPath}[parsed-json]`
//       };
//       return parseJSONRecursiveInternal(parsed, recursiveInternal);
//     } catch (e) {
//       // If parsing failed, return the original string
//       return obj;
//     }
//   }
  
//   // If it's an array, process each element recursively
//   if (Array.isArray(obj)) {
//     return obj.map((item, index) => {
//       const itemPath = `${currentPath}[${index}]`;
//       const recursiveInternal: InternalParseJSONOptions = {
//         options,
//         currentDepth: currentDepth + 1,
//         processedObjects,
//         processedStrings,
//         currentPath: itemPath
//       };
//       return parseJSONRecursiveInternal(item, recursiveInternal);
//     });
//   }
  
//   // If it's an object, process each property recursively
//   if (typeof obj === 'object') {
//     const result: any = {};
//     for (const key in obj) {
//       if (obj.hasOwnProperty(key)) {
//         const keyPath = `${currentPath}.${key}`;
//         const recursiveInternal: InternalParseJSONOptions = {
//           options,
//           currentDepth: currentDepth + 1,
//           processedObjects,
//           processedStrings,
//           currentPath: keyPath
//         };
        
//         if (debug) {
//           console.log(`[ParseJSONRecursive] Processing key: ${key} at path: ${keyPath}`);
//         }
        
//         // Recursively process each value
//         const processedValue = parseJSONRecursiveInternal(obj[key], recursiveInternal);
        
//         // If extractInlineJson is true and the processed value has text and json parts
//         if (extractInlineJson && processedValue && typeof processedValue === 'object' && 
//             processedValue.hasOwnProperty('text') && processedValue.hasOwnProperty('json') &&
//             !Array.isArray(processedValue)) {
//           // Split into two keys: original key for text, key_ for JSON
//           if (processedValue.text !== undefined) {
//             result[key] = processedValue.text;
//           }
//           result[key + '_'] = processedValue.json;
          
//           if (debug) {
//             console.log(`[ParseJSONRecursive] Split key ${key} into ${key} (text) and ${key}_ (json)`);
//           }
//         } else {
//           result[key] = processedValue;
//         }
//       }
//     }
//     return result;
//   }
  
//   // For all other types (numbers, booleans, etc.), return as-is
//   return obj;
// }

// /**
//  * Alias for ParseJSONRecursive for backwards compatibility
//  * @deprecated Use ParseJSONRecursive instead
//  */
// export const parseJsonRecursively = ParseJSONRecursive;

// /**
//  * Parse specific fields in an object that are known to contain JSON strings.
//  * This is more performant than recursive parsing when you know exactly which
//  * fields need to be parsed.
//  * 
//  * @param obj The object containing the fields to parse
//  * @param fields Array of field names to parse
//  * @returns The object with specified fields parsed
//  */
// export function parseJsonFields(obj: any, fields: string[]): any {
//   if (!obj || typeof obj !== 'object') {
//     return obj;
//   }
  
//   const result = { ...obj };
  
//   for (const field of fields) {
//     if (result[field] && typeof result[field] === 'string') {
//       try {
//         result[field] = JSON.parse(result[field]);
//       } catch (e) {
//         // If parsing fails, leave the field as-is
//       }
//     }
//   }
  
//   return result;
// }


export function ParseJSONRecursive(obj: any, options: ParseJSONOptions = {}): any {
  // Set default options
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

function recursiveReplaceString(str: string, options: Required<ParseJSONOptions>, depth: number, path: string): any {
  if (options.debug) {
    console.log(`[ParseJSONRecursive] String preview: ${str.substring(0, 100)}${str.length > 100 ? '...' : ''}`);
  }

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
    // If parsing fails, leave the string as-is, this is not a failure, as we trying to parse any string above
    // however in this case we need to check for inline JSON extraction
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
    return str;
  }
}