/**
 * Configuration for a single YM API endpoint.
 */
export interface YMEndpointConfig {
    /** API path segment (e.g. 'MemberList', 'Events') */
    Path: string;
    /** Target SQL table name (e.g. 'YM_Member') */
    TargetTable: string;
    /**
     * MJ entity name assigned by CodeGen for this table.
     * Must match the entity name in the Entity metadata after CodeGen runs.
     */
    EntityName: string;
    /** Primary key field(s) from the YM response */
    PKFields: string[];
    /** Whether the endpoint supports PageSize/PageNumber pagination */
    SupportsPagination: boolean;
    /** Default page size for paginated requests */
    DefaultPageSize: number;
    /**
     * The JSON property name in the response that contains the data array.
     * YM returns data in named properties, not a generic 'Result' key.
     * If null, the entire response object is treated as a single record.
     */
    ResponseDataKey: string | null;
    /**
     * Additional query parameters appended to every request for this endpoint.
     * Useful for endpoints that require filters (e.g., date ranges).
     */
    DefaultQueryParams?: Record<string, string>;
    /**
     * Whether this endpoint supports date-based filtering for incremental sync.
     * When true, the sync engine passes the last-sync timestamp via DateFilterParam.
     */
    SupportsDateFilter?: boolean;
    /**
     * The query parameter name used for date filtering (e.g., 'DateFrom').
     * Only relevant when SupportsDateFilter is true.
     */
    DateFilterParam?: string;
    /**
     * Optional transform to flatten or reshape the extracted data array.
     * Called after extracting via ResponseDataKey, before upsert.
     * Use for endpoints with nested structures (e.g., Groups nested inside GroupTypes).
     */
    TransformData?: (records: Record<string, unknown>[]) => Record<string, unknown>[];
}

/**
 * Union type for valid endpoint names.
 */
export type YMEndpointName =
    | 'Members'
    | 'Events'
    | 'Orders'
    | 'Products'
    | 'Groups'
    | 'MemberTypes'
    | 'Memberships';

/**
 * Registry of all supported YM endpoints.
 *
 * Note: EventRegistrations and Donations are excluded because:
 * - EventRegistrations requires fetching per-event (nested under /Event/{EventID}/)
 * - Donations endpoint is POST-only (create), no list/GET endpoint exists
 *
 * EventRegistrations will be handled as a second pass after Events are synced.
 */
export const YM_ENDPOINT_REGISTRY: Record<YMEndpointName, YMEndpointConfig> = {
    Members: {
        Path: 'MemberList',
        TargetTable: 'YM_Member',
        EntityName: 'YM_ Members',
        PKFields: ['ProfileID'],
        SupportsPagination: true,
        DefaultPageSize: 200,
        ResponseDataKey: 'Members',
    },
    Events: {
        Path: 'EventIDs',
        TargetTable: 'YM_Event',
        EntityName: 'YM_ Events',
        PKFields: ['ID'],
        SupportsPagination: true,
        DefaultPageSize: 200,
        ResponseDataKey: 'EventIDList',
    },
    Orders: {
        Path: 'StoreOrderDetails',
        TargetTable: 'YM_Order',
        EntityName: 'YM_ Orders',
        PKFields: ['OrderID', 'ProductCode'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        ResponseDataKey: 'StoreOrderDetailsList',
        DefaultQueryParams: { DateFrom: '2000-01-01' },
        SupportsDateFilter: true,
        DateFilterParam: 'DateFrom',
    },
    Products: {
        Path: 'Products',
        TargetTable: 'YM_Product',
        EntityName: 'YM_ Products',
        PKFields: ['id'],
        SupportsPagination: false,
        DefaultPageSize: 200,
        ResponseDataKey: null, // API returns a raw JSON array (no wrapper key)
    },
    Groups: {
        Path: 'Groups',
        TargetTable: 'YM_Group',
        EntityName: 'YM_ Groups',
        PKFields: ['Id'],
        SupportsPagination: false,
        DefaultPageSize: 200,
        ResponseDataKey: 'GroupTypeList',
        // Groups are nested: GroupTypeList[].Groups[]. Flatten them out,
        // carrying the parent GroupType fields onto each group record.
        TransformData: (groupTypes: Record<string, unknown>[]) => {
            const flattened: Record<string, unknown>[] = [];
            for (const gt of groupTypes) {
                const groups = gt.Groups as Record<string, unknown>[] | undefined;
                if (!Array.isArray(groups)) continue;
                for (const group of groups) {
                    flattened.push({
                        ...group,
                        GroupTypeId: gt.Id,
                        GroupTypeName: gt.TypeName,
                    });
                }
            }
            return flattened;
        },
    },
    MemberTypes: {
        Path: 'MemberTypes',
        TargetTable: 'YM_MemberType',
        EntityName: 'YM_ Member Types',
        PKFields: ['TypeCode'],
        SupportsPagination: false,
        DefaultPageSize: 200,
        ResponseDataKey: 'MemberTypes',
    },
    Memberships: {
        Path: 'Membership',
        TargetTable: 'YM_Membership',
        EntityName: 'YM_ Memberships',
        PKFields: ['Id'],
        SupportsPagination: false,
        DefaultPageSize: 200,
        ResponseDataKey: 'Membership',
    },
};
