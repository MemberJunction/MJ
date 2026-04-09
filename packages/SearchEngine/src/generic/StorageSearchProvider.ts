/**
 * @fileoverview Storage search provider for file storage accounts.
 *
 * Searches files across MJ File Storage accounts that have
 * IncludeInGlobalSearch=true, using each provider's native search API.
 * Results are permission-checked against FileStorageAccountPermission
 * before being returned.
 *
 * @module @memberjunction/search-engine
 */

import { LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import {
    MJFileStorageAccountEntity,
    MJFileStorageAccountPermissionEntity,
    MJFileStorageProviderEntity
} from '@memberjunction/core-entities';
import {
    FileSearchResult,
    FileSearchOptions,
    initializeDriverWithAccountCredentials
} from '@memberjunction/storage';
import { ISearchProvider } from './ISearchProvider';
import { SearchSource, SearchFilters, SearchResultItem } from './search.types';

/**
 * Represents a storage account that is eligible for search, along with
 * its associated provider metadata.
 */
interface SearchableAccount {
    Account: MJFileStorageAccountEntity;
    Provider: MJFileStorageProviderEntity;
}

/**
 * Provides file-level search across MJ File Storage accounts using each
 * provider's native SearchFiles() API. Only accounts with
 * IncludeInGlobalSearch=true and providers with SupportsSearch=true are searched.
 *
 * Permission checking is performed against FileStorageAccountPermission records.
 * If no permission records exist for an account, it is accessible to everyone
 * (backwards compatible). Otherwise, the user must have CanRead=true via a
 * direct User permission, a Role permission, or an Everyone permission.
 */
export class StorageSearchProvider implements ISearchProvider {
    public readonly SourceType: SearchSource = 'storage';

    private _available = false;
    private _searchableAccounts: SearchableAccount[] = [];
    private _permissions: MJFileStorageAccountPermissionEntity[] = [];

    /**
     * Whether this provider has at least one searchable storage account.
     */
    public IsAvailable(): boolean {
        return this._available;
    }

    /**
     * Load storage accounts and permissions to determine availability.
     * Must be called once during SearchEngine.Config().
     *
     * @param contextUser - The user context for database queries
     */
    public async CheckAvailability(contextUser: UserInfo): Promise<void> {
        try {
            const rv = new RunView();
            const [accountsResult, providersResult, permissionsResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: File Storage Accounts',
                    ExtraFilter: 'IncludeInGlobalSearch = 1',
                    ResultType: 'entity_object'
                },
                {
                    EntityName: 'MJ: File Storage Providers',
                    ExtraFilter: 'IsActive = 1 AND SupportsSearch = 1',
                    ResultType: 'entity_object'
                },
                {
                    EntityName: 'MJ: File Storage Account Permissions',
                    ExtraFilter: '',
                    ResultType: 'entity_object'
                }
            ], contextUser);

            if (!accountsResult.Success || !providersResult.Success) {
                LogError('StorageSearchProvider: Failed to load storage accounts or providers');
                this._available = false;
                return;
            }

            const accounts = accountsResult.Results as MJFileStorageAccountEntity[];
            const providers = providersResult.Results as MJFileStorageProviderEntity[];
            this._permissions = permissionsResult.Success
                ? permissionsResult.Results as MJFileStorageAccountPermissionEntity[]
                : [];

            // Build a set of provider IDs that support search
            const searchProviderIDs = new Set(
                providers.map(p => NormalizeUUID(p.ID))
            );

            // Filter accounts to those whose provider supports search
            this._searchableAccounts = [];
            for (const account of accounts) {
                if (searchProviderIDs.has(NormalizeUUID(account.ProviderID))) {
                    const provider = providers.find(
                        p => NormalizeUUID(p.ID) === NormalizeUUID(account.ProviderID)
                    );
                    if (provider) {
                        this._searchableAccounts.push({ Account: account, Provider: provider });
                    }
                }
            }

            this._available = this._searchableAccounts.length > 0;
            LogStatus(
                `StorageSearchProvider: Found ${this._searchableAccounts.length} searchable storage account(s)`
            );
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`StorageSearchProvider: CheckAvailability failed: ${msg}`);
            this._available = false;
        }
    }

    /**
     * Execute a file search across all eligible storage accounts.
     *
     * @param query - The search query text
     * @param topK - Maximum number of results to retrieve
     * @param _filters - Optional filters (currently unused for storage search)
     * @param contextUser - The user performing the search
     * @returns Scored result items from storage search
     */
    public async Search(
        query: string,
        topK: number,
        _filters: SearchFilters | undefined,
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        if (!this._available || this._searchableAccounts.length === 0) {
            return [];
        }

        const startTime = Date.now();

        // Filter accounts by user permissions
        const accessibleAccounts = this.filterAccountsByPermissions(
            this._searchableAccounts,
            contextUser
        );

        if (accessibleAccounts.length === 0) {
            LogStatus('StorageSearchProvider: User has no access to any searchable storage accounts');
            return [];
        }

        // Distribute topK across accounts
        const perAccountLimit = Math.max(3, Math.ceil(topK / accessibleAccounts.length));

        // Search all accounts in parallel
        const searchPromises = accessibleAccounts.map(entry =>
            this.searchOneAccount(entry, query, perAccountLimit, contextUser)
        );

        const results = await Promise.all(searchPromises);
        const allResults = results.flat();

        // Sort by score descending and limit to topK
        allResults.sort((a, b) => b.Score - a.Score);
        const trimmed = allResults.slice(0, topK);

        LogStatus(
            `StorageSearchProvider: Search complete in ${Date.now() - startTime}ms - ` +
            `${trimmed.length} results from ${accessibleAccounts.length} account(s)`
        );

        return trimmed;
    }

    /**
     * Filter storage accounts by checking FileStorageAccountPermission records
     * for the given user. If an account has no permission records, it is
     * accessible to everyone (backwards compatible).
     */
    private filterAccountsByPermissions(
        accounts: SearchableAccount[],
        contextUser: UserInfo
    ): SearchableAccount[] {
        const normalizedUserID = NormalizeUUID(contextUser.ID);
        const userRoleIDs = new Set(
            (contextUser.UserRoles ?? []).map(r => NormalizeUUID(r.RoleID))
        );

        return accounts.filter(entry => {
            const accountPerms = this._permissions.filter(
                p => NormalizeUUID(p.FileStorageAccountID) === NormalizeUUID(entry.Account.ID)
            );

            // No permission records means open access (backwards compatible)
            if (accountPerms.length === 0) {
                return true;
            }

            // Check if user has CanRead through any permission path
            return accountPerms.some(perm => {
                if (!perm.CanRead) return false;

                switch (perm.Type) {
                    case 'Everyone':
                        return true;
                    case 'User':
                        return perm.UserID != null &&
                            NormalizeUUID(perm.UserID) === normalizedUserID;
                    case 'Role':
                        return perm.RoleID != null &&
                            userRoleIDs.has(NormalizeUUID(perm.RoleID));
                    default:
                        return false;
                }
            });
        });
    }

    /**
     * Search a single storage account using the provider's native SearchFiles API.
     */
    private async searchOneAccount(
        entry: SearchableAccount,
        query: string,
        maxResults: number,
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        try {
            const driver = await initializeDriverWithAccountCredentials({
                accountEntity: entry.Account,
                providerEntity: entry.Provider,
                contextUser
            });

            if (!driver.IsConfigured) {
                LogError(
                    `StorageSearchProvider: Driver for account "${entry.Account.Name}" ` +
                    `is not configured, skipping`
                );
                return [];
            }

            const searchOptions: FileSearchOptions = {
                maxResults,
                searchContent: true
            };

            const resultSet = await driver.SearchFiles(query, searchOptions);
            return this.convertResults(resultSet.results, entry.Account, query);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(
                `StorageSearchProvider: Error searching account "${entry.Account.Name}": ${msg}`
            );
            return [];
        }
    }

    /**
     * Convert FileSearchResult items to SearchResultItem format with relevance scores.
     */
    private convertResults(
        files: FileSearchResult[],
        account: MJFileStorageAccountEntity,
        query: string
    ): SearchResultItem[] {
        return files.map((file, index) => {
            const score = this.calculateScore(file, query, index, files.length);
            const snippet = this.buildSnippet(file, account);

            return {
                ID: `storage-${NormalizeUUID(account.ID)}-${file.objectId ?? file.path}`,
                EntityName: 'MJ: File Storage Accounts',
                RecordID: account.ID,
                SourceType: 'storage',
                Title: file.name,
                Snippet: snippet,
                Score: Math.round(score * 100) / 100,
                ScoreBreakdown: { Storage: Math.round(score * 100) / 100 },
                Tags: this.buildTags(file, account),
                EntityIcon: 'fa-solid fa-folder-open',
                MatchedAt: new Date()
            };
        });
    }

    /**
     * Calculate a relevance score for a file search result.
     * Uses the provider's relevance score if available, otherwise
     * falls back to a rank-based score with name-match boosting.
     */
    private calculateScore(
        file: FileSearchResult,
        query: string,
        rankIndex: number,
        totalResults: number
    ): number {
        // If the provider gave us a relevance score, use it (normalized to 0-0.95 range)
        if (file.relevance != null && file.relevance > 0) {
            return Math.min(file.relevance * 0.95, 0.95);
        }

        // Rank-based fallback: higher rank = higher score
        const rankScore = totalResults > 1
            ? 0.3 + (0.35 * (1 - rankIndex / totalResults))
            : 0.5;

        // Boost if query appears in the filename
        const queryLower = query.toLowerCase();
        const nameMatch = file.name.toLowerCase().includes(queryLower);
        const nameBoost = nameMatch ? 0.25 : 0;

        return Math.min(rankScore + nameBoost, 0.95);
    }

    /**
     * Build a display snippet for a file search result.
     */
    private buildSnippet(
        file: FileSearchResult,
        account: MJFileStorageAccountEntity
    ): string {
        if (file.excerpt) {
            // Strip HTML tags from provider excerpts
            const cleanExcerpt = file.excerpt.replace(/<[^>]*>/g, '');
            return cleanExcerpt.length > 200
                ? cleanExcerpt.substring(0, 200) + '...'
                : cleanExcerpt;
        }

        const parts: string[] = [];
        parts.push(`File in ${account.Name}`);
        if (file.path && file.path !== file.name) {
            parts.push(`Path: ${file.path}`);
        }
        if (file.size > 0) {
            parts.push(`Size: ${this.formatFileSize(file.size)}`);
        }
        return parts.join(' | ');
    }

    /**
     * Build tags for a file search result.
     */
    private buildTags(
        file: FileSearchResult,
        account: MJFileStorageAccountEntity
    ): string[] {
        const tags: string[] = [account.Name];

        // Add file extension as a tag
        const dotIndex = file.name.lastIndexOf('.');
        if (dotIndex > 0) {
            tags.push(file.name.substring(dotIndex + 1).toUpperCase());
        }

        if (file.matchInFilename) {
            tags.push('Filename Match');
        }

        return tags;
    }

    /**
     * Format a file size in bytes to a human-readable string.
     */
    private formatFileSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
}
