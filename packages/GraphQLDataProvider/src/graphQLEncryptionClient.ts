import { LogError } from "@memberjunction/core";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { gql } from "graphql-request";

/**
 * Result of creating an API key
 */
export interface CreateAPIKeyResult {
    /** Whether the operation succeeded */
    Success: boolean;
    /** The raw API key - show once and cannot be recovered */
    RawKey?: string;
    /** The database ID of the created key */
    APIKeyID?: string;
    /** Error message if operation failed */
    Error?: string;
}

/**
 * Parameters for creating an API key
 */
export interface CreateAPIKeyParams {
    /** Human-readable label for the key */
    Label: string;
    /** Optional description */
    Description?: string;
    /** Optional expiration date */
    ExpiresAt?: Date;
    /** Optional scope IDs to assign */
    ScopeIDs?: string[];
}

/**
 * Result of revoking an API key
 */
export interface RevokeAPIKeyResult {
    /** Whether the operation succeeded */
    Success: boolean;
    /** Error message if operation failed */
    Error?: string;
}

/**
 * Client for encryption-related GraphQL operations.
 *
 * This client provides methods for operations that require server-side
 * cryptographic processing, such as API key generation. These operations
 * cannot be performed client-side because they require secure random
 * number generation and cryptographic hashing that must match the
 * server's validation logic.
 *
 * @example
 * ```typescript
 * // Create the client
 * const encryptionClient = new GraphQLEncryptionClient(graphQLProvider);
 *
 * // Create a new API key
 * const result = await encryptionClient.CreateAPIKey({
 *   Label: 'My Integration Key',
 *   Description: 'Used for external service access',
 *   ExpiresAt: new Date('2025-12-31'),
 *   ScopeIDs: ['scope-id-1', 'scope-id-2']
 * });
 *
 * if (result.Success) {
 *   // Show rawKey to user ONCE - cannot be recovered
 *   console.log('Save this key:', result.RawKey);
 * }
 * ```
 */
export class GraphQLEncryptionClient {
    /**
     * The GraphQLDataProvider instance used to execute GraphQL requests
     */
    private _dataProvider: GraphQLDataProvider;

    /**
     * Creates a new GraphQLEncryptionClient instance.
     * @param dataProvider The GraphQL data provider to use for queries
     */
    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    /**
     * Creates a new API key with secure server-side cryptographic hashing.
     *
     * This method calls the server to:
     * 1. Generate a cryptographically secure random API key
     * 2. Hash the key using SHA-256 for secure storage
     * 3. Store only the hash in the database
     * 4. Return the raw key ONCE
     *
     * **CRITICAL**: The raw key is returned only once and cannot be recovered.
     * Instruct users to save it immediately in a secure location.
     *
     * @param params Configuration for the new API key
     * @returns Result with raw key (show once!) and database ID
     *
     * @example
     * ```typescript
     * const result = await client.CreateAPIKey({
     *   Label: 'Production Integration',
     *   Description: 'API access for our CRM system',
     *   ExpiresAt: new Date('2025-12-31'),
     *   ScopeIDs: ['entities:read', 'entities:write']
     * });
     *
     * if (result.Success) {
     *   alert(`Save this key now! It won't be shown again:\n${result.RawKey}`);
     * } else {
     *   console.error('Failed to create key:', result.Error);
     * }
     * ```
     */
    public async CreateAPIKey(params: CreateAPIKeyParams): Promise<CreateAPIKeyResult> {
        try {
            const variables = this.createAPIKeyVariables(params);
            const result = await this.executeCreateAPIKeyMutation(variables);
            return this.processCreateAPIKeyResult(result);
        } catch (e) {
            return this.handleCreateAPIKeyError(e);
        }
    }

    /**
     * Creates the variables for the CreateAPIKey mutation
     * @param params The API key creation parameters
     * @returns The mutation variables
     */
    private createAPIKeyVariables(params: CreateAPIKeyParams): Record<string, unknown> {
        return {
            input: {
                Label: params.Label,
                Description: params.Description,
                ExpiresAt: params.ExpiresAt?.toISOString(),
                ScopeIDs: params.ScopeIDs
            }
        };
    }

    /**
     * Executes the CreateAPIKey mutation
     * @param variables The mutation variables
     * @returns The GraphQL result
     */
    private async executeCreateAPIKeyMutation(variables: Record<string, unknown>): Promise<Record<string, unknown>> {
        const mutation = gql`
            mutation CreateAPIKey($input: CreateAPIKeyInput!) {
                CreateAPIKey(input: $input) {
                    Success
                    RawKey
                    APIKeyID
                    Error
                }
            }
        `;

        return await this._dataProvider.ExecuteGQL(mutation, variables);
    }

    /**
     * Processes the result of the CreateAPIKey mutation
     * @param result The GraphQL result
     * @returns The processed result
     */
    private processCreateAPIKeyResult(result: Record<string, unknown>): CreateAPIKeyResult {
        const data = result as { CreateAPIKey?: CreateAPIKeyResult };

        if (!data?.CreateAPIKey) {
            return {
                Success: false,
                Error: "Invalid response from server"
            };
        }

        return {
            Success: data.CreateAPIKey.Success,
            RawKey: data.CreateAPIKey.RawKey,
            APIKeyID: data.CreateAPIKey.APIKeyID,
            Error: data.CreateAPIKey.Error
        };
    }

    /**
     * Handles errors in the CreateAPIKey operation
     * @param e The error
     * @returns An error result
     */
    private handleCreateAPIKeyError(e: unknown): CreateAPIKeyResult {
        const error = e as Error;
        LogError(`Error creating API key: ${error.message}`);
        return {
            Success: false,
            Error: `Error: ${error.message}`
        };
    }

    /**
     * Revokes an API key, permanently disabling it.
     *
     * Once revoked, an API key cannot be reactivated. Users must create a new key.
     *
     * @param apiKeyId The database ID of the API key to revoke
     * @returns Result indicating success or failure
     *
     * @example
     * ```typescript
     * const result = await client.RevokeAPIKey('key-uuid-here');
     *
     * if (result.Success) {
     *   console.log('API key has been revoked');
     * } else {
     *   console.error('Failed to revoke:', result.Error);
     * }
     * ```
     */
    public async RevokeAPIKey(apiKeyId: string): Promise<RevokeAPIKeyResult> {
        try {
            const mutation = gql`
                mutation RevokeAPIKey($apiKeyId: String!) {
                    RevokeAPIKey(apiKeyId: $apiKeyId) {
                        Success
                        Error
                    }
                }
            `;

            const result = await this._dataProvider.ExecuteGQL(mutation, { apiKeyId });
            const data = result as { RevokeAPIKey?: RevokeAPIKeyResult };

            if (!data?.RevokeAPIKey) {
                return {
                    Success: false,
                    Error: "Invalid response from server"
                };
            }

            return {
                Success: data.RevokeAPIKey.Success,
                Error: data.RevokeAPIKey.Error
            };
        } catch (e) {
            const error = e as Error;
            LogError(`Error revoking API key: ${error.message}`);
            return {
                Success: false,
                Error: `Error: ${error.message}`
            };
        }
    }
}
