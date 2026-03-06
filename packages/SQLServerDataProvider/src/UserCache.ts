import { LogError, Metadata, UserInfo } from "@memberjunction/core";
import { MJGlobal, UUIDsEqual } from "@memberjunction/global";
import sql from 'mssql';

const SYSTEM_USER_ID = 'ecafccec-6a37-ef11-86d4-000d3a4e707e';

/**
 * Server side cache of users and their roles
 */
export class UserCache {
    static _instance: UserCache;
    private _globalObjectKey: string = 'MJ.SQLServerDataProvider.UserCache.Instance';
    private _users: UserInfo[];

    constructor() {
      if (UserCache._instance) 
          return UserCache._instance;
      else {
          const g = MJGlobal.Instance.GetGlobalObjectStore();
          if (g && g[this._globalObjectKey]) {
            UserCache._instance = g[this._globalObjectKey];
              return UserCache._instance;
          }

          // finally, if we get here, we are the first instance of this class, so create it
          if (!UserCache._instance) {
            UserCache._instance = this;
          
              // try to put this in global object store if there is a window/e.g. we're in a browser, a global object, we're in node, etc...
              if (g)
                  g[this._globalObjectKey] = UserCache._instance;
              
              return this;
          }
      }
    }
    
    public get SYSTEM_USER_ID(): string {
      return SYSTEM_USER_ID;
    }

    public GetSystemUser(): UserInfo {
      return this.Users.find((u) => u.ID.toLowerCase() === UserCache.Instance.SYSTEM_USER_ID.toLowerCase());
    }

    /**
     * This method will refresh the cache with the latest data from the database
     * @param pool - the connection pool to use to refresh the cache
     * @param autoRefreshIntervalMS - optional, if provided, the cache will be refreshed every interval as specified - denominated in milliseconds
     */
    public async Refresh(pool: sql.ConnectionPool, autoRefreshIntervalMS?: number): Promise<void> {
      try {
        const coreSchema = Metadata.Provider.ConfigData.MJCoreSchemaName;
        const request = new sql.Request(pool);
        const uResult = await request.query(`SELECT * FROM [${coreSchema}].vwUsers`);
        const rRequest = new sql.Request(pool);
        const rResult = await rRequest.query(`SELECT * FROM [${coreSchema}].vwUserRoles`);
        const u = uResult.recordset;
        const r = rResult.recordset;
        if (u) {
          this._users = u.map((user: any) => {
            user.UserRoles = r.filter((role: any) => UUIDsEqual(role.UserID, user.ID));
            const uI = new UserInfo(Metadata.Provider, user)
            return uI;
          })

          // refresh this every interval noted above to ensure we have the latest data
          if (autoRefreshIntervalMS && autoRefreshIntervalMS > 0)
            setTimeout(() => {
              this.Refresh(pool, autoRefreshIntervalMS);
            }, autoRefreshIntervalMS);
        }
      }
      catch (err) {
        LogError(err); 
      }
    }

    static get Instance(): UserCache {
      if (!UserCache._instance) {
        UserCache._instance = new UserCache();
      }
      return UserCache._instance;
    }

    public get Users(): UserInfo[] {
      return this._users;
    }

    static get Users(): UserInfo[] {
      return UserCache.Instance.Users; 
    }

    /**
     * Convenience method to get a user by their name
     * @param name - name of the user
     * @param caseSensitive - optional, if true, the search will be case sensitive
     * @returns 
     */
    public UserByName(name: string, caseSensitive: boolean = false): UserInfo | undefined {
      return UserCache.Users.find(u => {
        const comparisonItem = u.Name.trim();
        const item = name.trim();
        return caseSensitive ? comparisonItem === item : comparisonItem.toLowerCase() === item.toLowerCase();
      });
    }
  }
  
  