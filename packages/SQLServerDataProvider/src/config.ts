import { BaseEntity, Metadata, RunView, LogError, LogStatus, RunReport } from "@memberjunction/core";
import { SQLServerDataProvider, SQLServerProviderConfigData } from "./SQLServerDataProvider";
import { DataSource } from "typeorm";
import { UserCache } from "./UserCache";



export async function setupSQLServerClient(config: SQLServerProviderConfigData): Promise<SQLServerDataProvider> {
    try {
        // Set the provider for all entities to be GraphQL in this project, can use a different provider in other situations....
        const ds: DataSource = <DataSource>config.DataSource;
        if (ds.isInitialized) {
            const provider = new SQLServerDataProvider()
            await provider.Config(config);

            // BaseEntity + Metadata share the same GraphQLDataProvider instance
            BaseEntity.Provider = provider
            Metadata.Provider = provider
            RunView.Provider = provider
            RunReport.Provider = provider

            // now setup the user cache
            await UserCache.Instance.Refresh(ds,config.CheckRefreshIntervalSeconds);   

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
    
            return provider
        }
        else {
            //dataSource is not initialized, so wait for it
            LogStatus("dataSource is not initialized, we're going to hang out to wait for it...")
            await ds.initialize();
            if (ds.isInitialized)
                return setupSQLServerClient(config) // one time recursive call since we're now initialized
            else
                throw new Error("Failed to initialize data source"); // don't do recursive call here as it would go on forever
        }
    }
    catch (e) {
        LogError("Error in setupSQLServerClient", e)
    }
}
