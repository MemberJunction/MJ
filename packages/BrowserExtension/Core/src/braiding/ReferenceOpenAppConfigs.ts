/**
 * @fileoverview Reference Open App `BrowserContextRuleSpec` and `BrowserEntityFacetSpec`
 * configurations for Multi-App Context Braiding in the MemberJunction Browser Extension.
 *
 * Includes declarative rules and cross-app facets for:
 * - Anchor Entities: `Organizations` (by domain/website) and `People` / `Contacts` (by LinkedIn URL)
 * - Sales / CRM Open App (`Deals`, `Activities`)
 * - Recruiting / ATS Open App (`Job Applications`, `Interviews`)
 * - Caliber / Talent Assessment Open App (`Assessments`, `Coaching Sessions`)
 * - Productivity / Tasks Open App (`MJ: Tasks`)
 * - Betty / Association Intelligence Open App (`Memberships`, `Event Registrations`, `Committee Roles`)
 *
 * @module @memberjunction/browser-extension-core
 */

import type {
    BrowserContextRuleSpec,
    BrowserEntityFacetSpec,
} from '../types/extension-types.js';

/**
 * Reference Anchor Entity lookup rules (`BrowserContextRuleSpec[]`).
 */
export const REFERENCE_BROWSER_CONTEXT_RULES: BrowserContextRuleSpec[] = [
    {
        Name: 'LinkedIn Person Profile -> People',
        UrlPattern: '*://*.linkedin.com/in/*',
        Signals: [
            {
                Source: 'FullUrl',
                Normalize: 'StripTrailingSlash',
            },
        ],
        TargetEntityName: 'People',
        LookupFilterTemplate: "LinkedInURL = '{{signal_0}}' OR LinkedInURL = '{{FullUrl}}'",
        CustomExtractorClass: 'LinkedInPageExtractor',
        AllowCreateIfUnmatched: true,
        Priority: 10,
    },
    {
        Name: 'LinkedIn Company Page -> Organizations',
        UrlPattern: '*://*.linkedin.com/company/*',
        Signals: [
            {
                Source: 'FullUrl',
                Normalize: 'StripTrailingSlash',
            },
        ],
        TargetEntityName: 'Organizations',
        LookupFilterTemplate: "LinkedInURL = '{{signal_0}}' OR Website LIKE '%{{HostnameRoot}}%'",
        CustomExtractorClass: 'LinkedInPageExtractor',
        AllowCreateIfUnmatched: true,
        Priority: 20,
    },
    {
        Name: 'Company Domain -> Organizations',
        UrlPattern: '*://*/*',
        Signals: [
            {
                Source: 'HostnameRoot',
                Normalize: 'HostnameRoot',
            },
        ],
        TargetEntityName: 'Organizations',
        LookupFilterTemplate: "Domain = '{{HostnameRoot}}' OR Website LIKE '%{{HostnameRoot}}%'",
        CustomExtractorClass: 'StandardPageExtractor',
        AllowCreateIfUnmatched: true,
        Priority: 100,
    },
];

/**
 * Reference Cross-App Entity Facets (`BrowserEntityFacetSpec[]`) contributed by installed Open Apps.
 */
