/**
 * Defensive helper for LLM JSON responses that should be arrays.
 * 
 * LLMs sometimes return:
 * - A bare array (correct): [{...}, {...}]
 * - An object wrapping an array: {"proposals": [{...}]}
 * - A single object instead of array: {"index": 1, "action": "keep"}
 * - null/undefined on parse failure
 * 
 * This normalizes all cases to an array, logging warnings for non-standard shapes.
 */
export function ensureArray<T>(value: T | T[] | Record<string, unknown> | null | undefined, context?: string): T[] {
  if (Array.isArray(value)) return value;
  
  if (value == null) {
    console.log(`[ensureArray]${context ? ` (${context})` : ""} Received null/undefined, returning empty array`);
    return [];
  }

  if (typeof value === "object") {
    // Try to find a single array property (e.g., {"proposals": [...]})
    const arrayProps = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => Array.isArray(v));
    
    if (arrayProps.length === 1) {
      console.log(`[ensureArray]${context ? ` (${context})` : ""} Extracted array from property "${arrayProps[0][0]}" (${(arrayProps[0][1] as unknown[]).length} items)`);
      return arrayProps[0][1] as T[];
    }

    // Single object that looks like an array element (has "index" or "action")
    const obj = value as Record<string, unknown>;
    if ("index" in obj || "action" in obj || "verdict" in obj) {
      console.log(`[ensureArray]${context ? ` (${context})` : ""} Wrapped single object in array`);
      return [value as T];
    }

    console.log(`[ensureArray]${context ? ` (${context})` : ""} Unrecognized object shape, returning empty array`);
    return [];
  }

  console.log(`[ensureArray]${context ? ` (${context})` : ""} Unexpected type "${typeof value}", returning empty array`);
  return [];
}
