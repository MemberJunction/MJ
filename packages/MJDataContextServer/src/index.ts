import { RegisterClass } from "@memberjunction/global";
import { LogError, UserInfo } from "@memberjunction/core";
import { DataContextItem } from "@memberjunction/data-context";
import { DataSource } from "typeorm";

@RegisterClass(DataContextItem, undefined, 2) // higher priority for this class
export class DataContextItemServer extends DataContextItem {
    /**
     * Server-Side only method to load the data context item from a SQL statement
     * @param dataSource - The data source to load the data context item from (this implementation uses TypeORM's DataSource object)
     * @param contextUser - The user that is requesting the data context 
     */
    protected override async LoadFromSQL(dataSource: any, contextUser?: UserInfo): Promise<boolean> {
        try {
            const ds = dataSource as DataSource;
            const result = await ds.query(this.SQL);
            this.Data = result;
            return true; // if we get here the above query didn't fail by throwing an exception which would get caught below
        }
        catch (e) {
            LogError(`Error loading data context item from SQL: ${e && e.message ? e.message : e}`);
            return false;
        }
    }
}

/**
 * Call this function after you import this package to ensure that the DataContextItemServer class is not tree shaken out of the final build
 */
export function LoadDataContextItemsServer() {
    // nothing to do here - this is called from packages that import this package in order to prevent tree shaking from removing the DataContextItemServer class
    // that can happen since there is no static code path to instantiate the class
}