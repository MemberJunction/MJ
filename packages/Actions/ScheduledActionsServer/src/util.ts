import { SQLServerProviderConfigData, setupSQLServerClient } from "@memberjunction/sqlserver-dataprovider";
import AppDataSource from "./db";
import { autoRefreshInterval, currentUserEmail, mjCoreSchema } from "./config";

export async function timeout(ms: number) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            reject(new Error("Batch operation timed out"));
        }, ms);
    });
}

let _serverInitalized = false;
export async function handleServerInit(autoRefresh: boolean = false) {
    if (!_serverInitalized) {
        const config = new SQLServerProviderConfigData(AppDataSource, currentUserEmail, mjCoreSchema, autoRefresh ? autoRefreshInterval : 0/*no auto refreshes*/);
        await setupSQLServerClient(config);
        _serverInitalized = true;
    }
}