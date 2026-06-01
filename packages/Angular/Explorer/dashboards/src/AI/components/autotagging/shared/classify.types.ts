/**
 * @fileoverview Shared types & interfaces for the Classify (autotagging) sub-app.
 * Extracted verbatim from the former monolith so host, tabs, and dialogs share one contract.
 */

// ── Tab type ──

export type TabName = 'pipeline' | 'sources' | 'types' | 'tags' | 'taxonomy' | 'inbox' | 'history';

// ── Interfaces ──

export interface NavItem {
    Tab: TabName;
    Icon: string;
    Label: string;
    BadgeText: string;
    BadgeClass: string;
}

export interface KPIMetric {
    Label: string;
    Value: number;
    Icon: string;
    Trend: string;
    TrendUp: boolean;
}

export interface PipelineStageInfo {
    Name: string;
    Icon: string;
    Status: 'idle' | 'active' | 'complete';
    Count: string;
}

export interface FeedItem {
    Name: string;
    SourceName: string;
    Tags: string[];
    TimeAgo: string;
    Status: 'complete' | 'processing' | 'error';
}

export interface SourceMini {
    ID: string;
    Name: string;
    Icon: string;
    Meta: string;
    StatusClass: 'active' | 'error' | 'inactive';
}

export interface SourceCard {
    ID: string;
    Name: string;
    SourceTypeName: string;
    ContentTypeName: string;
    FileTypeName: string;
    Icon: string;
    StatusClass: 'active' | 'error' | 'inactive';
    StatusLabel: string;
    URL: string;
    ItemCount: number;
    TagCount: number;
    AvgTags: string;
    LastRunAgo: string;
    ContentSourceTypeID: string;
    ContentTypeID: string;
    ContentFileTypeID: string;
    EmbeddingModelID: string;
    VectorIndexID: string;
    EntityID: string;
    EntityDocumentID: string;
    RequiresFileType: boolean;
    /** FK to ScheduledAction entity, null if no schedule configured */
    ScheduledActionID: string | null;
    /** Denormalized name of the linked ScheduledAction */
    ScheduledActionName: string | null;
    /** Human-readable schedule description (parsed from cron) */
    ScheduleDescription: string | null;
}

export interface ContentTypeCard {
    ID: string;
    Name: string;
    Description: string;
    AIModelName: string;
    AIModelID: string;
    MinTags: number;
    MaxTags: number;
    SourcesUsing: number;
    ItemsTagged: number;
    RangeLeftPct: number;
    RangeRightPct: number;
    EmbeddingModelID: string;
    VectorIndexID: string;
}

export interface TagRow {
    Tag: string;
    UsageCount: number;
    AvgWeight: number;
    BarWidthPct: number;
    TopSource: string;
    FirstSeen: string;
}

export interface TagCloudItem {
    Tag: string;
    AvgWeight: number;
    SizeClass: 'large' | '' | 'small';
}

export interface TagBySource {
    SourceName: string;
    Count: number;
}

export interface RunHistoryRow {
    ID: string;
    Status: string;
    StatusClass: string;
    SourceName: string;
    StartedDisplay: string;
    Duration: string;
    Items: string;
    Tags: string;
    Errors: string;
    ErrorClass: string;
}

export interface DropdownOption {
    ID: string;
    Name: string;
}

/** G3: Content item duplicate pair for review */
export interface ContentDuplicateRow {
    ID: string;
    ItemAName: string;
    ItemASource: string;
    ItemBName: string;
    ItemBSource: string;
    SimilarityScore: number;
    DetectionMethod: string;
    Status: 'Pending' | 'Confirmed' | 'Dismissed' | 'Merged';
}

/** D2/D3/D8: Per-source detail row for a specific pipeline run */
export interface RunDetailRow {
    SourceName: string;
    SourceType: string;
    Status: string;
    StatusClass: string;
    ItemsProcessed: number;
    ItemsTagged: number;
    ItemsVectorized: number;
    ErrorCount: number;
    TotalTokens: number;
    TotalCost: number;
    Duration: string;
}

