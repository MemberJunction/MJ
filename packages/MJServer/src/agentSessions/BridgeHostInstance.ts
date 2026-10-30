import { IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { AIBridgeEngine } from '@memberjunction/ai-bridge-server';
import { GetCurrentHostInstance } from './HostInstance.js';
import { DEFAULT_BRIDGE_RECONCILER_SETTINGS, type BridgeReconcilerSettings } from '../backgroundSweepConfigUnits.js';

/**
 * Gives the realtime bridge engine (`AIBridgeEngine`) this MJAPI instance's identity, the one its agent-session rows
 * carry: `hostname:port:pid:bootId` ({@link GetCurrentHostInstance}). The engine stamps it into the `HostInstanceID`
 * of each `MJ: AI Agent Session Bridges` row it creates, and its orphan reconcile closes only the bridges an earlier
 * boot of this instance left, never another MJAPI's (#5310). Without it the engine's fallback identity applies, which
 * names this process alone, so the reconcile would never find what an earlier boot left.
 *
 * `Serve` calls it right after `SetHostInstancePort`, before anything can start a bridge: a server extension may start
 * a scheduled meeting bridge before the server listens.
 */
export function BindBridgeEngineHostInstance(): void {
    AIBridgeEngine.Instance.SetHostInstanceIdentity(GetCurrentHostInstance());
}

/**
 * Starts the realtime bridge engine's orphan reconcile: now, then every `settings.sweepIntervalMs` (10 minutes by
 * default), it closes the bridges an earlier boot of this instance left `Connecting` or `Connected` (reason `Janitor`)
 * and finalizes their co-agent runs. With `settings.enabled` false it reconciles once now and schedules no repeat, so an
 * idle server sends no periodic queries for it (`agentSessions.bridgeReconciler`; see the Serverless Database
 * Auto-Pause guide).
 *
 * `Serve` calls it once the server listens on its port, where it starts the session janitor. Holding the port is what
 * makes another boot of this instance a process that has ended; before that, an MJAPI started on a port another MJAPI
 * still serves would take that one's live bridges for its own orphans.
 *
 * @param provider The server's metadata provider, for the reads and writes.
 * @param systemUser The user the writes run as.
 * @param settings Whether to repeat the reconcile, and how often. Defaults to the shipped settings.
 */
export function StartBridgeOrphanReconciliation(
    provider: IMetadataProvider,
    systemUser: UserInfo,
    settings: BridgeReconcilerSettings = DEFAULT_BRIDGE_RECONCILER_SETTINGS,
): void {
    if (settings.enabled) {
        AIBridgeEngine.Instance.StartOrphanReconciliation(systemUser, provider, settings.sweepIntervalMs);
        return;
    }
    void AIBridgeEngine.Instance.ReconcileOrphans(systemUser, provider).catch((err) =>
        LogError(`[AIBridgeEngine] orphan reconciliation failed: ${err instanceof Error ? err.message : String(err)}`),
    );
}
