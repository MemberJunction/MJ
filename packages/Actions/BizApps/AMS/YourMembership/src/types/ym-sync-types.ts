import type { YMEndpointName } from './ym-endpoint-config';

/**
 * Options for running a YM data sync.
 */
export interface YMSyncOptions {
    /** Specific endpoints to sync; empty array means all endpoints */
    Endpoints: YMEndpointName[];
    /** If true, truncates tables before syncing */
    FullRefresh: boolean;
    /** Maximum records per endpoint; 0 means no limit */
    MaxRecordsPerEndpoint: number;
}

/**
 * Result of syncing a single endpoint.
 */
export interface YMEndpointSyncResult {
    EndpointName: string;
    TableName: string;
    RecordsFetched: number;
    RecordsInserted: number;
    RecordsUpdated: number;
    Errors: string[];
    DurationMs: number;
}

/**
 * Overall sync result across all endpoints.
 */
export interface YMSyncResult {
    Success: boolean;
    EndpointResults: YMEndpointSyncResult[];
    TotalRecordsSynced: number;
    TotalErrors: number;
    DurationMs: number;
}