// ── Taxonomy Governance interfaces ──

export type TaxonomySubTab = 'tree' | 'duplicates' | 'orphans' | 'treemap' | 'audit';

export interface TaxTreeNode {
    ID: string;
    Name: string;
    DisplayName: string;
    Description: string;
    ParentID: string | null;
    Depth: number;
    Children: TaxTreeNode[];
    ItemCount: number;
    AvgWeight: number;
    HealthColor: 'green' | 'yellow' | 'red';
    IsExpanded: boolean;
    IsSelected: boolean;
    FirstSeen: string;
}

export interface TaxDuplicatePair {
    TagA: string;
    TagB: string;
    TagAID: string;
    TagBID: string;
    Similarity: number;
    SeverityClass: 'high' | 'moderate';
    /** True when multiple Tag records share the same name (case-insensitive) */
    IsExactDuplicate: boolean;
    /** How many Tag records share this exact name (only set when IsExactDuplicate) */
    ExactDuplicateCount: number;
    /** All Tag IDs sharing the exact name (only set when IsExactDuplicate) */
    AllIDs: string[];
}

export interface TaxOrphanCard {
    ID: string;
    Name: string;
    UsageCount: number;
    AvgWeight: number;
    FirstSeen: string;
    LastSeen: string;
    IsSelected: boolean;
}

export interface TaxTreemapCell {
    ID: string;
    Name: string;
    ItemCount: number;
    ColorClass: string;
    RowSpan: number;
}

/** Supported audit action types — matches DB Action values (lowercased) */
export type TaxAuditAction = 'created' | 'merged' | 'moved' | 'deleted' | 'renamed' | 'deprecated' | 'descriptionchanged' | 'reactivated' | 'split';

export interface TaxAuditEvent {
    Type: TaxAuditAction;
    Description: string;
    TagRef: string;
    User: string;
    Timestamp: string;
    DayHeader: string;
}

export interface TaxHealthStat {
    Total: number;
    Healthy: number;
    NeedAttention: number;
    Orphaned: number;
    Duplicates: number;
}

export interface WeightedTag {
    Tag: string;
    Weight: number;
}

/** Status value for embedding or tagging pipeline phases */
export type ItemPipelineStatus = 'Complete' | 'Processing' | 'Failed' | 'Pending';

export interface ContentItemDetail {
    ID: string;
    Name: string;
    SourceName: string;
    SourceTypeName: string;
    ContentTypeName: string;
    FileTypeName: string;
    URL: string;
    TextContent: string;
    Checksum: string;
    Tags: WeightedTag[];
    CreatedAt: string;
    UpdatedAt: string;
    ContentSourceID: string;
    ContentSourceTypeID: string;
    StatusDot: 'complete' | 'processing' | 'error';
    TagCount: number;
    /** Whether this source type uses content/file type (false for Entity sources) */
    RequiresContentType: boolean;
    /** Entity record ID if source is entity type (for direct entity navigation) */
    EntityRecordID: string | null;
    /** Entity name if source is entity type */
    EntityName: string | null;
    /** Embedding pipeline status for this content item */
    EmbeddingStatus: ItemPipelineStatus;
    /** Tagging pipeline status for this content item */
    TaggingStatus: ItemPipelineStatus;
}

export interface SourceDetailInfo {
    ID: string;
    Name: string;
    SourceTypeName: string;
    FileTypeName: string;
    ContentTypeName: string;
    RequiresFileType: boolean;
    StatusClass: 'active' | 'error' | 'inactive';
    StatusLabel: string;
    Icon: string;
    URL: string;
    EmbeddingModelName: string;
    VectorIndexName: string;
    ItemCount: number;
    TagCount: number;
    AvgTags: string;
    LastRunAgo: string;
    ErrorCount: number;
    ContentItems: ContentItemDetail[];
    RunHistory: RunHistoryRow[];
}

// ── Slide-in form mode ──

export type FormMode = 'none' | 'add-source' | 'edit-source' | 'add-type' | 'edit-type';
