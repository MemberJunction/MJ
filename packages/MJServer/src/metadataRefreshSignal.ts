import { LogError, LogStatus } from '@memberjunction/core';

/**
 * Operator control: `kill -HUP <pid>` (or `docker kill -s HUP`, `pm2 sendSignal SIGHUP`) makes a
 * running MJAPI hard-reload its metadata from the database, without a restart and without a
 * user-facing endpoint. SIGHUP is the conventional "reload" signal; SIGUSR1 is reserved by Node
 * for the inspector.
 *
 * Only the global provider needs refreshing: per-request providers adopt the global provider's
 * metadata on every request (ProviderBase.CopyMetadataFromGlobalProvider).
 */
export const METADATA_REFRESH_SIGNAL = 'SIGHUP';

/**
 * Builds the signal handler. A signal that arrives while a refresh is still running is ignored
 * (and logged) rather than stacked, so a burst of signals cannot queue a burst of full reloads.
 * The handler never rejects — a failed refresh is logged.
 *
 * @param refresh - performs the hard reload, e.g. `() => Metadata.Provider.Refresh()`
 */
export function CreateMetadataRefreshSignalHandler(refresh: () => Promise<boolean>): () => Promise<void> {
    let inFlight = false;

    return async () => {
        if (inFlight) {
            LogStatus(`🔄 ${METADATA_REFRESH_SIGNAL} received while a metadata refresh is already running; ignored. Send it again once the current refresh finishes.`);
            return;
        }

        inFlight = true;
        LogStatus(`🔄 ${METADATA_REFRESH_SIGNAL} received, refreshing metadata from the database`);
        try {
            const ok = await refresh();
            if (ok) {
                LogStatus('✅ Metadata refreshed');
            } else {
                LogError(`❌ ${METADATA_REFRESH_SIGNAL} metadata refresh reported failure`);
            }
        } catch (err) {
            LogError(`❌ ${METADATA_REFRESH_SIGNAL} metadata refresh failed`, undefined, err);
        } finally {
            inFlight = false;
        }
    };
}
