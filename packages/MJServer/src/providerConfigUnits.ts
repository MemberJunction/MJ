/**
 * Unit-conversion seam between MJServer's configuration and SQLServerDataProvider.
 *
 * MJServer configures `databaseSettings.metadataCacheRefreshInterval` in **milliseconds**
 * (default 180000 = 3 minutes, overridable via the METADATA_CACHE_REFRESH_INTERVAL env var).
 * `SQLServerProviderConfigData`'s third constructor parameter is `checkRefreshIntervalSeconds`
 * — declared in **seconds**.
 *
 * Commit 645c5a5e8 fixed a bug where the raw millisecond value was handed straight to the
 * provider, so the "3 minute" default became a 180000-second (~50 hour) metadata cache
 * refresh cadence. This function is the single place that conversion happens; both provider
 * bootstrap call sites in `index.ts` (the main pool and the CodeGen-credentialed pool) go
 * through it, and `config-units.test.ts` pins the contract so the units can never silently
 * regress again.
 *
 * @param metadataCacheRefreshIntervalMs - the configured refresh interval, in milliseconds
 * @returns the same interval expressed in seconds, the unit `checkRefreshIntervalSeconds` declares
 */
export function MetadataCacheRefreshIntervalSeconds(metadataCacheRefreshIntervalMs: number): number {
    return metadataCacheRefreshIntervalMs / 1000;
}
