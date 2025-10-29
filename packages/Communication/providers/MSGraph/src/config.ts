import env from 'env-var';

/**
 * Azure/MS Graph configuration
 * These are optional at startup to allow MJAPI to run without MS Graph configured.
 * Runtime validation occurs when MSGraphProvider is instantiated.
 */
export const AZURE_CLIENT_ID: string = env.get('AZURE_CLIENT_ID').default('').asString();
export const AZURE_AAD_ENDPOINT: string = env.get('AZURE_AAD_ENDPOINT').default('https://login.microsoftonline.com').asString();
export const AZURE_TENANT_ID: string = env.get('AZURE_TENANT_ID').default('').asString();
export const AZURE_CLIENT_SECRET: string = env.get('AZURE_CLIENT_SECRET').default('').asString();
export const AZURE_GRAPH_ENDPOINT: string = env.get('AZURE_GRAPH_ENDPOINT').default('https://graph.microsoft.com').asString();
export const AZURE_ACCOUNT_EMAIL: string = env.get('AZURE_ACCOUNT_EMAIL').default('').asString();
export const AZURE_ACCOUNT_ID: string = env.get('AZURE_ACCOUNT_ID').default('').asString();