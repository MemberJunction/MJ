import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { MJGlobal } from "@memberjunction/global";
import {
    FileSearchOptions,
    FileSearchResult,
    UnsupportedOperationError
} from "@memberjunction/storage";
import { BaseFileStorageAction } from "./base-file-storage.action";
import { BaseAction } from "@memberjunction/actions";

/**
 * Action that searches for files across configured storage providers
 * using each provider's native search capabilities.
 *
 * This action leverages MJStorage's SearchFiles method which uses:
 * - Google Drive: Drive API search with content indexing
 * - SharePoint: Microsoft Graph Search with KQL queries
 * - Dropbox: Search API v2 with filename and content search
 * - Box: Box Search API with Boolean operators
 *
 * Providers without native search (AWS S3, Azure Blob, GCS) will return errors.
 *
 * @example
 * ```typescript
 * // Basic file search
 * await runAction({
 *   ActionName: 'Search Storage Files',
 *   Params: [{
 *     Name: 'Query',
 *     Value: 'quarterly report'
 *   }, {
 *     Name: 'StorageAccount',
 *     Value: 'Google Drive - Marketing'
 *   }]
 * });
 *
 * // Advanced search with filters
 * await runAction({
 *   ActionName: 'Search Storage Files',
 *   Params: [{
 *     Name: 'Query',
 *     Value: 'budget 2024'
 *   }, {
 *     Name: 'StorageAccount',
 *     Value: 'SharePoint - Finance'
 *   }, {
 *     Name: 'FileTypes',
 *     Value: 'pdf,xlsx'
 *   }, {
 *     Name: 'PathPrefix',
 *     Value: 'documents/finance'
 *   }, {
 *     Name: 'SearchContent',
 *     Value: true
 *   }, {
 *     Name: 'MaxResults',
 *     Value: 50
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Search Storage Files")
export class SearchStorageFilesAction extends BaseFileStorageAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        // Required parameters
        const query = this.getStringParam(params, "query");
        if (!query) {
            return this.createErrorResult("Query parameter is required", "MISSING_QUERY");
        }

        // Get storage driver (uses StorageAccount parameter via base class)
        const { driver, error } = await this.getDriverFromParams(params);
        if (error) {
            return error;
        }

        // Optional parameters
        const maxResults = this.getNumericParam(params, "maxresults", 100);
        const pathPrefix = this.getStringParam(params, "pathprefix");
        const searchContent = this.getBooleanParam(params, "searchcontent", false);
        const modifiedAfterStr = this.getStringParam(params, "modifiedafter");
        const modifiedBeforeStr = this.getStringParam(params, "modifiedbefore");

        // Parse file types (comma-separated)
        const fileTypesParam = this.getStringParam(params, "filetypes");
        const fileTypes = fileTypesParam
            ? fileTypesParam.split(',').map(ft => ft.trim()).filter(ft => ft.length > 0)
            : undefined;

        // Parse dates
        let modifiedAfter: Date | undefined;
        let modifiedBefore: Date | undefined;

        if (modifiedAfterStr) {
            const date = new Date(modifiedAfterStr);
            if (!isNaN(date.getTime())) {
                modifiedAfter = date;
            } else {
                return this.createErrorResult(
                    `Invalid ModifiedAfter date format: ${modifiedAfterStr}. Use ISO 8601 format (e.g., '2024-01-01')`,
                    "INVALID_DATE_FORMAT"
                );
            }
        }

        if (modifiedBeforeStr) {
            const date = new Date(modifiedBeforeStr);
            if (!isNaN(date.getTime())) {
                modifiedBefore = date;
            } else {
                return this.createErrorResult(
                    `Invalid ModifiedBefore date format: ${modifiedBeforeStr}. Use ISO 8601 format (e.g., '2024-12-31')`,
                    "INVALID_DATE_FORMAT"
                );
            }
        }

        try {
            // Build search options
            const searchOptions: FileSearchOptions = {
                maxResults,
                searchContent
            };

            if (fileTypes) {
                searchOptions.fileTypes = fileTypes;
            }

            if (pathPrefix) {
                searchOptions.pathPrefix = pathPrefix;
            }

            if (modifiedAfter) {
                searchOptions.modifiedAfter = modifiedAfter;
            }

            if (modifiedBefore) {
                searchOptions.modifiedBefore = modifiedBefore;
            }

            // Perform the search
            const searchResults = await driver!.SearchFiles(query, searchOptions);

            // Format results for output
            const formattedResults = searchResults.results.map((file: FileSearchResult) => ({
                Path: file.path,
                Name: file.name,
                Size: file.size,
                ContentType: file.contentType,
                LastModified: file.lastModified.toISOString(),
                ObjectID: file.objectId,  // Provider-specific ID for fast direct access
                Relevance: file.relevance,
                Excerpt: file.excerpt,
                MatchInFilename: file.matchInFilename,
                CustomMetadata: file.customMetadata,
                ProviderData: file.providerData
            }));

            // Build output parameters array per ActionResultSimple spec
            const outputParams: ActionParam[] = [
                {
                    Name: 'SearchResults',
                    Value: formattedResults,
                    Type: 'Output'
                },
                {
                    Name: 'ResultCount',
                    Value: searchResults.results.length,
                    Type: 'Output'
                },
                {
                    Name: 'TotalMatches',
                    Value: searchResults.totalMatches,
                    Type: 'Output'
                },
                {
                    Name: 'HasMore',
                    Value: searchResults.hasMore,
                    Type: 'Output'
                },
                {
                    Name: 'NextPageToken',
                    Value: searchResults.nextPageToken,
                    Type: 'Output'
                }
            ];

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: `Found ${searchResults.results.length} file(s) matching query '${query}'`,
                Params: outputParams
            } as ActionResultSimple;

        } catch (error) {
            // Handle specific error types
            if (error instanceof UnsupportedOperationError) {
                return this.createErrorResult(
                    `Storage provider does not support file search. Providers with search support: Google Drive, SharePoint, Dropbox, Box. Consider using a different provider or List Objects action with filtering.`,
                    "SEARCH_NOT_SUPPORTED"
                );
            }

            // Handle other errors
            const errorMessage = error instanceof Error ? error.message : String(error);
            return this.createErrorResult(
                `Search failed: ${errorMessage}`,
                "SEARCH_FAILED"
            );
        }
    }
}

/**
 * Load function to ensure the class is registered and not tree-shaken
 */
export function LoadSearchStorageFilesAction() {
    // This function call ensures the class decorator executes
    MJGlobal.Instance.ClassFactory.GetRegistration(BaseFileStorageAction, "Search Storage Files");
}
