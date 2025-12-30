import { BaseEntity, Metadata, RunView, LogError, LogStatus, RunReport, RunQuery, SetProvider, StartupManager } from "@memberjunction/core";
import { SQLServerDataProvider } from "./SQLServerDataProvider";
import { SQLServerProviderConfigData } from "./types";
import * as sql from 'mssql';
import { UserCache } from "./UserCache";


export async function setupSQLServerClient(config: SQLServerProviderConfigData): Promise<SQLServerDataProvider> {
    try {
        // Set the provider for all entities to be SQL Server in this project, can use a different provider in other situations....
        const pool: sql.ConnectionPool = config.ConnectionPool;
        if (pool.connected) {
            const provider = new SQLServerDataProvider()
            await provider.Config(config);

            // BaseEntity + Metadata share the same provider instance
            SetProvider(provider);

            // now setup the user cache
            await UserCache.Instance.Refresh(pool, config.CheckRefreshIntervalSeconds);   

            if (config.CheckRefreshIntervalSeconds && config.CheckRefreshIntervalSeconds > 0) {
                // Start a timer to check for refreshes
                setInterval(async () => {
                    try {
                        await provider.RefreshIfNeeded();
                    }
                    catch (e) {
                        LogError("Error in CheckForRefreshes", e)
                    }
                }, config.CheckRefreshIntervalSeconds * 1000)
            }

            const sysUser = UserCache.Instance.GetSystemUser();
            const backupSysUser = UserCache.Instance.Users.find(u => u.IsActive && u.Type==='Owner');
            await StartupManager.Instance.Startup(false, sysUser || backupSysUser, provider);
    
            return provider;
        }
        else {
            //pool is not connected, so wait for it
            LogStatus("Connection pool is not connected, we're going to wait for it...")
            await pool.connect();
            if (pool.connected)
                return setupSQLServerClient(config) // one time recursive call since we're now connected
            else
                throw new Error("Failed to connect to database"); // don't do recursive call here as it would go on forever
        }
    }
    catch (e) {
        LogError("Error in setupSQLServerClient", e)
    }
}
