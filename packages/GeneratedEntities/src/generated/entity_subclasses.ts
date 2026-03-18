import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity All Campaigns
 */
export const YourMembershipAllCampaignSchema = z.object({
    CampaignId: z.number().describe(`
        * * Field Name: CampaignId
        * * Display Name: Campaign ID
        * * SQL Data Type: int`),
    CampaignName: z.string().nullable().describe(`
        * * Field Name: CampaignName
        * * Display Name: Campaign Name
        * * SQL Data Type: nvarchar(200)`),
    Subject: z.string().nullable().describe(`
        * * Field Name: Subject
        * * Display Name: Subject
        * * SQL Data Type: nvarchar(200)`),
    Status: z.string().nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(200)`),
    Category: z.string().nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(200)`),
    Type: z.string().nullable().describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(200)`),
    DateScheduled: z.date().nullable().describe(`
        * * Field Name: DateScheduled
        * * Display Name: Date Scheduled
        * * SQL Data Type: datetimeoffset`),
    DateSent: z.date().nullable().describe(`
        * * Field Name: DateSent
        * * Display Name: Date Sent
        * * SQL Data Type: datetimeoffset`),
    ProcessingCount: z.number().nullable().describe(`
        * * Field Name: ProcessingCount
        * * Display Name: Processing Count
        * * SQL Data Type: int`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipAllCampaignEntityType = z.infer<typeof YourMembershipAllCampaignSchema>;

/**
 * zod schema definition for the entity Announcements
 */
export const YourMembershipAnnouncementSchema = z.object({
    AnnouncementId: z.number().describe(`
        * * Field Name: AnnouncementId
        * * Display Name: Announcement ID
        * * SQL Data Type: int`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(200)`),
    Text: z.string().nullable().describe(`
        * * Field Name: Text
        * * Display Name: Announcement Text
        * * SQL Data Type: nvarchar(500)`),
    StartDate: z.date().nullable().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: datetimeoffset`),
    EndDate: z.date().nullable().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: datetimeoffset`),
    Active: z.boolean().nullable().describe(`
        * * Field Name: Active
        * * Display Name: Active
        * * SQL Data Type: bit`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipAnnouncementEntityType = z.infer<typeof YourMembershipAnnouncementSchema>;

/**
 * zod schema definition for the entity Calls
 */
export const HubSpotCallSchema = z.object({
    hs_object_id: z.string().describe(`
        * * Field Name: hs_object_id
        * * Display Name: Object ID
        * * SQL Data Type: nvarchar(100)`),
    hs_call_title: z.string().nullable().describe(`
        * * Field Name: hs_call_title
        * * Display Name: Call Title
        * * SQL Data Type: nvarchar(500)`),
    hs_call_body: z.string().nullable().describe(`
        * * Field Name: hs_call_body
        * * Display Name: Call Notes
        * * SQL Data Type: nvarchar(MAX)`),
    hs_call_status: z.string().nullable().describe(`
        * * Field Name: hs_call_status
        * * Display Name: Call Status
        * * SQL Data Type: nvarchar(500)`),
    hs_call_direction: z.string().nullable().describe(`
        * * Field Name: hs_call_direction
        * * Display Name: Direction
        * * SQL Data Type: nvarchar(500)`),
    hs_call_duration: z.number().nullable().describe(`
        * * Field Name: hs_call_duration
        * * Display Name: Duration (ms)
        * * SQL Data Type: int`),
    hs_call_from_number: z.string().nullable().describe(`
        * * Field Name: hs_call_from_number
        * * Display Name: From Number
        * * SQL Data Type: nvarchar(500)`),
    hs_call_to_number: z.string().nullable().describe(`
        * * Field Name: hs_call_to_number
        * * Display Name: To Number
        * * SQL Data Type: nvarchar(500)`),
    hs_call_disposition: z.string().nullable().describe(`
        * * Field Name: hs_call_disposition
        * * Display Name: Call Outcome
        * * SQL Data Type: nvarchar(500)`),
    hs_call_recording_url: z.string().nullable().describe(`
        * * Field Name: hs_call_recording_url
        * * Display Name: Recording URL
        * * SQL Data Type: nvarchar(1000)`),
    hubspot_owner_id: z.string().nullable().describe(`
        * * Field Name: hubspot_owner_id
        * * Display Name: HubSpot Owner
        * * SQL Data Type: nvarchar(100)`),
    hs_timestamp: z.date().nullable().describe(`
        * * Field Name: hs_timestamp
        * * Display Name: Call Timestamp
        * * SQL Data Type: datetimeoffset`),
    createdate: z.date().nullable().describe(`
        * * Field Name: createdate
        * * Display Name: Created Date
        * * SQL Data Type: datetimeoffset`),
    hs_lastmodifieddate: z.date().nullable().describe(`
        * * Field Name: hs_lastmodifieddate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotCallEntityType = z.infer<typeof HubSpotCallSchema>;

/**
 * zod schema definition for the entity Campaign Email Lists
 */
export const YourMembershipCampaignEmailListSchema = z.object({
    ListId: z.number().describe(`
        * * Field Name: ListId
        * * Display Name: List ID
        * * SQL Data Type: int`),
    ListType: z.string().nullable().describe(`
        * * Field Name: ListType
        * * Display Name: List Type
        * * SQL Data Type: nvarchar(200)`),
    ListSize: z.number().nullable().describe(`
        * * Field Name: ListSize
        * * Display Name: List Size
        * * SQL Data Type: int`),
    ListName: z.string().nullable().describe(`
        * * Field Name: ListName
        * * Display Name: List Name
        * * SQL Data Type: nvarchar(200)`),
    ListArea: z.string().nullable().describe(`
        * * Field Name: ListArea
        * * Display Name: List Area
        * * SQL Data Type: nvarchar(200)`),
    DateCreated: z.date().nullable().describe(`
        * * Field Name: DateCreated
        * * Display Name: Date Created
        * * SQL Data Type: datetimeoffset`),
    DateModified: z.date().nullable().describe(`
        * * Field Name: DateModified
        * * Display Name: Date Modified
        * * SQL Data Type: datetimeoffset`),
    DateLastUpdated: z.date().nullable().describe(`
        * * Field Name: DateLastUpdated
        * * Display Name: Date Last Updated
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipCampaignEmailListEntityType = z.infer<typeof YourMembershipCampaignEmailListSchema>;

/**
 * zod schema definition for the entity Campaigns
 */
export const YourMembershipCampaignSchema = z.object({
    CampaignId: z.number().describe(`
        * * Field Name: CampaignId
        * * Display Name: Campaign ID
        * * SQL Data Type: int`),
    CampaignName: z.string().nullable().describe(`
        * * Field Name: CampaignName
        * * Display Name: Campaign Name
        * * SQL Data Type: nvarchar(200)`),
    Subject: z.string().nullable().describe(`
        * * Field Name: Subject
        * * Display Name: Subject
        * * SQL Data Type: nvarchar(200)`),
    SenderEmail: z.string().nullable().describe(`
        * * Field Name: SenderEmail
        * * Display Name: Sender Email
        * * SQL Data Type: nvarchar(200)`),
    DateScheduled: z.date().nullable().describe(`
        * * Field Name: DateScheduled
        * * Display Name: Date Scheduled
        * * SQL Data Type: datetimeoffset`),
    DateSent: z.date().nullable().describe(`
        * * Field Name: DateSent
        * * Display Name: Date Sent
        * * SQL Data Type: datetimeoffset`),
    Status: z.string().nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipCampaignEntityType = z.infer<typeof YourMembershipCampaignSchema>;

/**
 * zod schema definition for the entity Career Openings
 */
export const YourMembershipCareerOpeningSchema = z.object({
    CareerOpeningID: z.number().describe(`
        * * Field Name: CareerOpeningID
        * * Display Name: Career Opening ID
        * * SQL Data Type: int`),
    Position: z.string().nullable().describe(`
        * * Field Name: Position
        * * Display Name: Position
        * * SQL Data Type: nvarchar(200)`),
    Organization: z.string().nullable().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(200)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(200)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(200)`),
    Salary: z.string().nullable().describe(`
        * * Field Name: Salary
        * * Display Name: Salary
        * * SQL Data Type: nvarchar(200)`),
    DatePosted: z.date().nullable().describe(`
        * * Field Name: DatePosted
        * * Display Name: Date Posted
        * * SQL Data Type: datetimeoffset`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    ContactEmail: z.string().nullable().describe(`
        * * Field Name: ContactEmail
        * * Display Name: Contact Email
        * * SQL Data Type: nvarchar(500)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipCareerOpeningEntityType = z.infer<typeof YourMembershipCareerOpeningSchema>;

/**
 * zod schema definition for the entity Certification Credit Types
 */
export const YourMembershipCertificationCreditTypeSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    Code: z.string().nullable().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(200)`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    IsDefault: z.boolean().nullable().describe(`
        * * Field Name: IsDefault
        * * Display Name: Is Default
        * * SQL Data Type: bit`),
    CreditsExpire: z.boolean().nullable().describe(`
        * * Field Name: CreditsExpire
        * * Display Name: Credits Expire
        * * SQL Data Type: bit`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipCertificationCreditTypeEntityType = z.infer<typeof YourMembershipCertificationCreditTypeSchema>;

/**
 * zod schema definition for the entity Certification Journals
 */
export const YourMembershipCertificationJournalSchema = z.object({
    EntryID: z.number().describe(`
        * * Field Name: EntryID
        * * Display Name: Entry ID
        * * SQL Data Type: int`),
    CertificationName: z.string().nullable().describe(`
        * * Field Name: CertificationName
        * * Display Name: Certification Name
        * * SQL Data Type: nvarchar(200)`),
    CEUsEarned: z.number().nullable().describe(`
        * * Field Name: CEUsEarned
        * * Display Name: CEUs Earned
        * * SQL Data Type: decimal(18, 2)`),
    EntryDate: z.date().nullable().describe(`
        * * Field Name: EntryDate
        * * Display Name: Entry Date
        * * SQL Data Type: datetimeoffset`),
    Status: z.string().nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    WebsiteMemberID: z.number().nullable().describe(`
        * * Field Name: WebsiteMemberID
        * * Display Name: Website Member
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipCertificationJournalEntityType = z.infer<typeof YourMembershipCertificationJournalSchema>;

/**
 * zod schema definition for the entity Certifications
 */
export const YourMembershipCertificationSchema = z.object({
    CertificationID: z.string().describe(`
        * * Field Name: CertificationID
        * * Display Name: Certification
        * * SQL Data Type: nvarchar(200)`),
    ID: z.string().nullable().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: nvarchar(200)`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    IsActive: z.boolean().nullable().describe(`
        * * Field Name: IsActive
        * * Display Name: Active
        * * SQL Data Type: bit`),
    CEUsRequired: z.number().nullable().describe(`
        * * Field Name: CEUsRequired
        * * Display Name: CEUs Required
        * * SQL Data Type: int`),
    Code: z.string().nullable().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipCertificationEntityType = z.infer<typeof YourMembershipCertificationSchema>;

/**
 * zod schema definition for the entity Companies
 */
export const HubSpotCompanySchema = z.object({
    hs_object_id: z.string().describe(`
        * * Field Name: hs_object_id
        * * Display Name: Object ID
        * * SQL Data Type: nvarchar(100)`),
    name: z.string().nullable().describe(`
        * * Field Name: name
        * * Display Name: Company Name
        * * SQL Data Type: nvarchar(500)`),
    domain: z.string().nullable().describe(`
        * * Field Name: domain
        * * Display Name: Domain
        * * SQL Data Type: nvarchar(500)`),
    industry: z.string().nullable().describe(`
        * * Field Name: industry
        * * Display Name: Industry
        * * SQL Data Type: nvarchar(500)`),
    phone: z.string().nullable().describe(`
        * * Field Name: phone
        * * Display Name: Phone Number
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.Phone)`),
    address: z.string().nullable().describe(`
        * * Field Name: address
        * * Display Name: Address Line 1
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.Address1)`),
    address2: z.string().nullable().describe(`
        * * Field Name: address2
        * * Display Name: Address Line 2
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.Address2)`),
    city: z.string().nullable().describe(`
        * * Field Name: city
        * * Display Name: City
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.City)`),
    state: z.string().nullable().describe(`
        * * Field Name: state
        * * Display Name: State/Province
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.State)`),
    zip: z.string().nullable().describe(`
        * * Field Name: zip
        * * Display Name: Postal Code
        * * SQL Data Type: nvarchar(500)`),
    country: z.string().nullable().describe(`
        * * Field Name: country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.Country)`),
    website: z.string().nullable().describe(`
        * * Field Name: website
        * * Display Name: Website URL
        * * SQL Data Type: nvarchar(1000)`),
    description: z.string().nullable().describe(`
        * * Field Name: description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    numberofemployees: z.number().nullable().describe(`
        * * Field Name: numberofemployees
        * * Display Name: Number of Employees
        * * SQL Data Type: int`),
    annualrevenue: z.number().nullable().describe(`
        * * Field Name: annualrevenue
        * * Display Name: Annual Revenue
        * * SQL Data Type: decimal(18, 2)`),
    lifecyclestage: z.string().nullable().describe(`
        * * Field Name: lifecyclestage
        * * Display Name: Lifecycle Stage
        * * SQL Data Type: nvarchar(500)`),
    type: z.string().nullable().describe(`
        * * Field Name: type
        * * Display Name: Company Type
        * * SQL Data Type: nvarchar(500)`),
    createdate: z.date().nullable().describe(`
        * * Field Name: createdate
        * * Display Name: HubSpot Created Date
        * * SQL Data Type: datetimeoffset`),
    hs_lastmodifieddate: z.date().nullable().describe(`
        * * Field Name: hs_lastmodifieddate
        * * Display Name: HubSpot Last Modified
        * * SQL Data Type: datetimeoffset`),
    founded_year: z.string().nullable().describe(`
        * * Field Name: founded_year
        * * Display Name: Founded Year
        * * SQL Data Type: nvarchar(500)`),
    is_public: z.boolean().nullable().describe(`
        * * Field Name: is_public
        * * Display Name: Is Public
        * * SQL Data Type: bit`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotCompanyEntityType = z.infer<typeof HubSpotCompanySchema>;

/**
 * zod schema definition for the entity Company Calls
 */
export const HubSpotCompanyCallSchema = z.object({
    company_id: z.string().describe(`
        * * Field Name: company_id
        * * Display Name: Company
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
        * * Description: HubSpot Company hs_object_id`),
    call_id: z.string().describe(`
        * * Field Name: call_id
        * * Display Name: Call
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Calls (vwCalls.hs_object_id)
        * * Description: HubSpot Call hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotCompanyCallEntityType = z.infer<typeof HubSpotCompanyCallSchema>;

/**
 * zod schema definition for the entity Company Deals
 */
export const HubSpotCompanyDealSchema = z.object({
    company_id: z.string().describe(`
        * * Field Name: company_id
        * * Display Name: Company
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
        * * Description: HubSpot Company hs_object_id`),
    deal_id: z.string().describe(`
        * * Field Name: deal_id
        * * Display Name: Deal
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
        * * Description: HubSpot Deal hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotCompanyDealEntityType = z.infer<typeof HubSpotCompanyDealSchema>;

/**
 * zod schema definition for the entity Company Emails
 */
export const HubSpotCompanyEmailSchema = z.object({
    company_id: z.string().describe(`
        * * Field Name: company_id
        * * Display Name: Company
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
        * * Description: HubSpot Company hs_object_id`),
    email_id: z.string().describe(`
        * * Field Name: email_id
        * * Display Name: Email
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Emails (vwEmails.hs_object_id)
        * * Description: HubSpot Email hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotCompanyEmailEntityType = z.infer<typeof HubSpotCompanyEmailSchema>;

/**
 * zod schema definition for the entity Company Meetings
 */
export const HubSpotCompanyMeetingSchema = z.object({
    company_id: z.string().describe(`
        * * Field Name: company_id
        * * Display Name: Company
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
        * * Description: HubSpot Company hs_object_id`),
    meeting_id: z.string().describe(`
        * * Field Name: meeting_id
        * * Display Name: Meeting
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Meetings (vwMeetings.hs_object_id)
        * * Description: HubSpot Meeting hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotCompanyMeetingEntityType = z.infer<typeof HubSpotCompanyMeetingSchema>;

/**
 * zod schema definition for the entity Company Notes
 */
export const HubSpotCompanyNoteSchema = z.object({
    company_id: z.string().describe(`
        * * Field Name: company_id
        * * Display Name: Company
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
        * * Description: HubSpot Company hs_object_id`),
    note_id: z.string().describe(`
        * * Field Name: note_id
        * * Display Name: Note
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Notes (vwNotes.hs_object_id)
        * * Description: HubSpot Note hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotCompanyNoteEntityType = z.infer<typeof HubSpotCompanyNoteSchema>;

/**
 * zod schema definition for the entity Company Tasks
 */
export const HubSpotCompanyTaskSchema = z.object({
    company_id: z.string().describe(`
        * * Field Name: company_id
        * * Display Name: Company
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
        * * Description: HubSpot Company hs_object_id`),
    task_id: z.string().describe(`
        * * Field Name: task_id
        * * Display Name: Task
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Tasks (vwTasks.hs_object_id)
        * * Description: HubSpot Task hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotCompanyTaskEntityType = z.infer<typeof HubSpotCompanyTaskSchema>;

/**
 * zod schema definition for the entity Company Tickets
 */
export const HubSpotCompanyTicketSchema = z.object({
    company_id: z.string().describe(`
        * * Field Name: company_id
        * * Display Name: Company
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
        * * Description: HubSpot Company hs_object_id`),
    ticket_id: z.string().describe(`
        * * Field Name: ticket_id
        * * Display Name: Ticket
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Tickets (vwTickets.hs_object_id)
        * * Description: HubSpot Ticket hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotCompanyTicketEntityType = z.infer<typeof HubSpotCompanyTicketSchema>;

/**
 * zod schema definition for the entity Connections
 */
export const YourMembershipConnectionSchema = z.object({
    ConnectionId: z.number().describe(`
        * * Field Name: ConnectionId
        * * Display Name: Connection ID
        * * SQL Data Type: int`),
    ProfileID: z.number().nullable().describe(`
        * * Field Name: ProfileID
        * * Display Name: Profile
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Member Profiles (vwMemberProfiles.ProfileID)`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.firstname)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.lastname)`),
    Organization: z.string().nullable().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(200)`),
    WorkTitle: z.string().nullable().describe(`
        * * Field Name: WorkTitle
        * * Display Name: Work Title
        * * SQL Data Type: nvarchar(200)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(200)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(200)`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.email)`),
    Status: z.string().nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipConnectionEntityType = z.infer<typeof YourMembershipConnectionSchema>;

/**
 * zod schema definition for the entity Contact Calls
 */
export const HubSpotContactCallSchema = z.object({
    contact_id: z.string().describe(`
        * * Field Name: contact_id
        * * Display Name: Contact
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
        * * Description: HubSpot Contact hs_object_id`),
    call_id: z.string().describe(`
        * * Field Name: call_id
        * * Display Name: Call
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Calls (vwCalls.hs_object_id)
        * * Description: HubSpot Call hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotContactCallEntityType = z.infer<typeof HubSpotContactCallSchema>;

/**
 * zod schema definition for the entity Contact Companies
 */
export const HubSpotContactCompanySchema = z.object({
    contact_id: z.string().describe(`
        * * Field Name: contact_id
        * * Display Name: Contact
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
        * * Description: HubSpot Contact hs_object_id`),
    company_id: z.string().describe(`
        * * Field Name: company_id
        * * Display Name: Company
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
        * * Description: HubSpot Company hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotContactCompanyEntityType = z.infer<typeof HubSpotContactCompanySchema>;

/**
 * zod schema definition for the entity Contact Deals
 */
export const HubSpotContactDealSchema = z.object({
    contact_id: z.string().describe(`
        * * Field Name: contact_id
        * * Display Name: Contact
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
        * * Description: HubSpot Contact hs_object_id`),
    deal_id: z.string().describe(`
        * * Field Name: deal_id
        * * Display Name: Deal
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
        * * Description: HubSpot Deal hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Label
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotContactDealEntityType = z.infer<typeof HubSpotContactDealSchema>;

/**
 * zod schema definition for the entity Contact Emails
 */
export const HubSpotContactEmailSchema = z.object({
    contact_id: z.string().describe(`
        * * Field Name: contact_id
        * * Display Name: Contact
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
        * * Description: HubSpot Contact hs_object_id`),
    email_id: z.string().describe(`
        * * Field Name: email_id
        * * Display Name: Email
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Emails (vwEmails.hs_object_id)
        * * Description: HubSpot Email hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotContactEmailEntityType = z.infer<typeof HubSpotContactEmailSchema>;

/**
 * zod schema definition for the entity Contact Feedback Submissions
 */
export const HubSpotContactFeedbackSubmissionSchema = z.object({
    contact_id: z.string().describe(`
        * * Field Name: contact_id
        * * Display Name: Contact
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
        * * Description: HubSpot Contact hs_object_id`),
    feedback_submission_id: z.string().describe(`
        * * Field Name: feedback_submission_id
        * * Display Name: Feedback Submission
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Feedback Submissions (vwFeedbackSubmissions.hs_object_id)
        * * Description: HubSpot FeedbackSubmission hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotContactFeedbackSubmissionEntityType = z.infer<typeof HubSpotContactFeedbackSubmissionSchema>;

/**
 * zod schema definition for the entity Contact Meetings
 */
export const HubSpotContactMeetingSchema = z.object({
    contact_id: z.string().describe(`
        * * Field Name: contact_id
        * * Display Name: Contact
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
        * * Description: HubSpot Contact hs_object_id`),
    meeting_id: z.string().describe(`
        * * Field Name: meeting_id
        * * Display Name: Meeting
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Meetings (vwMeetings.hs_object_id)
        * * Description: HubSpot Meeting hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Label
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotContactMeetingEntityType = z.infer<typeof HubSpotContactMeetingSchema>;

/**
 * zod schema definition for the entity Contact Notes
 */
export const HubSpotContactNoteSchema = z.object({
    contact_id: z.string().describe(`
        * * Field Name: contact_id
        * * Display Name: Contact
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
        * * Description: HubSpot Contact hs_object_id`),
    note_id: z.string().describe(`
        * * Field Name: note_id
        * * Display Name: Note
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Notes (vwNotes.hs_object_id)
        * * Description: HubSpot Note hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotContactNoteEntityType = z.infer<typeof HubSpotContactNoteSchema>;

/**
 * zod schema definition for the entity Contact Tasks
 */
export const HubSpotContactTaskSchema = z.object({
    contact_id: z.string().describe(`
        * * Field Name: contact_id
        * * Display Name: Contact
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
        * * Description: HubSpot Contact hs_object_id`),
    task_id: z.string().describe(`
        * * Field Name: task_id
        * * Display Name: Task
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Tasks (vwTasks.hs_object_id)
        * * Description: HubSpot Task hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotContactTaskEntityType = z.infer<typeof HubSpotContactTaskSchema>;

/**
 * zod schema definition for the entity Contact Tickets
 */
export const HubSpotContactTicketSchema = z.object({
    contact_id: z.string().describe(`
        * * Field Name: contact_id
        * * Display Name: Contact
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
        * * Description: HubSpot Contact hs_object_id`),
    ticket_id: z.string().describe(`
        * * Field Name: ticket_id
        * * Display Name: Ticket
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Tickets (vwTickets.hs_object_id)
        * * Description: HubSpot Ticket hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Label
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotContactTicketEntityType = z.infer<typeof HubSpotContactTicketSchema>;

/**
 * zod schema definition for the entity Contacts
 */
export const HubSpotContactSchema = z.object({
    hs_object_id: z.string().describe(`
        * * Field Name: hs_object_id
        * * Display Name: Contact ID
        * * SQL Data Type: nvarchar(100)`),
    email: z.string().nullable().describe(`
        * * Field Name: email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.EmailAddr)`),
    firstname: z.string().nullable().describe(`
        * * Field Name: firstname
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.FirstName)`),
    lastname: z.string().nullable().describe(`
        * * Field Name: lastname
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.LastName)`),
    phone: z.string().nullable().describe(`
        * * Field Name: phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.Phone)`),
    mobilephone: z.string().nullable().describe(`
        * * Field Name: mobilephone
        * * Display Name: Mobile Phone
        * * SQL Data Type: nvarchar(500)`),
    company: z.string().nullable().describe(`
        * * Field Name: company
        * * Display Name: Company Name
        * * SQL Data Type: nvarchar(500)`),
    jobtitle: z.string().nullable().describe(`
        * * Field Name: jobtitle
        * * Display Name: Job Title
        * * SQL Data Type: nvarchar(500)`),
    lifecyclestage: z.string().nullable().describe(`
        * * Field Name: lifecyclestage
        * * Display Name: Lifecycle Stage
        * * SQL Data Type: nvarchar(500)`),
    hs_lead_status: z.string().nullable().describe(`
        * * Field Name: hs_lead_status
        * * Display Name: Lead Status
        * * SQL Data Type: nvarchar(500)`),
    address: z.string().nullable().describe(`
        * * Field Name: address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(500)`),
    city: z.string().nullable().describe(`
        * * Field Name: city
        * * Display Name: City
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.City)`),
    state: z.string().nullable().describe(`
        * * Field Name: state
        * * Display Name: State / Region
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.State)`),
    zip: z.string().nullable().describe(`
        * * Field Name: zip
        * * Display Name: Postal Code
        * * SQL Data Type: nvarchar(500)`),
    country: z.string().nullable().describe(`
        * * Field Name: country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.Country)`),
    website: z.string().nullable().describe(`
        * * Field Name: website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(1000)`),
    industry: z.string().nullable().describe(`
        * * Field Name: industry
        * * Display Name: Industry
        * * SQL Data Type: nvarchar(500)`),
    annualrevenue: z.number().nullable().describe(`
        * * Field Name: annualrevenue
        * * Display Name: Annual Revenue
        * * SQL Data Type: decimal(18, 2)`),
    numberofemployees: z.number().nullable().describe(`
        * * Field Name: numberofemployees
        * * Display Name: Number of Employees
        * * SQL Data Type: int`),
    createdate: z.date().nullable().describe(`
        * * Field Name: createdate
        * * Display Name: Date Created
        * * SQL Data Type: datetimeoffset`),
    lastmodifieddate: z.date().nullable().describe(`
        * * Field Name: lastmodifieddate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    associatedcompanyid: z.string().nullable().describe(`
        * * Field Name: associatedcompanyid
        * * Display Name: Associated Company
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)`),
    notes_last_contacted: z.string().nullable().describe(`
        * * Field Name: notes_last_contacted
        * * Display Name: Last Contacted
        * * SQL Data Type: nvarchar(255)`),
    notes_last_updated: z.string().nullable().describe(`
        * * Field Name: notes_last_updated
        * * Display Name: Activity Last Updated
        * * SQL Data Type: nvarchar(255)`),
    hs_email_optout: z.boolean().nullable().describe(`
        * * Field Name: hs_email_optout
        * * Display Name: Email Opt Out
        * * SQL Data Type: bit`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotContactEntityType = z.infer<typeof HubSpotContactSchema>;

/**
 * zod schema definition for the entity Countries
 */
export const YourMembershipCountrySchema = z.object({
    countryId: z.string().describe(`
        * * Field Name: countryId
        * * Display Name: Country ID
        * * SQL Data Type: nvarchar(200)`),
    countryName: z.string().nullable().describe(`
        * * Field Name: countryName
        * * Display Name: Country Name
        * * SQL Data Type: nvarchar(200)`),
    countryCode: z.string().nullable().describe(`
        * * Field Name: countryCode
        * * Display Name: Country Code
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipCountryEntityType = z.infer<typeof YourMembershipCountrySchema>;

/**
 * zod schema definition for the entity Custom Tax Locations
 */
export const YourMembershipCustomTaxLocationSchema = z.object({
    Id: z.number().describe(`
        * * Field Name: Id
        * * Display Name: ID
        * * SQL Data Type: int`),
    CountryLabel: z.string().nullable().describe(`
        * * Field Name: CountryLabel
        * * Display Name: Country Label
        * * SQL Data Type: nvarchar(200)`),
    Location: z.string().nullable().describe(`
        * * Field Name: Location
        * * Display Name: Location
        * * SQL Data Type: nvarchar(200)`),
    TaxRate: z.number().nullable().describe(`
        * * Field Name: TaxRate
        * * Display Name: Tax Rate
        * * SQL Data Type: decimal(18, 2)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipCustomTaxLocationEntityType = z.infer<typeof YourMembershipCustomTaxLocationSchema>;

/**
 * zod schema definition for the entity Deal Calls
 */
export const HubSpotDealCallSchema = z.object({
    deal_id: z.string().describe(`
        * * Field Name: deal_id
        * * Display Name: Deal
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
        * * Description: HubSpot Deal hs_object_id`),
    call_id: z.string().describe(`
        * * Field Name: call_id
        * * Display Name: Call
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Calls (vwCalls.hs_object_id)
        * * Description: HubSpot Call hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotDealCallEntityType = z.infer<typeof HubSpotDealCallSchema>;

/**
 * zod schema definition for the entity Deal Emails
 */
export const HubSpotDealEmailSchema = z.object({
    deal_id: z.string().describe(`
        * * Field Name: deal_id
        * * Display Name: Deal
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
        * * Description: HubSpot Deal hs_object_id`),
    email_id: z.string().describe(`
        * * Field Name: email_id
        * * Display Name: Email
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Emails (vwEmails.hs_object_id)
        * * Description: HubSpot Email hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotDealEmailEntityType = z.infer<typeof HubSpotDealEmailSchema>;

/**
 * zod schema definition for the entity Deal Line Items
 */
export const HubSpotDealLineItemSchema = z.object({
    deal_id: z.string().describe(`
        * * Field Name: deal_id
        * * Display Name: Deal
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
        * * Description: HubSpot Deal hs_object_id`),
    line_item_id: z.string().describe(`
        * * Field Name: line_item_id
        * * Display Name: Line Item
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Line Items (vwLineItems.hs_object_id)
        * * Description: HubSpot LineItem hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotDealLineItemEntityType = z.infer<typeof HubSpotDealLineItemSchema>;

/**
 * zod schema definition for the entity Deal Meetings
 */
export const HubSpotDealMeetingSchema = z.object({
    deal_id: z.string().describe(`
        * * Field Name: deal_id
        * * Display Name: Deal
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
        * * Description: HubSpot Deal hs_object_id`),
    meeting_id: z.string().describe(`
        * * Field Name: meeting_id
        * * Display Name: Meeting
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Meetings (vwMeetings.hs_object_id)
        * * Description: HubSpot Meeting hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotDealMeetingEntityType = z.infer<typeof HubSpotDealMeetingSchema>;

/**
 * zod schema definition for the entity Deal Notes
 */
export const HubSpotDealNoteSchema = z.object({
    deal_id: z.string().describe(`
        * * Field Name: deal_id
        * * Display Name: Deal
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
        * * Description: HubSpot Deal hs_object_id`),
    note_id: z.string().describe(`
        * * Field Name: note_id
        * * Display Name: Note
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Notes (vwNotes.hs_object_id)
        * * Description: HubSpot Note hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotDealNoteEntityType = z.infer<typeof HubSpotDealNoteSchema>;

/**
 * zod schema definition for the entity Deal Quotes
 */
export const HubSpotDealQuoteSchema = z.object({
    deal_id: z.string().describe(`
        * * Field Name: deal_id
        * * Display Name: Deal
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
        * * Description: HubSpot Deal hs_object_id`),
    quote_id: z.string().describe(`
        * * Field Name: quote_id
        * * Display Name: Quote
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Quotes (vwQuotes.hs_object_id)
        * * Description: HubSpot Quote hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotDealQuoteEntityType = z.infer<typeof HubSpotDealQuoteSchema>;

/**
 * zod schema definition for the entity Deal Tasks
 */
export const HubSpotDealTaskSchema = z.object({
    deal_id: z.string().describe(`
        * * Field Name: deal_id
        * * Display Name: Deal
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
        * * Description: HubSpot Deal hs_object_id`),
    task_id: z.string().describe(`
        * * Field Name: task_id
        * * Display Name: Task
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Tasks (vwTasks.hs_object_id)
        * * Description: HubSpot Task hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotDealTaskEntityType = z.infer<typeof HubSpotDealTaskSchema>;

/**
 * zod schema definition for the entity Deals
 */
export const HubSpotDealSchema = z.object({
    hs_object_id: z.string().describe(`
        * * Field Name: hs_object_id
        * * Display Name: Deal ID
        * * SQL Data Type: nvarchar(100)`),
    dealname: z.string().nullable().describe(`
        * * Field Name: dealname
        * * Display Name: Deal Name
        * * SQL Data Type: nvarchar(500)`),
    amount: z.number().nullable().describe(`
        * * Field Name: amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(18, 2)`),
    dealstage: z.string().nullable().describe(`
        * * Field Name: dealstage
        * * Display Name: Deal Stage
        * * SQL Data Type: nvarchar(500)`),
    pipeline: z.string().nullable().describe(`
        * * Field Name: pipeline
        * * Display Name: Pipeline
        * * SQL Data Type: nvarchar(500)`),
    closedate: z.date().nullable().describe(`
        * * Field Name: closedate
        * * Display Name: Close Date
        * * SQL Data Type: datetimeoffset`),
    createdate: z.date().nullable().describe(`
        * * Field Name: createdate
        * * Display Name: Created Date
        * * SQL Data Type: datetimeoffset`),
    hs_lastmodifieddate: z.date().nullable().describe(`
        * * Field Name: hs_lastmodifieddate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    dealtype: z.string().nullable().describe(`
        * * Field Name: dealtype
        * * Display Name: Deal Type
        * * SQL Data Type: nvarchar(500)`),
    description: z.string().nullable().describe(`
        * * Field Name: description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    hs_deal_stage_probability: z.number().nullable().describe(`
        * * Field Name: hs_deal_stage_probability
        * * Display Name: Stage Probability
        * * SQL Data Type: decimal(18, 2)`),
    hs_projected_amount: z.number().nullable().describe(`
        * * Field Name: hs_projected_amount
        * * Display Name: Projected Amount
        * * SQL Data Type: decimal(18, 2)`),
    hs_priority: z.string().nullable().describe(`
        * * Field Name: hs_priority
        * * Display Name: Priority
        * * SQL Data Type: nvarchar(500)`),
    hubspot_owner_id: z.string().nullable().describe(`
        * * Field Name: hubspot_owner_id
        * * Display Name: Owner
        * * SQL Data Type: nvarchar(100)`),
    notes_last_contacted: z.string().nullable().describe(`
        * * Field Name: notes_last_contacted
        * * Display Name: Last Contacted
        * * SQL Data Type: nvarchar(255)`),
    num_associated_contacts: z.number().nullable().describe(`
        * * Field Name: num_associated_contacts
        * * Display Name: Associated Contacts
        * * SQL Data Type: int`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotDealEntityType = z.infer<typeof HubSpotDealSchema>;

/**
 * zod schema definition for the entity Donation Funds
 */
export const YourMembershipDonationFundSchema = z.object({
    fundId: z.number().describe(`
        * * Field Name: fundId
        * * Display Name: Fund ID
        * * SQL Data Type: int`),
    fundName: z.string().nullable().describe(`
        * * Field Name: fundName
        * * Display Name: Fund Name
        * * SQL Data Type: nvarchar(200)`),
    fundOptionsCount: z.number().nullable().describe(`
        * * Field Name: fundOptionsCount
        * * Display Name: Options Count
        * * SQL Data Type: int`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipDonationFundEntityType = z.infer<typeof YourMembershipDonationFundSchema>;

/**
 * zod schema definition for the entity Donation Histories
 */
export const YourMembershipDonationHistorySchema = z.object({
    intDonationId: z.number().describe(`
        * * Field Name: intDonationId
        * * Display Name: Donation ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Donation Transactions (vwDonationTransactions.TransactionID)`),
    ProfileID: z.number().nullable().describe(`
        * * Field Name: ProfileID
        * * Display Name: Profile
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Member Profiles (vwMemberProfiles.ProfileID)`),
    DatDonation: z.date().nullable().describe(`
        * * Field Name: DatDonation
        * * Display Name: Donation Date
        * * SQL Data Type: datetimeoffset`),
    dblDonation: z.number().nullable().describe(`
        * * Field Name: dblDonation
        * * Display Name: Donation Amount
        * * SQL Data Type: decimal(18, 2)`),
    strStatus: z.string().nullable().describe(`
        * * Field Name: strStatus
        * * Display Name: Status
        * * SQL Data Type: nvarchar(200)`),
    strFundName: z.string().nullable().describe(`
        * * Field Name: strFundName
        * * Display Name: Fund Name
        * * SQL Data Type: nvarchar(200)`),
    strDonorName: z.string().nullable().describe(`
        * * Field Name: strDonorName
        * * Display Name: Donor Name
        * * SQL Data Type: nvarchar(200)`),
    strPaymentMethod: z.string().nullable().describe(`
        * * Field Name: strPaymentMethod
        * * Display Name: Payment Method
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipDonationHistoryEntityType = z.infer<typeof YourMembershipDonationHistorySchema>;

/**
 * zod schema definition for the entity Donation Transactions
 */
export const YourMembershipDonationTransactionSchema = z.object({
    TransactionID: z.number().describe(`
        * * Field Name: TransactionID
        * * Display Name: Transaction ID
        * * SQL Data Type: int`),
    WebsiteMemberID: z.number().nullable().describe(`
        * * Field Name: WebsiteMemberID
        * * Display Name: Website Member
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)`),
    ConstituentID: z.string().nullable().describe(`
        * * Field Name: ConstituentID
        * * Display Name: Constituent
        * * SQL Data Type: nvarchar(200)`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.firstname)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.lastname)`),
    Amount: z.number().nullable().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(18, 2)`),
    FundName: z.string().nullable().describe(`
        * * Field Name: FundName
        * * Display Name: Fund Name
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Donation Funds (vwDonationFunds.fundName)`),
    DateSubmitted: z.date().nullable().describe(`
        * * Field Name: DateSubmitted
        * * Display Name: Date Submitted
        * * SQL Data Type: datetimeoffset`),
    Status: z.string().nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(200)`),
    PaymentType: z.string().nullable().describe(`
        * * Field Name: PaymentType
        * * Display Name: Payment Type
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipDonationTransactionEntityType = z.infer<typeof YourMembershipDonationTransactionSchema>;

/**
 * zod schema definition for the entity Dues Rules
 */
export const YourMembershipDuesRuleSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    Amount: z.number().nullable().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(18, 2)`),
    Selected: z.boolean().nullable().describe(`
        * * Field Name: Selected
        * * Display Name: Selected
        * * SQL Data Type: bit`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipDuesRuleEntityType = z.infer<typeof YourMembershipDuesRuleSchema>;

/**
 * zod schema definition for the entity Dues Transactions
 */
export const YourMembershipDuesTransactionSchema = z.object({
    TransactionID: z.number().describe(`
        * * Field Name: TransactionID
        * * Display Name: Transaction ID
        * * SQL Data Type: int`),
    InvoiceNumber: z.number().nullable().describe(`
        * * Field Name: InvoiceNumber
        * * Display Name: Invoice Number
        * * SQL Data Type: int`),
    Status: z.string().nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(200)`),
    WebsiteMemberID: z.number().nullable().describe(`
        * * Field Name: WebsiteMemberID
        * * Display Name: Website Member ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)`),
    ConstituentID: z.string().nullable().describe(`
        * * Field Name: ConstituentID
        * * Display Name: Constituent ID
        * * SQL Data Type: nvarchar(200)`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.firstname)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.lastname)`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.email)`),
    Organization: z.string().nullable().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(200)`),
    Amount: z.number().nullable().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(18, 2)`),
    BalanceDue: z.number().nullable().describe(`
        * * Field Name: BalanceDue
        * * Display Name: Balance Due
        * * SQL Data Type: decimal(18, 2)`),
    PaymentType: z.string().nullable().describe(`
        * * Field Name: PaymentType
        * * Display Name: Payment Type
        * * SQL Data Type: nvarchar(200)`),
    DateSubmitted: z.date().nullable().describe(`
        * * Field Name: DateSubmitted
        * * Display Name: Date Submitted
        * * SQL Data Type: datetimeoffset`),
    DateProcessed: z.date().nullable().describe(`
        * * Field Name: DateProcessed
        * * Display Name: Date Processed
        * * SQL Data Type: datetimeoffset`),
    MembershipRequested: z.string().nullable().describe(`
        * * Field Name: MembershipRequested
        * * Display Name: Membership Requested
        * * SQL Data Type: nvarchar(200)`),
    CurrentMembership: z.string().nullable().describe(`
        * * Field Name: CurrentMembership
        * * Display Name: Current Membership
        * * SQL Data Type: nvarchar(200)`),
    CurrentMembershipExpDate: z.date().nullable().describe(`
        * * Field Name: CurrentMembershipExpDate
        * * Display Name: Current Membership Expiration Date
        * * SQL Data Type: datetimeoffset`),
    MemberType: z.string().nullable().describe(`
        * * Field Name: MemberType
        * * Display Name: Member Type
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Member Types (vwMemberTypes.TypeCode)`),
    DateMemberSignup: z.date().nullable().describe(`
        * * Field Name: DateMemberSignup
        * * Display Name: Date Member Signup
        * * SQL Data Type: datetimeoffset`),
    InvoiceDate: z.date().nullable().describe(`
        * * Field Name: InvoiceDate
        * * Display Name: Invoice Date
        * * SQL Data Type: datetimeoffset`),
    ClosedBy: z.string().nullable().describe(`
        * * Field Name: ClosedBy
        * * Display Name: Closed By
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipDuesTransactionEntityType = z.infer<typeof YourMembershipDuesTransactionSchema>;

/**
 * zod schema definition for the entity Email Suppression Lists
 */
export const YourMembershipEmailSuppressionListSchema = z.object({
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.email)`),
    SuppressionType: z.string().nullable().describe(`
        * * Field Name: SuppressionType
        * * Display Name: Suppression Type
        * * SQL Data Type: nvarchar(200)`),
    BounceCount: z.number().nullable().describe(`
        * * Field Name: BounceCount
        * * Display Name: Bounce Count
        * * SQL Data Type: int`),
    HealthRate: z.number().nullable().describe(`
        * * Field Name: HealthRate
        * * Display Name: Health Rate
        * * SQL Data Type: decimal(18, 2)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipEmailSuppressionListEntityType = z.infer<typeof YourMembershipEmailSuppressionListSchema>;

/**
 * zod schema definition for the entity Emails
 */
export const HubSpotEmailSchema = z.object({
    hs_object_id: z.string().describe(`
        * * Field Name: hs_object_id
        * * Display Name: Email ID
        * * SQL Data Type: nvarchar(100)`),
    hs_email_subject: z.string().nullable().describe(`
        * * Field Name: hs_email_subject
        * * Display Name: Subject
        * * SQL Data Type: nvarchar(500)`),
    hs_email_text: z.string().nullable().describe(`
        * * Field Name: hs_email_text
        * * Display Name: Email Text
        * * SQL Data Type: nvarchar(MAX)`),
    hs_email_html: z.string().nullable().describe(`
        * * Field Name: hs_email_html
        * * Display Name: Email HTML
        * * SQL Data Type: nvarchar(255)`),
    hs_email_status: z.string().nullable().describe(`
        * * Field Name: hs_email_status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(500)`),
    hs_email_direction: z.string().nullable().describe(`
        * * Field Name: hs_email_direction
        * * Display Name: Direction
        * * SQL Data Type: nvarchar(500)`),
    hs_email_sender_email: z.string().nullable().describe(`
        * * Field Name: hs_email_sender_email
        * * Display Name: Sender Email
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.EmailAddr)`),
    hs_email_sender_firstname: z.string().nullable().describe(`
        * * Field Name: hs_email_sender_firstname
        * * Display Name: Sender First Name
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.FirstName)`),
    hs_email_sender_lastname: z.string().nullable().describe(`
        * * Field Name: hs_email_sender_lastname
        * * Display Name: Sender Last Name
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.LastName)`),
    hs_email_to_email: z.string().nullable().describe(`
        * * Field Name: hs_email_to_email
        * * Display Name: Recipient Email
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.EmailAddr)`),
    hubspot_owner_id: z.string().nullable().describe(`
        * * Field Name: hubspot_owner_id
        * * Display Name: HubSpot Owner
        * * SQL Data Type: nvarchar(100)`),
    hs_timestamp: z.date().nullable().describe(`
        * * Field Name: hs_timestamp
        * * Display Name: Email Timestamp
        * * SQL Data Type: datetimeoffset`),
    createdate: z.date().nullable().describe(`
        * * Field Name: createdate
        * * Display Name: HubSpot Created Date
        * * SQL Data Type: datetimeoffset`),
    hs_lastmodifieddate: z.date().nullable().describe(`
        * * Field Name: hs_lastmodifieddate
        * * Display Name: HubSpot Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotEmailEntityType = z.infer<typeof HubSpotEmailSchema>;

/**
 * zod schema definition for the entity Engagement Scores
 */
export const YourMembershipEngagementScoreSchema = z.object({
    ProfileID: z.number().describe(`
        * * Field Name: ProfileID
        * * Display Name: Profile
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Member Profiles (vwMemberProfiles.ProfileID)`),
    EngagementScore: z.number().nullable().describe(`
        * * Field Name: EngagementScore
        * * Display Name: Engagement Score
        * * SQL Data Type: decimal(18, 2)`),
    LastUpdated: z.date().nullable().describe(`
        * * Field Name: LastUpdated
        * * Display Name: Last Updated
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipEngagementScoreEntityType = z.infer<typeof YourMembershipEngagementScoreSchema>;

/**
 * zod schema definition for the entity Event Attendee Types
 */
export const YourMembershipEventAttendeeTypeSchema = z.object({
    Id: z.number().describe(`
        * * Field Name: Id
        * * Display Name: ID
        * * SQL Data Type: int`),
    EventId: z.number().nullable().describe(`
        * * Field Name: EventId
        * * Display Name: Event
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Events (vwEvents.EventId)`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    Active: z.boolean().nullable().describe(`
        * * Field Name: Active
        * * Display Name: Active
        * * SQL Data Type: bit`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipEventAttendeeTypeEntityType = z.infer<typeof YourMembershipEventAttendeeTypeSchema>;

/**
 * zod schema definition for the entity Event Categories
 */
export const YourMembershipEventCategorySchema = z.object({
    Id: z.number().describe(`
        * * Field Name: Id
        * * Display Name: ID
        * * SQL Data Type: int`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipEventCategoryEntityType = z.infer<typeof YourMembershipEventCategorySchema>;

/**
 * zod schema definition for the entity Event CEU Awards
 */
export const YourMembershipEventCEUAwardSchema = z.object({
    AwardID: z.number().describe(`
        * * Field Name: AwardID
        * * Display Name: Award ID
        * * SQL Data Type: int`),
    EventId: z.number().nullable().describe(`
        * * Field Name: EventId
        * * Display Name: Event
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Events (vwEvents.EventId)`),
    CertificationID: z.string().nullable().describe(`
        * * Field Name: CertificationID
        * * Display Name: Certification
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Certifications (vwCertifications.CertificationID)`),
    CreditTypeID: z.number().nullable().describe(`
        * * Field Name: CreditTypeID
        * * Display Name: Credit Type
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Certification Credit Types (vwCertificationCreditTypes.ID)`),
    Credits: z.number().nullable().describe(`
        * * Field Name: Credits
        * * Display Name: Credits
        * * SQL Data Type: decimal(18, 2)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipEventCEUAwardEntityType = z.infer<typeof YourMembershipEventCEUAwardSchema>;

/**
 * zod schema definition for the entity Event IDs
 */
export const YourMembershipEventIDSchema = z.object({
    EventId: z.number().describe(`
        * * Field Name: EventId
        * * Display Name: Event ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Events (vwEvents.EventId)`),
    LastModifiedDate: z.date().nullable().describe(`
        * * Field Name: LastModifiedDate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipEventIDEntityType = z.infer<typeof YourMembershipEventIDSchema>;

/**
 * zod schema definition for the entity Event Registration Forms
 */
export const YourMembershipEventRegistrationFormSchema = z.object({
    FormId: z.number().describe(`
        * * Field Name: FormId
        * * Display Name: Form ID
        * * SQL Data Type: int`),
    FormName: z.string().nullable().describe(`
        * * Field Name: FormName
        * * Display Name: Form Name
        * * SQL Data Type: nvarchar(200)`),
    AutoApprove: z.boolean().nullable().describe(`
        * * Field Name: AutoApprove
        * * Display Name: Auto Approve
        * * SQL Data Type: bit`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipEventRegistrationFormEntityType = z.infer<typeof YourMembershipEventRegistrationFormSchema>;

/**
 * zod schema definition for the entity Event Registrations
 */
export const YourMembershipEventRegistrationSchema = z.object({
    Id: z.number().describe(`
        * * Field Name: Id
        * * Display Name: ID
        * * SQL Data Type: int`),
    EventId: z.number().nullable().describe(`
        * * Field Name: EventId
        * * Display Name: Event
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Events (vwEvents.EventId)`),
    RegistrationID: z.string().nullable().describe(`
        * * Field Name: RegistrationID
        * * Display Name: Registration ID
        * * SQL Data Type: nvarchar(200)`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.firstname)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.lastname)`),
    DisplayName: z.string().nullable().describe(`
        * * Field Name: DisplayName
        * * Display Name: Display Name
        * * SQL Data Type: nvarchar(200)`),
    HeadShotImage: z.string().nullable().describe(`
        * * Field Name: HeadShotImage
        * * Display Name: Headshot Image
        * * SQL Data Type: nvarchar(500)`),
    DateRegistered: z.date().nullable().describe(`
        * * Field Name: DateRegistered
        * * Display Name: Date Registered
        * * SQL Data Type: datetimeoffset`),
    IsPrimary: z.boolean().nullable().describe(`
        * * Field Name: IsPrimary
        * * Display Name: Is Primary
        * * SQL Data Type: bit`),
    BadgeNumber: z.number().nullable().describe(`
        * * Field Name: BadgeNumber
        * * Display Name: Badge Number
        * * SQL Data Type: int`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipEventRegistrationEntityType = z.infer<typeof YourMembershipEventRegistrationSchema>;

/**
 * zod schema definition for the entity Event Session Groups
 */
export const YourMembershipEventSessionGroupSchema = z.object({
    SessionGroupId: z.number().describe(`
        * * Field Name: SessionGroupId
        * * Display Name: Session Group ID
        * * SQL Data Type: int`),
    EventId: z.number().nullable().describe(`
        * * Field Name: EventId
        * * Display Name: Event
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Events (vwEvents.EventId)`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipEventSessionGroupEntityType = z.infer<typeof YourMembershipEventSessionGroupSchema>;

/**
 * zod schema definition for the entity Event Sessions
 */
export const YourMembershipEventSessionSchema = z.object({
    SessionId: z.number().describe(`
        * * Field Name: SessionId
        * * Display Name: Session ID
        * * SQL Data Type: int`),
    EventId: z.number().nullable().describe(`
        * * Field Name: EventId
        * * Display Name: Event
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Events (vwEvents.EventId)`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Session Name
        * * SQL Data Type: nvarchar(200)`),
    Presenter: z.string().nullable().describe(`
        * * Field Name: Presenter
        * * Display Name: Presenter
        * * SQL Data Type: nvarchar(200)`),
    StartDate: z.date().nullable().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: datetimeoffset`),
    StartTime: z.string().nullable().describe(`
        * * Field Name: StartTime
        * * Display Name: Start Time
        * * SQL Data Type: nvarchar(200)`),
    EndDate: z.date().nullable().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: datetimeoffset`),
    EndTime: z.string().nullable().describe(`
        * * Field Name: EndTime
        * * Display Name: End Time
        * * SQL Data Type: nvarchar(200)`),
    MaxRegistrants: z.number().nullable().describe(`
        * * Field Name: MaxRegistrants
        * * Display Name: Max Registrants
        * * SQL Data Type: int`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    AllowCEUs: z.boolean().nullable().describe(`
        * * Field Name: AllowCEUs
        * * Display Name: Allow CEUs
        * * SQL Data Type: bit`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipEventSessionEntityType = z.infer<typeof YourMembershipEventSessionSchema>;

/**
 * zod schema definition for the entity Event Tickets
 */
export const YourMembershipEventTicketSchema = z.object({
    TicketId: z.number().describe(`
        * * Field Name: TicketId
        * * Display Name: Ticket ID
        * * SQL Data Type: int`),
    EventId: z.number().nullable().describe(`
        * * Field Name: EventId
        * * Display Name: Event
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Events (vwEvents.EventId)`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Quantity: z.number().nullable().describe(`
        * * Field Name: Quantity
        * * Display Name: Quantity
        * * SQL Data Type: int`),
    UnitPrice: z.number().nullable().describe(`
        * * Field Name: UnitPrice
        * * Display Name: Unit Price
        * * SQL Data Type: decimal(18, 2)`),
    Type: z.string().nullable().describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    Category: z.string().nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Event Categories (vwEventCategories.Id)`),
    Active: z.boolean().nullable().describe(`
        * * Field Name: Active
        * * Display Name: Active
        * * SQL Data Type: bit`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipEventTicketEntityType = z.infer<typeof YourMembershipEventTicketSchema>;

/**
 * zod schema definition for the entity Events
 */
export const YourMembershipEventSchema = z.object({
    EventId: z.number().describe(`
        * * Field Name: EventId
        * * Display Name: Event ID
        * * SQL Data Type: int`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Active: z.boolean().nullable().describe(`
        * * Field Name: Active
        * * Display Name: Active
        * * SQL Data Type: bit`),
    StartDate: z.date().nullable().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: datetimeoffset`),
    EndDate: z.date().nullable().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: datetimeoffset`),
    StartTime: z.string().nullable().describe(`
        * * Field Name: StartTime
        * * Display Name: Start Time
        * * SQL Data Type: nvarchar(200)`),
    EndTime: z.string().nullable().describe(`
        * * Field Name: EndTime
        * * Display Name: End Time
        * * SQL Data Type: nvarchar(200)`),
    IsVirtual: z.boolean().nullable().describe(`
        * * Field Name: IsVirtual
        * * Display Name: Is Virtual
        * * SQL Data Type: bit`),
    VirtualMeetingType: z.string().nullable().describe(`
        * * Field Name: VirtualMeetingType
        * * Display Name: Virtual Meeting Type
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipEventEntityType = z.infer<typeof YourMembershipEventSchema>;

/**
 * zod schema definition for the entity Feedback Submissions
 */
export const HubSpotFeedbackSubmissionSchema = z.object({
    hs_object_id: z.string().describe(`
        * * Field Name: hs_object_id
        * * Display Name: Object ID
        * * SQL Data Type: nvarchar(100)`),
    hs_survey_id: z.string().nullable().describe(`
        * * Field Name: hs_survey_id
        * * Display Name: Survey ID
        * * SQL Data Type: nvarchar(100)`),
    hs_survey_name: z.string().nullable().describe(`
        * * Field Name: hs_survey_name
        * * Display Name: Survey Name
        * * SQL Data Type: nvarchar(500)`),
    hs_survey_type: z.string().nullable().describe(`
        * * Field Name: hs_survey_type
        * * Display Name: Survey Type
        * * SQL Data Type: nvarchar(500)`),
    hs_submission_name: z.string().nullable().describe(`
        * * Field Name: hs_submission_name
        * * Display Name: Submission Name
        * * SQL Data Type: nvarchar(500)`),
    hs_content: z.string().nullable().describe(`
        * * Field Name: hs_content
        * * Display Name: Feedback Content
        * * SQL Data Type: nvarchar(MAX)`),
    hs_response_group: z.string().nullable().describe(`
        * * Field Name: hs_response_group
        * * Display Name: Response Group
        * * SQL Data Type: nvarchar(500)`),
    hs_sentiment: z.string().nullable().describe(`
        * * Field Name: hs_sentiment
        * * Display Name: Sentiment
        * * SQL Data Type: nvarchar(500)`),
    hs_survey_channel: z.string().nullable().describe(`
        * * Field Name: hs_survey_channel
        * * Display Name: Survey Channel
        * * SQL Data Type: nvarchar(500)`),
    hs_timestamp: z.date().nullable().describe(`
        * * Field Name: hs_timestamp
        * * Display Name: Submitted At
        * * SQL Data Type: datetimeoffset`),
    createdate: z.date().nullable().describe(`
        * * Field Name: createdate
        * * Display Name: HubSpot Created Date
        * * SQL Data Type: datetimeoffset`),
    hs_lastmodifieddate: z.date().nullable().describe(`
        * * Field Name: hs_lastmodifieddate
        * * Display Name: HubSpot Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotFeedbackSubmissionEntityType = z.infer<typeof HubSpotFeedbackSubmissionSchema>;

/**
 * zod schema definition for the entity Finance Batch Details
 */
export const YourMembershipFinanceBatchDetailSchema = z.object({
    DetailID: z.number().describe(`
        * * Field Name: DetailID
        * * Display Name: Detail ID
        * * SQL Data Type: int`),
    BatchID: z.number().nullable().describe(`
        * * Field Name: BatchID
        * * Display Name: Batch ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Finance Batches (vwFinanceBatches.BatchID)`),
    InvoiceNumber: z.number().nullable().describe(`
        * * Field Name: InvoiceNumber
        * * Display Name: Invoice Number
        * * SQL Data Type: int`),
    Amount: z.number().nullable().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(18, 2)`),
    PaymentType: z.string().nullable().describe(`
        * * Field Name: PaymentType
        * * Display Name: Payment Type
        * * SQL Data Type: nvarchar(200)`),
    TransactionDate: z.date().nullable().describe(`
        * * Field Name: TransactionDate
        * * Display Name: Transaction Date
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipFinanceBatchDetailEntityType = z.infer<typeof YourMembershipFinanceBatchDetailSchema>;

/**
 * zod schema definition for the entity Finance Batches
 */
export const YourMembershipFinanceBatchSchema = z.object({
    BatchID: z.number().describe(`
        * * Field Name: BatchID
        * * Display Name: Batch ID
        * * SQL Data Type: int`),
    CommerceType: z.string().nullable().describe(`
        * * Field Name: CommerceType
        * * Display Name: Commerce Type
        * * SQL Data Type: nvarchar(200)`),
    ItemCount: z.number().nullable().describe(`
        * * Field Name: ItemCount
        * * Display Name: Item Count
        * * SQL Data Type: int`),
    ClosedDate: z.date().nullable().describe(`
        * * Field Name: ClosedDate
        * * Display Name: Closed Date
        * * SQL Data Type: datetimeoffset`),
    CreateDateTime: z.date().nullable().describe(`
        * * Field Name: CreateDateTime
        * * Display Name: Created Date
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipFinanceBatchEntityType = z.infer<typeof YourMembershipFinanceBatchSchema>;

/**
 * zod schema definition for the entity GL Codes
 */
export const YourMembershipGLCodeSchema = z.object({
    GLCodeId: z.number().describe(`
        * * Field Name: GLCodeId
        * * Display Name: ID
        * * SQL Data Type: int`),
    GLCodeName: z.string().nullable().describe(`
        * * Field Name: GLCodeName
        * * Display Name: GL Code Name
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipGLCodeEntityType = z.infer<typeof YourMembershipGLCodeSchema>;

/**
 * zod schema definition for the entity Group Membership Logs
 */
export const YourMembershipGroupMembershipLogSchema = z.object({
    ItemID: z.number().describe(`
        * * Field Name: ItemID
        * * Display Name: Item ID
        * * SQL Data Type: int`),
    ID: z.string().nullable().describe(`
        * * Field Name: ID
        * * Display Name: Log ID
        * * SQL Data Type: nvarchar(200)`),
    ProfileID: z.number().nullable().describe(`
        * * Field Name: ProfileID
        * * Display Name: Profile ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Member Profiles (vwMemberProfiles.ProfileID)`),
    NamePrefix: z.string().nullable().describe(`
        * * Field Name: NamePrefix
        * * Display Name: Prefix
        * * SQL Data Type: nvarchar(200)`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.firstname)`),
    MiddleName: z.string().nullable().describe(`
        * * Field Name: MiddleName
        * * Display Name: Middle Name
        * * SQL Data Type: nvarchar(200)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.lastname)`),
    Suffix: z.string().nullable().describe(`
        * * Field Name: Suffix
        * * Display Name: Suffix
        * * SQL Data Type: nvarchar(200)`),
    Nickname: z.string().nullable().describe(`
        * * Field Name: Nickname
        * * Display Name: Nickname
        * * SQL Data Type: nvarchar(200)`),
    EmployerName: z.string().nullable().describe(`
        * * Field Name: EmployerName
        * * Display Name: Employer Name
        * * SQL Data Type: nvarchar(200)`),
    WorkTitle: z.string().nullable().describe(`
        * * Field Name: WorkTitle
        * * Display Name: Work Title
        * * SQL Data Type: nvarchar(200)`),
    Date: z.date().nullable().describe(`
        * * Field Name: Date
        * * Display Name: Log Date
        * * SQL Data Type: datetimeoffset`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipGroupMembershipLogEntityType = z.infer<typeof YourMembershipGroupMembershipLogSchema>;

/**
 * zod schema definition for the entity Group Types
 */
export const YourMembershipGroupTypeSchema = z.object({
    Id: z.number().describe(`
        * * Field Name: Id
        * * Display Name: ID
        * * SQL Data Type: int`),
    TypeName: z.string().nullable().describe(`
        * * Field Name: TypeName
        * * Display Name: Type Name
        * * SQL Data Type: nvarchar(200)`),
    SortIndex: z.number().nullable().describe(`
        * * Field Name: SortIndex
        * * Display Name: Sort Index
        * * SQL Data Type: int`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipGroupTypeEntityType = z.infer<typeof YourMembershipGroupTypeSchema>;

/**
 * zod schema definition for the entity Groups
 */
export const YourMembershipGroupSchema = z.object({
    Id: z.number().describe(`
        * * Field Name: Id
        * * Display Name: ID
        * * SQL Data Type: int`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    GroupTypeName: z.string().nullable().describe(`
        * * Field Name: GroupTypeName
        * * Display Name: Group Type Name
        * * SQL Data Type: nvarchar(200)`),
    GroupTypeId: z.number().nullable().describe(`
        * * Field Name: GroupTypeId
        * * Display Name: Group Type
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Group Types (vwGroupTypes.Id)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipGroupEntityType = z.infer<typeof YourMembershipGroupSchema>;

/**
 * zod schema definition for the entity Invoice Items
 */
export const YourMembershipInvoiceItemSchema = z.object({
    LineItemID: z.number().describe(`
        * * Field Name: LineItemID
        * * Display Name: Line Item ID
        * * SQL Data Type: int`),
    InvoiceNo: z.number().nullable().describe(`
        * * Field Name: InvoiceNo
        * * Display Name: Invoice Number
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Store Orders (vwStoreOrders.OrderID)`),
    InvoiceType: z.string().nullable().describe(`
        * * Field Name: InvoiceType
        * * Display Name: Invoice Type
        * * SQL Data Type: nvarchar(200)`),
    WebSiteMemberID: z.number().nullable().describe(`
        * * Field Name: WebSiteMemberID
        * * Display Name: Website Member ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)`),
    ConstituentID: z.string().nullable().describe(`
        * * Field Name: ConstituentID
        * * Display Name: Constituent ID
        * * SQL Data Type: nvarchar(200)`),
    InvoiceNameFirst: z.string().nullable().describe(`
        * * Field Name: InvoiceNameFirst
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(200)`),
    InvoiceNameLast: z.string().nullable().describe(`
        * * Field Name: InvoiceNameLast
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(200)`),
    Organization: z.string().nullable().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(200)`),
    EmailAddress: z.string().nullable().describe(`
        * * Field Name: EmailAddress
        * * Display Name: Email Address
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.email)`),
    LineItemType: z.string().nullable().describe(`
        * * Field Name: LineItemType
        * * Display Name: Line Item Type
        * * SQL Data Type: nvarchar(200)`),
    LineItemDescription: z.string().nullable().describe(`
        * * Field Name: LineItemDescription
        * * Display Name: Description
        * * SQL Data Type: nvarchar(200)`),
    LineItemDate: z.date().nullable().describe(`
        * * Field Name: LineItemDate
        * * Display Name: Item Date
        * * SQL Data Type: datetimeoffset`),
    LineItemDateEntered: z.date().nullable().describe(`
        * * Field Name: LineItemDateEntered
        * * Display Name: Date Entered
        * * SQL Data Type: datetimeoffset`),
    LineItemAmount: z.number().nullable().describe(`
        * * Field Name: LineItemAmount
        * * Display Name: Unit Price
        * * SQL Data Type: decimal(18, 2)`),
    LineItemQuantity: z.number().nullable().describe(`
        * * Field Name: LineItemQuantity
        * * Display Name: Quantity
        * * SQL Data Type: int`),
    LineTotal: z.number().nullable().describe(`
        * * Field Name: LineTotal
        * * Display Name: Line Total
        * * SQL Data Type: decimal(18, 2)`),
    OutstandingBalance: z.number().nullable().describe(`
        * * Field Name: OutstandingBalance
        * * Display Name: Outstanding Balance
        * * SQL Data Type: decimal(18, 2)`),
    PaymentTerms: z.string().nullable().describe(`
        * * Field Name: PaymentTerms
        * * Display Name: Payment Terms
        * * SQL Data Type: nvarchar(200)`),
    GLCodeItemName: z.string().nullable().describe(`
        * * Field Name: GLCodeItemName
        * * Display Name: GL Code
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: GL Codes (vwGLCodes.GLCodeName)`),
    QBClassItemName: z.string().nullable().describe(`
        * * Field Name: QBClassItemName
        * * Display Name: QuickBooks Class
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: QB Classes (vwQBClasses.Id)`),
    PaymentOption: z.string().nullable().describe(`
        * * Field Name: PaymentOption
        * * Display Name: Payment Option
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipInvoiceItemEntityType = z.infer<typeof YourMembershipInvoiceItemSchema>;

/**
 * zod schema definition for the entity Line Items
 */
export const HubSpotLineItemSchema = z.object({
    hs_object_id: z.string().describe(`
        * * Field Name: hs_object_id
        * * Display Name: ID
        * * SQL Data Type: nvarchar(100)`),
    name: z.string().nullable().describe(`
        * * Field Name: name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(500)`),
    description: z.string().nullable().describe(`
        * * Field Name: description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    quantity: z.number().nullable().describe(`
        * * Field Name: quantity
        * * Display Name: Quantity
        * * SQL Data Type: decimal(18, 2)`),
    price: z.number().nullable().describe(`
        * * Field Name: price
        * * Display Name: Unit Price
        * * SQL Data Type: decimal(18, 2)`),
    amount: z.number().nullable().describe(`
        * * Field Name: amount
        * * Display Name: Total Amount
        * * SQL Data Type: decimal(18, 2)`),
    discount: z.number().nullable().describe(`
        * * Field Name: discount
        * * Display Name: Discount
        * * SQL Data Type: decimal(18, 2)`),
    tax: z.number().nullable().describe(`
        * * Field Name: tax
        * * Display Name: Tax
        * * SQL Data Type: decimal(18, 2)`),
    hs_product_id: z.string().nullable().describe(`
        * * Field Name: hs_product_id
        * * Display Name: Product
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Products__HubSpot (vwProducts__HubSpot.hs_object_id)`),
    hs_line_item_currency_code: z.string().nullable().describe(`
        * * Field Name: hs_line_item_currency_code
        * * Display Name: Currency
        * * SQL Data Type: nvarchar(500)`),
    hs_sku: z.string().nullable().describe(`
        * * Field Name: hs_sku
        * * Display Name: SKU
        * * SQL Data Type: nvarchar(500)`),
    hs_cost_of_goods_sold: z.number().nullable().describe(`
        * * Field Name: hs_cost_of_goods_sold
        * * Display Name: Cost of Goods Sold
        * * SQL Data Type: decimal(18, 2)`),
    hs_recurring_billing_period: z.string().nullable().describe(`
        * * Field Name: hs_recurring_billing_period
        * * Display Name: Recurring Billing Period
        * * SQL Data Type: nvarchar(500)`),
    createdate: z.date().nullable().describe(`
        * * Field Name: createdate
        * * Display Name: Created Date
        * * SQL Data Type: datetimeoffset`),
    hs_lastmodifieddate: z.date().nullable().describe(`
        * * Field Name: hs_lastmodifieddate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotLineItemEntityType = z.infer<typeof HubSpotLineItemSchema>;

/**
 * zod schema definition for the entity Locations
 */
export const YourMembershipLocationSchema = z.object({
    locationCode: z.string().describe(`
        * * Field Name: locationCode
        * * Display Name: Location Code
        * * SQL Data Type: nvarchar(200)`),
    countryId: z.string().nullable().describe(`
        * * Field Name: countryId
        * * Display Name: Country
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Countries (vwCountries.countryId)`),
    locationName: z.string().nullable().describe(`
        * * Field Name: locationName
        * * Display Name: Location Name
        * * SQL Data Type: nvarchar(200)`),
    taxGLCode: z.string().nullable().describe(`
        * * Field Name: taxGLCode
        * * Display Name: Tax GL Code
        * * SQL Data Type: nvarchar(200)`),
    taxQBClass: z.string().nullable().describe(`
        * * Field Name: taxQBClass
        * * Display Name: Tax QuickBooks Class
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipLocationEntityType = z.infer<typeof YourMembershipLocationSchema>;

/**
 * zod schema definition for the entity Meetings
 */
export const HubSpotMeetingSchema = z.object({
    hs_object_id: z.string().describe(`
        * * Field Name: hs_object_id
        * * Display Name: Object ID
        * * SQL Data Type: nvarchar(100)`),
    hs_meeting_title: z.string().nullable().describe(`
        * * Field Name: hs_meeting_title
        * * Display Name: Meeting Title
        * * SQL Data Type: nvarchar(500)`),
    hs_meeting_body: z.string().nullable().describe(`
        * * Field Name: hs_meeting_body
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    hs_meeting_start_time: z.date().nullable().describe(`
        * * Field Name: hs_meeting_start_time
        * * Display Name: Start Time
        * * SQL Data Type: datetimeoffset`),
    hs_meeting_end_time: z.date().nullable().describe(`
        * * Field Name: hs_meeting_end_time
        * * Display Name: End Time
        * * SQL Data Type: datetimeoffset`),
    hs_meeting_outcome: z.string().nullable().describe(`
        * * Field Name: hs_meeting_outcome
        * * Display Name: Outcome
        * * SQL Data Type: nvarchar(500)`),
    hs_meeting_location: z.string().nullable().describe(`
        * * Field Name: hs_meeting_location
        * * Display Name: Location
        * * SQL Data Type: nvarchar(500)`),
    hs_meeting_external_url: z.string().nullable().describe(`
        * * Field Name: hs_meeting_external_url
        * * Display Name: Meeting URL
        * * SQL Data Type: nvarchar(1000)`),
    hs_internal_meeting_notes: z.string().nullable().describe(`
        * * Field Name: hs_internal_meeting_notes
        * * Display Name: Internal Notes
        * * SQL Data Type: nvarchar(MAX)`),
    hs_activity_type: z.string().nullable().describe(`
        * * Field Name: hs_activity_type
        * * Display Name: Activity Type
        * * SQL Data Type: nvarchar(500)`),
    hubspot_owner_id: z.string().nullable().describe(`
        * * Field Name: hubspot_owner_id
        * * Display Name: Owner
        * * SQL Data Type: nvarchar(100)`),
    hs_timestamp: z.date().nullable().describe(`
        * * Field Name: hs_timestamp
        * * Display Name: Activity Date
        * * SQL Data Type: datetimeoffset`),
    createdate: z.date().nullable().describe(`
        * * Field Name: createdate
        * * Display Name: HubSpot Created Date
        * * SQL Data Type: datetimeoffset`),
    hs_lastmodifieddate: z.date().nullable().describe(`
        * * Field Name: hs_lastmodifieddate
        * * Display Name: HubSpot Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotMeetingEntityType = z.infer<typeof HubSpotMeetingSchema>;

/**
 * zod schema definition for the entity Member Favorites
 */
export const YourMembershipMemberFavoriteSchema = z.object({
    FavoriteId: z.number().describe(`
        * * Field Name: FavoriteId
        * * Display Name: Favorite ID
        * * SQL Data Type: int`),
    ProfileID: z.number().nullable().describe(`
        * * Field Name: ProfileID
        * * Display Name: Profile
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Member Profiles (vwMemberProfiles.ProfileID)`),
    ItemType: z.string().nullable().describe(`
        * * Field Name: ItemType
        * * Display Name: Item Type
        * * SQL Data Type: nvarchar(200)`),
    ItemId: z.string().nullable().describe(`
        * * Field Name: ItemId
        * * Display Name: Item ID
        * * SQL Data Type: nvarchar(200)`),
    DateAdded: z.date().nullable().describe(`
        * * Field Name: DateAdded
        * * Display Name: Date Added
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipMemberFavoriteEntityType = z.infer<typeof YourMembershipMemberFavoriteSchema>;

/**
 * zod schema definition for the entity Member Group Bulks
 */
export const YourMembershipMemberGroupBulkSchema = z.object({
    WebSiteMemberID: z.number().describe(`
        * * Field Name: WebSiteMemberID
        * * Display Name: Member ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)`),
    GroupID: z.number().describe(`
        * * Field Name: GroupID
        * * Display Name: Group ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Groups (vwGroups.Id)`),
    GroupCode: z.string().nullable().describe(`
        * * Field Name: GroupCode
        * * Display Name: Group Code
        * * SQL Data Type: nvarchar(200)`),
    GroupName: z.string().nullable().describe(`
        * * Field Name: GroupName
        * * Display Name: Group Name
        * * SQL Data Type: nvarchar(200)`),
    PrimaryGroup: z.boolean().nullable().describe(`
        * * Field Name: PrimaryGroup
        * * Display Name: Primary Group
        * * SQL Data Type: bit`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipMemberGroupBulkEntityType = z.infer<typeof YourMembershipMemberGroupBulkSchema>;

/**
 * zod schema definition for the entity Member Groups
 */
export const YourMembershipMemberGroupSchema = z.object({
    MemberGroupId: z.string().describe(`
        * * Field Name: MemberGroupId
        * * Display Name: Member Group
        * * SQL Data Type: nvarchar(200)`),
    ProfileID: z.number().nullable().describe(`
        * * Field Name: ProfileID
        * * Display Name: Profile
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Member Profiles (vwMemberProfiles.ProfileID)`),
    GroupId: z.number().nullable().describe(`
        * * Field Name: GroupId
        * * Display Name: Group
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Groups (vwGroups.Id)`),
    GroupName: z.string().nullable().describe(`
        * * Field Name: GroupName
        * * Display Name: Group Name
        * * SQL Data Type: nvarchar(200)`),
    GroupTypeName: z.string().nullable().describe(`
        * * Field Name: GroupTypeName
        * * Display Name: Group Type Name
        * * SQL Data Type: nvarchar(200)`),
    GroupTypeId: z.number().nullable().describe(`
        * * Field Name: GroupTypeId
        * * Display Name: Group Type
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Group Types (vwGroupTypes.Id)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipMemberGroupEntityType = z.infer<typeof YourMembershipMemberGroupSchema>;

/**
 * zod schema definition for the entity Member Networks
 */
export const YourMembershipMemberNetworkSchema = z.object({
    NetworkId: z.number().describe(`
        * * Field Name: NetworkId
        * * Display Name: Network ID
        * * SQL Data Type: int`),
    ProfileID: z.number().nullable().describe(`
        * * Field Name: ProfileID
        * * Display Name: Profile ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Member Profiles (vwMemberProfiles.ProfileID)`),
    NetworkType: z.string().nullable().describe(`
        * * Field Name: NetworkType
        * * Display Name: Network Type
        * * SQL Data Type: nvarchar(200)`),
    ProfileUrl: z.string().nullable().describe(`
        * * Field Name: ProfileUrl
        * * Display Name: Profile URL
        * * SQL Data Type: nvarchar(500)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipMemberNetworkEntityType = z.infer<typeof YourMembershipMemberNetworkSchema>;

/**
 * zod schema definition for the entity Member Profiles
 */
export const YourMembershipMemberProfileSchema = z.object({
    ProfileID: z.number().describe(`
        * * Field Name: ProfileID
        * * Display Name: Profile ID
        * * SQL Data Type: int`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.firstname)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.lastname)`),
    EmailAddress: z.string().nullable().describe(`
        * * Field Name: EmailAddress
        * * Display Name: Email Address
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Contacts (vwContacts.email)`),
    Organization: z.string().nullable().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(200)`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(200)`),
    MemberTypeCode: z.string().nullable().describe(`
        * * Field Name: MemberTypeCode
        * * Display Name: Member Type
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Member Types (vwMemberTypes.TypeCode)`),
    Status: z.string().nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(200)`),
    JoinDate: z.date().nullable().describe(`
        * * Field Name: JoinDate
        * * Display Name: Join Date
        * * SQL Data Type: datetimeoffset`),
    ExpirationDate: z.date().nullable().describe(`
        * * Field Name: ExpirationDate
        * * Display Name: Expiration Date
        * * SQL Data Type: datetimeoffset`),
    LastModifiedDate: z.date().nullable().describe(`
        * * Field Name: LastModifiedDate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipMemberProfileEntityType = z.infer<typeof YourMembershipMemberProfileSchema>;

/**
 * zod schema definition for the entity Member Referrals
 */
export const YourMembershipMemberReferralSchema = z.object({
    ReferralId: z.number().describe(`
        * * Field Name: ReferralId
        * * Display Name: Referral ID
        * * SQL Data Type: int`),
    ReferrerID: z.number().nullable().describe(`
        * * Field Name: ReferrerID
        * * Display Name: Referrer
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)`),
    ReferredID: z.number().nullable().describe(`
        * * Field Name: ReferredID
        * * Display Name: Referred Member
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)`),
    ReferralDate: z.date().nullable().describe(`
        * * Field Name: ReferralDate
        * * Display Name: Referral Date
        * * SQL Data Type: datetimeoffset`),
    Status: z.string().nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipMemberReferralEntityType = z.infer<typeof YourMembershipMemberReferralSchema>;

/**
 * zod schema definition for the entity Member Sub Accounts
 */
export const YourMembershipMemberSubAccountSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)`),
    ParentID: z.number().nullable().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent Account
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)`),
    DateRegistered: z.date().nullable().describe(`
        * * Field Name: DateRegistered
        * * Display Name: Date Registered
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipMemberSubAccountEntityType = z.infer<typeof YourMembershipMemberSubAccountSchema>;

/**
 * zod schema definition for the entity Member Types
 */
export const YourMembershipMemberTypeSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    TypeCode: z.string().nullable().describe(`
        * * Field Name: TypeCode
        * * Display Name: Type Code
        * * SQL Data Type: nvarchar(200)`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    IsDefault: z.boolean().nullable().describe(`
        * * Field Name: IsDefault
        * * Display Name: Is Default
        * * SQL Data Type: bit`),
    PresetType: z.string().nullable().describe(`
        * * Field Name: PresetType
        * * Display Name: Preset Type
        * * SQL Data Type: nvarchar(200)`),
    SortOrder: z.number().nullable().describe(`
        * * Field Name: SortOrder
        * * Display Name: Sort Order
        * * SQL Data Type: int`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipMemberTypeEntityType = z.infer<typeof YourMembershipMemberTypeSchema>;

/**
 * zod schema definition for the entity Members
 */
export const YourMembershipMemberSchema = z.object({
    ProfileID: z.number().describe(`
        * * Field Name: ProfileID
        * * Display Name: Profile ID
        * * SQL Data Type: int`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(200)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(200)`),
    EmailAddr: z.string().nullable().describe(`
        * * Field Name: EmailAddr
        * * Display Name: Email Address
        * * SQL Data Type: nvarchar(200)`),
    MemberTypeCode: z.string().nullable().describe(`
        * * Field Name: MemberTypeCode
        * * Display Name: Member Type
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Member Types (vwMemberTypes.TypeCode)`),
    Status: z.string().nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(200)`),
    Organization: z.string().nullable().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(200)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(200)`),
    Address1: z.string().nullable().describe(`
        * * Field Name: Address1
        * * Display Name: Address Line 1
        * * SQL Data Type: nvarchar(200)`),
    Address2: z.string().nullable().describe(`
        * * Field Name: Address2
        * * Display Name: Address Line 2
        * * SQL Data Type: nvarchar(200)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(200)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(200)`),
    PostalCode: z.string().nullable().describe(`
        * * Field Name: PostalCode
        * * Display Name: Postal Code
        * * SQL Data Type: nvarchar(200)`),
    Country: z.string().nullable().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Countries (vwCountries.countryId)`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(200)`),
    JoinDate: z.date().nullable().describe(`
        * * Field Name: JoinDate
        * * Display Name: Join Date
        * * SQL Data Type: datetimeoffset`),
    RenewalDate: z.date().nullable().describe(`
        * * Field Name: RenewalDate
        * * Display Name: Renewal Date
        * * SQL Data Type: datetimeoffset`),
    ExpirationDate: z.date().nullable().describe(`
        * * Field Name: ExpirationDate
        * * Display Name: Expiration Date
        * * SQL Data Type: datetimeoffset`),
    MemberSinceDate: z.date().nullable().describe(`
        * * Field Name: MemberSinceDate
        * * Display Name: Member Since Date
        * * SQL Data Type: datetimeoffset`),
    WebsiteUrl: z.string().nullable().describe(`
        * * Field Name: WebsiteUrl
        * * Display Name: Website URL
        * * SQL Data Type: nvarchar(500)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipMemberEntityType = z.infer<typeof YourMembershipMemberSchema>;

/**
 * zod schema definition for the entity Membership Modifiers
 */
export const YourMembershipMembershipModifierSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    MembershipID: z.number().nullable().describe(`
        * * Field Name: MembershipID
        * * Display Name: Membership
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Memberships (vwMemberships.Id)`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    Amount: z.number().nullable().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(18, 2)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipMembershipModifierEntityType = z.infer<typeof YourMembershipMembershipModifierSchema>;

/**
 * zod schema definition for the entity Membership Promo Codes
 */
export const YourMembershipMembershipPromoCodeSchema = z.object({
    PromoCodeId: z.number().describe(`
        * * Field Name: PromoCodeId
        * * Display Name: Promo Code ID
        * * SQL Data Type: int`),
    MembershipID: z.number().nullable().describe(`
        * * Field Name: MembershipID
        * * Display Name: Membership
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Memberships (vwMemberships.Id)`),
    FriendlyName: z.string().nullable().describe(`
        * * Field Name: FriendlyName
        * * Display Name: Friendly Name
        * * SQL Data Type: nvarchar(200)`),
    DiscountAmount: z.number().nullable().describe(`
        * * Field Name: DiscountAmount
        * * Display Name: Discount Amount
        * * SQL Data Type: decimal(18, 2)`),
    ExpirationDate: z.date().nullable().describe(`
        * * Field Name: ExpirationDate
        * * Display Name: Expiration Date
        * * SQL Data Type: datetimeoffset`),
    UsageLimit: z.number().nullable().describe(`
        * * Field Name: UsageLimit
        * * Display Name: Usage Limit
        * * SQL Data Type: int`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipMembershipPromoCodeEntityType = z.infer<typeof YourMembershipMembershipPromoCodeSchema>;

/**
 * zod schema definition for the entity Memberships
 */
export const YourMembershipMembershipSchema = z.object({
    Id: z.number().describe(`
        * * Field Name: Id
        * * Display Name: ID
        * * SQL Data Type: int`),
    Code: z.string().nullable().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(200)`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    DuesAmount: z.number().nullable().describe(`
        * * Field Name: DuesAmount
        * * Display Name: Dues Amount
        * * SQL Data Type: decimal(18, 2)`),
    ProRatedDues: z.boolean().nullable().describe(`
        * * Field Name: ProRatedDues
        * * Display Name: Prorated Dues
        * * SQL Data Type: bit`),
    AllowMultipleOpenInvoices: z.boolean().nullable().describe(`
        * * Field Name: AllowMultipleOpenInvoices
        * * Display Name: Allow Multiple Open Invoices
        * * SQL Data Type: bit`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipMembershipEntityType = z.infer<typeof YourMembershipMembershipSchema>;

/**
 * zod schema definition for the entity Notes
 */
export const HubSpotNoteSchema = z.object({
    hs_object_id: z.string().describe(`
        * * Field Name: hs_object_id
        * * Display Name: Note ID
        * * SQL Data Type: nvarchar(100)`),
    hs_note_body: z.string().nullable().describe(`
        * * Field Name: hs_note_body
        * * Display Name: Note Body
        * * SQL Data Type: nvarchar(MAX)`),
    hs_timestamp: z.date().nullable().describe(`
        * * Field Name: hs_timestamp
        * * Display Name: Activity Date
        * * SQL Data Type: datetimeoffset`),
    hubspot_owner_id: z.string().nullable().describe(`
        * * Field Name: hubspot_owner_id
        * * Display Name: Owner
        * * SQL Data Type: nvarchar(100)`),
    hs_attachment_ids: z.string().nullable().describe(`
        * * Field Name: hs_attachment_ids
        * * Display Name: Attachments
        * * SQL Data Type: nvarchar(500)`),
    hs_body_preview: z.string().nullable().describe(`
        * * Field Name: hs_body_preview
        * * Display Name: Body Preview
        * * SQL Data Type: nvarchar(MAX)`),
    hs_body_preview_is_truncated: z.boolean().nullable().describe(`
        * * Field Name: hs_body_preview_is_truncated
        * * Display Name: Is Truncated
        * * SQL Data Type: bit`),
    createdate: z.date().nullable().describe(`
        * * Field Name: createdate
        * * Display Name: Created Date
        * * SQL Data Type: datetimeoffset`),
    hs_lastmodifieddate: z.date().nullable().describe(`
        * * Field Name: hs_lastmodifieddate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotNoteEntityType = z.infer<typeof HubSpotNoteSchema>;

/**
 * zod schema definition for the entity Payment Processors
 */
export const YourMembershipPaymentProcessorSchema = z.object({
    Id: z.number().describe(`
        * * Field Name: Id
        * * Display Name: ID
        * * SQL Data Type: int`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Processor Name
        * * SQL Data Type: nvarchar(200)`),
    Active: z.boolean().nullable().describe(`
        * * Field Name: Active
        * * Display Name: Active
        * * SQL Data Type: bit`),
    Primary: z.boolean().nullable().describe(`
        * * Field Name: Primary
        * * Display Name: Primary
        * * SQL Data Type: bit`),
    CardOrderType: z.string().nullable().describe(`
        * * Field Name: CardOrderType
        * * Display Name: Card Order Type
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipPaymentProcessorEntityType = z.infer<typeof YourMembershipPaymentProcessorSchema>;

/**
 * zod schema definition for the entity Person IDs
 */
export const YourMembershipPersonIDSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    UserType: z.string().nullable().describe(`
        * * Field Name: UserType
        * * Display Name: User Type
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Member Types (vwMemberTypes.TypeCode)`),
    DateRegistered: z.date().nullable().describe(`
        * * Field Name: DateRegistered
        * * Display Name: Date Registered
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipPersonIDEntityType = z.infer<typeof YourMembershipPersonIDSchema>;

/**
 * zod schema definition for the entity Product Categories
 */
export const YourMembershipProductCategorySchema = z.object({
    Id: z.number().describe(`
        * * Field Name: Id
        * * Display Name: ID
        * * SQL Data Type: int`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipProductCategoryEntityType = z.infer<typeof YourMembershipProductCategorySchema>;

/**
 * zod schema definition for the entity Products
 */
export const YourMembershipProductSchema = z.object({
    id: z.number().describe(`
        * * Field Name: id
        * * Display Name: ID
        * * SQL Data Type: int`),
    description: z.string().nullable().describe(`
        * * Field Name: description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    amount: z.number().nullable().describe(`
        * * Field Name: amount
        * * Display Name: Price
        * * SQL Data Type: decimal(18, 2)`),
    weight: z.number().nullable().describe(`
        * * Field Name: weight
        * * Display Name: Weight
        * * SQL Data Type: decimal(18, 2)`),
    taxRate: z.number().nullable().describe(`
        * * Field Name: taxRate
        * * Display Name: Tax Rate
        * * SQL Data Type: decimal(18, 2)`),
    quantity: z.number().nullable().describe(`
        * * Field Name: quantity
        * * Display Name: Quantity
        * * SQL Data Type: int`),
    ProductActive: z.boolean().nullable().describe(`
        * * Field Name: ProductActive
        * * Display Name: Active
        * * SQL Data Type: bit`),
    IsFeatured: z.boolean().nullable().describe(`
        * * Field Name: IsFeatured
        * * Display Name: Is Featured
        * * SQL Data Type: bit`),
    ListInStore: z.boolean().nullable().describe(`
        * * Field Name: ListInStore
        * * Display Name: List In Store
        * * SQL Data Type: bit`),
    taxable: z.boolean().nullable().describe(`
        * * Field Name: taxable
        * * Display Name: Taxable
        * * SQL Data Type: bit`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipProductEntityType = z.infer<typeof YourMembershipProductSchema>;

/**
 * zod schema definition for the entity Products__HubSpot
 */
export const HubSpotProduct__HubSpotSchema = z.object({
    hs_object_id: z.string().describe(`
        * * Field Name: hs_object_id
        * * Display Name: HubSpot Object ID
        * * SQL Data Type: nvarchar(100)`),
    name: z.string().nullable().describe(`
        * * Field Name: name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(500)`),
    description: z.string().nullable().describe(`
        * * Field Name: description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    price: z.number().nullable().describe(`
        * * Field Name: price
        * * Display Name: Price
        * * SQL Data Type: decimal(18, 2)`),
    hs_cost_of_goods_sold: z.number().nullable().describe(`
        * * Field Name: hs_cost_of_goods_sold
        * * Display Name: Cost of Goods Sold
        * * SQL Data Type: decimal(18, 2)`),
    hs_recurring_billing_period: z.string().nullable().describe(`
        * * Field Name: hs_recurring_billing_period
        * * Display Name: Recurring Billing Period
        * * SQL Data Type: nvarchar(500)`),
    hs_sku: z.string().nullable().describe(`
        * * Field Name: hs_sku
        * * Display Name: SKU
        * * SQL Data Type: nvarchar(500)`),
    tax: z.number().nullable().describe(`
        * * Field Name: tax
        * * Display Name: Tax
        * * SQL Data Type: decimal(18, 2)`),
    createdate: z.date().nullable().describe(`
        * * Field Name: createdate
        * * Display Name: HubSpot Created Date
        * * SQL Data Type: datetimeoffset`),
    hs_lastmodifieddate: z.date().nullable().describe(`
        * * Field Name: hs_lastmodifieddate
        * * Display Name: HubSpot Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotProduct__HubSpotEntityType = z.infer<typeof HubSpotProduct__HubSpotSchema>;

/**
 * zod schema definition for the entity QB Classes
 */
export const YourMembershipQBClassSchema = z.object({
    Id: z.number().describe(`
        * * Field Name: Id
        * * Display Name: ID
        * * SQL Data Type: int`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Class Name
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipQBClassEntityType = z.infer<typeof YourMembershipQBClassSchema>;

/**
 * zod schema definition for the entity Quote Contacts
 */
export const HubSpotQuoteContactSchema = z.object({
    quote_id: z.string().describe(`
        * * Field Name: quote_id
        * * Display Name: Quote
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Quotes (vwQuotes.hs_object_id)
        * * Description: HubSpot Quote hs_object_id`),
    contact_id: z.string().describe(`
        * * Field Name: contact_id
        * * Display Name: Contact
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
        * * Description: HubSpot Contact hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotQuoteContactEntityType = z.infer<typeof HubSpotQuoteContactSchema>;

/**
 * zod schema definition for the entity Quote Line Items
 */
export const HubSpotQuoteLineItemSchema = z.object({
    quote_id: z.string().describe(`
        * * Field Name: quote_id
        * * Display Name: Quote
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Quotes (vwQuotes.hs_object_id)
        * * Description: HubSpot Quote hs_object_id`),
    line_item_id: z.string().describe(`
        * * Field Name: line_item_id
        * * Display Name: Line Item
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Line Items (vwLineItems.hs_object_id)
        * * Description: HubSpot LineItem hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotQuoteLineItemEntityType = z.infer<typeof HubSpotQuoteLineItemSchema>;

/**
 * zod schema definition for the entity Quotes
 */
export const HubSpotQuoteSchema = z.object({
    hs_object_id: z.string().describe(`
        * * Field Name: hs_object_id
        * * Display Name: Quote ID
        * * SQL Data Type: nvarchar(100)`),
    hs_title: z.string().nullable().describe(`
        * * Field Name: hs_title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(500)`),
    hs_expiration_date: z.date().nullable().describe(`
        * * Field Name: hs_expiration_date
        * * Display Name: Expiration Date
        * * SQL Data Type: datetimeoffset`),
    hs_status: z.string().nullable().describe(`
        * * Field Name: hs_status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(500)`),
    hs_quote_amount: z.number().nullable().describe(`
        * * Field Name: hs_quote_amount
        * * Display Name: Quote Amount
        * * SQL Data Type: decimal(18, 2)`),
    hs_currency: z.string().nullable().describe(`
        * * Field Name: hs_currency
        * * Display Name: Currency
        * * SQL Data Type: nvarchar(500)`),
    hs_sender_firstname: z.string().nullable().describe(`
        * * Field Name: hs_sender_firstname
        * * Display Name: Sender First Name
        * * SQL Data Type: nvarchar(500)`),
    hs_sender_lastname: z.string().nullable().describe(`
        * * Field Name: hs_sender_lastname
        * * Display Name: Sender Last Name
        * * SQL Data Type: nvarchar(500)`),
    hs_sender_email: z.string().nullable().describe(`
        * * Field Name: hs_sender_email
        * * Display Name: Sender Email
        * * SQL Data Type: nvarchar(500)
        * * Related Entity/Foreign Key: Members (vwMembers.EmailAddr)`),
    hs_sender_company_name: z.string().nullable().describe(`
        * * Field Name: hs_sender_company_name
        * * Display Name: Sender Company Name
        * * SQL Data Type: nvarchar(500)`),
    hs_language: z.string().nullable().describe(`
        * * Field Name: hs_language
        * * Display Name: Language
        * * SQL Data Type: nvarchar(500)`),
    hs_locale: z.string().nullable().describe(`
        * * Field Name: hs_locale
        * * Display Name: Locale
        * * SQL Data Type: nvarchar(500)`),
    hs_slug: z.string().nullable().describe(`
        * * Field Name: hs_slug
        * * Display Name: URL Slug
        * * SQL Data Type: nvarchar(500)`),
    hs_public_url_key: z.string().nullable().describe(`
        * * Field Name: hs_public_url_key
        * * Display Name: Public URL Key
        * * SQL Data Type: nvarchar(500)`),
    createdate: z.date().nullable().describe(`
        * * Field Name: createdate
        * * Display Name: HubSpot Created Date
        * * SQL Data Type: datetimeoffset`),
    hs_lastmodifieddate: z.date().nullable().describe(`
        * * Field Name: hs_lastmodifieddate
        * * Display Name: HubSpot Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotQuoteEntityType = z.infer<typeof HubSpotQuoteSchema>;

/**
 * zod schema definition for the entity Shipping Methods
 */
export const YourMembershipShippingMethodSchema = z.object({
    id: z.number().describe(`
        * * Field Name: id
        * * Display Name: ID
        * * SQL Data Type: int`),
    method: z.string().nullable().describe(`
        * * Field Name: method
        * * Display Name: Shipping Method
        * * SQL Data Type: nvarchar(200)`),
    basePrice: z.number().nullable().describe(`
        * * Field Name: basePrice
        * * Display Name: Base Price
        * * SQL Data Type: decimal(18, 2)`),
    pricePerWeightUnit: z.number().nullable().describe(`
        * * Field Name: pricePerWeightUnit
        * * Display Name: Price Per Weight Unit
        * * SQL Data Type: decimal(18, 2)`),
    isDefault: z.boolean().nullable().describe(`
        * * Field Name: isDefault
        * * Display Name: Default Method
        * * SQL Data Type: bit`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipShippingMethodEntityType = z.infer<typeof YourMembershipShippingMethodSchema>;

/**
 * zod schema definition for the entity Sponsor Rotators
 */
export const YourMembershipSponsorRotatorSchema = z.object({
    RotatorId: z.number().describe(`
        * * Field Name: RotatorId
        * * Display Name: Rotator ID
        * * SQL Data Type: int`),
    AutoScroll: z.boolean().nullable().describe(`
        * * Field Name: AutoScroll
        * * Display Name: Auto Scroll
        * * SQL Data Type: bit`),
    Random: z.boolean().nullable().describe(`
        * * Field Name: Random
        * * Display Name: Randomize Order
        * * SQL Data Type: bit`),
    DateAdded: z.date().nullable().describe(`
        * * Field Name: DateAdded
        * * Display Name: Date Added
        * * SQL Data Type: datetimeoffset`),
    Mode: z.number().nullable().describe(`
        * * Field Name: Mode
        * * Display Name: Display Mode
        * * SQL Data Type: int`),
    Orientation: z.string().nullable().describe(`
        * * Field Name: Orientation
        * * Display Name: Orientation
        * * SQL Data Type: nvarchar(200)`),
    SchoolId: z.number().nullable().describe(`
        * * Field Name: SchoolId
        * * Display Name: School
        * * SQL Data Type: int`),
    Speed: z.number().nullable().describe(`
        * * Field Name: Speed
        * * Display Name: Scroll Speed
        * * SQL Data Type: int`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(200)`),
    ClientId: z.number().nullable().describe(`
        * * Field Name: ClientId
        * * Display Name: Client
        * * SQL Data Type: int`),
    Heading: z.string().nullable().describe(`
        * * Field Name: Heading
        * * Display Name: Heading
        * * SQL Data Type: nvarchar(200)`),
    Height: z.number().nullable().describe(`
        * * Field Name: Height
        * * Display Name: Display Height
        * * SQL Data Type: int`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipSponsorRotatorEntityType = z.infer<typeof YourMembershipSponsorRotatorSchema>;

/**
 * zod schema definition for the entity Store Order Details
 */
export const YourMembershipStoreOrderDetailSchema = z.object({
    OrderDetailID: z.number().describe(`
        * * Field Name: OrderDetailID
        * * Display Name: Order Detail ID
        * * SQL Data Type: int`),
    OrderID: z.number().nullable().describe(`
        * * Field Name: OrderID
        * * Display Name: Order
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Store Orders (vwStoreOrders.OrderID)`),
    WebsiteMemberID: z.number().nullable().describe(`
        * * Field Name: WebsiteMemberID
        * * Display Name: Website Member
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)`),
    ProductName: z.string().nullable().describe(`
        * * Field Name: ProductName
        * * Display Name: Product Name
        * * SQL Data Type: nvarchar(200)`),
    Quantity: z.number().nullable().describe(`
        * * Field Name: Quantity
        * * Display Name: Quantity
        * * SQL Data Type: int`),
    UnitPrice: z.number().nullable().describe(`
        * * Field Name: UnitPrice
        * * Display Name: Unit Price
        * * SQL Data Type: decimal(18, 2)`),
    TotalPrice: z.number().nullable().describe(`
        * * Field Name: TotalPrice
        * * Display Name: Total Price
        * * SQL Data Type: decimal(18, 2)`),
    OrderDate: z.date().nullable().describe(`
        * * Field Name: OrderDate
        * * Display Name: Order Date
        * * SQL Data Type: datetimeoffset`),
    Status: z.string().nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(200)`),
    ShippingMethod: z.string().nullable().describe(`
        * * Field Name: ShippingMethod
        * * Display Name: Shipping Method
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Shipping Methods (vwShippingMethods.id)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipStoreOrderDetailEntityType = z.infer<typeof YourMembershipStoreOrderDetailSchema>;

/**
 * zod schema definition for the entity Store Orders
 */
export const YourMembershipStoreOrderSchema = z.object({
    OrderID: z.number().describe(`
        * * Field Name: OrderID
        * * Display Name: Order ID
        * * SQL Data Type: int`),
    WebsiteMemberID: z.number().nullable().describe(`
        * * Field Name: WebsiteMemberID
        * * Display Name: Member
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)`),
    OrderDate: z.date().nullable().describe(`
        * * Field Name: OrderDate
        * * Display Name: Order Date
        * * SQL Data Type: datetimeoffset`),
    Status: z.string().nullable().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(200)`),
    TotalAmount: z.number().nullable().describe(`
        * * Field Name: TotalAmount
        * * Display Name: Total Amount
        * * SQL Data Type: decimal(18, 2)`),
    ShippingMethod: z.string().nullable().describe(`
        * * Field Name: ShippingMethod
        * * Display Name: Shipping Method
        * * SQL Data Type: nvarchar(200)
        * * Related Entity/Foreign Key: Shipping Methods (vwShippingMethods.id)`),
    TrackingNumber: z.string().nullable().describe(`
        * * Field Name: TrackingNumber
        * * Display Name: Tracking Number
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipStoreOrderEntityType = z.infer<typeof YourMembershipStoreOrderSchema>;

/**
 * zod schema definition for the entity Tasks
 */
export const HubSpotTaskSchema = z.object({
    hs_object_id: z.string().describe(`
        * * Field Name: hs_object_id
        * * Display Name: Object ID
        * * SQL Data Type: nvarchar(100)`),
    hs_task_subject: z.string().nullable().describe(`
        * * Field Name: hs_task_subject
        * * Display Name: Subject
        * * SQL Data Type: nvarchar(500)`),
    hs_task_body: z.string().nullable().describe(`
        * * Field Name: hs_task_body
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    hs_task_status: z.string().nullable().describe(`
        * * Field Name: hs_task_status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(500)`),
    hs_task_priority: z.string().nullable().describe(`
        * * Field Name: hs_task_priority
        * * Display Name: Priority
        * * SQL Data Type: nvarchar(500)`),
    hs_task_type: z.string().nullable().describe(`
        * * Field Name: hs_task_type
        * * Display Name: Task Type
        * * SQL Data Type: nvarchar(500)`),
    hs_timestamp: z.date().nullable().describe(`
        * * Field Name: hs_timestamp
        * * Display Name: Due Date
        * * SQL Data Type: datetimeoffset`),
    hs_task_completion_date: z.string().nullable().describe(`
        * * Field Name: hs_task_completion_date
        * * Display Name: Completion Date
        * * SQL Data Type: nvarchar(255)`),
    hs_queue_membership_ids: z.string().nullable().describe(`
        * * Field Name: hs_queue_membership_ids
        * * Display Name: Queue Memberships
        * * SQL Data Type: nvarchar(500)`),
    hubspot_owner_id: z.string().nullable().describe(`
        * * Field Name: hubspot_owner_id
        * * Display Name: Owner
        * * SQL Data Type: nvarchar(100)`),
    createdate: z.date().nullable().describe(`
        * * Field Name: createdate
        * * Display Name: Created Date
        * * SQL Data Type: datetimeoffset`),
    hs_lastmodifieddate: z.date().nullable().describe(`
        * * Field Name: hs_lastmodifieddate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotTaskEntityType = z.infer<typeof HubSpotTaskSchema>;

/**
 * zod schema definition for the entity Ticket Calls
 */
export const HubSpotTicketCallSchema = z.object({
    ticket_id: z.string().describe(`
        * * Field Name: ticket_id
        * * Display Name: Ticket
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Tickets (vwTickets.hs_object_id)
        * * Description: HubSpot Ticket hs_object_id`),
    call_id: z.string().describe(`
        * * Field Name: call_id
        * * Display Name: Call
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Calls (vwCalls.hs_object_id)
        * * Description: HubSpot Call hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotTicketCallEntityType = z.infer<typeof HubSpotTicketCallSchema>;

/**
 * zod schema definition for the entity Ticket Emails
 */
export const HubSpotTicketEmailSchema = z.object({
    ticket_id: z.string().describe(`
        * * Field Name: ticket_id
        * * Display Name: Ticket
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Tickets (vwTickets.hs_object_id)
        * * Description: HubSpot Ticket hs_object_id`),
    email_id: z.string().describe(`
        * * Field Name: email_id
        * * Display Name: Email
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Emails (vwEmails.hs_object_id)
        * * Description: HubSpot Email hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotTicketEmailEntityType = z.infer<typeof HubSpotTicketEmailSchema>;

/**
 * zod schema definition for the entity Ticket Feedback Submissions
 */
export const HubSpotTicketFeedbackSubmissionSchema = z.object({
    ticket_id: z.string().describe(`
        * * Field Name: ticket_id
        * * Display Name: Ticket
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Tickets (vwTickets.hs_object_id)
        * * Description: HubSpot Ticket hs_object_id`),
    feedback_submission_id: z.string().describe(`
        * * Field Name: feedback_submission_id
        * * Display Name: Feedback Submission
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Feedback Submissions (vwFeedbackSubmissions.hs_object_id)
        * * Description: HubSpot FeedbackSubmission hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotTicketFeedbackSubmissionEntityType = z.infer<typeof HubSpotTicketFeedbackSubmissionSchema>;

/**
 * zod schema definition for the entity Ticket Meetings
 */
export const HubSpotTicketMeetingSchema = z.object({
    ticket_id: z.string().describe(`
        * * Field Name: ticket_id
        * * Display Name: Ticket
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Tickets (vwTickets.hs_object_id)
        * * Description: HubSpot Ticket hs_object_id`),
    meeting_id: z.string().describe(`
        * * Field Name: meeting_id
        * * Display Name: Meeting
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Meetings (vwMeetings.hs_object_id)
        * * Description: HubSpot Meeting hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotTicketMeetingEntityType = z.infer<typeof HubSpotTicketMeetingSchema>;

/**
 * zod schema definition for the entity Ticket Notes
 */
export const HubSpotTicketNoteSchema = z.object({
    ticket_id: z.string().describe(`
        * * Field Name: ticket_id
        * * Display Name: Ticket
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Tickets (vwTickets.hs_object_id)
        * * Description: HubSpot Ticket hs_object_id`),
    note_id: z.string().describe(`
        * * Field Name: note_id
        * * Display Name: Note
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Notes (vwNotes.hs_object_id)
        * * Description: HubSpot Note hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotTicketNoteEntityType = z.infer<typeof HubSpotTicketNoteSchema>;

/**
 * zod schema definition for the entity Ticket Tasks
 */
export const HubSpotTicketTaskSchema = z.object({
    ticket_id: z.string().describe(`
        * * Field Name: ticket_id
        * * Display Name: Ticket
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Tickets (vwTickets.hs_object_id)
        * * Description: HubSpot Ticket hs_object_id`),
    task_id: z.string().describe(`
        * * Field Name: task_id
        * * Display Name: Task
        * * SQL Data Type: nvarchar(100)
        * * Related Entity/Foreign Key: Tasks (vwTasks.hs_object_id)
        * * Description: HubSpot Task hs_object_id`),
    association_type: z.string().nullable().describe(`
        * * Field Name: association_type
        * * Display Name: Association Type
        * * SQL Data Type: nvarchar(100)
        * * Description: HubSpot association label (e.g., Primary, Unlabeled)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotTicketTaskEntityType = z.infer<typeof HubSpotTicketTaskSchema>;

/**
 * zod schema definition for the entity Tickets
 */
export const HubSpotTicketSchema = z.object({
    hs_object_id: z.string().describe(`
        * * Field Name: hs_object_id
        * * Display Name: Ticket ID
        * * SQL Data Type: nvarchar(100)`),
    subject: z.string().nullable().describe(`
        * * Field Name: subject
        * * Display Name: Subject
        * * SQL Data Type: nvarchar(500)`),
    content: z.string().nullable().describe(`
        * * Field Name: content
        * * Display Name: Content
        * * SQL Data Type: nvarchar(MAX)`),
    hs_pipeline: z.string().nullable().describe(`
        * * Field Name: hs_pipeline
        * * Display Name: Pipeline
        * * SQL Data Type: nvarchar(500)`),
    hs_pipeline_stage: z.string().nullable().describe(`
        * * Field Name: hs_pipeline_stage
        * * Display Name: Pipeline Stage
        * * SQL Data Type: nvarchar(500)`),
    hs_ticket_priority: z.string().nullable().describe(`
        * * Field Name: hs_ticket_priority
        * * Display Name: Priority
        * * SQL Data Type: nvarchar(500)`),
    hs_ticket_category: z.string().nullable().describe(`
        * * Field Name: hs_ticket_category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(500)`),
    createdate: z.date().nullable().describe(`
        * * Field Name: createdate
        * * Display Name: Created Date
        * * SQL Data Type: datetimeoffset`),
    hs_lastmodifieddate: z.date().nullable().describe(`
        * * Field Name: hs_lastmodifieddate
        * * Display Name: Last Modified Date
        * * SQL Data Type: datetimeoffset`),
    closed_date: z.date().nullable().describe(`
        * * Field Name: closed_date
        * * Display Name: Closed Date
        * * SQL Data Type: datetimeoffset`),
    source_type: z.string().nullable().describe(`
        * * Field Name: source_type
        * * Display Name: Source Type
        * * SQL Data Type: nvarchar(500)`),
    hubspot_owner_id: z.string().nullable().describe(`
        * * Field Name: hubspot_owner_id
        * * Display Name: Owner
        * * SQL Data Type: nvarchar(100)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type HubSpotTicketEntityType = z.infer<typeof HubSpotTicketSchema>;

/**
 * zod schema definition for the entity Time Zones
 */
export const YourMembershipTimeZoneSchema = z.object({
    fullName: z.string().describe(`
        * * Field Name: fullName
        * * Display Name: Full Name
        * * SQL Data Type: nvarchar(200)`),
    gmtOffset: z.string().nullable().describe(`
        * * Field Name: gmtOffset
        * * Display Name: GMT Offset
        * * SQL Data Type: nvarchar(200)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type YourMembershipTimeZoneEntityType = z.infer<typeof YourMembershipTimeZoneSchema>;
 
 

/**
 * All Campaigns - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: AllCampaign
 * * Base View: vwAllCampaigns
 * * @description Extended campaign data with scheduling, processing counts, categories, and version info
 * * Primary Key: CampaignId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'All Campaigns')
export class YourMembershipAllCampaignEntity extends BaseEntity<YourMembershipAllCampaignEntityType> {
    /**
    * Loads the All Campaigns record from the database
    * @param CampaignId: number - primary key value to load the All Campaigns record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipAllCampaignEntity
    * @method
    * @override
    */
    public async Load(CampaignId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'CampaignId', Value: CampaignId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: CampaignId
    * * Display Name: Campaign ID
    * * SQL Data Type: int
    */
    get CampaignId(): number {
        return this.Get('CampaignId');
    }
    set CampaignId(value: number) {
        this.Set('CampaignId', value);
    }

    /**
    * * Field Name: CampaignName
    * * Display Name: Campaign Name
    * * SQL Data Type: nvarchar(200)
    */
    get CampaignName(): string | null {
        return this.Get('CampaignName');
    }
    set CampaignName(value: string | null) {
        this.Set('CampaignName', value);
    }

    /**
    * * Field Name: Subject
    * * Display Name: Subject
    * * SQL Data Type: nvarchar(200)
    */
    get Subject(): string | null {
        return this.Get('Subject');
    }
    set Subject(value: string | null) {
        this.Set('Subject', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(200)
    */
    get Status(): string | null {
        return this.Get('Status');
    }
    set Status(value: string | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(200)
    */
    get Category(): string | null {
        return this.Get('Category');
    }
    set Category(value: string | null) {
        this.Set('Category', value);
    }

    /**
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(200)
    */
    get Type(): string | null {
        return this.Get('Type');
    }
    set Type(value: string | null) {
        this.Set('Type', value);
    }

    /**
    * * Field Name: DateScheduled
    * * Display Name: Date Scheduled
    * * SQL Data Type: datetimeoffset
    */
    get DateScheduled(): Date | null {
        return this.Get('DateScheduled');
    }
    set DateScheduled(value: Date | null) {
        this.Set('DateScheduled', value);
    }

    /**
    * * Field Name: DateSent
    * * Display Name: Date Sent
    * * SQL Data Type: datetimeoffset
    */
    get DateSent(): Date | null {
        return this.Get('DateSent');
    }
    set DateSent(value: Date | null) {
        this.Set('DateSent', value);
    }

    /**
    * * Field Name: ProcessingCount
    * * Display Name: Processing Count
    * * SQL Data Type: int
    */
    get ProcessingCount(): number | null {
        return this.Get('ProcessingCount');
    }
    set ProcessingCount(value: number | null) {
        this.Set('ProcessingCount', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Announcements - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: Announcement
 * * Base View: vwAnnouncements
 * * @description Admin announcements with title, text, publication dates, and active status
 * * Primary Key: AnnouncementId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Announcements')
export class YourMembershipAnnouncementEntity extends BaseEntity<YourMembershipAnnouncementEntityType> {
    /**
    * Loads the Announcements record from the database
    * @param AnnouncementId: number - primary key value to load the Announcements record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipAnnouncementEntity
    * @method
    * @override
    */
    public async Load(AnnouncementId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'AnnouncementId', Value: AnnouncementId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: AnnouncementId
    * * Display Name: Announcement ID
    * * SQL Data Type: int
    */
    get AnnouncementId(): number {
        return this.Get('AnnouncementId');
    }
    set AnnouncementId(value: number) {
        this.Set('AnnouncementId', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(200)
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Text
    * * Display Name: Announcement Text
    * * SQL Data Type: nvarchar(500)
    */
    get Text(): string | null {
        return this.Get('Text');
    }
    set Text(value: string | null) {
        this.Set('Text', value);
    }

    /**
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: datetimeoffset
    */
    get StartDate(): Date | null {
        return this.Get('StartDate');
    }
    set StartDate(value: Date | null) {
        this.Set('StartDate', value);
    }

    /**
    * * Field Name: EndDate
    * * Display Name: End Date
    * * SQL Data Type: datetimeoffset
    */
    get EndDate(): Date | null {
        return this.Get('EndDate');
    }
    set EndDate(value: Date | null) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: Active
    * * Display Name: Active
    * * SQL Data Type: bit
    */
    get Active(): boolean | null {
        return this.Get('Active');
    }
    set Active(value: boolean | null) {
        this.Set('Active', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Calls - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: Call
 * * Base View: vwCalls
 * * @description Logged phone calls with duration, direction, and recording details
 * * Primary Key: hs_object_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Calls')
export class HubSpotCallEntity extends BaseEntity<HubSpotCallEntityType> {
    /**
    * Loads the Calls record from the database
    * @param hs_object_id: string - primary key value to load the Calls record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotCallEntity
    * @method
    * @override
    */
    public async Load(hs_object_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'hs_object_id', Value: hs_object_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: hs_object_id
    * * Display Name: Object ID
    * * SQL Data Type: nvarchar(100)
    */
    get hs_object_id(): string {
        return this.Get('hs_object_id');
    }
    set hs_object_id(value: string) {
        this.Set('hs_object_id', value);
    }

    /**
    * * Field Name: hs_call_title
    * * Display Name: Call Title
    * * SQL Data Type: nvarchar(500)
    */
    get hs_call_title(): string | null {
        return this.Get('hs_call_title');
    }
    set hs_call_title(value: string | null) {
        this.Set('hs_call_title', value);
    }

    /**
    * * Field Name: hs_call_body
    * * Display Name: Call Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get hs_call_body(): string | null {
        return this.Get('hs_call_body');
    }
    set hs_call_body(value: string | null) {
        this.Set('hs_call_body', value);
    }

    /**
    * * Field Name: hs_call_status
    * * Display Name: Call Status
    * * SQL Data Type: nvarchar(500)
    */
    get hs_call_status(): string | null {
        return this.Get('hs_call_status');
    }
    set hs_call_status(value: string | null) {
        this.Set('hs_call_status', value);
    }

    /**
    * * Field Name: hs_call_direction
    * * Display Name: Direction
    * * SQL Data Type: nvarchar(500)
    */
    get hs_call_direction(): string | null {
        return this.Get('hs_call_direction');
    }
    set hs_call_direction(value: string | null) {
        this.Set('hs_call_direction', value);
    }

    /**
    * * Field Name: hs_call_duration
    * * Display Name: Duration (ms)
    * * SQL Data Type: int
    */
    get hs_call_duration(): number | null {
        return this.Get('hs_call_duration');
    }
    set hs_call_duration(value: number | null) {
        this.Set('hs_call_duration', value);
    }

    /**
    * * Field Name: hs_call_from_number
    * * Display Name: From Number
    * * SQL Data Type: nvarchar(500)
    */
    get hs_call_from_number(): string | null {
        return this.Get('hs_call_from_number');
    }
    set hs_call_from_number(value: string | null) {
        this.Set('hs_call_from_number', value);
    }

    /**
    * * Field Name: hs_call_to_number
    * * Display Name: To Number
    * * SQL Data Type: nvarchar(500)
    */
    get hs_call_to_number(): string | null {
        return this.Get('hs_call_to_number');
    }
    set hs_call_to_number(value: string | null) {
        this.Set('hs_call_to_number', value);
    }

    /**
    * * Field Name: hs_call_disposition
    * * Display Name: Call Outcome
    * * SQL Data Type: nvarchar(500)
    */
    get hs_call_disposition(): string | null {
        return this.Get('hs_call_disposition');
    }
    set hs_call_disposition(value: string | null) {
        this.Set('hs_call_disposition', value);
    }

    /**
    * * Field Name: hs_call_recording_url
    * * Display Name: Recording URL
    * * SQL Data Type: nvarchar(1000)
    */
    get hs_call_recording_url(): string | null {
        return this.Get('hs_call_recording_url');
    }
    set hs_call_recording_url(value: string | null) {
        this.Set('hs_call_recording_url', value);
    }

    /**
    * * Field Name: hubspot_owner_id
    * * Display Name: HubSpot Owner
    * * SQL Data Type: nvarchar(100)
    */
    get hubspot_owner_id(): string | null {
        return this.Get('hubspot_owner_id');
    }
    set hubspot_owner_id(value: string | null) {
        this.Set('hubspot_owner_id', value);
    }

    /**
    * * Field Name: hs_timestamp
    * * Display Name: Call Timestamp
    * * SQL Data Type: datetimeoffset
    */
    get hs_timestamp(): Date | null {
        return this.Get('hs_timestamp');
    }
    set hs_timestamp(value: Date | null) {
        this.Set('hs_timestamp', value);
    }

    /**
    * * Field Name: createdate
    * * Display Name: Created Date
    * * SQL Data Type: datetimeoffset
    */
    get createdate(): Date | null {
        return this.Get('createdate');
    }
    set createdate(value: Date | null) {
        this.Set('createdate', value);
    }

    /**
    * * Field Name: hs_lastmodifieddate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get hs_lastmodifieddate(): Date | null {
        return this.Get('hs_lastmodifieddate');
    }
    set hs_lastmodifieddate(value: Date | null) {
        this.Set('hs_lastmodifieddate', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Campaign Email Lists - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: CampaignEmailList
 * * Base View: vwCampaignEmailLists
 * * @description Email distribution lists for campaigns with totals, bounces, and opt-out metrics
 * * Primary Key: ListId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Campaign Email Lists')
export class YourMembershipCampaignEmailListEntity extends BaseEntity<YourMembershipCampaignEmailListEntityType> {
    /**
    * Loads the Campaign Email Lists record from the database
    * @param ListId: number - primary key value to load the Campaign Email Lists record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipCampaignEmailListEntity
    * @method
    * @override
    */
    public async Load(ListId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ListId', Value: ListId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ListId
    * * Display Name: List ID
    * * SQL Data Type: int
    */
    get ListId(): number {
        return this.Get('ListId');
    }
    set ListId(value: number) {
        this.Set('ListId', value);
    }

    /**
    * * Field Name: ListType
    * * Display Name: List Type
    * * SQL Data Type: nvarchar(200)
    */
    get ListType(): string | null {
        return this.Get('ListType');
    }
    set ListType(value: string | null) {
        this.Set('ListType', value);
    }

    /**
    * * Field Name: ListSize
    * * Display Name: List Size
    * * SQL Data Type: int
    */
    get ListSize(): number | null {
        return this.Get('ListSize');
    }
    set ListSize(value: number | null) {
        this.Set('ListSize', value);
    }

    /**
    * * Field Name: ListName
    * * Display Name: List Name
    * * SQL Data Type: nvarchar(200)
    */
    get ListName(): string | null {
        return this.Get('ListName');
    }
    set ListName(value: string | null) {
        this.Set('ListName', value);
    }

    /**
    * * Field Name: ListArea
    * * Display Name: List Area
    * * SQL Data Type: nvarchar(200)
    */
    get ListArea(): string | null {
        return this.Get('ListArea');
    }
    set ListArea(value: string | null) {
        this.Set('ListArea', value);
    }

    /**
    * * Field Name: DateCreated
    * * Display Name: Date Created
    * * SQL Data Type: datetimeoffset
    */
    get DateCreated(): Date | null {
        return this.Get('DateCreated');
    }
    set DateCreated(value: Date | null) {
        this.Set('DateCreated', value);
    }

    /**
    * * Field Name: DateModified
    * * Display Name: Date Modified
    * * SQL Data Type: datetimeoffset
    */
    get DateModified(): Date | null {
        return this.Get('DateModified');
    }
    set DateModified(value: Date | null) {
        this.Set('DateModified', value);
    }

    /**
    * * Field Name: DateLastUpdated
    * * Display Name: Date Last Updated
    * * SQL Data Type: datetimeoffset
    */
    get DateLastUpdated(): Date | null {
        return this.Get('DateLastUpdated');
    }
    set DateLastUpdated(value: Date | null) {
        this.Set('DateLastUpdated', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Campaigns - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: Campaign
 * * Base View: vwCampaigns
 * * @description Email marketing campaigns with scheduling, sender, and delivery status
 * * Primary Key: CampaignId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Campaigns')
export class YourMembershipCampaignEntity extends BaseEntity<YourMembershipCampaignEntityType> {
    /**
    * Loads the Campaigns record from the database
    * @param CampaignId: number - primary key value to load the Campaigns record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipCampaignEntity
    * @method
    * @override
    */
    public async Load(CampaignId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'CampaignId', Value: CampaignId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: CampaignId
    * * Display Name: Campaign ID
    * * SQL Data Type: int
    */
    get CampaignId(): number {
        return this.Get('CampaignId');
    }
    set CampaignId(value: number) {
        this.Set('CampaignId', value);
    }

    /**
    * * Field Name: CampaignName
    * * Display Name: Campaign Name
    * * SQL Data Type: nvarchar(200)
    */
    get CampaignName(): string | null {
        return this.Get('CampaignName');
    }
    set CampaignName(value: string | null) {
        this.Set('CampaignName', value);
    }

    /**
    * * Field Name: Subject
    * * Display Name: Subject
    * * SQL Data Type: nvarchar(200)
    */
    get Subject(): string | null {
        return this.Get('Subject');
    }
    set Subject(value: string | null) {
        this.Set('Subject', value);
    }

    /**
    * * Field Name: SenderEmail
    * * Display Name: Sender Email
    * * SQL Data Type: nvarchar(200)
    */
    get SenderEmail(): string | null {
        return this.Get('SenderEmail');
    }
    set SenderEmail(value: string | null) {
        this.Set('SenderEmail', value);
    }

    /**
    * * Field Name: DateScheduled
    * * Display Name: Date Scheduled
    * * SQL Data Type: datetimeoffset
    */
    get DateScheduled(): Date | null {
        return this.Get('DateScheduled');
    }
    set DateScheduled(value: Date | null) {
        this.Set('DateScheduled', value);
    }

    /**
    * * Field Name: DateSent
    * * Display Name: Date Sent
    * * SQL Data Type: datetimeoffset
    */
    get DateSent(): Date | null {
        return this.Get('DateSent');
    }
    set DateSent(value: Date | null) {
        this.Set('DateSent', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(200)
    */
    get Status(): string | null {
        return this.Get('Status');
    }
    set Status(value: string | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Career Openings - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: CareerOpening
 * * Base View: vwCareerOpenings
 * * @description Job board postings with position, organization, salary, and contact details
 * * Primary Key: CareerOpeningID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Career Openings')
export class YourMembershipCareerOpeningEntity extends BaseEntity<YourMembershipCareerOpeningEntityType> {
    /**
    * Loads the Career Openings record from the database
    * @param CareerOpeningID: number - primary key value to load the Career Openings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipCareerOpeningEntity
    * @method
    * @override
    */
    public async Load(CareerOpeningID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'CareerOpeningID', Value: CareerOpeningID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: CareerOpeningID
    * * Display Name: Career Opening ID
    * * SQL Data Type: int
    */
    get CareerOpeningID(): number {
        return this.Get('CareerOpeningID');
    }
    set CareerOpeningID(value: number) {
        this.Set('CareerOpeningID', value);
    }

    /**
    * * Field Name: Position
    * * Display Name: Position
    * * SQL Data Type: nvarchar(200)
    */
    get Position(): string | null {
        return this.Get('Position');
    }
    set Position(value: string | null) {
        this.Set('Position', value);
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(200)
    */
    get Organization(): string | null {
        return this.Get('Organization');
    }
    set Organization(value: string | null) {
        this.Set('Organization', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(200)
    */
    get City(): string | null {
        return this.Get('City');
    }
    set City(value: string | null) {
        this.Set('City', value);
    }

    /**
    * * Field Name: State
    * * Display Name: State
    * * SQL Data Type: nvarchar(200)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: Salary
    * * Display Name: Salary
    * * SQL Data Type: nvarchar(200)
    */
    get Salary(): string | null {
        return this.Get('Salary');
    }
    set Salary(value: string | null) {
        this.Set('Salary', value);
    }

    /**
    * * Field Name: DatePosted
    * * Display Name: Date Posted
    * * SQL Data Type: datetimeoffset
    */
    get DatePosted(): Date | null {
        return this.Get('DatePosted');
    }
    set DatePosted(value: Date | null) {
        this.Set('DatePosted', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ContactEmail
    * * Display Name: Contact Email
    * * SQL Data Type: nvarchar(500)
    */
    get ContactEmail(): string | null {
        return this.Get('ContactEmail');
    }
    set ContactEmail(value: string | null) {
        this.Set('ContactEmail', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Certification Credit Types - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: CertificationCreditType
 * * Base View: vwCertificationCreditTypes
 * * @description Types of continuing education credits (e.g., CEU, CPE) with expiration rules
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Certification Credit Types')
export class YourMembershipCertificationCreditTypeEntity extends BaseEntity<YourMembershipCertificationCreditTypeEntityType> {
    /**
    * Loads the Certification Credit Types record from the database
    * @param ID: number - primary key value to load the Certification Credit Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipCertificationCreditTypeEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(200)
    */
    get Code(): string | null {
        return this.Get('Code');
    }
    set Code(value: string | null) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: IsDefault
    * * Display Name: Is Default
    * * SQL Data Type: bit
    */
    get IsDefault(): boolean | null {
        return this.Get('IsDefault');
    }
    set IsDefault(value: boolean | null) {
        this.Set('IsDefault', value);
    }

    /**
    * * Field Name: CreditsExpire
    * * Display Name: Credits Expire
    * * SQL Data Type: bit
    */
    get CreditsExpire(): boolean | null {
        return this.Get('CreditsExpire');
    }
    set CreditsExpire(value: boolean | null) {
        this.Set('CreditsExpire', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Certification Journals - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: CertificationJournal
 * * Base View: vwCertificationJournals
 * * @description Continuing education journal entries tracking CEU credits earned by members
 * * Primary Key: EntryID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Certification Journals')
export class YourMembershipCertificationJournalEntity extends BaseEntity<YourMembershipCertificationJournalEntityType> {
    /**
    * Loads the Certification Journals record from the database
    * @param EntryID: number - primary key value to load the Certification Journals record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipCertificationJournalEntity
    * @method
    * @override
    */
    public async Load(EntryID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'EntryID', Value: EntryID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: EntryID
    * * Display Name: Entry ID
    * * SQL Data Type: int
    */
    get EntryID(): number {
        return this.Get('EntryID');
    }
    set EntryID(value: number) {
        this.Set('EntryID', value);
    }

    /**
    * * Field Name: CertificationName
    * * Display Name: Certification Name
    * * SQL Data Type: nvarchar(200)
    */
    get CertificationName(): string | null {
        return this.Get('CertificationName');
    }
    set CertificationName(value: string | null) {
        this.Set('CertificationName', value);
    }

    /**
    * * Field Name: CEUsEarned
    * * Display Name: CEUs Earned
    * * SQL Data Type: decimal(18, 2)
    */
    get CEUsEarned(): number | null {
        return this.Get('CEUsEarned');
    }
    set CEUsEarned(value: number | null) {
        this.Set('CEUsEarned', value);
    }

    /**
    * * Field Name: EntryDate
    * * Display Name: Entry Date
    * * SQL Data Type: datetimeoffset
    */
    get EntryDate(): Date | null {
        return this.Get('EntryDate');
    }
    set EntryDate(value: Date | null) {
        this.Set('EntryDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(200)
    */
    get Status(): string | null {
        return this.Get('Status');
    }
    set Status(value: string | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: WebsiteMemberID
    * * Display Name: Website Member
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)
    */
    get WebsiteMemberID(): number | null {
        return this.Get('WebsiteMemberID');
    }
    set WebsiteMemberID(value: number | null) {
        this.Set('WebsiteMemberID', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Certifications - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: Certification
 * * Base View: vwCertifications
 * * @description Professional certifications and continuing education programs
 * * Primary Key: CertificationID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Certifications')
export class YourMembershipCertificationEntity extends BaseEntity<YourMembershipCertificationEntityType> {
    /**
    * Loads the Certifications record from the database
    * @param CertificationID: string - primary key value to load the Certifications record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipCertificationEntity
    * @method
    * @override
    */
    public async Load(CertificationID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'CertificationID', Value: CertificationID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: CertificationID
    * * Display Name: Certification
    * * SQL Data Type: nvarchar(200)
    */
    get CertificationID(): string {
        return this.Get('CertificationID');
    }
    set CertificationID(value: string) {
        this.Set('CertificationID', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: nvarchar(200)
    */
    get ID(): string | null {
        return this.Get('ID');
    }
    set ID(value: string | null) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Active
    * * SQL Data Type: bit
    */
    get IsActive(): boolean | null {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean | null) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: CEUsRequired
    * * Display Name: CEUs Required
    * * SQL Data Type: int
    */
    get CEUsRequired(): number | null {
        return this.Get('CEUsRequired');
    }
    set CEUsRequired(value: number | null) {
        this.Set('CEUsRequired', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(200)
    */
    get Code(): string | null {
        return this.Get('Code');
    }
    set Code(value: string | null) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Companies - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: Company
 * * Base View: vwCompanies
 * * @description CRM companies with organization details and firmographic data
 * * Primary Key: hs_object_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Companies')
export class HubSpotCompanyEntity extends BaseEntity<HubSpotCompanyEntityType> {
    /**
    * Loads the Companies record from the database
    * @param hs_object_id: string - primary key value to load the Companies record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotCompanyEntity
    * @method
    * @override
    */
    public async Load(hs_object_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'hs_object_id', Value: hs_object_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: hs_object_id
    * * Display Name: Object ID
    * * SQL Data Type: nvarchar(100)
    */
    get hs_object_id(): string {
        return this.Get('hs_object_id');
    }
    set hs_object_id(value: string) {
        this.Set('hs_object_id', value);
    }

    /**
    * * Field Name: name
    * * Display Name: Company Name
    * * SQL Data Type: nvarchar(500)
    */
    get name(): string | null {
        return this.Get('name');
    }
    set name(value: string | null) {
        this.Set('name', value);
    }

    /**
    * * Field Name: domain
    * * Display Name: Domain
    * * SQL Data Type: nvarchar(500)
    */
    get domain(): string | null {
        return this.Get('domain');
    }
    set domain(value: string | null) {
        this.Set('domain', value);
    }

    /**
    * * Field Name: industry
    * * Display Name: Industry
    * * SQL Data Type: nvarchar(500)
    */
    get industry(): string | null {
        return this.Get('industry');
    }
    set industry(value: string | null) {
        this.Set('industry', value);
    }

    /**
    * * Field Name: phone
    * * Display Name: Phone Number
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.Phone)
    */
    get phone(): string | null {
        return this.Get('phone');
    }
    set phone(value: string | null) {
        this.Set('phone', value);
    }

    /**
    * * Field Name: address
    * * Display Name: Address Line 1
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.Address1)
    */
    get address(): string | null {
        return this.Get('address');
    }
    set address(value: string | null) {
        this.Set('address', value);
    }

    /**
    * * Field Name: address2
    * * Display Name: Address Line 2
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.Address2)
    */
    get address2(): string | null {
        return this.Get('address2');
    }
    set address2(value: string | null) {
        this.Set('address2', value);
    }

    /**
    * * Field Name: city
    * * Display Name: City
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.City)
    */
    get city(): string | null {
        return this.Get('city');
    }
    set city(value: string | null) {
        this.Set('city', value);
    }

    /**
    * * Field Name: state
    * * Display Name: State/Province
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.State)
    */
    get state(): string | null {
        return this.Get('state');
    }
    set state(value: string | null) {
        this.Set('state', value);
    }

    /**
    * * Field Name: zip
    * * Display Name: Postal Code
    * * SQL Data Type: nvarchar(500)
    */
    get zip(): string | null {
        return this.Get('zip');
    }
    set zip(value: string | null) {
        this.Set('zip', value);
    }

    /**
    * * Field Name: country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.Country)
    */
    get country(): string | null {
        return this.Get('country');
    }
    set country(value: string | null) {
        this.Set('country', value);
    }

    /**
    * * Field Name: website
    * * Display Name: Website URL
    * * SQL Data Type: nvarchar(1000)
    */
    get website(): string | null {
        return this.Get('website');
    }
    set website(value: string | null) {
        this.Set('website', value);
    }

    /**
    * * Field Name: description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get description(): string | null {
        return this.Get('description');
    }
    set description(value: string | null) {
        this.Set('description', value);
    }

    /**
    * * Field Name: numberofemployees
    * * Display Name: Number of Employees
    * * SQL Data Type: int
    */
    get numberofemployees(): number | null {
        return this.Get('numberofemployees');
    }
    set numberofemployees(value: number | null) {
        this.Set('numberofemployees', value);
    }

    /**
    * * Field Name: annualrevenue
    * * Display Name: Annual Revenue
    * * SQL Data Type: decimal(18, 2)
    */
    get annualrevenue(): number | null {
        return this.Get('annualrevenue');
    }
    set annualrevenue(value: number | null) {
        this.Set('annualrevenue', value);
    }

    /**
    * * Field Name: lifecyclestage
    * * Display Name: Lifecycle Stage
    * * SQL Data Type: nvarchar(500)
    */
    get lifecyclestage(): string | null {
        return this.Get('lifecyclestage');
    }
    set lifecyclestage(value: string | null) {
        this.Set('lifecyclestage', value);
    }

    /**
    * * Field Name: type
    * * Display Name: Company Type
    * * SQL Data Type: nvarchar(500)
    */
    get type(): string | null {
        return this.Get('type');
    }
    set type(value: string | null) {
        this.Set('type', value);
    }

    /**
    * * Field Name: createdate
    * * Display Name: HubSpot Created Date
    * * SQL Data Type: datetimeoffset
    */
    get createdate(): Date | null {
        return this.Get('createdate');
    }
    set createdate(value: Date | null) {
        this.Set('createdate', value);
    }

    /**
    * * Field Name: hs_lastmodifieddate
    * * Display Name: HubSpot Last Modified
    * * SQL Data Type: datetimeoffset
    */
    get hs_lastmodifieddate(): Date | null {
        return this.Get('hs_lastmodifieddate');
    }
    set hs_lastmodifieddate(value: Date | null) {
        this.Set('hs_lastmodifieddate', value);
    }

    /**
    * * Field Name: founded_year
    * * Display Name: Founded Year
    * * SQL Data Type: nvarchar(500)
    */
    get founded_year(): string | null {
        return this.Get('founded_year');
    }
    set founded_year(value: string | null) {
        this.Set('founded_year', value);
    }

    /**
    * * Field Name: is_public
    * * Display Name: Is Public
    * * SQL Data Type: bit
    */
    get is_public(): boolean | null {
        return this.Get('is_public');
    }
    set is_public(value: boolean | null) {
        this.Set('is_public', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Company Calls - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: CompanyCall
 * * Base View: vwCompanyCalls
 * * @description Associations between companies and logged calls
 * * Primary Keys: company_id, call_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Company Calls')
export class HubSpotCompanyCallEntity extends BaseEntity<HubSpotCompanyCallEntityType> {
    /**
    * Loads the Company Calls record from the database
    * @param company_id: string - primary key value to load the Company Calls record.
    * @param call_id: string - primary key value to load the Company Calls record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotCompanyCallEntity
    * @method
    * @override
    */
    public async Load(company_id: string, call_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'company_id', Value: company_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'call_id', Value: call_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: company_id
    * * Display Name: Company
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
    * * Description: HubSpot Company hs_object_id
    */
    get company_id(): string {
        return this.Get('company_id');
    }
    set company_id(value: string) {
        this.Set('company_id', value);
    }

    /**
    * * Field Name: call_id
    * * Display Name: Call
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Calls (vwCalls.hs_object_id)
    * * Description: HubSpot Call hs_object_id
    */
    get call_id(): string {
        return this.Get('call_id');
    }
    set call_id(value: string) {
        this.Set('call_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Company Deals - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: CompanyDeal
 * * Base View: vwCompanyDeals
 * * @description Many-to-many associations between companies and deals
 * * Primary Keys: company_id, deal_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Company Deals')
export class HubSpotCompanyDealEntity extends BaseEntity<HubSpotCompanyDealEntityType> {
    /**
    * Loads the Company Deals record from the database
    * @param company_id: string - primary key value to load the Company Deals record.
    * @param deal_id: string - primary key value to load the Company Deals record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotCompanyDealEntity
    * @method
    * @override
    */
    public async Load(company_id: string, deal_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'company_id', Value: company_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'deal_id', Value: deal_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: company_id
    * * Display Name: Company
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
    * * Description: HubSpot Company hs_object_id
    */
    get company_id(): string {
        return this.Get('company_id');
    }
    set company_id(value: string) {
        this.Set('company_id', value);
    }

    /**
    * * Field Name: deal_id
    * * Display Name: Deal
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
    * * Description: HubSpot Deal hs_object_id
    */
    get deal_id(): string {
        return this.Get('deal_id');
    }
    set deal_id(value: string) {
        this.Set('deal_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Company Emails - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: CompanyEmail
 * * Base View: vwCompanyEmails
 * * @description Associations between companies and logged emails
 * * Primary Keys: company_id, email_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Company Emails')
export class HubSpotCompanyEmailEntity extends BaseEntity<HubSpotCompanyEmailEntityType> {
    /**
    * Loads the Company Emails record from the database
    * @param company_id: string - primary key value to load the Company Emails record.
    * @param email_id: string - primary key value to load the Company Emails record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotCompanyEmailEntity
    * @method
    * @override
    */
    public async Load(company_id: string, email_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'company_id', Value: company_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'email_id', Value: email_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: company_id
    * * Display Name: Company
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
    * * Description: HubSpot Company hs_object_id
    */
    get company_id(): string {
        return this.Get('company_id');
    }
    set company_id(value: string) {
        this.Set('company_id', value);
    }

    /**
    * * Field Name: email_id
    * * Display Name: Email
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Emails (vwEmails.hs_object_id)
    * * Description: HubSpot Email hs_object_id
    */
    get email_id(): string {
        return this.Get('email_id');
    }
    set email_id(value: string) {
        this.Set('email_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Company Meetings - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: CompanyMeeting
 * * Base View: vwCompanyMeetings
 * * @description Associations between companies and meetings
 * * Primary Keys: company_id, meeting_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Company Meetings')
export class HubSpotCompanyMeetingEntity extends BaseEntity<HubSpotCompanyMeetingEntityType> {
    /**
    * Loads the Company Meetings record from the database
    * @param company_id: string - primary key value to load the Company Meetings record.
    * @param meeting_id: string - primary key value to load the Company Meetings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotCompanyMeetingEntity
    * @method
    * @override
    */
    public async Load(company_id: string, meeting_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'company_id', Value: company_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'meeting_id', Value: meeting_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: company_id
    * * Display Name: Company
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
    * * Description: HubSpot Company hs_object_id
    */
    get company_id(): string {
        return this.Get('company_id');
    }
    set company_id(value: string) {
        this.Set('company_id', value);
    }

    /**
    * * Field Name: meeting_id
    * * Display Name: Meeting
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Meetings (vwMeetings.hs_object_id)
    * * Description: HubSpot Meeting hs_object_id
    */
    get meeting_id(): string {
        return this.Get('meeting_id');
    }
    set meeting_id(value: string) {
        this.Set('meeting_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Company Notes - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: CompanyNote
 * * Base View: vwCompanyNotes
 * * @description Associations between companies and notes
 * * Primary Keys: company_id, note_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Company Notes')
export class HubSpotCompanyNoteEntity extends BaseEntity<HubSpotCompanyNoteEntityType> {
    /**
    * Loads the Company Notes record from the database
    * @param company_id: string - primary key value to load the Company Notes record.
    * @param note_id: string - primary key value to load the Company Notes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotCompanyNoteEntity
    * @method
    * @override
    */
    public async Load(company_id: string, note_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'company_id', Value: company_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'note_id', Value: note_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: company_id
    * * Display Name: Company
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
    * * Description: HubSpot Company hs_object_id
    */
    get company_id(): string {
        return this.Get('company_id');
    }
    set company_id(value: string) {
        this.Set('company_id', value);
    }

    /**
    * * Field Name: note_id
    * * Display Name: Note
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Notes (vwNotes.hs_object_id)
    * * Description: HubSpot Note hs_object_id
    */
    get note_id(): string {
        return this.Get('note_id');
    }
    set note_id(value: string) {
        this.Set('note_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Company Tasks - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: CompanyTask
 * * Base View: vwCompanyTasks
 * * @description Associations between companies and tasks
 * * Primary Keys: company_id, task_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Company Tasks')
export class HubSpotCompanyTaskEntity extends BaseEntity<HubSpotCompanyTaskEntityType> {
    /**
    * Loads the Company Tasks record from the database
    * @param company_id: string - primary key value to load the Company Tasks record.
    * @param task_id: string - primary key value to load the Company Tasks record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotCompanyTaskEntity
    * @method
    * @override
    */
    public async Load(company_id: string, task_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'company_id', Value: company_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'task_id', Value: task_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: company_id
    * * Display Name: Company
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
    * * Description: HubSpot Company hs_object_id
    */
    get company_id(): string {
        return this.Get('company_id');
    }
    set company_id(value: string) {
        this.Set('company_id', value);
    }

    /**
    * * Field Name: task_id
    * * Display Name: Task
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Tasks (vwTasks.hs_object_id)
    * * Description: HubSpot Task hs_object_id
    */
    get task_id(): string {
        return this.Get('task_id');
    }
    set task_id(value: string) {
        this.Set('task_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Company Tickets - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: CompanyTicket
 * * Base View: vwCompanyTickets
 * * @description Many-to-many associations between companies and support tickets
 * * Primary Keys: company_id, ticket_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Company Tickets')
export class HubSpotCompanyTicketEntity extends BaseEntity<HubSpotCompanyTicketEntityType> {
    /**
    * Loads the Company Tickets record from the database
    * @param company_id: string - primary key value to load the Company Tickets record.
    * @param ticket_id: string - primary key value to load the Company Tickets record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotCompanyTicketEntity
    * @method
    * @override
    */
    public async Load(company_id: string, ticket_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'company_id', Value: company_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'ticket_id', Value: ticket_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: company_id
    * * Display Name: Company
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
    * * Description: HubSpot Company hs_object_id
    */
    get company_id(): string {
        return this.Get('company_id');
    }
    set company_id(value: string) {
        this.Set('company_id', value);
    }

    /**
    * * Field Name: ticket_id
    * * Display Name: Ticket
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Tickets (vwTickets.hs_object_id)
    * * Description: HubSpot Ticket hs_object_id
    */
    get ticket_id(): string {
        return this.Get('ticket_id');
    }
    set ticket_id(value: string) {
        this.Set('ticket_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Connections - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: Connection
 * * Base View: vwConnections
 * * @description Networking connections between members including contact info and connection status
 * * Primary Key: ConnectionId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Connections')
export class YourMembershipConnectionEntity extends BaseEntity<YourMembershipConnectionEntityType> {
    /**
    * Loads the Connections record from the database
    * @param ConnectionId: number - primary key value to load the Connections record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipConnectionEntity
    * @method
    * @override
    */
    public async Load(ConnectionId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ConnectionId', Value: ConnectionId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ConnectionId
    * * Display Name: Connection ID
    * * SQL Data Type: int
    */
    get ConnectionId(): number {
        return this.Get('ConnectionId');
    }
    set ConnectionId(value: number) {
        this.Set('ConnectionId', value);
    }

    /**
    * * Field Name: ProfileID
    * * Display Name: Profile
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Member Profiles (vwMemberProfiles.ProfileID)
    */
    get ProfileID(): number | null {
        return this.Get('ProfileID');
    }
    set ProfileID(value: number | null) {
        this.Set('ProfileID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.firstname)
    */
    get FirstName(): string | null {
        return this.Get('FirstName');
    }
    set FirstName(value: string | null) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.lastname)
    */
    get LastName(): string | null {
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(200)
    */
    get Organization(): string | null {
        return this.Get('Organization');
    }
    set Organization(value: string | null) {
        this.Set('Organization', value);
    }

    /**
    * * Field Name: WorkTitle
    * * Display Name: Work Title
    * * SQL Data Type: nvarchar(200)
    */
    get WorkTitle(): string | null {
        return this.Get('WorkTitle');
    }
    set WorkTitle(value: string | null) {
        this.Set('WorkTitle', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(200)
    */
    get City(): string | null {
        return this.Get('City');
    }
    set City(value: string | null) {
        this.Set('City', value);
    }

    /**
    * * Field Name: State
    * * Display Name: State
    * * SQL Data Type: nvarchar(200)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.email)
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(200)
    */
    get Status(): string | null {
        return this.Get('Status');
    }
    set Status(value: string | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Contact Calls - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: ContactCall
 * * Base View: vwContactCalls
 * * @description Associations between contacts and logged calls
 * * Primary Keys: contact_id, call_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Calls')
export class HubSpotContactCallEntity extends BaseEntity<HubSpotContactCallEntityType> {
    /**
    * Loads the Contact Calls record from the database
    * @param contact_id: string - primary key value to load the Contact Calls record.
    * @param call_id: string - primary key value to load the Contact Calls record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotContactCallEntity
    * @method
    * @override
    */
    public async Load(contact_id: string, call_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'contact_id', Value: contact_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'call_id', Value: call_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: contact_id
    * * Display Name: Contact
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
    * * Description: HubSpot Contact hs_object_id
    */
    get contact_id(): string {
        return this.Get('contact_id');
    }
    set contact_id(value: string) {
        this.Set('contact_id', value);
    }

    /**
    * * Field Name: call_id
    * * Display Name: Call
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Calls (vwCalls.hs_object_id)
    * * Description: HubSpot Call hs_object_id
    */
    get call_id(): string {
        return this.Get('call_id');
    }
    set call_id(value: string) {
        this.Set('call_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Contact Companies - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: ContactCompany
 * * Base View: vwContactCompanies
 * * @description Many-to-many associations between contacts and companies
 * * Primary Keys: contact_id, company_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Companies')
export class HubSpotContactCompanyEntity extends BaseEntity<HubSpotContactCompanyEntityType> {
    /**
    * Loads the Contact Companies record from the database
    * @param contact_id: string - primary key value to load the Contact Companies record.
    * @param company_id: string - primary key value to load the Contact Companies record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotContactCompanyEntity
    * @method
    * @override
    */
    public async Load(contact_id: string, company_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'contact_id', Value: contact_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'company_id', Value: company_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: contact_id
    * * Display Name: Contact
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
    * * Description: HubSpot Contact hs_object_id
    */
    get contact_id(): string {
        return this.Get('contact_id');
    }
    set contact_id(value: string) {
        this.Set('contact_id', value);
    }

    /**
    * * Field Name: company_id
    * * Display Name: Company
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
    * * Description: HubSpot Company hs_object_id
    */
    get company_id(): string {
        return this.Get('company_id');
    }
    set company_id(value: string) {
        this.Set('company_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Contact Deals - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: ContactDeal
 * * Base View: vwContactDeals
 * * @description Many-to-many associations between contacts and deals
 * * Primary Keys: contact_id, deal_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Deals')
export class HubSpotContactDealEntity extends BaseEntity<HubSpotContactDealEntityType> {
    /**
    * Loads the Contact Deals record from the database
    * @param contact_id: string - primary key value to load the Contact Deals record.
    * @param deal_id: string - primary key value to load the Contact Deals record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotContactDealEntity
    * @method
    * @override
    */
    public async Load(contact_id: string, deal_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'contact_id', Value: contact_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'deal_id', Value: deal_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: contact_id
    * * Display Name: Contact
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
    * * Description: HubSpot Contact hs_object_id
    */
    get contact_id(): string {
        return this.Get('contact_id');
    }
    set contact_id(value: string) {
        this.Set('contact_id', value);
    }

    /**
    * * Field Name: deal_id
    * * Display Name: Deal
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
    * * Description: HubSpot Deal hs_object_id
    */
    get deal_id(): string {
        return this.Get('deal_id');
    }
    set deal_id(value: string) {
        this.Set('deal_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Label
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Contact Emails - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: ContactEmail
 * * Base View: vwContactEmails
 * * @description Associations between contacts and logged emails
 * * Primary Keys: contact_id, email_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Emails')
export class HubSpotContactEmailEntity extends BaseEntity<HubSpotContactEmailEntityType> {
    /**
    * Loads the Contact Emails record from the database
    * @param contact_id: string - primary key value to load the Contact Emails record.
    * @param email_id: string - primary key value to load the Contact Emails record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotContactEmailEntity
    * @method
    * @override
    */
    public async Load(contact_id: string, email_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'contact_id', Value: contact_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'email_id', Value: email_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: contact_id
    * * Display Name: Contact
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
    * * Description: HubSpot Contact hs_object_id
    */
    get contact_id(): string {
        return this.Get('contact_id');
    }
    set contact_id(value: string) {
        this.Set('contact_id', value);
    }

    /**
    * * Field Name: email_id
    * * Display Name: Email
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Emails (vwEmails.hs_object_id)
    * * Description: HubSpot Email hs_object_id
    */
    get email_id(): string {
        return this.Get('email_id');
    }
    set email_id(value: string) {
        this.Set('email_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Contact Feedback Submissions - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: ContactFeedbackSubmission
 * * Base View: vwContactFeedbackSubmissions
 * * @description Associations between contacts and feedback submissions
 * * Primary Keys: contact_id, feedback_submission_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Feedback Submissions')
export class HubSpotContactFeedbackSubmissionEntity extends BaseEntity<HubSpotContactFeedbackSubmissionEntityType> {
    /**
    * Loads the Contact Feedback Submissions record from the database
    * @param contact_id: string - primary key value to load the Contact Feedback Submissions record.
    * @param feedback_submission_id: string - primary key value to load the Contact Feedback Submissions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotContactFeedbackSubmissionEntity
    * @method
    * @override
    */
    public async Load(contact_id: string, feedback_submission_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'contact_id', Value: contact_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'feedback_submission_id', Value: feedback_submission_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: contact_id
    * * Display Name: Contact
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
    * * Description: HubSpot Contact hs_object_id
    */
    get contact_id(): string {
        return this.Get('contact_id');
    }
    set contact_id(value: string) {
        this.Set('contact_id', value);
    }

    /**
    * * Field Name: feedback_submission_id
    * * Display Name: Feedback Submission
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Feedback Submissions (vwFeedbackSubmissions.hs_object_id)
    * * Description: HubSpot FeedbackSubmission hs_object_id
    */
    get feedback_submission_id(): string {
        return this.Get('feedback_submission_id');
    }
    set feedback_submission_id(value: string) {
        this.Set('feedback_submission_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Contact Meetings - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: ContactMeeting
 * * Base View: vwContactMeetings
 * * @description Associations between contacts and meetings
 * * Primary Keys: contact_id, meeting_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Meetings')
export class HubSpotContactMeetingEntity extends BaseEntity<HubSpotContactMeetingEntityType> {
    /**
    * Loads the Contact Meetings record from the database
    * @param contact_id: string - primary key value to load the Contact Meetings record.
    * @param meeting_id: string - primary key value to load the Contact Meetings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotContactMeetingEntity
    * @method
    * @override
    */
    public async Load(contact_id: string, meeting_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'contact_id', Value: contact_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'meeting_id', Value: meeting_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: contact_id
    * * Display Name: Contact
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
    * * Description: HubSpot Contact hs_object_id
    */
    get contact_id(): string {
        return this.Get('contact_id');
    }
    set contact_id(value: string) {
        this.Set('contact_id', value);
    }

    /**
    * * Field Name: meeting_id
    * * Display Name: Meeting
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Meetings (vwMeetings.hs_object_id)
    * * Description: HubSpot Meeting hs_object_id
    */
    get meeting_id(): string {
        return this.Get('meeting_id');
    }
    set meeting_id(value: string) {
        this.Set('meeting_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Label
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Contact Notes - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: ContactNote
 * * Base View: vwContactNotes
 * * @description Associations between contacts and notes
 * * Primary Keys: contact_id, note_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Notes')
export class HubSpotContactNoteEntity extends BaseEntity<HubSpotContactNoteEntityType> {
    /**
    * Loads the Contact Notes record from the database
    * @param contact_id: string - primary key value to load the Contact Notes record.
    * @param note_id: string - primary key value to load the Contact Notes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotContactNoteEntity
    * @method
    * @override
    */
    public async Load(contact_id: string, note_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'contact_id', Value: contact_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'note_id', Value: note_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: contact_id
    * * Display Name: Contact
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
    * * Description: HubSpot Contact hs_object_id
    */
    get contact_id(): string {
        return this.Get('contact_id');
    }
    set contact_id(value: string) {
        this.Set('contact_id', value);
    }

    /**
    * * Field Name: note_id
    * * Display Name: Note
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Notes (vwNotes.hs_object_id)
    * * Description: HubSpot Note hs_object_id
    */
    get note_id(): string {
        return this.Get('note_id');
    }
    set note_id(value: string) {
        this.Set('note_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Contact Tasks - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: ContactTask
 * * Base View: vwContactTasks
 * * @description Associations between contacts and tasks
 * * Primary Keys: contact_id, task_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Tasks')
export class HubSpotContactTaskEntity extends BaseEntity<HubSpotContactTaskEntityType> {
    /**
    * Loads the Contact Tasks record from the database
    * @param contact_id: string - primary key value to load the Contact Tasks record.
    * @param task_id: string - primary key value to load the Contact Tasks record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotContactTaskEntity
    * @method
    * @override
    */
    public async Load(contact_id: string, task_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'contact_id', Value: contact_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'task_id', Value: task_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: contact_id
    * * Display Name: Contact
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
    * * Description: HubSpot Contact hs_object_id
    */
    get contact_id(): string {
        return this.Get('contact_id');
    }
    set contact_id(value: string) {
        this.Set('contact_id', value);
    }

    /**
    * * Field Name: task_id
    * * Display Name: Task
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Tasks (vwTasks.hs_object_id)
    * * Description: HubSpot Task hs_object_id
    */
    get task_id(): string {
        return this.Get('task_id');
    }
    set task_id(value: string) {
        this.Set('task_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Contact Tickets - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: ContactTicket
 * * Base View: vwContactTickets
 * * @description Many-to-many associations between contacts and support tickets
 * * Primary Keys: contact_id, ticket_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Tickets')
export class HubSpotContactTicketEntity extends BaseEntity<HubSpotContactTicketEntityType> {
    /**
    * Loads the Contact Tickets record from the database
    * @param contact_id: string - primary key value to load the Contact Tickets record.
    * @param ticket_id: string - primary key value to load the Contact Tickets record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotContactTicketEntity
    * @method
    * @override
    */
    public async Load(contact_id: string, ticket_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'contact_id', Value: contact_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'ticket_id', Value: ticket_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: contact_id
    * * Display Name: Contact
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
    * * Description: HubSpot Contact hs_object_id
    */
    get contact_id(): string {
        return this.Get('contact_id');
    }
    set contact_id(value: string) {
        this.Set('contact_id', value);
    }

    /**
    * * Field Name: ticket_id
    * * Display Name: Ticket
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Tickets (vwTickets.hs_object_id)
    * * Description: HubSpot Ticket hs_object_id
    */
    get ticket_id(): string {
        return this.Get('ticket_id');
    }
    set ticket_id(value: string) {
        this.Set('ticket_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Label
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Contacts - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: Contact
 * * Base View: vwContacts
 * * @description CRM contacts with personal, professional, and lifecycle information
 * * Primary Key: hs_object_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contacts')
export class HubSpotContactEntity extends BaseEntity<HubSpotContactEntityType> {
    /**
    * Loads the Contacts record from the database
    * @param hs_object_id: string - primary key value to load the Contacts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotContactEntity
    * @method
    * @override
    */
    public async Load(hs_object_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'hs_object_id', Value: hs_object_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: hs_object_id
    * * Display Name: Contact ID
    * * SQL Data Type: nvarchar(100)
    */
    get hs_object_id(): string {
        return this.Get('hs_object_id');
    }
    set hs_object_id(value: string) {
        this.Set('hs_object_id', value);
    }

    /**
    * * Field Name: email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.EmailAddr)
    */
    get email(): string | null {
        return this.Get('email');
    }
    set email(value: string | null) {
        this.Set('email', value);
    }

    /**
    * * Field Name: firstname
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.FirstName)
    */
    get firstname(): string | null {
        return this.Get('firstname');
    }
    set firstname(value: string | null) {
        this.Set('firstname', value);
    }

    /**
    * * Field Name: lastname
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.LastName)
    */
    get lastname(): string | null {
        return this.Get('lastname');
    }
    set lastname(value: string | null) {
        this.Set('lastname', value);
    }

    /**
    * * Field Name: phone
    * * Display Name: Phone
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.Phone)
    */
    get phone(): string | null {
        return this.Get('phone');
    }
    set phone(value: string | null) {
        this.Set('phone', value);
    }

    /**
    * * Field Name: mobilephone
    * * Display Name: Mobile Phone
    * * SQL Data Type: nvarchar(500)
    */
    get mobilephone(): string | null {
        return this.Get('mobilephone');
    }
    set mobilephone(value: string | null) {
        this.Set('mobilephone', value);
    }

    /**
    * * Field Name: company
    * * Display Name: Company Name
    * * SQL Data Type: nvarchar(500)
    */
    get company(): string | null {
        return this.Get('company');
    }
    set company(value: string | null) {
        this.Set('company', value);
    }

    /**
    * * Field Name: jobtitle
    * * Display Name: Job Title
    * * SQL Data Type: nvarchar(500)
    */
    get jobtitle(): string | null {
        return this.Get('jobtitle');
    }
    set jobtitle(value: string | null) {
        this.Set('jobtitle', value);
    }

    /**
    * * Field Name: lifecyclestage
    * * Display Name: Lifecycle Stage
    * * SQL Data Type: nvarchar(500)
    */
    get lifecyclestage(): string | null {
        return this.Get('lifecyclestage');
    }
    set lifecyclestage(value: string | null) {
        this.Set('lifecyclestage', value);
    }

    /**
    * * Field Name: hs_lead_status
    * * Display Name: Lead Status
    * * SQL Data Type: nvarchar(500)
    */
    get hs_lead_status(): string | null {
        return this.Get('hs_lead_status');
    }
    set hs_lead_status(value: string | null) {
        this.Set('hs_lead_status', value);
    }

    /**
    * * Field Name: address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(500)
    */
    get address(): string | null {
        return this.Get('address');
    }
    set address(value: string | null) {
        this.Set('address', value);
    }

    /**
    * * Field Name: city
    * * Display Name: City
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.City)
    */
    get city(): string | null {
        return this.Get('city');
    }
    set city(value: string | null) {
        this.Set('city', value);
    }

    /**
    * * Field Name: state
    * * Display Name: State / Region
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.State)
    */
    get state(): string | null {
        return this.Get('state');
    }
    set state(value: string | null) {
        this.Set('state', value);
    }

    /**
    * * Field Name: zip
    * * Display Name: Postal Code
    * * SQL Data Type: nvarchar(500)
    */
    get zip(): string | null {
        return this.Get('zip');
    }
    set zip(value: string | null) {
        this.Set('zip', value);
    }

    /**
    * * Field Name: country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.Country)
    */
    get country(): string | null {
        return this.Get('country');
    }
    set country(value: string | null) {
        this.Set('country', value);
    }

    /**
    * * Field Name: website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(1000)
    */
    get website(): string | null {
        return this.Get('website');
    }
    set website(value: string | null) {
        this.Set('website', value);
    }

    /**
    * * Field Name: industry
    * * Display Name: Industry
    * * SQL Data Type: nvarchar(500)
    */
    get industry(): string | null {
        return this.Get('industry');
    }
    set industry(value: string | null) {
        this.Set('industry', value);
    }

    /**
    * * Field Name: annualrevenue
    * * Display Name: Annual Revenue
    * * SQL Data Type: decimal(18, 2)
    */
    get annualrevenue(): number | null {
        return this.Get('annualrevenue');
    }
    set annualrevenue(value: number | null) {
        this.Set('annualrevenue', value);
    }

    /**
    * * Field Name: numberofemployees
    * * Display Name: Number of Employees
    * * SQL Data Type: int
    */
    get numberofemployees(): number | null {
        return this.Get('numberofemployees');
    }
    set numberofemployees(value: number | null) {
        this.Set('numberofemployees', value);
    }

    /**
    * * Field Name: createdate
    * * Display Name: Date Created
    * * SQL Data Type: datetimeoffset
    */
    get createdate(): Date | null {
        return this.Get('createdate');
    }
    set createdate(value: Date | null) {
        this.Set('createdate', value);
    }

    /**
    * * Field Name: lastmodifieddate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get lastmodifieddate(): Date | null {
        return this.Get('lastmodifieddate');
    }
    set lastmodifieddate(value: Date | null) {
        this.Set('lastmodifieddate', value);
    }

    /**
    * * Field Name: associatedcompanyid
    * * Display Name: Associated Company
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Companies (vwCompanies.hs_object_id)
    */
    get associatedcompanyid(): string | null {
        return this.Get('associatedcompanyid');
    }
    set associatedcompanyid(value: string | null) {
        this.Set('associatedcompanyid', value);
    }

    /**
    * * Field Name: notes_last_contacted
    * * Display Name: Last Contacted
    * * SQL Data Type: nvarchar(255)
    */
    get notes_last_contacted(): string | null {
        return this.Get('notes_last_contacted');
    }
    set notes_last_contacted(value: string | null) {
        this.Set('notes_last_contacted', value);
    }

    /**
    * * Field Name: notes_last_updated
    * * Display Name: Activity Last Updated
    * * SQL Data Type: nvarchar(255)
    */
    get notes_last_updated(): string | null {
        return this.Get('notes_last_updated');
    }
    set notes_last_updated(value: string | null) {
        this.Set('notes_last_updated', value);
    }

    /**
    * * Field Name: hs_email_optout
    * * Display Name: Email Opt Out
    * * SQL Data Type: bit
    */
    get hs_email_optout(): boolean | null {
        return this.Get('hs_email_optout');
    }
    set hs_email_optout(value: boolean | null) {
        this.Set('hs_email_optout', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Countries - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: Country
 * * Base View: vwCountries
 * * @description Country reference list with default country designation
 * * Primary Key: countryId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Countries')
export class YourMembershipCountryEntity extends BaseEntity<YourMembershipCountryEntityType> {
    /**
    * Loads the Countries record from the database
    * @param countryId: string - primary key value to load the Countries record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipCountryEntity
    * @method
    * @override
    */
    public async Load(countryId: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'countryId', Value: countryId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: countryId
    * * Display Name: Country ID
    * * SQL Data Type: nvarchar(200)
    */
    get countryId(): string {
        return this.Get('countryId');
    }
    set countryId(value: string) {
        this.Set('countryId', value);
    }

    /**
    * * Field Name: countryName
    * * Display Name: Country Name
    * * SQL Data Type: nvarchar(200)
    */
    get countryName(): string | null {
        return this.Get('countryName');
    }
    set countryName(value: string | null) {
        this.Set('countryName', value);
    }

    /**
    * * Field Name: countryCode
    * * Display Name: Country Code
    * * SQL Data Type: nvarchar(200)
    */
    get countryCode(): string | null {
        return this.Get('countryCode');
    }
    set countryCode(value: string | null) {
        this.Set('countryCode', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Custom Tax Locations - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: CustomTaxLocation
 * * Base View: vwCustomTaxLocations
 * * @description Locations with custom tax rate overrides for commerce transactions
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Custom Tax Locations')
export class YourMembershipCustomTaxLocationEntity extends BaseEntity<YourMembershipCustomTaxLocationEntityType> {
    /**
    * Loads the Custom Tax Locations record from the database
    * @param Id: number - primary key value to load the Custom Tax Locations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipCustomTaxLocationEntity
    * @method
    * @override
    */
    public async Load(Id: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get Id(): number {
        return this.Get('Id');
    }
    set Id(value: number) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: CountryLabel
    * * Display Name: Country Label
    * * SQL Data Type: nvarchar(200)
    */
    get CountryLabel(): string | null {
        return this.Get('CountryLabel');
    }
    set CountryLabel(value: string | null) {
        this.Set('CountryLabel', value);
    }

    /**
    * * Field Name: Location
    * * Display Name: Location
    * * SQL Data Type: nvarchar(200)
    */
    get Location(): string | null {
        return this.Get('Location');
    }
    set Location(value: string | null) {
        this.Set('Location', value);
    }

    /**
    * * Field Name: TaxRate
    * * Display Name: Tax Rate
    * * SQL Data Type: decimal(18, 2)
    */
    get TaxRate(): number | null {
        return this.Get('TaxRate');
    }
    set TaxRate(value: number | null) {
        this.Set('TaxRate', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Deal Calls - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: DealCall
 * * Base View: vwDealCalls
 * * @description Associations between deals and logged calls
 * * Primary Keys: deal_id, call_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Deal Calls')
export class HubSpotDealCallEntity extends BaseEntity<HubSpotDealCallEntityType> {
    /**
    * Loads the Deal Calls record from the database
    * @param deal_id: string - primary key value to load the Deal Calls record.
    * @param call_id: string - primary key value to load the Deal Calls record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotDealCallEntity
    * @method
    * @override
    */
    public async Load(deal_id: string, call_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'deal_id', Value: deal_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'call_id', Value: call_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: deal_id
    * * Display Name: Deal
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
    * * Description: HubSpot Deal hs_object_id
    */
    get deal_id(): string {
        return this.Get('deal_id');
    }
    set deal_id(value: string) {
        this.Set('deal_id', value);
    }

    /**
    * * Field Name: call_id
    * * Display Name: Call
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Calls (vwCalls.hs_object_id)
    * * Description: HubSpot Call hs_object_id
    */
    get call_id(): string {
        return this.Get('call_id');
    }
    set call_id(value: string) {
        this.Set('call_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Deal Emails - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: DealEmail
 * * Base View: vwDealEmails
 * * @description Associations between deals and logged emails
 * * Primary Keys: deal_id, email_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Deal Emails')
export class HubSpotDealEmailEntity extends BaseEntity<HubSpotDealEmailEntityType> {
    /**
    * Loads the Deal Emails record from the database
    * @param deal_id: string - primary key value to load the Deal Emails record.
    * @param email_id: string - primary key value to load the Deal Emails record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotDealEmailEntity
    * @method
    * @override
    */
    public async Load(deal_id: string, email_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'deal_id', Value: deal_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'email_id', Value: email_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: deal_id
    * * Display Name: Deal
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
    * * Description: HubSpot Deal hs_object_id
    */
    get deal_id(): string {
        return this.Get('deal_id');
    }
    set deal_id(value: string) {
        this.Set('deal_id', value);
    }

    /**
    * * Field Name: email_id
    * * Display Name: Email
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Emails (vwEmails.hs_object_id)
    * * Description: HubSpot Email hs_object_id
    */
    get email_id(): string {
        return this.Get('email_id');
    }
    set email_id(value: string) {
        this.Set('email_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Deal Line Items - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: DealLineItem
 * * Base View: vwDealLineItems
 * * @description Many-to-many associations between deals and line items
 * * Primary Keys: deal_id, line_item_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Deal Line Items')
export class HubSpotDealLineItemEntity extends BaseEntity<HubSpotDealLineItemEntityType> {
    /**
    * Loads the Deal Line Items record from the database
    * @param deal_id: string - primary key value to load the Deal Line Items record.
    * @param line_item_id: string - primary key value to load the Deal Line Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotDealLineItemEntity
    * @method
    * @override
    */
    public async Load(deal_id: string, line_item_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'deal_id', Value: deal_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'line_item_id', Value: line_item_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: deal_id
    * * Display Name: Deal
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
    * * Description: HubSpot Deal hs_object_id
    */
    get deal_id(): string {
        return this.Get('deal_id');
    }
    set deal_id(value: string) {
        this.Set('deal_id', value);
    }

    /**
    * * Field Name: line_item_id
    * * Display Name: Line Item
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Line Items (vwLineItems.hs_object_id)
    * * Description: HubSpot LineItem hs_object_id
    */
    get line_item_id(): string {
        return this.Get('line_item_id');
    }
    set line_item_id(value: string) {
        this.Set('line_item_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Deal Meetings - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: DealMeeting
 * * Base View: vwDealMeetings
 * * @description Associations between deals and meetings
 * * Primary Keys: deal_id, meeting_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Deal Meetings')
export class HubSpotDealMeetingEntity extends BaseEntity<HubSpotDealMeetingEntityType> {
    /**
    * Loads the Deal Meetings record from the database
    * @param deal_id: string - primary key value to load the Deal Meetings record.
    * @param meeting_id: string - primary key value to load the Deal Meetings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotDealMeetingEntity
    * @method
    * @override
    */
    public async Load(deal_id: string, meeting_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'deal_id', Value: deal_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'meeting_id', Value: meeting_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: deal_id
    * * Display Name: Deal
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
    * * Description: HubSpot Deal hs_object_id
    */
    get deal_id(): string {
        return this.Get('deal_id');
    }
    set deal_id(value: string) {
        this.Set('deal_id', value);
    }

    /**
    * * Field Name: meeting_id
    * * Display Name: Meeting
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Meetings (vwMeetings.hs_object_id)
    * * Description: HubSpot Meeting hs_object_id
    */
    get meeting_id(): string {
        return this.Get('meeting_id');
    }
    set meeting_id(value: string) {
        this.Set('meeting_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Deal Notes - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: DealNote
 * * Base View: vwDealNotes
 * * @description Associations between deals and notes
 * * Primary Keys: deal_id, note_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Deal Notes')
export class HubSpotDealNoteEntity extends BaseEntity<HubSpotDealNoteEntityType> {
    /**
    * Loads the Deal Notes record from the database
    * @param deal_id: string - primary key value to load the Deal Notes record.
    * @param note_id: string - primary key value to load the Deal Notes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotDealNoteEntity
    * @method
    * @override
    */
    public async Load(deal_id: string, note_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'deal_id', Value: deal_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'note_id', Value: note_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: deal_id
    * * Display Name: Deal
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
    * * Description: HubSpot Deal hs_object_id
    */
    get deal_id(): string {
        return this.Get('deal_id');
    }
    set deal_id(value: string) {
        this.Set('deal_id', value);
    }

    /**
    * * Field Name: note_id
    * * Display Name: Note
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Notes (vwNotes.hs_object_id)
    * * Description: HubSpot Note hs_object_id
    */
    get note_id(): string {
        return this.Get('note_id');
    }
    set note_id(value: string) {
        this.Set('note_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Deal Quotes - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: DealQuote
 * * Base View: vwDealQuotes
 * * @description Many-to-many associations between deals and quotes
 * * Primary Keys: deal_id, quote_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Deal Quotes')
export class HubSpotDealQuoteEntity extends BaseEntity<HubSpotDealQuoteEntityType> {
    /**
    * Loads the Deal Quotes record from the database
    * @param deal_id: string - primary key value to load the Deal Quotes record.
    * @param quote_id: string - primary key value to load the Deal Quotes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotDealQuoteEntity
    * @method
    * @override
    */
    public async Load(deal_id: string, quote_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'deal_id', Value: deal_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'quote_id', Value: quote_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: deal_id
    * * Display Name: Deal
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
    * * Description: HubSpot Deal hs_object_id
    */
    get deal_id(): string {
        return this.Get('deal_id');
    }
    set deal_id(value: string) {
        this.Set('deal_id', value);
    }

    /**
    * * Field Name: quote_id
    * * Display Name: Quote
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Quotes (vwQuotes.hs_object_id)
    * * Description: HubSpot Quote hs_object_id
    */
    get quote_id(): string {
        return this.Get('quote_id');
    }
    set quote_id(value: string) {
        this.Set('quote_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Deal Tasks - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: DealTask
 * * Base View: vwDealTasks
 * * @description Associations between deals and tasks
 * * Primary Keys: deal_id, task_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Deal Tasks')
export class HubSpotDealTaskEntity extends BaseEntity<HubSpotDealTaskEntityType> {
    /**
    * Loads the Deal Tasks record from the database
    * @param deal_id: string - primary key value to load the Deal Tasks record.
    * @param task_id: string - primary key value to load the Deal Tasks record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotDealTaskEntity
    * @method
    * @override
    */
    public async Load(deal_id: string, task_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'deal_id', Value: deal_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'task_id', Value: task_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: deal_id
    * * Display Name: Deal
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Deals (vwDeals.hs_object_id)
    * * Description: HubSpot Deal hs_object_id
    */
    get deal_id(): string {
        return this.Get('deal_id');
    }
    set deal_id(value: string) {
        this.Set('deal_id', value);
    }

    /**
    * * Field Name: task_id
    * * Display Name: Task
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Tasks (vwTasks.hs_object_id)
    * * Description: HubSpot Task hs_object_id
    */
    get task_id(): string {
        return this.Get('task_id');
    }
    set task_id(value: string) {
        this.Set('task_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Deals - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: Deal
 * * Base View: vwDeals
 * * @description Sales deals and opportunities with pipeline and stage tracking
 * * Primary Key: hs_object_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Deals')
export class HubSpotDealEntity extends BaseEntity<HubSpotDealEntityType> {
    /**
    * Loads the Deals record from the database
    * @param hs_object_id: string - primary key value to load the Deals record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotDealEntity
    * @method
    * @override
    */
    public async Load(hs_object_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'hs_object_id', Value: hs_object_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: hs_object_id
    * * Display Name: Deal ID
    * * SQL Data Type: nvarchar(100)
    */
    get hs_object_id(): string {
        return this.Get('hs_object_id');
    }
    set hs_object_id(value: string) {
        this.Set('hs_object_id', value);
    }

    /**
    * * Field Name: dealname
    * * Display Name: Deal Name
    * * SQL Data Type: nvarchar(500)
    */
    get dealname(): string | null {
        return this.Get('dealname');
    }
    set dealname(value: string | null) {
        this.Set('dealname', value);
    }

    /**
    * * Field Name: amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get amount(): number | null {
        return this.Get('amount');
    }
    set amount(value: number | null) {
        this.Set('amount', value);
    }

    /**
    * * Field Name: dealstage
    * * Display Name: Deal Stage
    * * SQL Data Type: nvarchar(500)
    */
    get dealstage(): string | null {
        return this.Get('dealstage');
    }
    set dealstage(value: string | null) {
        this.Set('dealstage', value);
    }

    /**
    * * Field Name: pipeline
    * * Display Name: Pipeline
    * * SQL Data Type: nvarchar(500)
    */
    get pipeline(): string | null {
        return this.Get('pipeline');
    }
    set pipeline(value: string | null) {
        this.Set('pipeline', value);
    }

    /**
    * * Field Name: closedate
    * * Display Name: Close Date
    * * SQL Data Type: datetimeoffset
    */
    get closedate(): Date | null {
        return this.Get('closedate');
    }
    set closedate(value: Date | null) {
        this.Set('closedate', value);
    }

    /**
    * * Field Name: createdate
    * * Display Name: Created Date
    * * SQL Data Type: datetimeoffset
    */
    get createdate(): Date | null {
        return this.Get('createdate');
    }
    set createdate(value: Date | null) {
        this.Set('createdate', value);
    }

    /**
    * * Field Name: hs_lastmodifieddate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get hs_lastmodifieddate(): Date | null {
        return this.Get('hs_lastmodifieddate');
    }
    set hs_lastmodifieddate(value: Date | null) {
        this.Set('hs_lastmodifieddate', value);
    }

    /**
    * * Field Name: dealtype
    * * Display Name: Deal Type
    * * SQL Data Type: nvarchar(500)
    */
    get dealtype(): string | null {
        return this.Get('dealtype');
    }
    set dealtype(value: string | null) {
        this.Set('dealtype', value);
    }

    /**
    * * Field Name: description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get description(): string | null {
        return this.Get('description');
    }
    set description(value: string | null) {
        this.Set('description', value);
    }

    /**
    * * Field Name: hs_deal_stage_probability
    * * Display Name: Stage Probability
    * * SQL Data Type: decimal(18, 2)
    */
    get hs_deal_stage_probability(): number | null {
        return this.Get('hs_deal_stage_probability');
    }
    set hs_deal_stage_probability(value: number | null) {
        this.Set('hs_deal_stage_probability', value);
    }

    /**
    * * Field Name: hs_projected_amount
    * * Display Name: Projected Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get hs_projected_amount(): number | null {
        return this.Get('hs_projected_amount');
    }
    set hs_projected_amount(value: number | null) {
        this.Set('hs_projected_amount', value);
    }

    /**
    * * Field Name: hs_priority
    * * Display Name: Priority
    * * SQL Data Type: nvarchar(500)
    */
    get hs_priority(): string | null {
        return this.Get('hs_priority');
    }
    set hs_priority(value: string | null) {
        this.Set('hs_priority', value);
    }

    /**
    * * Field Name: hubspot_owner_id
    * * Display Name: Owner
    * * SQL Data Type: nvarchar(100)
    */
    get hubspot_owner_id(): string | null {
        return this.Get('hubspot_owner_id');
    }
    set hubspot_owner_id(value: string | null) {
        this.Set('hubspot_owner_id', value);
    }

    /**
    * * Field Name: notes_last_contacted
    * * Display Name: Last Contacted
    * * SQL Data Type: nvarchar(255)
    */
    get notes_last_contacted(): string | null {
        return this.Get('notes_last_contacted');
    }
    set notes_last_contacted(value: string | null) {
        this.Set('notes_last_contacted', value);
    }

    /**
    * * Field Name: num_associated_contacts
    * * Display Name: Associated Contacts
    * * SQL Data Type: int
    */
    get num_associated_contacts(): number | null {
        return this.Get('num_associated_contacts');
    }
    set num_associated_contacts(value: number | null) {
        this.Set('num_associated_contacts', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Donation Funds - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: DonationFund
 * * Base View: vwDonationFunds
 * * @description Donation fund definitions for directing charitable contributions
 * * Primary Key: fundId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Donation Funds')
export class YourMembershipDonationFundEntity extends BaseEntity<YourMembershipDonationFundEntityType> {
    /**
    * Loads the Donation Funds record from the database
    * @param fundId: number - primary key value to load the Donation Funds record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipDonationFundEntity
    * @method
    * @override
    */
    public async Load(fundId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'fundId', Value: fundId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: fundId
    * * Display Name: Fund ID
    * * SQL Data Type: int
    */
    get fundId(): number {
        return this.Get('fundId');
    }
    set fundId(value: number) {
        this.Set('fundId', value);
    }

    /**
    * * Field Name: fundName
    * * Display Name: Fund Name
    * * SQL Data Type: nvarchar(200)
    */
    get fundName(): string | null {
        return this.Get('fundName');
    }
    set fundName(value: string | null) {
        this.Set('fundName', value);
    }

    /**
    * * Field Name: fundOptionsCount
    * * Display Name: Options Count
    * * SQL Data Type: int
    */
    get fundOptionsCount(): number | null {
        return this.Get('fundOptionsCount');
    }
    set fundOptionsCount(value: number | null) {
        this.Set('fundOptionsCount', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Donation Histories - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: DonationHistory
 * * Base View: vwDonationHistories
 * * @description Individual donation records per member with amounts, funds, and payment methods
 * * Primary Key: intDonationId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Donation Histories')
export class YourMembershipDonationHistoryEntity extends BaseEntity<YourMembershipDonationHistoryEntityType> {
    /**
    * Loads the Donation Histories record from the database
    * @param intDonationId: number - primary key value to load the Donation Histories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipDonationHistoryEntity
    * @method
    * @override
    */
    public async Load(intDonationId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'intDonationId', Value: intDonationId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: intDonationId
    * * Display Name: Donation ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Donation Transactions (vwDonationTransactions.TransactionID)
    */
    get intDonationId(): number {
        return this.Get('intDonationId');
    }
    set intDonationId(value: number) {
        this.Set('intDonationId', value);
    }

    /**
    * * Field Name: ProfileID
    * * Display Name: Profile
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Member Profiles (vwMemberProfiles.ProfileID)
    */
    get ProfileID(): number | null {
        return this.Get('ProfileID');
    }
    set ProfileID(value: number | null) {
        this.Set('ProfileID', value);
    }

    /**
    * * Field Name: DatDonation
    * * Display Name: Donation Date
    * * SQL Data Type: datetimeoffset
    */
    get DatDonation(): Date | null {
        return this.Get('DatDonation');
    }
    set DatDonation(value: Date | null) {
        this.Set('DatDonation', value);
    }

    /**
    * * Field Name: dblDonation
    * * Display Name: Donation Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get dblDonation(): number | null {
        return this.Get('dblDonation');
    }
    set dblDonation(value: number | null) {
        this.Set('dblDonation', value);
    }

    /**
    * * Field Name: strStatus
    * * Display Name: Status
    * * SQL Data Type: nvarchar(200)
    */
    get strStatus(): string | null {
        return this.Get('strStatus');
    }
    set strStatus(value: string | null) {
        this.Set('strStatus', value);
    }

    /**
    * * Field Name: strFundName
    * * Display Name: Fund Name
    * * SQL Data Type: nvarchar(200)
    */
    get strFundName(): string | null {
        return this.Get('strFundName');
    }
    set strFundName(value: string | null) {
        this.Set('strFundName', value);
    }

    /**
    * * Field Name: strDonorName
    * * Display Name: Donor Name
    * * SQL Data Type: nvarchar(200)
    */
    get strDonorName(): string | null {
        return this.Get('strDonorName');
    }
    set strDonorName(value: string | null) {
        this.Set('strDonorName', value);
    }

    /**
    * * Field Name: strPaymentMethod
    * * Display Name: Payment Method
    * * SQL Data Type: nvarchar(200)
    */
    get strPaymentMethod(): string | null {
        return this.Get('strPaymentMethod');
    }
    set strPaymentMethod(value: string | null) {
        this.Set('strPaymentMethod', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Donation Transactions - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: DonationTransaction
 * * Base View: vwDonationTransactions
 * * @description Donation payment transactions with member, fund, and payment details. DateFrom must be within 90 days.
 * * Primary Key: TransactionID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Donation Transactions')
export class YourMembershipDonationTransactionEntity extends BaseEntity<YourMembershipDonationTransactionEntityType> {
    /**
    * Loads the Donation Transactions record from the database
    * @param TransactionID: number - primary key value to load the Donation Transactions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipDonationTransactionEntity
    * @method
    * @override
    */
    public async Load(TransactionID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'TransactionID', Value: TransactionID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: TransactionID
    * * Display Name: Transaction ID
    * * SQL Data Type: int
    */
    get TransactionID(): number {
        return this.Get('TransactionID');
    }
    set TransactionID(value: number) {
        this.Set('TransactionID', value);
    }

    /**
    * * Field Name: WebsiteMemberID
    * * Display Name: Website Member
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)
    */
    get WebsiteMemberID(): number | null {
        return this.Get('WebsiteMemberID');
    }
    set WebsiteMemberID(value: number | null) {
        this.Set('WebsiteMemberID', value);
    }

    /**
    * * Field Name: ConstituentID
    * * Display Name: Constituent
    * * SQL Data Type: nvarchar(200)
    */
    get ConstituentID(): string | null {
        return this.Get('ConstituentID');
    }
    set ConstituentID(value: string | null) {
        this.Set('ConstituentID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.firstname)
    */
    get FirstName(): string | null {
        return this.Get('FirstName');
    }
    set FirstName(value: string | null) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.lastname)
    */
    get LastName(): string | null {
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get Amount(): number | null {
        return this.Get('Amount');
    }
    set Amount(value: number | null) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: FundName
    * * Display Name: Fund Name
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Donation Funds (vwDonationFunds.fundName)
    */
    get FundName(): string | null {
        return this.Get('FundName');
    }
    set FundName(value: string | null) {
        this.Set('FundName', value);
    }

    /**
    * * Field Name: DateSubmitted
    * * Display Name: Date Submitted
    * * SQL Data Type: datetimeoffset
    */
    get DateSubmitted(): Date | null {
        return this.Get('DateSubmitted');
    }
    set DateSubmitted(value: Date | null) {
        this.Set('DateSubmitted', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(200)
    */
    get Status(): string | null {
        return this.Get('Status');
    }
    set Status(value: string | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: PaymentType
    * * Display Name: Payment Type
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentType(): string | null {
        return this.Get('PaymentType');
    }
    set PaymentType(value: string | null) {
        this.Set('PaymentType', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Dues Rules - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: DuesRule
 * * Base View: vwDuesRules
 * * @description Dues calculation rules with names, descriptions, and amount modifiers
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Dues Rules')
export class YourMembershipDuesRuleEntity extends BaseEntity<YourMembershipDuesRuleEntityType> {
    /**
    * Loads the Dues Rules record from the database
    * @param ID: number - primary key value to load the Dues Rules record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipDuesRuleEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get Amount(): number | null {
        return this.Get('Amount');
    }
    set Amount(value: number | null) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: Selected
    * * Display Name: Selected
    * * SQL Data Type: bit
    */
    get Selected(): boolean | null {
        return this.Get('Selected');
    }
    set Selected(value: boolean | null) {
        this.Set('Selected', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Dues Transactions - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: DuesTransaction
 * * Base View: vwDuesTransactions
 * * @description Membership dues payment transactions with status, amounts, and membership details
 * * Primary Key: TransactionID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Dues Transactions')
export class YourMembershipDuesTransactionEntity extends BaseEntity<YourMembershipDuesTransactionEntityType> {
    /**
    * Loads the Dues Transactions record from the database
    * @param TransactionID: number - primary key value to load the Dues Transactions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipDuesTransactionEntity
    * @method
    * @override
    */
    public async Load(TransactionID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'TransactionID', Value: TransactionID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: TransactionID
    * * Display Name: Transaction ID
    * * SQL Data Type: int
    */
    get TransactionID(): number {
        return this.Get('TransactionID');
    }
    set TransactionID(value: number) {
        this.Set('TransactionID', value);
    }

    /**
    * * Field Name: InvoiceNumber
    * * Display Name: Invoice Number
    * * SQL Data Type: int
    */
    get InvoiceNumber(): number | null {
        return this.Get('InvoiceNumber');
    }
    set InvoiceNumber(value: number | null) {
        this.Set('InvoiceNumber', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(200)
    */
    get Status(): string | null {
        return this.Get('Status');
    }
    set Status(value: string | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: WebsiteMemberID
    * * Display Name: Website Member ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)
    */
    get WebsiteMemberID(): number | null {
        return this.Get('WebsiteMemberID');
    }
    set WebsiteMemberID(value: number | null) {
        this.Set('WebsiteMemberID', value);
    }

    /**
    * * Field Name: ConstituentID
    * * Display Name: Constituent ID
    * * SQL Data Type: nvarchar(200)
    */
    get ConstituentID(): string | null {
        return this.Get('ConstituentID');
    }
    set ConstituentID(value: string | null) {
        this.Set('ConstituentID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.firstname)
    */
    get FirstName(): string | null {
        return this.Get('FirstName');
    }
    set FirstName(value: string | null) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.lastname)
    */
    get LastName(): string | null {
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.email)
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(200)
    */
    get Organization(): string | null {
        return this.Get('Organization');
    }
    set Organization(value: string | null) {
        this.Set('Organization', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get Amount(): number | null {
        return this.Get('Amount');
    }
    set Amount(value: number | null) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: BalanceDue
    * * Display Name: Balance Due
    * * SQL Data Type: decimal(18, 2)
    */
    get BalanceDue(): number | null {
        return this.Get('BalanceDue');
    }
    set BalanceDue(value: number | null) {
        this.Set('BalanceDue', value);
    }

    /**
    * * Field Name: PaymentType
    * * Display Name: Payment Type
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentType(): string | null {
        return this.Get('PaymentType');
    }
    set PaymentType(value: string | null) {
        this.Set('PaymentType', value);
    }

    /**
    * * Field Name: DateSubmitted
    * * Display Name: Date Submitted
    * * SQL Data Type: datetimeoffset
    */
    get DateSubmitted(): Date | null {
        return this.Get('DateSubmitted');
    }
    set DateSubmitted(value: Date | null) {
        this.Set('DateSubmitted', value);
    }

    /**
    * * Field Name: DateProcessed
    * * Display Name: Date Processed
    * * SQL Data Type: datetimeoffset
    */
    get DateProcessed(): Date | null {
        return this.Get('DateProcessed');
    }
    set DateProcessed(value: Date | null) {
        this.Set('DateProcessed', value);
    }

    /**
    * * Field Name: MembershipRequested
    * * Display Name: Membership Requested
    * * SQL Data Type: nvarchar(200)
    */
    get MembershipRequested(): string | null {
        return this.Get('MembershipRequested');
    }
    set MembershipRequested(value: string | null) {
        this.Set('MembershipRequested', value);
    }

    /**
    * * Field Name: CurrentMembership
    * * Display Name: Current Membership
    * * SQL Data Type: nvarchar(200)
    */
    get CurrentMembership(): string | null {
        return this.Get('CurrentMembership');
    }
    set CurrentMembership(value: string | null) {
        this.Set('CurrentMembership', value);
    }

    /**
    * * Field Name: CurrentMembershipExpDate
    * * Display Name: Current Membership Expiration Date
    * * SQL Data Type: datetimeoffset
    */
    get CurrentMembershipExpDate(): Date | null {
        return this.Get('CurrentMembershipExpDate');
    }
    set CurrentMembershipExpDate(value: Date | null) {
        this.Set('CurrentMembershipExpDate', value);
    }

    /**
    * * Field Name: MemberType
    * * Display Name: Member Type
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Member Types (vwMemberTypes.TypeCode)
    */
    get MemberType(): string | null {
        return this.Get('MemberType');
    }
    set MemberType(value: string | null) {
        this.Set('MemberType', value);
    }

    /**
    * * Field Name: DateMemberSignup
    * * Display Name: Date Member Signup
    * * SQL Data Type: datetimeoffset
    */
    get DateMemberSignup(): Date | null {
        return this.Get('DateMemberSignup');
    }
    set DateMemberSignup(value: Date | null) {
        this.Set('DateMemberSignup', value);
    }

    /**
    * * Field Name: InvoiceDate
    * * Display Name: Invoice Date
    * * SQL Data Type: datetimeoffset
    */
    get InvoiceDate(): Date | null {
        return this.Get('InvoiceDate');
    }
    set InvoiceDate(value: Date | null) {
        this.Set('InvoiceDate', value);
    }

    /**
    * * Field Name: ClosedBy
    * * Display Name: Closed By
    * * SQL Data Type: nvarchar(200)
    */
    get ClosedBy(): string | null {
        return this.Get('ClosedBy');
    }
    set ClosedBy(value: string | null) {
        this.Set('ClosedBy', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Email Suppression Lists - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: EmailSuppressionList
 * * Base View: vwEmailSuppressionLists
 * * @description Email addresses suppressed from delivery with bounce counts and health rates
 * * Primary Key: Email
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Email Suppression Lists')
export class YourMembershipEmailSuppressionListEntity extends BaseEntity<YourMembershipEmailSuppressionListEntityType> {
    /**
    * Loads the Email Suppression Lists record from the database
    * @param Email: string - primary key value to load the Email Suppression Lists record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipEmailSuppressionListEntity
    * @method
    * @override
    */
    public async Load(Email: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Email', Value: Email });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.email)
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: SuppressionType
    * * Display Name: Suppression Type
    * * SQL Data Type: nvarchar(200)
    */
    get SuppressionType(): string | null {
        return this.Get('SuppressionType');
    }
    set SuppressionType(value: string | null) {
        this.Set('SuppressionType', value);
    }

    /**
    * * Field Name: BounceCount
    * * Display Name: Bounce Count
    * * SQL Data Type: int
    */
    get BounceCount(): number | null {
        return this.Get('BounceCount');
    }
    set BounceCount(value: number | null) {
        this.Set('BounceCount', value);
    }

    /**
    * * Field Name: HealthRate
    * * Display Name: Health Rate
    * * SQL Data Type: decimal(18, 2)
    */
    get HealthRate(): number | null {
        return this.Get('HealthRate');
    }
    set HealthRate(value: number | null) {
        this.Set('HealthRate', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Emails - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: Email
 * * Base View: vwEmails
 * * @description Logged email activities with sender, recipient, and content details
 * * Primary Key: hs_object_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Emails')
export class HubSpotEmailEntity extends BaseEntity<HubSpotEmailEntityType> {
    /**
    * Loads the Emails record from the database
    * @param hs_object_id: string - primary key value to load the Emails record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotEmailEntity
    * @method
    * @override
    */
    public async Load(hs_object_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'hs_object_id', Value: hs_object_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: hs_object_id
    * * Display Name: Email ID
    * * SQL Data Type: nvarchar(100)
    */
    get hs_object_id(): string {
        return this.Get('hs_object_id');
    }
    set hs_object_id(value: string) {
        this.Set('hs_object_id', value);
    }

    /**
    * * Field Name: hs_email_subject
    * * Display Name: Subject
    * * SQL Data Type: nvarchar(500)
    */
    get hs_email_subject(): string | null {
        return this.Get('hs_email_subject');
    }
    set hs_email_subject(value: string | null) {
        this.Set('hs_email_subject', value);
    }

    /**
    * * Field Name: hs_email_text
    * * Display Name: Email Text
    * * SQL Data Type: nvarchar(MAX)
    */
    get hs_email_text(): string | null {
        return this.Get('hs_email_text');
    }
    set hs_email_text(value: string | null) {
        this.Set('hs_email_text', value);
    }

    /**
    * * Field Name: hs_email_html
    * * Display Name: Email HTML
    * * SQL Data Type: nvarchar(255)
    */
    get hs_email_html(): string | null {
        return this.Get('hs_email_html');
    }
    set hs_email_html(value: string | null) {
        this.Set('hs_email_html', value);
    }

    /**
    * * Field Name: hs_email_status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(500)
    */
    get hs_email_status(): string | null {
        return this.Get('hs_email_status');
    }
    set hs_email_status(value: string | null) {
        this.Set('hs_email_status', value);
    }

    /**
    * * Field Name: hs_email_direction
    * * Display Name: Direction
    * * SQL Data Type: nvarchar(500)
    */
    get hs_email_direction(): string | null {
        return this.Get('hs_email_direction');
    }
    set hs_email_direction(value: string | null) {
        this.Set('hs_email_direction', value);
    }

    /**
    * * Field Name: hs_email_sender_email
    * * Display Name: Sender Email
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.EmailAddr)
    */
    get hs_email_sender_email(): string | null {
        return this.Get('hs_email_sender_email');
    }
    set hs_email_sender_email(value: string | null) {
        this.Set('hs_email_sender_email', value);
    }

    /**
    * * Field Name: hs_email_sender_firstname
    * * Display Name: Sender First Name
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.FirstName)
    */
    get hs_email_sender_firstname(): string | null {
        return this.Get('hs_email_sender_firstname');
    }
    set hs_email_sender_firstname(value: string | null) {
        this.Set('hs_email_sender_firstname', value);
    }

    /**
    * * Field Name: hs_email_sender_lastname
    * * Display Name: Sender Last Name
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.LastName)
    */
    get hs_email_sender_lastname(): string | null {
        return this.Get('hs_email_sender_lastname');
    }
    set hs_email_sender_lastname(value: string | null) {
        this.Set('hs_email_sender_lastname', value);
    }

    /**
    * * Field Name: hs_email_to_email
    * * Display Name: Recipient Email
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.EmailAddr)
    */
    get hs_email_to_email(): string | null {
        return this.Get('hs_email_to_email');
    }
    set hs_email_to_email(value: string | null) {
        this.Set('hs_email_to_email', value);
    }

    /**
    * * Field Name: hubspot_owner_id
    * * Display Name: HubSpot Owner
    * * SQL Data Type: nvarchar(100)
    */
    get hubspot_owner_id(): string | null {
        return this.Get('hubspot_owner_id');
    }
    set hubspot_owner_id(value: string | null) {
        this.Set('hubspot_owner_id', value);
    }

    /**
    * * Field Name: hs_timestamp
    * * Display Name: Email Timestamp
    * * SQL Data Type: datetimeoffset
    */
    get hs_timestamp(): Date | null {
        return this.Get('hs_timestamp');
    }
    set hs_timestamp(value: Date | null) {
        this.Set('hs_timestamp', value);
    }

    /**
    * * Field Name: createdate
    * * Display Name: HubSpot Created Date
    * * SQL Data Type: datetimeoffset
    */
    get createdate(): Date | null {
        return this.Get('createdate');
    }
    set createdate(value: Date | null) {
        this.Set('createdate', value);
    }

    /**
    * * Field Name: hs_lastmodifieddate
    * * Display Name: HubSpot Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get hs_lastmodifieddate(): Date | null {
        return this.Get('hs_lastmodifieddate');
    }
    set hs_lastmodifieddate(value: Date | null) {
        this.Set('hs_lastmodifieddate', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Engagement Scores - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: EngagementScore
 * * Base View: vwEngagementScores
 * * @description Member engagement scoring metrics tracking participation and activity levels
 * * Primary Key: ProfileID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Engagement Scores')
export class YourMembershipEngagementScoreEntity extends BaseEntity<YourMembershipEngagementScoreEntityType> {
    /**
    * Loads the Engagement Scores record from the database
    * @param ProfileID: number - primary key value to load the Engagement Scores record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipEngagementScoreEntity
    * @method
    * @override
    */
    public async Load(ProfileID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ProfileID', Value: ProfileID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ProfileID
    * * Display Name: Profile
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Member Profiles (vwMemberProfiles.ProfileID)
    */
    get ProfileID(): number {
        return this.Get('ProfileID');
    }
    set ProfileID(value: number) {
        this.Set('ProfileID', value);
    }

    /**
    * * Field Name: EngagementScore
    * * Display Name: Engagement Score
    * * SQL Data Type: decimal(18, 2)
    */
    get EngagementScore(): number | null {
        return this.Get('EngagementScore');
    }
    set EngagementScore(value: number | null) {
        this.Set('EngagementScore', value);
    }

    /**
    * * Field Name: LastUpdated
    * * Display Name: Last Updated
    * * SQL Data Type: datetimeoffset
    */
    get LastUpdated(): Date | null {
        return this.Get('LastUpdated');
    }
    set LastUpdated(value: Date | null) {
        this.Set('LastUpdated', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Event Attendee Types - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: EventAttendeeType
 * * Base View: vwEventAttendeeTypes
 * * @description Attendee type definitions per event (e.g., Member, Non-Member, Speaker)
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Event Attendee Types')
export class YourMembershipEventAttendeeTypeEntity extends BaseEntity<YourMembershipEventAttendeeTypeEntityType> {
    /**
    * Loads the Event Attendee Types record from the database
    * @param Id: number - primary key value to load the Event Attendee Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipEventAttendeeTypeEntity
    * @method
    * @override
    */
    public async Load(Id: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get Id(): number {
        return this.Get('Id');
    }
    set Id(value: number) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: EventId
    * * Display Name: Event
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Events (vwEvents.EventId)
    */
    get EventId(): number | null {
        return this.Get('EventId');
    }
    set EventId(value: number | null) {
        this.Set('EventId', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Active
    * * Display Name: Active
    * * SQL Data Type: bit
    */
    get Active(): boolean | null {
        return this.Get('Active');
    }
    set Active(value: boolean | null) {
        this.Set('Active', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Event Categories - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: EventCategory
 * * Base View: vwEventCategories
 * * @description Categories for organizing and classifying events
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Event Categories')
export class YourMembershipEventCategoryEntity extends BaseEntity<YourMembershipEventCategoryEntityType> {
    /**
    * Loads the Event Categories record from the database
    * @param Id: number - primary key value to load the Event Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipEventCategoryEntity
    * @method
    * @override
    */
    public async Load(Id: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get Id(): number {
        return this.Get('Id');
    }
    set Id(value: number) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Event CEU Awards - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: EventCEUAward
 * * Base View: vwEventCEUAwards
 * * @description Continuing education credit awards linked to events and certifications
 * * Primary Key: AwardID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Event CEU Awards')
export class YourMembershipEventCEUAwardEntity extends BaseEntity<YourMembershipEventCEUAwardEntityType> {
    /**
    * Loads the Event CEU Awards record from the database
    * @param AwardID: number - primary key value to load the Event CEU Awards record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipEventCEUAwardEntity
    * @method
    * @override
    */
    public async Load(AwardID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'AwardID', Value: AwardID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: AwardID
    * * Display Name: Award ID
    * * SQL Data Type: int
    */
    get AwardID(): number {
        return this.Get('AwardID');
    }
    set AwardID(value: number) {
        this.Set('AwardID', value);
    }

    /**
    * * Field Name: EventId
    * * Display Name: Event
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Events (vwEvents.EventId)
    */
    get EventId(): number | null {
        return this.Get('EventId');
    }
    set EventId(value: number | null) {
        this.Set('EventId', value);
    }

    /**
    * * Field Name: CertificationID
    * * Display Name: Certification
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Certifications (vwCertifications.CertificationID)
    */
    get CertificationID(): string | null {
        return this.Get('CertificationID');
    }
    set CertificationID(value: string | null) {
        this.Set('CertificationID', value);
    }

    /**
    * * Field Name: CreditTypeID
    * * Display Name: Credit Type
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Certification Credit Types (vwCertificationCreditTypes.ID)
    */
    get CreditTypeID(): number | null {
        return this.Get('CreditTypeID');
    }
    set CreditTypeID(value: number | null) {
        this.Set('CreditTypeID', value);
    }

    /**
    * * Field Name: Credits
    * * Display Name: Credits
    * * SQL Data Type: decimal(18, 2)
    */
    get Credits(): number | null {
        return this.Get('Credits');
    }
    set Credits(value: number | null) {
        this.Set('Credits', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Event IDs - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: EventID
 * * Base View: vwEventIDs
 * * @description Lightweight event identifier list for sync with last-modified date filtering
 * * Primary Key: EventId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Event IDs')
export class YourMembershipEventIDEntity extends BaseEntity<YourMembershipEventIDEntityType> {
    /**
    * Loads the Event IDs record from the database
    * @param EventId: number - primary key value to load the Event IDs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipEventIDEntity
    * @method
    * @override
    */
    public async Load(EventId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'EventId', Value: EventId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: EventId
    * * Display Name: Event ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Events (vwEvents.EventId)
    */
    get EventId(): number {
        return this.Get('EventId');
    }
    set EventId(value: number) {
        this.Set('EventId', value);
    }

    /**
    * * Field Name: LastModifiedDate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get LastModifiedDate(): Date | null {
        return this.Get('LastModifiedDate');
    }
    set LastModifiedDate(value: Date | null) {
        this.Set('LastModifiedDate', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Event Registration Forms - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: EventRegistrationForm
 * * Base View: vwEventRegistrationForms
 * * @description Registration form definitions for events with auto-approval settings
 * * Primary Key: FormId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Event Registration Forms')
export class YourMembershipEventRegistrationFormEntity extends BaseEntity<YourMembershipEventRegistrationFormEntityType> {
    /**
    * Loads the Event Registration Forms record from the database
    * @param FormId: number - primary key value to load the Event Registration Forms record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipEventRegistrationFormEntity
    * @method
    * @override
    */
    public async Load(FormId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'FormId', Value: FormId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: FormId
    * * Display Name: Form ID
    * * SQL Data Type: int
    */
    get FormId(): number {
        return this.Get('FormId');
    }
    set FormId(value: number) {
        this.Set('FormId', value);
    }

    /**
    * * Field Name: FormName
    * * Display Name: Form Name
    * * SQL Data Type: nvarchar(200)
    */
    get FormName(): string | null {
        return this.Get('FormName');
    }
    set FormName(value: string | null) {
        this.Set('FormName', value);
    }

    /**
    * * Field Name: AutoApprove
    * * Display Name: Auto Approve
    * * SQL Data Type: bit
    */
    get AutoApprove(): boolean | null {
        return this.Get('AutoApprove');
    }
    set AutoApprove(value: boolean | null) {
        this.Set('AutoApprove', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Event Registrations - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: EventRegistration
 * * Base View: vwEventRegistrations
 * * @description Event registration records with attendee details, status, badge numbers, and attendance tracking
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Event Registrations')
export class YourMembershipEventRegistrationEntity extends BaseEntity<YourMembershipEventRegistrationEntityType> {
    /**
    * Loads the Event Registrations record from the database
    * @param Id: number - primary key value to load the Event Registrations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipEventRegistrationEntity
    * @method
    * @override
    */
    public async Load(Id: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get Id(): number {
        return this.Get('Id');
    }
    set Id(value: number) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: EventId
    * * Display Name: Event
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Events (vwEvents.EventId)
    */
    get EventId(): number | null {
        return this.Get('EventId');
    }
    set EventId(value: number | null) {
        this.Set('EventId', value);
    }

    /**
    * * Field Name: RegistrationID
    * * Display Name: Registration ID
    * * SQL Data Type: nvarchar(200)
    */
    get RegistrationID(): string | null {
        return this.Get('RegistrationID');
    }
    set RegistrationID(value: string | null) {
        this.Set('RegistrationID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.firstname)
    */
    get FirstName(): string | null {
        return this.Get('FirstName');
    }
    set FirstName(value: string | null) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.lastname)
    */
    get LastName(): string | null {
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: DisplayName
    * * Display Name: Display Name
    * * SQL Data Type: nvarchar(200)
    */
    get DisplayName(): string | null {
        return this.Get('DisplayName');
    }
    set DisplayName(value: string | null) {
        this.Set('DisplayName', value);
    }

    /**
    * * Field Name: HeadShotImage
    * * Display Name: Headshot Image
    * * SQL Data Type: nvarchar(500)
    */
    get HeadShotImage(): string | null {
        return this.Get('HeadShotImage');
    }
    set HeadShotImage(value: string | null) {
        this.Set('HeadShotImage', value);
    }

    /**
    * * Field Name: DateRegistered
    * * Display Name: Date Registered
    * * SQL Data Type: datetimeoffset
    */
    get DateRegistered(): Date | null {
        return this.Get('DateRegistered');
    }
    set DateRegistered(value: Date | null) {
        this.Set('DateRegistered', value);
    }

    /**
    * * Field Name: IsPrimary
    * * Display Name: Is Primary
    * * SQL Data Type: bit
    */
    get IsPrimary(): boolean | null {
        return this.Get('IsPrimary');
    }
    set IsPrimary(value: boolean | null) {
        this.Set('IsPrimary', value);
    }

    /**
    * * Field Name: BadgeNumber
    * * Display Name: Badge Number
    * * SQL Data Type: int
    */
    get BadgeNumber(): number | null {
        return this.Get('BadgeNumber');
    }
    set BadgeNumber(value: number | null) {
        this.Set('BadgeNumber', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Event Session Groups - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: EventSessionGroup
 * * Base View: vwEventSessionGroups
 * * @description Logical groupings of sessions within events (e.g., tracks, time slots)
 * * Primary Key: SessionGroupId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Event Session Groups')
export class YourMembershipEventSessionGroupEntity extends BaseEntity<YourMembershipEventSessionGroupEntityType> {
    /**
    * Loads the Event Session Groups record from the database
    * @param SessionGroupId: number - primary key value to load the Event Session Groups record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipEventSessionGroupEntity
    * @method
    * @override
    */
    public async Load(SessionGroupId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'SessionGroupId', Value: SessionGroupId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: SessionGroupId
    * * Display Name: Session Group ID
    * * SQL Data Type: int
    */
    get SessionGroupId(): number {
        return this.Get('SessionGroupId');
    }
    set SessionGroupId(value: number) {
        this.Set('SessionGroupId', value);
    }

    /**
    * * Field Name: EventId
    * * Display Name: Event
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Events (vwEvents.EventId)
    */
    get EventId(): number | null {
        return this.Get('EventId');
    }
    set EventId(value: number | null) {
        this.Set('EventId', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Event Sessions - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: EventSession
 * * Base View: vwEventSessions
 * * @description Breakout sessions within events including presenter, schedule, and CEU eligibility
 * * Primary Key: SessionId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Event Sessions')
export class YourMembershipEventSessionEntity extends BaseEntity<YourMembershipEventSessionEntityType> {
    /**
    * Loads the Event Sessions record from the database
    * @param SessionId: number - primary key value to load the Event Sessions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipEventSessionEntity
    * @method
    * @override
    */
    public async Load(SessionId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'SessionId', Value: SessionId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: SessionId
    * * Display Name: Session ID
    * * SQL Data Type: int
    */
    get SessionId(): number {
        return this.Get('SessionId');
    }
    set SessionId(value: number) {
        this.Set('SessionId', value);
    }

    /**
    * * Field Name: EventId
    * * Display Name: Event
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Events (vwEvents.EventId)
    */
    get EventId(): number | null {
        return this.Get('EventId');
    }
    set EventId(value: number | null) {
        this.Set('EventId', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Session Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Presenter
    * * Display Name: Presenter
    * * SQL Data Type: nvarchar(200)
    */
    get Presenter(): string | null {
        return this.Get('Presenter');
    }
    set Presenter(value: string | null) {
        this.Set('Presenter', value);
    }

    /**
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: datetimeoffset
    */
    get StartDate(): Date | null {
        return this.Get('StartDate');
    }
    set StartDate(value: Date | null) {
        this.Set('StartDate', value);
    }

    /**
    * * Field Name: StartTime
    * * Display Name: Start Time
    * * SQL Data Type: nvarchar(200)
    */
    get StartTime(): string | null {
        return this.Get('StartTime');
    }
    set StartTime(value: string | null) {
        this.Set('StartTime', value);
    }

    /**
    * * Field Name: EndDate
    * * Display Name: End Date
    * * SQL Data Type: datetimeoffset
    */
    get EndDate(): Date | null {
        return this.Get('EndDate');
    }
    set EndDate(value: Date | null) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: EndTime
    * * Display Name: End Time
    * * SQL Data Type: nvarchar(200)
    */
    get EndTime(): string | null {
        return this.Get('EndTime');
    }
    set EndTime(value: string | null) {
        this.Set('EndTime', value);
    }

    /**
    * * Field Name: MaxRegistrants
    * * Display Name: Max Registrants
    * * SQL Data Type: int
    */
    get MaxRegistrants(): number | null {
        return this.Get('MaxRegistrants');
    }
    set MaxRegistrants(value: number | null) {
        this.Set('MaxRegistrants', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: AllowCEUs
    * * Display Name: Allow CEUs
    * * SQL Data Type: bit
    */
    get AllowCEUs(): boolean | null {
        return this.Get('AllowCEUs');
    }
    set AllowCEUs(value: boolean | null) {
        this.Set('AllowCEUs', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Event Tickets - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: EventTicket
 * * Base View: vwEventTickets
 * * @description Ticket types for events with pricing, quantity limits, and categories
 * * Primary Key: TicketId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Event Tickets')
export class YourMembershipEventTicketEntity extends BaseEntity<YourMembershipEventTicketEntityType> {
    /**
    * Loads the Event Tickets record from the database
    * @param TicketId: number - primary key value to load the Event Tickets record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipEventTicketEntity
    * @method
    * @override
    */
    public async Load(TicketId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'TicketId', Value: TicketId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: TicketId
    * * Display Name: Ticket ID
    * * SQL Data Type: int
    */
    get TicketId(): number {
        return this.Get('TicketId');
    }
    set TicketId(value: number) {
        this.Set('TicketId', value);
    }

    /**
    * * Field Name: EventId
    * * Display Name: Event
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Events (vwEvents.EventId)
    */
    get EventId(): number | null {
        return this.Get('EventId');
    }
    set EventId(value: number | null) {
        this.Set('EventId', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Quantity
    * * Display Name: Quantity
    * * SQL Data Type: int
    */
    get Quantity(): number | null {
        return this.Get('Quantity');
    }
    set Quantity(value: number | null) {
        this.Set('Quantity', value);
    }

    /**
    * * Field Name: UnitPrice
    * * Display Name: Unit Price
    * * SQL Data Type: decimal(18, 2)
    */
    get UnitPrice(): number | null {
        return this.Get('UnitPrice');
    }
    set UnitPrice(value: number | null) {
        this.Set('UnitPrice', value);
    }

    /**
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(200)
    */
    get Type(): string | null {
        return this.Get('Type');
    }
    set Type(value: string | null) {
        this.Set('Type', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Event Categories (vwEventCategories.Id)
    */
    get Category(): string | null {
        return this.Get('Category');
    }
    set Category(value: string | null) {
        this.Set('Category', value);
    }

    /**
    * * Field Name: Active
    * * Display Name: Active
    * * SQL Data Type: bit
    */
    get Active(): boolean | null {
        return this.Get('Active');
    }
    set Active(value: boolean | null) {
        this.Set('Active', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Events - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: Event
 * * Base View: vwEvents
 * * @description Events including conferences, webinars, and meetings with dates and virtual meeting info
 * * Primary Key: EventId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Events')
export class YourMembershipEventEntity extends BaseEntity<YourMembershipEventEntityType> {
    /**
    * Loads the Events record from the database
    * @param EventId: number - primary key value to load the Events record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipEventEntity
    * @method
    * @override
    */
    public async Load(EventId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'EventId', Value: EventId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: EventId
    * * Display Name: Event ID
    * * SQL Data Type: int
    */
    get EventId(): number {
        return this.Get('EventId');
    }
    set EventId(value: number) {
        this.Set('EventId', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Active
    * * Display Name: Active
    * * SQL Data Type: bit
    */
    get Active(): boolean | null {
        return this.Get('Active');
    }
    set Active(value: boolean | null) {
        this.Set('Active', value);
    }

    /**
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: datetimeoffset
    */
    get StartDate(): Date | null {
        return this.Get('StartDate');
    }
    set StartDate(value: Date | null) {
        this.Set('StartDate', value);
    }

    /**
    * * Field Name: EndDate
    * * Display Name: End Date
    * * SQL Data Type: datetimeoffset
    */
    get EndDate(): Date | null {
        return this.Get('EndDate');
    }
    set EndDate(value: Date | null) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: StartTime
    * * Display Name: Start Time
    * * SQL Data Type: nvarchar(200)
    */
    get StartTime(): string | null {
        return this.Get('StartTime');
    }
    set StartTime(value: string | null) {
        this.Set('StartTime', value);
    }

    /**
    * * Field Name: EndTime
    * * Display Name: End Time
    * * SQL Data Type: nvarchar(200)
    */
    get EndTime(): string | null {
        return this.Get('EndTime');
    }
    set EndTime(value: string | null) {
        this.Set('EndTime', value);
    }

    /**
    * * Field Name: IsVirtual
    * * Display Name: Is Virtual
    * * SQL Data Type: bit
    */
    get IsVirtual(): boolean | null {
        return this.Get('IsVirtual');
    }
    set IsVirtual(value: boolean | null) {
        this.Set('IsVirtual', value);
    }

    /**
    * * Field Name: VirtualMeetingType
    * * Display Name: Virtual Meeting Type
    * * SQL Data Type: nvarchar(200)
    */
    get VirtualMeetingType(): string | null {
        return this.Get('VirtualMeetingType');
    }
    set VirtualMeetingType(value: string | null) {
        this.Set('VirtualMeetingType', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Feedback Submissions - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: FeedbackSubmission
 * * Base View: vwFeedbackSubmissions
 * * @description Customer feedback survey responses with sentiment and channel data
 * * Primary Key: hs_object_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Feedback Submissions')
export class HubSpotFeedbackSubmissionEntity extends BaseEntity<HubSpotFeedbackSubmissionEntityType> {
    /**
    * Loads the Feedback Submissions record from the database
    * @param hs_object_id: string - primary key value to load the Feedback Submissions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotFeedbackSubmissionEntity
    * @method
    * @override
    */
    public async Load(hs_object_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'hs_object_id', Value: hs_object_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: hs_object_id
    * * Display Name: Object ID
    * * SQL Data Type: nvarchar(100)
    */
    get hs_object_id(): string {
        return this.Get('hs_object_id');
    }
    set hs_object_id(value: string) {
        this.Set('hs_object_id', value);
    }

    /**
    * * Field Name: hs_survey_id
    * * Display Name: Survey ID
    * * SQL Data Type: nvarchar(100)
    */
    get hs_survey_id(): string | null {
        return this.Get('hs_survey_id');
    }
    set hs_survey_id(value: string | null) {
        this.Set('hs_survey_id', value);
    }

    /**
    * * Field Name: hs_survey_name
    * * Display Name: Survey Name
    * * SQL Data Type: nvarchar(500)
    */
    get hs_survey_name(): string | null {
        return this.Get('hs_survey_name');
    }
    set hs_survey_name(value: string | null) {
        this.Set('hs_survey_name', value);
    }

    /**
    * * Field Name: hs_survey_type
    * * Display Name: Survey Type
    * * SQL Data Type: nvarchar(500)
    */
    get hs_survey_type(): string | null {
        return this.Get('hs_survey_type');
    }
    set hs_survey_type(value: string | null) {
        this.Set('hs_survey_type', value);
    }

    /**
    * * Field Name: hs_submission_name
    * * Display Name: Submission Name
    * * SQL Data Type: nvarchar(500)
    */
    get hs_submission_name(): string | null {
        return this.Get('hs_submission_name');
    }
    set hs_submission_name(value: string | null) {
        this.Set('hs_submission_name', value);
    }

    /**
    * * Field Name: hs_content
    * * Display Name: Feedback Content
    * * SQL Data Type: nvarchar(MAX)
    */
    get hs_content(): string | null {
        return this.Get('hs_content');
    }
    set hs_content(value: string | null) {
        this.Set('hs_content', value);
    }

    /**
    * * Field Name: hs_response_group
    * * Display Name: Response Group
    * * SQL Data Type: nvarchar(500)
    */
    get hs_response_group(): string | null {
        return this.Get('hs_response_group');
    }
    set hs_response_group(value: string | null) {
        this.Set('hs_response_group', value);
    }

    /**
    * * Field Name: hs_sentiment
    * * Display Name: Sentiment
    * * SQL Data Type: nvarchar(500)
    */
    get hs_sentiment(): string | null {
        return this.Get('hs_sentiment');
    }
    set hs_sentiment(value: string | null) {
        this.Set('hs_sentiment', value);
    }

    /**
    * * Field Name: hs_survey_channel
    * * Display Name: Survey Channel
    * * SQL Data Type: nvarchar(500)
    */
    get hs_survey_channel(): string | null {
        return this.Get('hs_survey_channel');
    }
    set hs_survey_channel(value: string | null) {
        this.Set('hs_survey_channel', value);
    }

    /**
    * * Field Name: hs_timestamp
    * * Display Name: Submitted At
    * * SQL Data Type: datetimeoffset
    */
    get hs_timestamp(): Date | null {
        return this.Get('hs_timestamp');
    }
    set hs_timestamp(value: Date | null) {
        this.Set('hs_timestamp', value);
    }

    /**
    * * Field Name: createdate
    * * Display Name: HubSpot Created Date
    * * SQL Data Type: datetimeoffset
    */
    get createdate(): Date | null {
        return this.Get('createdate');
    }
    set createdate(value: Date | null) {
        this.Set('createdate', value);
    }

    /**
    * * Field Name: hs_lastmodifieddate
    * * Display Name: HubSpot Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get hs_lastmodifieddate(): Date | null {
        return this.Get('hs_lastmodifieddate');
    }
    set hs_lastmodifieddate(value: Date | null) {
        this.Set('hs_lastmodifieddate', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Finance Batch Details - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: FinanceBatchDetail
 * * Base View: vwFinanceBatchDetails
 * * @description Detailed invoice and payment records within financial processing batches
 * * Primary Key: DetailID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Finance Batch Details')
export class YourMembershipFinanceBatchDetailEntity extends BaseEntity<YourMembershipFinanceBatchDetailEntityType> {
    /**
    * Loads the Finance Batch Details record from the database
    * @param DetailID: number - primary key value to load the Finance Batch Details record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipFinanceBatchDetailEntity
    * @method
    * @override
    */
    public async Load(DetailID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'DetailID', Value: DetailID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: DetailID
    * * Display Name: Detail ID
    * * SQL Data Type: int
    */
    get DetailID(): number {
        return this.Get('DetailID');
    }
    set DetailID(value: number) {
        this.Set('DetailID', value);
    }

    /**
    * * Field Name: BatchID
    * * Display Name: Batch ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Finance Batches (vwFinanceBatches.BatchID)
    */
    get BatchID(): number | null {
        return this.Get('BatchID');
    }
    set BatchID(value: number | null) {
        this.Set('BatchID', value);
    }

    /**
    * * Field Name: InvoiceNumber
    * * Display Name: Invoice Number
    * * SQL Data Type: int
    */
    get InvoiceNumber(): number | null {
        return this.Get('InvoiceNumber');
    }
    set InvoiceNumber(value: number | null) {
        this.Set('InvoiceNumber', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get Amount(): number | null {
        return this.Get('Amount');
    }
    set Amount(value: number | null) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: PaymentType
    * * Display Name: Payment Type
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentType(): string | null {
        return this.Get('PaymentType');
    }
    set PaymentType(value: string | null) {
        this.Set('PaymentType', value);
    }

    /**
    * * Field Name: TransactionDate
    * * Display Name: Transaction Date
    * * SQL Data Type: datetimeoffset
    */
    get TransactionDate(): Date | null {
        return this.Get('TransactionDate');
    }
    set TransactionDate(value: Date | null) {
        this.Set('TransactionDate', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Finance Batches - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: FinanceBatch
 * * Base View: vwFinanceBatches
 * * @description Financial processing batches grouping transactions by commerce type and close date. DISABLED: YM API pagination is broken for this endpoint — returns the same full result set on every page regardless of PageNumber, causing infinite loops.
 * * Primary Key: BatchID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Finance Batches')
export class YourMembershipFinanceBatchEntity extends BaseEntity<YourMembershipFinanceBatchEntityType> {
    /**
    * Loads the Finance Batches record from the database
    * @param BatchID: number - primary key value to load the Finance Batches record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipFinanceBatchEntity
    * @method
    * @override
    */
    public async Load(BatchID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'BatchID', Value: BatchID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: BatchID
    * * Display Name: Batch ID
    * * SQL Data Type: int
    */
    get BatchID(): number {
        return this.Get('BatchID');
    }
    set BatchID(value: number) {
        this.Set('BatchID', value);
    }

    /**
    * * Field Name: CommerceType
    * * Display Name: Commerce Type
    * * SQL Data Type: nvarchar(200)
    */
    get CommerceType(): string | null {
        return this.Get('CommerceType');
    }
    set CommerceType(value: string | null) {
        this.Set('CommerceType', value);
    }

    /**
    * * Field Name: ItemCount
    * * Display Name: Item Count
    * * SQL Data Type: int
    */
    get ItemCount(): number | null {
        return this.Get('ItemCount');
    }
    set ItemCount(value: number | null) {
        this.Set('ItemCount', value);
    }

    /**
    * * Field Name: ClosedDate
    * * Display Name: Closed Date
    * * SQL Data Type: datetimeoffset
    */
    get ClosedDate(): Date | null {
        return this.Get('ClosedDate');
    }
    set ClosedDate(value: Date | null) {
        this.Set('ClosedDate', value);
    }

    /**
    * * Field Name: CreateDateTime
    * * Display Name: Created Date
    * * SQL Data Type: datetimeoffset
    */
    get CreateDateTime(): Date | null {
        return this.Get('CreateDateTime');
    }
    set CreateDateTime(value: Date | null) {
        this.Set('CreateDateTime', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * GL Codes - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: GLCode
 * * Base View: vwGLCodes
 * * @description General ledger codes for financial reporting and accounting integration
 * * Primary Key: GLCodeId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'GL Codes')
export class YourMembershipGLCodeEntity extends BaseEntity<YourMembershipGLCodeEntityType> {
    /**
    * Loads the GL Codes record from the database
    * @param GLCodeId: number - primary key value to load the GL Codes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipGLCodeEntity
    * @method
    * @override
    */
    public async Load(GLCodeId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'GLCodeId', Value: GLCodeId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: GLCodeId
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get GLCodeId(): number {
        return this.Get('GLCodeId');
    }
    set GLCodeId(value: number) {
        this.Set('GLCodeId', value);
    }

    /**
    * * Field Name: GLCodeName
    * * Display Name: GL Code Name
    * * SQL Data Type: nvarchar(200)
    */
    get GLCodeName(): string | null {
        return this.Get('GLCodeName');
    }
    set GLCodeName(value: string | null) {
        this.Set('GLCodeName', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Group Membership Logs - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: GroupMembershipLog
 * * Base View: vwGroupMembershipLogs
 * * @description Audit trail of group membership changes with member details and timestamps
 * * Primary Key: ItemID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Group Membership Logs')
export class YourMembershipGroupMembershipLogEntity extends BaseEntity<YourMembershipGroupMembershipLogEntityType> {
    /**
    * Loads the Group Membership Logs record from the database
    * @param ItemID: number - primary key value to load the Group Membership Logs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipGroupMembershipLogEntity
    * @method
    * @override
    */
    public async Load(ItemID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ItemID', Value: ItemID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ItemID
    * * Display Name: Item ID
    * * SQL Data Type: int
    */
    get ItemID(): number {
        return this.Get('ItemID');
    }
    set ItemID(value: number) {
        this.Set('ItemID', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: Log ID
    * * SQL Data Type: nvarchar(200)
    */
    get ID(): string | null {
        return this.Get('ID');
    }
    set ID(value: string | null) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ProfileID
    * * Display Name: Profile ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Member Profiles (vwMemberProfiles.ProfileID)
    */
    get ProfileID(): number | null {
        return this.Get('ProfileID');
    }
    set ProfileID(value: number | null) {
        this.Set('ProfileID', value);
    }

    /**
    * * Field Name: NamePrefix
    * * Display Name: Prefix
    * * SQL Data Type: nvarchar(200)
    */
    get NamePrefix(): string | null {
        return this.Get('NamePrefix');
    }
    set NamePrefix(value: string | null) {
        this.Set('NamePrefix', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.firstname)
    */
    get FirstName(): string | null {
        return this.Get('FirstName');
    }
    set FirstName(value: string | null) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: MiddleName
    * * Display Name: Middle Name
    * * SQL Data Type: nvarchar(200)
    */
    get MiddleName(): string | null {
        return this.Get('MiddleName');
    }
    set MiddleName(value: string | null) {
        this.Set('MiddleName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.lastname)
    */
    get LastName(): string | null {
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: Suffix
    * * Display Name: Suffix
    * * SQL Data Type: nvarchar(200)
    */
    get Suffix(): string | null {
        return this.Get('Suffix');
    }
    set Suffix(value: string | null) {
        this.Set('Suffix', value);
    }

    /**
    * * Field Name: Nickname
    * * Display Name: Nickname
    * * SQL Data Type: nvarchar(200)
    */
    get Nickname(): string | null {
        return this.Get('Nickname');
    }
    set Nickname(value: string | null) {
        this.Set('Nickname', value);
    }

    /**
    * * Field Name: EmployerName
    * * Display Name: Employer Name
    * * SQL Data Type: nvarchar(200)
    */
    get EmployerName(): string | null {
        return this.Get('EmployerName');
    }
    set EmployerName(value: string | null) {
        this.Set('EmployerName', value);
    }

    /**
    * * Field Name: WorkTitle
    * * Display Name: Work Title
    * * SQL Data Type: nvarchar(200)
    */
    get WorkTitle(): string | null {
        return this.Get('WorkTitle');
    }
    set WorkTitle(value: string | null) {
        this.Set('WorkTitle', value);
    }

    /**
    * * Field Name: Date
    * * Display Name: Log Date
    * * SQL Data Type: datetimeoffset
    */
    get Date(): Date | null {
        return this.Get('Date');
    }
    set Date(value: Date | null) {
        this.Set('Date', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Group Types - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: GroupType
 * * Base View: vwGroupTypes
 * * @description Classification types for groups (e.g., Committee, Chapter, Section)
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Group Types')
export class YourMembershipGroupTypeEntity extends BaseEntity<YourMembershipGroupTypeEntityType> {
    /**
    * Loads the Group Types record from the database
    * @param Id: number - primary key value to load the Group Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipGroupTypeEntity
    * @method
    * @override
    */
    public async Load(Id: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get Id(): number {
        return this.Get('Id');
    }
    set Id(value: number) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: TypeName
    * * Display Name: Type Name
    * * SQL Data Type: nvarchar(200)
    */
    get TypeName(): string | null {
        return this.Get('TypeName');
    }
    set TypeName(value: string | null) {
        this.Set('TypeName', value);
    }

    /**
    * * Field Name: SortIndex
    * * Display Name: Sort Index
    * * SQL Data Type: int
    */
    get SortIndex(): number | null {
        return this.Get('SortIndex');
    }
    set SortIndex(value: number | null) {
        this.Set('SortIndex', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Groups - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: Group
 * * Base View: vwGroups
 * * @description Committees, chapters, sections, and other organizational groups
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Groups')
export class YourMembershipGroupEntity extends BaseEntity<YourMembershipGroupEntityType> {
    /**
    * Loads the Groups record from the database
    * @param Id: number - primary key value to load the Groups record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipGroupEntity
    * @method
    * @override
    */
    public async Load(Id: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get Id(): number {
        return this.Get('Id');
    }
    set Id(value: number) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: GroupTypeName
    * * Display Name: Group Type Name
    * * SQL Data Type: nvarchar(200)
    */
    get GroupTypeName(): string | null {
        return this.Get('GroupTypeName');
    }
    set GroupTypeName(value: string | null) {
        this.Set('GroupTypeName', value);
    }

    /**
    * * Field Name: GroupTypeId
    * * Display Name: Group Type
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Group Types (vwGroupTypes.Id)
    */
    get GroupTypeId(): number | null {
        return this.Get('GroupTypeId');
    }
    set GroupTypeId(value: number | null) {
        this.Set('GroupTypeId', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Invoice Items - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: InvoiceItem
 * * Base View: vwInvoiceItems
 * * @description Individual line items from invoices including dues, events, store purchases, and donations
 * * Primary Key: LineItemID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Invoice Items')
export class YourMembershipInvoiceItemEntity extends BaseEntity<YourMembershipInvoiceItemEntityType> {
    /**
    * Loads the Invoice Items record from the database
    * @param LineItemID: number - primary key value to load the Invoice Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipInvoiceItemEntity
    * @method
    * @override
    */
    public async Load(LineItemID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'LineItemID', Value: LineItemID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: LineItemID
    * * Display Name: Line Item ID
    * * SQL Data Type: int
    */
    get LineItemID(): number {
        return this.Get('LineItemID');
    }
    set LineItemID(value: number) {
        this.Set('LineItemID', value);
    }

    /**
    * * Field Name: InvoiceNo
    * * Display Name: Invoice Number
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Store Orders (vwStoreOrders.OrderID)
    */
    get InvoiceNo(): number | null {
        return this.Get('InvoiceNo');
    }
    set InvoiceNo(value: number | null) {
        this.Set('InvoiceNo', value);
    }

    /**
    * * Field Name: InvoiceType
    * * Display Name: Invoice Type
    * * SQL Data Type: nvarchar(200)
    */
    get InvoiceType(): string | null {
        return this.Get('InvoiceType');
    }
    set InvoiceType(value: string | null) {
        this.Set('InvoiceType', value);
    }

    /**
    * * Field Name: WebSiteMemberID
    * * Display Name: Website Member ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)
    */
    get WebSiteMemberID(): number | null {
        return this.Get('WebSiteMemberID');
    }
    set WebSiteMemberID(value: number | null) {
        this.Set('WebSiteMemberID', value);
    }

    /**
    * * Field Name: ConstituentID
    * * Display Name: Constituent ID
    * * SQL Data Type: nvarchar(200)
    */
    get ConstituentID(): string | null {
        return this.Get('ConstituentID');
    }
    set ConstituentID(value: string | null) {
        this.Set('ConstituentID', value);
    }

    /**
    * * Field Name: InvoiceNameFirst
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(200)
    */
    get InvoiceNameFirst(): string | null {
        return this.Get('InvoiceNameFirst');
    }
    set InvoiceNameFirst(value: string | null) {
        this.Set('InvoiceNameFirst', value);
    }

    /**
    * * Field Name: InvoiceNameLast
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(200)
    */
    get InvoiceNameLast(): string | null {
        return this.Get('InvoiceNameLast');
    }
    set InvoiceNameLast(value: string | null) {
        this.Set('InvoiceNameLast', value);
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(200)
    */
    get Organization(): string | null {
        return this.Get('Organization');
    }
    set Organization(value: string | null) {
        this.Set('Organization', value);
    }

    /**
    * * Field Name: EmailAddress
    * * Display Name: Email Address
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.email)
    */
    get EmailAddress(): string | null {
        return this.Get('EmailAddress');
    }
    set EmailAddress(value: string | null) {
        this.Set('EmailAddress', value);
    }

    /**
    * * Field Name: LineItemType
    * * Display Name: Line Item Type
    * * SQL Data Type: nvarchar(200)
    */
    get LineItemType(): string | null {
        return this.Get('LineItemType');
    }
    set LineItemType(value: string | null) {
        this.Set('LineItemType', value);
    }

    /**
    * * Field Name: LineItemDescription
    * * Display Name: Description
    * * SQL Data Type: nvarchar(200)
    */
    get LineItemDescription(): string | null {
        return this.Get('LineItemDescription');
    }
    set LineItemDescription(value: string | null) {
        this.Set('LineItemDescription', value);
    }

    /**
    * * Field Name: LineItemDate
    * * Display Name: Item Date
    * * SQL Data Type: datetimeoffset
    */
    get LineItemDate(): Date | null {
        return this.Get('LineItemDate');
    }
    set LineItemDate(value: Date | null) {
        this.Set('LineItemDate', value);
    }

    /**
    * * Field Name: LineItemDateEntered
    * * Display Name: Date Entered
    * * SQL Data Type: datetimeoffset
    */
    get LineItemDateEntered(): Date | null {
        return this.Get('LineItemDateEntered');
    }
    set LineItemDateEntered(value: Date | null) {
        this.Set('LineItemDateEntered', value);
    }

    /**
    * * Field Name: LineItemAmount
    * * Display Name: Unit Price
    * * SQL Data Type: decimal(18, 2)
    */
    get LineItemAmount(): number | null {
        return this.Get('LineItemAmount');
    }
    set LineItemAmount(value: number | null) {
        this.Set('LineItemAmount', value);
    }

    /**
    * * Field Name: LineItemQuantity
    * * Display Name: Quantity
    * * SQL Data Type: int
    */
    get LineItemQuantity(): number | null {
        return this.Get('LineItemQuantity');
    }
    set LineItemQuantity(value: number | null) {
        this.Set('LineItemQuantity', value);
    }

    /**
    * * Field Name: LineTotal
    * * Display Name: Line Total
    * * SQL Data Type: decimal(18, 2)
    */
    get LineTotal(): number | null {
        return this.Get('LineTotal');
    }
    set LineTotal(value: number | null) {
        this.Set('LineTotal', value);
    }

    /**
    * * Field Name: OutstandingBalance
    * * Display Name: Outstanding Balance
    * * SQL Data Type: decimal(18, 2)
    */
    get OutstandingBalance(): number | null {
        return this.Get('OutstandingBalance');
    }
    set OutstandingBalance(value: number | null) {
        this.Set('OutstandingBalance', value);
    }

    /**
    * * Field Name: PaymentTerms
    * * Display Name: Payment Terms
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentTerms(): string | null {
        return this.Get('PaymentTerms');
    }
    set PaymentTerms(value: string | null) {
        this.Set('PaymentTerms', value);
    }

    /**
    * * Field Name: GLCodeItemName
    * * Display Name: GL Code
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: GL Codes (vwGLCodes.GLCodeName)
    */
    get GLCodeItemName(): string | null {
        return this.Get('GLCodeItemName');
    }
    set GLCodeItemName(value: string | null) {
        this.Set('GLCodeItemName', value);
    }

    /**
    * * Field Name: QBClassItemName
    * * Display Name: QuickBooks Class
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: QB Classes (vwQBClasses.Id)
    */
    get QBClassItemName(): string | null {
        return this.Get('QBClassItemName');
    }
    set QBClassItemName(value: string | null) {
        this.Set('QBClassItemName', value);
    }

    /**
    * * Field Name: PaymentOption
    * * Display Name: Payment Option
    * * SQL Data Type: nvarchar(200)
    */
    get PaymentOption(): string | null {
        return this.Get('PaymentOption');
    }
    set PaymentOption(value: string | null) {
        this.Set('PaymentOption', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Line Items - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: LineItem
 * * Base View: vwLineItems
 * * @description Individual line items associated with deals, including pricing and product details
 * * Primary Key: hs_object_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Line Items')
export class HubSpotLineItemEntity extends BaseEntity<HubSpotLineItemEntityType> {
    /**
    * Loads the Line Items record from the database
    * @param hs_object_id: string - primary key value to load the Line Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotLineItemEntity
    * @method
    * @override
    */
    public async Load(hs_object_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'hs_object_id', Value: hs_object_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: hs_object_id
    * * Display Name: ID
    * * SQL Data Type: nvarchar(100)
    */
    get hs_object_id(): string {
        return this.Get('hs_object_id');
    }
    set hs_object_id(value: string) {
        this.Set('hs_object_id', value);
    }

    /**
    * * Field Name: name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(500)
    */
    get name(): string | null {
        return this.Get('name');
    }
    set name(value: string | null) {
        this.Set('name', value);
    }

    /**
    * * Field Name: description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get description(): string | null {
        return this.Get('description');
    }
    set description(value: string | null) {
        this.Set('description', value);
    }

    /**
    * * Field Name: quantity
    * * Display Name: Quantity
    * * SQL Data Type: decimal(18, 2)
    */
    get quantity(): number | null {
        return this.Get('quantity');
    }
    set quantity(value: number | null) {
        this.Set('quantity', value);
    }

    /**
    * * Field Name: price
    * * Display Name: Unit Price
    * * SQL Data Type: decimal(18, 2)
    */
    get price(): number | null {
        return this.Get('price');
    }
    set price(value: number | null) {
        this.Set('price', value);
    }

    /**
    * * Field Name: amount
    * * Display Name: Total Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get amount(): number | null {
        return this.Get('amount');
    }
    set amount(value: number | null) {
        this.Set('amount', value);
    }

    /**
    * * Field Name: discount
    * * Display Name: Discount
    * * SQL Data Type: decimal(18, 2)
    */
    get discount(): number | null {
        return this.Get('discount');
    }
    set discount(value: number | null) {
        this.Set('discount', value);
    }

    /**
    * * Field Name: tax
    * * Display Name: Tax
    * * SQL Data Type: decimal(18, 2)
    */
    get tax(): number | null {
        return this.Get('tax');
    }
    set tax(value: number | null) {
        this.Set('tax', value);
    }

    /**
    * * Field Name: hs_product_id
    * * Display Name: Product
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Products__HubSpot (vwProducts__HubSpot.hs_object_id)
    */
    get hs_product_id(): string | null {
        return this.Get('hs_product_id');
    }
    set hs_product_id(value: string | null) {
        this.Set('hs_product_id', value);
    }

    /**
    * * Field Name: hs_line_item_currency_code
    * * Display Name: Currency
    * * SQL Data Type: nvarchar(500)
    */
    get hs_line_item_currency_code(): string | null {
        return this.Get('hs_line_item_currency_code');
    }
    set hs_line_item_currency_code(value: string | null) {
        this.Set('hs_line_item_currency_code', value);
    }

    /**
    * * Field Name: hs_sku
    * * Display Name: SKU
    * * SQL Data Type: nvarchar(500)
    */
    get hs_sku(): string | null {
        return this.Get('hs_sku');
    }
    set hs_sku(value: string | null) {
        this.Set('hs_sku', value);
    }

    /**
    * * Field Name: hs_cost_of_goods_sold
    * * Display Name: Cost of Goods Sold
    * * SQL Data Type: decimal(18, 2)
    */
    get hs_cost_of_goods_sold(): number | null {
        return this.Get('hs_cost_of_goods_sold');
    }
    set hs_cost_of_goods_sold(value: number | null) {
        this.Set('hs_cost_of_goods_sold', value);
    }

    /**
    * * Field Name: hs_recurring_billing_period
    * * Display Name: Recurring Billing Period
    * * SQL Data Type: nvarchar(500)
    */
    get hs_recurring_billing_period(): string | null {
        return this.Get('hs_recurring_billing_period');
    }
    set hs_recurring_billing_period(value: string | null) {
        this.Set('hs_recurring_billing_period', value);
    }

    /**
    * * Field Name: createdate
    * * Display Name: Created Date
    * * SQL Data Type: datetimeoffset
    */
    get createdate(): Date | null {
        return this.Get('createdate');
    }
    set createdate(value: Date | null) {
        this.Set('createdate', value);
    }

    /**
    * * Field Name: hs_lastmodifieddate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get hs_lastmodifieddate(): Date | null {
        return this.Get('hs_lastmodifieddate');
    }
    set hs_lastmodifieddate(value: Date | null) {
        this.Set('hs_lastmodifieddate', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Locations - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: Location
 * * Base View: vwLocations
 * * @description States, provinces, and regions within countries with tax GL codes
 * * Primary Key: locationCode
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Locations')
export class YourMembershipLocationEntity extends BaseEntity<YourMembershipLocationEntityType> {
    /**
    * Loads the Locations record from the database
    * @param locationCode: string - primary key value to load the Locations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipLocationEntity
    * @method
    * @override
    */
    public async Load(locationCode: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'locationCode', Value: locationCode });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: locationCode
    * * Display Name: Location Code
    * * SQL Data Type: nvarchar(200)
    */
    get locationCode(): string {
        return this.Get('locationCode');
    }
    set locationCode(value: string) {
        this.Set('locationCode', value);
    }

    /**
    * * Field Name: countryId
    * * Display Name: Country
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Countries (vwCountries.countryId)
    */
    get countryId(): string | null {
        return this.Get('countryId');
    }
    set countryId(value: string | null) {
        this.Set('countryId', value);
    }

    /**
    * * Field Name: locationName
    * * Display Name: Location Name
    * * SQL Data Type: nvarchar(200)
    */
    get locationName(): string | null {
        return this.Get('locationName');
    }
    set locationName(value: string | null) {
        this.Set('locationName', value);
    }

    /**
    * * Field Name: taxGLCode
    * * Display Name: Tax GL Code
    * * SQL Data Type: nvarchar(200)
    */
    get taxGLCode(): string | null {
        return this.Get('taxGLCode');
    }
    set taxGLCode(value: string | null) {
        this.Set('taxGLCode', value);
    }

    /**
    * * Field Name: taxQBClass
    * * Display Name: Tax QuickBooks Class
    * * SQL Data Type: nvarchar(200)
    */
    get taxQBClass(): string | null {
        return this.Get('taxQBClass');
    }
    set taxQBClass(value: string | null) {
        this.Set('taxQBClass', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Meetings - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: Meeting
 * * Base View: vwMeetings
 * * @description Scheduled meetings with time, location, outcome, and notes
 * * Primary Key: hs_object_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Meetings')
export class HubSpotMeetingEntity extends BaseEntity<HubSpotMeetingEntityType> {
    /**
    * Loads the Meetings record from the database
    * @param hs_object_id: string - primary key value to load the Meetings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotMeetingEntity
    * @method
    * @override
    */
    public async Load(hs_object_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'hs_object_id', Value: hs_object_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: hs_object_id
    * * Display Name: Object ID
    * * SQL Data Type: nvarchar(100)
    */
    get hs_object_id(): string {
        return this.Get('hs_object_id');
    }
    set hs_object_id(value: string) {
        this.Set('hs_object_id', value);
    }

    /**
    * * Field Name: hs_meeting_title
    * * Display Name: Meeting Title
    * * SQL Data Type: nvarchar(500)
    */
    get hs_meeting_title(): string | null {
        return this.Get('hs_meeting_title');
    }
    set hs_meeting_title(value: string | null) {
        this.Set('hs_meeting_title', value);
    }

    /**
    * * Field Name: hs_meeting_body
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get hs_meeting_body(): string | null {
        return this.Get('hs_meeting_body');
    }
    set hs_meeting_body(value: string | null) {
        this.Set('hs_meeting_body', value);
    }

    /**
    * * Field Name: hs_meeting_start_time
    * * Display Name: Start Time
    * * SQL Data Type: datetimeoffset
    */
    get hs_meeting_start_time(): Date | null {
        return this.Get('hs_meeting_start_time');
    }
    set hs_meeting_start_time(value: Date | null) {
        this.Set('hs_meeting_start_time', value);
    }

    /**
    * * Field Name: hs_meeting_end_time
    * * Display Name: End Time
    * * SQL Data Type: datetimeoffset
    */
    get hs_meeting_end_time(): Date | null {
        return this.Get('hs_meeting_end_time');
    }
    set hs_meeting_end_time(value: Date | null) {
        this.Set('hs_meeting_end_time', value);
    }

    /**
    * * Field Name: hs_meeting_outcome
    * * Display Name: Outcome
    * * SQL Data Type: nvarchar(500)
    */
    get hs_meeting_outcome(): string | null {
        return this.Get('hs_meeting_outcome');
    }
    set hs_meeting_outcome(value: string | null) {
        this.Set('hs_meeting_outcome', value);
    }

    /**
    * * Field Name: hs_meeting_location
    * * Display Name: Location
    * * SQL Data Type: nvarchar(500)
    */
    get hs_meeting_location(): string | null {
        return this.Get('hs_meeting_location');
    }
    set hs_meeting_location(value: string | null) {
        this.Set('hs_meeting_location', value);
    }

    /**
    * * Field Name: hs_meeting_external_url
    * * Display Name: Meeting URL
    * * SQL Data Type: nvarchar(1000)
    */
    get hs_meeting_external_url(): string | null {
        return this.Get('hs_meeting_external_url');
    }
    set hs_meeting_external_url(value: string | null) {
        this.Set('hs_meeting_external_url', value);
    }

    /**
    * * Field Name: hs_internal_meeting_notes
    * * Display Name: Internal Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get hs_internal_meeting_notes(): string | null {
        return this.Get('hs_internal_meeting_notes');
    }
    set hs_internal_meeting_notes(value: string | null) {
        this.Set('hs_internal_meeting_notes', value);
    }

    /**
    * * Field Name: hs_activity_type
    * * Display Name: Activity Type
    * * SQL Data Type: nvarchar(500)
    */
    get hs_activity_type(): string | null {
        return this.Get('hs_activity_type');
    }
    set hs_activity_type(value: string | null) {
        this.Set('hs_activity_type', value);
    }

    /**
    * * Field Name: hubspot_owner_id
    * * Display Name: Owner
    * * SQL Data Type: nvarchar(100)
    */
    get hubspot_owner_id(): string | null {
        return this.Get('hubspot_owner_id');
    }
    set hubspot_owner_id(value: string | null) {
        this.Set('hubspot_owner_id', value);
    }

    /**
    * * Field Name: hs_timestamp
    * * Display Name: Activity Date
    * * SQL Data Type: datetimeoffset
    */
    get hs_timestamp(): Date | null {
        return this.Get('hs_timestamp');
    }
    set hs_timestamp(value: Date | null) {
        this.Set('hs_timestamp', value);
    }

    /**
    * * Field Name: createdate
    * * Display Name: HubSpot Created Date
    * * SQL Data Type: datetimeoffset
    */
    get createdate(): Date | null {
        return this.Get('createdate');
    }
    set createdate(value: Date | null) {
        this.Set('createdate', value);
    }

    /**
    * * Field Name: hs_lastmodifieddate
    * * Display Name: HubSpot Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get hs_lastmodifieddate(): Date | null {
        return this.Get('hs_lastmodifieddate');
    }
    set hs_lastmodifieddate(value: Date | null) {
        this.Set('hs_lastmodifieddate', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Member Favorites - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: MemberFavorite
 * * Base View: vwMemberFavorites
 * * @description Bookmarked/favorited items per member for personalization tracking
 * * Primary Key: FavoriteId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Member Favorites')
export class YourMembershipMemberFavoriteEntity extends BaseEntity<YourMembershipMemberFavoriteEntityType> {
    /**
    * Loads the Member Favorites record from the database
    * @param FavoriteId: number - primary key value to load the Member Favorites record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipMemberFavoriteEntity
    * @method
    * @override
    */
    public async Load(FavoriteId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'FavoriteId', Value: FavoriteId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: FavoriteId
    * * Display Name: Favorite ID
    * * SQL Data Type: int
    */
    get FavoriteId(): number {
        return this.Get('FavoriteId');
    }
    set FavoriteId(value: number) {
        this.Set('FavoriteId', value);
    }

    /**
    * * Field Name: ProfileID
    * * Display Name: Profile
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Member Profiles (vwMemberProfiles.ProfileID)
    */
    get ProfileID(): number | null {
        return this.Get('ProfileID');
    }
    set ProfileID(value: number | null) {
        this.Set('ProfileID', value);
    }

    /**
    * * Field Name: ItemType
    * * Display Name: Item Type
    * * SQL Data Type: nvarchar(200)
    */
    get ItemType(): string | null {
        return this.Get('ItemType');
    }
    set ItemType(value: string | null) {
        this.Set('ItemType', value);
    }

    /**
    * * Field Name: ItemId
    * * Display Name: Item ID
    * * SQL Data Type: nvarchar(200)
    */
    get ItemId(): string | null {
        return this.Get('ItemId');
    }
    set ItemId(value: string | null) {
        this.Set('ItemId', value);
    }

    /**
    * * Field Name: DateAdded
    * * Display Name: Date Added
    * * SQL Data Type: datetimeoffset
    */
    get DateAdded(): Date | null {
        return this.Get('DateAdded');
    }
    set DateAdded(value: Date | null) {
        this.Set('DateAdded', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Member Group Bulks - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: MemberGroupBulk
 * * Base View: vwMemberGroupBulks
 * * @description Bulk member-to-group assignments with group codes and primary group designation
 * * Primary Keys: WebSiteMemberID, GroupID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Member Group Bulks')
export class YourMembershipMemberGroupBulkEntity extends BaseEntity<YourMembershipMemberGroupBulkEntityType> {
    /**
    * Loads the Member Group Bulks record from the database
    * @param WebSiteMemberID: number - primary key value to load the Member Group Bulks record.
    * @param GroupID: number - primary key value to load the Member Group Bulks record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipMemberGroupBulkEntity
    * @method
    * @override
    */
    public async Load(WebSiteMemberID: number, GroupID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'WebSiteMemberID', Value: WebSiteMemberID });
        compositeKey.KeyValuePairs.push({ FieldName: 'GroupID', Value: GroupID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: WebSiteMemberID
    * * Display Name: Member ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)
    */
    get WebSiteMemberID(): number {
        return this.Get('WebSiteMemberID');
    }
    set WebSiteMemberID(value: number) {
        this.Set('WebSiteMemberID', value);
    }

    /**
    * * Field Name: GroupID
    * * Display Name: Group ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Groups (vwGroups.Id)
    */
    get GroupID(): number {
        return this.Get('GroupID');
    }
    set GroupID(value: number) {
        this.Set('GroupID', value);
    }

    /**
    * * Field Name: GroupCode
    * * Display Name: Group Code
    * * SQL Data Type: nvarchar(200)
    */
    get GroupCode(): string | null {
        return this.Get('GroupCode');
    }
    set GroupCode(value: string | null) {
        this.Set('GroupCode', value);
    }

    /**
    * * Field Name: GroupName
    * * Display Name: Group Name
    * * SQL Data Type: nvarchar(200)
    */
    get GroupName(): string | null {
        return this.Get('GroupName');
    }
    set GroupName(value: string | null) {
        this.Set('GroupName', value);
    }

    /**
    * * Field Name: PrimaryGroup
    * * Display Name: Primary Group
    * * SQL Data Type: bit
    */
    get PrimaryGroup(): boolean | null {
        return this.Get('PrimaryGroup');
    }
    set PrimaryGroup(value: boolean | null) {
        this.Set('PrimaryGroup', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Member Groups - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: MemberGroup
 * * Base View: vwMemberGroups
 * * @description Association between members and their group/committee memberships
 * * Primary Key: MemberGroupId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Member Groups')
export class YourMembershipMemberGroupEntity extends BaseEntity<YourMembershipMemberGroupEntityType> {
    /**
    * Loads the Member Groups record from the database
    * @param MemberGroupId: string - primary key value to load the Member Groups record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipMemberGroupEntity
    * @method
    * @override
    */
    public async Load(MemberGroupId: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'MemberGroupId', Value: MemberGroupId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: MemberGroupId
    * * Display Name: Member Group
    * * SQL Data Type: nvarchar(200)
    */
    get MemberGroupId(): string {
        return this.Get('MemberGroupId');
    }
    set MemberGroupId(value: string) {
        this.Set('MemberGroupId', value);
    }

    /**
    * * Field Name: ProfileID
    * * Display Name: Profile
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Member Profiles (vwMemberProfiles.ProfileID)
    */
    get ProfileID(): number | null {
        return this.Get('ProfileID');
    }
    set ProfileID(value: number | null) {
        this.Set('ProfileID', value);
    }

    /**
    * * Field Name: GroupId
    * * Display Name: Group
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Groups (vwGroups.Id)
    */
    get GroupId(): number | null {
        return this.Get('GroupId');
    }
    set GroupId(value: number | null) {
        this.Set('GroupId', value);
    }

    /**
    * * Field Name: GroupName
    * * Display Name: Group Name
    * * SQL Data Type: nvarchar(200)
    */
    get GroupName(): string | null {
        return this.Get('GroupName');
    }
    set GroupName(value: string | null) {
        this.Set('GroupName', value);
    }

    /**
    * * Field Name: GroupTypeName
    * * Display Name: Group Type Name
    * * SQL Data Type: nvarchar(200)
    */
    get GroupTypeName(): string | null {
        return this.Get('GroupTypeName');
    }
    set GroupTypeName(value: string | null) {
        this.Set('GroupTypeName', value);
    }

    /**
    * * Field Name: GroupTypeId
    * * Display Name: Group Type
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Group Types (vwGroupTypes.Id)
    */
    get GroupTypeId(): number | null {
        return this.Get('GroupTypeId');
    }
    set GroupTypeId(value: number | null) {
        this.Set('GroupTypeId', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Member Networks - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: MemberNetwork
 * * Base View: vwMemberNetworks
 * * @description Social network profile links for members (LinkedIn, Twitter, etc.)
 * * Primary Key: NetworkId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Member Networks')
export class YourMembershipMemberNetworkEntity extends BaseEntity<YourMembershipMemberNetworkEntityType> {
    /**
    * Loads the Member Networks record from the database
    * @param NetworkId: number - primary key value to load the Member Networks record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipMemberNetworkEntity
    * @method
    * @override
    */
    public async Load(NetworkId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'NetworkId', Value: NetworkId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: NetworkId
    * * Display Name: Network ID
    * * SQL Data Type: int
    */
    get NetworkId(): number {
        return this.Get('NetworkId');
    }
    set NetworkId(value: number) {
        this.Set('NetworkId', value);
    }

    /**
    * * Field Name: ProfileID
    * * Display Name: Profile ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Member Profiles (vwMemberProfiles.ProfileID)
    */
    get ProfileID(): number | null {
        return this.Get('ProfileID');
    }
    set ProfileID(value: number | null) {
        this.Set('ProfileID', value);
    }

    /**
    * * Field Name: NetworkType
    * * Display Name: Network Type
    * * SQL Data Type: nvarchar(200)
    */
    get NetworkType(): string | null {
        return this.Get('NetworkType');
    }
    set NetworkType(value: string | null) {
        this.Set('NetworkType', value);
    }

    /**
    * * Field Name: ProfileUrl
    * * Display Name: Profile URL
    * * SQL Data Type: nvarchar(500)
    */
    get ProfileUrl(): string | null {
        return this.Get('ProfileUrl');
    }
    set ProfileUrl(value: string | null) {
        this.Set('ProfileUrl', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Member Profiles - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: MemberProfile
 * * Base View: vwMemberProfiles
 * * @description Comprehensive member profile data including custom fields, richer than basic member list
 * * Primary Key: ProfileID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Member Profiles')
export class YourMembershipMemberProfileEntity extends BaseEntity<YourMembershipMemberProfileEntityType> {
    /**
    * Loads the Member Profiles record from the database
    * @param ProfileID: number - primary key value to load the Member Profiles record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipMemberProfileEntity
    * @method
    * @override
    */
    public async Load(ProfileID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ProfileID', Value: ProfileID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ProfileID
    * * Display Name: Profile ID
    * * SQL Data Type: int
    */
    get ProfileID(): number {
        return this.Get('ProfileID');
    }
    set ProfileID(value: number) {
        this.Set('ProfileID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.firstname)
    */
    get FirstName(): string | null {
        return this.Get('FirstName');
    }
    set FirstName(value: string | null) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.lastname)
    */
    get LastName(): string | null {
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: EmailAddress
    * * Display Name: Email Address
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Contacts (vwContacts.email)
    */
    get EmailAddress(): string | null {
        return this.Get('EmailAddress');
    }
    set EmailAddress(value: string | null) {
        this.Set('EmailAddress', value);
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(200)
    */
    get Organization(): string | null {
        return this.Get('Organization');
    }
    set Organization(value: string | null) {
        this.Set('Organization', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(200)
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: MemberTypeCode
    * * Display Name: Member Type
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Member Types (vwMemberTypes.TypeCode)
    */
    get MemberTypeCode(): string | null {
        return this.Get('MemberTypeCode');
    }
    set MemberTypeCode(value: string | null) {
        this.Set('MemberTypeCode', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(200)
    */
    get Status(): string | null {
        return this.Get('Status');
    }
    set Status(value: string | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: JoinDate
    * * Display Name: Join Date
    * * SQL Data Type: datetimeoffset
    */
    get JoinDate(): Date | null {
        return this.Get('JoinDate');
    }
    set JoinDate(value: Date | null) {
        this.Set('JoinDate', value);
    }

    /**
    * * Field Name: ExpirationDate
    * * Display Name: Expiration Date
    * * SQL Data Type: datetimeoffset
    */
    get ExpirationDate(): Date | null {
        return this.Get('ExpirationDate');
    }
    set ExpirationDate(value: Date | null) {
        this.Set('ExpirationDate', value);
    }

    /**
    * * Field Name: LastModifiedDate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get LastModifiedDate(): Date | null {
        return this.Get('LastModifiedDate');
    }
    set LastModifiedDate(value: Date | null) {
        this.Set('LastModifiedDate', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Integration Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Member Referrals - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: MemberReferral
 * * Base View: vwMemberReferrals
 * * @description Member-to-member referral tracking records
 * * Primary Key: ReferralId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Member Referrals')
export class YourMembershipMemberReferralEntity extends BaseEntity<YourMembershipMemberReferralEntityType> {
    /**
    * Loads the Member Referrals record from the database
    * @param ReferralId: number - primary key value to load the Member Referrals record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipMemberReferralEntity
    * @method
    * @override
    */
    public async Load(ReferralId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ReferralId', Value: ReferralId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ReferralId
    * * Display Name: Referral ID
    * * SQL Data Type: int
    */
    get ReferralId(): number {
        return this.Get('ReferralId');
    }
    set ReferralId(value: number) {
        this.Set('ReferralId', value);
    }

    /**
    * * Field Name: ReferrerID
    * * Display Name: Referrer
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)
    */
    get ReferrerID(): number | null {
        return this.Get('ReferrerID');
    }
    set ReferrerID(value: number | null) {
        this.Set('ReferrerID', value);
    }

    /**
    * * Field Name: ReferredID
    * * Display Name: Referred Member
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)
    */
    get ReferredID(): number | null {
        return this.Get('ReferredID');
    }
    set ReferredID(value: number | null) {
        this.Set('ReferredID', value);
    }

    /**
    * * Field Name: ReferralDate
    * * Display Name: Referral Date
    * * SQL Data Type: datetimeoffset
    */
    get ReferralDate(): Date | null {
        return this.Get('ReferralDate');
    }
    set ReferralDate(value: Date | null) {
        this.Set('ReferralDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(200)
    */
    get Status(): string | null {
        return this.Get('Status');
    }
    set Status(value: string | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Member Sub Accounts - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: MemberSubAccount
 * * Base View: vwMemberSubAccounts
 * * @description Sub-account relationships linking dependent members to primary accounts
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Member Sub Accounts')
export class YourMembershipMemberSubAccountEntity extends BaseEntity<YourMembershipMemberSubAccountEntityType> {
    /**
    * Loads the Member Sub Accounts record from the database
    * @param ID: number - primary key value to load the Member Sub Accounts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipMemberSubAccountEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)
    */
    get ID(): number {
        return this.Get('ID');
    }
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent Account
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)
    */
    get ParentID(): number | null {
        return this.Get('ParentID');
    }
    set ParentID(value: number | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: DateRegistered
    * * Display Name: Date Registered
    * * SQL Data Type: datetimeoffset
    */
    get DateRegistered(): Date | null {
        return this.Get('DateRegistered');
    }
    set DateRegistered(value: Date | null) {
        this.Set('DateRegistered', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Member Types - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: MemberType
 * * Base View: vwMemberTypes
 * * @description Classification types for members (e.g., Individual, Corporate, Student)
 * * Primary Keys: ID, TypeCode
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Member Types')
export class YourMembershipMemberTypeEntity extends BaseEntity<YourMembershipMemberTypeEntityType> {
    /**
    * Loads the Member Types record from the database
    * @param ID: number - primary key value to load the Member Types record.
    * @param TypeCode: string - primary key value to load the Member Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipMemberTypeEntity
    * @method
    * @override
    */
    public async Load(ID: number, TypeCode: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        compositeKey.KeyValuePairs.push({ FieldName: 'TypeCode', Value: TypeCode });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: TypeCode
    * * Display Name: Type Code
    * * SQL Data Type: nvarchar(200)
    */
    get TypeCode(): string | null {
        return this.Get('TypeCode');
    }
    set TypeCode(value: string | null) {
        this.Set('TypeCode', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: IsDefault
    * * Display Name: Is Default
    * * SQL Data Type: bit
    */
    get IsDefault(): boolean | null {
        return this.Get('IsDefault');
    }
    set IsDefault(value: boolean | null) {
        this.Set('IsDefault', value);
    }

    /**
    * * Field Name: PresetType
    * * Display Name: Preset Type
    * * SQL Data Type: nvarchar(200)
    */
    get PresetType(): string | null {
        return this.Get('PresetType');
    }
    set PresetType(value: string | null) {
        this.Set('PresetType', value);
    }

    /**
    * * Field Name: SortOrder
    * * Display Name: Sort Order
    * * SQL Data Type: int
    */
    get SortOrder(): number | null {
        return this.Get('SortOrder');
    }
    set SortOrder(value: number | null) {
        this.Set('SortOrder', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Members - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: Member
 * * Base View: vwMembers
 * * @description Organization members with profile, contact, and membership details
 * * Primary Key: ProfileID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Members')
export class YourMembershipMemberEntity extends BaseEntity<YourMembershipMemberEntityType> {
    /**
    * Loads the Members record from the database
    * @param ProfileID: number - primary key value to load the Members record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipMemberEntity
    * @method
    * @override
    */
    public async Load(ProfileID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ProfileID', Value: ProfileID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ProfileID
    * * Display Name: Profile ID
    * * SQL Data Type: int
    */
    get ProfileID(): number {
        return this.Get('ProfileID');
    }
    set ProfileID(value: number) {
        this.Set('ProfileID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(200)
    */
    get FirstName(): string | null {
        return this.Get('FirstName');
    }
    set FirstName(value: string | null) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(200)
    */
    get LastName(): string | null {
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: EmailAddr
    * * Display Name: Email Address
    * * SQL Data Type: nvarchar(200)
    */
    get EmailAddr(): string | null {
        return this.Get('EmailAddr');
    }
    set EmailAddr(value: string | null) {
        this.Set('EmailAddr', value);
    }

    /**
    * * Field Name: MemberTypeCode
    * * Display Name: Member Type
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Member Types (vwMemberTypes.TypeCode)
    */
    get MemberTypeCode(): string | null {
        return this.Get('MemberTypeCode');
    }
    set MemberTypeCode(value: string | null) {
        this.Set('MemberTypeCode', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(200)
    */
    get Status(): string | null {
        return this.Get('Status');
    }
    set Status(value: string | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(200)
    */
    get Organization(): string | null {
        return this.Get('Organization');
    }
    set Organization(value: string | null) {
        this.Set('Organization', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: nvarchar(200)
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Address1
    * * Display Name: Address Line 1
    * * SQL Data Type: nvarchar(200)
    */
    get Address1(): string | null {
        return this.Get('Address1');
    }
    set Address1(value: string | null) {
        this.Set('Address1', value);
    }

    /**
    * * Field Name: Address2
    * * Display Name: Address Line 2
    * * SQL Data Type: nvarchar(200)
    */
    get Address2(): string | null {
        return this.Get('Address2');
    }
    set Address2(value: string | null) {
        this.Set('Address2', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(200)
    */
    get City(): string | null {
        return this.Get('City');
    }
    set City(value: string | null) {
        this.Set('City', value);
    }

    /**
    * * Field Name: State
    * * Display Name: State
    * * SQL Data Type: nvarchar(200)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: PostalCode
    * * Display Name: Postal Code
    * * SQL Data Type: nvarchar(200)
    */
    get PostalCode(): string | null {
        return this.Get('PostalCode');
    }
    set PostalCode(value: string | null) {
        this.Set('PostalCode', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Countries (vwCountries.countryId)
    */
    get Country(): string | null {
        return this.Get('Country');
    }
    set Country(value: string | null) {
        this.Set('Country', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(200)
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: JoinDate
    * * Display Name: Join Date
    * * SQL Data Type: datetimeoffset
    */
    get JoinDate(): Date | null {
        return this.Get('JoinDate');
    }
    set JoinDate(value: Date | null) {
        this.Set('JoinDate', value);
    }

    /**
    * * Field Name: RenewalDate
    * * Display Name: Renewal Date
    * * SQL Data Type: datetimeoffset
    */
    get RenewalDate(): Date | null {
        return this.Get('RenewalDate');
    }
    set RenewalDate(value: Date | null) {
        this.Set('RenewalDate', value);
    }

    /**
    * * Field Name: ExpirationDate
    * * Display Name: Expiration Date
    * * SQL Data Type: datetimeoffset
    */
    get ExpirationDate(): Date | null {
        return this.Get('ExpirationDate');
    }
    set ExpirationDate(value: Date | null) {
        this.Set('ExpirationDate', value);
    }

    /**
    * * Field Name: MemberSinceDate
    * * Display Name: Member Since Date
    * * SQL Data Type: datetimeoffset
    */
    get MemberSinceDate(): Date | null {
        return this.Get('MemberSinceDate');
    }
    set MemberSinceDate(value: Date | null) {
        this.Set('MemberSinceDate', value);
    }

    /**
    * * Field Name: WebsiteUrl
    * * Display Name: Website URL
    * * SQL Data Type: nvarchar(500)
    */
    get WebsiteUrl(): string | null {
        return this.Get('WebsiteUrl');
    }
    set WebsiteUrl(value: string | null) {
        this.Set('WebsiteUrl', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Membership Modifiers - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: MembershipModifier
 * * Base View: vwMembershipModifiers
 * * @description Price modifier rules per membership plan (discounts, surcharges)
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Membership Modifiers')
export class YourMembershipMembershipModifierEntity extends BaseEntity<YourMembershipMembershipModifierEntityType> {
    /**
    * Loads the Membership Modifiers record from the database
    * @param ID: number - primary key value to load the Membership Modifiers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipMembershipModifierEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: MembershipID
    * * Display Name: Membership
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Memberships (vwMemberships.Id)
    */
    get MembershipID(): number | null {
        return this.Get('MembershipID');
    }
    set MembershipID(value: number | null) {
        this.Set('MembershipID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get Amount(): number | null {
        return this.Get('Amount');
    }
    set Amount(value: number | null) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Membership Promo Codes - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: MembershipPromoCode
 * * Base View: vwMembershipPromoCodes
 * * @description Promotional discount codes per membership plan with usage limits and expiration
 * * Primary Key: PromoCodeId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Membership Promo Codes')
export class YourMembershipMembershipPromoCodeEntity extends BaseEntity<YourMembershipMembershipPromoCodeEntityType> {
    /**
    * Loads the Membership Promo Codes record from the database
    * @param PromoCodeId: number - primary key value to load the Membership Promo Codes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipMembershipPromoCodeEntity
    * @method
    * @override
    */
    public async Load(PromoCodeId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'PromoCodeId', Value: PromoCodeId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: PromoCodeId
    * * Display Name: Promo Code ID
    * * SQL Data Type: int
    */
    get PromoCodeId(): number {
        return this.Get('PromoCodeId');
    }
    set PromoCodeId(value: number) {
        this.Set('PromoCodeId', value);
    }

    /**
    * * Field Name: MembershipID
    * * Display Name: Membership
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Memberships (vwMemberships.Id)
    */
    get MembershipID(): number | null {
        return this.Get('MembershipID');
    }
    set MembershipID(value: number | null) {
        this.Set('MembershipID', value);
    }

    /**
    * * Field Name: FriendlyName
    * * Display Name: Friendly Name
    * * SQL Data Type: nvarchar(200)
    */
    get FriendlyName(): string | null {
        return this.Get('FriendlyName');
    }
    set FriendlyName(value: string | null) {
        this.Set('FriendlyName', value);
    }

    /**
    * * Field Name: DiscountAmount
    * * Display Name: Discount Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get DiscountAmount(): number | null {
        return this.Get('DiscountAmount');
    }
    set DiscountAmount(value: number | null) {
        this.Set('DiscountAmount', value);
    }

    /**
    * * Field Name: ExpirationDate
    * * Display Name: Expiration Date
    * * SQL Data Type: datetimeoffset
    */
    get ExpirationDate(): Date | null {
        return this.Get('ExpirationDate');
    }
    set ExpirationDate(value: Date | null) {
        this.Set('ExpirationDate', value);
    }

    /**
    * * Field Name: UsageLimit
    * * Display Name: Usage Limit
    * * SQL Data Type: int
    */
    get UsageLimit(): number | null {
        return this.Get('UsageLimit');
    }
    set UsageLimit(value: number | null) {
        this.Set('UsageLimit', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Memberships - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: Membership
 * * Base View: vwMemberships
 * * @description Membership plans with dues amounts, proration rules, and invoice settings
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Memberships')
export class YourMembershipMembershipEntity extends BaseEntity<YourMembershipMembershipEntityType> {
    /**
    * Loads the Memberships record from the database
    * @param Id: number - primary key value to load the Memberships record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipMembershipEntity
    * @method
    * @override
    */
    public async Load(Id: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get Id(): number {
        return this.Get('Id');
    }
    set Id(value: number) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(200)
    */
    get Code(): string | null {
        return this.Get('Code');
    }
    set Code(value: string | null) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: DuesAmount
    * * Display Name: Dues Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get DuesAmount(): number | null {
        return this.Get('DuesAmount');
    }
    set DuesAmount(value: number | null) {
        this.Set('DuesAmount', value);
    }

    /**
    * * Field Name: ProRatedDues
    * * Display Name: Prorated Dues
    * * SQL Data Type: bit
    */
    get ProRatedDues(): boolean | null {
        return this.Get('ProRatedDues');
    }
    set ProRatedDues(value: boolean | null) {
        this.Set('ProRatedDues', value);
    }

    /**
    * * Field Name: AllowMultipleOpenInvoices
    * * Display Name: Allow Multiple Open Invoices
    * * SQL Data Type: bit
    */
    get AllowMultipleOpenInvoices(): boolean | null {
        return this.Get('AllowMultipleOpenInvoices');
    }
    set AllowMultipleOpenInvoices(value: boolean | null) {
        this.Set('AllowMultipleOpenInvoices', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Notes - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: Note
 * * Base View: vwNotes
 * * @description Notes and annotations attached to CRM records
 * * Primary Key: hs_object_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Notes')
export class HubSpotNoteEntity extends BaseEntity<HubSpotNoteEntityType> {
    /**
    * Loads the Notes record from the database
    * @param hs_object_id: string - primary key value to load the Notes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotNoteEntity
    * @method
    * @override
    */
    public async Load(hs_object_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'hs_object_id', Value: hs_object_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: hs_object_id
    * * Display Name: Note ID
    * * SQL Data Type: nvarchar(100)
    */
    get hs_object_id(): string {
        return this.Get('hs_object_id');
    }
    set hs_object_id(value: string) {
        this.Set('hs_object_id', value);
    }

    /**
    * * Field Name: hs_note_body
    * * Display Name: Note Body
    * * SQL Data Type: nvarchar(MAX)
    */
    get hs_note_body(): string | null {
        return this.Get('hs_note_body');
    }
    set hs_note_body(value: string | null) {
        this.Set('hs_note_body', value);
    }

    /**
    * * Field Name: hs_timestamp
    * * Display Name: Activity Date
    * * SQL Data Type: datetimeoffset
    */
    get hs_timestamp(): Date | null {
        return this.Get('hs_timestamp');
    }
    set hs_timestamp(value: Date | null) {
        this.Set('hs_timestamp', value);
    }

    /**
    * * Field Name: hubspot_owner_id
    * * Display Name: Owner
    * * SQL Data Type: nvarchar(100)
    */
    get hubspot_owner_id(): string | null {
        return this.Get('hubspot_owner_id');
    }
    set hubspot_owner_id(value: string | null) {
        this.Set('hubspot_owner_id', value);
    }

    /**
    * * Field Name: hs_attachment_ids
    * * Display Name: Attachments
    * * SQL Data Type: nvarchar(500)
    */
    get hs_attachment_ids(): string | null {
        return this.Get('hs_attachment_ids');
    }
    set hs_attachment_ids(value: string | null) {
        this.Set('hs_attachment_ids', value);
    }

    /**
    * * Field Name: hs_body_preview
    * * Display Name: Body Preview
    * * SQL Data Type: nvarchar(MAX)
    */
    get hs_body_preview(): string | null {
        return this.Get('hs_body_preview');
    }
    set hs_body_preview(value: string | null) {
        this.Set('hs_body_preview', value);
    }

    /**
    * * Field Name: hs_body_preview_is_truncated
    * * Display Name: Is Truncated
    * * SQL Data Type: bit
    */
    get hs_body_preview_is_truncated(): boolean | null {
        return this.Get('hs_body_preview_is_truncated');
    }
    set hs_body_preview_is_truncated(value: boolean | null) {
        this.Set('hs_body_preview_is_truncated', value);
    }

    /**
    * * Field Name: createdate
    * * Display Name: Created Date
    * * SQL Data Type: datetimeoffset
    */
    get createdate(): Date | null {
        return this.Get('createdate');
    }
    set createdate(value: Date | null) {
        this.Set('createdate', value);
    }

    /**
    * * Field Name: hs_lastmodifieddate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get hs_lastmodifieddate(): Date | null {
        return this.Get('hs_lastmodifieddate');
    }
    set hs_lastmodifieddate(value: Date | null) {
        this.Set('hs_lastmodifieddate', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Payment Processors - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: PaymentProcessor
 * * Base View: vwPaymentProcessors
 * * @description Configured payment processors with active/primary status and card order types
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Payment Processors')
export class YourMembershipPaymentProcessorEntity extends BaseEntity<YourMembershipPaymentProcessorEntityType> {
    /**
    * Loads the Payment Processors record from the database
    * @param Id: number - primary key value to load the Payment Processors record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipPaymentProcessorEntity
    * @method
    * @override
    */
    public async Load(Id: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get Id(): number {
        return this.Get('Id');
    }
    set Id(value: number) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Processor Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Active
    * * Display Name: Active
    * * SQL Data Type: bit
    */
    get Active(): boolean | null {
        return this.Get('Active');
    }
    set Active(value: boolean | null) {
        this.Set('Active', value);
    }

    /**
    * * Field Name: Primary
    * * Display Name: Primary
    * * SQL Data Type: bit
    */
    get Primary(): boolean | null {
        return this.Get('Primary');
    }
    set Primary(value: boolean | null) {
        this.Set('Primary', value);
    }

    /**
    * * Field Name: CardOrderType
    * * Display Name: Card Order Type
    * * SQL Data Type: nvarchar(200)
    */
    get CardOrderType(): string | null {
        return this.Get('CardOrderType');
    }
    set CardOrderType(value: string | null) {
        this.Set('CardOrderType', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Person IDs - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: PersonID
 * * Base View: vwPersonIDs
 * * @description Member and non-member identity records for data synchronization with timestamp support
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Person IDs')
export class YourMembershipPersonIDEntity extends BaseEntity<YourMembershipPersonIDEntityType> {
    /**
    * Loads the Person IDs record from the database
    * @param ID: number - primary key value to load the Person IDs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipPersonIDEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: UserType
    * * Display Name: User Type
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Member Types (vwMemberTypes.TypeCode)
    */
    get UserType(): string | null {
        return this.Get('UserType');
    }
    set UserType(value: string | null) {
        this.Set('UserType', value);
    }

    /**
    * * Field Name: DateRegistered
    * * Display Name: Date Registered
    * * SQL Data Type: datetimeoffset
    */
    get DateRegistered(): Date | null {
        return this.Get('DateRegistered');
    }
    set DateRegistered(value: Date | null) {
        this.Set('DateRegistered', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Product Categories - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: ProductCategory
 * * Base View: vwProductCategories
 * * @description Categories for organizing store products
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Product Categories')
export class YourMembershipProductCategoryEntity extends BaseEntity<YourMembershipProductCategoryEntityType> {
    /**
    * Loads the Product Categories record from the database
    * @param Id: number - primary key value to load the Product Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipProductCategoryEntity
    * @method
    * @override
    */
    public async Load(Id: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get Id(): number {
        return this.Get('Id');
    }
    set Id(value: number) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Products - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: Product
 * * Base View: vwProducts
 * * @description Store products available for purchase with pricing, inventory, and tax info
 * * Primary Key: id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Products')
export class YourMembershipProductEntity extends BaseEntity<YourMembershipProductEntityType> {
    /**
    * Loads the Products record from the database
    * @param id: number - primary key value to load the Products record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipProductEntity
    * @method
    * @override
    */
    public async Load(id: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'id', Value: id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: id
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get id(): number {
        return this.Get('id');
    }
    set id(value: number) {
        this.Set('id', value);
    }

    /**
    * * Field Name: description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    */
    get description(): string | null {
        return this.Get('description');
    }
    set description(value: string | null) {
        this.Set('description', value);
    }

    /**
    * * Field Name: amount
    * * Display Name: Price
    * * SQL Data Type: decimal(18, 2)
    */
    get amount(): number | null {
        return this.Get('amount');
    }
    set amount(value: number | null) {
        this.Set('amount', value);
    }

    /**
    * * Field Name: weight
    * * Display Name: Weight
    * * SQL Data Type: decimal(18, 2)
    */
    get weight(): number | null {
        return this.Get('weight');
    }
    set weight(value: number | null) {
        this.Set('weight', value);
    }

    /**
    * * Field Name: taxRate
    * * Display Name: Tax Rate
    * * SQL Data Type: decimal(18, 2)
    */
    get taxRate(): number | null {
        return this.Get('taxRate');
    }
    set taxRate(value: number | null) {
        this.Set('taxRate', value);
    }

    /**
    * * Field Name: quantity
    * * Display Name: Quantity
    * * SQL Data Type: int
    */
    get quantity(): number | null {
        return this.Get('quantity');
    }
    set quantity(value: number | null) {
        this.Set('quantity', value);
    }

    /**
    * * Field Name: ProductActive
    * * Display Name: Active
    * * SQL Data Type: bit
    */
    get ProductActive(): boolean | null {
        return this.Get('ProductActive');
    }
    set ProductActive(value: boolean | null) {
        this.Set('ProductActive', value);
    }

    /**
    * * Field Name: IsFeatured
    * * Display Name: Is Featured
    * * SQL Data Type: bit
    */
    get IsFeatured(): boolean | null {
        return this.Get('IsFeatured');
    }
    set IsFeatured(value: boolean | null) {
        this.Set('IsFeatured', value);
    }

    /**
    * * Field Name: ListInStore
    * * Display Name: List In Store
    * * SQL Data Type: bit
    */
    get ListInStore(): boolean | null {
        return this.Get('ListInStore');
    }
    set ListInStore(value: boolean | null) {
        this.Set('ListInStore', value);
    }

    /**
    * * Field Name: taxable
    * * Display Name: Taxable
    * * SQL Data Type: bit
    */
    get taxable(): boolean | null {
        return this.Get('taxable');
    }
    set taxable(value: boolean | null) {
        this.Set('taxable', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Products__HubSpot - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: Product
 * * Base View: vwProducts__HubSpot
 * * @description Product catalog with pricing, SKU, and billing information
 * * Primary Key: hs_object_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Products__HubSpot')
export class HubSpotProduct__HubSpotEntity extends BaseEntity<HubSpotProduct__HubSpotEntityType> {
    /**
    * Loads the Products__HubSpot record from the database
    * @param hs_object_id: string - primary key value to load the Products__HubSpot record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotProduct__HubSpotEntity
    * @method
    * @override
    */
    public async Load(hs_object_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'hs_object_id', Value: hs_object_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: hs_object_id
    * * Display Name: HubSpot Object ID
    * * SQL Data Type: nvarchar(100)
    */
    get hs_object_id(): string {
        return this.Get('hs_object_id');
    }
    set hs_object_id(value: string) {
        this.Set('hs_object_id', value);
    }

    /**
    * * Field Name: name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(500)
    */
    get name(): string | null {
        return this.Get('name');
    }
    set name(value: string | null) {
        this.Set('name', value);
    }

    /**
    * * Field Name: description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get description(): string | null {
        return this.Get('description');
    }
    set description(value: string | null) {
        this.Set('description', value);
    }

    /**
    * * Field Name: price
    * * Display Name: Price
    * * SQL Data Type: decimal(18, 2)
    */
    get price(): number | null {
        return this.Get('price');
    }
    set price(value: number | null) {
        this.Set('price', value);
    }

    /**
    * * Field Name: hs_cost_of_goods_sold
    * * Display Name: Cost of Goods Sold
    * * SQL Data Type: decimal(18, 2)
    */
    get hs_cost_of_goods_sold(): number | null {
        return this.Get('hs_cost_of_goods_sold');
    }
    set hs_cost_of_goods_sold(value: number | null) {
        this.Set('hs_cost_of_goods_sold', value);
    }

    /**
    * * Field Name: hs_recurring_billing_period
    * * Display Name: Recurring Billing Period
    * * SQL Data Type: nvarchar(500)
    */
    get hs_recurring_billing_period(): string | null {
        return this.Get('hs_recurring_billing_period');
    }
    set hs_recurring_billing_period(value: string | null) {
        this.Set('hs_recurring_billing_period', value);
    }

    /**
    * * Field Name: hs_sku
    * * Display Name: SKU
    * * SQL Data Type: nvarchar(500)
    */
    get hs_sku(): string | null {
        return this.Get('hs_sku');
    }
    set hs_sku(value: string | null) {
        this.Set('hs_sku', value);
    }

    /**
    * * Field Name: tax
    * * Display Name: Tax
    * * SQL Data Type: decimal(18, 2)
    */
    get tax(): number | null {
        return this.Get('tax');
    }
    set tax(value: number | null) {
        this.Set('tax', value);
    }

    /**
    * * Field Name: createdate
    * * Display Name: HubSpot Created Date
    * * SQL Data Type: datetimeoffset
    */
    get createdate(): Date | null {
        return this.Get('createdate');
    }
    set createdate(value: Date | null) {
        this.Set('createdate', value);
    }

    /**
    * * Field Name: hs_lastmodifieddate
    * * Display Name: HubSpot Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get hs_lastmodifieddate(): Date | null {
        return this.Get('hs_lastmodifieddate');
    }
    set hs_lastmodifieddate(value: Date | null) {
        this.Set('hs_lastmodifieddate', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * QB Classes - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: QBClass
 * * Base View: vwQBClasses
 * * @description QuickBooks class definitions for accounting integration and financial categorization
 * * Primary Key: Id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'QB Classes')
export class YourMembershipQBClassEntity extends BaseEntity<YourMembershipQBClassEntityType> {
    /**
    * Loads the QB Classes record from the database
    * @param Id: number - primary key value to load the QB Classes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipQBClassEntity
    * @method
    * @override
    */
    public async Load(Id: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'Id', Value: Id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Id
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get Id(): number {
        return this.Get('Id');
    }
    set Id(value: number) {
        this.Set('Id', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Class Name
    * * SQL Data Type: nvarchar(200)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Quote Contacts - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: QuoteContact
 * * Base View: vwQuoteContacts
 * * @description Many-to-many associations between quotes and contacts
 * * Primary Keys: quote_id, contact_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Quote Contacts')
export class HubSpotQuoteContactEntity extends BaseEntity<HubSpotQuoteContactEntityType> {
    /**
    * Loads the Quote Contacts record from the database
    * @param quote_id: string - primary key value to load the Quote Contacts record.
    * @param contact_id: string - primary key value to load the Quote Contacts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotQuoteContactEntity
    * @method
    * @override
    */
    public async Load(quote_id: string, contact_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'quote_id', Value: quote_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'contact_id', Value: contact_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: quote_id
    * * Display Name: Quote
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Quotes (vwQuotes.hs_object_id)
    * * Description: HubSpot Quote hs_object_id
    */
    get quote_id(): string {
        return this.Get('quote_id');
    }
    set quote_id(value: string) {
        this.Set('quote_id', value);
    }

    /**
    * * Field Name: contact_id
    * * Display Name: Contact
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Contacts (vwContacts.hs_object_id)
    * * Description: HubSpot Contact hs_object_id
    */
    get contact_id(): string {
        return this.Get('contact_id');
    }
    set contact_id(value: string) {
        this.Set('contact_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Quote Line Items - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: QuoteLineItem
 * * Base View: vwQuoteLineItems
 * * @description Many-to-many associations between quotes and line items
 * * Primary Keys: quote_id, line_item_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Quote Line Items')
export class HubSpotQuoteLineItemEntity extends BaseEntity<HubSpotQuoteLineItemEntityType> {
    /**
    * Loads the Quote Line Items record from the database
    * @param quote_id: string - primary key value to load the Quote Line Items record.
    * @param line_item_id: string - primary key value to load the Quote Line Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotQuoteLineItemEntity
    * @method
    * @override
    */
    public async Load(quote_id: string, line_item_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'quote_id', Value: quote_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'line_item_id', Value: line_item_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: quote_id
    * * Display Name: Quote
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Quotes (vwQuotes.hs_object_id)
    * * Description: HubSpot Quote hs_object_id
    */
    get quote_id(): string {
        return this.Get('quote_id');
    }
    set quote_id(value: string) {
        this.Set('quote_id', value);
    }

    /**
    * * Field Name: line_item_id
    * * Display Name: Line Item
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Line Items (vwLineItems.hs_object_id)
    * * Description: HubSpot LineItem hs_object_id
    */
    get line_item_id(): string {
        return this.Get('line_item_id');
    }
    set line_item_id(value: string) {
        this.Set('line_item_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Quotes - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: Quote
 * * Base View: vwQuotes
 * * @description Sales quotes with pricing, sender details, and expiration tracking
 * * Primary Key: hs_object_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Quotes')
export class HubSpotQuoteEntity extends BaseEntity<HubSpotQuoteEntityType> {
    /**
    * Loads the Quotes record from the database
    * @param hs_object_id: string - primary key value to load the Quotes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotQuoteEntity
    * @method
    * @override
    */
    public async Load(hs_object_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'hs_object_id', Value: hs_object_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: hs_object_id
    * * Display Name: Quote ID
    * * SQL Data Type: nvarchar(100)
    */
    get hs_object_id(): string {
        return this.Get('hs_object_id');
    }
    set hs_object_id(value: string) {
        this.Set('hs_object_id', value);
    }

    /**
    * * Field Name: hs_title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(500)
    */
    get hs_title(): string | null {
        return this.Get('hs_title');
    }
    set hs_title(value: string | null) {
        this.Set('hs_title', value);
    }

    /**
    * * Field Name: hs_expiration_date
    * * Display Name: Expiration Date
    * * SQL Data Type: datetimeoffset
    */
    get hs_expiration_date(): Date | null {
        return this.Get('hs_expiration_date');
    }
    set hs_expiration_date(value: Date | null) {
        this.Set('hs_expiration_date', value);
    }

    /**
    * * Field Name: hs_status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(500)
    */
    get hs_status(): string | null {
        return this.Get('hs_status');
    }
    set hs_status(value: string | null) {
        this.Set('hs_status', value);
    }

    /**
    * * Field Name: hs_quote_amount
    * * Display Name: Quote Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get hs_quote_amount(): number | null {
        return this.Get('hs_quote_amount');
    }
    set hs_quote_amount(value: number | null) {
        this.Set('hs_quote_amount', value);
    }

    /**
    * * Field Name: hs_currency
    * * Display Name: Currency
    * * SQL Data Type: nvarchar(500)
    */
    get hs_currency(): string | null {
        return this.Get('hs_currency');
    }
    set hs_currency(value: string | null) {
        this.Set('hs_currency', value);
    }

    /**
    * * Field Name: hs_sender_firstname
    * * Display Name: Sender First Name
    * * SQL Data Type: nvarchar(500)
    */
    get hs_sender_firstname(): string | null {
        return this.Get('hs_sender_firstname');
    }
    set hs_sender_firstname(value: string | null) {
        this.Set('hs_sender_firstname', value);
    }

    /**
    * * Field Name: hs_sender_lastname
    * * Display Name: Sender Last Name
    * * SQL Data Type: nvarchar(500)
    */
    get hs_sender_lastname(): string | null {
        return this.Get('hs_sender_lastname');
    }
    set hs_sender_lastname(value: string | null) {
        this.Set('hs_sender_lastname', value);
    }

    /**
    * * Field Name: hs_sender_email
    * * Display Name: Sender Email
    * * SQL Data Type: nvarchar(500)
    * * Related Entity/Foreign Key: Members (vwMembers.EmailAddr)
    */
    get hs_sender_email(): string | null {
        return this.Get('hs_sender_email');
    }
    set hs_sender_email(value: string | null) {
        this.Set('hs_sender_email', value);
    }

    /**
    * * Field Name: hs_sender_company_name
    * * Display Name: Sender Company Name
    * * SQL Data Type: nvarchar(500)
    */
    get hs_sender_company_name(): string | null {
        return this.Get('hs_sender_company_name');
    }
    set hs_sender_company_name(value: string | null) {
        this.Set('hs_sender_company_name', value);
    }

    /**
    * * Field Name: hs_language
    * * Display Name: Language
    * * SQL Data Type: nvarchar(500)
    */
    get hs_language(): string | null {
        return this.Get('hs_language');
    }
    set hs_language(value: string | null) {
        this.Set('hs_language', value);
    }

    /**
    * * Field Name: hs_locale
    * * Display Name: Locale
    * * SQL Data Type: nvarchar(500)
    */
    get hs_locale(): string | null {
        return this.Get('hs_locale');
    }
    set hs_locale(value: string | null) {
        this.Set('hs_locale', value);
    }

    /**
    * * Field Name: hs_slug
    * * Display Name: URL Slug
    * * SQL Data Type: nvarchar(500)
    */
    get hs_slug(): string | null {
        return this.Get('hs_slug');
    }
    set hs_slug(value: string | null) {
        this.Set('hs_slug', value);
    }

    /**
    * * Field Name: hs_public_url_key
    * * Display Name: Public URL Key
    * * SQL Data Type: nvarchar(500)
    */
    get hs_public_url_key(): string | null {
        return this.Get('hs_public_url_key');
    }
    set hs_public_url_key(value: string | null) {
        this.Set('hs_public_url_key', value);
    }

    /**
    * * Field Name: createdate
    * * Display Name: HubSpot Created Date
    * * SQL Data Type: datetimeoffset
    */
    get createdate(): Date | null {
        return this.Get('createdate');
    }
    set createdate(value: Date | null) {
        this.Set('createdate', value);
    }

    /**
    * * Field Name: hs_lastmodifieddate
    * * Display Name: HubSpot Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get hs_lastmodifieddate(): Date | null {
        return this.Get('hs_lastmodifieddate');
    }
    set hs_lastmodifieddate(value: Date | null) {
        this.Set('hs_lastmodifieddate', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Shipping Methods - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: ShippingMethod
 * * Base View: vwShippingMethods
 * * @description Shipping method definitions with base pricing and weight-based rates
 * * Primary Key: id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Shipping Methods')
export class YourMembershipShippingMethodEntity extends BaseEntity<YourMembershipShippingMethodEntityType> {
    /**
    * Loads the Shipping Methods record from the database
    * @param id: number - primary key value to load the Shipping Methods record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipShippingMethodEntity
    * @method
    * @override
    */
    public async Load(id: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'id', Value: id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: id
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get id(): number {
        return this.Get('id');
    }
    set id(value: number) {
        this.Set('id', value);
    }

    /**
    * * Field Name: method
    * * Display Name: Shipping Method
    * * SQL Data Type: nvarchar(200)
    */
    get method(): string | null {
        return this.Get('method');
    }
    set method(value: string | null) {
        this.Set('method', value);
    }

    /**
    * * Field Name: basePrice
    * * Display Name: Base Price
    * * SQL Data Type: decimal(18, 2)
    */
    get basePrice(): number | null {
        return this.Get('basePrice');
    }
    set basePrice(value: number | null) {
        this.Set('basePrice', value);
    }

    /**
    * * Field Name: pricePerWeightUnit
    * * Display Name: Price Per Weight Unit
    * * SQL Data Type: decimal(18, 2)
    */
    get pricePerWeightUnit(): number | null {
        return this.Get('pricePerWeightUnit');
    }
    set pricePerWeightUnit(value: number | null) {
        this.Set('pricePerWeightUnit', value);
    }

    /**
    * * Field Name: isDefault
    * * Display Name: Default Method
    * * SQL Data Type: bit
    */
    get isDefault(): boolean | null {
        return this.Get('isDefault');
    }
    set isDefault(value: boolean | null) {
        this.Set('isDefault', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Sponsor Rotators - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: SponsorRotator
 * * Base View: vwSponsorRotators
 * * @description Sponsor advertisement rotator configurations with display settings
 * * Primary Key: RotatorId
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Sponsor Rotators')
export class YourMembershipSponsorRotatorEntity extends BaseEntity<YourMembershipSponsorRotatorEntityType> {
    /**
    * Loads the Sponsor Rotators record from the database
    * @param RotatorId: number - primary key value to load the Sponsor Rotators record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipSponsorRotatorEntity
    * @method
    * @override
    */
    public async Load(RotatorId: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'RotatorId', Value: RotatorId });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: RotatorId
    * * Display Name: Rotator ID
    * * SQL Data Type: int
    */
    get RotatorId(): number {
        return this.Get('RotatorId');
    }
    set RotatorId(value: number) {
        this.Set('RotatorId', value);
    }

    /**
    * * Field Name: AutoScroll
    * * Display Name: Auto Scroll
    * * SQL Data Type: bit
    */
    get AutoScroll(): boolean | null {
        return this.Get('AutoScroll');
    }
    set AutoScroll(value: boolean | null) {
        this.Set('AutoScroll', value);
    }

    /**
    * * Field Name: Random
    * * Display Name: Randomize Order
    * * SQL Data Type: bit
    */
    get Random(): boolean | null {
        return this.Get('Random');
    }
    set Random(value: boolean | null) {
        this.Set('Random', value);
    }

    /**
    * * Field Name: DateAdded
    * * Display Name: Date Added
    * * SQL Data Type: datetimeoffset
    */
    get DateAdded(): Date | null {
        return this.Get('DateAdded');
    }
    set DateAdded(value: Date | null) {
        this.Set('DateAdded', value);
    }

    /**
    * * Field Name: Mode
    * * Display Name: Display Mode
    * * SQL Data Type: int
    */
    get Mode(): number | null {
        return this.Get('Mode');
    }
    set Mode(value: number | null) {
        this.Set('Mode', value);
    }

    /**
    * * Field Name: Orientation
    * * Display Name: Orientation
    * * SQL Data Type: nvarchar(200)
    */
    get Orientation(): string | null {
        return this.Get('Orientation');
    }
    set Orientation(value: string | null) {
        this.Set('Orientation', value);
    }

    /**
    * * Field Name: SchoolId
    * * Display Name: School
    * * SQL Data Type: int
    */
    get SchoolId(): number | null {
        return this.Get('SchoolId');
    }
    set SchoolId(value: number | null) {
        this.Set('SchoolId', value);
    }

    /**
    * * Field Name: Speed
    * * Display Name: Scroll Speed
    * * SQL Data Type: int
    */
    get Speed(): number | null {
        return this.Get('Speed');
    }
    set Speed(value: number | null) {
        this.Set('Speed', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(200)
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: ClientId
    * * Display Name: Client
    * * SQL Data Type: int
    */
    get ClientId(): number | null {
        return this.Get('ClientId');
    }
    set ClientId(value: number | null) {
        this.Set('ClientId', value);
    }

    /**
    * * Field Name: Heading
    * * Display Name: Heading
    * * SQL Data Type: nvarchar(200)
    */
    get Heading(): string | null {
        return this.Get('Heading');
    }
    set Heading(value: string | null) {
        this.Set('Heading', value);
    }

    /**
    * * Field Name: Height
    * * Display Name: Display Height
    * * SQL Data Type: int
    */
    get Height(): number | null {
        return this.Get('Height');
    }
    set Height(value: number | null) {
        this.Set('Height', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Store Order Details - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: StoreOrderDetail
 * * Base View: vwStoreOrderDetails
 * * @description Individual line items within store orders with product, pricing, and quantity details
 * * Primary Key: OrderDetailID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Store Order Details')
export class YourMembershipStoreOrderDetailEntity extends BaseEntity<YourMembershipStoreOrderDetailEntityType> {
    /**
    * Loads the Store Order Details record from the database
    * @param OrderDetailID: number - primary key value to load the Store Order Details record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipStoreOrderDetailEntity
    * @method
    * @override
    */
    public async Load(OrderDetailID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'OrderDetailID', Value: OrderDetailID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: OrderDetailID
    * * Display Name: Order Detail ID
    * * SQL Data Type: int
    */
    get OrderDetailID(): number {
        return this.Get('OrderDetailID');
    }
    set OrderDetailID(value: number) {
        this.Set('OrderDetailID', value);
    }

    /**
    * * Field Name: OrderID
    * * Display Name: Order
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Store Orders (vwStoreOrders.OrderID)
    */
    get OrderID(): number | null {
        return this.Get('OrderID');
    }
    set OrderID(value: number | null) {
        this.Set('OrderID', value);
    }

    /**
    * * Field Name: WebsiteMemberID
    * * Display Name: Website Member
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)
    */
    get WebsiteMemberID(): number | null {
        return this.Get('WebsiteMemberID');
    }
    set WebsiteMemberID(value: number | null) {
        this.Set('WebsiteMemberID', value);
    }

    /**
    * * Field Name: ProductName
    * * Display Name: Product Name
    * * SQL Data Type: nvarchar(200)
    */
    get ProductName(): string | null {
        return this.Get('ProductName');
    }
    set ProductName(value: string | null) {
        this.Set('ProductName', value);
    }

    /**
    * * Field Name: Quantity
    * * Display Name: Quantity
    * * SQL Data Type: int
    */
    get Quantity(): number | null {
        return this.Get('Quantity');
    }
    set Quantity(value: number | null) {
        this.Set('Quantity', value);
    }

    /**
    * * Field Name: UnitPrice
    * * Display Name: Unit Price
    * * SQL Data Type: decimal(18, 2)
    */
    get UnitPrice(): number | null {
        return this.Get('UnitPrice');
    }
    set UnitPrice(value: number | null) {
        this.Set('UnitPrice', value);
    }

    /**
    * * Field Name: TotalPrice
    * * Display Name: Total Price
    * * SQL Data Type: decimal(18, 2)
    */
    get TotalPrice(): number | null {
        return this.Get('TotalPrice');
    }
    set TotalPrice(value: number | null) {
        this.Set('TotalPrice', value);
    }

    /**
    * * Field Name: OrderDate
    * * Display Name: Order Date
    * * SQL Data Type: datetimeoffset
    */
    get OrderDate(): Date | null {
        return this.Get('OrderDate');
    }
    set OrderDate(value: Date | null) {
        this.Set('OrderDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(200)
    */
    get Status(): string | null {
        return this.Get('Status');
    }
    set Status(value: string | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ShippingMethod
    * * Display Name: Shipping Method
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Shipping Methods (vwShippingMethods.id)
    */
    get ShippingMethod(): string | null {
        return this.Get('ShippingMethod');
    }
    set ShippingMethod(value: string | null) {
        this.Set('ShippingMethod', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Store Orders - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: StoreOrder
 * * Base View: vwStoreOrders
 * * @description Online store order headers with order date, status, and shipping info
 * * Primary Key: OrderID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Store Orders')
export class YourMembershipStoreOrderEntity extends BaseEntity<YourMembershipStoreOrderEntityType> {
    /**
    * Loads the Store Orders record from the database
    * @param OrderID: number - primary key value to load the Store Orders record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipStoreOrderEntity
    * @method
    * @override
    */
    public async Load(OrderID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'OrderID', Value: OrderID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: OrderID
    * * Display Name: Order ID
    * * SQL Data Type: int
    */
    get OrderID(): number {
        return this.Get('OrderID');
    }
    set OrderID(value: number) {
        this.Set('OrderID', value);
    }

    /**
    * * Field Name: WebsiteMemberID
    * * Display Name: Member
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Members (vwMembers.ProfileID)
    */
    get WebsiteMemberID(): number | null {
        return this.Get('WebsiteMemberID');
    }
    set WebsiteMemberID(value: number | null) {
        this.Set('WebsiteMemberID', value);
    }

    /**
    * * Field Name: OrderDate
    * * Display Name: Order Date
    * * SQL Data Type: datetimeoffset
    */
    get OrderDate(): Date | null {
        return this.Get('OrderDate');
    }
    set OrderDate(value: Date | null) {
        this.Set('OrderDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(200)
    */
    get Status(): string | null {
        return this.Get('Status');
    }
    set Status(value: string | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: TotalAmount
    * * Display Name: Total Amount
    * * SQL Data Type: decimal(18, 2)
    */
    get TotalAmount(): number | null {
        return this.Get('TotalAmount');
    }
    set TotalAmount(value: number | null) {
        this.Set('TotalAmount', value);
    }

    /**
    * * Field Name: ShippingMethod
    * * Display Name: Shipping Method
    * * SQL Data Type: nvarchar(200)
    * * Related Entity/Foreign Key: Shipping Methods (vwShippingMethods.id)
    */
    get ShippingMethod(): string | null {
        return this.Get('ShippingMethod');
    }
    set ShippingMethod(value: string | null) {
        this.Set('ShippingMethod', value);
    }

    /**
    * * Field Name: TrackingNumber
    * * Display Name: Tracking Number
    * * SQL Data Type: nvarchar(200)
    */
    get TrackingNumber(): string | null {
        return this.Get('TrackingNumber');
    }
    set TrackingNumber(value: string | null) {
        this.Set('TrackingNumber', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Tasks - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: Task
 * * Base View: vwTasks
 * * @description To-do tasks with status, priority, and completion tracking
 * * Primary Key: hs_object_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Tasks')
export class HubSpotTaskEntity extends BaseEntity<HubSpotTaskEntityType> {
    /**
    * Loads the Tasks record from the database
    * @param hs_object_id: string - primary key value to load the Tasks record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotTaskEntity
    * @method
    * @override
    */
    public async Load(hs_object_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'hs_object_id', Value: hs_object_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: hs_object_id
    * * Display Name: Object ID
    * * SQL Data Type: nvarchar(100)
    */
    get hs_object_id(): string {
        return this.Get('hs_object_id');
    }
    set hs_object_id(value: string) {
        this.Set('hs_object_id', value);
    }

    /**
    * * Field Name: hs_task_subject
    * * Display Name: Subject
    * * SQL Data Type: nvarchar(500)
    */
    get hs_task_subject(): string | null {
        return this.Get('hs_task_subject');
    }
    set hs_task_subject(value: string | null) {
        this.Set('hs_task_subject', value);
    }

    /**
    * * Field Name: hs_task_body
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get hs_task_body(): string | null {
        return this.Get('hs_task_body');
    }
    set hs_task_body(value: string | null) {
        this.Set('hs_task_body', value);
    }

    /**
    * * Field Name: hs_task_status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(500)
    */
    get hs_task_status(): string | null {
        return this.Get('hs_task_status');
    }
    set hs_task_status(value: string | null) {
        this.Set('hs_task_status', value);
    }

    /**
    * * Field Name: hs_task_priority
    * * Display Name: Priority
    * * SQL Data Type: nvarchar(500)
    */
    get hs_task_priority(): string | null {
        return this.Get('hs_task_priority');
    }
    set hs_task_priority(value: string | null) {
        this.Set('hs_task_priority', value);
    }

    /**
    * * Field Name: hs_task_type
    * * Display Name: Task Type
    * * SQL Data Type: nvarchar(500)
    */
    get hs_task_type(): string | null {
        return this.Get('hs_task_type');
    }
    set hs_task_type(value: string | null) {
        this.Set('hs_task_type', value);
    }

    /**
    * * Field Name: hs_timestamp
    * * Display Name: Due Date
    * * SQL Data Type: datetimeoffset
    */
    get hs_timestamp(): Date | null {
        return this.Get('hs_timestamp');
    }
    set hs_timestamp(value: Date | null) {
        this.Set('hs_timestamp', value);
    }

    /**
    * * Field Name: hs_task_completion_date
    * * Display Name: Completion Date
    * * SQL Data Type: nvarchar(255)
    */
    get hs_task_completion_date(): string | null {
        return this.Get('hs_task_completion_date');
    }
    set hs_task_completion_date(value: string | null) {
        this.Set('hs_task_completion_date', value);
    }

    /**
    * * Field Name: hs_queue_membership_ids
    * * Display Name: Queue Memberships
    * * SQL Data Type: nvarchar(500)
    */
    get hs_queue_membership_ids(): string | null {
        return this.Get('hs_queue_membership_ids');
    }
    set hs_queue_membership_ids(value: string | null) {
        this.Set('hs_queue_membership_ids', value);
    }

    /**
    * * Field Name: hubspot_owner_id
    * * Display Name: Owner
    * * SQL Data Type: nvarchar(100)
    */
    get hubspot_owner_id(): string | null {
        return this.Get('hubspot_owner_id');
    }
    set hubspot_owner_id(value: string | null) {
        this.Set('hubspot_owner_id', value);
    }

    /**
    * * Field Name: createdate
    * * Display Name: Created Date
    * * SQL Data Type: datetimeoffset
    */
    get createdate(): Date | null {
        return this.Get('createdate');
    }
    set createdate(value: Date | null) {
        this.Set('createdate', value);
    }

    /**
    * * Field Name: hs_lastmodifieddate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get hs_lastmodifieddate(): Date | null {
        return this.Get('hs_lastmodifieddate');
    }
    set hs_lastmodifieddate(value: Date | null) {
        this.Set('hs_lastmodifieddate', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Ticket Calls - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: TicketCall
 * * Base View: vwTicketCalls
 * * @description Associations between tickets and logged calls
 * * Primary Keys: ticket_id, call_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Ticket Calls')
export class HubSpotTicketCallEntity extends BaseEntity<HubSpotTicketCallEntityType> {
    /**
    * Loads the Ticket Calls record from the database
    * @param ticket_id: string - primary key value to load the Ticket Calls record.
    * @param call_id: string - primary key value to load the Ticket Calls record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotTicketCallEntity
    * @method
    * @override
    */
    public async Load(ticket_id: string, call_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ticket_id', Value: ticket_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'call_id', Value: call_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ticket_id
    * * Display Name: Ticket
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Tickets (vwTickets.hs_object_id)
    * * Description: HubSpot Ticket hs_object_id
    */
    get ticket_id(): string {
        return this.Get('ticket_id');
    }
    set ticket_id(value: string) {
        this.Set('ticket_id', value);
    }

    /**
    * * Field Name: call_id
    * * Display Name: Call
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Calls (vwCalls.hs_object_id)
    * * Description: HubSpot Call hs_object_id
    */
    get call_id(): string {
        return this.Get('call_id');
    }
    set call_id(value: string) {
        this.Set('call_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Ticket Emails - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: TicketEmail
 * * Base View: vwTicketEmails
 * * @description Associations between tickets and logged emails
 * * Primary Keys: ticket_id, email_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Ticket Emails')
export class HubSpotTicketEmailEntity extends BaseEntity<HubSpotTicketEmailEntityType> {
    /**
    * Loads the Ticket Emails record from the database
    * @param ticket_id: string - primary key value to load the Ticket Emails record.
    * @param email_id: string - primary key value to load the Ticket Emails record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotTicketEmailEntity
    * @method
    * @override
    */
    public async Load(ticket_id: string, email_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ticket_id', Value: ticket_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'email_id', Value: email_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ticket_id
    * * Display Name: Ticket
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Tickets (vwTickets.hs_object_id)
    * * Description: HubSpot Ticket hs_object_id
    */
    get ticket_id(): string {
        return this.Get('ticket_id');
    }
    set ticket_id(value: string) {
        this.Set('ticket_id', value);
    }

    /**
    * * Field Name: email_id
    * * Display Name: Email
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Emails (vwEmails.hs_object_id)
    * * Description: HubSpot Email hs_object_id
    */
    get email_id(): string {
        return this.Get('email_id');
    }
    set email_id(value: string) {
        this.Set('email_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Ticket Feedback Submissions - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: TicketFeedbackSubmission
 * * Base View: vwTicketFeedbackSubmissions
 * * @description Associations between tickets and feedback submissions
 * * Primary Keys: ticket_id, feedback_submission_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Ticket Feedback Submissions')
export class HubSpotTicketFeedbackSubmissionEntity extends BaseEntity<HubSpotTicketFeedbackSubmissionEntityType> {
    /**
    * Loads the Ticket Feedback Submissions record from the database
    * @param ticket_id: string - primary key value to load the Ticket Feedback Submissions record.
    * @param feedback_submission_id: string - primary key value to load the Ticket Feedback Submissions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotTicketFeedbackSubmissionEntity
    * @method
    * @override
    */
    public async Load(ticket_id: string, feedback_submission_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ticket_id', Value: ticket_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'feedback_submission_id', Value: feedback_submission_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ticket_id
    * * Display Name: Ticket
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Tickets (vwTickets.hs_object_id)
    * * Description: HubSpot Ticket hs_object_id
    */
    get ticket_id(): string {
        return this.Get('ticket_id');
    }
    set ticket_id(value: string) {
        this.Set('ticket_id', value);
    }

    /**
    * * Field Name: feedback_submission_id
    * * Display Name: Feedback Submission
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Feedback Submissions (vwFeedbackSubmissions.hs_object_id)
    * * Description: HubSpot FeedbackSubmission hs_object_id
    */
    get feedback_submission_id(): string {
        return this.Get('feedback_submission_id');
    }
    set feedback_submission_id(value: string) {
        this.Set('feedback_submission_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Ticket Meetings - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: TicketMeeting
 * * Base View: vwTicketMeetings
 * * @description Associations between tickets and meetings
 * * Primary Keys: ticket_id, meeting_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Ticket Meetings')
export class HubSpotTicketMeetingEntity extends BaseEntity<HubSpotTicketMeetingEntityType> {
    /**
    * Loads the Ticket Meetings record from the database
    * @param ticket_id: string - primary key value to load the Ticket Meetings record.
    * @param meeting_id: string - primary key value to load the Ticket Meetings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotTicketMeetingEntity
    * @method
    * @override
    */
    public async Load(ticket_id: string, meeting_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ticket_id', Value: ticket_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'meeting_id', Value: meeting_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ticket_id
    * * Display Name: Ticket
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Tickets (vwTickets.hs_object_id)
    * * Description: HubSpot Ticket hs_object_id
    */
    get ticket_id(): string {
        return this.Get('ticket_id');
    }
    set ticket_id(value: string) {
        this.Set('ticket_id', value);
    }

    /**
    * * Field Name: meeting_id
    * * Display Name: Meeting
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Meetings (vwMeetings.hs_object_id)
    * * Description: HubSpot Meeting hs_object_id
    */
    get meeting_id(): string {
        return this.Get('meeting_id');
    }
    set meeting_id(value: string) {
        this.Set('meeting_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Ticket Notes - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: TicketNote
 * * Base View: vwTicketNotes
 * * @description Associations between tickets and notes
 * * Primary Keys: ticket_id, note_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Ticket Notes')
export class HubSpotTicketNoteEntity extends BaseEntity<HubSpotTicketNoteEntityType> {
    /**
    * Loads the Ticket Notes record from the database
    * @param ticket_id: string - primary key value to load the Ticket Notes record.
    * @param note_id: string - primary key value to load the Ticket Notes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotTicketNoteEntity
    * @method
    * @override
    */
    public async Load(ticket_id: string, note_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ticket_id', Value: ticket_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'note_id', Value: note_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ticket_id
    * * Display Name: Ticket
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Tickets (vwTickets.hs_object_id)
    * * Description: HubSpot Ticket hs_object_id
    */
    get ticket_id(): string {
        return this.Get('ticket_id');
    }
    set ticket_id(value: string) {
        this.Set('ticket_id', value);
    }

    /**
    * * Field Name: note_id
    * * Display Name: Note
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Notes (vwNotes.hs_object_id)
    * * Description: HubSpot Note hs_object_id
    */
    get note_id(): string {
        return this.Get('note_id');
    }
    set note_id(value: string) {
        this.Set('note_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Ticket Tasks - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: TicketTask
 * * Base View: vwTicketTasks
 * * @description Associations between tickets and tasks
 * * Primary Keys: ticket_id, task_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Ticket Tasks')
export class HubSpotTicketTaskEntity extends BaseEntity<HubSpotTicketTaskEntityType> {
    /**
    * Loads the Ticket Tasks record from the database
    * @param ticket_id: string - primary key value to load the Ticket Tasks record.
    * @param task_id: string - primary key value to load the Ticket Tasks record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotTicketTaskEntity
    * @method
    * @override
    */
    public async Load(ticket_id: string, task_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ticket_id', Value: ticket_id });
        compositeKey.KeyValuePairs.push({ FieldName: 'task_id', Value: task_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ticket_id
    * * Display Name: Ticket
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Tickets (vwTickets.hs_object_id)
    * * Description: HubSpot Ticket hs_object_id
    */
    get ticket_id(): string {
        return this.Get('ticket_id');
    }
    set ticket_id(value: string) {
        this.Set('ticket_id', value);
    }

    /**
    * * Field Name: task_id
    * * Display Name: Task
    * * SQL Data Type: nvarchar(100)
    * * Related Entity/Foreign Key: Tasks (vwTasks.hs_object_id)
    * * Description: HubSpot Task hs_object_id
    */
    get task_id(): string {
        return this.Get('task_id');
    }
    set task_id(value: string) {
        this.Set('task_id', value);
    }

    /**
    * * Field Name: association_type
    * * Display Name: Association Type
    * * SQL Data Type: nvarchar(100)
    * * Description: HubSpot association label (e.g., Primary, Unlabeled)
    */
    get association_type(): string | null {
        return this.Get('association_type');
    }
    set association_type(value: string | null) {
        this.Set('association_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Tickets - strongly typed entity sub-class
 * * Schema: HubSpot
 * * Base Table: Ticket
 * * Base View: vwTickets
 * * @description Support tickets with pipeline, priority, and category tracking
 * * Primary Key: hs_object_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Tickets')
export class HubSpotTicketEntity extends BaseEntity<HubSpotTicketEntityType> {
    /**
    * Loads the Tickets record from the database
    * @param hs_object_id: string - primary key value to load the Tickets record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof HubSpotTicketEntity
    * @method
    * @override
    */
    public async Load(hs_object_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'hs_object_id', Value: hs_object_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: hs_object_id
    * * Display Name: Ticket ID
    * * SQL Data Type: nvarchar(100)
    */
    get hs_object_id(): string {
        return this.Get('hs_object_id');
    }
    set hs_object_id(value: string) {
        this.Set('hs_object_id', value);
    }

    /**
    * * Field Name: subject
    * * Display Name: Subject
    * * SQL Data Type: nvarchar(500)
    */
    get subject(): string | null {
        return this.Get('subject');
    }
    set subject(value: string | null) {
        this.Set('subject', value);
    }

    /**
    * * Field Name: content
    * * Display Name: Content
    * * SQL Data Type: nvarchar(MAX)
    */
    get content(): string | null {
        return this.Get('content');
    }
    set content(value: string | null) {
        this.Set('content', value);
    }

    /**
    * * Field Name: hs_pipeline
    * * Display Name: Pipeline
    * * SQL Data Type: nvarchar(500)
    */
    get hs_pipeline(): string | null {
        return this.Get('hs_pipeline');
    }
    set hs_pipeline(value: string | null) {
        this.Set('hs_pipeline', value);
    }

    /**
    * * Field Name: hs_pipeline_stage
    * * Display Name: Pipeline Stage
    * * SQL Data Type: nvarchar(500)
    */
    get hs_pipeline_stage(): string | null {
        return this.Get('hs_pipeline_stage');
    }
    set hs_pipeline_stage(value: string | null) {
        this.Set('hs_pipeline_stage', value);
    }

    /**
    * * Field Name: hs_ticket_priority
    * * Display Name: Priority
    * * SQL Data Type: nvarchar(500)
    */
    get hs_ticket_priority(): string | null {
        return this.Get('hs_ticket_priority');
    }
    set hs_ticket_priority(value: string | null) {
        this.Set('hs_ticket_priority', value);
    }

    /**
    * * Field Name: hs_ticket_category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(500)
    */
    get hs_ticket_category(): string | null {
        return this.Get('hs_ticket_category');
    }
    set hs_ticket_category(value: string | null) {
        this.Set('hs_ticket_category', value);
    }

    /**
    * * Field Name: createdate
    * * Display Name: Created Date
    * * SQL Data Type: datetimeoffset
    */
    get createdate(): Date | null {
        return this.Get('createdate');
    }
    set createdate(value: Date | null) {
        this.Set('createdate', value);
    }

    /**
    * * Field Name: hs_lastmodifieddate
    * * Display Name: Last Modified Date
    * * SQL Data Type: datetimeoffset
    */
    get hs_lastmodifieddate(): Date | null {
        return this.Get('hs_lastmodifieddate');
    }
    set hs_lastmodifieddate(value: Date | null) {
        this.Set('hs_lastmodifieddate', value);
    }

    /**
    * * Field Name: closed_date
    * * Display Name: Closed Date
    * * SQL Data Type: datetimeoffset
    */
    get closed_date(): Date | null {
        return this.Get('closed_date');
    }
    set closed_date(value: Date | null) {
        this.Set('closed_date', value);
    }

    /**
    * * Field Name: source_type
    * * Display Name: Source Type
    * * SQL Data Type: nvarchar(500)
    */
    get source_type(): string | null {
        return this.Get('source_type');
    }
    set source_type(value: string | null) {
        this.Set('source_type', value);
    }

    /**
    * * Field Name: hubspot_owner_id
    * * Display Name: Owner
    * * SQL Data Type: nvarchar(100)
    */
    get hubspot_owner_id(): string | null {
        return this.Get('hubspot_owner_id');
    }
    set hubspot_owner_id(value: string | null) {
        this.Set('hubspot_owner_id', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Time Zones - strongly typed entity sub-class
 * * Schema: YourMembership
 * * Base Table: TimeZone
 * * Base View: vwTimeZones
 * * @description Time zone reference data with GMT offsets and display names
 * * Primary Key: fullName
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Time Zones')
export class YourMembershipTimeZoneEntity extends BaseEntity<YourMembershipTimeZoneEntityType> {
    /**
    * Loads the Time Zones record from the database
    * @param fullName: string - primary key value to load the Time Zones record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof YourMembershipTimeZoneEntity
    * @method
    * @override
    */
    public async Load(fullName: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'fullName', Value: fullName });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: fullName
    * * Display Name: Full Name
    * * SQL Data Type: nvarchar(200)
    */
    get fullName(): string {
        return this.Get('fullName');
    }
    set fullName(value: string) {
        this.Set('fullName', value);
    }

    /**
    * * Field Name: gmtOffset
    * * Display Name: GMT Offset
    * * SQL Data Type: nvarchar(200)
    */
    get gmtOffset(): string | null {
        return this.Get('gmtOffset');
    }
    set gmtOffset(value: string | null) {
        this.Set('gmtOffset', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Sync Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Active
    * * Description: Current sync status: Active, Archived, or Error
    */
    get __mj_integration_SyncStatus(): string {
        return this.Get('__mj_integration_SyncStatus');
    }
    set __mj_integration_SyncStatus(value: string) {
        this.Set('__mj_integration_SyncStatus', value);
    }

    /**
    * * Field Name: __mj_integration_LastSyncedAt
    * * Display Name: Last Synced At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the last successful sync for this record
    */
    get __mj_integration_LastSyncedAt(): Date | null {
        return this.Get('__mj_integration_LastSyncedAt');
    }
    set __mj_integration_LastSyncedAt(value: Date | null) {
        this.Set('__mj_integration_LastSyncedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}
