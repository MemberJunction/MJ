import { LogError } from "@memberjunction/core";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { gql } from "graphql-request";

/**
 * Client for file storage operations through GraphQL.
 * This class provides an easy way to interact with file storage accounts from a client application.
 *
 * All operations use accountId (FileStorageAccount ID) as the primary identifier,
 * supporting the enterprise model where storage accounts are organizational resources.
 *
 * @example
 * ```typescript
 * // Create the client
 * const storageClient = new GraphQLFileStorageClient(graphQLProvider);
 *
 * // List objects in a directory
 * const objects = await storageClient.ListObjects(accountId, 'documents/');
 *
 * // Create a pre-authenticated upload URL
 * const uploadResult = await storageClient.CreatePreAuthUploadUrl(
 *   accountId,
 *   'documents/report.pdf',
 *   'application/pdf'
 * );
 * ```
 */
export class GraphQLFileStorageClient {
    /**
     * The GraphQLDataProvider instance used to execute GraphQL requests
     * @private
     */
    private _dataProvider: GraphQLDataProvider;

    /**
     * Creates a new GraphQLFileStorageClient instance.
     * @param dataProvider The GraphQL data provider to use for queries
     */
    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    // =========================================================================
    // Navigation / Directory Operations
    // =========================================================================

    /**
     * List objects in a storage account at the specified path.
     *
     * @param accountId The ID of the FileStorageAccount
     * @param prefix The path prefix to list objects from (e.g., 'documents/')
     * @param delimiter Optional delimiter for grouping results (default: '/')
     * @returns A Promise that resolves to a StorageListResult
     *
     * @example
     * ```typescript
     * const result = await storageClient.ListObjects(accountId, 'documents/', '/');
     * console.log('Files:', result.objects.filter(o => !o.isDirectory));
     * console.log('Folders:', result.prefixes);
     * ```
     */
    public async ListObjects(
        accountId: string,
        prefix: string = '',
        delimiter?: string
    ): Promise<StorageListResult> {
        try {
            const query = gql`
                query ListStorageObjects($input: ListStorageObjectsInput!) {
                    ListStorageObjects(input: $input) {
                        objects {
                            name
                            path
                            fullPath
                            size
                            contentType
                            lastModified
                            isDirectory
                            etag
                            cacheControl
                        }
                        prefixes
                    }
                }
            `;

            const variables = {
                input: {
                    AccountID: accountId,
                    Prefix: prefix,
                    Delimiter: delimiter || '/'
                }
            };

            const result = await this._dataProvider.ExecuteGQL(query, variables);

            if (!result?.ListStorageObjects) {
                throw new Error("Invalid response from server");
            }

            return {
                objects: result.ListStorageObjects.objects.map((obj: StorageObjectMetadataResponse) => ({
                    ...obj,
                    lastModified: new Date(obj.lastModified)
                })),
                prefixes: result.ListStorageObjects.prefixes
            };
        } catch (e) {
            const error = e as Error;
            LogError(`Error listing storage objects: ${error}`);
            throw error;
        }
    }

    /**
     * Check if a directory exists in the storage account.
     *
     * @param accountId The ID of the FileStorageAccount
     * @param path The directory path to check
     * @returns A Promise that resolves to true if the directory exists
     */
    public async DirectoryExists(
        accountId: string,
        path: string
    ): Promise<boolean> {
        try {
            // Check by listing with the path as prefix and looking for any results
            const result = await this.ListObjects(accountId, path.endsWith('/') ? path : `${path}/`, '/');
            return result.objects.length > 0 || result.prefixes.length > 0;
        } catch (e) {
            const error = e as Error;
            LogError(`Error checking directory existence: ${error}`);
            return false;
        }
    }

    /**
     * Create a directory in the storage account.
     *
     * @param accountId The ID of the FileStorageAccount
     * @param path The directory path to create
     * @returns A Promise that resolves to true if the directory was created successfully
     */
    public async CreateDirectory(
        accountId: string,
        path: string
    ): Promise<boolean> {
        try {
            const mutation = gql`
                mutation CreateDirectory($input: CreateDirectoryInput!) {
                    CreateDirectory(input: $input)
                }
            `;

            const variables = {
                input: {
                    AccountID: accountId,
                    Path: path
                }
            };

            const result = await this._dataProvider.ExecuteGQL(mutation, variables);
            return result?.CreateDirectory ?? false;
        } catch (e) {
            const error = e as Error;
            LogError(`Error creating directory: ${error}`);
            return false;
        }
    }

