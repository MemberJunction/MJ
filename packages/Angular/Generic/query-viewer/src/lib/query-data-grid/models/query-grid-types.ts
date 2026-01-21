/**
 * Types and interfaces for the Query Data Grid component.
 * These are tailored for query results which differ from entity data:
 * - Read-only (no CRUD operations)
 * - Client-side sorting only (query SQL defines ORDER BY)
 * - No smart filter (parameters only)
 * - Support for entity linking via SourceEntityID
 */

import { QueryInfo, QueryFieldInfo, QueryParameterInfo, Metadata, EntityInfo, EntityFieldInfo } from '@memberjunction/core';

// ========================================
// Selection Mode
// ========================================

/**
 * Selection mode for the query grid
 * - 'none': No selection allowed
 * - 'single': Only one row can be selected at a time
 * - 'multiple': Multiple rows can be selected (click to toggle)
 * - 'checkbox': Checkbox column for selection
 */
export type QueryGridSelectionMode = 'none' | 'single' | 'multiple' | 'checkbox';

// ========================================
// Column Configuration
// ========================================

/**
 * Configuration for a query grid column
 * Derived from QueryFieldInfo metadata
 */
export interface QueryGridColumnConfig {
    /** Field name from query results */
    field: string;

    /** Display title (defaults to field name) */
    title: string;

    /** Description/tooltip for the column header */
    description?: string;

    /** Column width in pixels */
    width?: number;

    /** Minimum width for resizing */
    minWidth?: number;

    /** Maximum width for resizing */
    maxWidth?: number;

    /** Column is visible */
    visible: boolean;

    /** Column is sortable (client-side) */
    sortable: boolean;

    /** Column is resizable */
    resizable: boolean;

    /** Column is reorderable */
    reorderable: boolean;

    /** SQL base type for formatting */
    sqlBaseType: string;

    /** SQL full type for display */
    sqlFullType: string;

    /** Text alignment */
    align?: 'left' | 'center' | 'right';

    /** Order/sequence of this column */
    order: number;

    /** Source entity ID if this column references an entity */
    sourceEntityId?: string;

    /** Source entity name if this column references an entity */
    sourceEntityName?: string;

    /** Source field name in the entity (e.g., 'ID' for primary key) */
    sourceFieldName?: string;

    /** Whether this column contains linkable entity IDs */
    isEntityLink: boolean;

    /**
     * The entity name to navigate to when clicking the link.
     * - For primary keys: this is the source entity itself
     * - For foreign keys: this is the related entity the FK points to
     */
    targetEntityName?: string;

    /**
     * The entity ID to navigate to when clicking the link.
     */
    targetEntityId?: string;

    /**
     * Whether this field is a primary key of the source entity
     */
    isPrimaryKey?: boolean;

    /**
     * Whether this field is a foreign key to another entity
     */
    isForeignKey?: boolean;

    /**
     * Icon class for the target entity (from EntityInfo.Icon)
     * Used to display the entity's icon in the column header
     */
    targetEntityIcon?: string;

    /** Column pinning position */
    pinned?: 'left' | 'right' | null;

    /** Flex grow factor for auto-sizing */
    flex?: number;
}

// ========================================
// Sort State
// ========================================

/**
 * Sort state for a column (client-side sorting)
 */
export interface QueryGridSortState {
    /** Field name being sorted */
    field: string;
    /** Sort direction */
    direction: 'asc' | 'desc';
    /** Index for multi-sort ordering */
    index: number;
}

// ========================================
// Grid State (for persistence)
// ========================================

/**
 * Complete grid state for persistence to User Settings
 */
export interface QueryGridState {
    /** Column states */
    columns: Array<{
        field: string;
        width?: number;
        visible: boolean;
        order: number;
        pinned?: 'left' | 'right' | null;
    }>;
    /** Sort state (client-side) */
    sort: QueryGridSortState[];
}

// ========================================
// Parameter State (for persistence)
// ========================================

/**
 * Parameter values for a query execution
 */
export interface QueryParameterValues {
    [parameterName: string]: string | number | boolean | Date | string[] | null;
}

// ========================================
// Visual Configuration
// ========================================

/**
 * Header style preset options
 */
export type QueryGridHeaderStyle = 'flat' | 'elevated' | 'gradient' | 'bold';

/**
 * Configuration for query grid visual appearance
 */
