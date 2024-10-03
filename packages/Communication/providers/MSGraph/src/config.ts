import env from 'env-var';

//Azure Related
export const AZURE_CLIENT_ID: string = env.get('AZURE_CLIENT_ID').required().asString();
export const AZURE_AAD_ENDPOINT: string = env.get('AZURE_AAD_ENDPOINT').required().asString();
export const AZURE_TENANT_ID: string = env.get('AZURE_TENANT_ID').required().asString();
export const AZURE_CLIENT_SECRET: string = env.get('AZURE_CLIENT_SECRET').required().asString();
export const AZURE_GRAPH_ENDPOINT: string = env.get('AZURE_GRAPH_ENDPOINT').required().asString();
export const AZURE_ACCOUNT_EMAIL: string = env.get('AZURE_ACCOUNT_EMAIL').required().asString();
export const AZURE_ACCOUNT_ID: string = env.get('AZURE_ACCOUNT_ID').default("").asString();