/**
 * Shared utility for parsing JudgeFrequency strings.
 *
 * Used by both ComputerUseAction and ComputerUseTestDriver
 * to convert frequency strings from configuration/params
 * into typed JudgeFrequency instances.
 *
 * Formats: "EveryStep", "EveryNSteps:N", "OnStagnation:N"
 */

import {
    EveryStepFrequency,
    EveryNStepsFrequency,
    OnStagnationFrequency,
} from '@memberjunction/computer-use';
import type { JudgeFrequency } from '@memberjunction/computer-use';

/**
 * Parse a judge frequency string into a typed JudgeFrequency.
 *
 * Supported formats:
 * - "EveryStep" → EveryStepFrequency
 * - "EveryNSteps:5" → EveryNStepsFrequency(5)
 * - "OnStagnation:3" → OnStagnationFrequency(3)
 */
export function parseJudgeFrequency(str: string): JudgeFrequency {
    const lower = str.toLowerCase();

    if (lower.startsWith('everynsteps')) {
        const n = parseColonNumber(str, 3);
        return new EveryNStepsFrequency(n);
    }

    if (lower.startsWith('onstagnation')) {
        const threshold = parseColonNumber(str, 5);
        return new OnStagnationFrequency(threshold);
    }

    return new EveryStepFrequency();
}

/**
 * Extract the number after a colon in "Label:N" format.
 * Returns defaultValue if no colon or not a valid number.
 */
export function parseColonNumber(str: string, defaultValue: number): number {
    const colonIdx = str.indexOf(':');
    if (colonIdx < 0) return defaultValue;
    const num = Number(str.substring(colonIdx + 1).trim());
    return isNaN(num) || num <= 0 ? defaultValue : num;
}