    // =========================================================================
    // File Operations
    // =========================================================================

    /**
     * Check if an object exists in the storage account.
     *
     * @param accountId The ID of the FileStorageAccount
     * @param objectName The name/path of the object to check
     * @returns A Promise that resolves to true if the object exists
     */
    public async ObjectExists(
        accountId: string,
        objectName: string
    ): Promise<boolean> {
        try {
            // Try to list the exact object
            const parentPath = objectName.substring(0, objectName.lastIndexOf('/') + 1);
            const fileName = objectName.substring(objectName.lastIndexOf('/') + 1);

            const result = await this.ListObjects(accountId, parentPath, '/');
            return result.objects.some(obj => obj.name === fileName || obj.fullPath === objectName);
        } catch (e) {
            const error = e as Error;
            LogError(`Error checking object existence: ${error}`);
            return false;
        }
    }

    /**
     * Create a pre-authenticated URL for uploading a file.
     *
     * @param accountId The ID of the FileStorageAccount
     * @param objectName The name/path of the object to upload
     * @param contentType Optional content type for the file
     * @returns A Promise that resolves to the upload URL and provider key
     *
     * @example
     * ```typescript
     * const result = await storageClient.CreatePreAuthUploadUrl(
     *   accountId,
     *   'documents/report.pdf',
     *   'application/pdf'
     * );
     *
     * // Use the upload URL to upload the file
     * await fetch(result.uploadUrl, {
     *   method: 'PUT',
     *   body: fileContent,
     *   headers: { 'Content-Type': 'application/pdf' }
     * });
     * ```
     */
    public async CreatePreAuthUploadUrl(
        accountId: string,
        objectName: string,
        contentType?: string
    ): Promise<CreatePreAuthUploadUrlResult> {
        try {
            const mutation = gql`
                mutation CreatePreAuthUploadUrl($input: CreatePreAuthUploadUrlInput!) {
                    CreatePreAuthUploadUrl(input: $input) {
                        UploadUrl
                        ProviderKey
                    }
                }
            `;

            const variables = {
                input: {
                    AccountID: accountId,
                    ObjectName: objectName,
                    ContentType: contentType
                }
            };

            const result = await this._dataProvider.ExecuteGQL(mutation, variables);

            if (!result?.CreatePreAuthUploadUrl) {
                throw new Error("Invalid response from server");
            }

            return {
                uploadUrl: result.CreatePreAuthUploadUrl.UploadUrl,
                providerKey: result.CreatePreAuthUploadUrl.ProviderKey
            };
        } catch (e) {
            const error = e as Error;
            LogError(`Error creating pre-auth upload URL: ${error}`);
            throw error;
        }
    }

    /**
     * Create a pre-authenticated URL for downloading a file.
     *
     * @param accountId The ID of the FileStorageAccount
     * @param objectName The name/path of the object to download
     * @returns A Promise that resolves to the download URL
     *
     * @example
     * ```typescript
     * const downloadUrl = await storageClient.CreatePreAuthDownloadUrl(
     *   accountId,
     *   'documents/report.pdf'
     * );
     *
     * // Use the download URL
     * window.open(downloadUrl, '_blank');
     * ```
     */
    public async CreatePreAuthDownloadUrl(
        accountId: string,
        objectName: string
    ): Promise<string> {
        try {
            const query = gql`
                query CreatePreAuthDownloadUrl($input: CreatePreAuthDownloadUrlInput!) {
                    CreatePreAuthDownloadUrl(input: $input)
                }
            `;

            const variables = {
                input: {
                    AccountID: accountId,
                    ObjectName: objectName
                }
            };

            const result = await this._dataProvider.ExecuteGQL(query, variables);

            if (result?.CreatePreAuthDownloadUrl === undefined) {
                throw new Error("Invalid response from server");
            }

            return result.CreatePreAuthDownloadUrl;
        } catch (e) {
            const error = e as Error;
            LogError(`Error creating pre-auth download URL: ${error}`);
            throw error;
        }
    }

