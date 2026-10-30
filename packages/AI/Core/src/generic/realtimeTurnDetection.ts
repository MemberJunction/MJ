/**
 * @fileoverview Reads the normalized `turnDetection` config-bag value and describes the settings a driver could not apply.
 *
 * Dependency-free at runtime (its one import is a type): the server realtime drivers use it, and their tests that mock
 * `@memberjunction/ai` load the real implementation from this file, as they do `RealtimeDroppedInputReporter`.
 *
 * @module @memberjunction/ai
 */

import type { RealtimeTurnDetectionSettings } from './modelConfiguration';

/** One setting of {@link RealtimeTurnDetectionSettings}. */
export type RealtimeTurnDetectionSettingKey = keyof RealtimeTurnDetectionSettings;

/**
 * Reads the `turnDetection` config-bag value into {@link RealtimeTurnDetectionSettings}. Only recognized, correctly
 * typed settings survive, because the bag arrives through JSON layers of unknown provenance. Returns `undefined` when
 * nothing valid is present, so a missing or malformed value contributes nothing and never fails a session.
 *
 * @param raw The bag's `turnDetection` value.
 * @returns The valid settings, or `undefined` when there are none.
 */
export function ReadRealtimeTurnDetection(raw: unknown): RealtimeTurnDetectionSettings | undefined {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const source = raw as Record<string, unknown>;
    const result: RealtimeTurnDetectionSettings = {};
    const mode = source['Mode'];
    if (mode === 'default' || mode === 'serverVad' || mode === 'semanticVad' || mode === 'native') {
        result.Mode = mode;
    }
    const eagerness = source['Eagerness'];
    if (eagerness === 'low' || eagerness === 'auto' || eagerness === 'high') {
        result.Eagerness = eagerness;
    }
    const threshold = source['Threshold'];
    if (typeof threshold === 'number' && Number.isFinite(threshold)) {
        result.Threshold = threshold;
    }
    const silence = source['SilenceDurationMs'];
    if (typeof silence === 'number' && Number.isFinite(silence)) {
        result.SilenceDurationMs = silence;
    }
    const coverage = source['Coverage'];
    if (coverage === 'audioActivityOnly' || coverage === 'audioActivityAndAllVideo') {
        result.Coverage = coverage;
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Builds the launch warning for turn-detection settings a driver received but cannot send to its provider. A setting
 * that is accepted and then dropped without a word is worse than one that was never offered, so each driver names what
 * it left out.
 *
 * @param driverName The driver's log prefix, e.g. `InworldRealtime`.
 * @param requested The settings the session asked for.
 * @param unapplied The settings the driver did not send.
 * @param reason Why they were not sent, completing "not applied: ...".
 * @returns The warning line, or `undefined` when nothing was left out.
 */
export function DescribeUnappliedTurnDetection(
    driverName: string,
    requested: RealtimeTurnDetectionSettings,
    unapplied: ReadonlyArray<RealtimeTurnDetectionSettingKey>,
    reason: string,
): string | undefined {
    const named = unapplied
        .filter((key) => requested[key] !== undefined && !(key === 'Mode' && requested.Mode === 'default'))
        .map((key) => `${key}=${JSON.stringify(requested[key])}`);
    if (named.length === 0) {
        return undefined;
    }
    return `[${driverName}] Turn-detection setting(s) not applied: ${named.join(', ')} — ${reason}`;
}
