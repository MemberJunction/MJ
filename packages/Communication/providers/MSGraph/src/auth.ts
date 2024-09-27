import { ClientSecretCredential } from '@azure/identity';
import * as Config from './config';
import msal from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";

/**
 * Configuration object to be passed to MSAL instance on creation.
 * For a full list of MSAL Node configuration parameters, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/configuration.md
 */
const msalConfig = {
    auth: {
        clientId: Config.AZURE_CLIENT_ID,
        authority: Config.AZURE_AAD_ENDPOINT + '/' + Config.AZURE_TENANT_ID,
        clientSecret: Config.AZURE_CLIENT_SECRET,
    }
};

/**
 * Initialize a confidential client application. For more info, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/initialize-confidential-client-application.md
 */
const cca: msal.ConfidentialClientApplication = new msal.ConfidentialClientApplication(msalConfig);

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
  
export const GraphClient: Client = Client.initWithMiddleware({ authProvider: authProvider });

/**
 * With client credentials flows permissions need to be granted in the portal by a tenant administrator.
 * The scope is always in the format '<resource>/.default'. For more, visit:
 * https://learn.microsoft.com/azure/active-directory/develop/v2-oauth2-client-creds-grant-flow
 */
export const TokenRequest = {
    scopes: [Config.AZURE_GRAPH_ENDPOINT + '/.default'],
};

export const ApiConfig = {
    uri: Config.AZURE_GRAPH_ENDPOINT + '/v1.0/users',
};

/**
 * Acquires token with client credentials.
 * @param {object} tokenRequest
 */
export async function GetToken(tokenRequest: msal.ClientCredentialRequest): Promise<msal.AuthenticationResult | null> {
    const authResult: msal.AuthenticationResult | null = await cca.acquireTokenByClientCredential(tokenRequest);
    return authResult;
}

/**
 * Calls the endpoint with authorization bearer token.
 * @param {string} endpoint
 */
export async function CallGraphApi<T>(endpoint: string): Promise<T | null> {
    try {
        const response: T = await GraphClient.api(endpoint).get();
        return response;
    } 
    catch (error) {
        console.log(`Error calling api: ${error}`);
        return null;
    }
};