export interface QueryGridVisualConfig {
    /** Header style preset */
    headerStyle?: QueryGridHeaderStyle;
    /** Custom header background color */
    headerBackground?: string;
    /** Custom header text color */
    headerTextColor?: string;
    /** Show bottom shadow/border on header */
    headerShadow?: boolean;
    /** Enable alternating row colors (zebra striping) */
    alternateRows?: boolean;
    /** Contrast level for alternating rows */
    alternateRowContrast?: 'subtle' | 'medium' | 'strong';
    /** Enable smooth hover transitions */
    hoverTransitions?: boolean;
    /** Right-align numeric columns automatically */
    rightAlignNumbers?: boolean;
    /** Format dates with a friendly format */
    friendlyDates?: boolean;
    /** Render email cells as clickable mailto links */
    clickableEmails?: boolean;
    /** Render boolean cells as checkmark/x icons */
    booleanIcons?: boolean;
    /** Render URL cells as clickable links */
    clickableUrls?: boolean;
    /** Selection indicator color */
    selectionIndicatorColor?: string;
    /** Selection indicator width */
    selectionIndicatorWidth?: number;
    /** Selection background color */
    selectionBackground?: string;
    /** Checkbox style */
    checkboxStyle?: 'default' | 'rounded' | 'filled';
    /** Checkbox accent color */
    checkboxColor?: string;
    /** Show skeleton loading rows */
    skeletonLoading?: boolean;
    /** Number of skeleton rows */
    skeletonRowCount?: number;
    /** Border radius for container */
    borderRadius?: number;
    /** Cell padding preset */
    cellPadding?: 'compact' | 'normal' | 'comfortable';
    /** Primary accent color */
    accentColor?: string;
}

/**
 * Default visual configuration for query grid
 */
export const DEFAULT_QUERY_VISUAL_CONFIG: Required<QueryGridVisualConfig> = {
    headerStyle: 'elevated',
    headerBackground: '',
    headerTextColor: '',
    headerShadow: true,
    alternateRows: true,
    alternateRowContrast: 'medium',
    hoverTransitions: true,
    rightAlignNumbers: true,
    friendlyDates: true,
    clickableEmails: true,
    booleanIcons: true,
    clickableUrls: true,
    selectionIndicatorColor: '#f9a825',
    selectionIndicatorWidth: 3,
    selectionBackground: '#fff9e6',
    checkboxStyle: 'rounded',
    checkboxColor: '#2196F3',
    skeletonLoading: true,
    skeletonRowCount: 8,
    borderRadius: 0,
    cellPadding: 'normal',
    accentColor: '#2196F3'
};

// ========================================
// Export Options
// ========================================

/**
 * Export options for query results
 */
export interface QueryExportOptions {
    /** Export only visible columns */
    visibleColumnsOnly?: boolean;
    /** Export only selected rows */
    selectedRowsOnly?: boolean;
    /** Include headers */
    includeHeaders?: boolean;
    /** Custom column mapping */
    columnMapping?: Record<string, string>;
}

// ========================================
// Events
// ========================================

/**
 * Event fired when a row is clicked
 */
export interface QueryRowClickEvent {
    /** The row data */
    rowData: Record<string, unknown>;
    /** Row index */
    rowIndex: number;
    /** Column that was clicked */
    column?: QueryGridColumnConfig;
    /** Cell value */
    cellValue?: unknown;
    /** Original mouse event */
    mouseEvent: MouseEvent;
}

/**
 * Event fired when an entity link is clicked
 */
export interface QueryEntityLinkClickEvent {
    /** Entity name */
    entityName: string;
    /** Record ID (primary key value) */
    recordId: string;
    /** The column config (null if clicked from row detail panel) */
    column: QueryGridColumnConfig | null;
    /** The row data */
    rowData: Record<string, unknown>;
}

/**
 * Event fired when grid state changes
 */
export interface QueryGridStateChangedEvent {
    /** The new grid state */
    state: QueryGridState;
    /** What changed */
    changeType: 'column-resize' | 'column-move' | 'column-visibility' | 'sort';
}

/**
 * Event fired when selection changes
 */
export interface QuerySelectionChangedEvent {
    /** Selected row indices */
    selectedIndices: number[];
    /** Selected row data */
    selectedRows: Record<string, unknown>[];
}

// ========================================
// Utility Functions
// ========================================

/**
 * Result of resolving the target entity for navigation
 */
interface TargetEntityInfo {
    targetEntityName?: string;
    targetEntityId?: string;
    targetEntityIcon?: string;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
}

/**
 * Determines the target entity for navigation based on source entity field metadata.
 * - If the source field is a primary key, target is the source entity itself
 * - If the source field is a foreign key, target is the related entity
 * Also retrieves the target entity's icon for display in column headers.
 */
function resolveTargetEntity(
    sourceEntityName: string | undefined,
    sourceFieldName: string | undefined,
    md: Metadata
): TargetEntityInfo {
    if (!sourceEntityName || !sourceFieldName) {
        return { isPrimaryKey: false, isForeignKey: false };
    }

    // Look up the source entity
    const sourceEntity = md.Entities.find(e => e.Name === sourceEntityName);
    if (!sourceEntity) {
        return { isPrimaryKey: false, isForeignKey: false };
    }

    // Find the field in the source entity
    const entityField = sourceEntity.Fields.find(f => f.Name === sourceFieldName);
    if (!entityField) {
        return { isPrimaryKey: false, isForeignKey: false };
    }

    // Check if it's a primary key
    if (entityField.IsPrimaryKey) {
        return {
            targetEntityName: sourceEntityName,
            targetEntityId: sourceEntity.ID,
            targetEntityIcon: sourceEntity.Icon || undefined,
            isPrimaryKey: true,
            isForeignKey: false
        };
    }

    // Check if it's a foreign key (has RelatedEntity)
    if (entityField.RelatedEntity && entityField.RelatedEntity.trim().length > 0) {
        const relatedEntity = md.Entities.find(e => e.Name === entityField.RelatedEntity);
        return {
            targetEntityName: entityField.RelatedEntity,
            targetEntityId: relatedEntity?.ID,
            targetEntityIcon: relatedEntity?.Icon || undefined,
            isPrimaryKey: false,
            isForeignKey: true
        };
    }

    return { isPrimaryKey: false, isForeignKey: false };
}

