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
 *
 * Introspection is the FALLBACK, not the source. {@link ResolvePostRestartFields} maps each object
 * from the connection's persisted ACTIVE field rows first, and introspects only the objects that
 * have none. Two reasons:
 *
 *  - a connector's `IntrospectSchema` may call the vendor. NetForum's fetches a definition and a
 *    sample for every object it is given, so introspecting here turned every post-restart apply into
 *    a live re-discovery of the whole catalog (923 objects on the sandbox);
 *  - the apply built the tables from the persisted rows (`LoadScopedFieldsForBuild`). Mapping from
 *    the same rows keeps the field maps aligned with the columns that exist. A live answer can
 *    differ from the persisted one, and every field it adds or drops is a map without a column or a
 *    column without a map.
 */
import type { UserInfo } from '@memberjunction/core';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { UnpinCatalogObjects, WarmCatalogObject, WithCatalogScope } from '@memberjunction/integration-engine';
import { FieldsForBuild, LoadScopedFieldsForBuild } from './ScopedFieldsForBuild.js';

/** What a connector's `IntrospectSchema` answers, reduced to what the post-restart step maps. */
export interface IntrospectedSchema {
    Objects: Array<{ ExternalName: string; Fields: Array<{ Name: string; IsPrimaryKey?: boolean; IsRequired?: boolean }> }>;
}

/** One source field, as the post-restart step turns it into a field map. */
export interface PostRestartSourceField {
    Name: string;
    IsPrimaryKey: boolean;
    IsRequired: boolean;
}

/** The fields the post-restart step maps, and where they came from. */
export interface PostRestartFields {
    /** Lower-cased object name → the fields to map. An object neither source answered for is absent. */
    FieldsByObject: Map<string, PostRestartSourceField[]>;
    /** How many of the requested objects were answered from the connection's persisted catalog. */
    PersistedCount: number;
    /** The requested objects with no persisted fields, which were introspected instead. */
    Introspected: string[];
}

/**
 * The fields to map for each of `sourceObjectNames`: the connection's persisted ACTIVE field rows
 * where it has them, and the connector's introspection only for the objects it has none for.
 *
 * Introspection runs at most once, and only when some requested object has no persisted fields; it
 * warms just those objects ({@link IntrospectInCatalogScope}). The persisted answer wins for an
 * object both sources name. A connection with no catalog of its own has no persisted rows to read,
 * so every object is introspected exactly as before.
 *
 * An object neither source answers for is ABSENT from the result. The caller must treat that as a
 * failure: a map with no field maps cannot write a single column.
 *
 * @throws PER_CONNECTION_FIELDS_UNREADABLE when the persisted read fails, before anything is
 *   introspected. An empty answer there would send every object to the vendor.
 */
export async function ResolvePostRestartFields(
    companyIntegrationID: string,
    integrationID: string,
    sourceObjectNames: readonly string[],
    introspect: () => Promise<IntrospectedSchema>,
    user: UserInfo,
): Promise<PostRestartFields> {
    const fieldsByObject = await loadPersistedFields(companyIntegrationID, integrationID, sourceObjectNames, user);
    const persistedCount = fieldsByObject.size;
    const introspected = sourceObjectNames.filter(name => !fieldsByObject.has(name.toLowerCase()));
    if (introspected.length > 0) {
        const schema = await IntrospectInCatalogScope(companyIntegrationID, introspected, introspect, user);
        const wanted = new Set(introspected.map(name => name.toLowerCase()));
        for (const object of schema.Objects) {
            const key = object.ExternalName.toLowerCase();
            if (!wanted.has(key) || fieldsByObject.has(key)) continue;
            fieldsByObject.set(key, object.Fields.map(toSourceField));
        }
    }
    return { FieldsByObject: fieldsByObject, PersistedCount: persistedCount, Introspected: introspected };
}

/**
 * Lower-cased object name → its ACTIVE persisted fields, for each requested object the connection
 * has persisted fields for. Read in the connection's scope, through the same loader the apply built
 * the tables with, narrowed to the requested objects.
 */
async function loadPersistedFields(
    companyIntegrationID: string,
    integrationID: string,
    sourceObjectNames: readonly string[],
    user: UserInfo,
): Promise<Map<string, PostRestartSourceField[]>> {
    const byName = new Map<string, PostRestartSourceField[]>();
    if (sourceObjectNames.length === 0) return byName;
    return WithCatalogScope(companyIntegrationID, async () => {
        const scoped = await LoadScopedFieldsForBuild(integrationID, user, sourceObjectNames);
        if (!scoped) return byName;
        const engine = IntegrationEngineBase.Instance;
        const wanted = new Set(sourceObjectNames.map(name => name.toLowerCase()));
        for (const object of engine.GetActiveIntegrationObjects(integrationID)) {
            const key = object.Name.toLowerCase();
            if (!wanted.has(key)) continue;
            const active = FieldsForBuild(object.ID, scoped, engine).filter(f => f.Status === 'Active');
            if (active.length > 0) byName.set(key, active.map(toSourceField));
        }
        return byName;
    }, user);
}

function toSourceField(field: { Name: string; IsPrimaryKey?: boolean | null; IsRequired?: boolean | null }): PostRestartSourceField {
    return { Name: field.Name, IsPrimaryKey: field.IsPrimaryKey === true, IsRequired: field.IsRequired === true };
}

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
