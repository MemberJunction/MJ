import { IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { CatalogWriter, PerConnectionCatalogWriter, SharedCatalogWriter } from './CatalogWriter.js';

/**
 * THE ONE PLACE that decides whether a connection reads and writes the shared integration catalog
 * or its own.
 *
 * Deliberately one place. A flag consulted in several is a flag that will eventually disagree with
 * itself, and here the two answers are not merely different — a shared write during a
 * per-connection run puts one tenant's discovery into every other tenant's catalog and reports
 * success.
 *
 * Two levers, in precedence order:
 *
 *  1. `CompanyIntegration.Configuration.catalogSource` — per connection. This is the primary
 *     control, and it is per-connection rather than per-process for two reasons: it survives a
 *     deploy (an environment variable set on the box does not — a deploy rewrites the env file),
 *     and it lets one process run some connections each way at once, which is what makes cutting
 *     over one connector at a time possible.
 *  2. `MJ_INTEGRATION_CATALOG_SOURCE` — a global override, and the reason it exists is rollback:
 *     it is the only lever that does not require reaching a connection's Configuration through a
 *     workspace that may be the thing that is broken. Keep it after the fleet cuts over.
 *
 * Default is 'Shared'. The tables can therefore exist, be backfilled and be verified against live
 * traffic before anything reads or writes them.
 */
export type CatalogSource = 'Shared' | 'PerConnection';

const CONFIG_KEY = 'catalogSource';
const ENV_KEY = 'MJ_INTEGRATION_CATALOG_SOURCE';

function normalise(value: unknown): CatalogSource | undefined {
    if (typeof value !== 'string') return undefined;
    const v = value.trim().toLowerCase();
    if (v === 'perconnection' || v === 'per-connection') return 'PerConnection';
    if (v === 'shared') return 'Shared';
    return undefined;
}

/** The global override, or undefined when unset. */
export function GlobalCatalogSourceOverride(): CatalogSource | undefined {
    return normalise(process.env[ENV_KEY]);
}

/**
 * Which catalog this connection uses.
 *
 * An unparseable `Configuration` is treated as "no opinion" rather than as an error: that column
 * carries a dozen unrelated settings, and letting one bad character anywhere in it flip a
 * connection's catalog would be a far worse failure than ignoring it.
 */
export function ResolveCatalogSource(companyIntegration: MJCompanyIntegrationEntity): CatalogSource {
    const override = GlobalCatalogSourceOverride();
    if (override) return override;
    const raw = companyIntegration.Configuration;
    if (!raw) return 'Shared';
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return normalise(parsed?.[CONFIG_KEY]) ?? 'Shared';
    } catch {
        return 'Shared';
    }
}

/**
 * The writer for this connection's catalog.
 *
 * FAIL-LOUD, not fail-safe. A connection set to 'PerConnection' that has entity maps but no
 * per-connection catalog rows has not been backfilled, and answering from the shared catalog would
 * be indistinguishable from success: the sync would run, on a different set of objects, and report
 * nothing wrong. So it refuses, and the message names the connection, what it found, and the way
 * out.
 *
 * The "has entity maps" part matters. A brand-new connection legitimately has neither maps nor
 * catalog rows — that is the state right before its first discovery, not a missing backfill — so
 * requiring rows there would refuse every new connector on the very flag that is supposed to be
 * safe to turn on.
 */
export function BuildCatalogWriter(
    md: IMetadataProvider,
    companyIntegration: MJCompanyIntegrationEntity,
    contextUser: UserInfo,
    source?: CatalogSource,
): CatalogWriter {
    const resolved = source ?? ResolveCatalogSource(companyIntegration);
    if (resolved === 'Shared') {
        return new SharedCatalogWriter(md, companyIntegration.IntegrationID, contextUser);
    }

    const engine = IntegrationEngineBase.Instance;
    const hasCatalog = engine.HasCompanyIntegrationCatalog(companyIntegration.ID);
    if (!hasCatalog) {
        const mapCount = engine.GetEntityMapsForCompanyIntegration(companyIntegration.ID).length;
        if (mapCount > 0) {
            throw new Error(
                `PER_CONNECTION_CATALOG_MISSING: connection ${companyIntegration.ID} `
                + `("${companyIntegration.Name ?? 'unnamed'}") is set to the per-connection catalog and has `
                + `${mapCount} entity map(s), but no rows in its own catalog. It has not been backfilled. `
                + `Run the catalog backfill for this connection, or set its Configuration.${CONFIG_KEY} `
                + `back to "shared". Refusing to read the shared catalog, which carries objects this `
                + `connection never discovered and omits the ones only it has — the sync would run on the `
                + `wrong set and report success.`,
            );
        }
        // No maps and no rows: a connection that has not discovered anything yet. Nothing to fall
        // back FROM, so this is the ordinary pre-discovery state and the per-connection writer is
        // exactly right — it is about to create the rows.
        LogError(
            `[CatalogSource] Connection ${companyIntegration.ID} is per-connection with an empty catalog `
            + `and no entity maps — treating as pre-discovery.`,
        );
    }
    return new PerConnectionCatalogWriter(
        md, companyIntegration.ID, companyIntegration.IntegrationID, contextUser, new Date());
}
