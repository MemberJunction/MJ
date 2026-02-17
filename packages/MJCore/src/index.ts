import { BaseEntity } from "./generic/baseEntity";
import { Metadata } from "./generic/metadata";
import { RunQuery } from "./generic/runQuery";
import { RunReport } from "./generic/runReport";
import { RunView } from "./views/runView";

export * from "./generic/metadata";
export * from "./generic/baseInfo";
export * from "./generic/baseEngine";
export * from "./views/runView";
export * from "./generic/runReport";
export * from "./generic/runQuery";
export * from "./generic/interfaces";
export * from "./generic/baseEntity";
export * from "./generic/applicationInfo";
export * from "./generic/providerBase";
export * from "./generic/entityInfo";
export * from "./generic/securityInfo";
export * from "./generic/transactionGroup";
export * from "./generic/util";
export * from "./generic/logging";
export * from "./generic/queryInfo";
export * from "./generic/queryInfoInterfaces";
export * from "./generic/querySQLFilters";
export * from "./generic/runQuerySQLFilterImplementations";
export * from "./generic/libraryInfo";
export * from "./generic/QueryCacheConfig";
export * from "./generic/QueryCache";
export * from "./generic/explorerNavigationItem";
export * from "./generic/compositeKey";
export * from "./generic/authEvaluator";
export * from "./generic/metadataUtil";
export * from "./generic/authTypes";
export * from "./generic/graphqlTypeNames";

export * from "./generic/platformSQL";
export * from "./generic/databaseProviderBase";
export * from "./generic/baseEngineRegistry";
export * from "./generic/localCacheManager";
export * from "./generic/RegisterForStartup";
export * from "./generic/telemetryManager";
export * from "./generic/InMemoryLocalStorageProvider";

export function SetProvider(provider) {
    Metadata.Provider = provider;
    BaseEntity.Provider = provider;
    RunView.Provider = provider;
    RunReport.Provider = provider;
    RunQuery.Provider = provider;
}

