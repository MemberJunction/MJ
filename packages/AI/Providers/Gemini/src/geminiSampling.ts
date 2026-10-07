/**
 * @fileoverview Which Gemini models still take custom sampling fields on `generateContent`.
 *
 * Since Gemini 3.6 Flash, Google pins `temperature`, `topP` and `topK` to its defaults and ignores
 * custom values; upcoming models reject the fields with 400 INVALID_ARGUMENT. Models before 3.6
 * still honor them, so they keep receiving them and their output does not change.
 *
 * The rule is read from the version in the model id, not from a per-model list, so a newly released
 * model needs no code change. A Gemini id with no version (a `-latest` alias, a future naming
 * scheme) is treated as a current model and gets no sampling fields, because that is the request
 * shape that cannot hard-fail. Ids that are not Gemini models at all (Gemma, served through
 * VertexLLM) are outside this deprecation and keep their sampling fields.
 *
 * @module @memberjunction/ai-gemini
 * @author MemberJunction.com
 */

/**
 * The version in a Gemini model id (`gemini-2.5-flash` → 2.5, `gemini-3-pro-preview` → 3.0), or
 * `undefined` when the id carries none (`gemini-flash-latest`, `gemini-exp-1206`).
 */
export function ParseGeminiVersion(modelName: string): { Major: number; Minor: number } | undefined {
    const match = /gemini-(\d+)(?:\.(\d+))?(?=[.\-]|$)/i.exec(modelName);
    if (!match) {
        return undefined;
    }
    return { Major: parseInt(match[1], 10), Minor: match[2] ? parseInt(match[2], 10) : 0 };
}

/**
 * True for models before Gemini 3.6, which still honor custom `temperature` / `topP` / `topK`, and
 * for non-Gemini models (Gemma). False for Gemini 3.6+ and for Gemini ids with no version.
 */
export function AcceptsCustomSampling(modelName: string): boolean {
    if (!/gemini/i.test(modelName)) {
        return true;
    }
    const version = ParseGeminiVersion(modelName);
    if (!version) {
        return false;
    }
    return version.Major < 3 || (version.Major === 3 && version.Minor < 6);
}
