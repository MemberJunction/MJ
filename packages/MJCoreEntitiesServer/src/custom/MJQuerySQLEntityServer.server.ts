import {
    BaseEntity,
    CompositeKey,
    DatabasePlatform,
    EntitySaveOptions,
    IMetadataProvider,
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
 * Save() returns the `_querySQLs` array already contains the new record —
 * no force refresh needed.
 */
@RegisterClass(BaseEntity, 'MJ: Query SQLs')
export class MJQuerySQLEntityServer extends MJQuerySQLEntity {
    /**
     * Set when Save() skipped the parent re-extraction because
     * @see BaseEntity.DeferDerivedData was set. Cleared by ProcessDeferredDerivedData.
     */
    private parentExtractionPending = false;

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const saveResult = await super.Save(options);
        if (!saveResult) {
            return false;
        }

        // The parent's extraction derives ITS children, so it is subject to the same
        // deferral as the parent's own Save(): a caller that authors the query's parameters
        // alongside this record must have them written before extraction runs, or extraction
        // creates colliding copies of them. Record the work and let the caller run it.
        if (this.DeferDerivedData) {
            this.parentExtractionPending = true;
            return true;
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

    /**
     * Runs the parent re-extraction that Save() deferred. Called once the whole record
     * graph is written, so the parent's extraction reconciles with the query's authored
     * parameters instead of inserting duplicates of them.
     */
    public override async ProcessDeferredDerivedData(): Promise<void> {
        if (!this.parentExtractionPending) {
            return;
        }
        this.parentExtractionPending = false;

        try {
            await this.triggerParentExtractionIfDialectMatches();
        } catch (e) {
            // Non-fatal for the same reason it is in Save() — the QuerySQL record itself
            // persisted, and extraction can be retried by re-saving it.
            LogError(`[MJQuerySQLEntityServer] Deferred extraction failed for QuerySQL ${this.ID}:`, e);
        }
    }

    /**
     * Ensures QueryEngine is loaded. In CLI/sync contexts, Config() may not
     * have been called yet. This is a no-op if already loaded (BaseEngine
     * skips reloading when data is already cached and forceRefresh is false).
     */
    private async ensureQueryEngineLoaded(): Promise<void> {
        if (QueryEngine.Instance.Queries.length === 0) {
            await QueryEngine.Instance.Config(false, this.ContextCurrentUser);
        }
    }

    private async triggerParentExtractionIfDialectMatches(): Promise<void> {
        const currentPlatform = resolveDbPlatformFromEnv() ?? 'sqlserver';

        await this.ensureQueryEngineLoaded();

        if (!this.isDialectForPlatform(currentPlatform)) {
            return;
        }

        const parentQuery = await this.loadParentQuery();
        if (!parentQuery) {
            return;
        }

        // The parent query has SQL to extract — re-run the pipeline. The
        // QueryEngine cache already has our QuerySQL record (CacheLocal event
        // fires synchronously in super.Save()), so resolveExtractionSQL()
        // will find the dialect variant via GetPlatformSQL().
        if (parentQuery.SQL && parentQuery.SQL.trim().length > 0) {
            LogStatus(`[MJQuerySQLEntityServer] Triggering re-extraction on "${parentQuery.Name}" — dialect variant saved for ${currentPlatform}`);
            await parentQuery.RerunExtraction();
        }
    }

    /**
     * Checks whether this QuerySQL record's SQLDialectID corresponds to the
     * given database platform by looking up the dialect's PlatformKey in
     * QueryEngine's cached SQLDialects.
     */
    private isDialectForPlatform(platform: DatabasePlatform): boolean {
        const dialect = QueryEngine.Instance.SQLDialects.find(
            d => UUIDsEqual(d.ID, this.SQLDialectID)
        );
        return dialect?.PlatformKey === platform;
    }

    /**
     * Loads the parent query bound to THIS record's provider.
     *
     * The QueryEngine cache holds a parent bound to the provider that loaded the engine —
     * the process-global one. Re-extracting through that instance reads and writes over a
     * different connection than the one saving this record, so inside a transaction it
     * cannot see the rows that transaction has written, and anything it writes settles
     * outside it. During `mj sync push`, where each record graph runs on its own
     * connection, that is both wrong (the extraction cannot see the query's authored
     * parameters and duplicates them) and a deadlock risk (it blocks on rows the
     * uncommitted graph holds, while that graph waits on this call). So resolve the parent
     * through `ProviderToUse`, which is the connection this record is already on.
     */
    private async loadParentQuery(): Promise<MJQueryEntityServer | null> {
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const query = await md.GetEntityObject<MJQueryEntityServer>(
            'MJ: Queries',
            CompositeKey.FromID(this.QueryID),
            this.ContextCurrentUser
        );
        if (!query || !query.IsSaved) {
            LogError(`[MJQuerySQLEntityServer] Parent query ${this.QueryID} could not be loaded`);
            return null;
        }
        return query;
    }
}
