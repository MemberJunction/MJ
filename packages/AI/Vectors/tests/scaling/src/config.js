import env from 'env-var';

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
