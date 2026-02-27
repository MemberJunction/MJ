import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { MJGlobal } from "@memberjunction/global";
import { RunView } from "@memberjunction/core";
import { MJFileStorageAccountEntity, MJFileStorageProviderEntity } from "@memberjunction/core-entities";
import { BaseFileStorageAction } from "./base-file-storage.action";
import { BaseAction } from "@memberjunction/actions";

/**
 * Action that retrieves a list of configured file storage accounts.
 *
 * This action returns storage accounts that are configured in the enterprise model,
 * along with their associated provider information. Storage accounts link to
 * providers (Google Drive, Dropbox, etc.) and credentials managed at the org level.
 *
 * This is useful for AI agents to discover what storage accounts are available
 * before attempting to search or access files.
 *
 * @example
 * ```typescript
 * // Get all available storage accounts
 * await runAction({
 *   ActionName: 'List Storage Accounts',
 *   Params: []
 * });
 *
 * // Get only accounts that support search
 * await runAction({
 *   ActionName: 'List Storage Accounts',
 *   Params: [{
 *     Name: 'SearchSupportedOnly',
 *     Value: true
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "List Storage Accounts")
export class ListStorageAccountsAction extends BaseFileStorageAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        // Optional parameter to filter only accounts whose provider supports search
        const searchSupportedOnly = this.getBooleanParam(params, "searchsupportedonly", false);

        try {
            const rv = new RunView();

            // Load accounts and providers in parallel
            const [accountsResult, providersResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: File Storage Accounts',
                    ExtraFilter: '',
                    OrderBy: 'Name',
                    ResultType: 'entity_object'
                },
                {
                    EntityName: 'MJ: File Storage Providers',
                    ExtraFilter: 'IsActive=1',
                    OrderBy: 'Name',
                    ResultType: 'entity_object'
                }
            ], params.ContextUser);

            if (!accountsResult.Success) {
                return this.createErrorResult(
                    `Failed to retrieve storage accounts: ${accountsResult.ErrorMessage}`,
                    "QUERY_FAILED"
                );
            }

            if (!providersResult.Success) {
                return this.createErrorResult(
                    `Failed to retrieve storage providers: ${providersResult.ErrorMessage}`,
                    "QUERY_FAILED"
                );
            }

            const accounts = accountsResult.Results as MJFileStorageAccountEntity[] || [];
            const providers = providersResult.Results as MJFileStorageProviderEntity[] || [];

            // Create provider lookup map
            const providerMap = new Map<string, MJFileStorageProviderEntity>();
            providers.forEach(p => providerMap.set(p.ID, p));

            const availableAccounts: Array<{
                Name: string;
                Description: string;
                ProviderName: string;
                ProviderType: string;
                SupportsSearch: boolean;
                HasCredential: boolean;
            }> = [];

            for (const account of accounts) {
                const provider = providerMap.get(account.ProviderID);
                if (!provider) {
                    continue; // Skip accounts with inactive/missing providers
                }

                const supportsSearch = provider.Get('SupportsSearch') ?? false;

                // Skip if filtering for search-only and this provider doesn't support it
                if (searchSupportedOnly && !supportsSearch) {
                    continue;
                }

                availableAccounts.push({
                    Name: account.Name,
                    Description: account.Description || '',
                    ProviderName: provider.Name,
                    ProviderType: provider.ServerDriverKey,
                    SupportsSearch: supportsSearch,
                    HasCredential: !!account.CredentialID
                });
            }

            // Calculate counts
            const searchSupportedCount = availableAccounts.filter(a => a.SupportsSearch).length;
            const totalCount = availableAccounts.length;

            // Create detailed result message
            let message = `Found ${totalCount} storage account(s)`;
            if (searchSupportedOnly) {
                message += ` with search support`;
            } else {
                message += ` (${searchSupportedCount} support search)`;
            }

            // Add account details to message for LLM visibility
            message += '\n\nAvailable Storage Accounts:';
            for (const account of availableAccounts) {
                message += `\n- ${account.Name} (${account.ProviderName})`;
                if (account.SupportsSearch) {
                    message += ' - Supports Search';
                }
            }

            // Build output parameters array
            const outputParams: ActionParam[] = [
                {
                    Name: 'Accounts',
                    Value: availableAccounts,
                    Type: 'Output'
                },
                {
                    Name: 'TotalCount',
                    Value: totalCount,
                    Type: 'Output'
                },
                {
                    Name: 'SearchSupportedCount',
                    Value: searchSupportedCount,
                    Type: 'Output'
                }
            ];

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: message,
                Params: outputParams
            } as ActionResultSimple;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return this.createErrorResult(
                `Failed to list storage accounts: ${errorMessage}`,
                "LIST_FAILED"
            );
        }
    }
}