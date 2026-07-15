import {
    BaseEntity,
    DatabasePlatform,
    EntitySaveOptions,
    LogError,
    LogStatus,
} from '@memberjunction/core';
import { MJQuerySQLEntity, QueryEngine } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { resolveDbPlatformFromEnv } from '@memberjunction/generic-database-provider';
import { MJQueryEntityServer } from './MJQueryEntityServer.server';

/**
 * Server-side subclass for MJ: Query SQLs.
 *
 * After a QuerySQL record is saved, if its dialect matches the current database
 * platform, triggers re-extraction on the parent Query. This handles the timing
 * issue where metadata sync creates the parent Query first (extraction runs but
 * the dialect variant doesn't exist yet), then creates QuerySQL child records.
 *
 * The QueryEngine cache uses BaseEngine's `CacheLocal: true`, so by the time
 * AfterSave fires the `_querySQLs` array already contains the new record —
 * no force refresh needed.
 */
@RegisterClass(BaseEntity, 'MJ: Query SQLs')
export class MJQuerySQLEntityServer extends MJQuerySQLEntity {
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const saveResult = await super.Save(options);
        if (!saveResult) {
            return false;
        }

        // Only trigger re-extraction if this dialect variant matches the
        // current environment's database platform. A SQL Server environment
        // receiving a PostgreSQL variant (or vice versa) should not re-extract.
        try {
            await this.triggerParentExtractionIfDialectMatches();
        } catch (e) {
            // Non-fatal — the QuerySQL record saved successfully, extraction
            // is a side effect that can be retried by re-saving the record.
            LogError(`[MJQuerySQLEntityServer] Post-save extraction failed for QuerySQL ${this.ID}:`, e);
        }

        return true;
    }

    private async triggerParentExtractionIfDialectMatches(): Promise<void> {
        const currentPlatform = resolveDbPlatformFromEnv() ?? 'sqlserver';
        if (!this.isDialectForPlatform(currentPlatform)) {
            return;
        }

        const parentQuery = this.loadParentQuery();
        if (!parentQuery) {
            return;
        }

        // The parent query has SQL to extract — re-run the pipeline now that
        // the dialect variant is available in the QueryEngine cache.
        if (parentQuery.SQL && parentQuery.SQL.trim().length > 0) {
            LogStatus(`[MJQuerySQLEntityServer] Triggering re-extraction on "${parentQuery.Name}" — dialect variant saved for ${currentPlatform}`);
            await parentQuery.RerunExtraction();
        }
    }

    /**
     * Checks whether this QuerySQL record's SQLDialectID corresponds to the
     * given database platform by looking up the dialect's PlatformKey.
     */
    private isDialectForPlatform(platform: DatabasePlatform): boolean {
        const dialect = QueryEngine.Instance.SQLDialects.find(
            d => UUIDsEqual(d.ID, this.SQLDialectID)
        );
        return dialect?.PlatformKey === platform;
    }

    private loadParentQuery(): MJQueryEntityServer | null {
        // Read from QueryEngine's in-memory cache — no database round-trip.
        // The cache stores MJQueryEntityServer instances at runtime because
        // CacheLocal: true uses GetEntityObject which resolves the server subclass.
        const query = QueryEngine.Instance.Queries.find(
            q => UUIDsEqual(q.ID, this.QueryID)
        );
        if (!query) {
            LogError(`[MJQuerySQLEntityServer] Parent query ${this.QueryID} not found in QueryEngine cache`);
            return null;
        }
        return query as MJQueryEntityServer;
    }
}
