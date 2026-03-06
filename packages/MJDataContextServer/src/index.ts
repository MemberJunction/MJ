import { RegisterClass } from "@memberjunction/global";
import { LogError, UserInfo } from "@memberjunction/core";
import { DataContextItem } from "@memberjunction/data-context";
import sql from "mssql";

@RegisterClass(DataContextItem, undefined, undefined, true) 
export class DataContextItemServer extends DataContextItem {
    /**
     * Server-Side only method to load the data context item from a SQL statement
     * @param dataSource - The data source to load the data context item from (this implementation uses mssql ConnectionPool object)
     * @param contextUser - The user that is requesting the data context 
     */
    protected override async LoadFromSQL(dataSource: any, contextUser?: UserInfo): Promise<boolean> {
        try {
            const pool = dataSource as sql.ConnectionPool;
            const request = new sql.Request(pool);
            const result = await request.query(this.SQL);
            this.Data = result.recordset;
            return true; // if we get here the above query didn't fail by throwing an exception which would get caught below
        }
        catch (e) {
            this.DataLoadingError = `Error loading data context item from SQL: ${e && e.message ? e.message : e}`
            LogError(this.DataLoadingError);
            return false;
        }
    }
}