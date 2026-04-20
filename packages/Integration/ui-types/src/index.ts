/** Summary of an integration's current state for UI display */
export interface IntegrationSummary {
    /** Company Integration ID */
    CompanyIntegrationID: string;
    /** Display name of the integration (e.g., "HubSpot", "Salesforce") */
    IntegrationName: string;
    /** Company name */
    CompanyName: string;
    /** Whether the integration is currently active */
    IsActive: boolean;
    /** Number of active entity maps configured */
    EntityMapCount: number;
    /** Timestamp of the last successful sync */
    LastSyncAt: string | null;
    /** Current connector health status */
    Health: ConnectorHealth;
}

/** Health status of a connector */
export type ConnectorHealth = 'Healthy' | 'Degraded' | 'Offline' | 'Unknown';

/** Summary of a single integration run for UI display */
export interface RunStatusSummary {
    /** Run ID */
    RunID: string;
    /** Company Integration ID */
    CompanyIntegrationID: string;
    /** Integration display name */
    IntegrationName: string;
    /** Current run status */
    Status: 'Pending' | 'In Progress' | 'Success' | 'Failed';
    /** Who triggered the run */
    RunByUser: string;
    /** When the run started */
    StartedAt: string;
    /** When the run ended (null if still running) */
    EndedAt: string | null;
    /** Total records processed */
    TotalRecords: number;
    /** Records created */
    RecordsCreated: number;
    /** Records updated */
    RecordsUpdated: number;
    /** Records that had errors */
    RecordsErrored: number;
    /** Duration in seconds (computed on the client from StartedAt/EndedAt) */
    DurationSeconds: number | null;
}

/** Summary of an entity map's sync configuration for UI display */
export interface EntityMapSummary {
    /** Entity Map ID */
    EntityMapID: string;
    /** External object name (e.g., "Contact") */
    ExternalObjectName: string;
    /** MJ Entity name */
    MJEntityName: string;
    /** Sync direction */
    SyncDirection: 'Pull' | 'Push' | 'Bidirectional';
    /** Whether sync is enabled */
    SyncEnabled: boolean;
    /** Number of active field maps */
    FieldMapCount: number;
    /** Last watermark value */
    LastWatermarkValue: string | null;
}

/** Stats for the integration dashboard overview */
export interface IntegrationDashboardStats {
    /** Total number of active integrations */
    ActiveIntegrations: number;
    /** Total records synced across all integrations today */
    RecordsSyncedToday: number;
    /** Number of failed runs in the last 24 hours */
    FailedRunsLast24h: number;
    /** Next scheduled sync time */
    NextScheduledSync: string | null;
}
