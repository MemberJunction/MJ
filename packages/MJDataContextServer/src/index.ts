import { RegisterClass } from "@memberjunction/global";
import { LogError } from "@memberjunction/core";
import type { IRunQueryProvider, UserInfo } from "@memberjunction/core";
import { DataContextItem } from "@memberjunction/data-context";

/**
 * Server-side DataContextItem. Runs the SQL of a `sql` item through a query provider's ad-hoc path,
 * which accepts only a single read statement.
 */
@RegisterClass(DataContextItem, undefined, undefined, true)
export class DataContextItemServer extends DataContextItem {
    /**
     * Loads the item's data by running its SQL through `dataSource.RunQuery` for `contextUser`.
     * Refuses when there is no context user or when `dataSource` is not a query provider, such as a
     * raw connection pool handed in through `LoadData`'s untyped data source.
     * @param dataSource - the query provider to run the SQL on; MJServer passes its read-only provider
     * @param contextUser - the user the SQL runs for
     */
    protected override async LoadFromSQL(dataSource: IRunQueryProvider | null | undefined, contextUser?: UserInfo): Promise<boolean> {
        if (!contextUser) {
            return this.failSQLLoad('a context user is required');
        }
        if (!dataSource || typeof dataSource.RunQuery !== 'function') {
            return this.failSQLLoad('SQL items run only through a query provider, never on a raw connection');
        }
        if (!this.SQL?.trim()) {
            return this.failSQLLoad('the item has no SQL');
        }
        try {
            const result = await dataSource.RunQuery({ SQL: this.SQL }, contextUser);
            if (!result.Success) {
                return this.failSQLLoad(result.ErrorMessage);
            }
            this.Data = result.Results;
            return true;
        }
        catch (e) {
            return this.failSQLLoad(e instanceof Error ? e.message : String(e));
        }
    }

    /** Records why the item's SQL was not loaded and returns false. */
    private failSQLLoad(reason: string): boolean {
        this.DataLoadingError = `Error loading data context item from SQL: ${reason}`;
        LogError(this.DataLoadingError);
        return false;
    }
}
