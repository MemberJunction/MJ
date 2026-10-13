/**
 * deterministic-entity-factory.ts — builds MJ: Queries, MJ: Query SQLs and MJ: Template Contents
 * entity objects for the deterministic integration tier.
 *
 * Saving any of these runs an extraction pipeline whose AI enrichment stage would make a live
 * model call per save. The deterministic tier must make none, so every check that saves one
 * creates it here. Parameter/field extraction still runs deterministically with heuristic
 * descriptions.
 *
 * Enrichment runs in whichever process executes the entity's `Save()` override, so it is switched
 * off in two places:
 *   - In THIS process: when the provider resolves the server entity subclass (always on a database
 *     provider; also under client transport, because this process registers the server classes and
 *     the subclass's post-save extraction runs locally), the factory sets the typed
 *     `SkipAIEnrichment` flag (`ISaveEnrichmentOptOut`), which is sticky across re-saves of the instance.
 *   - Inside MJAPI, for saves that arrive over GraphQL: no per-instance flag crosses the wire, so
 *     the MJAPI host must run with the `saveTimeAI` prompt switches (`QueryParameters`,
 *     `TemplateParameters`, `ViewSmartFilters`, `CodeGeneration`) set to `false` (MJServer config,
 *     honoured by the server entity subclasses). A deterministic client-transport run requires that
 *     host setting.
 *
 * Callers pass the provider their fixture already runs on (normally `ctx.Provider`); nothing here
 * touches the process-global provider.
 */
import { ProviderType } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJQueryEntity, MJQuerySQLEntity, MJTemplateContentEntity } from '@memberjunction/core-entities';
import { MJQueryEntityServer, MJQuerySQLEntityServer, MJTemplateContentEntityServer } from '@memberjunction/core-entities-server';
import type { ISaveEnrichmentOptOut } from '@memberjunction/core-entities-server';

/** Creates entity objects whose saves make no AI enrichment call (see the file header). */
export class DeterministicEntityFactory {
    /** Creates a new `MJ: Queries` entity object that will not call a model when saved. */
    public static async NewQuery(provider: IMetadataProvider, user: UserInfo): Promise<MJQueryEntity> {
        const query = await provider.GetEntityObject<MJQueryEntity>('MJ: Queries', user);
        DeterministicEntityFactory.DisableEnrichment(provider, query, (e): e is MJQueryEntityServer => e instanceof MJQueryEntityServer, 'MJ: Queries');
        return query;
    }

    /** Creates a new `MJ: Query SQLs` entity object whose save will not trigger a model call. */
    public static async NewQuerySQL(provider: IMetadataProvider, user: UserInfo): Promise<MJQuerySQLEntity> {
        const variant = await provider.GetEntityObject<MJQuerySQLEntity>('MJ: Query SQLs', user);
        DeterministicEntityFactory.DisableEnrichment(provider, variant, (e): e is MJQuerySQLEntityServer => e instanceof MJQuerySQLEntityServer, 'MJ: Query SQLs');
        return variant;
    }

    /** Creates a new `MJ: Template Contents` entity object whose saves will not call a model (sticky across re-saves). */
    public static async NewTemplateContent(provider: IMetadataProvider, user: UserInfo): Promise<MJTemplateContentEntity> {
        const content = await provider.GetEntityObject<MJTemplateContentEntity>('MJ: Template Contents', user);
        DeterministicEntityFactory.DisableEnrichment(provider, content, (e): e is MJTemplateContentEntityServer => e instanceof MJTemplateContentEntityServer, 'MJ: Template Contents');
        return content;
    }

    /**
     * Sets the opt-out when the entity is the server subclass. A database provider must always resolve
     * the server subclass (a failure to do so would silently allow a live model call, so it throws);
     * a remote provider may resolve the plain client class, whose saves are covered by the MJAPI host
     * setting described in the file header.
     */
    protected static DisableEnrichment<TBase, T extends TBase & ISaveEnrichmentOptOut>(
        provider: IMetadataProvider,
        entity: TBase,
        isServerSubclass: (e: TBase) => e is T,
        entityName: string
    ): void {
        if (isServerSubclass(entity)) {
            entity.SkipAIEnrichment = true;
        } else if (provider.ProviderType === ProviderType.Database) {
            throw new Error(`'${entityName}' did not resolve to its server subclass on a database provider; cannot disable AI enrichment.`);
        }
    }
}