export const REFERENCE_BROWSER_ENTITY_FACETS: BrowserEntityFacetSpec[] = [
    // 1. Sales / CRM Open App Facets
    {
        AnchorEntityName: 'Organizations',
        FacetEntityName: 'Deals',
        ForeignKeyField: 'OrganizationID',
        ExtraFilter: "Stage NOT IN ('Closed Won', 'Closed Lost')",
        OrderBy: 'CloseDate ASC',
        MaxRecords: 5,
        CardTemplate: {
            HeaderTitle: 'Open Sales Deals',
            Icon: 'fa-solid fa-handshake',
            TitleField: 'Name',
            SubtitleField: 'Stage',
            BadgeField: 'Amount',
            SummaryFields: ['CloseDate', 'Owner'],
        },
    },
    {
        AnchorEntityName: 'Organizations',
        FacetEntityName: 'People',
        ForeignKeyField: 'OrganizationID',
        OrderBy: 'Name ASC',
        MaxRecords: 5,
        CardTemplate: {
            HeaderTitle: 'Key Contacts',
            Icon: 'fa-solid fa-address-book',
            TitleField: 'Name',
            SubtitleField: 'Title',
            BadgeField: 'Role',
            SummaryFields: ['Email', 'Phone'],
        },
    },

    // 2. Recruiting / ATS Open App Facets
    {
        AnchorEntityName: 'People',
        FacetEntityName: 'Job Applications',
        ForeignKeyField: 'CandidateID',
        OrderBy: '__mj_CreatedAt DESC',
        MaxRecords: 5,
        CardTemplate: {
            HeaderTitle: 'ATS Job Applications',
            Icon: 'fa-solid fa-briefcase',
            TitleField: 'RequisitionTitle',
            SubtitleField: 'Stage',
            BadgeField: 'Status',
            SummaryFields: ['AppliedDate', 'HiringManager'],
        },
    },

    // 3. Caliber / Coaching & Talent Assessment Open App Facets
    {
        AnchorEntityName: 'People',
        FacetEntityName: 'Assessments',
        ForeignKeyField: 'PersonID',
        OrderBy: 'CompletedAt DESC',
        MaxRecords: 3,
        CardTemplate: {
            HeaderTitle: 'Caliber Assessments',
            Icon: 'fa-solid fa-chart-line',
            TitleField: 'AssessmentType',
            SubtitleField: 'SummaryLevel',
            BadgeField: 'OverallScore',
            SummaryFields: ['CompletedAt', 'CoachName'],
        },
    },

    // 4. Productivity / Tasks Open App Facets
    {
        AnchorEntityName: 'Organizations',
        FacetEntityName: 'MJ: Tasks',
        ForeignKeyField: 'ParentID',
        ExtraFilter: "Status <> 'Completed'",
        OrderBy: 'DueAt ASC',
        MaxRecords: 5,
        CardTemplate: {
            HeaderTitle: 'Open Tasks',
            Icon: 'fa-solid fa-list-check',
            TitleField: 'Name',
            SubtitleField: 'Status',
            BadgeField: 'PercentComplete',
            SummaryFields: ['DueAt'],
        },
    },
    {
        AnchorEntityName: 'People',
        FacetEntityName: 'MJ: Tasks',
        ForeignKeyField: 'UserID',
        ExtraFilter: "Status <> 'Completed'",
        OrderBy: 'DueAt ASC',
        MaxRecords: 5,
        CardTemplate: {
            HeaderTitle: 'Assigned Tasks',
            Icon: 'fa-solid fa-list-check',
            TitleField: 'Name',
            SubtitleField: 'Status',
            BadgeField: 'PercentComplete',
            SummaryFields: ['DueAt'],
        },
    },

    // 5. Betty / Association & Community Intelligence Open App Facets
    {
        AnchorEntityName: 'People',
        FacetEntityName: 'Memberships',
        ForeignKeyField: 'MemberID',
        OrderBy: 'RenewalDate DESC',
        MaxRecords: 3,
        CardTemplate: {
            HeaderTitle: 'Association Memberships',
            Icon: 'fa-solid fa-id-card',
            TitleField: 'MembershipTier',
            SubtitleField: 'ChapterName',
            BadgeField: 'Status',
            SummaryFields: ['RenewalDate', 'EngagementScore'],
        },
    },
    {
        AnchorEntityName: 'People',
        FacetEntityName: 'Event Registrations',
        ForeignKeyField: 'AttendeeID',
        OrderBy: 'EventDate DESC',
        MaxRecords: 5,
        CardTemplate: {
            HeaderTitle: 'Upcoming & Past Events',
            Icon: 'fa-solid fa-calendar-check',
            TitleField: 'EventName',
            SubtitleField: 'RegistrationType',
            BadgeField: 'AttendanceStatus',
            SummaryFields: ['EventDate', 'CEUCredits'],
        },
    },
    {
        AnchorEntityName: 'Organizations',
        FacetEntityName: 'Memberships',
        ForeignKeyField: 'OrganizationID',
        OrderBy: 'RenewalDate DESC',
        MaxRecords: 3,
        CardTemplate: {
            HeaderTitle: 'Organizational Membership & Sponsorship',
            Icon: 'fa-solid fa-building-Columns',
            TitleField: 'MembershipTier',
            SubtitleField: 'SponsorshipLevel',
            BadgeField: 'Status',
            SummaryFields: ['RenewalDate', 'AnnualDues'],
        },
    },
];
