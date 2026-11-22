/**
 * @fileoverview Server startup / AIDP deployment wake guard lifecycle integration.
 *
 * Bridges MJServer's boot phase (`MJServerStartupState`) with `@memberjunction/ai-agents`'
 * `WakeStartupGuard` so deployment, metadata sync, and server startup initialization never emit
 * spurious or retroactive event wakes, while preserving recovery of pre-existing legitimate
 * pending coalesced routines once initialization finishes.
 *
 * @module @memberjunction/server
 */

import { WakeStartupGuard } from '@memberjunction/ai-agents';

/**
 * Arms `WakeStartupGuard` when MJServer begins startup / AIDP deployment initialization.
 */
export function BeginServerWakeStartupGuard(reason: string = 'MJServer startup initialization', now?: Date): void {
    WakeStartupGuard.Instance.BeginStartupInitialization(reason, now);
}

/**
 * Disarms `WakeStartupGuard` when MJServer reaches ready state, stamping the baseline watermark.
 */
export function CompleteServerWakeStartupGuard(now?: Date): void {
    WakeStartupGuard.Instance.CompleteStartupInitialization(now);
}

/**
 * Resets `WakeStartupGuard` to idle (primarily for test isolation).
 */
export function ResetServerWakeStartupGuard(): void {
    WakeStartupGuard.Instance.Reset();
}

/**
 * Returns the current `WakeStartupGuard` phase and baseline watermark snapshot.
 */
export function GetServerWakeStartupGuardStatus(): {
    phase: ReturnType<WakeStartupGuard['Phase']['valueOf']>;
    baselineWatermarkISO: string | null;
    isStartupInProgress: boolean;
} {
    const guard = WakeStartupGuard.Instance;
    return {
        phase: guard.Phase,
        baselineWatermarkISO: guard.BaselineWatermark ? guard.BaselineWatermark.toISOString() : null,
        isStartupInProgress: guard.IsStartupInProgress(),
    };
}
