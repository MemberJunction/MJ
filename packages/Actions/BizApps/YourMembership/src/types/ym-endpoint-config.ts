/**
 * Known YM endpoint names for the sync system.
 */
export type YMEndpointName =
    | 'Members'
    | 'Events'
    | 'EventRegistrations'
    | 'Donations'
    | 'Orders'
    | 'Products'
    | 'Groups'
    | 'MemberTypes'
    | 'Memberships';

/**
 * Configuration for a single YM API endpoint used by the sync system.
 */
export interface YMEndpointConfig {
    /** The URL path segment after /Ams/{ClientID}/ */
    Path: string;
    /** Whether this endpoint supports pagination via MaxRows/Offset */
    SupportsPagination: boolean;
    /** Default page size for pagination */
    DefaultPageSize: number;
    /** SQL table name to create in the target schema */
    TargetTable: string;
    /** Field(s) in YM data that uniquely identify a record */
    PKFields: string[];
}

/**
 * Registry of all known YM endpoints and their configuration.
 * Used by the sync engine to iterate over endpoints and map data to SQL tables.
 */
export const YM_ENDPOINT_REGISTRY: Record<YMEndpointName, YMEndpointConfig> = {
    Members: {
        Path: 'MemberList',
        SupportsPagination: true,
        DefaultPageSize: 200,
        TargetTable: 'YM_Members',
        PKFields: ['ProfileID'],
    },
    Events: {
        Path: 'Events',
        SupportsPagination: true,
        DefaultPageSize: 200,
        TargetTable: 'YM_Events',
        PKFields: ['EventID'],
    },
    EventRegistrations: {
        Path: 'EventRegistrations',
        SupportsPagination: true,
        DefaultPageSize: 200,
        TargetTable: 'YM_EventRegistrations',
        PKFields: ['RegistrationID'],
    },
    Donations: {
        Path: 'DonationHistory',
        SupportsPagination: true,
        DefaultPageSize: 200,
        TargetTable: 'YM_Donations',
        PKFields: ['DonationID'],
    },
    Orders: {
        Path: 'StoreOrders',
        SupportsPagination: true,
        DefaultPageSize: 200,
        TargetTable: 'YM_Orders',
        PKFields: ['OrderID'],
    },
    Products: {
        Path: 'Products',
        SupportsPagination: true,
        DefaultPageSize: 200,
        TargetTable: 'YM_Products',
        PKFields: ['ProductID'],
    },
    Groups: {
        Path: 'Groups',
        SupportsPagination: true,
        DefaultPageSize: 200,
        TargetTable: 'YM_Groups',
        PKFields: ['GroupID'],
    },
    MemberTypes: {
        Path: 'MemberTypes',
        SupportsPagination: false,
        DefaultPageSize: 1000,
        TargetTable: 'YM_MemberTypes',
        PKFields: ['TypeID'],
    },
    Memberships: {
        Path: 'Memberships',
        SupportsPagination: false,
        DefaultPageSize: 1000,
        TargetTable: 'YM_Memberships',
        PKFields: ['MembershipID'],
    },
};
