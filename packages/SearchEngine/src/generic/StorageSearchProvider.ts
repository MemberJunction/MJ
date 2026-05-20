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
import { NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    MJFileStorageAccountEntity,
    MJFileStorageAccountPermissionEntity,
    MJFileStorageProviderEntity
} from '@memberjunction/core-entities';
import {
    FileSearchResult,
    FileSearchOptions,
    FileStorageEngine
} from '@memberjunction/storage';
import { BaseSearchProvider } from './ISearchProvider';
import { SearchSource, SearchFilters, SearchResultItem, SearchResultType, ScopeConstraints, ScopeStorageConstraint } from './search.types';

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
@RegisterClass(BaseSearchProvider, 'StorageSearchProvider')
export class StorageSearchProvider extends BaseSearchProvider {
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
            // Use cached accounts and providers from the engine — no RunView needed for these
            await FileStorageEngine.Instance.Config(false, contextUser);
            const allAccounts = FileStorageEngine.Instance.Accounts;
            const allProviders = FileStorageEngine.Instance.Providers;

            // Filter to accounts with IncludeInGlobalSearch and active providers that support search
            const accounts = allAccounts.filter(a => a.Get('IncludeInGlobalSearch') === true);
            const providers = allProviders.filter(p => p.IsActive && p.Get('SupportsSearch') === true);

