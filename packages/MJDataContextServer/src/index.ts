import { RegisterClass } from '@memberjunction/global';
import { LogError, UserInfo } from '@memberjunction/global';
import { DataContextItem } from '@memberjunction/data-context';
import * as sql from 'mssql';

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
    } catch (e) {
      this.DataLoadingError = `Error loading data context item from SQL: ${e && e.message ? e.message : e}`;
      LogError(this.DataLoadingError);
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
