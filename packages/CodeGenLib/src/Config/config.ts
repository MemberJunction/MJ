import env from 'env-var';
import fs from 'fs';
import path from 'path';
import { logStatus } from '../Misc/logging';

export const dbHost = env.get('DB_HOST').required().asString();
export const dbPort = env.get('DB_PORT').default('1433').asPortNumber();
export const dbUsername = env.get('DB_USERNAME').required().asString();
export const dbPassword = env.get('DB_PASSWORD').required().asString();
export const dbDatabase = env.get('DB_DATABASE').required().asString();
export const dbInstanceName = env.get('DB_INSTANCE_NAME').asString();
export const dbTrustServerCertificate = env.get('DB_TRUST_SERVER_CERTIFICATE').asBool();

export const outputCode = env.get('OUTPUT_CODE').asString();
export const configFile = env.get('CONFIG_FILE').asString();

export const mjCoreSchema = env.get('MJ_CORE_SCHEMA').default('__mj').asString();

export const graphqlPort = env.get('GRAPHQL_PORT').default('4000').asPortNumber();

export type TableInfo = {
    schema: string
    table: string 
}
export type OutputOptionInfo = {
    name: string;
    value: any;
}

export type OutputInfo = {
    type: string;
    directory: string;
    appendOutputCode?: boolean;
    options?: OutputOptionInfo[];
}
export type CommandInfo = {
    workingDirectory: string;
    command: string;
    args: string[];
    timeout: number;
    when: string;
}
export type CustomSQLScript = {
    when: string;
    scriptFile: string;
}

export type LogInfo = {
    log: boolean;
    logFile: string;
    console: boolean;
}
export type SettingInfo = {
    name: string;
    value: any;
}

export type DBSchemaJSONOutput = {
    excludeSchemas: string[];
    excludeEntities: string[];
    bundles: DBSchemaJSONOutputBundle[];
}

export type DBSchemaJSONOutputBundle = {
    name: string;
    schemas: string[];
    excludeSchemas: string[];   
    excludeEntities: string[];
}

export type NewUserSetup = {
    UserName: string;
    FirstName: string;
    LastName: string;
    Email: string;
    Roles: string[];
    IsComplete: boolean;
}


export type AdvancedGenerationFeatureOption = {
    name: string;
    value: any;
}

export type AdvancedGenerationFeature = {
    name: string;
    enabled: boolean;
    description?: string; // not used, but useful for documentation within the config file
    systemPrompt?: string;
    userMessage?: string;
    options?: AdvancedGenerationFeatureOption[];
}

export type AdvancedGeneration = {
    enableAdvancedGeneration: boolean;
    AIVendor: "openai" | "anthropic" | "mistral";
    AIModel: "";
    features: AdvancedGenerationFeature[];
}

export type ConfigInfo = {
    newUserSetup?: NewUserSetup;
    settings: SettingInfo[];
    excludeSchemas: string[];
    excludeTables: TableInfo[];
    customSQLScripts: CustomSQLScript[];
    advancedGeneration?: AdvancedGeneration;
    output: OutputInfo[];
    commands: CommandInfo[];
    logging: LogInfo;
    newEntityDefaults: NewEntityDefaults;
    newSchemaDefaults: NewSchemaDefaults;
    dbSchemaJSONOutput: DBSchemaJSONOutput;
    newEntityRelationshipDefaults: NewEntityRelationshipDefaults;
}

export type NewEntityDefaults = {
    TrackRecordChanges : boolean;
    AuditRecordAccess : boolean;
    AuditViewRuns: boolean;
    AllowAllRowsAPI : boolean;
    AllowCreateAPI : boolean;
    AllowUpdateAPI : boolean;
    AllowDeleteAPI : boolean;
    AllowUserSearchAPI: boolean;
    UserViewMaxRows : number;
    AddToApplicationWithSchemaName: boolean;
    IncludeFirstNFieldsAsDefaultInView: number;
    PermissionDefaults: NewEntityPermissionDefaults;
};

