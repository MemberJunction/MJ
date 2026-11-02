import {
    BaseEntity,
    DatabasePlatform,
    DatabaseProviderBase,
    EntitySaveOptions,
    LogError,
    LogStatus,
} from '@memberjunction/core';
import { MJQuerySQLEntity, QueryEngine } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJQueryEntityServer } from './MJQueryEntityServer.server';

/**
 * Server-side subclass for MJ: Query SQLs.
 *
 * After a QuerySQL record is saved, if its dialect matches the platform of the provider it was
 * saved through, the parent query is re-extracted from this variant's SQL. This handles the
 * ordering where a metadata push creates the parent query first (its extraction reads the base
 * SQL) and its dialect variants after.
 *
 * The parent is read from the database on this record's provider, never from QueryEngine's cache:
 * inside a transaction (an atomic metadata push) the cache does not yet hold a parent saved earlier
 * in the same transaction, or holds it with its old SQL. The variant's own SQL is passed to the
 * re-extraction for the same reason.
 */
@RegisterClass(BaseEntity, 'MJ: Query SQLs')
export class MJQuerySQLEntityServer extends MJQuerySQLEntity {
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const saveResult = await super.Save(options);
        if (!saveResult) {
            return false;
        }

        try {
            await this.triggerParentExtractionIfDialectMatches(options?.SkipEntityAIActions === true);
        } catch (e) {
            // Non-fatal — the QuerySQL record saved successfully, extraction
            // is a side effect that can be retried by re-saving the record.
            LogError(`[MJQuerySQLEntityServer] Post-save extraction failed for QuerySQL ${this.ID}:`, e);
        }

        return true;
    }

    /** The platform of the provider this record saves through. */
    private get platform(): DatabasePlatform {
        const provider = this.ProviderToUse;
        return provider instanceof DatabaseProviderBase ? provider.PlatformKey : 'sqlserver';
    }

    private async triggerParentExtractionIfDialectMatches(skipAIEnrichment: boolean): Promise<void> {
        if (!this.SQL || this.SQL.trim().length === 0 || !await this.isDialectForPlatformAsync(this.platform)) {
            return;
        }
        const parentQuery = await this.loadParentQueryAsync();
        if (!parentQuery?.SQL || parentQuery.SQL.trim().length === 0) {
            return;
        }
        LogStatus(`[MJQuerySQLEntityServer] Triggering re-extraction on "${parentQuery.Name}" — dialect variant saved for ${this.platform}`);
        await parentQuery.RerunExtraction(skipAIEnrichment, this.SQL);
    }

    /**
     * Whether this record's dialect is the given platform's. Dialects are seed metadata, so the
     * cached list is used; QueryEngine is loaded first in a CLI or sync process that has not.
     */
    private async isDialectForPlatformAsync(platform: DatabasePlatform): Promise<boolean> {
        if (!QueryEngine.Instance.Loaded) {
            await QueryEngine.Instance.Config(false, this.ContextCurrentUser);
        }
        const dialect = QueryEngine.Instance.SQLDialects.find(d => UUIDsEqual(d.ID, this.SQLDialectID));
        return dialect?.PlatformKey === platform;
    }

    /** The parent query as stored now, read on this record's provider (inside its transaction, if any). */
    private async loadParentQueryAsync(): Promise<MJQueryEntityServer | null> {
        const provider = this.ProviderToUse;
        if (!(provider instanceof DatabaseProviderBase)) {
            return null;
        }
        const query = await provider.GetEntityObject<MJQueryEntityServer>('MJ: Queries', this.ContextCurrentUser);
        if (!(query instanceof MJQueryEntityServer) || !await query.Load(this.QueryID)) {
            LogError(`[MJQuerySQLEntityServer] Parent query ${this.QueryID} could not be loaded for re-extraction`);
            return null;
        }
        return query;
    }
}