/**
 * Builds column configs from QueryFieldInfo metadata
 */
export function buildColumnsFromQueryFields(fields: QueryFieldInfo[]): QueryGridColumnConfig[] {
    const md = new Metadata();

    return fields
        .sort((a, b) => (a.Sequence || 0) - (b.Sequence || 0))
        .map((field, index) => {
            // Resolve the target entity using metadata
            const targetInfo = resolveTargetEntity(field.SourceEntity, field.SourceFieldName, md);

            // Determine if this is an entity link
            // It's linkable if we have a valid target entity (either PK or FK)
            const isEntityLink = !!(targetInfo.targetEntityName && (targetInfo.isPrimaryKey || targetInfo.isForeignKey));

            // Determine alignment based on type
            let align: 'left' | 'center' | 'right' = 'left';
            const baseType = (field.SQLBaseType || '').toLowerCase();
            if (['int', 'bigint', 'decimal', 'numeric', 'float', 'money', 'smallmoney', 'real'].includes(baseType)) {
                align = 'right';
            } else if (['bit'].includes(baseType)) {
                align = 'center';
            }

            return {
                field: field.Name,
                title: field.Name, // Could be enhanced to parse CamelCase
                description: field.Description || undefined,
                width: undefined,
                minWidth: 80,
                maxWidth: undefined, // No max width limit - let users resize freely
                visible: true,
                sortable: true,
                resizable: true,
                reorderable: true,
                sqlBaseType: field.SQLBaseType || 'nvarchar',
                sqlFullType: field.SQLFullType || 'nvarchar(max)',
                align,
                order: index,
                sourceEntityId: field.SourceEntityID || undefined,
                sourceEntityName: field.SourceEntity || undefined,
                sourceFieldName: field.SourceFieldName || undefined,
                isEntityLink,
                targetEntityName: targetInfo.targetEntityName,
                targetEntityId: targetInfo.targetEntityId,
                isPrimaryKey: targetInfo.isPrimaryKey,
                isForeignKey: targetInfo.isForeignKey,
                targetEntityIcon: targetInfo.targetEntityIcon,
                pinned: null,
                flex: undefined
            };
        });
}

/**
 * Gets the User Settings key for query grid state
 */
export function getQueryGridStateKey(queryId: string): string {
    return `QueryViewer_${queryId}_GridState`;
}

/**
 * Gets the User Settings key for query parameters
 */
export function getQueryParamsKey(queryId: string): string {
    return `QueryViewer_${queryId}_LastParams`;
}

/**
 * Infers column configuration from actual data when query has no field metadata.
 * Examines the first row to determine column names and types.
 */
export function buildColumnsFromData(data: Record<string, unknown>[]): QueryGridColumnConfig[] {
    if (!data || data.length === 0) {
        return [];
    }

    // Get column names from first row
    const firstRow = data[0];
    const columnNames = Object.keys(firstRow);

    return columnNames.map((name, index) => {
        // Infer type from value
        const value = firstRow[name];
        let sqlBaseType = 'nvarchar';
        let align: 'left' | 'center' | 'right' = 'left';

        if (typeof value === 'number') {
            sqlBaseType = Number.isInteger(value) ? 'int' : 'decimal';
            align = 'right';
        } else if (typeof value === 'boolean') {
            sqlBaseType = 'bit';
            align = 'center';
        } else if (value instanceof Date) {
            sqlBaseType = 'datetime';
        } else if (typeof value === 'string') {
            // Check if it looks like a date
            const datePattern = /^\d{4}-\d{2}-\d{2}/;
            if (datePattern.test(value)) {
                sqlBaseType = 'datetime';
            }
        }

        return {
            field: name,
            title: name,
            description: undefined,
            width: undefined,
            minWidth: 80,
            maxWidth: undefined,
            visible: true,
            sortable: true,
            resizable: true,
            reorderable: true,
            sqlBaseType,
            sqlFullType: sqlBaseType,
            align,
            order: index,
            sourceEntityId: undefined,
            sourceEntityName: undefined,
            sourceFieldName: undefined,
            isEntityLink: false,
            targetEntityName: undefined,
            targetEntityId: undefined,
            isPrimaryKey: false,
            isForeignKey: false,
            targetEntityIcon: undefined,
            pinned: null,
            flex: undefined
        };
    });
}
