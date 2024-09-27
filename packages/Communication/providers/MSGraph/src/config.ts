import env from 'env-var';

//MJ Related
export const dbHost: string = env.get('DB_HOST').required().asString();
export const dbPort: number = env.get('DB_PORT').default('1433').asPortNumber();
export const dbUsername: string = env.get('DB_USERNAME').required().asString();
export const dbPassword: string = env.get('DB_PASSWORD').required().asString();
export const dbDatabase: string = env.get('DB_DATABASE').required().asString();
export const dbInstanceName: string | undefined = env.get('DB_INSTANCE_NAME').asString();
export const dbTrustServerCertificate: boolean | undefined = env.get('DB_TRUST_SERVER_CERTIFICATE').asBool();
export const outputCode: string | undefined = env.get('OUTPUT_CODE').asString();
export const configFile = env.get('CONFIG_FILE').asString();
export const mjCoreSchema = env.get('MJ_CORE_SCHEMA').default('__mj').asString();
export const graphqlPort = env.get('GRAPHQL_PORT').default('4000').asPortNumber();

//Azure Related
export const AZURE_CLIENT_ID: string = env.get('AZURE_CLIENT_ID').required().asString();
export const AZURE_AAD_ENDPOINT: string = env.get('AZURE_AAD_ENDPOINT').required().asString();
export const AZURE_TENANT_ID: string = env.get('AZURE_TENANT_ID').required().asString();
export const AZURE_CLIENT_SECRET: string = env.get('AZURE_CLIENT_SECRET').required().asString();
export const AZURE_GRAPH_ENDPOINT: string = env.get('AZURE_GRAPH_ENDPOINT').required().asString();
export const AZURE_ACCOUNT_EMAIL: string = env.get('AZURE_ACCOUNT_EMAIL').required().asString();
export const AZURE_ACCOUNT_ID: string = env.get('AZURE_ACCOUNT_ID').default("").asString();