    /**
     * Delete an object from the storage account.
     *
     * @param accountId The ID of the FileStorageAccount
     * @param objectName The name/path of the object to delete
     * @returns A Promise that resolves to true if the object was deleted successfully
     */
    public async DeleteObject(
        accountId: string,
        objectName: string
    ): Promise<boolean> {
        try {
            const mutation = gql`
                mutation DeleteStorageObject($input: DeleteStorageObjectInput!) {
                    DeleteStorageObject(input: $input)
                }
            `;

            const variables = {
                input: {
                    AccountID: accountId,
                    ObjectName: objectName
                }
            };

            const result = await this._dataProvider.ExecuteGQL(mutation, variables);
            return result?.DeleteStorageObject ?? false;
        } catch (e) {
            const error = e as Error;
            LogError(`Error deleting storage object: ${error}`);
            return false;
        }
    }

    /**
     * Move/rename an object within the storage account.
     *
     * @param accountId The ID of the FileStorageAccount
     * @param oldName The current name/path of the object
     * @param newName The new name/path for the object
     * @returns A Promise that resolves to true if the object was moved successfully
     */
    public async MoveObject(
        accountId: string,
        oldName: string,
        newName: string
    ): Promise<boolean> {
        try {
            const mutation = gql`
                mutation MoveStorageObject($input: MoveStorageObjectInput!) {
                    MoveStorageObject(input: $input)
                }
            `;

            const variables = {
                input: {
                    AccountID: accountId,
                    OldName: oldName,
                    NewName: newName
                }
            };

            const result = await this._dataProvider.ExecuteGQL(mutation, variables);
            return result?.MoveStorageObject ?? false;
        } catch (e) {
            const error = e as Error;
            LogError(`Error moving storage object: ${error}`);
            return false;
        }
    }

    /**
     * Copy an object within the storage account.
     *
     * @param accountId The ID of the FileStorageAccount
     * @param sourceName The source name/path of the object
     * @param destinationName The destination name/path for the copy
     * @returns A Promise that resolves to true if the object was copied successfully
     */
    public async CopyObject(
        accountId: string,
        sourceName: string,
        destinationName: string
    ): Promise<boolean> {
        try {
            const mutation = gql`
                mutation CopyStorageObject($input: CopyStorageObjectInput!) {
                    CopyStorageObject(input: $input)
                }
            `;

            const variables = {
                input: {
                    AccountID: accountId,
                    SourceName: sourceName,
                    DestinationName: destinationName
                }
            };

            const result = await this._dataProvider.ExecuteGQL(mutation, variables);
            return result?.CopyStorageObject ?? false;
        } catch (e) {
            const error = e as Error;
            LogError(`Error copying storage object: ${error}`);
            return false;
        }
    }

    /**
     * Copy an object between two different storage accounts.
     *
     * @param sourceAccountId The ID of the source FileStorageAccount
     * @param destinationAccountId The ID of the destination FileStorageAccount
     * @param sourcePath The source path of the object
     * @param destinationPath The destination path for the copy
     * @returns A Promise that resolves to the copy result
     */
    public async CopyObjectBetweenAccounts(
        sourceAccountId: string,
        destinationAccountId: string,
        sourcePath: string,
        destinationPath: string
    ): Promise<CopyBetweenAccountsResult> {
        try {
            const mutation = gql`
                mutation CopyObjectBetweenAccounts($input: CopyObjectBetweenAccountsInput!) {
                    CopyObjectBetweenAccounts(input: $input) {
                        success
                        message
                        bytesTransferred
                        sourceAccount
                        destinationAccount
                        sourcePath
                        destinationPath
                    }
                }
            `;

            const variables = {
                input: {
                    SourceAccountID: sourceAccountId,
                    DestinationAccountID: destinationAccountId,
                    SourcePath: sourcePath,
                    DestinationPath: destinationPath
                }
            };

            const result = await this._dataProvider.ExecuteGQL(mutation, variables);

            if (!result?.CopyObjectBetweenAccounts) {
                throw new Error("Invalid response from server");
            }

            return {
                success: result.CopyObjectBetweenAccounts.success,
                message: result.CopyObjectBetweenAccounts.message,
                bytesTransferred: result.CopyObjectBetweenAccounts.bytesTransferred,
                sourceAccount: result.CopyObjectBetweenAccounts.sourceAccount,
                destinationAccount: result.CopyObjectBetweenAccounts.destinationAccount,
                sourcePath: result.CopyObjectBetweenAccounts.sourcePath,
                destinationPath: result.CopyObjectBetweenAccounts.destinationPath
            };
        } catch (e) {
            const error = e as Error;
            LogError(`Error copying object between accounts: ${error}`);
            return {
                success: false,
                message: error.message,
                sourceAccount: '',
                destinationAccount: '',
                sourcePath,
                destinationPath
            };
        }
    }

