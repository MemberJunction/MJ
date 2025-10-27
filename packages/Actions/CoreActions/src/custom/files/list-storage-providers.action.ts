import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { MJGlobal } from "@memberjunction/global";
import { RunView } from "@memberjunction/core";
import { FileStorageProviderEntity } from "@memberjunction/core-entities";
import { FileStorageBase } from "@memberjunction/storage";
import { BaseFileStorageAction } from "./base-file-storage.action";
import { BaseAction } from "@memberjunction/actions";

/**
 * Action that retrieves a list of active and available file storage providers.
 *
 * This action returns storage providers that are:
 * 1. Marked as IsActive=true in the database
 * 2. Actually available/configured in the running environment
 *
 * This is useful for AI agents (particularly Research Agent) to discover
 * what storage providers are available before attempting to search or access files.
 *
 * Providers are configured in the File Storage Providers entity and can include:
 * - Google Drive
 * - SharePoint
 * - Dropbox
 * - Box
 * - AWS S3
 * - Azure Blob Storage
 * - Google Cloud Storage
 *
 * @example
 * ```typescript
 * // Get all available storage providers
 * await runAction({
 *   ActionName: 'List Storage Providers',
 *   Params: []
 * });
 *
 * // Get only providers that support search
 * await runAction({
 *   ActionName: 'List Storage Providers',
 *   Params: [{
 *     Name: 'SearchSupportedOnly',
 *     Value: true
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "List Storage Providers")
export class ListStorageProvidersAction extends BaseFileStorageAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        // Optional parameter to filter only providers that support search
        const searchSupportedOnly = this.getBooleanParam(params, "searchsupportedonly", false);

        try {
            // Build filter for active providers, optionally filtering for search support
            let extraFilter = "IsActive=1";
            if (searchSupportedOnly) {
                extraFilter += " AND SupportsSearch=1";
            }

            // Query for active file storage providers from database
            const rv = new RunView();
            const result = await rv.RunView<FileStorageProviderEntity>({
                EntityName: 'File Storage Providers',
                ExtraFilter: extraFilter,
                OrderBy: 'Priority, Name',
                ResultType: 'entity_object'
            }, params.ContextUser);

            if (!result.Success) {
                return this.createErrorResult(
                    `Failed to retrieve storage providers: ${result.ErrorMessage}`,
                    "QUERY_FAILED"
                );
            }

            const dbProviders = result.Results || [];
            const availableProviders: Array<{
                Name: string;
                Description: string;
                ServerDriverKey: string;
                SupportsSearch: boolean;
                IsConfigured: boolean;
                ConfigurationError?: string;
            }> = [];

            // Check which providers are actually available in the running environment
            for (const provider of dbProviders) {
                // Get SupportsSearch from database column (using Get() until CodeGen regenerates entity class)
                const supportsSearch = provider.Get('SupportsSearch') ?? false;

                // Skip if filtering for search-only and this provider doesn't support it
                if (searchSupportedOnly && !supportsSearch) {
                    continue;
                }

                try {
                    // Instantiate the provider and check if it's properly configured
                    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(
                        FileStorageBase,
                        provider.ServerDriverKey
                    );

                    if (driver) {
                        // Provider is registered - check if it has required configuration
                        const isConfigured = driver.IsConfigured;

                        availableProviders.push({
                            Name: provider.Name,
                            Description: provider.Description || '',
                            ServerDriverKey: provider.ServerDriverKey,
                            SupportsSearch: supportsSearch,
                            IsConfigured: isConfigured,
                            ConfigurationError: isConfigured ? undefined : 'Missing required configuration (API keys, credentials, etc.)'
                        });
                    } else {
                        // Provider exists in DB but not registered in class factory
                        availableProviders.push({
                            Name: provider.Name,
                            Description: provider.Description || '',
                            ServerDriverKey: provider.ServerDriverKey,
                            SupportsSearch: supportsSearch,
                            IsConfigured: false,
                            ConfigurationError: 'Provider not registered in class factory'
                        });
                    }
                } catch (error) {
                    // Provider exists in DB but failed to instantiate
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    availableProviders.push({
                        Name: provider.Name,
                        Description: provider.Description || '',
                        ServerDriverKey: provider.ServerDriverKey,
                        SupportsSearch: supportsSearch,
                        IsConfigured: false,
                        ConfigurationError: `Instantiation failed: ${errorMessage}`
                    });
                }
            }

            // Calculate counts
            const configuredProviders = availableProviders.filter(p => p.IsConfigured);
            const searchSupportedCount = configuredProviders.filter(p => p.SupportsSearch).length;
            const totalCount = availableProviders.length;
            const configuredCount = configuredProviders.length;

            // Create detailed result message with provider list
            let message = `Found ${totalCount} active storage provider(s) in database`;
            if (configuredCount < totalCount) {
                message += `, ${configuredCount} configured and available`;
            } else {
                message += `, all configured and available`;
            }
            if (searchSupportedOnly) {
                message += ` with search support`;
            } else {
                message += ` (${searchSupportedCount} support search)`;
            }

            // Add provider details to message for LLM visibility
            message += '\n\nAvailable Providers:';
            for (const provider of availableProviders) {
                message += `\n- ${provider.Name}`;
                if (provider.IsConfigured) {
                    message += ` (Configured, ${provider.SupportsSearch ? 'Supports Search' : 'No Search Support'})`;
                } else {
                    message += ` (Not Configured: ${provider.ConfigurationError})`;
                }
            }

            // Build output parameters array per ActionResultSimple spec
            const outputParams: ActionParam[] = [
                {
                    Name: 'Providers',
                    Value: availableProviders,
                    Type: 'Output'
                },
                {
                    Name: 'TotalCount',
                    Value: totalCount,
                    Type: 'Output'
                },
                {
                    Name: 'ConfiguredCount',
                    Value: configuredCount,
                    Type: 'Output'
                },
                {
                    Name: 'SearchSupportedCount',
                    Value: searchSupportedCount,
                    Type: 'Output'
                }
            ];

            // Return results
            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: message,
                Params: outputParams
            } as ActionResultSimple;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return this.createErrorResult(
                `Failed to list storage providers: ${errorMessage}`,
                "LIST_FAILED"
            );
        }
    }
}

/**
 * Load function to ensure the class is registered and not tree-shaken
 */
export function LoadListStorageProvidersAction() {
    // This function call ensures the class decorator executes
    MJGlobal.Instance.ClassFactory.GetRegistration(BaseFileStorageAction, "List Storage Providers");
}
