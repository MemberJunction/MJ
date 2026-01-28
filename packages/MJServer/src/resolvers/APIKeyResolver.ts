import { Resolver, Mutation, Arg, Ctx } from "type-graphql";
import { Field, InputType, ObjectType } from "type-graphql";
import { LogError, Metadata } from "@memberjunction/core";
import { APIKeyScopeEntity } from "@memberjunction/core-entities";
import { GetAPIKeyEngine } from "@memberjunction/api-keys";
import { AppContext } from "../types.js";
import { ResolverBase } from "../generic/ResolverBase.js";

/**
 * Input type for creating a new API key
 */
@InputType()
export class CreateAPIKeyInput {
    /**
     * Human-readable label for the API key
     */
    @Field()
    Label: string;

    /**
     * Optional description of what the key is used for
     */
    @Field(() => String, { nullable: true })
    Description?: string;

    /**
     * Optional expiration date for the key
     */
    @Field(() => Date, { nullable: true })
    ExpiresAt?: Date;

    /**
     * Optional array of scope IDs to assign to this key
     */
    @Field(() => [String], { nullable: true })
    ScopeIDs?: string[];
}

/**
 * Result type for API key creation
 * Returns the raw key ONCE - it cannot be recovered after this
 */
@ObjectType()
export class CreateAPIKeyResult {
    /**
     * Whether the key was created successfully
     */
    @Field()
    Success: boolean;

    /**
     * The raw API key - show this to the user ONCE
     * This cannot be recovered after the initial response
     */
    @Field(() => String, { nullable: true })
    RawKey?: string;

    /**
     * The database ID of the created API key
     */
    @Field(() => String, { nullable: true })
    APIKeyID?: string;

    /**
     * Error message if creation failed
     */
    @Field(() => String, { nullable: true })
    Error?: string;
}

/**
 * Result type for API key revocation
 */
@ObjectType()
export class RevokeAPIKeyResult {
    /**
     * Whether the key was revoked successfully
     */
    @Field()
    Success: boolean;

    /**
     * Error message if revocation failed
     */
    @Field(() => String, { nullable: true })
    Error?: string;
}

/**
 * Resolver for API key operations
 * Handles secure server-side API key generation
 */
@Resolver()
export class APIKeyResolver extends ResolverBase {
    /**
     * Creates a new API key with proper server-side cryptographic hashing.
     *
     * This mutation:
     * 1. Generates a cryptographically secure API key using APIKeyEngine
     * 2. Stores only the SHA-256 hash in the database (never the raw key)
     * 3. Returns the raw key ONCE - it cannot be recovered after this call
     * 4. Optionally assigns scope permissions to the key
     *
     * @param input The creation parameters
     * @param ctx The GraphQL context with authenticated user
     * @returns The raw key (show once!) and database ID
     */
    @Mutation(() => CreateAPIKeyResult)
    async CreateAPIKey(
        @Arg("input") input: CreateAPIKeyInput,
        @Ctx() ctx: AppContext
    ): Promise<CreateAPIKeyResult> {
        // Check API key scope authorization for API key creation
        await this.CheckAPIKeyScopeAuthorization('apikey:create', '*', ctx.userPayload);

        try {
            // Get the authenticated user
            const user = ctx.userPayload.userRecord;
            if (!user) {
                return {
                    Success: false,
                    Error: "User is not authenticated"
                };
            }

            // Use APIKeyEngine to create the API key with proper server-side crypto
            const apiKeyEngine = GetAPIKeyEngine();
            const result = await apiKeyEngine.CreateAPIKey(
                {
                    UserId: user.ID,
                    Label: input.Label,
                    Description: input.Description,
                    ExpiresAt: input.ExpiresAt
                },
                user
            );

            if (!result.Success) {
                return {
                    Success: false,
                    Error: result.Error || "Failed to create API key"
                };
            }

            // Save scope associations if provided
            if (input.ScopeIDs && input.ScopeIDs.length > 0 && result.APIKeyId) {
                await this.saveScopeAssociations(result.APIKeyId, input.ScopeIDs, user);
            }

            return {
                Success: true,
                RawKey: result.RawKey,
                APIKeyID: result.APIKeyId
            };
        } catch (e) {
            const error = e as Error;
            LogError(`Error in CreateAPIKey resolver: ${error.message}`);
            return {
                Success: false,
                Error: `Error creating API key: ${error.message}`
            };
        }
    }

    /**
     * Revokes an API key, permanently disabling it.
     *
     * Once revoked, an API key cannot be reactivated. Users must create a new key.
     * This uses APIKeyEngine.RevokeAPIKey() for consistency.
     *
     * @param apiKeyId The database ID of the API key to revoke
     * @param ctx The GraphQL context with authenticated user
     * @returns Success status
     */
    @Mutation(() => RevokeAPIKeyResult)
    async RevokeAPIKey(
        @Arg("apiKeyId") apiKeyId: string,
        @Ctx() ctx: AppContext
    ): Promise<RevokeAPIKeyResult> {
        // Check API key scope authorization for API key revocation
        await this.CheckAPIKeyScopeAuthorization('apikey:revoke', apiKeyId, ctx.userPayload);

        try {
            const user = ctx.userPayload.userRecord;
            if (!user) {
                return {
                    Success: false,
                    Error: "User is not authenticated"
                };
            }

            const apiKeyEngine = GetAPIKeyEngine();
            const result = await apiKeyEngine.RevokeAPIKey(apiKeyId, user);

            if (result) {
                return { Success: true };
            } else {
                return {
                    Success: false,
                    Error: "Failed to revoke API key. It may not exist or you may not have permission."
                };
            }
        } catch (e) {
            const error = e as Error;
            LogError(`Error in RevokeAPIKey resolver: ${error.message}`);
            return {
                Success: false,
                Error: `Error revoking API key: ${error.message}`
            };
        }
    }

    /**
     * Saves scope associations for the newly created API key
     * @param apiKeyId The ID of the created API key
     * @param scopeIds Array of scope IDs to associate
     * @param user The context user
     */
    private async saveScopeAssociations(
        apiKeyId: string,
        scopeIds: string[],
        user: any
    ): Promise<void> {
        const md = new Metadata();

        for (const scopeId of scopeIds) {
            try {
                const keyScope = await md.GetEntityObject<APIKeyScopeEntity>(
                    'MJ: API Key Scopes',
                    user
                );
                keyScope.APIKeyID = apiKeyId;
                keyScope.ScopeID = scopeId;
                await keyScope.Save();
            } catch (error) {
                LogError(`Error saving scope association for API key ${apiKeyId}, scope ${scopeId}: ${error}`);
                // Continue with other scopes even if one fails
            }
        }
    }
}
