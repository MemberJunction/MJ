import { EndSensitivity, StartSensitivity, type AutomaticActivityDetection } from '@google/genai';
import type { RealtimeTurnDetectionSettings } from '@memberjunction/ai';

/** The cut between the two start-of-speech sensitivities: a threshold below it asks for a more sensitive detector. */
const START_SENSITIVITY_THRESHOLD_CUT = 0.5;

/**
 * Maps MJ's normalized turn-detection settings onto Gemini Live's `automaticActivityDetection`.
 *
 * - `SilenceDurationMs` becomes `silenceDurationMs` when it is a positive integer; anything else is dropped.
 * - `Eagerness` `'low'` / `'high'` becomes `endOfSpeechSensitivity` LOW / HIGH; `'auto'` leaves Google's default.
 * - `Threshold` in [0, 1] becomes `startOfSpeechSensitivity`. This is LOSSY: Gemini has two buckets, not a continuous
 *   level, so a value below 0.5 (a detector easy to trigger) is START HIGH and 0.5 or more is START LOW.
 *   A value outside [0, 1] is dropped.
 *
 * It never sets `disabled` (meeting mode owns that) and ignores `Mode`, which Gemini has no wire field for.
 */
export function MapGeminiActivityDetection(settings: RealtimeTurnDetectionSettings | undefined): Partial<AutomaticActivityDetection> {
    const detection: Partial<AutomaticActivityDetection> = {};
    if (settings === undefined) {
        return detection;
    }
    const { SilenceDurationMs: silence, Eagerness: eagerness, Threshold: threshold } = settings;
    if (silence !== undefined && Number.isInteger(silence) && silence > 0) {
        detection.silenceDurationMs = silence;
    }
    if (eagerness === 'low') {
        detection.endOfSpeechSensitivity = EndSensitivity.END_SENSITIVITY_LOW;
    } else if (eagerness === 'high') {
        detection.endOfSpeechSensitivity = EndSensitivity.END_SENSITIVITY_HIGH;
    }
    if (threshold !== undefined && Number.isFinite(threshold) && threshold >= 0 && threshold <= 1) {
        detection.startOfSpeechSensitivity =
            threshold < START_SENSITIVITY_THRESHOLD_CUT ? StartSensitivity.START_SENSITIVITY_HIGH : StartSensitivity.START_SENSITIVITY_LOW;
    }
    return detection;
}
