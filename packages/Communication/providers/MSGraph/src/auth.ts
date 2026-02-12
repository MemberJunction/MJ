import { ClientSecretCredential } from '@azure/identity';
import * as Config from './config';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";

let _graphClient: Client | null = null;
let _apiConfig: { uri: string } | null = null;

/**
 * Validates that all required Azure configuration is present.
 * Throws a descriptive error if any required values are missing.
 */
function validateAzureConfig(): void {
    const missingVars: string[] = [];

    if (!Config.AZURE_TENANT_ID) missingVars.push('AZURE_TENANT_ID');
    if (!Config.AZURE_CLIENT_ID) missingVars.push('AZURE_CLIENT_ID');
    if (!Config.AZURE_CLIENT_SECRET) missingVars.push('AZURE_CLIENT_SECRET');
    if (!Config.AZURE_ACCOUNT_EMAIL) missingVars.push('AZURE_ACCOUNT_EMAIL');

    if (missingVars.length > 0) {
        throw new Error(
            `MSGraphProvider requires Azure configuration but the following environment variables are not set: ${missingVars.join(', ')}. ` +
            `Please set these variables in your .env file:\n` +
            `  AZURE_TENANT_ID=<your-tenant-id>\n` +
            `  AZURE_CLIENT_ID=<your-client-id>\n` +
            `  AZURE_CLIENT_SECRET=<your-client-secret>\n` +
            `  AZURE_ACCOUNT_EMAIL=<service-account-email>\n` +
            `  AZURE_AAD_ENDPOINT=https://login.microsoftonline.com (optional, has default)\n` +
            `  AZURE_GRAPH_ENDPOINT=https://graph.microsoft.com (optional, has default)\n` +
            `If you don't need MS Graph functionality, you can ignore this error - it only occurs when the provider is actually used.`
        );
    }
}

/**
 * Lazy initialization of GraphClient.
 * Only creates the client when first accessed, after validating configuration.
 */
export function getGraphClient(): Client {
    if (!_graphClient) {
        validateAzureConfig();

        const credential: ClientSecretCredential = new ClientSecretCredential(
            Config.AZURE_TENANT_ID,
            Config.AZURE_CLIENT_ID,
            Config.AZURE_CLIENT_SECRET
        );

        // @microsoft/microsoft-graph-client/authProviders/azureTokenCredentials
        const authProvider: TokenCredentialAuthenticationProvider = new TokenCredentialAuthenticationProvider(credential, {
            // The client credentials flow requires that you request the
            // /.default scope, and pre-configure your permissions on the
            // app registration in Azure. An administrator must grant consent
            // to those permissions beforehand.
            scopes: ['https://graph.microsoft.com/.default'],
        });

        _graphClient = Client.initWithMiddleware({ authProvider: authProvider });
    }

    return _graphClient;
}

/**
 * Lazy initialization of API configuration.
 * Only creates the config when first accessed.
 */
export function getApiConfig(): { uri: string } {
    if (!_apiConfig) {
        _apiConfig = {
            uri: Config.AZURE_GRAPH_ENDPOINT + '/v1.0/users',
        };
    }
    return _apiConfig;
}

// Backward compatibility exports (deprecated - use getter functions instead)
export const GraphClient: Client = new Proxy({} as Client, {
    get(_target, prop) {
        return getGraphClient()[prop as keyof Client];
    }
});

export const ApiConfig = new Proxy({} as { uri: string }, {
    get(_target, prop) {
        return getApiConfig()[prop as keyof { uri: string }];
    }
});