export type EntityPermission = {
    RoleName: string;
    CanRead: boolean;
    CanCreate: boolean;
    CanUpdate: boolean;
    CanDelete: boolean;
}
export type NewEntityPermissionDefaults = {
    AutoAddPermissionsForNewEntities: boolean;
    Permissions: EntityPermission[];
};

export type NewSchemaDefaults = {
    CreateNewApplicationWithSchemaName: boolean;
}

export type NewEntityRelationshipDefaults = {
    AutomaticallyCreateRelationships: boolean;
    CreateOneToManyRelationships: boolean;
}

export let configInfo: ConfigInfo;
export let currentWorkingDirectory: string;

export function initializeConfig(workingDirectory: string): ConfigInfo {
    currentWorkingDirectory = workingDirectory;
    const configFileName = configFile ? configFile : 'config.json';
    const configPath = path.join(workingDirectory, configFileName);
    const configData = fs.readFileSync(configPath, 'utf-8');
    configInfo = JSON.parse(configData);
    return configInfo;
}

export function saveConfigFileFromMemory(): boolean {
    try {
        if (!configInfo || !currentWorkingDirectory) {
            console.error("ConfigInfo or currentWorkingDirectory not set, cannot save config file");
            return false;
        }
        else {
            const configFileName = configFile ? configFile : 'config.json';
            const configPath = path.join(currentWorkingDirectory, configFileName);
            const configData = JSON.stringify(configInfo, null, 4);
            fs.writeFileSync(configPath, configData);
            return true;    
        }
    } catch (err) {
        console.error(err);
        return false;
    }

}

export function outputDir(type: string, useLocalDirectoryIfMissing: boolean): string | null {
    const outputInfo = configInfo.output.find(o => o.type.trim().toUpperCase() === type.trim().toUpperCase());
    if (outputInfo) {
        if (outputInfo.appendOutputCode && outputInfo.appendOutputCode === true && 
            outputCode && outputCode.length > 0) 
            return path.join(currentWorkingDirectory, outputInfo.directory, outputCode);
        else
            return path.join(currentWorkingDirectory, outputInfo.directory);
    }
    else {
        if (useLocalDirectoryIfMissing) {
            logStatus(">>> No output directory found for type: " + type + " within config file, using local directory instead")
            return path.join(currentWorkingDirectory, 'output', type);
        }
        else
            return null;
    }
}

export function outputOptions(type: string): OutputOptionInfo[] | null {
    const outputInfo = configInfo.output.find(o => o.type.trim().toUpperCase() === type.trim().toUpperCase());
    if (outputInfo) {
        return outputInfo.options!;
    }
    else {
        return null;
    }
}

export function outputOptionValue(type: string, optionName: string, defaultValue?: any): any {
    const outputInfo = configInfo.output.find(o => o.type.trim().toUpperCase() === type.trim().toUpperCase());
    if (outputInfo && outputInfo.options) {
        const theOption = outputInfo.options.find(o => o.name.trim().toUpperCase() === optionName.trim().toUpperCase());
        if (theOption)
            return theOption.value;
        else
            return defaultValue;
    }
    else {
        return defaultValue;
    }
}

export function commands(when: string): CommandInfo[] {
    return configInfo.commands.filter(c => c.when.trim().toUpperCase() === when.trim().toUpperCase());
}
export function customSqlScripts(when: string): CustomSQLScript[] {
    return configInfo.customSQLScripts.filter(c => c.when.trim().toUpperCase() === when.trim().toUpperCase());
}

export function getSetting(settingName: string): SettingInfo {
    return configInfo.settings.find(s => s.name.trim().toUpperCase() === settingName.trim().toUpperCase())!;
}

export function getSettingValue(settingName: string, defaultValue?: any): any {
    const setting = getSetting(settingName);
    if (setting)
        return setting.value;
    else
        return defaultValue;
}

export function mj_core_schema(): string {
    return getSetting('mj_core_schema').value;
}