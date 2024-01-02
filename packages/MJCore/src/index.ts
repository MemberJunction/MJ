import { BaseEntity } from "./generic/baseEntity";
import { Metadata } from "./generic/metadata";
import { RunReport } from "./generic/runReport";
import { RunView } from "./views/runView";

export * from "./generic/metadata";
export * from "./generic/baseInfo";
export * from "./views/runView";
export * from "./generic/runReport";
export * from "./generic/interfaces";
export * from "./generic/baseEntity";
export * from "./generic/applicationInfo";
export * from "./generic/providerBase";
export * from "./generic/entityInfo";
export * from "./generic/securityInfo";
export * from "./generic/transactionGroup";
export * from "./generic/util";
export * from "./generic/logging";

export function SetProvider(provider) {
    Metadata.Provider = provider;
    BaseEntity.Provider = provider;
    RunView.Provider = provider;
    RunReport.Provider = provider;
}