            // Permissions are user-context-dependent, so we still need a RunView for these
            const rv = new RunView();
            const permissionsResult = await rv.RunView<MJFileStorageAccountPermissionEntity>({
                EntityName: 'MJ: File Storage Account Permissions',
                ResultType: 'entity_object'
            }, contextUser);

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
                        p => UUIDsEqual(p.ID, account.ProviderID)
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
        contextUser: UserInfo,
        scopeConstraints?: ScopeConstraints
    ): Promise<SearchResultItem[]> {
        if (!this._available || this._searchableAccounts.length === 0) {
            return [];
        }

        const startTime = Date.now();

        // Honor per-provider query transform
        const effectiveQuery = scopeConstraints?.QueryTransforms?.[this.SourceType] ?? query;

        // Narrow the account list per scope if provided. Scope folder paths are already
        // rendered (Nunjucks + SearchContext applied by SearchEngine) — we pass them
        // through to the driver per-account.
        const scopedAccounts = this.applyScopeAccountFilter(
            this._searchableAccounts,
            scopeConstraints?.StorageAccounts
        );

        if (scopedAccounts.length === 0) {
            // Scope explicitly says "none of these storage accounts" — return empty.
            return [];
        }

        // Filter accounts by user permissions (existing push-down)
        const accessibleAccounts = this.filterAccountsByPermissions(scopedAccounts, contextUser);

        if (accessibleAccounts.length === 0) {
            LogStatus('StorageSearchProvider: User has no access to any searchable storage accounts');
            return [];
        }

        // Distribute topK across accounts
        const perAccountLimit = Math.max(3, Math.ceil(topK / accessibleAccounts.length));

        // Search all accounts in parallel, threading per-account FolderPath (if any)
        const searchPromises = accessibleAccounts.map(entry => {
            const scopeRow = scopeConstraints?.StorageAccounts?.find(
                r => UUIDsEqual(r.FileStorageAccountID, entry.Account.ID)
            );
            return this.searchOneAccount(entry, effectiveQuery, perAccountLimit, contextUser, scopeRow?.FolderPath);
        });

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
     * Restrict the searchable account list to the scope's allowed set. When the scope
     * does not restrict (or the list is empty), returns the accounts unchanged.
     */
    private applyScopeAccountFilter(
        accounts: SearchableAccount[],
        scopeRows: ScopeStorageConstraint[] | undefined
    ): SearchableAccount[] {
        if (!scopeRows || scopeRows.length === 0) return accounts;
        const allowedIDs = new Set(scopeRows.map(r => NormalizeUUID(r.FileStorageAccountID)));
        return accounts.filter(a => allowedIDs.has(NormalizeUUID(a.Account.ID)));
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
        // userRoleIDs is normalized for Set-key lookups (the canonical idiom);
        // user ID equality goes through UUIDsEqual since there's only one user
        // per call, so we don't need a hoisted-normalize hot-loop optimization.
        const userRoleIDs = new Set(
            (contextUser.UserRoles ?? []).map(r => NormalizeUUID(r.RoleID))
        );

        return accounts.filter(entry => {
            const accountPerms = this._permissions.filter(
                p => UUIDsEqual(p.FileStorageAccountID, entry.Account.ID)
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
                            UUIDsEqual(perm.UserID, contextUser.ID);
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
     * If `folderPath` is supplied (from a scope), results are filtered to that prefix
     * after the driver returns — most drivers do not natively support a path filter.
     */
    private async searchOneAccount(
        entry: SearchableAccount,
        query: string,
        maxResults: number,
        contextUser: UserInfo,
        folderPath?: string
    ): Promise<SearchResultItem[]> {
        try {
            const driver = await FileStorageEngine.Instance.GetDriver(entry.Account.ID, contextUser);

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
            let files = resultSet.results;
            if (folderPath && folderPath.trim()) {
                const prefix = folderPath.endsWith('/') ? folderPath : folderPath + '/';
                files = files.filter(f => (f.path ?? '').startsWith(prefix));
            }
            return this.convertResults(files, entry.Account, query);
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
                EntityName: account.Name,
                RecordID: file.objectId ?? file.path,
                SourceType: 'storage',
                ResultType: 'storage-file' as SearchResultType,
                Title: file.name,
                Snippet: snippet,
                Score: Math.round(score * 100) / 100,
                ScoreBreakdown: { Storage: Math.round(score * 100) / 100 },
                Tags: this.buildTags(file, account),
                EntityIcon: this.getFileIcon(file),
                RecordName: file.name,
                MatchedAt: file.lastModified ?? new Date(),
                RawMetadata: JSON.stringify({
                    accountId: account.ID,
                    accountName: account.Name,
                    path: file.path,
                    size: file.size,
                    contentType: file.contentType,
                    objectId: file.objectId
                })
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
        const parts: string[] = [];

        // If provider returned a content excerpt, lead with that
        if (file.excerpt) {
            const cleanExcerpt = file.excerpt.replace(/<[^>]*>/g, '').trim();
            if (cleanExcerpt.length > 0) {
                parts.push(cleanExcerpt.length > 150 ? cleanExcerpt.substring(0, 150) + '...' : cleanExcerpt);
            }
        }

        // Build metadata line: provider · path · size · modified
        const meta: string[] = [];
        meta.push(account.Name);
        if (file.path && file.path !== file.name) {
            // Show folder path without the filename
            const folder = file.path.substring(0, file.path.lastIndexOf('/')) || '/';
            meta.push(folder);
        }
        if (file.size > 0) {
            meta.push(this.formatFileSize(file.size));
        }
        if (file.contentType) {
            meta.push(file.contentType);
        }
        parts.push(meta.join(' · '));

        return parts.join('\n');
    }

    /**
     * Build tags for a file search result.
     */
    private buildTags(
        _file: FileSearchResult,
        _account: MJFileStorageAccountEntity
    ): string[] {
        // Storage files don't use MJ tags — file type and provider are shown
        // in dedicated filter sections (File Type, Source) instead
        return [];
    }

    /**
     * Get an appropriate Font Awesome icon for a file based on its extension/content type.
     */
    private getFileIcon(file: FileSearchResult): string {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        const type = file.contentType?.toLowerCase() ?? '';

        // PDFs
        if (ext === 'pdf' || type.includes('pdf')) return 'fa-solid fa-file-pdf';
        // Images
        if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext) || type.startsWith('image/'))
            return 'fa-solid fa-file-image';
        // Spreadsheets
        if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext) || type.includes('spreadsheet'))
            return 'fa-solid fa-file-excel';
        // Documents
        if (['docx', 'doc', 'rtf', 'odt'].includes(ext) || type.includes('document') || type.includes('msword'))
            return 'fa-solid fa-file-word';
        // Presentations
        if (['pptx', 'ppt', 'odp'].includes(ext) || type.includes('presentation'))
            return 'fa-solid fa-file-powerpoint';
        // Code / text
        if (['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'html', 'css', 'js', 'ts'].includes(ext) || type.startsWith('text/'))
            return 'fa-solid fa-file-code';
        // Archives
        if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext) || type.includes('archive') || type.includes('zip'))
            return 'fa-solid fa-file-zipper';
        // Audio
        if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext) || type.startsWith('audio/'))
            return 'fa-solid fa-file-audio';
        // Video
        if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext) || type.startsWith('video/'))
            return 'fa-solid fa-file-video';
        // Default
        return 'fa-solid fa-file';
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
