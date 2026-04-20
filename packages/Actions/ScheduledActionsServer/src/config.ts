import env from 'env-var';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

export const dbHost = env.get('DB_HOST').required().asString();
export const dbPort = env.get('DB_PORT').default('1433').asPortNumber();
export const dbUsername = env.get('DB_USERNAME').required().asString();
export const dbPassword = env.get('DB_PASSWORD').required().asString();
export const dbDatabase = env.get('DB_DATABASE').required().asString();

export const mjCoreSchema = env.get('MJ_CORE_SCHEMA').required().asString();

export const currentUserEmail = env.get('CURRENT_USER_EMAIL').required().asString();

export const serverPort = env.get('PORT').default('8000').asPortNumber();

export const autoRefreshInterval = env.get('METADATA_AUTO_REFRESH_INTERVAL').default('3600000').asIntPositive();
