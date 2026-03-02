-- Disable TrackRecordChanges on entities where audit trail adds no business value.
-- These fall into four categories:
--   1. User state/preferences (high-frequency personal UI data)
--   2. Caches and transient OAuth data (ephemeral by nature)
--   3. Log/history entities (tracking changes to logs is meta-waste)
--   4. High-volume linking/tagging (frequent churn, low audit value)

UPDATE __mj."Entity"
SET "TrackRecordChanges" = 0
WHERE "Name" IN (
    -- User State / Preferences
    'MJ: User Settings',
    'MJ: User Favorites',
    'MJ: Dashboard User Preferences',
    'MJ: Dashboard User States',
    'MJ: Report User States',
    'MJ: User Notifications',
    'MJ: User Notification Preferences',
    'MJ: Explorer Navigation Items',
    'MJ: User Application Entities',
    'MJ: User Applications',
    'MJ: User View Categories',

    -- Caches / Transient / OAuth
    'MJ: AI Result Cache',
    'MJ: O Auth Authorization States',
    'MJ: O Auth Auth Server Metadata Caches',
    'MJ: O Auth Tokens',
    'MJ: O Auth Client Registrations',

    -- Logs / History (already tracking history)
    'MJ: MCP Tool Execution Logs',
    'MJ: Open App Install Histories',
    'MJ: Version Label Restores',
    'MJ: Report Snapshots',

    -- High-Volume Linking / Tagging
    'MJ: Tagged Items',
    'MJ: Record Links',
    'MJ: List Details',
    'MJ: Data Context Items'
);
