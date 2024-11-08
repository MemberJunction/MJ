import env from 'env-var';

export const dbHost: string = env.get('DB_HOST').required().asString();
export const dbPort: number = env.get('DB_PORT').default('1433').asPortNumber();
export const dbUsername: string = env.get('DB_USERNAME').required().asString();
export const dbPassword: string = env.get('DB_PASSWORD').required().asString();
export const dbDatabase: string = env.get('DB_DATABASE').required().asString();
export const dbInstanceName: string | undefined = env.get('DB_INSTANCE_NAME').asString();
export const dbTrustServerCertificate: boolean | undefined = env.get('DB_TRUST_SERVER_CERTIFICATE').default('true').asBool();
export const dbRequestTimeout: number | undefined = env.get('DB_REQUEST_TIMEOUT').default(120000).asInt();
export const CurrentUserEmail: string = env.get('CURRENT_USER_EMAIL').default('not.set@nowhere.com').asString();
export const mjCoreSchema = env.get('MJ_CORE_SCHEMA').default('__mj').asString();
export const dataModifierClassName = env.get('DATAMODIFIER_SUBCLASS_NAME').required().asString();
export const messageBuilderClassName = env.get('MESSAGEBUILDER_SUBCLASS_NAME').required().asString();
export const communicationProviderDomain: string = env.get('COMMUNICATION_PROVIDER_DOMAIN').required().asString();