/**
 * The single normalizer for open-JSON turn-detection blocks (cascade layers and the driver's
 * `turnDetection` session-bag key).
 *
 * DEPENDENCY-FREE BY DESIGN — type-only imports, and it must stay so: provider unit tests mock
 * `@memberjunction/ai` wholesale and load this file from source, so a runtime import here would
 * cascade into the other mocked packages (same constraint as `realtimeUsage.ts`).
 */
import type { RealtimeTurnCoverage, RealtimeTurnDetectionMode, RealtimeTurnDetectionSettings } from './modelConfiguration';

type TurnDetectionEagerness = NonNullable<RealtimeTurnDetectionSettings['Eagerness']>;

// Exhaustive maps: `Record<Union, true>` makes the compiler reject both a missing and an extra
// literal, so the allowed values cannot drift from the types.
const TURN_DETECTION_MODES: Readonly<Record<RealtimeTurnDetectionMode, true>> = { default: true, serverVad: true, semanticVad: true, native: true };
const TURN_DETECTION_EAGERNESS: Readonly<Record<TurnDetectionEagerness, true>> = { low: true, auto: true, high: true };
const TURN_COVERAGES: Readonly<Record<RealtimeTurnCoverage, true>> = { audioActivityOnly: true, audioActivityAndAllVideo: true };

function isKeyOf<T extends string>(allowed: Readonly<Record<T, true>>, value: unknown): value is T {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(allowed, value);
}

function pickFiniteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Structurally validates an open-JSON turn-detection block into {@link RealtimeTurnDetectionSettings}:
 * only recognized, correctly-typed knobs survive. Returns `undefined` when nothing valid is present,
 * so an absent or garbage value contributes nothing (tolerant, like every other cascade input).
 * Numbers are checked for finiteness only — range policy (e.g. Threshold 0..1) belongs to the
 * driver that maps them.
 */
export function NormalizeTurnDetectionSettings(raw: unknown): RealtimeTurnDetectionSettings | undefined {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const source = raw as Record<string, unknown>;
    const result: RealtimeTurnDetectionSettings = {};
    const mode = source['Mode'];
    if (isKeyOf(TURN_DETECTION_MODES, mode)) result.Mode = mode;
    const eagerness = source['Eagerness'];
    if (isKeyOf(TURN_DETECTION_EAGERNESS, eagerness)) result.Eagerness = eagerness;
    const threshold = pickFiniteNumber(source['Threshold']);
    if (threshold !== undefined) result.Threshold = threshold;
    const silenceDurationMs = pickFiniteNumber(source['SilenceDurationMs']);
    if (silenceDurationMs !== undefined) result.SilenceDurationMs = silenceDurationMs;
    const coverage = source['Coverage'];
    if (isKeyOf(TURN_COVERAGES, coverage)) result.Coverage = coverage;
    return Object.keys(result).length > 0 ? result : undefined;
}