    // =========================================================================
    // Search Operations
    // =========================================================================

    /**
     * Search for files across one or more storage accounts.
     *
     * @param accountIds Array of FileStorageAccount IDs to search
     * @param query The search query
     * @param options Optional search options
     * @returns A Promise that resolves to the search results
     *
     * @example
     * ```typescript
     * const results = await storageClient.SearchFiles(
     *   [accountId1, accountId2],
     *   'quarterly report',
     *   {
     *     maxResultsPerAccount: 10,
     *     fileTypes: ['pdf', 'docx'],
     *     searchContent: true
     *   }
     * );
     *
     * for (const accountResult of results.accountResults) {
     *   console.log(`Results from ${accountResult.accountName}:`);
     *   for (const file of accountResult.results) {
     *     console.log(`  - ${file.name} (${file.relevance})`);
     *   }
     * }
     * ```
     */
    public async SearchFiles(
        accountIds: string[],
        searchQuery: string,
        options?: FileSearchOptions
    ): Promise<SearchAcrossAccountsResult> {
        try {
            const gqlQuery = gql`
                query SearchAcrossAccounts($input: SearchAcrossAccountsInput!) {
                    SearchAcrossAccounts(input: $input) {
                        accountResults {
                            accountID
                            accountName
                            success
                            errorMessage
                            results {
                                path
                                name
                                size
                                contentType
                                lastModified
                                relevance
                                excerpt
                                matchInFilename
                                objectId
                            }
                            totalMatches
                            hasMore
                            nextPageToken
                        }
                        totalResultsReturned
                        successfulAccounts
                        failedAccounts
                    }
                }
            `;

            const variables = {
                input: {
                    AccountIDs: accountIds,
                    Query: searchQuery,
                    MaxResultsPerAccount: options?.maxResultsPerAccount,
                    FileTypes: options?.fileTypes,
                    SearchContent: options?.searchContent
                }
            };

            const result = await this._dataProvider.ExecuteGQL(gqlQuery, variables);

            if (!result?.SearchAcrossAccounts) {
                throw new Error("Invalid response from server");
            }

            const searchResult = result.SearchAcrossAccounts;

            return {
                accountResults: searchResult.accountResults.map((ar: AccountSearchResultResponse) => ({
                    accountId: ar.accountID,
                    accountName: ar.accountName,
                    success: ar.success,
                    errorMessage: ar.errorMessage,
                    results: ar.results.map((r: FileSearchResultResponse) => ({
                        path: r.path,
                        name: r.name,
                        size: r.size,
                        contentType: r.contentType,
                        lastModified: new Date(r.lastModified),
                        relevance: r.relevance,
                        excerpt: r.excerpt,
                        matchInFilename: r.matchInFilename,
                        objectId: r.objectId
                    })),
                    totalMatches: ar.totalMatches,
                    hasMore: ar.hasMore,
                    nextPageToken: ar.nextPageToken
                })),
                totalResultsReturned: searchResult.totalResultsReturned,
                successfulAccounts: searchResult.successfulAccounts,
                failedAccounts: searchResult.failedAccounts
            };
        } catch (e) {
            const error = e as Error;
            LogError(`Error searching across accounts: ${error}`);
            return {
                accountResults: [],
                totalResultsReturned: 0,
                successfulAccounts: 0,
                failedAccounts: accountIds.length
            };
        }
    }
}

