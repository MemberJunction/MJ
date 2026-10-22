/**
 * A table selection's object ids, resolved to object names — against the CONNECTION's catalog first.
 *
 * Inside a catalog scope, `IntegrationListSourceObjects` hands the picker per-connection
 * (CompanyIntegrationObject) ids. The apply paths looked ids up only in the shared
 * `MJ: Integration Objects` catalog, so an id-only selection matched nothing: every pick was dropped
 * with a LogError, the migration ran with an empty table list, CodeGen and the restart still ran,
 * and the apply reported Success with 0 tables.
 *
 * Three tiers, cheapest first:
 *   1. the scope's loaded catalog, no query — every per-connection object, keyed by its own id AND
 *      by the shared IntegrationObjectID it carries, so an id from either catalog resolves;
 *   2. a direct, uncached read of `MJ: Company Integration Objects` for this connection, for ids the
 *      loaded catalog does not hold yet (a row written earlier in the same run);
 *   3. the shared catalog, exactly as before — and the only tier outside a catalog scope.
 *
 * Keys are upper-cased ids; values are object names. An id no tier resolves is simply absent: the
 * caller decides whether an empty resolution is fatal (an apply refuses it).
 */
import { RunView, type UserInfo } from '@memberjunction/core';
import {
    IntegrationEngineBase,
    ENTITY_COMPANY_INTEGRATION_OBJECTS,
    type CompanyIntegrationObjectRow,
} from '@memberjunction/integration-engine-base';
import { CurrentCatalogCI } from '@memberjunction/integration-engine';

/** Ids per per-connection read. Each read is one `IN (…)` list, so this bounds the filter's length. */
export const OBJECT_ID_LOOKUP_CHUNK = 200;

/** What the lookup reads off a per-connection object. */
type CatalogIdentity = Pick<CompanyIntegrationObjectRow, 'ID' | 'Name' | 'IntegrationObjectID'>;

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/**
 * Resolves object ids to names for the connection in catalog scope (or the shared catalog when
 * there is none). Never throws for a missing id; a failed read leaves its ids unresolved.
 */
export async function LookupObjectNamesByID(
    ids: ReadonlyArray<string | null | undefined> | undefined,
    user: UserInfo
): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const wanted = [...new Set((ids ?? [])
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .map(id => id.toUpperCase()))];
    if (wanted.length === 0) return map;

    const ciID = CurrentCatalogCI();
    if (ciID) {
        const engine = IntegrationEngineBase.Instance;
        if (engine.HasCompanyIntegrationCatalog(ciID)) {
            // GetCompanyIntegrationObjects presents CompanyIntegrationObjectRow projections typed as
            // the shared entity (asReadOnlyObject); the per-connection columns are on every row.
            const rows = engine.GetCompanyIntegrationObjects(ciID) as unknown as CatalogIdentity[];
            for (const row of rows) {
                if (row.ID) map.set(String(row.ID).toUpperCase(), row.Name);
                if (row.IntegrationObjectID) map.set(String(row.IntegrationObjectID).toUpperCase(), row.Name);
            }
        }
    }

    const rv = new RunView();
    let missing = wanted.filter(id => !map.has(id));
    if (missing.length > 0 && ciID) {
        for (let i = 0; i < missing.length; i += OBJECT_ID_LOOKUP_CHUNK) {
            const chunk = missing.slice(i, i + OBJECT_ID_LOOKUP_CHUNK);
            const result = await rv.RunView<{ ID: string; Name: string }>({
                EntityName: ENTITY_COMPANY_INTEGRATION_OBJECTS,
                ExtraFilter: `CompanyIntegrationID=${quote(ciID)} AND ID IN (${chunk.map(quote).join(',')})`,
                ResultType: 'simple',
                Fields: ['ID', 'Name'],
                BypassCache: true,
                IgnoreMaxRows: true,
            }, user);
            if (result.Success) {
                for (const r of result.Results) map.set(String(r.ID).toUpperCase(), r.Name);
            }
        }
        missing = wanted.filter(id => !map.has(id));
    }

    if (missing.length > 0) {
        const result = await rv.RunView<{ ID: string; Name: string }>({
            EntityName: 'MJ: Integration Objects',
            ExtraFilter: missing.map(id => `ID=${quote(id)}`).join(' OR '),
            ResultType: 'simple',
            Fields: ['ID', 'Name'],
        }, user);
        if (result.Success) {
            for (const r of result.Results) map.set(String(r.ID).toUpperCase(), r.Name);
        }
    }
    return map;
}
