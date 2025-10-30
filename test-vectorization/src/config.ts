import env from 'env-var';

export const dbHost = 'msta-devsql.database.windows.net'
export const dbPort = env.get('DB_PORT').default('1433').asPortNumber();
export const dbUsername = 'MJ_CodeGen_Dev'
export const dbPassword = 'kT4*Mkb)r90$NsaIduN9KTLR'
export const dbDatabase = 'CDP'
export const dbInstanceName = env.get('DB_INSTANCE_NAME').asString();
export const dbTrustServerCertificate = env.get('DB_TRUST_SERVER_CERTIFICATE').asBool();

export const outputCode = env.get('OUTPUT_CODE').asString();
export const configFile = env.get('CONFIG_FILE').asString();

export const mjCoreSchema = env.get('MJ_CORE_SCHEMA').default('__mj').asString();

export const graphqlPort = env.get('GRAPHQL_PORT').default('4000').asPortNumber();
