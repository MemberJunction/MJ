/**
 * The post-restart introspection, run against the connection's own catalog with its fields warm.
 *
 * After the RSU restarts the process, the consumer introspects the connector to build the entity
 * and field maps. That runs at process start, outside any request, so nothing has entered a scope
 * for it, and nothing has loaded this connection's catalog either. Two things have to be true for
 * the connector to see the connection's fields:
 *
 *  - the scope must be entered ASYNC (`WithCatalogScope`), which loads the connection's objects;
 *    a synchronous `RunInCatalogScope` loads nothing, so on a fresh process the reads fall back to
 *    the shared catalog and every column this connection's discovery sampled gets no field map;
 *  - each object's FIELD rows must be warm. A scope loads objects, not fields: only the sync loop
 *    warms fields, so a connector reading them here (`GetCachedFields`) gets per-connection objects
 *    with no fields at all, and the consumer creates no field maps.
 *
 * So this enters the scope, warms and pins every per-connection object the pending work names,
 * introspects, and releases the pins whether or not the introspection succeeded.
 */
import type { UserInfo } from '@memberjunction/core';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { UnpinCatalogObjects, WarmCatalogObject, WithCatalogScope } from '@memberjunction/integration-engine';

/**
 * Run `introspect` in `companyIntegrationID`'s catalog scope, with the fields of each named object
 * warm. A name the connection has no object of its own for is skipped: it reads the shared catalog,
 * as it always did. A failed warm throws; it is never read as an object with no fields.
 */
export async function IntrospectInCatalogScope<T>(
    companyIntegrationID: string,
    sourceObjectNames: readonly string[],
    introspect: () => Promise<T>,
    user: UserInfo,
): Promise<T> {
    return WithCatalogScope(companyIntegrationID, async () => {
        const engine = IntegrationEngineBase.Instance;
        const pinned: string[] = [];
        try {
            for (const name of sourceObjectNames) {
                const own = engine.GetCompanyIntegrationObject(companyIntegrationID, name);
                if (!own) continue;
                await WarmCatalogObject(own.ID, user);
                pinned.push(own.ID);
            }
            return await introspect();
        } finally {
            UnpinCatalogObjects(pinned);
        }
    }, user);
}
