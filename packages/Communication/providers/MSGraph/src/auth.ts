import { ClientSecretCredential } from '@azure/identity';
import * as Config from './config';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";


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

export const ApiConfig = {
    uri: Config.AZURE_GRAPH_ENDPOINT + '/v1.0/users',
};