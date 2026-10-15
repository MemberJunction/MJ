/**
 * @fileoverview Storage search provider for file storage accounts.
 *
 * Searches files across MJ File Storage accounts that have
 * IncludeInGlobalSearch=true, using each provider's native search API.
 * Account permissions (`MJ: File Storage Account Permissions`) are evaluated
 * per call, for the searching user, before any account is searched.
 *
 * @module @memberjunction/search-engine
 */

import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJFileStorageAccountEntity, StorageAccountWithProvider } from '@memberjunction/core-entities';
import {
    FileSearchResult,
    FileSearchOptions,
    FileStorageEngine,
    StorageAccessEvaluator
} from '@memberjunction/storage';
import { BaseSearchProvider } from './ISearchProvider';
import type { LaneKind } from './ScopeExplanation';
import { SearchSource, SearchFilters, SearchResultItem, SearchResultType, ScopeConstraints, ScopeStorageConstraint } from './search.types';

/**
 * Represents a storage account that is eligible for search, along with
 * its associated provider metadata.
 */
type SearchableAccount = StorageAccountWithProvider;

/**
 * Provides file-level search across MJ File Storage accounts using each
 * provider's native SearchFiles() API. Only accounts with
 * IncludeInGlobalSearch=true on active providers with SupportsSearch=true are searched.
 *
 * **Nothing is snapshotted.** The searchable accounts are read at search time from
 * `FileStorageEngine.Instance.AccountsWithProviders` (a `BaseEngine` cache kept current by entity
 * events), and account permissions are evaluated per call, for the searching user, through
 * `StorageAccessEvaluator` from `@memberjunction/storage` — so a grant or revocation applies to the
 * next search, and which user configured the engine first does not matter. The evaluator reads the
 * permission rows with the MJ system user and decides for the caller: an account with no permission
 * rows is open to everyone (the current product rule, kept in one place in the evaluator); otherwise
 * the user needs CanRead through an Everyone, Role or User row. A failed evaluation searches nothing.
 *
 * The provider's own check is push-down only: `SearchEngine`'s late permission filter re-checks every
 * `storage-file` hit (its account, for the user, against this provider's stamped `ProviderId`).
 */
