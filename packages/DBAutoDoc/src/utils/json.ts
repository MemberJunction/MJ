/**
 * JSON utilities — DBAutoDoc-local, no external dependencies.
 *
 * Faithful port of @memberjunction/global's CleanAndParseJSON / CleanJSON /
 * SafeJSONParse so DBAutoDoc runs standalone without depending on
 * @memberjunction/global. Preserves the multi-stage fallback chain MJ uses
 * to handle real-world LLM output:
 *   1. Try direct JSON.parse
 *   2. Try removing or adding a trailing `}` (common LLM truncation/over-close artifact)
 *   3. Strip non-escaped newlines/tabs
 *   4. Undo double-escaped sequences (\\n, \\", etc.)
 *   5. Try JSON.parse again
 *   6. Extract from ``` ... ``` markdown fences (recursive)
 *   7. Fall back to balanced-{...}/[...] extraction from mixed prose
 *
 * Behavior must match MJ exactly so PromptEngine / LLMSanityChecker /
 * LLMDiscoveryValidator (which currently rely on this fallback chain) keep
 * working on the same LLM responses they handle today.
 */

/**
 * Strip optional markdown code fences, run the multi-stage cleanup pipeline,
 * and parse the resulting JSON.
 *
 * @param inputString  Raw string possibly wrapped in code fences, double-escaped,
 *                     or mixed with explanatory prose.
 * @param logErrors    When true, parse errors are logged to console (default false).
 * @returns Parsed value cast to `T`, or `null` on parse failure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanAndParseJSON<T = any>(inputString: string | null, logErrors = false): T | null {
    if (!inputString) return null;
    const cleaned = cleanJSON(inputString);
    if (!cleaned) return null;
    return safeJSONParse<T>(cleaned, logErrors);
}

/**
 * Extract a valid-JSON string from arbitrary input. Returns null if no usable
 * JSON can be salvaged. Behavior matches @memberjunction/global's CleanJSON.
 */
export function cleanJSON(inputString: string | null): string | null {
    if (!inputString) return null;

    let processedString = inputString.trim();
    let originalException: Error | null = null;

    // 1. Try parsing as-is. Preserves any embedded JSON or markdown inside string values.
    try {
        const parsed = JSON.parse(processedString);
        return JSON.stringify(parsed, null, 2);
    } catch (e) {
        originalException = e instanceof Error ? e : new Error(String(e));

        // 2. Common LLM artifacts: extra trailing `}` or missing final `}`.
        if (processedString.endsWith('}')) {
            const withoutLast = processedString.slice(0, -1);
            const withoutLastResult = safeJSONParse(withoutLast);
            if (withoutLastResult) return JSON.stringify(withoutLastResult, null, 2);

            const withExtra = processedString + '}';
            const withExtraResult = safeJSONParse(withExtra);
            if (withExtraResult) return JSON.stringify(withExtraResult, null, 2);
        }
    }

    // 3. Strip formatting newlines/tabs — but preserve \n and \t inside string values.
    processedString = processedString.replace(/(?<!\\)\n/g, '').replace(/(?<!\\)\t/g, '');

    // 4. Undo double-escaped sequences (\\n → \n, \\" → ", etc.).
    if (processedString.includes('\\\\') || processedString.includes('\\"')) {
        try {
            processedString = JSON.parse('"' + processedString + '"');
        } catch {
            processedString = processedString
                .replace(/\\\\n/g, '\n')
                .replace(/\\\\t/g, '\t')
                .replace(/\\\\r/g, '\r')
                .replace(/\\\\"/g, '"')
                .replace(/\\\\\\/g, '\\');
        }
    }

    // 5. Try again after unescaping.
    try {
        const parsed = JSON.parse(processedString);
        return JSON.stringify(parsed, null, 2);
    } catch {
        // fall through to extraction logic
    }

    // 6. Pull JSON from ``` ... ``` markdown fences (json/JSON tag optional, also handles \` escapes).
    const markdownRegex = /(?:```|\\`\\`\\`)(?:json|JSON)?\s*([\s\S]*?)(?:```|\\`\\`\\`)/gi;
    const matches = Array.from(processedString.matchAll(markdownRegex));
    if (matches.length > 0) {
        const extracted = matches.map((m) => m[1].trim()).join('\n');
        return cleanJSON(extracted); // recurse — extracted content may need its own cleanup
    }

    // 7. Last resort: find first `[` or `{`, take everything to the last matching close-bracket.
    const firstBracketIndex = processedString.indexOf('[');
    const firstBraceIndex = processedString.indexOf('{');
    let startIndex = -1;
    let endIndex = -1;

    if ((firstBracketIndex !== -1 && firstBracketIndex < firstBraceIndex) || firstBraceIndex === -1) {
        startIndex = firstBracketIndex;
        endIndex = processedString.lastIndexOf(']');
    } else if (firstBraceIndex !== -1) {
        startIndex = firstBraceIndex;
        endIndex = processedString.lastIndexOf('}');
    }

    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        console.warn('No JSON found in the input.');
        return processedString;
    }

    const potentialJSON = processedString.substring(startIndex, endIndex + 1);
    try {
        const jsonObject = JSON.parse(potentialJSON);
        return JSON.stringify(jsonObject, null, 2);
    } catch {
        // All paths exhausted — throw with the original message preserved.
        throw new Error(`Failed to find a path to CleanJSON\n\n${originalException?.message}`);
    }
}

/**
 * Safe wrapper around JSON.parse. Catches errors; optionally logs them.
 * Matches @memberjunction/global's SafeJSONParse.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeJSONParse<T = any>(jsonString: string, logErrors = false): T | null {
    if (!jsonString) return null;
    try {
        return JSON.parse(jsonString) as T;
    } catch (e) {
        if (logErrors) console.error('Error parsing JSON string:', e);
        return null;
    }
}