// =========================================================================
// Type Definitions
// =========================================================================

/**
 * Metadata for a storage object
 */
export interface StorageObjectMetadata {
    /** The name of the object (filename) */
    name: string;
    /** The path to the object (directory) */
    path: string;
    /** The full path including name */
    fullPath: string;
    /** Size in bytes */
    size: number;
    /** MIME content type */
    contentType: string;
    /** Last modification date */
    lastModified: Date;
    /** Whether this is a directory */
    isDirectory: boolean;
    /** ETag for caching */
    etag?: string;
    /** Cache control header */
    cacheControl?: string;
}

/**
 * Response type for storage object metadata (with string date)
 */
interface StorageObjectMetadataResponse {
    name: string;
    path: string;
    fullPath: string;
    size: number;
    contentType: string;
    lastModified: string;
    isDirectory: boolean;
    etag?: string;
    cacheControl?: string;
}

/**
 * Result from listing storage objects
 */
export interface StorageListResult {
    /** Array of objects in the directory */
    objects: StorageObjectMetadata[];
    /** Array of subdirectory prefixes */
    prefixes: string[];
}

/**
 * Result from creating a pre-authenticated upload URL
 */
export interface CreatePreAuthUploadUrlResult {
    /** The URL to use for uploading */
    uploadUrl: string;
    /** The provider-specific key for the object */
    providerKey?: string;
}

/**
 * Result from copying an object between accounts
 */
export interface CopyBetweenAccountsResult {
    /** Whether the copy was successful */
    success: boolean;
    /** Human-readable message */
    message: string;
    /** Number of bytes transferred */
    bytesTransferred?: number;
    /** Name of the source account */
    sourceAccount: string;
    /** Name of the destination account */
    destinationAccount: string;
    /** Source path */
    sourcePath: string;
    /** Destination path */
    destinationPath: string;
}

/**
 * Options for file search operations
 */
export interface FileSearchOptions {
    /** Maximum results per account */
    maxResultsPerAccount?: number;
    /** Filter by file types (extensions) */
    fileTypes?: string[];
    /** Whether to search file content (not just names) */
    searchContent?: boolean;
}

/**
 * A single file search result
 */
export interface FileSearchResult {
    /** Path to the file */
    path: string;
    /** File name */
    name: string;
    /** File size in bytes */
    size: number;
    /** MIME content type */
    contentType: string;
    /** Last modification date */
    lastModified: Date;
    /** Relevance score (0-1) */
    relevance?: number;
    /** Text excerpt showing the match */
    excerpt?: string;
    /** Whether the match was in the filename */
    matchInFilename?: boolean;
    /** Provider-specific object ID */
    objectId?: string;
}

/**
 * Response type for file search result (with string date)
 */
interface FileSearchResultResponse {
    path: string;
    name: string;
    size: number;
    contentType: string;
    lastModified: string;
    relevance?: number;
    excerpt?: string;
    matchInFilename?: boolean;
    objectId?: string;
}

/**
 * Search results for a single account
 */
export interface AccountSearchResult {
    /** The account ID */
    accountId: string;
    /** The account name */
    accountName: string;
    /** Whether the search was successful */
    success: boolean;
    /** Error message if search failed */
    errorMessage?: string;
    /** Search results */
    results: FileSearchResult[];
    /** Total matches found */
    totalMatches?: number;
    /** Whether there are more results */
    hasMore: boolean;
    /** Token for pagination */
    nextPageToken?: string;
}

/**
 * Response type for account search result (with string dates in results)
 */
interface AccountSearchResultResponse {
    accountID: string;
    accountName: string;
    success: boolean;
    errorMessage?: string;
    results: FileSearchResultResponse[];
    totalMatches?: number;
    hasMore: boolean;
    nextPageToken?: string;
}

/**
 * Result from searching across multiple accounts
 */
export interface SearchAcrossAccountsResult {
    /** Results grouped by account */
    accountResults: AccountSearchResult[];
    /** Total results returned across all accounts */
    totalResultsReturned: number;
    /** Number of accounts that were searched successfully */
    successfulAccounts: number;
    /** Number of accounts that failed to search */
    failedAccounts: number;
}