@RegisterClass(BaseSearchProvider, 'StorageSearchProvider')
export class StorageSearchProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'storage';

    /** Reads the scope's storage-account lanes (see `BaseSearchProvider.ConsumesLaneKinds`). */
    public override readonly ConsumesLaneKinds: readonly LaneKind[] = ['StorageAccount'];

    private _available = false;

    /**
     * Whether this provider has at least one searchable storage account.
     */
    public IsAvailable(): boolean {
        return this._available;
    }

    /**
     * Determine availability: true when at least one searchable storage account exists right now.
     * Called once during SearchEngine.Config(). Nothing user-specific is captured here — the
     * searchable accounts and their permissions are re-read on every search.
     *
     * @param contextUser - The user context for loading the storage engine's metadata cache
     */
    public async CheckAvailability(contextUser: UserInfo): Promise<void> {
        try {
            await FileStorageEngine.Instance.Config(false, contextUser);
            const count = this.currentSearchableAccounts().length;
            this._available = count > 0;
            LogStatus(`StorageSearchProvider: Found ${count} searchable storage account(s)`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`StorageSearchProvider: CheckAvailability failed: ${msg}`);
            this._available = false;
        }
    }

    /**
     * The accounts eligible for search at this moment: IncludeInGlobalSearch accounts whose provider is
     * active and supports search. Read from the engine's live cache, never from a snapshot.
     */
    private currentSearchableAccounts(): SearchableAccount[] {
        return FileStorageEngine.Instance.AccountsWithProviders.filter(entry =>
            entry.account.IncludeInGlobalSearch === true &&
            entry.provider.IsActive === true &&
            entry.provider.SupportsSearch === true
        );
    }

    /**
     * Execute a file search across the storage accounts the user may read right now.
     *
     * @param query - The search query text
     * @param topK - Maximum number of results to retrieve
     * @param _filters - Optional filters (currently unused for storage search)
     * @param contextUser - The user performing the search
     * @param scopeConstraints - Optional scope narrowing (accounts, folder paths, query transforms)
     * @returns Scored result items from storage search
     */
    public async Search(
        query: string,
        topK: number,
        _filters: SearchFilters | undefined,
        contextUser: UserInfo,
        scopeConstraints?: ScopeConstraints
    ): Promise<SearchResultItem[]> {
        if (!this._available) {
            return [];
        }
        if (scopeConstraints?.StorageAccounts?.length === 0) {
            // A scoped search whose scope names no storage account: nothing for this provider.
            return [];
        }
        const startTime = Date.now();

        // Honor per-provider query transform
        const effectiveQuery = scopeConstraints?.QueryTransforms?.[this.SourceType] ?? query;
        const accessibleAccounts = await this.accountsToSearch(contextUser, scopeConstraints);
        if (accessibleAccounts.length === 0) {
            return [];
        }

        // Distribute topK across accounts, then search them in parallel, threading per-account FolderPath (if any).
        // Scope folder paths are already rendered (Nunjucks + SearchContext applied by SearchEngine).
        const perAccountLimit = Math.max(3, Math.ceil(topK / accessibleAccounts.length));
        const searchPromises = accessibleAccounts.map(entry => {
            const scopeRow = scopeConstraints?.StorageAccounts?.find(r => UUIDsEqual(r.FileStorageAccountID, entry.account.ID));
            return this.searchOneAccount(entry, effectiveQuery, perAccountLimit, contextUser, scopeRow?.FolderPath);
        });
        const allResults = (await Promise.all(searchPromises)).flat();

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
     * The accounts this search may touch: searchable now, inside the scope (when it restricts), and readable by
     * `contextUser` now — account permissions are evaluated per call by `StorageAccessEvaluator`, which fails
     * closed (an evaluation failure leaves nothing to search).
     */
    private async accountsToSearch(contextUser: UserInfo, scopeConstraints?: ScopeConstraints): Promise<SearchableAccount[]> {
        await FileStorageEngine.Instance.Config(false, contextUser);
        const scopedAccounts = this.applyScopeAccountFilter(this.currentSearchableAccounts(), scopeConstraints?.StorageAccounts);
        if (scopedAccounts.length === 0) {
            // Nothing searchable, or the scope explicitly says "none of these storage accounts".
            return [];
        }
        const readable = await StorageAccessEvaluator.Instance.AccessibleAccountIDs(
            scopedAccounts.map(entry => entry.account.ID),
            contextUser,
            'Read',
            this.Provider
        );
        const accessible = scopedAccounts.filter(entry => readable.has(NormalizeUUID(entry.account.ID)));
        if (accessible.length === 0) {
            LogStatus('StorageSearchProvider: User has no access to any searchable storage accounts');
        }
        return accessible;
    }

    /**
     * Restrict the searchable account list to the scope's allowed set. Only an UNSCOPED search
     * (`scopeRows` undefined) returns the accounts unchanged; an empty list allows none.
     */
    private applyScopeAccountFilter(
        accounts: SearchableAccount[],
        scopeRows: ScopeStorageConstraint[] | undefined
    ): SearchableAccount[] {
        if (!scopeRows) return accounts;
        const allowedIDs = new Set(scopeRows.map(r => NormalizeUUID(r.FileStorageAccountID)));
        return accounts.filter(a => allowedIDs.has(NormalizeUUID(a.account.ID)));
    }

    /**
     * Search a single storage account using the provider's native SearchFiles API.
     * If `folderPath` is supplied (from a scope), results are filtered to that prefix
     * after the driver returns — most drivers do not natively support a path filter.
     * A supplied but BLANK folderPath restricts to nothing rather than to the whole account
     * (the engine refuses such a path before it gets here; this keeps a direct caller closed too).
     */
    private async searchOneAccount(
        entry: SearchableAccount,
        query: string,
        maxResults: number,
        contextUser: UserInfo,
        folderPath?: string
    ): Promise<SearchResultItem[]> {
        if (folderPath !== undefined && !folderPath.trim()) {
            return [];
        }
        try {
            const driver = await FileStorageEngine.Instance.GetDriver(entry.account.ID, contextUser);

            if (!driver.IsConfigured) {
                LogError(
                    `StorageSearchProvider: Driver for account "${entry.account.Name}" ` +
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
            if (folderPath !== undefined) {
                const prefix = folderPath.endsWith('/') ? folderPath : folderPath + '/';
                files = files.filter(f => (f.path ?? '').startsWith(prefix));
            }
            return this.convertResults(files, entry.account, query);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(
                `StorageSearchProvider: Error searching account "${entry.account.Name}": ${msg}`
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
