import type { YMEndpointName } from './ym-endpoint-config';

/**
 * Options for the YM sync operation.
 */
export interface YMSyncOptions {
    /** Which endpoints to sync (empty array = all endpoints) */
    Endpoints: YMEndpointName[];
    /** Whether to truncate tables before syncing (full refresh) */
    FullRefresh: boolean;
    /** Maximum records per endpoint (0 = unlimited) */
    MaxRecordsPerEndpoint: number;
}

/**
 * Result of syncing a single endpoint.
 */
export interface YMEndpointSyncResult {
    /** Endpoint name */
    EndpointName: string;
    /** SQL table name the data was synced to */
    TableName: string;
    /** Number of records fetched from YM API */
    RecordsFetched: number;
    /** Number of new records inserted */
    RecordsInserted: number;
    /** Number of existing records updated */
    RecordsUpdated: number;
    /** Error messages for this endpoint (empty if no errors) */
    Errors: string[];
    /** Duration in milliseconds */
    DurationMs: number;
}

/**
 * Result of the full YM sync operation.
 */
export interface YMSyncResult {
    /** Whether the overall sync succeeded (all endpoints) */
    Success: boolean;
    /** Per-endpoint results */
    EndpointResults: YMEndpointSyncResult[];
    /** Total records synced across all endpoints */
    TotalRecordsSynced: number;
    /** Total errors across all endpoints */
    TotalErrors: number;
    /** Total duration in milliseconds */
    DurationMs: number;
}
