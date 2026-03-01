-- Disable TrackRecordChanges on entities where audit trail adds no business value.
-- These fall into four categories:
--   1. User state/preferences (high-frequency personal UI data)
--   2. Caches and transient OAuth data (ephemeral by nature)
--   3. Log/history entities (tracking changes to logs is meta-waste)
--   4. High-volume linking/tagging (frequent churn, low audit value)

UPDATE [${flyway:defaultSchema}].[Entity]
SET [TrackRecordChanges] = 0
WHERE [Name] IN (
    -- User State / Preferences
    N'MJ: User Settings',
    N'MJ: User Favorites',
    N'MJ: Dashboard User Preferences',
    N'MJ: Dashboard User States',
    N'MJ: Report User States',
    N'MJ: User Notifications',
    N'MJ: User Notification Preferences',
    N'MJ: Explorer Navigation Items',
    N'MJ: User Application Entities',
    N'MJ: User Applications',
    N'MJ: User View Categories',

    -- Caches / Transient / OAuth
    N'MJ: AI Result Cache',
    N'MJ: O Auth Authorization States',
    N'MJ: O Auth Auth Server Metadata Caches',
    N'MJ: O Auth Tokens',
    N'MJ: O Auth Client Registrations',

    -- Logs / History (already tracking history)
    N'MJ: MCP Tool Execution Logs',
    N'MJ: Open App Install Histories',
    N'MJ: Version Label Restores',
    N'MJ: Report Snapshots',

    -- High-Volume Linking / Tagging
    N'MJ: Tagged Items',
    N'MJ: Record Links',
    N'MJ: List Details',
    N'MJ: Data Context Items'
);
