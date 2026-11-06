/**
 * @fileoverview How a Gemini model is told how much to think, given MJ's `effortLevel`.
 *
 * MJ's effort is a number from 1 to 100 or a level name. Gemini takes one of two settings,
 * depending on the model's generation:
 *
 * - **`thinkingLevel`** (`LOW` / `MEDIUM` / `HIGH`, and `MINIMAL` on some models) for Gemini 3 and
 *   later, and for Gemini ids with no version (`gemini-flash-latest`). Upcoming models reject
 *   `thinkingBudget` with a 400, so these never get one.
 * - **`thinkingBudget`** (a token count) for Gemini 2.5, which predates thinking levels.
 *
 * Earlier models (2.0, 1.5) do not think, and non-Gemini ids served through VertexLLM (Gemma) are
 * outside this scheme; both get no thinking setting.
 *
 * Numbers use the bands MJ's other drivers use (OpenAI, Groq, Cerebras): 1–33 low, 34–66 medium,
 * 67–100 high. A number never maps to `MINIMAL`: several models reject it (Gemini 3.8 Flash accepts
 * only low, medium and high), so it is reached only by naming it. No effort at all means no thinking
 * setting, so the model thinks at its own default.
 *
 * @module @memberjunction/ai-gemini
 * @author MemberJunction.com
 */
import { ThinkingLevel } from '@google/genai';
import type { ThinkingConfig } from '@google/genai';
import { ParseGeminiVersion } from './geminiSampling';

/** The thinking levels MJ sends; a subset of the SDK's `ThinkingLevel`. */
export type GeminiThinkingLevel = ThinkingLevel.MINIMAL | ThinkingLevel.LOW | ThinkingLevel.MEDIUM | ThinkingLevel.HIGH;

/** Which thinking setting a model takes: a level, a token budget, or none at all. */
export type GeminiThinkingControl = 'level' | 'budget' | 'none';

/** The result of resolving an effort for a model: the config to send, or why none is sent. */
export interface GeminiThinkingResolution {
    /** The `thinkingConfig` to put on the request; absent when none should be sent. */
    Config?: ThinkingConfig;
    /** Why an effort that was set is not sent, for a one-time warning; absent when there is nothing to report. */
    Ignored?: string;
}

/**
 * Token budgets for Gemini 2.5, by level. 512 is the lowest value every 2.5 model accepts (Flash-Lite's
 * floor; Pro cannot turn thinking off), and 24576 is the highest Flash and Flash-Lite accept.
 */
const THINKING_BUDGET_BY_LEVEL: Record<GeminiThinkingLevel, number> = {
    [ThinkingLevel.MINIMAL]: 512,
    [ThinkingLevel.LOW]: 1024,
    [ThinkingLevel.MEDIUM]: 8192,
    [ThinkingLevel.HIGH]: 24576,
};

/**
 * Level names accepted in place of a number. `none` and `xhigh` / `max` are other vendors' words for
 * the ends of the scale; `effortLevel` is not scoped per vendor, so failover can deliver them here.
 */
const NAMED_LEVELS: Record<string, GeminiThinkingLevel> = {
    none: ThinkingLevel.MINIMAL,
    minimal: ThinkingLevel.MINIMAL,
    low: ThinkingLevel.LOW,
    medium: ThinkingLevel.MEDIUM,
    high: ThinkingLevel.HIGH,
    xhigh: ThinkingLevel.HIGH,
    max: ThinkingLevel.HIGH,
};

/**
 * The thinking level for an MJ effort: a number from 1 to 100, or a level name. `undefined` for an
 * absent, blank or unrecognized value.
 */
export function EffortToThinkingLevel(effortLevel: string | null | undefined): GeminiThinkingLevel | undefined {
    const raw = effortLevel?.trim().toLowerCase();
    if (!raw) {
        return undefined;
    }
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
        const value = Number(raw);
        if (value <= 33) return ThinkingLevel.LOW;
        if (value <= 66) return ThinkingLevel.MEDIUM;
        return ThinkingLevel.HIGH;
    }
    return NAMED_LEVELS[raw];
}

/** Which thinking setting a model takes, read from the version in its id. */
export function GeminiThinkingControlFor(modelName: string): GeminiThinkingControl {
    if (!/gemini/i.test(modelName)) {
        return 'none';
    }
    const version = ParseGeminiVersion(modelName);
    if (!version || version.Major >= 3) {
        return 'level';
    }
    return version.Major === 2 && version.Minor >= 5 ? 'budget' : 'none';
}

/**
 * What to send instead when a model rejects a thinking setting: `LOW` for a rejected `MINIMAL` (the
 * nearest level models without `MINIMAL` accept, such as Gemini 3.8 Flash), otherwise no thinking
 * setting at all.
 */
export function GeminiThinkingFallback(rejected: ThinkingConfig): ThinkingConfig | undefined {
    return rejected.thinkingLevel === ThinkingLevel.MINIMAL ? { ...rejected, thinkingLevel: ThinkingLevel.LOW } : undefined;
}

/**
 * The `thinkingConfig` to send for a model and an MJ effort. Thought summaries are requested
 * whenever a thinking setting is sent, so the response carries the model's reasoning.
 */
export function ResolveGeminiThinkingConfig(modelName: string, effortLevel: string | null | undefined): GeminiThinkingResolution {
    if (effortLevel == null || effortLevel.trim() === '') {
        return {};
    }
    const level = EffortToThinkingLevel(effortLevel);
    if (!level) {
        return { Ignored: `effortLevel '${effortLevel}' is not a number from 1 to 100 or a level name (${Object.keys(NAMED_LEVELS).join(', ')})` };
    }
    switch (GeminiThinkingControlFor(modelName)) {
        case 'level':
            return { Config: { thinkingLevel: level, includeThoughts: true } };
        case 'budget':
            return { Config: { thinkingBudget: THINKING_BUDGET_BY_LEVEL[level], includeThoughts: true } };
        default:
            return { Ignored: `model ${modelName} does not take a thinking setting` };
    }
}
