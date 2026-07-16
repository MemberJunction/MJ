import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Account Emails
 */
export const constantcontactaccount_emailsSchema = z.object({
    roles: z.string().nullable().describe(`
        * * Field Name: roles
        * * Display Name: roles
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Specifies the current role of a confirmed email address in an account. Each email address can have multiple roles or no role. Possible role values are:  CONTACT — The contact email for the Constant Contact account owner. Each account can only have one CONTACT role email. BILLING — The billing address for the Constant Contact account. Each account can only have one BILLING role email. JOURNALING — An email address that Constant Contact forwards all sent email campaigns to as part of the`),
    email_id: z.string().nullable().describe(`
        * * Field Name: email_id
        * * Display Name: Email Id
        * * SQL Data Type: nvarchar(450)
        * * Description: The unique ID for an email address in a Constant Contact account.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    email_address: z.string().nullable().describe(`
        * * Field Name: email_address
        * * Display Name: Email Address
        * * SQL Data Type: nvarchar(812)
        * * Description: An email address associated with a Constant Contact account owner.`),
    pending_roles: z.string().nullable().describe(`
        * * Field Name: pending_roles
        * * Display Name: Pending Roles
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The planned role for an unconfirmed email address. Possible role values are:  CONTACT — The contact email for the Constant Contact account owner. Each account can only have one CONTACT role email. BILLING — The billing address for the Constant Contact account. Each account can only have one BILLING role email. JOURNALING — The email address that Constant Contact forwards all sent email campaigns to as part of the partner journaling compliance feature. REPLY_TO — The contact email used `),
    confirm_time: z.string().nullable().describe(`
        * * Field Name: confirm_time
        * * Display Name: Confirm Time
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The date that the email address changed to CONFIRMED status in ISO-8601 format.`),
    confirm_source_type: z.string().nullable().describe(`
        * * Field Name: confirm_source_type
        * * Display Name: Confirm Source Type
        * * SQL Data Type: nvarchar(812)
        * * Description: Describes who confirmed the email address. Valid values are:
  
  SITE_OWNER — The Constant Contact account owner confirmed the email address.
  SUPPORT — Constant Contact support staff confirmed the email address.
  FORCEVERIFY — Constant Contact confirmed the email address without sending a confirmation email.
  PARTNER — A Constant Contact partner confirmed the email address.`),
    confirm_status: z.string().nullable().describe(`
        * * Field Name: confirm_status
        * * Display Name: Confirm Status
        * * SQL Data Type: nvarchar(812)
        * * Description: The confirmation status of the account email address. When you add a new email address to an account, Constant Contact automatically sends an email to that address with a link to confirm it. You can use any account email address with a CONFIRMED status to create an email campaign.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactaccount_emailsEntityType = z.infer<typeof constantcontactaccount_emailsSchema>;

/**
 * zod schema definition for the entity Account Physical Addresses
 */
export const constantcontactaccount_physical_addressSchema = z.object({
    address_line3: z.string().nullable().describe(`
        * * Field Name: address_line3
        * * Display Name: Address Line 3
        * * SQL Data Type: nvarchar(812)
        * * Description: Line 3 of the organization's street address.`),
    postal_code: z.string().nullable().describe(`
        * * Field Name: postal_code
        * * Display Name: Postal Code
        * * SQL Data Type: nvarchar(812)
        * * Description: The postal code address (ZIP code) of the organization. This property is required if the state_code is US or CA, otherwise exclude this property from the request body.`),
    state_name: z.string().nullable().describe(`
        * * Field Name: state_name
        * * Display Name: State Name
        * * SQL Data Type: nvarchar(812)
        * * Description: Use if the state where the organization is physically located is not in the United States or Canada. If  country_code is  US or CA, exclude this property from the request body.`),
    address_line1: z.string().nullable().describe(`
        * * Field Name: address_line1
        * * Display Name: Address Line 1
        * * SQL Data Type: nvarchar(812)
        * * Description: Line 1 of the organization's street address.`),
    address_line2: z.string().nullable().describe(`
        * * Field Name: address_line2
        * * Display Name: Address Line 2
        * * SQL Data Type: nvarchar(812)
        * * Description: Line 2 of the organization's street address.`),
    state_code: z.string().nullable().describe(`
        * * Field Name: state_code
        * * Display Name: State Code
        * * SQL Data Type: nvarchar(812)
        * * Description: The two letter ISO 3166-1 code for the organization's state and only used if the country_code is US or CA. If not, exclude this property from the request body.`),
    city: z.string().nullable().describe(`
        * * Field Name: city
        * * Display Name: city
        * * SQL Data Type: nvarchar(812)
        * * Description: The city where the organization is located.`),
    country_code: z.string().nullable().describe(`
        * * Field Name: country_code
        * * Display Name: Country Code
        * * SQL Data Type: nvarchar(812)
        * * Description: The two letter ISO 3166-1 code for the organization's country.`),
    ID: z.string().nullable().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: nvarchar(450)`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactaccount_physical_addressEntityType = z.infer<typeof constantcontactaccount_physical_addressSchema>;

/**
 * zod schema definition for the entity Account Summaries
 */
export const constantcontactaccount_summarySchema = z.object({
    country_code: z.string().nullable().describe(`
        * * Field Name: country_code
        * * Display Name: Country Code
        * * SQL Data Type: nvarchar(812)
        * * Description: The uppercase two-letter ISO 3166-1 code representing the organization's country.`),
    organization_phone: z.string().nullable().describe(`
        * * Field Name: organization_phone
        * * Display Name: Organization Phone
        * * SQL Data Type: nvarchar(812)
        * * Description: The phone number of the organization that is associated with this account.`),
    contact_phone: z.string().nullable().describe(`
        * * Field Name: contact_phone
        * * Display Name: Contact Phone
        * * SQL Data Type: nvarchar(812)
        * * Description: The account owner's contact phone number (up to 25 characters in length).`),
    last_name: z.string().nullable().describe(`
        * * Field Name: last_name
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(812)
        * * Description: The account owner's last name.`),
    state_code: z.string().nullable().describe(`
        * * Field Name: state_code
        * * Display Name: State Code
        * * SQL Data Type: nvarchar(812)
        * * Description: The uppercase two letter ISO 3166-1 code for the organization's state. This property is required if the country_code is US (United States).`),
    physical_address: z.string().nullable().describe(`
        * * Field Name: physical_address
        * * Display Name: Physical Address
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Physical Address (account_summary).`),
    first_name: z.string().nullable().describe(`
        * * Field Name: first_name
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(812)
        * * Description: The account owner's first name.`),
    contact_email: z.string().nullable().describe(`
        * * Field Name: contact_email
        * * Display Name: Contact Email
        * * SQL Data Type: nvarchar(812)
        * * Description: Email addresses that are associated with the Constant Contact account owner.`),
    organization_name: z.string().nullable().describe(`
        * * Field Name: organization_name
        * * Display Name: Organization Name
        * * SQL Data Type: nvarchar(812)
        * * Description: The name of the organization that is associated with this account.`),
    website: z.string().nullable().describe(`
        * * Field Name: website
        * * Display Name: website
        * * SQL Data Type: nvarchar(812)
        * * Description: The organization's website URL.`),
    encoded_partner_id: z.string().nullable().describe(`
        * * Field Name: encoded_partner_id
        * * Display Name: Encoded Partner Id
        * * SQL Data Type: nvarchar(812)
        * * Description: The encoded partner id that identifies which Constant Contact partner provisioned the account.`),
    encoded_account_id: z.string().nullable().describe(`
        * * Field Name: encoded_account_id
        * * Display Name: Encoded Account Id
        * * SQL Data Type: nvarchar(450)
        * * Description: The readOnly encoded account ID that uniquely identifies the account.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    time_zone_id: z.string().nullable().describe(`
        * * Field Name: time_zone_id
        * * Display Name: Time Zone Id
        * * SQL Data Type: nvarchar(812)
        * * Description: The time zone that is automatically set based on the state_code setting; as defined in the IANA time-zone database (see http://www.iana.org/time-zones).`),
    company_logo: z.string().nullable().describe(`
        * * Field Name: company_logo
        * * Display Name: Company Logo
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Used to include an existing company logo in the response body. If a company logo does not exist, nothing is returned in the response body. This property is optional.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactaccount_summaryEntityType = z.infer<typeof constantcontactaccount_summarySchema>;

/**
 * zod schema definition for the entity Account User Privileges
 */
export const constantcontactaccount_user_privilegesSchema = z.object({
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    privilege_id: z.string().nullable().describe(`
        * * Field Name: privilege_id
        * * Display Name: Privilege Id
        * * SQL Data Type: nvarchar(450)
        * * Description: Identifies a user privilege in Constant Contact.`),
    privilege_name: z.string().nullable().describe(`
        * * Field Name: privilege_name
        * * Display Name: Privilege Name
        * * SQL Data Type: nvarchar(812)
        * * Description: The name of the Constant Contact user privilege.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactaccount_user_privilegesEntityType = z.infer<typeof constantcontactaccount_user_privilegesSchema>;

/**
 * zod schema definition for the entity Activities
 */
export const constantcontactactivitiesSchema = z.object({
    started_at: z.string().nullable().describe(`
        * * Field Name: started_at
        * * Display Name: Started At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we began processing the activity request, in ISO-8601 format.`),
    state: z.string().nullable().describe(`
        * * Field Name: state
        * * Display Name: state
        * * SQL Data Type: nvarchar(812)
        * * Description: The state of the request:  initialized - request has been received processing - request is being processed completed - job completed cancelled - request was cancelled failed - job failed to complete timed_out - the request timed out before completing"`),
    activity_errors: z.string().nullable().describe(`
        * * Field Name: activity_errors
        * * Display Name: Activity Errors
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Array of messages describing the errors that occurred.`),
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we created the activity, in ISO-8601 format.`),
    source_file_name: z.string().nullable().describe(`
        * * Field Name: source_file_name
        * * Display Name: Source File Name
        * * SQL Data Type: nvarchar(812)
        * * Description: Name of the file used for an add_contacts activity.`),
    _links: z.string().nullable().describe(`
        * * Field Name: _links
        * * Display Name: Links
        * * SQL Data Type: nvarchar(MAX)
        * * Description:  Links (activities).`),
    percent_done: z.string().nullable().describe(`
        * * Field Name: percent_done
        * * Display Name: Percent Done
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Shows the percent done for an activity that we are still processing.`),
    status: z.string().nullable().describe(`
        * * Field Name: status
        * * Display Name: status
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Status (activities).`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    activity_id: z.string().nullable().describe(`
        * * Field Name: activity_id
        * * Display Name: Activity Id
        * * SQL Data Type: nvarchar(450)
        * * Description: Unique ID for the activity.`),
    completed_at: z.string().nullable().describe(`
        * * Field Name: completed_at
        * * Display Name: Completed At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we completed processing the activity, in ISO-8601 format.`),
    updated_at: z.string().nullable().describe(`
        * * Field Name: updated_at
        * * Display Name: Updated At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we last updated the activity, in ISO-8601 format.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactactivitiesEntityType = z.infer<typeof constantcontactactivitiesSchema>;

/**
 * zod schema definition for the entity Activities Contacts Deletes
 */
export const constantcontactactivities_contacts_deleteSchema = z.object({
    state: z.string().nullable().describe(`
        * * Field Name: state
        * * Display Name: state
        * * SQL Data Type: nvarchar(812)
        * * Description: The state of the request:  initialized - request has been received processing - request is being processed completed - job completed cancelled - request was cancelled failed - job failed to complete timed_out - the request timed out before completing"`),
    updated_at: z.string().nullable().describe(`
        * * Field Name: updated_at
        * * Display Name: Updated At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we last updated the activity, in ISO-8601 format.`),
    activity_errors: z.string().nullable().describe(`
        * * Field Name: activity_errors
        * * Display Name: Activity Errors
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Array of messages describing the errors that occurred.`),
    percent_done: z.string().nullable().describe(`
        * * Field Name: percent_done
        * * Display Name: Percent Done
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Shows the percent done for an activity that we are still processing.`),
    _links: z.string().nullable().describe(`
        * * Field Name: _links
        * * Display Name: Links
        * * SQL Data Type: nvarchar(MAX)
        * * Description:  Links (activities_contacts_delete).`),
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we created the activity, in ISO-8601 format.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    completed_at: z.string().nullable().describe(`
        * * Field Name: completed_at
        * * Display Name: Completed At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we completed processing the activity, in ISO-8601 format.`),
    activity_id: z.string().nullable().describe(`
        * * Field Name: activity_id
        * * Display Name: Activity Id
        * * SQL Data Type: nvarchar(450)
        * * Description: Unique ID for the activity.`),
    started_at: z.string().nullable().describe(`
        * * Field Name: started_at
        * * Display Name: Started At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we began processing the activity request, in ISO-8601 format.`),
    status: z.string().nullable().describe(`
        * * Field Name: status
        * * Display Name: status
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Status (activities_contacts_delete).`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactactivities_contacts_deleteEntityType = z.infer<typeof constantcontactactivities_contacts_deleteSchema>;

/**
 * zod schema definition for the entity Activities Contacts File Imports
 */
export const constantcontactactivities_contacts_file_importSchema = z.object({
    percent_done: z.string().nullable().describe(`
        * * Field Name: percent_done
        * * Display Name: Percent Done
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Shows the percent done for an activity that we are still processing.`),
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we created the activity, in ISO-8601 format.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    activity_errors: z.string().nullable().describe(`
        * * Field Name: activity_errors
        * * Display Name: Activity Errors
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Array of messages describing the errors that occurred.`),
    updated_at: z.string().nullable().describe(`
        * * Field Name: updated_at
        * * Display Name: Updated At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we last updated the activity, in ISO-8601 format.`),
    state: z.string().nullable().describe(`
        * * Field Name: state
        * * Display Name: state
        * * SQL Data Type: nvarchar(812)
        * * Description: The state of the request:
 
   initialized - request has been received
  processing - request is being processed
  completed - job completed
  cancelled - request was cancelled
  failed - job failed to complete
  timed_out - the request timed out before completing"`),
    started_at: z.string().nullable().describe(`
        * * Field Name: started_at
        * * Display Name: Started At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we began processing the activity request, in ISO-8601 format.`),
    source_file_name: z.string().nullable().describe(`
        * * Field Name: source_file_name
        * * Display Name: Source File Name
        * * SQL Data Type: nvarchar(812)
        * * Description: Name of the file used for an file_import activity.`),
    _links: z.string().nullable().describe(`
        * * Field Name: _links
        * * Display Name: Links
        * * SQL Data Type: nvarchar(MAX)
        * * Description:  Links (activities_contacts_file_import).`),
    completed_at: z.string().nullable().describe(`
        * * Field Name: completed_at
        * * Display Name: Completed At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we completed processing the activity, in ISO-8601 format.`),
    status: z.string().nullable().describe(`
        * * Field Name: status
        * * Display Name: status
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Status (activities_contacts_file_import).`),
    activity_id: z.string().nullable().describe(`
        * * Field Name: activity_id
        * * Display Name: Activity Id
        * * SQL Data Type: nvarchar(450)
        * * Description: Unique ID for the activity.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactactivities_contacts_file_importEntityType = z.infer<typeof constantcontactactivities_contacts_file_importSchema>;

/**
 * zod schema definition for the entity Activities Contacts Json Imports
 */
export const constantcontactactivities_contacts_json_importSchema = z.object({
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    activity_errors: z.string().nullable().describe(`
        * * Field Name: activity_errors
        * * Display Name: Activity Errors
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Array of messages describing the errors that occurred.`),
    started_at: z.string().nullable().describe(`
        * * Field Name: started_at
        * * Display Name: Started At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we began processing the activity request, in ISO-8601 format.`),
    _links: z.string().nullable().describe(`
        * * Field Name: _links
        * * Display Name: Links
        * * SQL Data Type: nvarchar(MAX)
        * * Description:  Links (activities_contacts_json_import).`),
    completed_at: z.string().nullable().describe(`
        * * Field Name: completed_at
        * * Display Name: Completed At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we completed processing the activity, in ISO-8601 format.`),
    percent_done: z.string().nullable().describe(`
        * * Field Name: percent_done
        * * Display Name: Percent Done
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Shows the percent done for an activity that we are still processing.`),
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we created the activity, in ISO-8601 format.`),
    activity_id: z.string().nullable().describe(`
        * * Field Name: activity_id
        * * Display Name: Activity Id
        * * SQL Data Type: nvarchar(450)
        * * Description: Unique ID for the activity.`),
    status: z.string().nullable().describe(`
        * * Field Name: status
        * * Display Name: status
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Status (activities_contacts_json_import).`),
    updated_at: z.string().nullable().describe(`
        * * Field Name: updated_at
        * * Display Name: Updated At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we last updated the activity, in ISO-8601 format.`),
    state: z.string().nullable().describe(`
        * * Field Name: state
        * * Display Name: state
        * * SQL Data Type: nvarchar(812)
        * * Description: The state of the request:
 
   initialized - request has been received
  processing - request is being processed
  completed - job completed
  cancelled - request was cancelled
  failed - job failed to complete
  timed_out - the request timed out before completing"`),
    source_file_name: z.string().nullable().describe(`
        * * Field Name: source_file_name
        * * Display Name: Source File Name
        * * SQL Data Type: nvarchar(812)
        * * Description: Name of the file used for an file_import activity.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactactivities_contacts_json_importEntityType = z.infer<typeof constantcontactactivities_contacts_json_importSchema>;

/**
 * zod schema definition for the entity Activities Contacts Taggings Adds
 */
export const constantcontactactivities_contacts_taggings_addSchema = z.object({
    activity_errors: z.string().nullable().describe(`
        * * Field Name: activity_errors
        * * Display Name: Activity Errors
        * * SQL Data Type: nvarchar(MAX)
        * * Description: An array of error message strings describing the errors that occurred.`),
    activity_id: z.string().nullable().describe(`
        * * Field Name: activity_id
        * * Display Name: Activity Id
        * * SQL Data Type: nvarchar(450)
        * * Description: The system assigned UUID that uniquely identifies an activity.`),
    percent_done: z.string().nullable().describe(`
        * * Field Name: percent_done
        * * Display Name: Percent Done
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The processing percent complete for the activity.`),
    started_at: z.string().nullable().describe(`
        * * Field Name: started_at
        * * Display Name: Started At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when processing started for the activity, in ISO-8601 format.`),
    status: z.string().nullable().describe(`
        * * Field Name: status
        * * Display Name: status
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Status (activities_contacts_taggings_add).`),
    completed_at: z.string().nullable().describe(`
        * * Field Name: completed_at
        * * Display Name: Completed At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when processing completed for the activity, in ISO-8601 format.`),
    updated_at: z.string().nullable().describe(`
        * * Field Name: updated_at
        * * Display Name: Updated At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when the activity was last updated, in ISO-8601 format.`),
    state: z.string().nullable().describe(`
        * * Field Name: state
        * * Display Name: state
        * * SQL Data Type: nvarchar(812)
        * * Description: The activity processing state.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when the activity was first requested, in ISO-8601 format.`),
    _links: z.string().nullable().describe(`
        * * Field Name: _links
        * * Display Name: Links
        * * SQL Data Type: nvarchar(MAX)
        * * Description:  Links (activities_contacts_taggings_add).`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactactivities_contacts_taggings_addEntityType = z.infer<typeof constantcontactactivities_contacts_taggings_addSchema>;

/**
 * zod schema definition for the entity Activities Contacts Taggings Removes
 */
export const constantcontactactivities_contacts_taggings_removeSchema = z.object({
    state: z.string().nullable().describe(`
        * * Field Name: state
        * * Display Name: state
        * * SQL Data Type: nvarchar(812)
        * * Description: The activity processing state.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    updated_at: z.string().nullable().describe(`
        * * Field Name: updated_at
        * * Display Name: Updated At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when the activity was last updated, in ISO-8601 format.`),
    activity_errors: z.string().nullable().describe(`
        * * Field Name: activity_errors
        * * Display Name: Activity Errors
        * * SQL Data Type: nvarchar(MAX)
        * * Description: An array of error message strings describing the errors that occurred.`),
    _links: z.string().nullable().describe(`
        * * Field Name: _links
        * * Display Name: Links
        * * SQL Data Type: nvarchar(MAX)
        * * Description:  Links (activities_contacts_taggings_remove).`),
    percent_done: z.string().nullable().describe(`
        * * Field Name: percent_done
        * * Display Name: Percent Done
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The processing percent complete for the activity.`),
    started_at: z.string().nullable().describe(`
        * * Field Name: started_at
        * * Display Name: Started At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when processing started for the activity, in ISO-8601 format.`),
    status: z.string().nullable().describe(`
        * * Field Name: status
        * * Display Name: status
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Status (activities_contacts_taggings_remove).`),
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when the activity was first requested, in ISO-8601 format.`),
    completed_at: z.string().nullable().describe(`
        * * Field Name: completed_at
        * * Display Name: Completed At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when processing completed for the activity, in ISO-8601 format.`),
    activity_id: z.string().nullable().describe(`
        * * Field Name: activity_id
        * * Display Name: Activity Id
        * * SQL Data Type: nvarchar(450)
        * * Description: The system assigned UUID that uniquely identifies an activity.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactactivities_contacts_taggings_removeEntityType = z.infer<typeof constantcontactactivities_contacts_taggings_removeSchema>;

/**
 * zod schema definition for the entity Activities Contacts Tags Deletes
 */
export const constantcontactactivities_contacts_tags_deleteSchema = z.object({
    updated_at: z.string().nullable().describe(`
        * * Field Name: updated_at
        * * Display Name: Updated At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when the activity was last updated, in ISO-8601 format.`),
    state: z.string().nullable().describe(`
        * * Field Name: state
        * * Display Name: state
        * * SQL Data Type: nvarchar(812)
        * * Description: The activity processing state.`),
    completed_at: z.string().nullable().describe(`
        * * Field Name: completed_at
        * * Display Name: Completed At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when processing completed for the activity, in ISO-8601 format.`),
    status: z.string().nullable().describe(`
        * * Field Name: status
        * * Display Name: status
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Status (activities_contacts_tags_delete).`),
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when the activity was first requested, in ISO-8601 format.`),
    started_at: z.string().nullable().describe(`
        * * Field Name: started_at
        * * Display Name: Started At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when processing started for the activity, in ISO-8601 format.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    percent_done: z.string().nullable().describe(`
        * * Field Name: percent_done
        * * Display Name: Percent Done
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The processing percent complete for the activity.`),
    _links: z.string().nullable().describe(`
        * * Field Name: _links
        * * Display Name: Links
        * * SQL Data Type: nvarchar(MAX)
        * * Description:  Links (activities_contacts_tags_delete).`),
    activity_errors: z.string().nullable().describe(`
        * * Field Name: activity_errors
        * * Display Name: Activity Errors
        * * SQL Data Type: nvarchar(MAX)
        * * Description: An array of error message strings describing the errors that occurred.`),
    activity_id: z.string().nullable().describe(`
        * * Field Name: activity_id
        * * Display Name: Activity Id
        * * SQL Data Type: nvarchar(450)
        * * Description: The system assigned UUID that uniquely identifies an activity.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactactivities_contacts_tags_deleteEntityType = z.infer<typeof constantcontactactivities_contacts_tags_deleteSchema>;

/**
 * zod schema definition for the entity Activities Custom Fields Deletes
 */
export const constantcontactactivities_custom_fields_deleteSchema = z.object({
    started_at: z.string().nullable().describe(`
        * * Field Name: started_at
        * * Display Name: Started At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we began processing the activity request, in ISO-8601 format.`),
    activity_id: z.string().nullable().describe(`
        * * Field Name: activity_id
        * * Display Name: Activity Id
        * * SQL Data Type: nvarchar(450)
        * * Description: Unique ID for the activity.`),
    updated_at: z.string().nullable().describe(`
        * * Field Name: updated_at
        * * Display Name: Updated At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we last updated the activity, in ISO-8601 format.`),
    state: z.string().nullable().describe(`
        * * Field Name: state
        * * Display Name: state
        * * SQL Data Type: nvarchar(812)
        * * Description: The state of the request:  initialized - request has been received processing - request is being processed completed - job completed cancelled - request was cancelled failed - job failed to complete timed_out - the request timed out before completing"`),
    completed_at: z.string().nullable().describe(`
        * * Field Name: completed_at
        * * Display Name: Completed At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we completed processing the activity, in ISO-8601 format.`),
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we created the activity, in ISO-8601 format.`),
    percent_done: z.string().nullable().describe(`
        * * Field Name: percent_done
        * * Display Name: Percent Done
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Shows the percent done for an activity that we are still processing.`),
    activity_errors: z.string().nullable().describe(`
        * * Field Name: activity_errors
        * * Display Name: Activity Errors
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Array of messages describing the errors that occurred.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    _links: z.string().nullable().describe(`
        * * Field Name: _links
        * * Display Name: Links
        * * SQL Data Type: nvarchar(MAX)
        * * Description:  Links (activities_custom_fields_delete).`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactactivities_custom_fields_deleteEntityType = z.infer<typeof constantcontactactivities_custom_fields_deleteSchema>;

/**
 * zod schema definition for the entity Activities List Deletes
 */
export const constantcontactactivities_list_deleteSchema = z.object({
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    _links: z.string().nullable().describe(`
        * * Field Name: _links
        * * Display Name: Links
        * * SQL Data Type: nvarchar(MAX)
        * * Description:  Links (activities_list_delete).`),
    status: z.string().nullable().describe(`
        * * Field Name: status
        * * Display Name: status
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Status (activities_list_delete).`),
    state: z.string().nullable().describe(`
        * * Field Name: state
        * * Display Name: state
        * * SQL Data Type: nvarchar(812)
        * * Description: The activity processing state.`),
    completed_at: z.string().nullable().describe(`
        * * Field Name: completed_at
        * * Display Name: Completed At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when processing completed for the activity, in ISO-8601 format.`),
    activity_id: z.string().nullable().describe(`
        * * Field Name: activity_id
        * * Display Name: Activity Id
        * * SQL Data Type: nvarchar(450)
        * * Description: The system assigned UUID that uniquely identifies an activity.`),
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when the activity was first requested, in ISO-8601 format.`),
    percent_done: z.string().nullable().describe(`
        * * Field Name: percent_done
        * * Display Name: Percent Done
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The processing percent complete for the activity.`),
    updated_at: z.string().nullable().describe(`
        * * Field Name: updated_at
        * * Display Name: Updated At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when the activity was last updated, in ISO-8601 format.`),
    activity_errors: z.string().nullable().describe(`
        * * Field Name: activity_errors
        * * Display Name: Activity Errors
        * * SQL Data Type: nvarchar(MAX)
        * * Description: An array of error message strings describing the errors that occurred.`),
    started_at: z.string().nullable().describe(`
        * * Field Name: started_at
        * * Display Name: Started At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when processing started for the activity, in ISO-8601 format.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactactivities_list_deleteEntityType = z.infer<typeof constantcontactactivities_list_deleteSchema>;

/**
 * zod schema definition for the entity Activities List Memberships Adds
 */
export const constantcontactactivities_list_memberships_addSchema = z.object({
    state: z.string().nullable().describe(`
        * * Field Name: state
        * * Display Name: state
        * * SQL Data Type: nvarchar(812)
        * * Description: The state of the request:  initialized - request has been received processing - request is being processed completed - job completed cancelled - request was cancelled failed - job failed to complete timed_out - the request timed out before completing"`),
    _links: z.string().nullable().describe(`
        * * Field Name: _links
        * * Display Name: Links
        * * SQL Data Type: nvarchar(MAX)
        * * Description:  Links (activities_list_memberships_add).`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    activity_errors: z.string().nullable().describe(`
        * * Field Name: activity_errors
        * * Display Name: Activity Errors
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Array of messages describing the errors that occurred.`),
    completed_at: z.string().nullable().describe(`
        * * Field Name: completed_at
        * * Display Name: Completed At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we completed processing the activity, in ISO-8601 format.`),
    activity_id: z.string().nullable().describe(`
        * * Field Name: activity_id
        * * Display Name: Activity Id
        * * SQL Data Type: nvarchar(450)
        * * Description: Unique ID for the activity.`),
    updated_at: z.string().nullable().describe(`
        * * Field Name: updated_at
        * * Display Name: Updated At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we last updated the activity, in ISO-8601 format.`),
    status: z.string().nullable().describe(`
        * * Field Name: status
        * * Display Name: status
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Status (activities_list_memberships_add).`),
    started_at: z.string().nullable().describe(`
        * * Field Name: started_at
        * * Display Name: Started At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we began processing the activity request, in ISO-8601 format.`),
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we created the activity, in ISO-8601 format.`),
    percent_done: z.string().nullable().describe(`
        * * Field Name: percent_done
        * * Display Name: Percent Done
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Shows the percent done for an activity that we are still processing.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactactivities_list_memberships_addEntityType = z.infer<typeof constantcontactactivities_list_memberships_addSchema>;

/**
 * zod schema definition for the entity Activities List Memberships Removes
 */
export const constantcontactactivities_list_memberships_removeSchema = z.object({
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we created the activity, in ISO-8601 format.`),
    _links: z.string().nullable().describe(`
        * * Field Name: _links
        * * Display Name: Links
        * * SQL Data Type: nvarchar(MAX)
        * * Description:  Links (activities_list_memberships_remove).`),
    state: z.string().nullable().describe(`
        * * Field Name: state
        * * Display Name: state
        * * SQL Data Type: nvarchar(812)
        * * Description: The state of the request:  initialized - request has been received processing - request is being processed completed - job completed cancelled - request was cancelled failed - job failed to complete timed_out - the request timed out before completing"`),
    activity_errors: z.string().nullable().describe(`
        * * Field Name: activity_errors
        * * Display Name: Activity Errors
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Array of messages describing the errors that occurred.`),
    updated_at: z.string().nullable().describe(`
        * * Field Name: updated_at
        * * Display Name: Updated At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we last updated the activity, in ISO-8601 format.`),
    started_at: z.string().nullable().describe(`
        * * Field Name: started_at
        * * Display Name: Started At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we began processing the activity request, in ISO-8601 format.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    percent_done: z.string().nullable().describe(`
        * * Field Name: percent_done
        * * Display Name: Percent Done
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Shows the percent done for an activity that we are still processing.`),
    activity_id: z.string().nullable().describe(`
        * * Field Name: activity_id
        * * Display Name: Activity Id
        * * SQL Data Type: nvarchar(450)
        * * Description: Unique ID for the activity.`),
    completed_at: z.string().nullable().describe(`
        * * Field Name: completed_at
        * * Display Name: Completed At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Timestamp showing when we completed processing the activity, in ISO-8601 format.`),
    status: z.string().nullable().describe(`
        * * Field Name: status
        * * Display Name: status
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Status (activities_list_memberships_remove).`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactactivities_list_memberships_removeEntityType = z.infer<typeof constantcontactactivities_list_memberships_removeSchema>;

/**
 * zod schema definition for the entity Contact Custom Fields
 */
export const constantcontactcontact_custom_fieldsSchema = z.object({
    updated_at: z.string().nullable().describe(`
        * * Field Name: updated_at
        * * Display Name: Updated At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: System generated date and time that the resource was updated, in ISO-8601 format.`),
    label: z.string().nullable().describe(`
        * * Field Name: label
        * * Display Name: label
        * * SQL Data Type: nvarchar(812)
        * * Description: The custom field name to display in the UI (free-form text).`),
    custom_field_id: z.string().nullable().describe(`
        * * Field Name: custom_field_id
        * * Display Name: Custom Field Id
        * * SQL Data Type: nvarchar(450)
        * * Description: The system generated ID that uniquely identifies a custom_field.`),
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Date and time that the resource was created, in ISO-8601 format. System generated.`),
    version: z.string().nullable().describe(`
        * * Field Name: version
        * * Display Name: version
        * * SQL Data Type: nvarchar(MAX)
        * * Description: For datetime data types, this is the version number associated with the custom field.`),
    type: z.string().nullable().describe(`
        * * Field Name: type
        * * Display Name: type
        * * SQL Data Type: nvarchar(812)
        * * Description: The data value type the custom field accepts.`),
    name: z.string().nullable().describe(`
        * * Field Name: name
        * * Display Name: name
        * * SQL Data Type: nvarchar(812)
        * * Description: The unique custom field name constructed from the label by replacing blanks with underscores.`),
    choices: z.string().nullable().describe(`
        * * Field Name: choices
        * * Display Name: choices
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Choices available for single_select and multi_select type custom fields. The maximum number of elements for radio or checkbox display types is 20. Maximum number of elements for a dropdown is 100.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    metadata: z.string().nullable().describe(`
        * * Field Name: metadata
        * * Display Name: metadata
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Metadata (contact_custom_fields).`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactcontact_custom_fieldsEntityType = z.infer<typeof constantcontactcontact_custom_fieldsSchema>;

/**
 * zod schema definition for the entity Contact Lists
 */
export const constantcontactcontact_listsSchema = z.object({
    list_id: z.string().nullable().describe(`
        * * Field Name: list_id
        * * Display Name: List Id
        * * SQL Data Type: nvarchar(450)
        * * Description: Unique ID for the contact list`),
    description: z.string().nullable().describe(`
        * * Field Name: description
        * * Display Name: description
        * * SQL Data Type: nvarchar(812)
        * * Description: Text describing the list.`),
    name: z.string().nullable().describe(`
        * * Field Name: name
        * * Display Name: name
        * * SQL Data Type: nvarchar(812)
        * * Description: The name given to the contact list`),
    membership_count: z.string().nullable().describe(`
        * * Field Name: membership_count
        * * Display Name: Membership Count
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The total number of contacts that are members in a list. Does not apply to segment type lists.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: System generated date and time that the resource was created, in ISO-8601 format.`),
    favorite: z.string().nullable().describe(`
        * * Field Name: favorite
        * * Display Name: favorite
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Identifies whether or not the account has favorited the contact list.`),
    deleted_at: z.string().nullable().describe(`
        * * Field Name: deleted_at
        * * Display Name: Deleted At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: If the list was deleted, this property shows the date and time it was deleted, in ISO-8601 format. System generated.`),
    updated_at: z.string().nullable().describe(`
        * * Field Name: updated_at
        * * Display Name: Updated At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Date and time that the list was last updated, in ISO-8601 format. System generated.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactcontact_listsEntityType = z.infer<typeof constantcontactcontact_listsSchema>;

/**
 * zod schema definition for the entity Contact Lists Xrefs
 */
export const constantcontactcontact_lists_xrefsSchema = z.object({
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    list_id: z.string().nullable().describe(`
        * * Field Name: list_id
        * * Display Name: List Id
        * * SQL Data Type: nvarchar(450)
        * * Related Entity/Foreign Key: Contact Lists (vwContact_lists.list_id)
        * * Description: The V3 API list unique identifier`),
    sequence_id: z.string().nullable().describe(`
        * * Field Name: sequence_id
        * * Display Name: Sequence Id
        * * SQL Data Type: nvarchar(812)
        * * Description: The V2 API list unique identifier`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactcontact_lists_xrefsEntityType = z.infer<typeof constantcontactcontact_lists_xrefsSchema>;

/**
 * zod schema definition for the entity Contact Reports Activity Summaries
 */
export const constantcontactcontact_reports_activity_summarySchema = z.object({
    campaign_activity_id: z.string().nullable().describe(`
        * * Field Name: campaign_activity_id
        * * Display Name: Campaign Activity Id
        * * SQL Data Type: nvarchar(255)
        * * Related Entity/Foreign Key: Email Campaign Activities (vwEmail_campaign_activities.campaign_activity_id)
        * * Description: The unique id of the activity for an e-mail campaign.`),
    em_unsubscribes: z.string().nullable().describe(`
        * * Field Name: em_unsubscribes
        * * Display Name: Em Unsubscribes
        * * SQL Data Type: nvarchar(255)
        * * Description: The number of times this contact has opted out.`),
    em_clicks: z.string().nullable().describe(`
        * * Field Name: em_clicks
        * * Display Name: Em Clicks
        * * SQL Data Type: nvarchar(255)
        * * Description: The number of times this contact has clicked a link in this email.`),
    start_on: z.string().nullable().describe(`
        * * Field Name: start_on
        * * Display Name: Start On
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The last date at which the email was sent to this contact.`),
    em_sends: z.string().nullable().describe(`
        * * Field Name: em_sends
        * * Display Name: Em Sends
        * * SQL Data Type: nvarchar(255)
        * * Description: The number of times the email was sent to this contact.`),
    em_forwards: z.string().nullable().describe(`
        * * Field Name: em_forwards
        * * Display Name: Em Forwards
        * * SQL Data Type: nvarchar(255)
        * * Description: The number of times this contact has forwarded this email.`),
    em_bounces: z.string().nullable().describe(`
        * * Field Name: em_bounces
        * * Display Name: Em Bounces
        * * SQL Data Type: nvarchar(255)
        * * Description: The number of times the email has bounced for this contact.`),
    em_opens: z.string().nullable().describe(`
        * * Field Name: em_opens
        * * Display Name: Em Opens
        * * SQL Data Type: nvarchar(255)
        * * Description: The number of times this contact has opened this email.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactcontact_reports_activity_summaryEntityType = z.infer<typeof constantcontactcontact_reports_activity_summarySchema>;

/**
 * zod schema definition for the entity Contact Reports Open And Click Rates
 */
export const constantcontactcontact_reports_open_and_click_ratesSchema = z.object({
    included_activities_count: z.string().nullable().describe(`
        * * Field Name: included_activities_count
        * * Display Name: Included Activities Count
        * * SQL Data Type: nvarchar(255)
        * * Description: The number of activities included in the calculation.`),
    average_open_rate: z.string().nullable().describe(`
        * * Field Name: average_open_rate
        * * Display Name: Average Open Rate
        * * SQL Data Type: nvarchar(255)
        * * Description: The average rate the contact opened emails sent to them.`),
    average_click_rate: z.string().nullable().describe(`
        * * Field Name: average_click_rate
        * * Display Name: Average Click Rate
        * * SQL Data Type: nvarchar(255)
        * * Description: The average rate the contact clicked on links in emails sent to them.`),
    contact_id: z.string().nullable().describe(`
        * * Field Name: contact_id
        * * Display Name: Contact Id
        * * SQL Data Type: nvarchar(255)
        * * Related Entity/Foreign Key: Contacts (vwContacts.contact_id)
        * * Description: The unique ID of the contact for which the report is being generated.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactcontact_reports_open_and_click_ratesEntityType = z.infer<typeof constantcontactcontact_reports_open_and_click_ratesSchema>;

/**
 * zod schema definition for the entity Contact Tags
 */
export const constantcontactcontact_tagsSchema = z.object({
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The system generated date and time when the tag was created (ISO-8601 format).`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    tag_id: z.string().nullable().describe(`
        * * Field Name: tag_id
        * * Display Name: Tag Id
        * * SQL Data Type: nvarchar(450)
        * * Description: The ID that uniquely identifies a tag (UUID format)`),
    contacts_count: z.string().nullable().describe(`
        * * Field Name: contacts_count
        * * Display Name: Contacts Count
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The total number of contacts who are assigned this tag.`),
    updated_at: z.string().nullable().describe(`
        * * Field Name: updated_at
        * * Display Name: Updated At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The system generated date and time when the tag was last updated (ISO-8601 format).`),
    name: z.string().nullable().describe(`
        * * Field Name: name
        * * Display Name: name
        * * SQL Data Type: nvarchar(812)
        * * Description: The unique tag name.`),
    tag_source: z.string().nullable().describe(`
        * * Field Name: tag_source
        * * Display Name: Tag Source
        * * SQL Data Type: nvarchar(812)
        * * Description: The source used to tag contacts.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactcontact_tagsEntityType = z.infer<typeof constantcontactcontact_tagsSchema>;

/**
 * zod schema definition for the entity Contacts
 */
export const constantcontactcontactsSchema = z.object({
    first_name: z.string().nullable().describe(`
        * * Field Name: first_name
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(812)
        * * Description: The first name of the contact.`),
    notes: z.string().nullable().describe(`
        * * Field Name: notes
        * * Display Name: notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: An array of notes about the contact listed by most recent note first.`),
    update_source: z.string().nullable().describe(`
        * * Field Name: update_source
        * * Display Name: Update Source
        * * SQL Data Type: nvarchar(812)
        * * Description: Identifies who last updated the contact; valid values are  Contact or Account.`),
    contact_id: z.string().nullable().describe(`
        * * Field Name: contact_id
        * * Display Name: Contact Id
        * * SQL Data Type: nvarchar(450)
        * * Description: Unique ID for each contact resource`),
    sms_channel: z.string().nullable().describe(`
        * * Field Name: sms_channel
        * * Display Name: Sms Channel
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Includes SMS channel and consent details.`),
    anniversary: z.string().nullable().describe(`
        * * Field Name: anniversary
        * * Display Name: anniversary
        * * SQL Data Type: nvarchar(812)
        * * Description: The anniversary date for the contact. For example, this value could be the date when the contact first became a customer of an organization in Constant Contact. Valid date formats are MM/DD/YYYY, M/D/YYYY, YYYY/MM/DD, YYYY/M/D, YYYY-MM-DD, YYYY-M-D,M-D-YYYY, or M-DD-YYYY.`),
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: System generated date and time that the resource was created, in ISO-8601 format.`),
    list_memberships: z.string().nullable().describe(`
        * * Field Name: list_memberships
        * * Display Name: List Memberships
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Array of up to 50 list_ids to which the contact is subscribed.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    deleted_at: z.string().nullable().describe(`
        * * Field Name: deleted_at
        * * Display Name: Deleted At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: For deleted contacts (email_address contains opt_out_source and opt_out_date), shows the date of deletion.`),
    company_name: z.string().nullable().describe(`
        * * Field Name: company_name
        * * Display Name: Company Name
        * * SQL Data Type: nvarchar(812)
        * * Description: The name of the company where the contact works.`),
    birthday_month: z.string().nullable().describe(`
        * * Field Name: birthday_month
        * * Display Name: Birthday Month
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The month value for the contact's birthday. Valid values are from 1 through 12. You must use this property with birthday_month.`),
    create_source: z.string().nullable().describe(`
        * * Field Name: create_source
        * * Display Name: Create Source
        * * SQL Data Type: nvarchar(812)
        * * Description: Describes who added the contact; valid values are Contact or Account. Your integration must accurately identify create_source for compliance reasons; value is set when contact is created.`),
    street_addresses: z.string().nullable().describe(`
        * * Field Name: street_addresses
        * * Display Name: Street Addresses
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Array of up to 3 street_addresses subresources.`),
    updated_at: z.string().nullable().describe(`
        * * Field Name: updated_at
        * * Display Name: Updated At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: System generated date and time that the contact was last updated, in ISO-8601 format.`),
    last_name: z.string().nullable().describe(`
        * * Field Name: last_name
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(812)
        * * Description: The last name of the contact.`),
    job_title: z.string().nullable().describe(`
        * * Field Name: job_title
        * * Display Name: Job Title
        * * SQL Data Type: nvarchar(812)
        * * Description: The job title of the contact.`),
    custom_fields: z.string().nullable().describe(`
        * * Field Name: custom_fields
        * * Display Name: Custom Fields
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Array of up to 25 custom_field subresources.`),
    taggings: z.string().nullable().describe(`
        * * Field Name: taggings
        * * Display Name: taggings
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Array of tags (tag_id) assigned to the contact, up to a maximum of 50.`),
    phone_numbers: z.string().nullable().describe(`
        * * Field Name: phone_numbers
        * * Display Name: Phone Numbers
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Array of up to 3 phone_numbers subresources.`),
    email_address: z.string().nullable().describe(`
        * * Field Name: email_address
        * * Display Name: Email Address
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Email Address (contacts).`),
    birthday_day: z.string().nullable().describe(`
        * * Field Name: birthday_day
        * * Display Name: Birthday Day
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The day value for the contact's birthday. Valid values are from 1 through 12. You must use this property with birthday_day.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactcontactsEntityType = z.infer<typeof constantcontactcontactsSchema>;

/**
 * zod schema definition for the entity Contacts Counts
 */
export const constantcontactcontacts_countsSchema = z.object({
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    pending: z.string().nullable().describe(`
        * * Field Name: pending
        * * Display Name: pending
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Total number of contacts pending confirmation. Consent is requested and pending confirmation from the contact.`),
    total: z.string().nullable().describe(`
        * * Field Name: total
        * * Display Name: total
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Total number of contacts for the account.`),
    implicit: z.string().nullable().describe(`
        * * Field Name: implicit
        * * Display Name: implicit
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Total number of contacts implicitly confirmed. Consent is inferred based on actions, such as having an existing business relationship (making a purchase or donation, for example). In order to maintain implied consent to comply with CASL a contact must take a business action with you at least once every two years. Under CAN-Spam there is no need to maintain implied consent, it is assumed until the receiver indicates they no longer wish to receive messages.`),
    new_subscriber: z.string().nullable().describe(`
        * * Field Name: new_subscriber
        * * Display Name: New Subscriber
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Total number of newly subscribed contacts.`),
    ID: z.string().nullable().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: nvarchar(450)`),
    unsubscribed: z.string().nullable().describe(`
        * * Field Name: unsubscribed
        * * Display Name: unsubscribed
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Total number of unsubscribed contacts. Consent is revoked when a contact has unsubscribed.`),
    explicit: z.string().nullable().describe(`
        * * Field Name: explicit
        * * Display Name: explicit
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Total number of contacts explicitly confirmed. Consent is obtained when you explicitly ask your potential contacts for permission to send the email (for example, using a sign-up form) and they agree. After you obtain express consent, it is good forever or until the contact opts out.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactcontacts_countsEntityType = z.infer<typeof constantcontactcontacts_countsSchema>;

/**
 * zod schema definition for the entity Contacts Sign Up Forms
 */
export const constantcontactcontacts_sign_up_formSchema = z.object({
    action: z.string().nullable().describe(`
        * * Field Name: action
        * * Display Name: action
        * * SQL Data Type: nvarchar(812)
        * * Description: Identifies if the V3 API created a new contact or updated an existing contact.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    contact_id: z.string().nullable().describe(`
        * * Field Name: contact_id
        * * Display Name: Contact Id
        * * SQL Data Type: nvarchar(450)
        * * Related Entity/Foreign Key: Contacts (vwContacts.contact_id)
        * * Description: The unique identifier for the contact that the V3 API created or updated.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactcontacts_sign_up_formEntityType = z.infer<typeof constantcontactcontacts_sign_up_formSchema>;

/**
 * zod schema definition for the entity Contacts Xrefs
 */
export const constantcontactcontacts_xrefsSchema = z.object({
    contact_id: z.string().nullable().describe(`
        * * Field Name: contact_id
        * * Display Name: Contact Id
        * * SQL Data Type: nvarchar(450)
        * * Related Entity/Foreign Key: Contacts (vwContacts.contact_id)
        * * Description: The V3 API contact unique identifier`),
    sequence_id: z.string().nullable().describe(`
        * * Field Name: sequence_id
        * * Display Name: Sequence Id
        * * SQL Data Type: nvarchar(812)
        * * Description: The V2 API contact unique identifier`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactcontacts_xrefsEntityType = z.infer<typeof constantcontactcontacts_xrefsSchema>;

/**
 * zod schema definition for the entity Email Campaign Activities
 */
export const constantcontactemail_campaign_activitiesSchema = z.object({
    physical_address_in_footer: z.string().nullable().describe(`
        * * Field Name: physical_address_in_footer
        * * Display Name: Physical Address In Footer
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The physical address of the organization that is sending the email campaign. Constant Contact displays this information to contacts in the email message footer.`),
    contact_list_ids: z.string().nullable().describe(`
        * * Field Name: contact_list_ids
        * * Display Name: Contact List Ids
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The contacts that Constant Contact sends the email campaign activity to as an array of contact list_id values. You cannot use contact lists and segments at the same time in an email campaign activity.`),
    template_id: z.string().nullable().describe(`
        * * Field Name: template_id
        * * Display Name: Template Id
        * * SQL Data Type: nvarchar(255)
        * * Description: Identifies the email layout and design template that the email campaign activity is using as a base.`),
    permalink_url: z.string().nullable().describe(`
        * * Field Name: permalink_url
        * * Display Name: Permalink Url
        * * SQL Data Type: nvarchar(255)
        * * Description: The permanent link to a web accessible version of the email campaign content without any personalized email information. The permalink URL becomes accessible after you send an email campaign to contacts.`),
    campaign_id: z.string().nullable().describe(`
        * * Field Name: campaign_id
        * * Display Name: Campaign Id
        * * SQL Data Type: nvarchar(255)
        * * Related Entity/Foreign Key: Emails (vwEmails.campaign_id)
        * * Description: Identifies a campaign in the V3 API.`),
    segment_ids: z.string().nullable().describe(`
        * * Field Name: segment_ids
        * * Display Name: Segment Ids
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The contacts that Constant Contact sends the email campaign activity to as an array containing a single segment_id value. Only format_type 3, 4, and 5 email campaign activities support segments. You cannot use contact lists and segments at the same time in an email campaign activity.`),
    role: z.string().nullable().describe(`
        * * Field Name: role
        * * Display Name: role
        * * SQL Data Type: nvarchar(255)
        * * Description: The purpose of the individual campaign activity in the larger email campaign effort. Valid values are: 
  primary_email — The main email marketing campaign that you send to contacts. The primary_email contains the complete email content.
  permalink — A permanent link to a web accessible version of the primary_email content without any personalized email information. For example, permalinks do not contain any of the contact details that you add to the primary_email email content. 
  re`),
    campaign_activity_id: z.string().nullable().describe(`
        * * Field Name: campaign_activity_id
        * * Display Name: Campaign Activity Id
        * * SQL Data Type: nvarchar(255)
        * * Description: Identifies a campaign activity in the V3 API.`),
    format_type: z.string().nullable().describe(`
        * * Field Name: format_type
        * * Display Name: Format Type
        * * SQL Data Type: nvarchar(255)
        * * Description: Identifies the type of email format. Valid values are: 
  1 - A legacy custom code email created using the V2 API, the V3 API, or the legacy UI HTML editor.
  2 - An email created using the second generation email editor UI.
  3 - An email created using the third generation email editor UI. This email editor features an improved drag and drop UI and mobile responsiveness.
  4 - An email created using the fourth generation email editor UI.
  5 - A custom code email created using the V3 `),
    document_properties: z.string().nullable().describe(`
        * * Field Name: document_properties
        * * Display Name: Document Properties
        * * SQL Data Type: nvarchar(MAX)
        * * Description: An object that contains optional properties for legacy format type emails (format_type 1 and 2). If you attempt to add a property that does apply to the email format_type, the API will ignore the property.`),
    from_email: z.string().nullable().describe(`
        * * Field Name: from_email
        * * Display Name: From Email
        * * SQL Data Type: nvarchar(255)
        * * Description: The email "From Email" field for the email campaign activity. You must use a confirmed Constant Contact account email address. Make a GET call to /account/emails to return a collection of account emails and their confirmation status.`),
    reply_to_email: z.string().nullable().describe(`
        * * Field Name: reply_to_email
        * * Display Name: Reply To Email
        * * SQL Data Type: nvarchar(255)
        * * Description: The email "Reply To Email" field for the email campaign activity. You must use a confirmed Constant Contact account email address. Make a GET call to /account/emails to return a collection of account emails and their confirmation status.`),
    html_content: z.string().nullable().describe(`
        * * Field Name: html_content
        * * Display Name: Html Content
        * * SQL Data Type: nvarchar(255)
        * * Description: The HTML or XHTML content for the email campaign activity. Only format_type 1 and 5 (legacy custom code emails or modern custom code emails) can contain html_content.`),
    current_status: z.string().nullable().describe(`
        * * Field Name: current_status
        * * Display Name: Current Status
        * * SQL Data Type: nvarchar(255)
        * * Description: The current status of the email campaign activity. Valid values are: 
  DRAFT — An email campaign activity that you have created but have not sent to contacts.
  SCHEDULED — An email campaign activity that you have scheduled for Constant Contact to send to contacts.
  EXECUTING — An email campaign activity Constant Contact is currently sending to contacts. Email campaign activities are only in this status briefly.
  DONE — An email campaign activity that you successfully sent to contac`),
    preheader: z.string().nullable().describe(`
        * * Field Name: preheader
        * * Display Name: preheader
        * * SQL Data Type: nvarchar(255)
        * * Description: The email preheader for the email campaign activity. Only format_type 3, 4, and 5 email campaign activities use the preheader property.`),
    subject: z.string().nullable().describe(`
        * * Field Name: subject
        * * Display Name: subject
        * * SQL Data Type: nvarchar(255)
        * * Description: The email "Subject" field for the email campaign activity.`),
    from_name: z.string().nullable().describe(`
        * * Field Name: from_name
        * * Display Name: From Name
        * * SQL Data Type: nvarchar(255)
        * * Description: The email "From Name" field for the email campaign activity.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactemail_campaign_activitiesEntityType = z.infer<typeof constantcontactemail_campaign_activitiesSchema>;

/**
 * zod schema definition for the entity Email Campaign Activity Non Opener Resends
 */
export const constantcontactemail_campaign_activity_non_opener_resendsSchema = z.object({
    delay_days: z.string().nullable().describe(`
        * * Field Name: delay_days
        * * Display Name: Delay Days
        * * SQL Data Type: nvarchar(255)
        * * Description: The number of days to wait before Constant Contact resends the email. Valid values include 1 to 10 days. This value is only returned in the response results if the resend activity was created with delay_days or the delay_minutes equal to an exact day value.`),
    resend_subject: z.string().nullable().describe(`
        * * Field Name: resend_subject
        * * Display Name: Resend Subject
        * * SQL Data Type: nvarchar(255)
        * * Description: The subject line used when resending the email campaign activity.`),
    resend_status: z.string().nullable().describe(`
        * * Field Name: resend_status
        * * Display Name: Resend Status
        * * SQL Data Type: nvarchar(255)
        * * Description: The status of the resend to non-openers campaign activity. The resend_status is only returned in the response results if the campaign activity is either scheduled to be sent or was already sent.`),
    resend_date: z.string().nullable().describe(`
        * * Field Name: resend_date
        * * Display Name: Resend Date
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The system generated date and time (in ISO-8601 format) that the email campaign activity was resent to non-openers (only included in the response results for sent resend activities).`),
    resend_request_id: z.string().nullable().describe(`
        * * Field Name: resend_request_id
        * * Display Name: Resend Request Id
        * * SQL Data Type: nvarchar(255)
        * * Description: For scheduled or sent resend to non-opener emails, the system generates an ID that identifies the resend to non-openers activity. For draft email campaign resend activities, the system returns DRAFT.`),
    delay_minutes: z.string().nullable().describe(`
        * * Field Name: delay_minutes
        * * Display Name: Delay Minutes
        * * SQL Data Type: nvarchar(255)
        * * Description: The number of minutes to wait before Constant Contact resends the email. There are 1,440 minutes in a day. Valid values includes a minimum of 720 (12 hours) and a maximum of 14,400 minutes (10 days). This property is mutually exclusive with delay_days.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactemail_campaign_activity_non_opener_resendsEntityType = z.infer<typeof constantcontactemail_campaign_activity_non_opener_resendsSchema>;

/**
 * zod schema definition for the entity Email Campaign Activity Previews
 */
export const constantcontactemail_campaign_activity_previewsSchema = z.object({
    preheader: z.string().nullable().describe(`
        * * Field Name: preheader
        * * Display Name: preheader
        * * SQL Data Type: nvarchar(255)
        * * Description: The email preheader for the email campaign activity. Only format_type 3, 4, and 5 email campaign activities use the preheader property.`),
    preview_html_content: z.string().nullable().describe(`
        * * Field Name: preview_html_content
        * * Display Name: Preview Html Content
        * * SQL Data Type: nvarchar(255)
        * * Description: An HTML preview of the email campaign activity.`),
    from_email: z.string().nullable().describe(`
        * * Field Name: from_email
        * * Display Name: From Email
        * * SQL Data Type: nvarchar(255)
        * * Description: The "from email" email header for the email campaign activity.`),
    reply_to_email: z.string().nullable().describe(`
        * * Field Name: reply_to_email
        * * Display Name: Reply To Email
        * * SQL Data Type: nvarchar(255)
        * * Description: The email "Reply To Email" field for the email campaign activity.`),
    campaign_activity_id: z.string().nullable().describe(`
        * * Field Name: campaign_activity_id
        * * Display Name: Campaign Activity Id
        * * SQL Data Type: nvarchar(255)
        * * Related Entity/Foreign Key: Email Campaign Activities (vwEmail_campaign_activities.campaign_activity_id)
        * * Description: The unique ID for an email campaign activity.`),
    from_name: z.string().nullable().describe(`
        * * Field Name: from_name
        * * Display Name: From Name
        * * SQL Data Type: nvarchar(255)
        * * Description: The "from name" email header for the email campaign activity.`),
    preview_text_content: z.string().nullable().describe(`
        * * Field Name: preview_text_content
        * * Display Name: Preview Text Content
        * * SQL Data Type: nvarchar(255)
        * * Description: A plain text preview of the email campaign activity.`),
    subject: z.string().nullable().describe(`
        * * Field Name: subject
        * * Display Name: subject
        * * SQL Data Type: nvarchar(255)
        * * Description: The email "Subject" field for the email campaign activity.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactemail_campaign_activity_previewsEntityType = z.infer<typeof constantcontactemail_campaign_activity_previewsSchema>;

/**
 * zod schema definition for the entity Email Campaign Activity Send Histories
 */
export const constantcontactemail_campaign_activity_send_historySchema = z.object({
    reason_code: z.string().nullable().describe(`
        * * Field Name: reason_code
        * * Display Name: Reason Code
        * * SQL Data Type: nvarchar(255)
        * * Description: The reason why the send attempt completed or encountered an error. This method returns 0 if Constant Contact successfully sent the email campaign activity to contacts. Possible reason_code values are: 
      0 — Constant Contact successfully sent the email to contacts.
      1 — An error occurred when sending this email. Try scheduling it again, or contact Customer Support.
      2 — We were unable to send the email. Please contact our Account Review Team for more information.
      3 `),
    segment_ids: z.string().nullable().describe(`
        * * Field Name: segment_ids
        * * Display Name: Segment Ids
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The contact segments that Constant Contact sent the email campaign activity to as an array of segment_id integers.`),
    count: z.string().nullable().describe(`
        * * Field Name: count
        * * Display Name: count
        * * SQL Data Type: nvarchar(255)
        * * Description: The number of contacts that Constant Contact sent this email campaign activity to. This property is specific to each send history object. When you resend an email campaign activity, Constant Contact only sends it to new contacts in the contact lists or segments you are using.`),
    send_id: z.string().nullable().describe(`
        * * Field Name: send_id
        * * Display Name: Send Id
        * * SQL Data Type: nvarchar(255)
        * * Description: Uniquely identifies each send history object using the number of times that you sent the email campaign activity as a sequence starting at 1. For example, when you send a specific email campaign activity twice this method returns an object with a send_id of 1 for the first send and an object with a send_id of 2 for the second send.`),
    run_date: z.string().nullable().describe(`
        * * Field Name: run_date
        * * Display Name: Run Date
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The system generated date and time that Constant Contact sent the email campaign activity to contacts in ISO-8601 format.`),
    send_status: z.string().nullable().describe(`
        * * Field Name: send_status
        * * Display Name: Send Status
        * * SQL Data Type: nvarchar(255)
        * * Description: The send status for the email campaign activity. Valid values are:  
  COMPLETED: Constant Contact successfully sent the email campaign activity.
  ERRORED: Constant Contact encountered an error when sending the email campaign activity.`),
    contact_list_ids: z.string().nullable().describe(`
        * * Field Name: contact_list_ids
        * * Display Name: Contact List Ids
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The contacts lists that Constant Contact sent email campaign activity to as an array of contact list_id strings.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactemail_campaign_activity_send_historyEntityType = z.infer<typeof constantcontactemail_campaign_activity_send_historySchema>;

/**
 * zod schema definition for the entity Email Reports Links
 */
export const constantcontactemail_reports_linksSchema = z.object({
    unique_clicks: z.string().nullable().describe(`
        * * Field Name: unique_clicks
        * * Display Name: Unique Clicks
        * * SQL Data Type: nvarchar(255)
        * * Description: The number of unique contacts that clicked the link.`),
    url_id: z.string().nullable().describe(`
        * * Field Name: url_id
        * * Display Name: Url Id
        * * SQL Data Type: nvarchar(255)
        * * Description: The ID for a unique link URL in an email campaign activity.`),
    link_tag: z.string().nullable().describe(`
        * * Field Name: link_tag
        * * Display Name: Link Tag
        * * SQL Data Type: nvarchar(255)
        * * Description: Link tags are not currently available in email campaigns. By default, this method combines results for duplicate link URLs. Link tags will allow users to get a separate link click report for each unique link_tag value they use, even if URLs are not unique.`),
    link_url: z.string().nullable().describe(`
        * * Field Name: link_url
        * * Display Name: Link Url
        * * SQL Data Type: nvarchar(255)
        * * Description: The URL of a link in an email campaign activity. This URL is not normalized and appears the same as the URL in the email campaign activity.`),
    list_action: z.string().nullable().describe(`
        * * Field Name: list_action
        * * Display Name: List Action
        * * SQL Data Type: nvarchar(255)
        * * Description: If the link uses the click segmentation feature, this property contains the action that contacts trigger when they click the link. Currently the only available action is add, which adds contacts that click the link to a contact list.`),
    list_id: z.string().nullable().describe(`
        * * Field Name: list_id
        * * Display Name: List Id
        * * SQL Data Type: nvarchar(255)
        * * Related Entity/Foreign Key: Contact Lists (vwContact_lists.list_id)
        * * Description: If the link uses the click segmentation feature, this property contains the contact list linked with the list_action property.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactemail_reports_linksEntityType = z.infer<typeof constantcontactemail_reports_linksSchema>;

/**
 * zod schema definition for the entity Email Reports Summaries
 */
export const constantcontactemail_reports_summarySchema = z.object({
    last_sent_date: z.string().nullable().describe(`
        * * Field Name: last_sent_date
        * * Display Name: Last Sent Date
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The date and time that the email campaign was last sent.`),
    campaign_id: z.string().nullable().describe(`
        * * Field Name: campaign_id
        * * Display Name: Campaign Id
        * * SQL Data Type: nvarchar(450)
        * * Related Entity/Foreign Key: Emails (vwEmails.campaign_id)
        * * Description: The ID that uniquely identifies an email campaign.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    unique_counts: z.string().nullable().describe(`
        * * Field Name: unique_counts
        * * Display Name: Unique Counts
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The total number of times each unique contact interacted with a tracked email campaign activity.`),
    campaign_type: z.string().nullable().describe(`
        * * Field Name: campaign_type
        * * Display Name: Campaign Type
        * * SQL Data Type: nvarchar(812)
        * * Description: Identifies the email campaign type.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactemail_reports_summaryEntityType = z.infer<typeof constantcontactemail_reports_summarySchema>;

/**
 * zod schema definition for the entity Emails
 */
export const constantcontactemailsSchema = z.object({
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The system generated date and time that this email campaign was created. This string is readonly and is in ISO-8601 format.`),
    type: z.string().nullable().describe(`
        * * Field Name: type
        * * Display Name: type
        * * SQL Data Type: nvarchar(812)
        * * Description: Identifies the type of campaign that you select when creating the campaign. Newsletter and Custom Code email campaigns are the primary types.`),
    updated_at: z.string().nullable().describe(`
        * * Field Name: updated_at
        * * Display Name: Updated At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The system generated date and time showing when the campaign was last updated. This string is read only and is in ISO-8601 format.`),
    current_status: z.string().nullable().describe(`
        * * Field Name: current_status
        * * Display Name: Current Status
        * * SQL Data Type: nvarchar(812)
        * * Description: The current status of the email campaign. Valid values are: 
  Draft — An email campaign that you have created but have not sent to contacts.
  Scheduled — An email campaign that you have scheduled for Constant Contact to send to contacts.
  Executing — An email campaign that Constant Contact is currently sending to contacts. Email campaign activities are only in this status briefly.
  Done — An email campaign that you successfully sent to contacts.
  Error — An email campaign activity`),
    campaign_activities: z.string().nullable().describe(`
        * * Field Name: campaign_activities
        * * Display Name: Campaign Activities
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Lists the role and unique activity ID of each campaign activity that is associated with an Email Campaign.`),
    campaign_id: z.string().nullable().describe(`
        * * Field Name: campaign_id
        * * Display Name: Campaign Id
        * * SQL Data Type: nvarchar(450)
        * * Description: The unique ID used to identify the email campaign (UUID format).`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    name: z.string().nullable().describe(`
        * * Field Name: name
        * * Display Name: name
        * * SQL Data Type: nvarchar(812)
        * * Description: The descriptive name the user provides to identify this campaign. Campaign names must be unique for each account ID.`),
    type_code: z.string().nullable().describe(`
        * * Field Name: type_code
        * * Display Name: Type Code
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The code used to identify the email campaign \`type\`. 
   1  (Default) 
   2  (Bulk Email) 
   10 (Newsletter) 
   11 (Announcement) 
   12 (Product/Service News) 
   14 (Business Letter) 
   15 (Card) 
   16 (Press release)
   17 (Flyer) 
   18 (Feedback Request) 
   19 (Ratings and Reviews) 
   20 (Event Announcement) 
   21 (Simple Coupon) 
   22 (Sale Promotion) 
   23 (Product Promotion) 
   24 (Membership Drive) 
   25 (Fundraiser) 
   26 (Custom Code Email)
   57 (A/B Test)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactemailsEntityType = z.infer<typeof constantcontactemailsSchema>;

/**
 * zod schema definition for the entity Emails Xrefs
 */
export const constantcontactemails_xrefsSchema = z.object({
    campaign_id: z.string().nullable().describe(`
        * * Field Name: campaign_id
        * * Display Name: Campaign Id
        * * SQL Data Type: nvarchar(812)
        * * Related Entity/Foreign Key: Emails (vwEmails.campaign_id)
        * * Description: Identifies a campaign in the V3 API. In the V3 API, each campaign contains one or more activities. For more information, see V3 Email Campaign Resource Changes.`),
    campaign_activity_id: z.string().nullable().describe(`
        * * Field Name: campaign_activity_id
        * * Display Name: Campaign Activity Id
        * * SQL Data Type: nvarchar(450)
        * * Related Entity/Foreign Key: Email Campaign Activities (vwEmail_campaign_activities.campaign_activity_id)
        * * Description: Identifies a campaign activity in the V3 API. In the V3 API, each campaign contains one or more activities. Email type activities represent the detailed information in an email and contain properties like from_email and from_name. For more information, see V3 Campaign Resource Changes.`),
    v2_email_campaign_id: z.string().nullable().describe(`
        * * Field Name: v2_email_campaign_id
        * * Display Name: V2 Email Campaign Id
        * * SQL Data Type: nvarchar(812)
        * * Description: Identifies an email campaign in the V2 API.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactemails_xrefsEntityType = z.infer<typeof constantcontactemails_xrefsSchema>;

/**
 * zod schema definition for the entity Events
 */
export const constantcontacteventsSchema = z.object({
    event_metadata: z.string().nullable().describe(`
        * * Field Name: event_metadata
        * * Display Name: Event Metadata
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Includes additional event information.`),
    campaign_id: z.string().nullable().describe(`
        * * Field Name: campaign_id
        * * Display Name: Campaign Id
        * * SQL Data Type: nvarchar(812)
        * * Related Entity/Foreign Key: Emails (vwEmails.campaign_id)
        * * Description: The system assigned ID that uniquely identifies the event and is identical to the \`event_id\`.`),
    eso: z.string().nullable().describe(`
        * * Field Name: eso
        * * Display Name: eso
        * * SQL Data Type: nvarchar(812)
        * * Description: The encrypted SOId.`),
    event_calendar_url: z.string().nullable().describe(`
        * * Field Name: event_calendar_url
        * * Display Name: Event Calendar Url
        * * SQL Data Type: nvarchar(812)
        * * Description: The event calendar URL.`),
    failed_campaign_activities: z.string().nullable().describe(`
        * * Field Name: failed_campaign_activities
        * * Display Name: Failed Campaign Activities
        * * SQL Data Type: nvarchar(MAX)
        * * Description: List of failed campaign activities.`),
    create_time: z.string().nullable().describe(`
        * * Field Name: create_time
        * * Display Name: Create Time
        * * SQL Data Type: nvarchar(812)
        * * Description: The time the event was created, in ISO format. Read-only.`),
    event_id: z.string().nullable().describe(`
        * * Field Name: event_id
        * * Display Name: Event Id
        * * SQL Data Type: nvarchar(450)
        * * Description: The ID that uniquely identifies the event.`),
    status: z.string().nullable().describe(`
        * * Field Name: status
        * * Display Name: status
        * * SQL Data Type: nvarchar(812)
        * * Description: Specifies the event's current status.`),
    contact: z.string().nullable().describe(`
        * * Field Name: contact
        * * Display Name: contact
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The contact information associated with the event.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    time_zone_abbreviation: z.string().nullable().describe(`
        * * Field Name: time_zone_abbreviation
        * * Display Name: Time Zone Abbreviation
        * * SQL Data Type: nvarchar(812)
        * * Description: The abbreviation to use to indicate the time zone where the event takes place.`),
    deleted_time: z.string().nullable().describe(`
        * * Field Name: deleted_time
        * * Display Name: Deleted Time
        * * SQL Data Type: nvarchar(812)
        * * Description: The time the event was deleted, in ISO format. Read-only.`),
    address: z.string().nullable().describe(`
        * * Field Name: address
        * * Display Name: address
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Address (events).`),
    display_end_time_flag: z.string().nullable().describe(`
        * * Field Name: display_end_time_flag
        * * Display Name: Display End Time Flag
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Display or hide the event end time on the registration form and registration confirmation message.`),
    event_settings: z.string().nullable().describe(`
        * * Field Name: event_settings
        * * Display Name: Event Settings
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Event Settings (events).`),
    event_start: z.string().nullable().describe(`
        * * Field Name: event_start
        * * Display Name: Event Start
        * * SQL Data Type: nvarchar(812)
        * * Description: The date the event starts.`),
    default_track: z.string().nullable().describe(`
        * * Field Name: default_track
        * * Display Name: Default Track
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Default Track (events).`),
    name: z.string().nullable().describe(`
        * * Field Name: name
        * * Display Name: name
        * * SQL Data Type: nvarchar(812)
        * * Description: The name of the event, has to be unique for the account.`),
    online_meeting: z.string().nullable().describe(`
        * * Field Name: online_meeting
        * * Display Name: Online Meeting
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The online meeting information for a virtual event.`),
    title: z.string().nullable().describe(`
        * * Field Name: title
        * * Display Name: title
        * * SQL Data Type: nvarchar(812)
        * * Description: The title for the event. The title does not have to be unique for an account.`),
    currency_type: z.string().nullable().describe(`
        * * Field Name: currency_type
        * * Display Name: Currency Type
        * * SQL Data Type: nvarchar(812)
        * * Description: The accepted currency for payments. Required for events collecting payments ['AUD','BRL','CAD','CHF','CZK','DKK','EUR','GBP','HKD','HUF','ILS','JPY','MXN','MYR','NOK','NZD','PHP','PLN','RUB','SEK','SGD','THB','TRY','TWD','USD']`),
    time_zone: z.string().nullable().describe(`
        * * Field Name: time_zone
        * * Display Name: Time Zone
        * * SQL Data Type: nvarchar(812)
        * * Description: The time zone where the event takes place.`),
    notify_owner_on_reg: z.string().nullable().describe(`
        * * Field Name: notify_owner_on_reg
        * * Display Name: Notify Owner On Reg
        * * SQL Data Type: nvarchar(MAX)
        * * Description: If \`true\`, sends an email to the event owner when a registration is made.`),
    last_update_time: z.string().nullable().describe(`
        * * Field Name: last_update_time
        * * Display Name: Last Update Time
        * * SQL Data Type: nvarchar(812)
        * * Description: The date and time the event was last modified.`),
    event_promotions: z.string().nullable().describe(`
        * * Field Name: event_promotions
        * * Display Name: Event Promotions
        * * SQL Data Type: nvarchar(MAX)
        * * Description: List of event promotions.`),
    display_time_zone_flag: z.string().nullable().describe(`
        * * Field Name: display_time_zone_flag
        * * Display Name: Display Time Zone Flag
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Display the time zone on the registration form and registration confirmation message.`),
    cancelled_time: z.string().nullable().describe(`
        * * Field Name: cancelled_time
        * * Display Name: Cancelled Time
        * * SQL Data Type: nvarchar(812)
        * * Description: The time the event was cancelled, in ISO format. Read-only.`),
    display_contact_flag: z.string().nullable().describe(`
        * * Field Name: display_contact_flag
        * * Display Name: Display Contact Flag
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Display or hide event contact information on the registration form and registration confirmation message.`),
    location_type: z.string().nullable().describe(`
        * * Field Name: location_type
        * * Display Name: Location Type
        * * SQL Data Type: nvarchar(812)
        * * Description: Specifies if the event is physical and/or virtual, or to be determined.`),
    display_on_calendar_flag: z.string().nullable().describe(`
        * * Field Name: display_on_calendar_flag
        * * Display Name: Display On Calendar Flag
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Display the event on the Event Calendar.`),
    event_end: z.string().nullable().describe(`
        * * Field Name: event_end
        * * Display Name: Event End
        * * SQL Data Type: nvarchar(812)
        * * Description: The date the event ends.`),
    description: z.string().nullable().describe(`
        * * Field Name: description
        * * Display Name: description
        * * SQL Data Type: nvarchar(900)
        * * Description: Provides the event description.`),
    event_type: z.string().nullable().describe(`
        * * Field Name: event_type
        * * Display Name: Event Type
        * * SQL Data Type: nvarchar(812)
        * * Description: Identifies the event type.`),
    registration_url: z.string().nullable().describe(`
        * * Field Name: registration_url
        * * Display Name: Registration Url
        * * SQL Data Type: nvarchar(812)
        * * Description: The event registration URL.`),
    event_code: z.string().nullable().describe(`
        * * Field Name: event_code
        * * Display Name: Event Code
        * * SQL Data Type: nvarchar(812)
        * * Description: The short code to use for the event.`),
    active_time: z.string().nullable().describe(`
        * * Field Name: active_time
        * * Display Name: Active Time
        * * SQL Data Type: nvarchar(812)
        * * Description: The time the event was published, in ISO format.`),
    event_widget_url: z.string().nullable().describe(`
        * * Field Name: event_widget_url
        * * Display Name: Event Widget Url
        * * SQL Data Type: nvarchar(812)
        * * Description: The event widget URL.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontacteventsEntityType = z.infer<typeof constantcontacteventsSchema>;

/**
 * zod schema definition for the entity Events Copies
 */
export const constantcontactevents_copySchema = z.object({
    display_on_calendar_flag: z.string().nullable().describe(`
        * * Field Name: display_on_calendar_flag
        * * Display Name: Display On Calendar Flag
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Display the event on the Event Calendar.`),
    title: z.string().nullable().describe(`
        * * Field Name: title
        * * Display Name: title
        * * SQL Data Type: nvarchar(400)
        * * Description: The title for the event. The title does not have to be unique for an account.`),
    default_track: z.string().nullable().describe(`
        * * Field Name: default_track
        * * Display Name: Default Track
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Default Track (events_copy).`),
    deleted_time: z.string().nullable().describe(`
        * * Field Name: deleted_time
        * * Display Name: Deleted Time
        * * SQL Data Type: nvarchar(255)
        * * Description: The time the event was deleted, in ISO format. Read-only.`),
    event_type: z.string().nullable().describe(`
        * * Field Name: event_type
        * * Display Name: Event Type
        * * SQL Data Type: nvarchar(255)
        * * Description: Identifies the event type.`),
    display_time_zone_flag: z.string().nullable().describe(`
        * * Field Name: display_time_zone_flag
        * * Display Name: Display Time Zone Flag
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Display the time zone on the registration form and registration confirmation message.`),
    event_code: z.string().nullable().describe(`
        * * Field Name: event_code
        * * Display Name: Event Code
        * * SQL Data Type: nvarchar(255)
        * * Description: The short code to use for the event.`),
    address: z.string().nullable().describe(`
        * * Field Name: address
        * * Display Name: address
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Address (events_copy).`),
    time_zone: z.string().nullable().describe(`
        * * Field Name: time_zone
        * * Display Name: Time Zone
        * * SQL Data Type: nvarchar(255)
        * * Description: The time zone where the event takes place.`),
    event_id: z.string().nullable().describe(`
        * * Field Name: event_id
        * * Display Name: Event Id
        * * SQL Data Type: nvarchar(255)
        * * Related Entity/Foreign Key: Events (vwEvents.event_id)
        * * Description: The ID that uniquely identifies the event.`),
    event_widget_url: z.string().nullable().describe(`
        * * Field Name: event_widget_url
        * * Display Name: Event Widget Url
        * * SQL Data Type: nvarchar(255)
        * * Description: The event widget URL.`),
    last_update_time: z.string().nullable().describe(`
        * * Field Name: last_update_time
        * * Display Name: Last Update Time
        * * SQL Data Type: nvarchar(255)
        * * Description: The date and time the event was last modified.`),
    event_start: z.string().nullable().describe(`
        * * Field Name: event_start
        * * Display Name: Event Start
        * * SQL Data Type: nvarchar(255)
        * * Description: The date the event starts.`),
    create_time: z.string().nullable().describe(`
        * * Field Name: create_time
        * * Display Name: Create Time
        * * SQL Data Type: nvarchar(255)
        * * Description: The time the event was created, in ISO format. Read-only.`),
    event_promotions: z.string().nullable().describe(`
        * * Field Name: event_promotions
        * * Display Name: Event Promotions
        * * SQL Data Type: nvarchar(MAX)
        * * Description: List of event promotions.`),
    description: z.string().nullable().describe(`
        * * Field Name: description
        * * Display Name: description
        * * SQL Data Type: nvarchar(900)
        * * Description: Provides the event description.`),
    location_type: z.string().nullable().describe(`
        * * Field Name: location_type
        * * Display Name: Location Type
        * * SQL Data Type: nvarchar(255)
        * * Description: Specifies if the event is physical and/or virtual, or to be determined.`),
    failed_campaign_activities: z.string().nullable().describe(`
        * * Field Name: failed_campaign_activities
        * * Display Name: Failed Campaign Activities
        * * SQL Data Type: nvarchar(MAX)
        * * Description: List of failed campaign activities.`),
    active_time: z.string().nullable().describe(`
        * * Field Name: active_time
        * * Display Name: Active Time
        * * SQL Data Type: nvarchar(255)
        * * Description: The time the event was published, in ISO format.`),
    campaign_id: z.string().nullable().describe(`
        * * Field Name: campaign_id
        * * Display Name: Campaign Id
        * * SQL Data Type: nvarchar(255)
        * * Related Entity/Foreign Key: Emails (vwEmails.campaign_id)
        * * Description: The system assigned ID that uniquely identifies the event and is identical to the \`event_id\`.`),
    name: z.string().nullable().describe(`
        * * Field Name: name
        * * Display Name: name
        * * SQL Data Type: nvarchar(400)
        * * Description: The name of the event, has to be unique for the account.`),
    event_calendar_url: z.string().nullable().describe(`
        * * Field Name: event_calendar_url
        * * Display Name: Event Calendar Url
        * * SQL Data Type: nvarchar(255)
        * * Description: The event calendar URL.`),
    registration_url: z.string().nullable().describe(`
        * * Field Name: registration_url
        * * Display Name: Registration Url
        * * SQL Data Type: nvarchar(255)
        * * Description: The event registration URL.`),
    currency_type: z.string().nullable().describe(`
        * * Field Name: currency_type
        * * Display Name: Currency Type
        * * SQL Data Type: nvarchar(255)
        * * Description: The accepted currency for payments. Required for events collecting payments ['AUD','BRL','CAD','CHF','CZK','DKK','EUR','GBP','HKD','HUF','ILS','JPY','MXN','MYR','NOK','NZD','PHP','PLN','RUB','SEK','SGD','THB','TRY','TWD','USD']`),
    eso: z.string().nullable().describe(`
        * * Field Name: eso
        * * Display Name: eso
        * * SQL Data Type: nvarchar(255)
        * * Description: The encrypted SOId.`),
    cancelled_time: z.string().nullable().describe(`
        * * Field Name: cancelled_time
        * * Display Name: Cancelled Time
        * * SQL Data Type: nvarchar(255)
        * * Description: The time the event was cancelled, in ISO format. Read-only.`),
    display_contact_flag: z.string().nullable().describe(`
        * * Field Name: display_contact_flag
        * * Display Name: Display Contact Flag
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Display or hide event contact information on the registration form and registration confirmation message.`),
    event_end: z.string().nullable().describe(`
        * * Field Name: event_end
        * * Display Name: Event End
        * * SQL Data Type: nvarchar(255)
        * * Description: The date the event ends.`),
    online_meeting: z.string().nullable().describe(`
        * * Field Name: online_meeting
        * * Display Name: Online Meeting
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The online meeting information for a virtual event.`),
    display_end_time_flag: z.string().nullable().describe(`
        * * Field Name: display_end_time_flag
        * * Display Name: Display End Time Flag
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Display or hide the event end time on the registration form and registration confirmation message.`),
    contact: z.string().nullable().describe(`
        * * Field Name: contact
        * * Display Name: contact
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The contact information associated with the event.`),
    status: z.string().nullable().describe(`
        * * Field Name: status
        * * Display Name: status
        * * SQL Data Type: nvarchar(255)
        * * Description: Specifies the event's current status.`),
    event_metadata: z.string().nullable().describe(`
        * * Field Name: event_metadata
        * * Display Name: Event Metadata
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Includes additional event information.`),
    time_zone_abbreviation: z.string().nullable().describe(`
        * * Field Name: time_zone_abbreviation
        * * Display Name: Time Zone Abbreviation
        * * SQL Data Type: nvarchar(255)
        * * Description: The abbreviation to use to indicate the time zone where the event takes place.`),
    notify_owner_on_reg: z.string().nullable().describe(`
        * * Field Name: notify_owner_on_reg
        * * Display Name: Notify Owner On Reg
        * * SQL Data Type: nvarchar(MAX)
        * * Description: If \`true\`, sends an email to the event owner when a registration is made.`),
    event_settings: z.string().nullable().describe(`
        * * Field Name: event_settings
        * * Display Name: Event Settings
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Event Settings (events_copy).`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactevents_copyEntityType = z.infer<typeof constantcontactevents_copySchema>;

/**
 * zod schema definition for the entity Events Registrations
 */
export const constantcontactevents_registrationsSchema = z.object({
    registration_date: z.string().nullable().describe(`
        * * Field Name: registration_date
        * * Display Name: Registration Date
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The event registration date, in ISO format.`),
    eligible_checkin_tickets: z.string().nullable().describe(`
        * * Field Name: eligible_checkin_tickets
        * * Display Name: Eligible Checkin Tickets
        * * SQL Data Type: nvarchar(255)
        * * Description: The total number of tickets eligible for checkin.`),
    display_physical_tickets: z.string().nullable().describe(`
        * * Field Name: display_physical_tickets
        * * Display Name: Display Physical Tickets
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Determines if the physical tickets should display or not display.`),
    contact_id: z.string().nullable().describe(`
        * * Field Name: contact_id
        * * Display Name: Contact Id
        * * SQL Data Type: nvarchar(255)
        * * Related Entity/Foreign Key: Contacts (vwContacts.contact_id)
        * * Description: The unique ID used to identify a contact.`),
    contact: z.string().nullable().describe(`
        * * Field Name: contact
        * * Display Name: contact
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Contact (events_registrations).`),
    registration_id: z.string().nullable().describe(`
        * * Field Name: registration_id
        * * Display Name: Registration Id
        * * SQL Data Type: nvarchar(255)
        * * Description: The unique ID used to identify an event registration.`),
    checkedIn_tickets: z.string().nullable().describe(`
        * * Field Name: checkedIn_tickets
        * * Display Name: Checked In Tickets
        * * SQL Data Type: nvarchar(255)
        * * Description: The total number of tickets assigned to a given registration_id.`),
    registration_status: z.string().nullable().describe(`
        * * Field Name: registration_status
        * * Display Name: Registration Status
        * * SQL Data Type: nvarchar(255)
        * * Description: Provides the current registration status; REGISTERED, PENDING, CANCELED, EXPIRED, IN_PROGRESS, FAILED.`),
    checkin_status: z.string().nullable().describe(`
        * * Field Name: checkin_status
        * * Display Name: Checkin Status
        * * SQL Data Type: nvarchar(255)
        * * Description: Provides the status of eligible checkin tickets.`),
    order_summary: z.string().nullable().describe(`
        * * Field Name: order_summary
        * * Display Name: Order Summary
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Order Summary (events_registrations).`),
    tickets: z.string().nullable().describe(`
        * * Field Name: tickets
        * * Display Name: tickets
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Tickets (events_registrations).`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactevents_registrationsEntityType = z.infer<typeof constantcontactevents_registrationsSchema>;

/**
 * zod schema definition for the entity Segments
 */
export const constantcontactsegmentsSchema = z.object({
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    created_at: z.string().nullable().describe(`
        * * Field Name: created_at
        * * Display Name: Created At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The system generated date and time (ISO-8601) that the segment was created.`),
    edited_at: z.string().nullable().describe(`
        * * Field Name: edited_at
        * * Display Name: Edited At
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The system generated date and time (ISO-8601) that the segment's name or  segment_criteria was last updated.`),
    segment_id: z.string().nullable().describe(`
        * * Field Name: segment_id
        * * Display Name: Segment Id
        * * SQL Data Type: nvarchar(450)
        * * Description: The system generated number that uniquely identifies the segment.`),
    name: z.string().nullable().describe(`
        * * Field Name: name
        * * Display Name: name
        * * SQL Data Type: nvarchar(812)
        * * Description: The segment's unique descriptive name.`),
    segment_criteria: z.string().nullable().describe(`
        * * Field Name: segment_criteria
        * * Display Name: Segment Criteria
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The segment's contact selection criteria formatted as single-string escaped JSON.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactsegmentsEntityType = z.infer<typeof constantcontactsegmentsSchema>;

/**
 * zod schema definition for the entity Social Connections
 */
export const constantcontactsocial_connectionsSchema = z.object({
    account_info: z.string().nullable().describe(`
        * * Field Name: account_info
        * * Display Name: Account Info
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Account information for this connection.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    ID: z.string().nullable().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: nvarchar(450)`),
    connection_status: z.string().nullable().describe(`
        * * Field Name: connection_status
        * * Display Name: Connection Status
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Status details for this connection.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactsocial_connectionsEntityType = z.infer<typeof constantcontactsocial_connectionsSchema>;

/**
 * zod schema definition for the entity Social Hashtag Groups
 */
export const constantcontactsocial_hashtag_groupsSchema = z.object({
    hashtag_group_id: z.string().nullable().describe(`
        * * Field Name: hashtag_group_id
        * * Display Name: Hashtag Group Id
        * * SQL Data Type: nvarchar(450)
        * * Description: Unique identifier for this hashtag group. Automatically generated on creation and returned in all responses.`),
    hashtag_group_name: z.string().nullable().describe(`
        * * Field Name: hashtag_group_name
        * * Display Name: Hashtag Group Name
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The human-readable name for this group. This name will be sanitized before saving, which may include trimming whitespace, truncation, and/or removing invalid characters. If the sanitized name results in a blank string, it will not be able to be saved, and any create or update operation will fail.The name is currently limited to a maximum of 150 characters, but the effective length may be shorter, depending on whether special characters (such as emoji) are used.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    hashtag_names: z.string().nullable().describe(`
        * * Field Name: hashtag_names
        * * Display Name: Hashtag Names
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The list of hashtag names for this group. Hashtag names do not include any leading '#' character. They can only consist of alphanumeric characters and '_' (underscore). The hashtag name cannot begin or end with an underscore. Hashtag names may begin with a letter or a number, and may consist of only numbers. Hashtag names are currently limited to a maximum of 30 characters.The list order is preserved. If duplicates exist, they will be removed when saving, and the first occurrence will `),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactsocial_hashtag_groupsEntityType = z.infer<typeof constantcontactsocial_hashtag_groupsSchema>;

/**
 * zod schema definition for the entity Social Posts
 */
export const constantcontactsocial_postsSchema = z.object({
    campaign_id: z.string().nullable().describe(`
        * * Field Name: campaign_id
        * * Display Name: Campaign Id
        * * SQL Data Type: nvarchar(450)
        * * Related Entity/Foreign Key: Emails (vwEmails.campaign_id)
        * * Description: Unique identifier for the post campaign. Generated by the server on creation. Use this value to reference the post in subsequent requests.`),
    status: z.string().nullable().describe(`
        * * Field Name: status
        * * Display Name: status
        * * SQL Data Type: nvarchar(812)
        * * Description: The current status of the post. Possible values include:

  DRAFT — saved without being scheduled for publication
  SCHEDULED — scheduled for future publication at scheduled_time
  EXECUTING — currently being published
  ACTIVE — the post has been published and is active on the social network
  PAUSED — publication has been paused
  SUSPENDED — publication has been suspended
  REMOVED — the post has been removed
  DONE — publication has completed
  ERROR — publication encountered an er`),
    profile_posts: z.string().nullable().describe(`
        * * Field Name: profile_posts
        * * Display Name: Profile Posts
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The list of per-profile posts that make up this campaign.`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    name: z.string().nullable().describe(`
        * * Field Name: name
        * * Display Name: name
        * * SQL Data Type: nvarchar(812)
        * * Description: Campaign name for this post. The value provided on creation is sanitized before saving, so the returned value may not exactly match what was sent.`),
    scheduled_time: z.string().nullable().describe(`
        * * Field Name: scheduled_time
        * * Display Name: Scheduled Time
        * * SQL Data Type: nvarchar(812)
        * * Description: The date and time to publish the post, in ISO-8601 format. Only set when status is SCHEDULED.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactsocial_postsEntityType = z.infer<typeof constantcontactsocial_postsSchema>;

/**
 * zod schema definition for the entity Social Profiles
 */
export const constantcontactsocial_profilesSchema = z.object({
    name: z.string().nullable().describe(`
        * * Field Name: name
        * * Display Name: name
        * * SQL Data Type: nvarchar(812)
        * * Description: Display name of the profile.`),
    account_info: z.string().nullable().describe(`
        * * Field Name: account_info
        * * Display Name: Account Info
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Account Info (social_profiles).`),
    mj_e2e_custom_attr: z.string().nullable().describe(`
        * * Field Name: mj_e2e_custom_attr
        * * Display Name: Mj E 2e Custom Attr
        * * SQL Data Type: nvarchar(812)`),
    handle: z.string().nullable().describe(`
        * * Field Name: handle
        * * Display Name: handle
        * * SQL Data Type: nvarchar(812)
        * * Description: The profile's handle on the social network (for example, an Instagram or TikTok username). May be null if the network does not expose a separate handle (for example, Facebook).`),
    settings: z.string().nullable().describe(`
        * * Field Name: settings
        * * Display Name: settings
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Network-specific settings for the profile. Only populated when the request includes include=accessible and settings are available for the network. Currently, only TikTok provides settings: "content": {
  "comment_disabled": Boolean,
  "duet_disabled": Boolean,
  "stitch_disabled": Boolean,
  "max_video_post_duration_sec": Integer
}`),
    url: z.string().nullable().describe(`
        * * Field Name: url
        * * Display Name: url
        * * SQL Data Type: nvarchar(812)
        * * Description: URL to the profile on the social network.`),
    accessible: z.string().nullable().describe(`
        * * Field Name: accessible
        * * Display Name: accessible
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Whether the profile is currently accessible for posting. Publishing a post will fail if its profile is not currently accessible. Only populated when the GET request includes the query parameter include=accessible.`),
    network_user_id: z.string().nullable().describe(`
        * * Field Name: network_user_id
        * * Display Name: Network User Id
        * * SQL Data Type: nvarchar(812)
        * * Description: The social network-specific identifier for the user who owns this profile.`),
    connected: z.string().nullable().describe(`
        * * Field Name: connected
        * * Display Name: connected
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Whether this profile is currently connected. You can only create and publish posts with connected profiles.`),
    network: z.string().nullable().describe(`
        * * Field Name: network
        * * Display Name: network
        * * SQL Data Type: nvarchar(812)
        * * Description: The social network this profile belongs to.`),
    image_url: z.string().nullable().describe(`
        * * Field Name: image_url
        * * Display Name: Image Url
        * * SQL Data Type: nvarchar(812)
        * * Description: URL of the profile's image or avatar.`),
    network_profile_id: z.string().nullable().describe(`
        * * Field Name: network_profile_id
        * * Display Name: Network Profile Id
        * * SQL Data Type: nvarchar(812)
        * * Description: The social network-specific identifier for this profile.`),
    profile_id: z.string().nullable().describe(`
        * * Field Name: profile_id
        * * Display Name: Profile Id
        * * SQL Data Type: nvarchar(450)
        * * Description: Unique identifier for this profile. Use this value in the profile_id field of a ProfilePost when creating a post.`),
    __mj_integration_SyncStatus: z.string().describe(`
        * * Field Name: __mj_integration_SyncStatus
        * * Display Name: Mj Integration Sync Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Active
        * * Description: Current sync status: Active, Archived, or Error`),
    __mj_integration_LastSyncedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedAt
        * * Display Name: Mj Integration Last Synced At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the last successful sync for this record`),
    __mj_integration_LastSyncedSnapshot: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSyncedSnapshot
        * * Display Name: Mj Integration Last Synced Snapshot
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`),
    __mj_integration_SyncMessage: z.string().nullable().describe(`
        * * Field Name: __mj_integration_SyncMessage
        * * Display Name: Mj Integration Sync Message
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`),
    __mj_integration_ContentHash: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ContentHash
        * * Display Name: Mj Integration Content Hash
        * * SQL Data Type: nvarchar(64)
        * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`),
    __mj_integration_CustomOverflow: z.string().nullable().describe(`
        * * Field Name: __mj_integration_CustomOverflow
        * * Display Name: Mj Integration Custom Overflow
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`),
    __mj_integration_ExternalVersion: z.string().nullable().describe(`
        * * Field Name: __mj_integration_ExternalVersion
        * * Display Name: Mj Integration External Version
        * * SQL Data Type: nvarchar(255)
        * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`),
    __mj_integration_LastSeenModifiedValue: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastSeenModifiedValue
        * * Display Name: Mj Integration Last Seen Modified Value
        * * SQL Data Type: nvarchar(255)
        * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`),
    __mj_integration_LastReconciledAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_LastReconciledAt
        * * Display Name: Mj Integration Last Reconciled At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`),
    __mj_integration_LastWriterDirection: z.string().nullable().describe(`
        * * Field Name: __mj_integration_LastWriterDirection
        * * Display Name: Mj Integration Last Writer Direction
        * * SQL Data Type: nvarchar(10)
        * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`),
    __mj_integration_IsTombstoned: z.boolean().describe(`
        * * Field Name: __mj_integration_IsTombstoned
        * * Display Name: Mj Integration Is Tombstoned
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`),
    __mj_integration_DeletedDetectedAt: z.date().nullable().describe(`
        * * Field Name: __mj_integration_DeletedDetectedAt
        * * Display Name: Mj Integration Deleted Detected At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`),
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

export type constantcontactsocial_profilesEntityType = z.infer<typeof constantcontactsocial_profilesSchema>;
 
 

/**
 * Account Emails - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: account_emails
 * * Base View: vwAccount_emails
 * * @description GET a Collection of Account Email Addresses
 * * Primary Key: email_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Account Emails')
export class constantcontactaccount_emailsEntity extends BaseEntity<constantcontactaccount_emailsEntityType> {
    /**
    * Loads the Account Emails record from the database
    * @param email_id: string - primary key value to load the Account Emails record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactaccount_emailsEntity
    * @method
    * @override
    */
    public async Load(email_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'email_id', Value: email_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: roles
    * * Display Name: roles
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Specifies the current role of a confirmed email address in an account. Each email address can have multiple roles or no role. Possible role values are:  CONTACT — The contact email for the Constant Contact account owner. Each account can only have one CONTACT role email. BILLING — The billing address for the Constant Contact account. Each account can only have one BILLING role email. JOURNALING — An email address that Constant Contact forwards all sent email campaigns to as part of the
    */
    get roles(): string | null {
        return this.Get('roles');
    }
    set roles(value: string | null) {
        this.Set('roles', value);
    }

    /**
    * * Field Name: email_id
    * * Display Name: Email Id
    * * SQL Data Type: nvarchar(450)
    * * Description: The unique ID for an email address in a Constant Contact account.
    */
    get email_id(): string | null {
        return this.Get('email_id');
    }
    set email_id(value: string | null) {
        this.Set('email_id', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: email_address
    * * Display Name: Email Address
    * * SQL Data Type: nvarchar(812)
    * * Description: An email address associated with a Constant Contact account owner.
    */
    get email_address(): string | null {
        return this.Get('email_address');
    }
    set email_address(value: string | null) {
        this.Set('email_address', value);
    }

    /**
    * * Field Name: pending_roles
    * * Display Name: Pending Roles
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The planned role for an unconfirmed email address. Possible role values are:  CONTACT — The contact email for the Constant Contact account owner. Each account can only have one CONTACT role email. BILLING — The billing address for the Constant Contact account. Each account can only have one BILLING role email. JOURNALING — The email address that Constant Contact forwards all sent email campaigns to as part of the partner journaling compliance feature. REPLY_TO — The contact email used 
    */
    get pending_roles(): string | null {
        return this.Get('pending_roles');
    }
    set pending_roles(value: string | null) {
        this.Set('pending_roles', value);
    }

    /**
    * * Field Name: confirm_time
    * * Display Name: Confirm Time
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The date that the email address changed to CONFIRMED status in ISO-8601 format.
    */
    get confirm_time(): string | null {
        return this.Get('confirm_time');
    }
    set confirm_time(value: string | null) {
        this.Set('confirm_time', value);
    }

    /**
    * * Field Name: confirm_source_type
    * * Display Name: Confirm Source Type
    * * SQL Data Type: nvarchar(812)
    * * Description: Describes who confirmed the email address. Valid values are:
  
  SITE_OWNER — The Constant Contact account owner confirmed the email address.
  SUPPORT — Constant Contact support staff confirmed the email address.
  FORCEVERIFY — Constant Contact confirmed the email address without sending a confirmation email.
  PARTNER — A Constant Contact partner confirmed the email address.
    */
    get confirm_source_type(): string | null {
        return this.Get('confirm_source_type');
    }
    set confirm_source_type(value: string | null) {
        this.Set('confirm_source_type', value);
    }

    /**
    * * Field Name: confirm_status
    * * Display Name: Confirm Status
    * * SQL Data Type: nvarchar(812)
    * * Description: The confirmation status of the account email address. When you add a new email address to an account, Constant Contact automatically sends an email to that address with a link to confirm it. You can use any account email address with a CONFIRMED status to create an email campaign.
    */
    get confirm_status(): string | null {
        return this.Get('confirm_status');
    }
    set confirm_status(value: string | null) {
        this.Set('confirm_status', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Account Physical Addresses - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: account_physical_address
 * * Base View: vwAccount_physical_addresses
 * * @description GET the Physical Address for the Account
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Account Physical Addresses')
export class constantcontactaccount_physical_addressEntity extends BaseEntity<constantcontactaccount_physical_addressEntityType> {
    /**
    * Loads the Account Physical Addresses record from the database
    * @param ID: string - primary key value to load the Account Physical Addresses record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactaccount_physical_addressEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: address_line3
    * * Display Name: Address Line 3
    * * SQL Data Type: nvarchar(812)
    * * Description: Line 3 of the organization's street address.
    */
    get address_line3(): string | null {
        return this.Get('address_line3');
    }
    set address_line3(value: string | null) {
        this.Set('address_line3', value);
    }

    /**
    * * Field Name: postal_code
    * * Display Name: Postal Code
    * * SQL Data Type: nvarchar(812)
    * * Description: The postal code address (ZIP code) of the organization. This property is required if the state_code is US or CA, otherwise exclude this property from the request body.
    */
    get postal_code(): string | null {
        return this.Get('postal_code');
    }
    set postal_code(value: string | null) {
        this.Set('postal_code', value);
    }

    /**
    * * Field Name: state_name
    * * Display Name: State Name
    * * SQL Data Type: nvarchar(812)
    * * Description: Use if the state where the organization is physically located is not in the United States or Canada. If  country_code is  US or CA, exclude this property from the request body.
    */
    get state_name(): string | null {
        return this.Get('state_name');
    }
    set state_name(value: string | null) {
        this.Set('state_name', value);
    }

    /**
    * * Field Name: address_line1
    * * Display Name: Address Line 1
    * * SQL Data Type: nvarchar(812)
    * * Description: Line 1 of the organization's street address.
    */
    get address_line1(): string | null {
        return this.Get('address_line1');
    }
    set address_line1(value: string | null) {
        this.Set('address_line1', value);
    }

    /**
    * * Field Name: address_line2
    * * Display Name: Address Line 2
    * * SQL Data Type: nvarchar(812)
    * * Description: Line 2 of the organization's street address.
    */
    get address_line2(): string | null {
        return this.Get('address_line2');
    }
    set address_line2(value: string | null) {
        this.Set('address_line2', value);
    }

    /**
    * * Field Name: state_code
    * * Display Name: State Code
    * * SQL Data Type: nvarchar(812)
    * * Description: The two letter ISO 3166-1 code for the organization's state and only used if the country_code is US or CA. If not, exclude this property from the request body.
    */
    get state_code(): string | null {
        return this.Get('state_code');
    }
    set state_code(value: string | null) {
        this.Set('state_code', value);
    }

    /**
    * * Field Name: city
    * * Display Name: city
    * * SQL Data Type: nvarchar(812)
    * * Description: The city where the organization is located.
    */
    get city(): string | null {
        return this.Get('city');
    }
    set city(value: string | null) {
        this.Set('city', value);
    }

    /**
    * * Field Name: country_code
    * * Display Name: Country Code
    * * SQL Data Type: nvarchar(812)
    * * Description: The two letter ISO 3166-1 code for the organization's country.
    */
    get country_code(): string | null {
        return this.Get('country_code');
    }
    set country_code(value: string | null) {
        this.Set('country_code', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: nvarchar(450)
    */
    get ID(): string | null {
        return this.Get('ID');
    }
    set ID(value: string | null) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Account Summaries - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: account_summary
 * * Base View: vwAccount_summaries
 * * @description GET a Summary of Account Details
 * * Primary Key: encoded_account_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Account Summaries')
export class constantcontactaccount_summaryEntity extends BaseEntity<constantcontactaccount_summaryEntityType> {
    /**
    * Loads the Account Summaries record from the database
    * @param encoded_account_id: string - primary key value to load the Account Summaries record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactaccount_summaryEntity
    * @method
    * @override
    */
    public async Load(encoded_account_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'encoded_account_id', Value: encoded_account_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: country_code
    * * Display Name: Country Code
    * * SQL Data Type: nvarchar(812)
    * * Description: The uppercase two-letter ISO 3166-1 code representing the organization's country.
    */
    get country_code(): string | null {
        return this.Get('country_code');
    }
    set country_code(value: string | null) {
        this.Set('country_code', value);
    }

    /**
    * * Field Name: organization_phone
    * * Display Name: Organization Phone
    * * SQL Data Type: nvarchar(812)
    * * Description: The phone number of the organization that is associated with this account.
    */
    get organization_phone(): string | null {
        return this.Get('organization_phone');
    }
    set organization_phone(value: string | null) {
        this.Set('organization_phone', value);
    }

    /**
    * * Field Name: contact_phone
    * * Display Name: Contact Phone
    * * SQL Data Type: nvarchar(812)
    * * Description: The account owner's contact phone number (up to 25 characters in length).
    */
    get contact_phone(): string | null {
        return this.Get('contact_phone');
    }
    set contact_phone(value: string | null) {
        this.Set('contact_phone', value);
    }

    /**
    * * Field Name: last_name
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(812)
    * * Description: The account owner's last name.
    */
    get last_name(): string | null {
        return this.Get('last_name');
    }
    set last_name(value: string | null) {
        this.Set('last_name', value);
    }

    /**
    * * Field Name: state_code
    * * Display Name: State Code
    * * SQL Data Type: nvarchar(812)
    * * Description: The uppercase two letter ISO 3166-1 code for the organization's state. This property is required if the country_code is US (United States).
    */
    get state_code(): string | null {
        return this.Get('state_code');
    }
    set state_code(value: string | null) {
        this.Set('state_code', value);
    }

    /**
    * * Field Name: physical_address
    * * Display Name: Physical Address
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Physical Address (account_summary).
    */
    get physical_address(): string | null {
        return this.Get('physical_address');
    }
    set physical_address(value: string | null) {
        this.Set('physical_address', value);
    }

    /**
    * * Field Name: first_name
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(812)
    * * Description: The account owner's first name.
    */
    get first_name(): string | null {
        return this.Get('first_name');
    }
    set first_name(value: string | null) {
        this.Set('first_name', value);
    }

    /**
    * * Field Name: contact_email
    * * Display Name: Contact Email
    * * SQL Data Type: nvarchar(812)
    * * Description: Email addresses that are associated with the Constant Contact account owner.
    */
    get contact_email(): string | null {
        return this.Get('contact_email');
    }
    set contact_email(value: string | null) {
        this.Set('contact_email', value);
    }

    /**
    * * Field Name: organization_name
    * * Display Name: Organization Name
    * * SQL Data Type: nvarchar(812)
    * * Description: The name of the organization that is associated with this account.
    */
    get organization_name(): string | null {
        return this.Get('organization_name');
    }
    set organization_name(value: string | null) {
        this.Set('organization_name', value);
    }

    /**
    * * Field Name: website
    * * Display Name: website
    * * SQL Data Type: nvarchar(812)
    * * Description: The organization's website URL.
    */
    get website(): string | null {
        return this.Get('website');
    }
    set website(value: string | null) {
        this.Set('website', value);
    }

    /**
    * * Field Name: encoded_partner_id
    * * Display Name: Encoded Partner Id
    * * SQL Data Type: nvarchar(812)
    * * Description: The encoded partner id that identifies which Constant Contact partner provisioned the account.
    */
    get encoded_partner_id(): string | null {
        return this.Get('encoded_partner_id');
    }
    set encoded_partner_id(value: string | null) {
        this.Set('encoded_partner_id', value);
    }

    /**
    * * Field Name: encoded_account_id
    * * Display Name: Encoded Account Id
    * * SQL Data Type: nvarchar(450)
    * * Description: The readOnly encoded account ID that uniquely identifies the account.
    */
    get encoded_account_id(): string | null {
        return this.Get('encoded_account_id');
    }
    set encoded_account_id(value: string | null) {
        this.Set('encoded_account_id', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: time_zone_id
    * * Display Name: Time Zone Id
    * * SQL Data Type: nvarchar(812)
    * * Description: The time zone that is automatically set based on the state_code setting; as defined in the IANA time-zone database (see http://www.iana.org/time-zones).
    */
    get time_zone_id(): string | null {
        return this.Get('time_zone_id');
    }
    set time_zone_id(value: string | null) {
        this.Set('time_zone_id', value);
    }

    /**
    * * Field Name: company_logo
    * * Display Name: Company Logo
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Used to include an existing company logo in the response body. If a company logo does not exist, nothing is returned in the response body. This property is optional.
    */
    get company_logo(): string | null {
        return this.Get('company_logo');
    }
    set company_logo(value: string | null) {
        this.Set('company_logo', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Account User Privileges - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: account_user_privileges
 * * Base View: vwAccount_user_privileges
 * * @description GET User Privileges
 * * Primary Key: privilege_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Account User Privileges')
export class constantcontactaccount_user_privilegesEntity extends BaseEntity<constantcontactaccount_user_privilegesEntityType> {
    /**
    * Loads the Account User Privileges record from the database
    * @param privilege_id: string - primary key value to load the Account User Privileges record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactaccount_user_privilegesEntity
    * @method
    * @override
    */
    public async Load(privilege_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'privilege_id', Value: privilege_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: privilege_id
    * * Display Name: Privilege Id
    * * SQL Data Type: nvarchar(450)
    * * Description: Identifies a user privilege in Constant Contact.
    */
    get privilege_id(): string | null {
        return this.Get('privilege_id');
    }
    set privilege_id(value: string | null) {
        this.Set('privilege_id', value);
    }

    /**
    * * Field Name: privilege_name
    * * Display Name: Privilege Name
    * * SQL Data Type: nvarchar(812)
    * * Description: The name of the Constant Contact user privilege.
    */
    get privilege_name(): string | null {
        return this.Get('privilege_name');
    }
    set privilege_name(value: string | null) {
        this.Set('privilege_name', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Activities - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: activities
 * * Base View: vwActivities
 * * @description GET Activity Status Collection
 * * Primary Key: activity_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities')
export class constantcontactactivitiesEntity extends BaseEntity<constantcontactactivitiesEntityType> {
    /**
    * Loads the Activities record from the database
    * @param activity_id: string - primary key value to load the Activities record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactactivitiesEntity
    * @method
    * @override
    */
    public async Load(activity_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'activity_id', Value: activity_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: started_at
    * * Display Name: Started At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we began processing the activity request, in ISO-8601 format.
    */
    get started_at(): string | null {
        return this.Get('started_at');
    }
    set started_at(value: string | null) {
        this.Set('started_at', value);
    }

    /**
    * * Field Name: state
    * * Display Name: state
    * * SQL Data Type: nvarchar(812)
    * * Description: The state of the request:  initialized - request has been received processing - request is being processed completed - job completed cancelled - request was cancelled failed - job failed to complete timed_out - the request timed out before completing"
    */
    get state(): string | null {
        return this.Get('state');
    }
    set state(value: string | null) {
        this.Set('state', value);
    }

    /**
    * * Field Name: activity_errors
    * * Display Name: Activity Errors
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Array of messages describing the errors that occurred.
    */
    get activity_errors(): string | null {
        return this.Get('activity_errors');
    }
    set activity_errors(value: string | null) {
        this.Set('activity_errors', value);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we created the activity, in ISO-8601 format.
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: source_file_name
    * * Display Name: Source File Name
    * * SQL Data Type: nvarchar(812)
    * * Description: Name of the file used for an add_contacts activity.
    */
    get source_file_name(): string | null {
        return this.Get('source_file_name');
    }
    set source_file_name(value: string | null) {
        this.Set('source_file_name', value);
    }

    /**
    * * Field Name: _links
    * * Display Name: Links
    * * SQL Data Type: nvarchar(MAX)
    * * Description:  Links (activities).
    */
    get _links(): string | null {
        return this.Get('_links');
    }
    set _links(value: string | null) {
        this.Set('_links', value);
    }

    /**
    * * Field Name: percent_done
    * * Display Name: Percent Done
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Shows the percent done for an activity that we are still processing.
    */
    get percent_done(): string | null {
        return this.Get('percent_done');
    }
    set percent_done(value: string | null) {
        this.Set('percent_done', value);
    }

    /**
    * * Field Name: status
    * * Display Name: status
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Status (activities).
    */
    get status(): string | null {
        return this.Get('status');
    }
    set status(value: string | null) {
        this.Set('status', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: activity_id
    * * Display Name: Activity Id
    * * SQL Data Type: nvarchar(450)
    * * Description: Unique ID for the activity.
    */
    get activity_id(): string | null {
        return this.Get('activity_id');
    }
    set activity_id(value: string | null) {
        this.Set('activity_id', value);
    }

    /**
    * * Field Name: completed_at
    * * Display Name: Completed At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we completed processing the activity, in ISO-8601 format.
    */
    get completed_at(): string | null {
        return this.Get('completed_at');
    }
    set completed_at(value: string | null) {
        this.Set('completed_at', value);
    }

    /**
    * * Field Name: updated_at
    * * Display Name: Updated At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we last updated the activity, in ISO-8601 format.
    */
    get updated_at(): string | null {
        return this.Get('updated_at');
    }
    set updated_at(value: string | null) {
        this.Set('updated_at', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Activities Contacts Deletes - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: activities_contacts_delete
 * * Base View: vwActivities_contacts_deletes
 * * @description Delete Contacts in Bulk
 * * Primary Key: activity_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities Contacts Deletes')
export class constantcontactactivities_contacts_deleteEntity extends BaseEntity<constantcontactactivities_contacts_deleteEntityType> {
    /**
    * Loads the Activities Contacts Deletes record from the database
    * @param activity_id: string - primary key value to load the Activities Contacts Deletes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactactivities_contacts_deleteEntity
    * @method
    * @override
    */
    public async Load(activity_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'activity_id', Value: activity_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: state
    * * Display Name: state
    * * SQL Data Type: nvarchar(812)
    * * Description: The state of the request:  initialized - request has been received processing - request is being processed completed - job completed cancelled - request was cancelled failed - job failed to complete timed_out - the request timed out before completing"
    */
    get state(): string | null {
        return this.Get('state');
    }
    set state(value: string | null) {
        this.Set('state', value);
    }

    /**
    * * Field Name: updated_at
    * * Display Name: Updated At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we last updated the activity, in ISO-8601 format.
    */
    get updated_at(): string | null {
        return this.Get('updated_at');
    }
    set updated_at(value: string | null) {
        this.Set('updated_at', value);
    }

    /**
    * * Field Name: activity_errors
    * * Display Name: Activity Errors
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Array of messages describing the errors that occurred.
    */
    get activity_errors(): string | null {
        return this.Get('activity_errors');
    }
    set activity_errors(value: string | null) {
        this.Set('activity_errors', value);
    }

    /**
    * * Field Name: percent_done
    * * Display Name: Percent Done
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Shows the percent done for an activity that we are still processing.
    */
    get percent_done(): string | null {
        return this.Get('percent_done');
    }
    set percent_done(value: string | null) {
        this.Set('percent_done', value);
    }

    /**
    * * Field Name: _links
    * * Display Name: Links
    * * SQL Data Type: nvarchar(MAX)
    * * Description:  Links (activities_contacts_delete).
    */
    get _links(): string | null {
        return this.Get('_links');
    }
    set _links(value: string | null) {
        this.Set('_links', value);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we created the activity, in ISO-8601 format.
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: completed_at
    * * Display Name: Completed At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we completed processing the activity, in ISO-8601 format.
    */
    get completed_at(): string | null {
        return this.Get('completed_at');
    }
    set completed_at(value: string | null) {
        this.Set('completed_at', value);
    }

    /**
    * * Field Name: activity_id
    * * Display Name: Activity Id
    * * SQL Data Type: nvarchar(450)
    * * Description: Unique ID for the activity.
    */
    get activity_id(): string | null {
        return this.Get('activity_id');
    }
    set activity_id(value: string | null) {
        this.Set('activity_id', value);
    }

    /**
    * * Field Name: started_at
    * * Display Name: Started At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we began processing the activity request, in ISO-8601 format.
    */
    get started_at(): string | null {
        return this.Get('started_at');
    }
    set started_at(value: string | null) {
        this.Set('started_at', value);
    }

    /**
    * * Field Name: status
    * * Display Name: status
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Status (activities_contacts_delete).
    */
    get status(): string | null {
        return this.Get('status');
    }
    set status(value: string | null) {
        this.Set('status', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Activities Contacts File Imports - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: activities_contacts_file_import
 * * Base View: vwActivities_contacts_file_imports
 * * @description Import Contacts using a CSV File
 * * Primary Key: activity_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities Contacts File Imports')
export class constantcontactactivities_contacts_file_importEntity extends BaseEntity<constantcontactactivities_contacts_file_importEntityType> {
    /**
    * Loads the Activities Contacts File Imports record from the database
    * @param activity_id: string - primary key value to load the Activities Contacts File Imports record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactactivities_contacts_file_importEntity
    * @method
    * @override
    */
    public async Load(activity_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'activity_id', Value: activity_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: percent_done
    * * Display Name: Percent Done
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Shows the percent done for an activity that we are still processing.
    */
    get percent_done(): string | null {
        return this.Get('percent_done');
    }
    set percent_done(value: string | null) {
        this.Set('percent_done', value);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we created the activity, in ISO-8601 format.
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: activity_errors
    * * Display Name: Activity Errors
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Array of messages describing the errors that occurred.
    */
    get activity_errors(): string | null {
        return this.Get('activity_errors');
    }
    set activity_errors(value: string | null) {
        this.Set('activity_errors', value);
    }

    /**
    * * Field Name: updated_at
    * * Display Name: Updated At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we last updated the activity, in ISO-8601 format.
    */
    get updated_at(): string | null {
        return this.Get('updated_at');
    }
    set updated_at(value: string | null) {
        this.Set('updated_at', value);
    }

    /**
    * * Field Name: state
    * * Display Name: state
    * * SQL Data Type: nvarchar(812)
    * * Description: The state of the request:
 
   initialized - request has been received
  processing - request is being processed
  completed - job completed
  cancelled - request was cancelled
  failed - job failed to complete
  timed_out - the request timed out before completing"
    */
    get state(): string | null {
        return this.Get('state');
    }
    set state(value: string | null) {
        this.Set('state', value);
    }

    /**
    * * Field Name: started_at
    * * Display Name: Started At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we began processing the activity request, in ISO-8601 format.
    */
    get started_at(): string | null {
        return this.Get('started_at');
    }
    set started_at(value: string | null) {
        this.Set('started_at', value);
    }

    /**
    * * Field Name: source_file_name
    * * Display Name: Source File Name
    * * SQL Data Type: nvarchar(812)
    * * Description: Name of the file used for an file_import activity.
    */
    get source_file_name(): string | null {
        return this.Get('source_file_name');
    }
    set source_file_name(value: string | null) {
        this.Set('source_file_name', value);
    }

    /**
    * * Field Name: _links
    * * Display Name: Links
    * * SQL Data Type: nvarchar(MAX)
    * * Description:  Links (activities_contacts_file_import).
    */
    get _links(): string | null {
        return this.Get('_links');
    }
    set _links(value: string | null) {
        this.Set('_links', value);
    }

    /**
    * * Field Name: completed_at
    * * Display Name: Completed At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we completed processing the activity, in ISO-8601 format.
    */
    get completed_at(): string | null {
        return this.Get('completed_at');
    }
    set completed_at(value: string | null) {
        this.Set('completed_at', value);
    }

    /**
    * * Field Name: status
    * * Display Name: status
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Status (activities_contacts_file_import).
    */
    get status(): string | null {
        return this.Get('status');
    }
    set status(value: string | null) {
        this.Set('status', value);
    }

    /**
    * * Field Name: activity_id
    * * Display Name: Activity Id
    * * SQL Data Type: nvarchar(450)
    * * Description: Unique ID for the activity.
    */
    get activity_id(): string | null {
        return this.Get('activity_id');
    }
    set activity_id(value: string | null) {
        this.Set('activity_id', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Activities Contacts Json Imports - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: activities_contacts_json_import
 * * Base View: vwActivities_contacts_json_imports
 * * @description Import Contacts using a JSON Payload
 * * Primary Key: activity_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities Contacts Json Imports')
export class constantcontactactivities_contacts_json_importEntity extends BaseEntity<constantcontactactivities_contacts_json_importEntityType> {
    /**
    * Loads the Activities Contacts Json Imports record from the database
    * @param activity_id: string - primary key value to load the Activities Contacts Json Imports record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactactivities_contacts_json_importEntity
    * @method
    * @override
    */
    public async Load(activity_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'activity_id', Value: activity_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: activity_errors
    * * Display Name: Activity Errors
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Array of messages describing the errors that occurred.
    */
    get activity_errors(): string | null {
        return this.Get('activity_errors');
    }
    set activity_errors(value: string | null) {
        this.Set('activity_errors', value);
    }

    /**
    * * Field Name: started_at
    * * Display Name: Started At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we began processing the activity request, in ISO-8601 format.
    */
    get started_at(): string | null {
        return this.Get('started_at');
    }
    set started_at(value: string | null) {
        this.Set('started_at', value);
    }

    /**
    * * Field Name: _links
    * * Display Name: Links
    * * SQL Data Type: nvarchar(MAX)
    * * Description:  Links (activities_contacts_json_import).
    */
    get _links(): string | null {
        return this.Get('_links');
    }
    set _links(value: string | null) {
        this.Set('_links', value);
    }

    /**
    * * Field Name: completed_at
    * * Display Name: Completed At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we completed processing the activity, in ISO-8601 format.
    */
    get completed_at(): string | null {
        return this.Get('completed_at');
    }
    set completed_at(value: string | null) {
        this.Set('completed_at', value);
    }

    /**
    * * Field Name: percent_done
    * * Display Name: Percent Done
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Shows the percent done for an activity that we are still processing.
    */
    get percent_done(): string | null {
        return this.Get('percent_done');
    }
    set percent_done(value: string | null) {
        this.Set('percent_done', value);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we created the activity, in ISO-8601 format.
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: activity_id
    * * Display Name: Activity Id
    * * SQL Data Type: nvarchar(450)
    * * Description: Unique ID for the activity.
    */
    get activity_id(): string | null {
        return this.Get('activity_id');
    }
    set activity_id(value: string | null) {
        this.Set('activity_id', value);
    }

    /**
    * * Field Name: status
    * * Display Name: status
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Status (activities_contacts_json_import).
    */
    get status(): string | null {
        return this.Get('status');
    }
    set status(value: string | null) {
        this.Set('status', value);
    }

    /**
    * * Field Name: updated_at
    * * Display Name: Updated At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we last updated the activity, in ISO-8601 format.
    */
    get updated_at(): string | null {
        return this.Get('updated_at');
    }
    set updated_at(value: string | null) {
        this.Set('updated_at', value);
    }

    /**
    * * Field Name: state
    * * Display Name: state
    * * SQL Data Type: nvarchar(812)
    * * Description: The state of the request:
 
   initialized - request has been received
  processing - request is being processed
  completed - job completed
  cancelled - request was cancelled
  failed - job failed to complete
  timed_out - the request timed out before completing"
    */
    get state(): string | null {
        return this.Get('state');
    }
    set state(value: string | null) {
        this.Set('state', value);
    }

    /**
    * * Field Name: source_file_name
    * * Display Name: Source File Name
    * * SQL Data Type: nvarchar(812)
    * * Description: Name of the file used for an file_import activity.
    */
    get source_file_name(): string | null {
        return this.Get('source_file_name');
    }
    set source_file_name(value: string | null) {
        this.Set('source_file_name', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Activities Contacts Taggings Adds - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: activities_contacts_taggings_add
 * * Base View: vwActivities_contacts_taggings_adds
 * * @description Add Tags to Contacts
 * * Primary Key: activity_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities Contacts Taggings Adds')
export class constantcontactactivities_contacts_taggings_addEntity extends BaseEntity<constantcontactactivities_contacts_taggings_addEntityType> {
    /**
    * Loads the Activities Contacts Taggings Adds record from the database
    * @param activity_id: string - primary key value to load the Activities Contacts Taggings Adds record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactactivities_contacts_taggings_addEntity
    * @method
    * @override
    */
    public async Load(activity_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'activity_id', Value: activity_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: activity_errors
    * * Display Name: Activity Errors
    * * SQL Data Type: nvarchar(MAX)
    * * Description: An array of error message strings describing the errors that occurred.
    */
    get activity_errors(): string | null {
        return this.Get('activity_errors');
    }
    set activity_errors(value: string | null) {
        this.Set('activity_errors', value);
    }

    /**
    * * Field Name: activity_id
    * * Display Name: Activity Id
    * * SQL Data Type: nvarchar(450)
    * * Description: The system assigned UUID that uniquely identifies an activity.
    */
    get activity_id(): string | null {
        return this.Get('activity_id');
    }
    set activity_id(value: string | null) {
        this.Set('activity_id', value);
    }

    /**
    * * Field Name: percent_done
    * * Display Name: Percent Done
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The processing percent complete for the activity.
    */
    get percent_done(): string | null {
        return this.Get('percent_done');
    }
    set percent_done(value: string | null) {
        this.Set('percent_done', value);
    }

    /**
    * * Field Name: started_at
    * * Display Name: Started At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when processing started for the activity, in ISO-8601 format.
    */
    get started_at(): string | null {
        return this.Get('started_at');
    }
    set started_at(value: string | null) {
        this.Set('started_at', value);
    }

    /**
    * * Field Name: status
    * * Display Name: status
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Status (activities_contacts_taggings_add).
    */
    get status(): string | null {
        return this.Get('status');
    }
    set status(value: string | null) {
        this.Set('status', value);
    }

    /**
    * * Field Name: completed_at
    * * Display Name: Completed At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when processing completed for the activity, in ISO-8601 format.
    */
    get completed_at(): string | null {
        return this.Get('completed_at');
    }
    set completed_at(value: string | null) {
        this.Set('completed_at', value);
    }

    /**
    * * Field Name: updated_at
    * * Display Name: Updated At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when the activity was last updated, in ISO-8601 format.
    */
    get updated_at(): string | null {
        return this.Get('updated_at');
    }
    set updated_at(value: string | null) {
        this.Set('updated_at', value);
    }

    /**
    * * Field Name: state
    * * Display Name: state
    * * SQL Data Type: nvarchar(812)
    * * Description: The activity processing state.
    */
    get state(): string | null {
        return this.Get('state');
    }
    set state(value: string | null) {
        this.Set('state', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when the activity was first requested, in ISO-8601 format.
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: _links
    * * Display Name: Links
    * * SQL Data Type: nvarchar(MAX)
    * * Description:  Links (activities_contacts_taggings_add).
    */
    get _links(): string | null {
        return this.Get('_links');
    }
    set _links(value: string | null) {
        this.Set('_links', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Activities Contacts Taggings Removes - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: activities_contacts_taggings_remove
 * * Base View: vwActivities_contacts_taggings_removes
 * * @description Remove Tags from Contacts
 * * Primary Key: activity_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities Contacts Taggings Removes')
export class constantcontactactivities_contacts_taggings_removeEntity extends BaseEntity<constantcontactactivities_contacts_taggings_removeEntityType> {
    /**
    * Loads the Activities Contacts Taggings Removes record from the database
    * @param activity_id: string - primary key value to load the Activities Contacts Taggings Removes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactactivities_contacts_taggings_removeEntity
    * @method
    * @override
    */
    public async Load(activity_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'activity_id', Value: activity_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: state
    * * Display Name: state
    * * SQL Data Type: nvarchar(812)
    * * Description: The activity processing state.
    */
    get state(): string | null {
        return this.Get('state');
    }
    set state(value: string | null) {
        this.Set('state', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: updated_at
    * * Display Name: Updated At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when the activity was last updated, in ISO-8601 format.
    */
    get updated_at(): string | null {
        return this.Get('updated_at');
    }
    set updated_at(value: string | null) {
        this.Set('updated_at', value);
    }

    /**
    * * Field Name: activity_errors
    * * Display Name: Activity Errors
    * * SQL Data Type: nvarchar(MAX)
    * * Description: An array of error message strings describing the errors that occurred.
    */
    get activity_errors(): string | null {
        return this.Get('activity_errors');
    }
    set activity_errors(value: string | null) {
        this.Set('activity_errors', value);
    }

    /**
    * * Field Name: _links
    * * Display Name: Links
    * * SQL Data Type: nvarchar(MAX)
    * * Description:  Links (activities_contacts_taggings_remove).
    */
    get _links(): string | null {
        return this.Get('_links');
    }
    set _links(value: string | null) {
        this.Set('_links', value);
    }

    /**
    * * Field Name: percent_done
    * * Display Name: Percent Done
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The processing percent complete for the activity.
    */
    get percent_done(): string | null {
        return this.Get('percent_done');
    }
    set percent_done(value: string | null) {
        this.Set('percent_done', value);
    }

    /**
    * * Field Name: started_at
    * * Display Name: Started At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when processing started for the activity, in ISO-8601 format.
    */
    get started_at(): string | null {
        return this.Get('started_at');
    }
    set started_at(value: string | null) {
        this.Set('started_at', value);
    }

    /**
    * * Field Name: status
    * * Display Name: status
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Status (activities_contacts_taggings_remove).
    */
    get status(): string | null {
        return this.Get('status');
    }
    set status(value: string | null) {
        this.Set('status', value);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when the activity was first requested, in ISO-8601 format.
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: completed_at
    * * Display Name: Completed At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when processing completed for the activity, in ISO-8601 format.
    */
    get completed_at(): string | null {
        return this.Get('completed_at');
    }
    set completed_at(value: string | null) {
        this.Set('completed_at', value);
    }

    /**
    * * Field Name: activity_id
    * * Display Name: Activity Id
    * * SQL Data Type: nvarchar(450)
    * * Description: The system assigned UUID that uniquely identifies an activity.
    */
    get activity_id(): string | null {
        return this.Get('activity_id');
    }
    set activity_id(value: string | null) {
        this.Set('activity_id', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Activities Contacts Tags Deletes - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: activities_contacts_tags_delete
 * * Base View: vwActivities_contacts_tags_deletes
 * * @description Delete Tags
 * * Primary Key: activity_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities Contacts Tags Deletes')
export class constantcontactactivities_contacts_tags_deleteEntity extends BaseEntity<constantcontactactivities_contacts_tags_deleteEntityType> {
    /**
    * Loads the Activities Contacts Tags Deletes record from the database
    * @param activity_id: string - primary key value to load the Activities Contacts Tags Deletes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactactivities_contacts_tags_deleteEntity
    * @method
    * @override
    */
    public async Load(activity_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'activity_id', Value: activity_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: updated_at
    * * Display Name: Updated At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when the activity was last updated, in ISO-8601 format.
    */
    get updated_at(): string | null {
        return this.Get('updated_at');
    }
    set updated_at(value: string | null) {
        this.Set('updated_at', value);
    }

    /**
    * * Field Name: state
    * * Display Name: state
    * * SQL Data Type: nvarchar(812)
    * * Description: The activity processing state.
    */
    get state(): string | null {
        return this.Get('state');
    }
    set state(value: string | null) {
        this.Set('state', value);
    }

    /**
    * * Field Name: completed_at
    * * Display Name: Completed At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when processing completed for the activity, in ISO-8601 format.
    */
    get completed_at(): string | null {
        return this.Get('completed_at');
    }
    set completed_at(value: string | null) {
        this.Set('completed_at', value);
    }

    /**
    * * Field Name: status
    * * Display Name: status
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Status (activities_contacts_tags_delete).
    */
    get status(): string | null {
        return this.Get('status');
    }
    set status(value: string | null) {
        this.Set('status', value);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when the activity was first requested, in ISO-8601 format.
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: started_at
    * * Display Name: Started At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when processing started for the activity, in ISO-8601 format.
    */
    get started_at(): string | null {
        return this.Get('started_at');
    }
    set started_at(value: string | null) {
        this.Set('started_at', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: percent_done
    * * Display Name: Percent Done
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The processing percent complete for the activity.
    */
    get percent_done(): string | null {
        return this.Get('percent_done');
    }
    set percent_done(value: string | null) {
        this.Set('percent_done', value);
    }

    /**
    * * Field Name: _links
    * * Display Name: Links
    * * SQL Data Type: nvarchar(MAX)
    * * Description:  Links (activities_contacts_tags_delete).
    */
    get _links(): string | null {
        return this.Get('_links');
    }
    set _links(value: string | null) {
        this.Set('_links', value);
    }

    /**
    * * Field Name: activity_errors
    * * Display Name: Activity Errors
    * * SQL Data Type: nvarchar(MAX)
    * * Description: An array of error message strings describing the errors that occurred.
    */
    get activity_errors(): string | null {
        return this.Get('activity_errors');
    }
    set activity_errors(value: string | null) {
        this.Set('activity_errors', value);
    }

    /**
    * * Field Name: activity_id
    * * Display Name: Activity Id
    * * SQL Data Type: nvarchar(450)
    * * Description: The system assigned UUID that uniquely identifies an activity.
    */
    get activity_id(): string | null {
        return this.Get('activity_id');
    }
    set activity_id(value: string | null) {
        this.Set('activity_id', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Activities Custom Fields Deletes - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: activities_custom_fields_delete
 * * Base View: vwActivities_custom_fields_deletes
 * * @description Delete Custom Fields
 * * Primary Key: activity_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities Custom Fields Deletes')
export class constantcontactactivities_custom_fields_deleteEntity extends BaseEntity<constantcontactactivities_custom_fields_deleteEntityType> {
    /**
    * Loads the Activities Custom Fields Deletes record from the database
    * @param activity_id: string - primary key value to load the Activities Custom Fields Deletes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactactivities_custom_fields_deleteEntity
    * @method
    * @override
    */
    public async Load(activity_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'activity_id', Value: activity_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: started_at
    * * Display Name: Started At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we began processing the activity request, in ISO-8601 format.
    */
    get started_at(): string | null {
        return this.Get('started_at');
    }
    set started_at(value: string | null) {
        this.Set('started_at', value);
    }

    /**
    * * Field Name: activity_id
    * * Display Name: Activity Id
    * * SQL Data Type: nvarchar(450)
    * * Description: Unique ID for the activity.
    */
    get activity_id(): string | null {
        return this.Get('activity_id');
    }
    set activity_id(value: string | null) {
        this.Set('activity_id', value);
    }

    /**
    * * Field Name: updated_at
    * * Display Name: Updated At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we last updated the activity, in ISO-8601 format.
    */
    get updated_at(): string | null {
        return this.Get('updated_at');
    }
    set updated_at(value: string | null) {
        this.Set('updated_at', value);
    }

    /**
    * * Field Name: state
    * * Display Name: state
    * * SQL Data Type: nvarchar(812)
    * * Description: The state of the request:  initialized - request has been received processing - request is being processed completed - job completed cancelled - request was cancelled failed - job failed to complete timed_out - the request timed out before completing"
    */
    get state(): string | null {
        return this.Get('state');
    }
    set state(value: string | null) {
        this.Set('state', value);
    }

    /**
    * * Field Name: completed_at
    * * Display Name: Completed At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we completed processing the activity, in ISO-8601 format.
    */
    get completed_at(): string | null {
        return this.Get('completed_at');
    }
    set completed_at(value: string | null) {
        this.Set('completed_at', value);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we created the activity, in ISO-8601 format.
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: percent_done
    * * Display Name: Percent Done
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Shows the percent done for an activity that we are still processing.
    */
    get percent_done(): string | null {
        return this.Get('percent_done');
    }
    set percent_done(value: string | null) {
        this.Set('percent_done', value);
    }

    /**
    * * Field Name: activity_errors
    * * Display Name: Activity Errors
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Array of messages describing the errors that occurred.
    */
    get activity_errors(): string | null {
        return this.Get('activity_errors');
    }
    set activity_errors(value: string | null) {
        this.Set('activity_errors', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: _links
    * * Display Name: Links
    * * SQL Data Type: nvarchar(MAX)
    * * Description:  Links (activities_custom_fields_delete).
    */
    get _links(): string | null {
        return this.Get('_links');
    }
    set _links(value: string | null) {
        this.Set('_links', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Activities List Deletes - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: activities_list_delete
 * * Base View: vwActivities_list_deletes
 * * @description Delete Contact Lists
 * * Primary Key: activity_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities List Deletes')
export class constantcontactactivities_list_deleteEntity extends BaseEntity<constantcontactactivities_list_deleteEntityType> {
    /**
    * Loads the Activities List Deletes record from the database
    * @param activity_id: string - primary key value to load the Activities List Deletes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactactivities_list_deleteEntity
    * @method
    * @override
    */
    public async Load(activity_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'activity_id', Value: activity_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: _links
    * * Display Name: Links
    * * SQL Data Type: nvarchar(MAX)
    * * Description:  Links (activities_list_delete).
    */
    get _links(): string | null {
        return this.Get('_links');
    }
    set _links(value: string | null) {
        this.Set('_links', value);
    }

    /**
    * * Field Name: status
    * * Display Name: status
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Status (activities_list_delete).
    */
    get status(): string | null {
        return this.Get('status');
    }
    set status(value: string | null) {
        this.Set('status', value);
    }

    /**
    * * Field Name: state
    * * Display Name: state
    * * SQL Data Type: nvarchar(812)
    * * Description: The activity processing state.
    */
    get state(): string | null {
        return this.Get('state');
    }
    set state(value: string | null) {
        this.Set('state', value);
    }

    /**
    * * Field Name: completed_at
    * * Display Name: Completed At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when processing completed for the activity, in ISO-8601 format.
    */
    get completed_at(): string | null {
        return this.Get('completed_at');
    }
    set completed_at(value: string | null) {
        this.Set('completed_at', value);
    }

    /**
    * * Field Name: activity_id
    * * Display Name: Activity Id
    * * SQL Data Type: nvarchar(450)
    * * Description: The system assigned UUID that uniquely identifies an activity.
    */
    get activity_id(): string | null {
        return this.Get('activity_id');
    }
    set activity_id(value: string | null) {
        this.Set('activity_id', value);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when the activity was first requested, in ISO-8601 format.
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: percent_done
    * * Display Name: Percent Done
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The processing percent complete for the activity.
    */
    get percent_done(): string | null {
        return this.Get('percent_done');
    }
    set percent_done(value: string | null) {
        this.Set('percent_done', value);
    }

    /**
    * * Field Name: updated_at
    * * Display Name: Updated At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when the activity was last updated, in ISO-8601 format.
    */
    get updated_at(): string | null {
        return this.Get('updated_at');
    }
    set updated_at(value: string | null) {
        this.Set('updated_at', value);
    }

    /**
    * * Field Name: activity_errors
    * * Display Name: Activity Errors
    * * SQL Data Type: nvarchar(MAX)
    * * Description: An array of error message strings describing the errors that occurred.
    */
    get activity_errors(): string | null {
        return this.Get('activity_errors');
    }
    set activity_errors(value: string | null) {
        this.Set('activity_errors', value);
    }

    /**
    * * Field Name: started_at
    * * Display Name: Started At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when processing started for the activity, in ISO-8601 format.
    */
    get started_at(): string | null {
        return this.Get('started_at');
    }
    set started_at(value: string | null) {
        this.Set('started_at', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Activities List Memberships Adds - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: activities_list_memberships_add
 * * Base View: vwActivities_list_memberships_adds
 * * @description Add Contacts to Lists
 * * Primary Key: activity_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities List Memberships Adds')
export class constantcontactactivities_list_memberships_addEntity extends BaseEntity<constantcontactactivities_list_memberships_addEntityType> {
    /**
    * Loads the Activities List Memberships Adds record from the database
    * @param activity_id: string - primary key value to load the Activities List Memberships Adds record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactactivities_list_memberships_addEntity
    * @method
    * @override
    */
    public async Load(activity_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'activity_id', Value: activity_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: state
    * * Display Name: state
    * * SQL Data Type: nvarchar(812)
    * * Description: The state of the request:  initialized - request has been received processing - request is being processed completed - job completed cancelled - request was cancelled failed - job failed to complete timed_out - the request timed out before completing"
    */
    get state(): string | null {
        return this.Get('state');
    }
    set state(value: string | null) {
        this.Set('state', value);
    }

    /**
    * * Field Name: _links
    * * Display Name: Links
    * * SQL Data Type: nvarchar(MAX)
    * * Description:  Links (activities_list_memberships_add).
    */
    get _links(): string | null {
        return this.Get('_links');
    }
    set _links(value: string | null) {
        this.Set('_links', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: activity_errors
    * * Display Name: Activity Errors
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Array of messages describing the errors that occurred.
    */
    get activity_errors(): string | null {
        return this.Get('activity_errors');
    }
    set activity_errors(value: string | null) {
        this.Set('activity_errors', value);
    }

    /**
    * * Field Name: completed_at
    * * Display Name: Completed At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we completed processing the activity, in ISO-8601 format.
    */
    get completed_at(): string | null {
        return this.Get('completed_at');
    }
    set completed_at(value: string | null) {
        this.Set('completed_at', value);
    }

    /**
    * * Field Name: activity_id
    * * Display Name: Activity Id
    * * SQL Data Type: nvarchar(450)
    * * Description: Unique ID for the activity.
    */
    get activity_id(): string | null {
        return this.Get('activity_id');
    }
    set activity_id(value: string | null) {
        this.Set('activity_id', value);
    }

    /**
    * * Field Name: updated_at
    * * Display Name: Updated At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we last updated the activity, in ISO-8601 format.
    */
    get updated_at(): string | null {
        return this.Get('updated_at');
    }
    set updated_at(value: string | null) {
        this.Set('updated_at', value);
    }

    /**
    * * Field Name: status
    * * Display Name: status
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Status (activities_list_memberships_add).
    */
    get status(): string | null {
        return this.Get('status');
    }
    set status(value: string | null) {
        this.Set('status', value);
    }

    /**
    * * Field Name: started_at
    * * Display Name: Started At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we began processing the activity request, in ISO-8601 format.
    */
    get started_at(): string | null {
        return this.Get('started_at');
    }
    set started_at(value: string | null) {
        this.Set('started_at', value);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we created the activity, in ISO-8601 format.
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: percent_done
    * * Display Name: Percent Done
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Shows the percent done for an activity that we are still processing.
    */
    get percent_done(): string | null {
        return this.Get('percent_done');
    }
    set percent_done(value: string | null) {
        this.Set('percent_done', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Activities List Memberships Removes - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: activities_list_memberships_remove
 * * Base View: vwActivities_list_memberships_removes
 * * @description Remove Contacts from Lists
 * * Primary Key: activity_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities List Memberships Removes')
export class constantcontactactivities_list_memberships_removeEntity extends BaseEntity<constantcontactactivities_list_memberships_removeEntityType> {
    /**
    * Loads the Activities List Memberships Removes record from the database
    * @param activity_id: string - primary key value to load the Activities List Memberships Removes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactactivities_list_memberships_removeEntity
    * @method
    * @override
    */
    public async Load(activity_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'activity_id', Value: activity_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we created the activity, in ISO-8601 format.
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: _links
    * * Display Name: Links
    * * SQL Data Type: nvarchar(MAX)
    * * Description:  Links (activities_list_memberships_remove).
    */
    get _links(): string | null {
        return this.Get('_links');
    }
    set _links(value: string | null) {
        this.Set('_links', value);
    }

    /**
    * * Field Name: state
    * * Display Name: state
    * * SQL Data Type: nvarchar(812)
    * * Description: The state of the request:  initialized - request has been received processing - request is being processed completed - job completed cancelled - request was cancelled failed - job failed to complete timed_out - the request timed out before completing"
    */
    get state(): string | null {
        return this.Get('state');
    }
    set state(value: string | null) {
        this.Set('state', value);
    }

    /**
    * * Field Name: activity_errors
    * * Display Name: Activity Errors
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Array of messages describing the errors that occurred.
    */
    get activity_errors(): string | null {
        return this.Get('activity_errors');
    }
    set activity_errors(value: string | null) {
        this.Set('activity_errors', value);
    }

    /**
    * * Field Name: updated_at
    * * Display Name: Updated At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we last updated the activity, in ISO-8601 format.
    */
    get updated_at(): string | null {
        return this.Get('updated_at');
    }
    set updated_at(value: string | null) {
        this.Set('updated_at', value);
    }

    /**
    * * Field Name: started_at
    * * Display Name: Started At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we began processing the activity request, in ISO-8601 format.
    */
    get started_at(): string | null {
        return this.Get('started_at');
    }
    set started_at(value: string | null) {
        this.Set('started_at', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: percent_done
    * * Display Name: Percent Done
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Shows the percent done for an activity that we are still processing.
    */
    get percent_done(): string | null {
        return this.Get('percent_done');
    }
    set percent_done(value: string | null) {
        this.Set('percent_done', value);
    }

    /**
    * * Field Name: activity_id
    * * Display Name: Activity Id
    * * SQL Data Type: nvarchar(450)
    * * Description: Unique ID for the activity.
    */
    get activity_id(): string | null {
        return this.Get('activity_id');
    }
    set activity_id(value: string | null) {
        this.Set('activity_id', value);
    }

    /**
    * * Field Name: completed_at
    * * Display Name: Completed At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Timestamp showing when we completed processing the activity, in ISO-8601 format.
    */
    get completed_at(): string | null {
        return this.Get('completed_at');
    }
    set completed_at(value: string | null) {
        this.Set('completed_at', value);
    }

    /**
    * * Field Name: status
    * * Display Name: status
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Status (activities_list_memberships_remove).
    */
    get status(): string | null {
        return this.Get('status');
    }
    set status(value: string | null) {
        this.Set('status', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Contact Custom Fields - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: contact_custom_fields
 * * Base View: vwContact_custom_fields
 * * @description GET custom_fields Collection
 * * Primary Key: custom_field_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Custom Fields')
export class constantcontactcontact_custom_fieldsEntity extends BaseEntity<constantcontactcontact_custom_fieldsEntityType> {
    /**
    * Loads the Contact Custom Fields record from the database
    * @param custom_field_id: string - primary key value to load the Contact Custom Fields record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactcontact_custom_fieldsEntity
    * @method
    * @override
    */
    public async Load(custom_field_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'custom_field_id', Value: custom_field_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: updated_at
    * * Display Name: Updated At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: System generated date and time that the resource was updated, in ISO-8601 format.
    */
    get updated_at(): string | null {
        return this.Get('updated_at');
    }
    set updated_at(value: string | null) {
        this.Set('updated_at', value);
    }

    /**
    * * Field Name: label
    * * Display Name: label
    * * SQL Data Type: nvarchar(812)
    * * Description: The custom field name to display in the UI (free-form text).
    */
    get label(): string | null {
        return this.Get('label');
    }
    set label(value: string | null) {
        this.Set('label', value);
    }

    /**
    * * Field Name: custom_field_id
    * * Display Name: Custom Field Id
    * * SQL Data Type: nvarchar(450)
    * * Description: The system generated ID that uniquely identifies a custom_field.
    */
    get custom_field_id(): string | null {
        return this.Get('custom_field_id');
    }
    set custom_field_id(value: string | null) {
        this.Set('custom_field_id', value);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Date and time that the resource was created, in ISO-8601 format. System generated.
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: version
    * * Display Name: version
    * * SQL Data Type: nvarchar(MAX)
    * * Description: For datetime data types, this is the version number associated with the custom field.
    */
    get version(): string | null {
        return this.Get('version');
    }
    set version(value: string | null) {
        this.Set('version', value);
    }

    /**
    * * Field Name: type
    * * Display Name: type
    * * SQL Data Type: nvarchar(812)
    * * Description: The data value type the custom field accepts.
    */
    get type(): string | null {
        return this.Get('type');
    }
    set type(value: string | null) {
        this.Set('type', value);
    }

    /**
    * * Field Name: name
    * * Display Name: name
    * * SQL Data Type: nvarchar(812)
    * * Description: The unique custom field name constructed from the label by replacing blanks with underscores.
    */
    get name(): string | null {
        return this.Get('name');
    }
    set name(value: string | null) {
        this.Set('name', value);
    }

    /**
    * * Field Name: choices
    * * Display Name: choices
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Choices available for single_select and multi_select type custom fields. The maximum number of elements for radio or checkbox display types is 20. Maximum number of elements for a dropdown is 100.
    */
    get choices(): string | null {
        return this.Get('choices');
    }
    set choices(value: string | null) {
        this.Set('choices', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: metadata
    * * Display Name: metadata
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Metadata (contact_custom_fields).
    */
    get metadata(): string | null {
        return this.Get('metadata');
    }
    set metadata(value: string | null) {
        this.Set('metadata', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Contact Lists - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: contact_lists
 * * Base View: vwContact_lists
 * * @description GET Lists Collection
 * * Primary Key: list_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Lists')
export class constantcontactcontact_listsEntity extends BaseEntity<constantcontactcontact_listsEntityType> {
    /**
    * Loads the Contact Lists record from the database
    * @param list_id: string - primary key value to load the Contact Lists record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactcontact_listsEntity
    * @method
    * @override
    */
    public async Load(list_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'list_id', Value: list_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: list_id
    * * Display Name: List Id
    * * SQL Data Type: nvarchar(450)
    * * Description: Unique ID for the contact list
    */
    get list_id(): string | null {
        return this.Get('list_id');
    }
    set list_id(value: string | null) {
        this.Set('list_id', value);
    }

    /**
    * * Field Name: description
    * * Display Name: description
    * * SQL Data Type: nvarchar(812)
    * * Description: Text describing the list.
    */
    get description(): string | null {
        return this.Get('description');
    }
    set description(value: string | null) {
        this.Set('description', value);
    }

    /**
    * * Field Name: name
    * * Display Name: name
    * * SQL Data Type: nvarchar(812)
    * * Description: The name given to the contact list
    */
    get name(): string | null {
        return this.Get('name');
    }
    set name(value: string | null) {
        this.Set('name', value);
    }

    /**
    * * Field Name: membership_count
    * * Display Name: Membership Count
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The total number of contacts that are members in a list. Does not apply to segment type lists.
    */
    get membership_count(): string | null {
        return this.Get('membership_count');
    }
    set membership_count(value: string | null) {
        this.Set('membership_count', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: System generated date and time that the resource was created, in ISO-8601 format.
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: favorite
    * * Display Name: favorite
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Identifies whether or not the account has favorited the contact list.
    */
    get favorite(): string | null {
        return this.Get('favorite');
    }
    set favorite(value: string | null) {
        this.Set('favorite', value);
    }

    /**
    * * Field Name: deleted_at
    * * Display Name: Deleted At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: If the list was deleted, this property shows the date and time it was deleted, in ISO-8601 format. System generated.
    */
    get deleted_at(): string | null {
        return this.Get('deleted_at');
    }
    set deleted_at(value: string | null) {
        this.Set('deleted_at', value);
    }

    /**
    * * Field Name: updated_at
    * * Display Name: Updated At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Date and time that the list was last updated, in ISO-8601 format. System generated.
    */
    get updated_at(): string | null {
        return this.Get('updated_at');
    }
    set updated_at(value: string | null) {
        this.Set('updated_at', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Contact Lists Xrefs - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: contact_lists_xrefs
 * * Base View: vwContact_lists_xrefs
 * * @description GET a collection of V2 and V3 API List IDs
 * * Primary Key: list_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Lists Xrefs')
export class constantcontactcontact_lists_xrefsEntity extends BaseEntity<constantcontactcontact_lists_xrefsEntityType> {
    /**
    * Loads the Contact Lists Xrefs record from the database
    * @param list_id: string - primary key value to load the Contact Lists Xrefs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactcontact_lists_xrefsEntity
    * @method
    * @override
    */
    public async Load(list_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'list_id', Value: list_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: list_id
    * * Display Name: List Id
    * * SQL Data Type: nvarchar(450)
    * * Related Entity/Foreign Key: Contact Lists (vwContact_lists.list_id)
    * * Description: The V3 API list unique identifier
    */
    get list_id(): string | null {
        return this.Get('list_id');
    }
    set list_id(value: string | null) {
        this.Set('list_id', value);
    }

    /**
    * * Field Name: sequence_id
    * * Display Name: Sequence Id
    * * SQL Data Type: nvarchar(812)
    * * Description: The V2 API list unique identifier
    */
    get sequence_id(): string | null {
        return this.Get('sequence_id');
    }
    set sequence_id(value: string | null) {
        this.Set('sequence_id', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Contact Reports Activity Summaries - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: contact_reports_activity_summary
 * * Base View: vwContact_reports_activity_summaries
 * * @description GET Contact Action Summary
 * * Primary Key: campaign_activity_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Reports Activity Summaries')
export class constantcontactcontact_reports_activity_summaryEntity extends BaseEntity<constantcontactcontact_reports_activity_summaryEntityType> {
    /**
    * Loads the Contact Reports Activity Summaries record from the database
    * @param campaign_activity_id: string - primary key value to load the Contact Reports Activity Summaries record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactcontact_reports_activity_summaryEntity
    * @method
    * @override
    */
    public async Load(campaign_activity_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'campaign_activity_id', Value: campaign_activity_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: campaign_activity_id
    * * Display Name: Campaign Activity Id
    * * SQL Data Type: nvarchar(255)
    * * Related Entity/Foreign Key: Email Campaign Activities (vwEmail_campaign_activities.campaign_activity_id)
    * * Description: The unique id of the activity for an e-mail campaign.
    */
    get campaign_activity_id(): string | null {
        return this.Get('campaign_activity_id');
    }
    set campaign_activity_id(value: string | null) {
        this.Set('campaign_activity_id', value);
    }

    /**
    * * Field Name: em_unsubscribes
    * * Display Name: Em Unsubscribes
    * * SQL Data Type: nvarchar(255)
    * * Description: The number of times this contact has opted out.
    */
    get em_unsubscribes(): string | null {
        return this.Get('em_unsubscribes');
    }
    set em_unsubscribes(value: string | null) {
        this.Set('em_unsubscribes', value);
    }

    /**
    * * Field Name: em_clicks
    * * Display Name: Em Clicks
    * * SQL Data Type: nvarchar(255)
    * * Description: The number of times this contact has clicked a link in this email.
    */
    get em_clicks(): string | null {
        return this.Get('em_clicks');
    }
    set em_clicks(value: string | null) {
        this.Set('em_clicks', value);
    }

    /**
    * * Field Name: start_on
    * * Display Name: Start On
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The last date at which the email was sent to this contact.
    */
    get start_on(): string | null {
        return this.Get('start_on');
    }
    set start_on(value: string | null) {
        this.Set('start_on', value);
    }

    /**
    * * Field Name: em_sends
    * * Display Name: Em Sends
    * * SQL Data Type: nvarchar(255)
    * * Description: The number of times the email was sent to this contact.
    */
    get em_sends(): string | null {
        return this.Get('em_sends');
    }
    set em_sends(value: string | null) {
        this.Set('em_sends', value);
    }

    /**
    * * Field Name: em_forwards
    * * Display Name: Em Forwards
    * * SQL Data Type: nvarchar(255)
    * * Description: The number of times this contact has forwarded this email.
    */
    get em_forwards(): string | null {
        return this.Get('em_forwards');
    }
    set em_forwards(value: string | null) {
        this.Set('em_forwards', value);
    }

    /**
    * * Field Name: em_bounces
    * * Display Name: Em Bounces
    * * SQL Data Type: nvarchar(255)
    * * Description: The number of times the email has bounced for this contact.
    */
    get em_bounces(): string | null {
        return this.Get('em_bounces');
    }
    set em_bounces(value: string | null) {
        this.Set('em_bounces', value);
    }

    /**
    * * Field Name: em_opens
    * * Display Name: Em Opens
    * * SQL Data Type: nvarchar(255)
    * * Description: The number of times this contact has opened this email.
    */
    get em_opens(): string | null {
        return this.Get('em_opens');
    }
    set em_opens(value: string | null) {
        this.Set('em_opens', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Contact Reports Open And Click Rates - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: contact_reports_open_and_click_rates
 * * Base View: vwContact_reports_open_and_click_rates
 * * @description GET Average Open and Click Rates
 * * Primary Key: contact_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Reports Open And Click Rates')
export class constantcontactcontact_reports_open_and_click_ratesEntity extends BaseEntity<constantcontactcontact_reports_open_and_click_ratesEntityType> {
    /**
    * Loads the Contact Reports Open And Click Rates record from the database
    * @param contact_id: string - primary key value to load the Contact Reports Open And Click Rates record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactcontact_reports_open_and_click_ratesEntity
    * @method
    * @override
    */
    public async Load(contact_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'contact_id', Value: contact_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: included_activities_count
    * * Display Name: Included Activities Count
    * * SQL Data Type: nvarchar(255)
    * * Description: The number of activities included in the calculation.
    */
    get included_activities_count(): string | null {
        return this.Get('included_activities_count');
    }
    set included_activities_count(value: string | null) {
        this.Set('included_activities_count', value);
    }

    /**
    * * Field Name: average_open_rate
    * * Display Name: Average Open Rate
    * * SQL Data Type: nvarchar(255)
    * * Description: The average rate the contact opened emails sent to them.
    */
    get average_open_rate(): string | null {
        return this.Get('average_open_rate');
    }
    set average_open_rate(value: string | null) {
        this.Set('average_open_rate', value);
    }

    /**
    * * Field Name: average_click_rate
    * * Display Name: Average Click Rate
    * * SQL Data Type: nvarchar(255)
    * * Description: The average rate the contact clicked on links in emails sent to them.
    */
    get average_click_rate(): string | null {
        return this.Get('average_click_rate');
    }
    set average_click_rate(value: string | null) {
        this.Set('average_click_rate', value);
    }

    /**
    * * Field Name: contact_id
    * * Display Name: Contact Id
    * * SQL Data Type: nvarchar(255)
    * * Related Entity/Foreign Key: Contacts (vwContacts.contact_id)
    * * Description: The unique ID of the contact for which the report is being generated.
    */
    get contact_id(): string | null {
        return this.Get('contact_id');
    }
    set contact_id(value: string | null) {
        this.Set('contact_id', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Contact Tags - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: contact_tags
 * * Base View: vwContact_tags
 * * @description GET Details for All Tags
 * * Primary Key: tag_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Tags')
export class constantcontactcontact_tagsEntity extends BaseEntity<constantcontactcontact_tagsEntityType> {
    /**
    * Loads the Contact Tags record from the database
    * @param tag_id: string - primary key value to load the Contact Tags record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactcontact_tagsEntity
    * @method
    * @override
    */
    public async Load(tag_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'tag_id', Value: tag_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The system generated date and time when the tag was created (ISO-8601 format).
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: tag_id
    * * Display Name: Tag Id
    * * SQL Data Type: nvarchar(450)
    * * Description: The ID that uniquely identifies a tag (UUID format)
    */
    get tag_id(): string | null {
        return this.Get('tag_id');
    }
    set tag_id(value: string | null) {
        this.Set('tag_id', value);
    }

    /**
    * * Field Name: contacts_count
    * * Display Name: Contacts Count
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The total number of contacts who are assigned this tag.
    */
    get contacts_count(): string | null {
        return this.Get('contacts_count');
    }
    set contacts_count(value: string | null) {
        this.Set('contacts_count', value);
    }

    /**
    * * Field Name: updated_at
    * * Display Name: Updated At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The system generated date and time when the tag was last updated (ISO-8601 format).
    */
    get updated_at(): string | null {
        return this.Get('updated_at');
    }
    set updated_at(value: string | null) {
        this.Set('updated_at', value);
    }

    /**
    * * Field Name: name
    * * Display Name: name
    * * SQL Data Type: nvarchar(812)
    * * Description: The unique tag name.
    */
    get name(): string | null {
        return this.Get('name');
    }
    set name(value: string | null) {
        this.Set('name', value);
    }

    /**
    * * Field Name: tag_source
    * * Display Name: Tag Source
    * * SQL Data Type: nvarchar(812)
    * * Description: The source used to tag contacts.
    */
    get tag_source(): string | null {
        return this.Get('tag_source');
    }
    set tag_source(value: string | null) {
        this.Set('tag_source', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * * Schema: constant_contact
 * * Base Table: contacts
 * * Base View: vwContacts
 * * @description GET Contacts Collection
 * * Primary Key: contact_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contacts')
export class constantcontactcontactsEntity extends BaseEntity<constantcontactcontactsEntityType> {
    /**
    * Loads the Contacts record from the database
    * @param contact_id: string - primary key value to load the Contacts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactcontactsEntity
    * @method
    * @override
    */
    public async Load(contact_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'contact_id', Value: contact_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: first_name
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(812)
    * * Description: The first name of the contact.
    */
    get first_name(): string | null {
        return this.Get('first_name');
    }
    set first_name(value: string | null) {
        this.Set('first_name', value);
    }

    /**
    * * Field Name: notes
    * * Display Name: notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: An array of notes about the contact listed by most recent note first.
    */
    get notes(): string | null {
        return this.Get('notes');
    }
    set notes(value: string | null) {
        this.Set('notes', value);
    }

    /**
    * * Field Name: update_source
    * * Display Name: Update Source
    * * SQL Data Type: nvarchar(812)
    * * Description: Identifies who last updated the contact; valid values are  Contact or Account.
    */
    get update_source(): string | null {
        return this.Get('update_source');
    }
    set update_source(value: string | null) {
        this.Set('update_source', value);
    }

    /**
    * * Field Name: contact_id
    * * Display Name: Contact Id
    * * SQL Data Type: nvarchar(450)
    * * Description: Unique ID for each contact resource
    */
    get contact_id(): string | null {
        return this.Get('contact_id');
    }
    set contact_id(value: string | null) {
        this.Set('contact_id', value);
    }

    /**
    * * Field Name: sms_channel
    * * Display Name: Sms Channel
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Includes SMS channel and consent details.
    */
    get sms_channel(): string | null {
        return this.Get('sms_channel');
    }
    set sms_channel(value: string | null) {
        this.Set('sms_channel', value);
    }

    /**
    * * Field Name: anniversary
    * * Display Name: anniversary
    * * SQL Data Type: nvarchar(812)
    * * Description: The anniversary date for the contact. For example, this value could be the date when the contact first became a customer of an organization in Constant Contact. Valid date formats are MM/DD/YYYY, M/D/YYYY, YYYY/MM/DD, YYYY/M/D, YYYY-MM-DD, YYYY-M-D,M-D-YYYY, or M-DD-YYYY.
    */
    get anniversary(): string | null {
        return this.Get('anniversary');
    }
    set anniversary(value: string | null) {
        this.Set('anniversary', value);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: System generated date and time that the resource was created, in ISO-8601 format.
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: list_memberships
    * * Display Name: List Memberships
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Array of up to 50 list_ids to which the contact is subscribed.
    */
    get list_memberships(): string | null {
        return this.Get('list_memberships');
    }
    set list_memberships(value: string | null) {
        this.Set('list_memberships', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: deleted_at
    * * Display Name: Deleted At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: For deleted contacts (email_address contains opt_out_source and opt_out_date), shows the date of deletion.
    */
    get deleted_at(): string | null {
        return this.Get('deleted_at');
    }
    set deleted_at(value: string | null) {
        this.Set('deleted_at', value);
    }

    /**
    * * Field Name: company_name
    * * Display Name: Company Name
    * * SQL Data Type: nvarchar(812)
    * * Description: The name of the company where the contact works.
    */
    get company_name(): string | null {
        return this.Get('company_name');
    }
    set company_name(value: string | null) {
        this.Set('company_name', value);
    }

    /**
    * * Field Name: birthday_month
    * * Display Name: Birthday Month
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The month value for the contact's birthday. Valid values are from 1 through 12. You must use this property with birthday_month.
    */
    get birthday_month(): string | null {
        return this.Get('birthday_month');
    }
    set birthday_month(value: string | null) {
        this.Set('birthday_month', value);
    }

    /**
    * * Field Name: create_source
    * * Display Name: Create Source
    * * SQL Data Type: nvarchar(812)
    * * Description: Describes who added the contact; valid values are Contact or Account. Your integration must accurately identify create_source for compliance reasons; value is set when contact is created.
    */
    get create_source(): string | null {
        return this.Get('create_source');
    }
    set create_source(value: string | null) {
        this.Set('create_source', value);
    }

    /**
    * * Field Name: street_addresses
    * * Display Name: Street Addresses
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Array of up to 3 street_addresses subresources.
    */
    get street_addresses(): string | null {
        return this.Get('street_addresses');
    }
    set street_addresses(value: string | null) {
        this.Set('street_addresses', value);
    }

    /**
    * * Field Name: updated_at
    * * Display Name: Updated At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: System generated date and time that the contact was last updated, in ISO-8601 format.
    */
    get updated_at(): string | null {
        return this.Get('updated_at');
    }
    set updated_at(value: string | null) {
        this.Set('updated_at', value);
    }

    /**
    * * Field Name: last_name
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(812)
    * * Description: The last name of the contact.
    */
    get last_name(): string | null {
        return this.Get('last_name');
    }
    set last_name(value: string | null) {
        this.Set('last_name', value);
    }

    /**
    * * Field Name: job_title
    * * Display Name: Job Title
    * * SQL Data Type: nvarchar(812)
    * * Description: The job title of the contact.
    */
    get job_title(): string | null {
        return this.Get('job_title');
    }
    set job_title(value: string | null) {
        this.Set('job_title', value);
    }

    /**
    * * Field Name: custom_fields
    * * Display Name: Custom Fields
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Array of up to 25 custom_field subresources.
    */
    get custom_fields(): string | null {
        return this.Get('custom_fields');
    }
    set custom_fields(value: string | null) {
        this.Set('custom_fields', value);
    }

    /**
    * * Field Name: taggings
    * * Display Name: taggings
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Array of tags (tag_id) assigned to the contact, up to a maximum of 50.
    */
    get taggings(): string | null {
        return this.Get('taggings');
    }
    set taggings(value: string | null) {
        this.Set('taggings', value);
    }

    /**
    * * Field Name: phone_numbers
    * * Display Name: Phone Numbers
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Array of up to 3 phone_numbers subresources.
    */
    get phone_numbers(): string | null {
        return this.Get('phone_numbers');
    }
    set phone_numbers(value: string | null) {
        this.Set('phone_numbers', value);
    }

    /**
    * * Field Name: email_address
    * * Display Name: Email Address
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Email Address (contacts).
    */
    get email_address(): string | null {
        return this.Get('email_address');
    }
    set email_address(value: string | null) {
        this.Set('email_address', value);
    }

    /**
    * * Field Name: birthday_day
    * * Display Name: Birthday Day
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The day value for the contact's birthday. Valid values are from 1 through 12. You must use this property with birthday_day.
    */
    get birthday_day(): string | null {
        return this.Get('birthday_day');
    }
    set birthday_day(value: string | null) {
        this.Set('birthday_day', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Contacts Counts - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: contacts_counts
 * * Base View: vwContacts_counts
 * * @description GET Contact Consent Counts
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contacts Counts')
export class constantcontactcontacts_countsEntity extends BaseEntity<constantcontactcontacts_countsEntityType> {
    /**
    * Loads the Contacts Counts record from the database
    * @param ID: string - primary key value to load the Contacts Counts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactcontacts_countsEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: pending
    * * Display Name: pending
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Total number of contacts pending confirmation. Consent is requested and pending confirmation from the contact.
    */
    get pending(): string | null {
        return this.Get('pending');
    }
    set pending(value: string | null) {
        this.Set('pending', value);
    }

    /**
    * * Field Name: total
    * * Display Name: total
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Total number of contacts for the account.
    */
    get total(): string | null {
        return this.Get('total');
    }
    set total(value: string | null) {
        this.Set('total', value);
    }

    /**
    * * Field Name: implicit
    * * Display Name: implicit
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Total number of contacts implicitly confirmed. Consent is inferred based on actions, such as having an existing business relationship (making a purchase or donation, for example). In order to maintain implied consent to comply with CASL a contact must take a business action with you at least once every two years. Under CAN-Spam there is no need to maintain implied consent, it is assumed until the receiver indicates they no longer wish to receive messages.
    */
    get implicit(): string | null {
        return this.Get('implicit');
    }
    set implicit(value: string | null) {
        this.Set('implicit', value);
    }

    /**
    * * Field Name: new_subscriber
    * * Display Name: New Subscriber
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Total number of newly subscribed contacts.
    */
    get new_subscriber(): string | null {
        return this.Get('new_subscriber');
    }
    set new_subscriber(value: string | null) {
        this.Set('new_subscriber', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: nvarchar(450)
    */
    get ID(): string | null {
        return this.Get('ID');
    }
    set ID(value: string | null) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: unsubscribed
    * * Display Name: unsubscribed
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Total number of unsubscribed contacts. Consent is revoked when a contact has unsubscribed.
    */
    get unsubscribed(): string | null {
        return this.Get('unsubscribed');
    }
    set unsubscribed(value: string | null) {
        this.Set('unsubscribed', value);
    }

    /**
    * * Field Name: explicit
    * * Display Name: explicit
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Total number of contacts explicitly confirmed. Consent is obtained when you explicitly ask your potential contacts for permission to send the email (for example, using a sign-up form) and they agree. After you obtain express consent, it is good forever or until the contact opts out.
    */
    get explicit(): string | null {
        return this.Get('explicit');
    }
    set explicit(value: string | null) {
        this.Set('explicit', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Contacts Sign Up Forms - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: contacts_sign_up_form
 * * Base View: vwContacts_sign_up_forms
 * * @description Create or Update a Contact
 * * Primary Key: contact_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contacts Sign Up Forms')
export class constantcontactcontacts_sign_up_formEntity extends BaseEntity<constantcontactcontacts_sign_up_formEntityType> {
    /**
    * Loads the Contacts Sign Up Forms record from the database
    * @param contact_id: string - primary key value to load the Contacts Sign Up Forms record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactcontacts_sign_up_formEntity
    * @method
    * @override
    */
    public async Load(contact_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'contact_id', Value: contact_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: action
    * * Display Name: action
    * * SQL Data Type: nvarchar(812)
    * * Description: Identifies if the V3 API created a new contact or updated an existing contact.
    */
    get action(): string | null {
        return this.Get('action');
    }
    set action(value: string | null) {
        this.Set('action', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: contact_id
    * * Display Name: Contact Id
    * * SQL Data Type: nvarchar(450)
    * * Related Entity/Foreign Key: Contacts (vwContacts.contact_id)
    * * Description: The unique identifier for the contact that the V3 API created or updated.
    */
    get contact_id(): string | null {
        return this.Get('contact_id');
    }
    set contact_id(value: string | null) {
        this.Set('contact_id', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Contacts Xrefs - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: contacts_xrefs
 * * Base View: vwContacts_xrefs
 * * @description GET a collection of V2 and V3 API contact IDs
 * * Primary Key: contact_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contacts Xrefs')
export class constantcontactcontacts_xrefsEntity extends BaseEntity<constantcontactcontacts_xrefsEntityType> {
    /**
    * Loads the Contacts Xrefs record from the database
    * @param contact_id: string - primary key value to load the Contacts Xrefs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactcontacts_xrefsEntity
    * @method
    * @override
    */
    public async Load(contact_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'contact_id', Value: contact_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: contact_id
    * * Display Name: Contact Id
    * * SQL Data Type: nvarchar(450)
    * * Related Entity/Foreign Key: Contacts (vwContacts.contact_id)
    * * Description: The V3 API contact unique identifier
    */
    get contact_id(): string | null {
        return this.Get('contact_id');
    }
    set contact_id(value: string | null) {
        this.Set('contact_id', value);
    }

    /**
    * * Field Name: sequence_id
    * * Display Name: Sequence Id
    * * SQL Data Type: nvarchar(812)
    * * Description: The V2 API contact unique identifier
    */
    get sequence_id(): string | null {
        return this.Get('sequence_id');
    }
    set sequence_id(value: string | null) {
        this.Set('sequence_id', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Email Campaign Activities - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: email_campaign_activities
 * * Base View: vwEmail_campaign_activities
 * * @description GET a Single Email Campaign Activity
 * * Primary Key: campaign_activity_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Email Campaign Activities')
export class constantcontactemail_campaign_activitiesEntity extends BaseEntity<constantcontactemail_campaign_activitiesEntityType> {
    /**
    * Loads the Email Campaign Activities record from the database
    * @param campaign_activity_id: string - primary key value to load the Email Campaign Activities record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactemail_campaign_activitiesEntity
    * @method
    * @override
    */
    public async Load(campaign_activity_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'campaign_activity_id', Value: campaign_activity_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: physical_address_in_footer
    * * Display Name: Physical Address In Footer
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The physical address of the organization that is sending the email campaign. Constant Contact displays this information to contacts in the email message footer.
    */
    get physical_address_in_footer(): string | null {
        return this.Get('physical_address_in_footer');
    }
    set physical_address_in_footer(value: string | null) {
        this.Set('physical_address_in_footer', value);
    }

    /**
    * * Field Name: contact_list_ids
    * * Display Name: Contact List Ids
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The contacts that Constant Contact sends the email campaign activity to as an array of contact list_id values. You cannot use contact lists and segments at the same time in an email campaign activity.
    */
    get contact_list_ids(): string | null {
        return this.Get('contact_list_ids');
    }
    set contact_list_ids(value: string | null) {
        this.Set('contact_list_ids', value);
    }

    /**
    * * Field Name: template_id
    * * Display Name: Template Id
    * * SQL Data Type: nvarchar(255)
    * * Description: Identifies the email layout and design template that the email campaign activity is using as a base.
    */
    get template_id(): string | null {
        return this.Get('template_id');
    }
    set template_id(value: string | null) {
        this.Set('template_id', value);
    }

    /**
    * * Field Name: permalink_url
    * * Display Name: Permalink Url
    * * SQL Data Type: nvarchar(255)
    * * Description: The permanent link to a web accessible version of the email campaign content without any personalized email information. The permalink URL becomes accessible after you send an email campaign to contacts.
    */
    get permalink_url(): string | null {
        return this.Get('permalink_url');
    }
    set permalink_url(value: string | null) {
        this.Set('permalink_url', value);
    }

    /**
    * * Field Name: campaign_id
    * * Display Name: Campaign Id
    * * SQL Data Type: nvarchar(255)
    * * Related Entity/Foreign Key: Emails (vwEmails.campaign_id)
    * * Description: Identifies a campaign in the V3 API.
    */
    get campaign_id(): string | null {
        return this.Get('campaign_id');
    }
    set campaign_id(value: string | null) {
        this.Set('campaign_id', value);
    }

    /**
    * * Field Name: segment_ids
    * * Display Name: Segment Ids
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The contacts that Constant Contact sends the email campaign activity to as an array containing a single segment_id value. Only format_type 3, 4, and 5 email campaign activities support segments. You cannot use contact lists and segments at the same time in an email campaign activity.
    */
    get segment_ids(): string | null {
        return this.Get('segment_ids');
    }
    set segment_ids(value: string | null) {
        this.Set('segment_ids', value);
    }

    /**
    * * Field Name: role
    * * Display Name: role
    * * SQL Data Type: nvarchar(255)
    * * Description: The purpose of the individual campaign activity in the larger email campaign effort. Valid values are: 
  primary_email — The main email marketing campaign that you send to contacts. The primary_email contains the complete email content.
  permalink — A permanent link to a web accessible version of the primary_email content without any personalized email information. For example, permalinks do not contain any of the contact details that you add to the primary_email email content. 
  re
    */
    get role(): string | null {
        return this.Get('role');
    }
    set role(value: string | null) {
        this.Set('role', value);
    }

    /**
    * * Field Name: campaign_activity_id
    * * Display Name: Campaign Activity Id
    * * SQL Data Type: nvarchar(255)
    * * Description: Identifies a campaign activity in the V3 API.
    */
    get campaign_activity_id(): string | null {
        return this.Get('campaign_activity_id');
    }
    set campaign_activity_id(value: string | null) {
        this.Set('campaign_activity_id', value);
    }

    /**
    * * Field Name: format_type
    * * Display Name: Format Type
    * * SQL Data Type: nvarchar(255)
    * * Description: Identifies the type of email format. Valid values are: 
  1 - A legacy custom code email created using the V2 API, the V3 API, or the legacy UI HTML editor.
  2 - An email created using the second generation email editor UI.
  3 - An email created using the third generation email editor UI. This email editor features an improved drag and drop UI and mobile responsiveness.
  4 - An email created using the fourth generation email editor UI.
  5 - A custom code email created using the V3 
    */
    get format_type(): string | null {
        return this.Get('format_type');
    }
    set format_type(value: string | null) {
        this.Set('format_type', value);
    }

    /**
    * * Field Name: document_properties
    * * Display Name: Document Properties
    * * SQL Data Type: nvarchar(MAX)
    * * Description: An object that contains optional properties for legacy format type emails (format_type 1 and 2). If you attempt to add a property that does apply to the email format_type, the API will ignore the property.
    */
    get document_properties(): string | null {
        return this.Get('document_properties');
    }
    set document_properties(value: string | null) {
        this.Set('document_properties', value);
    }

    /**
    * * Field Name: from_email
    * * Display Name: From Email
    * * SQL Data Type: nvarchar(255)
    * * Description: The email "From Email" field for the email campaign activity. You must use a confirmed Constant Contact account email address. Make a GET call to /account/emails to return a collection of account emails and their confirmation status.
    */
    get from_email(): string | null {
        return this.Get('from_email');
    }
    set from_email(value: string | null) {
        this.Set('from_email', value);
    }

    /**
    * * Field Name: reply_to_email
    * * Display Name: Reply To Email
    * * SQL Data Type: nvarchar(255)
    * * Description: The email "Reply To Email" field for the email campaign activity. You must use a confirmed Constant Contact account email address. Make a GET call to /account/emails to return a collection of account emails and their confirmation status.
    */
    get reply_to_email(): string | null {
        return this.Get('reply_to_email');
    }
    set reply_to_email(value: string | null) {
        this.Set('reply_to_email', value);
    }

    /**
    * * Field Name: html_content
    * * Display Name: Html Content
    * * SQL Data Type: nvarchar(255)
    * * Description: The HTML or XHTML content for the email campaign activity. Only format_type 1 and 5 (legacy custom code emails or modern custom code emails) can contain html_content.
    */
    get html_content(): string | null {
        return this.Get('html_content');
    }
    set html_content(value: string | null) {
        this.Set('html_content', value);
    }

    /**
    * * Field Name: current_status
    * * Display Name: Current Status
    * * SQL Data Type: nvarchar(255)
    * * Description: The current status of the email campaign activity. Valid values are: 
  DRAFT — An email campaign activity that you have created but have not sent to contacts.
  SCHEDULED — An email campaign activity that you have scheduled for Constant Contact to send to contacts.
  EXECUTING — An email campaign activity Constant Contact is currently sending to contacts. Email campaign activities are only in this status briefly.
  DONE — An email campaign activity that you successfully sent to contac
    */
    get current_status(): string | null {
        return this.Get('current_status');
    }
    set current_status(value: string | null) {
        this.Set('current_status', value);
    }

    /**
    * * Field Name: preheader
    * * Display Name: preheader
    * * SQL Data Type: nvarchar(255)
    * * Description: The email preheader for the email campaign activity. Only format_type 3, 4, and 5 email campaign activities use the preheader property.
    */
    get preheader(): string | null {
        return this.Get('preheader');
    }
    set preheader(value: string | null) {
        this.Set('preheader', value);
    }

    /**
    * * Field Name: subject
    * * Display Name: subject
    * * SQL Data Type: nvarchar(255)
    * * Description: The email "Subject" field for the email campaign activity.
    */
    get subject(): string | null {
        return this.Get('subject');
    }
    set subject(value: string | null) {
        this.Set('subject', value);
    }

    /**
    * * Field Name: from_name
    * * Display Name: From Name
    * * SQL Data Type: nvarchar(255)
    * * Description: The email "From Name" field for the email campaign activity.
    */
    get from_name(): string | null {
        return this.Get('from_name');
    }
    set from_name(value: string | null) {
        this.Set('from_name', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Email Campaign Activity Non Opener Resends - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: email_campaign_activity_non_opener_resends
 * * Base View: vwEmail_campaign_activity_non_opener_resends
 * * @description GET Details for a Resend to Non-openers Campaign Activity
 * * Primary Key: resend_request_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Email Campaign Activity Non Opener Resends')
export class constantcontactemail_campaign_activity_non_opener_resendsEntity extends BaseEntity<constantcontactemail_campaign_activity_non_opener_resendsEntityType> {
    /**
    * Loads the Email Campaign Activity Non Opener Resends record from the database
    * @param resend_request_id: string - primary key value to load the Email Campaign Activity Non Opener Resends record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactemail_campaign_activity_non_opener_resendsEntity
    * @method
    * @override
    */
    public async Load(resend_request_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'resend_request_id', Value: resend_request_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: delay_days
    * * Display Name: Delay Days
    * * SQL Data Type: nvarchar(255)
    * * Description: The number of days to wait before Constant Contact resends the email. Valid values include 1 to 10 days. This value is only returned in the response results if the resend activity was created with delay_days or the delay_minutes equal to an exact day value.
    */
    get delay_days(): string | null {
        return this.Get('delay_days');
    }
    set delay_days(value: string | null) {
        this.Set('delay_days', value);
    }

    /**
    * * Field Name: resend_subject
    * * Display Name: Resend Subject
    * * SQL Data Type: nvarchar(255)
    * * Description: The subject line used when resending the email campaign activity.
    */
    get resend_subject(): string | null {
        return this.Get('resend_subject');
    }
    set resend_subject(value: string | null) {
        this.Set('resend_subject', value);
    }

    /**
    * * Field Name: resend_status
    * * Display Name: Resend Status
    * * SQL Data Type: nvarchar(255)
    * * Description: The status of the resend to non-openers campaign activity. The resend_status is only returned in the response results if the campaign activity is either scheduled to be sent or was already sent.
    */
    get resend_status(): string | null {
        return this.Get('resend_status');
    }
    set resend_status(value: string | null) {
        this.Set('resend_status', value);
    }

    /**
    * * Field Name: resend_date
    * * Display Name: Resend Date
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The system generated date and time (in ISO-8601 format) that the email campaign activity was resent to non-openers (only included in the response results for sent resend activities).
    */
    get resend_date(): string | null {
        return this.Get('resend_date');
    }
    set resend_date(value: string | null) {
        this.Set('resend_date', value);
    }

    /**
    * * Field Name: resend_request_id
    * * Display Name: Resend Request Id
    * * SQL Data Type: nvarchar(255)
    * * Description: For scheduled or sent resend to non-opener emails, the system generates an ID that identifies the resend to non-openers activity. For draft email campaign resend activities, the system returns DRAFT.
    */
    get resend_request_id(): string | null {
        return this.Get('resend_request_id');
    }
    set resend_request_id(value: string | null) {
        this.Set('resend_request_id', value);
    }

    /**
    * * Field Name: delay_minutes
    * * Display Name: Delay Minutes
    * * SQL Data Type: nvarchar(255)
    * * Description: The number of minutes to wait before Constant Contact resends the email. There are 1,440 minutes in a day. Valid values includes a minimum of 720 (12 hours) and a maximum of 14,400 minutes (10 days). This property is mutually exclusive with delay_days.
    */
    get delay_minutes(): string | null {
        return this.Get('delay_minutes');
    }
    set delay_minutes(value: string | null) {
        this.Set('delay_minutes', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Email Campaign Activity Previews - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: email_campaign_activity_previews
 * * Base View: vwEmail_campaign_activity_previews
 * * @description GET the HTML Preview of an Email Campaign Activity
 * * Primary Key: campaign_activity_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Email Campaign Activity Previews')
export class constantcontactemail_campaign_activity_previewsEntity extends BaseEntity<constantcontactemail_campaign_activity_previewsEntityType> {
    /**
    * Loads the Email Campaign Activity Previews record from the database
    * @param campaign_activity_id: string - primary key value to load the Email Campaign Activity Previews record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactemail_campaign_activity_previewsEntity
    * @method
    * @override
    */
    public async Load(campaign_activity_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'campaign_activity_id', Value: campaign_activity_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: preheader
    * * Display Name: preheader
    * * SQL Data Type: nvarchar(255)
    * * Description: The email preheader for the email campaign activity. Only format_type 3, 4, and 5 email campaign activities use the preheader property.
    */
    get preheader(): string | null {
        return this.Get('preheader');
    }
    set preheader(value: string | null) {
        this.Set('preheader', value);
    }

    /**
    * * Field Name: preview_html_content
    * * Display Name: Preview Html Content
    * * SQL Data Type: nvarchar(255)
    * * Description: An HTML preview of the email campaign activity.
    */
    get preview_html_content(): string | null {
        return this.Get('preview_html_content');
    }
    set preview_html_content(value: string | null) {
        this.Set('preview_html_content', value);
    }

    /**
    * * Field Name: from_email
    * * Display Name: From Email
    * * SQL Data Type: nvarchar(255)
    * * Description: The "from email" email header for the email campaign activity.
    */
    get from_email(): string | null {
        return this.Get('from_email');
    }
    set from_email(value: string | null) {
        this.Set('from_email', value);
    }

    /**
    * * Field Name: reply_to_email
    * * Display Name: Reply To Email
    * * SQL Data Type: nvarchar(255)
    * * Description: The email "Reply To Email" field for the email campaign activity.
    */
    get reply_to_email(): string | null {
        return this.Get('reply_to_email');
    }
    set reply_to_email(value: string | null) {
        this.Set('reply_to_email', value);
    }

    /**
    * * Field Name: campaign_activity_id
    * * Display Name: Campaign Activity Id
    * * SQL Data Type: nvarchar(255)
    * * Related Entity/Foreign Key: Email Campaign Activities (vwEmail_campaign_activities.campaign_activity_id)
    * * Description: The unique ID for an email campaign activity.
    */
    get campaign_activity_id(): string | null {
        return this.Get('campaign_activity_id');
    }
    set campaign_activity_id(value: string | null) {
        this.Set('campaign_activity_id', value);
    }

    /**
    * * Field Name: from_name
    * * Display Name: From Name
    * * SQL Data Type: nvarchar(255)
    * * Description: The "from name" email header for the email campaign activity.
    */
    get from_name(): string | null {
        return this.Get('from_name');
    }
    set from_name(value: string | null) {
        this.Set('from_name', value);
    }

    /**
    * * Field Name: preview_text_content
    * * Display Name: Preview Text Content
    * * SQL Data Type: nvarchar(255)
    * * Description: A plain text preview of the email campaign activity.
    */
    get preview_text_content(): string | null {
        return this.Get('preview_text_content');
    }
    set preview_text_content(value: string | null) {
        this.Set('preview_text_content', value);
    }

    /**
    * * Field Name: subject
    * * Display Name: subject
    * * SQL Data Type: nvarchar(255)
    * * Description: The email "Subject" field for the email campaign activity.
    */
    get subject(): string | null {
        return this.Get('subject');
    }
    set subject(value: string | null) {
        this.Set('subject', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Email Campaign Activity Send Histories - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: email_campaign_activity_send_history
 * * Base View: vwEmail_campaign_activity_send_histories
 * * @description GET the Send History of an Email Campaign Activity
 * * Primary Key: send_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Email Campaign Activity Send Histories')
export class constantcontactemail_campaign_activity_send_historyEntity extends BaseEntity<constantcontactemail_campaign_activity_send_historyEntityType> {
    /**
    * Loads the Email Campaign Activity Send Histories record from the database
    * @param send_id: string - primary key value to load the Email Campaign Activity Send Histories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactemail_campaign_activity_send_historyEntity
    * @method
    * @override
    */
    public async Load(send_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'send_id', Value: send_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: reason_code
    * * Display Name: Reason Code
    * * SQL Data Type: nvarchar(255)
    * * Description: The reason why the send attempt completed or encountered an error. This method returns 0 if Constant Contact successfully sent the email campaign activity to contacts. Possible reason_code values are: 
      0 — Constant Contact successfully sent the email to contacts.
      1 — An error occurred when sending this email. Try scheduling it again, or contact Customer Support.
      2 — We were unable to send the email. Please contact our Account Review Team for more information.
      3 
    */
    get reason_code(): string | null {
        return this.Get('reason_code');
    }
    set reason_code(value: string | null) {
        this.Set('reason_code', value);
    }

    /**
    * * Field Name: segment_ids
    * * Display Name: Segment Ids
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The contact segments that Constant Contact sent the email campaign activity to as an array of segment_id integers.
    */
    get segment_ids(): string | null {
        return this.Get('segment_ids');
    }
    set segment_ids(value: string | null) {
        this.Set('segment_ids', value);
    }

    /**
    * * Field Name: count
    * * Display Name: count
    * * SQL Data Type: nvarchar(255)
    * * Description: The number of contacts that Constant Contact sent this email campaign activity to. This property is specific to each send history object. When you resend an email campaign activity, Constant Contact only sends it to new contacts in the contact lists or segments you are using.
    */
    get count(): string | null {
        return this.Get('count');
    }
    set count(value: string | null) {
        this.Set('count', value);
    }

    /**
    * * Field Name: send_id
    * * Display Name: Send Id
    * * SQL Data Type: nvarchar(255)
    * * Description: Uniquely identifies each send history object using the number of times that you sent the email campaign activity as a sequence starting at 1. For example, when you send a specific email campaign activity twice this method returns an object with a send_id of 1 for the first send and an object with a send_id of 2 for the second send.
    */
    get send_id(): string | null {
        return this.Get('send_id');
    }
    set send_id(value: string | null) {
        this.Set('send_id', value);
    }

    /**
    * * Field Name: run_date
    * * Display Name: Run Date
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The system generated date and time that Constant Contact sent the email campaign activity to contacts in ISO-8601 format.
    */
    get run_date(): string | null {
        return this.Get('run_date');
    }
    set run_date(value: string | null) {
        this.Set('run_date', value);
    }

    /**
    * * Field Name: send_status
    * * Display Name: Send Status
    * * SQL Data Type: nvarchar(255)
    * * Description: The send status for the email campaign activity. Valid values are:  
  COMPLETED: Constant Contact successfully sent the email campaign activity.
  ERRORED: Constant Contact encountered an error when sending the email campaign activity.
    */
    get send_status(): string | null {
        return this.Get('send_status');
    }
    set send_status(value: string | null) {
        this.Set('send_status', value);
    }

    /**
    * * Field Name: contact_list_ids
    * * Display Name: Contact List Ids
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The contacts lists that Constant Contact sent email campaign activity to as an array of contact list_id strings.
    */
    get contact_list_ids(): string | null {
        return this.Get('contact_list_ids');
    }
    set contact_list_ids(value: string | null) {
        this.Set('contact_list_ids', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Email Reports Links - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: email_reports_links
 * * Base View: vwEmail_reports_links
 * * @description GET an Email Links Report
 * * Primary Key: url_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Email Reports Links')
export class constantcontactemail_reports_linksEntity extends BaseEntity<constantcontactemail_reports_linksEntityType> {
    /**
    * Loads the Email Reports Links record from the database
    * @param url_id: string - primary key value to load the Email Reports Links record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactemail_reports_linksEntity
    * @method
    * @override
    */
    public async Load(url_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'url_id', Value: url_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: unique_clicks
    * * Display Name: Unique Clicks
    * * SQL Data Type: nvarchar(255)
    * * Description: The number of unique contacts that clicked the link.
    */
    get unique_clicks(): string | null {
        return this.Get('unique_clicks');
    }
    set unique_clicks(value: string | null) {
        this.Set('unique_clicks', value);
    }

    /**
    * * Field Name: url_id
    * * Display Name: Url Id
    * * SQL Data Type: nvarchar(255)
    * * Description: The ID for a unique link URL in an email campaign activity.
    */
    get url_id(): string | null {
        return this.Get('url_id');
    }
    set url_id(value: string | null) {
        this.Set('url_id', value);
    }

    /**
    * * Field Name: link_tag
    * * Display Name: Link Tag
    * * SQL Data Type: nvarchar(255)
    * * Description: Link tags are not currently available in email campaigns. By default, this method combines results for duplicate link URLs. Link tags will allow users to get a separate link click report for each unique link_tag value they use, even if URLs are not unique.
    */
    get link_tag(): string | null {
        return this.Get('link_tag');
    }
    set link_tag(value: string | null) {
        this.Set('link_tag', value);
    }

    /**
    * * Field Name: link_url
    * * Display Name: Link Url
    * * SQL Data Type: nvarchar(255)
    * * Description: The URL of a link in an email campaign activity. This URL is not normalized and appears the same as the URL in the email campaign activity.
    */
    get link_url(): string | null {
        return this.Get('link_url');
    }
    set link_url(value: string | null) {
        this.Set('link_url', value);
    }

    /**
    * * Field Name: list_action
    * * Display Name: List Action
    * * SQL Data Type: nvarchar(255)
    * * Description: If the link uses the click segmentation feature, this property contains the action that contacts trigger when they click the link. Currently the only available action is add, which adds contacts that click the link to a contact list.
    */
    get list_action(): string | null {
        return this.Get('list_action');
    }
    set list_action(value: string | null) {
        this.Set('list_action', value);
    }

    /**
    * * Field Name: list_id
    * * Display Name: List Id
    * * SQL Data Type: nvarchar(255)
    * * Related Entity/Foreign Key: Contact Lists (vwContact_lists.list_id)
    * * Description: If the link uses the click segmentation feature, this property contains the contact list linked with the list_action property.
    */
    get list_id(): string | null {
        return this.Get('list_id');
    }
    set list_id(value: string | null) {
        this.Set('list_id', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Email Reports Summaries - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: email_reports_summary
 * * Base View: vwEmail_reports_summaries
 * * @description GET an Email Campaigns Summary Report
 * * Primary Key: campaign_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Email Reports Summaries')
export class constantcontactemail_reports_summaryEntity extends BaseEntity<constantcontactemail_reports_summaryEntityType> {
    /**
    * Loads the Email Reports Summaries record from the database
    * @param campaign_id: string - primary key value to load the Email Reports Summaries record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactemail_reports_summaryEntity
    * @method
    * @override
    */
    public async Load(campaign_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'campaign_id', Value: campaign_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: last_sent_date
    * * Display Name: Last Sent Date
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The date and time that the email campaign was last sent.
    */
    get last_sent_date(): string | null {
        return this.Get('last_sent_date');
    }
    set last_sent_date(value: string | null) {
        this.Set('last_sent_date', value);
    }

    /**
    * * Field Name: campaign_id
    * * Display Name: Campaign Id
    * * SQL Data Type: nvarchar(450)
    * * Related Entity/Foreign Key: Emails (vwEmails.campaign_id)
    * * Description: The ID that uniquely identifies an email campaign.
    */
    get campaign_id(): string | null {
        return this.Get('campaign_id');
    }
    set campaign_id(value: string | null) {
        this.Set('campaign_id', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: unique_counts
    * * Display Name: Unique Counts
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The total number of times each unique contact interacted with a tracked email campaign activity.
    */
    get unique_counts(): string | null {
        return this.Get('unique_counts');
    }
    set unique_counts(value: string | null) {
        this.Set('unique_counts', value);
    }

    /**
    * * Field Name: campaign_type
    * * Display Name: Campaign Type
    * * SQL Data Type: nvarchar(812)
    * * Description: Identifies the email campaign type.
    */
    get campaign_type(): string | null {
        return this.Get('campaign_type');
    }
    set campaign_type(value: string | null) {
        this.Set('campaign_type', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * * Schema: constant_contact
 * * Base Table: emails
 * * Base View: vwEmails
 * * @description GET a Collection of Email Campaigns
 * * Primary Key: campaign_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Emails')
export class constantcontactemailsEntity extends BaseEntity<constantcontactemailsEntityType> {
    /**
    * Loads the Emails record from the database
    * @param campaign_id: string - primary key value to load the Emails record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactemailsEntity
    * @method
    * @override
    */
    public async Load(campaign_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'campaign_id', Value: campaign_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The system generated date and time that this email campaign was created. This string is readonly and is in ISO-8601 format.
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: type
    * * Display Name: type
    * * SQL Data Type: nvarchar(812)
    * * Description: Identifies the type of campaign that you select when creating the campaign. Newsletter and Custom Code email campaigns are the primary types.
    */
    get type(): string | null {
        return this.Get('type');
    }
    set type(value: string | null) {
        this.Set('type', value);
    }

    /**
    * * Field Name: updated_at
    * * Display Name: Updated At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The system generated date and time showing when the campaign was last updated. This string is read only and is in ISO-8601 format.
    */
    get updated_at(): string | null {
        return this.Get('updated_at');
    }
    set updated_at(value: string | null) {
        this.Set('updated_at', value);
    }

    /**
    * * Field Name: current_status
    * * Display Name: Current Status
    * * SQL Data Type: nvarchar(812)
    * * Description: The current status of the email campaign. Valid values are: 
  Draft — An email campaign that you have created but have not sent to contacts.
  Scheduled — An email campaign that you have scheduled for Constant Contact to send to contacts.
  Executing — An email campaign that Constant Contact is currently sending to contacts. Email campaign activities are only in this status briefly.
  Done — An email campaign that you successfully sent to contacts.
  Error — An email campaign activity
    */
    get current_status(): string | null {
        return this.Get('current_status');
    }
    set current_status(value: string | null) {
        this.Set('current_status', value);
    }

    /**
    * * Field Name: campaign_activities
    * * Display Name: Campaign Activities
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Lists the role and unique activity ID of each campaign activity that is associated with an Email Campaign.
    */
    get campaign_activities(): string | null {
        return this.Get('campaign_activities');
    }
    set campaign_activities(value: string | null) {
        this.Set('campaign_activities', value);
    }

    /**
    * * Field Name: campaign_id
    * * Display Name: Campaign Id
    * * SQL Data Type: nvarchar(450)
    * * Description: The unique ID used to identify the email campaign (UUID format).
    */
    get campaign_id(): string | null {
        return this.Get('campaign_id');
    }
    set campaign_id(value: string | null) {
        this.Set('campaign_id', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: name
    * * Display Name: name
    * * SQL Data Type: nvarchar(812)
    * * Description: The descriptive name the user provides to identify this campaign. Campaign names must be unique for each account ID.
    */
    get name(): string | null {
        return this.Get('name');
    }
    set name(value: string | null) {
        this.Set('name', value);
    }

    /**
    * * Field Name: type_code
    * * Display Name: Type Code
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The code used to identify the email campaign \`type\`. 
   1  (Default) 
   2  (Bulk Email) 
   10 (Newsletter) 
   11 (Announcement) 
   12 (Product/Service News) 
   14 (Business Letter) 
   15 (Card) 
   16 (Press release)
   17 (Flyer) 
   18 (Feedback Request) 
   19 (Ratings and Reviews) 
   20 (Event Announcement) 
   21 (Simple Coupon) 
   22 (Sale Promotion) 
   23 (Product Promotion) 
   24 (Membership Drive) 
   25 (Fundraiser) 
   26 (Custom Code Email)
   57 (A/B Test)
    */
    get type_code(): string | null {
        return this.Get('type_code');
    }
    set type_code(value: string | null) {
        this.Set('type_code', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Emails Xrefs - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: emails_xrefs
 * * Base View: vwEmails_xrefs
 * * @description GET a Collection of V2 and V3 API Email Campaign Identifiers
 * * Primary Key: campaign_activity_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Emails Xrefs')
export class constantcontactemails_xrefsEntity extends BaseEntity<constantcontactemails_xrefsEntityType> {
    /**
    * Loads the Emails Xrefs record from the database
    * @param campaign_activity_id: string - primary key value to load the Emails Xrefs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactemails_xrefsEntity
    * @method
    * @override
    */
    public async Load(campaign_activity_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'campaign_activity_id', Value: campaign_activity_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: campaign_id
    * * Display Name: Campaign Id
    * * SQL Data Type: nvarchar(812)
    * * Related Entity/Foreign Key: Emails (vwEmails.campaign_id)
    * * Description: Identifies a campaign in the V3 API. In the V3 API, each campaign contains one or more activities. For more information, see V3 Email Campaign Resource Changes.
    */
    get campaign_id(): string | null {
        return this.Get('campaign_id');
    }
    set campaign_id(value: string | null) {
        this.Set('campaign_id', value);
    }

    /**
    * * Field Name: campaign_activity_id
    * * Display Name: Campaign Activity Id
    * * SQL Data Type: nvarchar(450)
    * * Related Entity/Foreign Key: Email Campaign Activities (vwEmail_campaign_activities.campaign_activity_id)
    * * Description: Identifies a campaign activity in the V3 API. In the V3 API, each campaign contains one or more activities. Email type activities represent the detailed information in an email and contain properties like from_email and from_name. For more information, see V3 Campaign Resource Changes.
    */
    get campaign_activity_id(): string | null {
        return this.Get('campaign_activity_id');
    }
    set campaign_activity_id(value: string | null) {
        this.Set('campaign_activity_id', value);
    }

    /**
    * * Field Name: v2_email_campaign_id
    * * Display Name: V2 Email Campaign Id
    * * SQL Data Type: nvarchar(812)
    * * Description: Identifies an email campaign in the V2 API.
    */
    get v2_email_campaign_id(): string | null {
        return this.Get('v2_email_campaign_id');
    }
    set v2_email_campaign_id(value: string | null) {
        this.Set('v2_email_campaign_id', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * * Schema: constant_contact
 * * Base Table: events
 * * Base View: vwEvents
 * * @description GET a collection of events.
 * * Primary Key: event_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Events')
export class constantcontacteventsEntity extends BaseEntity<constantcontacteventsEntityType> {
    /**
    * Loads the Events record from the database
    * @param event_id: string - primary key value to load the Events record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontacteventsEntity
    * @method
    * @override
    */
    public async Load(event_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'event_id', Value: event_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: event_metadata
    * * Display Name: Event Metadata
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Includes additional event information.
    */
    get event_metadata(): string | null {
        return this.Get('event_metadata');
    }
    set event_metadata(value: string | null) {
        this.Set('event_metadata', value);
    }

    /**
    * * Field Name: campaign_id
    * * Display Name: Campaign Id
    * * SQL Data Type: nvarchar(812)
    * * Related Entity/Foreign Key: Emails (vwEmails.campaign_id)
    * * Description: The system assigned ID that uniquely identifies the event and is identical to the \`event_id\`.
    */
    get campaign_id(): string | null {
        return this.Get('campaign_id');
    }
    set campaign_id(value: string | null) {
        this.Set('campaign_id', value);
    }

    /**
    * * Field Name: eso
    * * Display Name: eso
    * * SQL Data Type: nvarchar(812)
    * * Description: The encrypted SOId.
    */
    get eso(): string | null {
        return this.Get('eso');
    }
    set eso(value: string | null) {
        this.Set('eso', value);
    }

    /**
    * * Field Name: event_calendar_url
    * * Display Name: Event Calendar Url
    * * SQL Data Type: nvarchar(812)
    * * Description: The event calendar URL.
    */
    get event_calendar_url(): string | null {
        return this.Get('event_calendar_url');
    }
    set event_calendar_url(value: string | null) {
        this.Set('event_calendar_url', value);
    }

    /**
    * * Field Name: failed_campaign_activities
    * * Display Name: Failed Campaign Activities
    * * SQL Data Type: nvarchar(MAX)
    * * Description: List of failed campaign activities.
    */
    get failed_campaign_activities(): string | null {
        return this.Get('failed_campaign_activities');
    }
    set failed_campaign_activities(value: string | null) {
        this.Set('failed_campaign_activities', value);
    }

    /**
    * * Field Name: create_time
    * * Display Name: Create Time
    * * SQL Data Type: nvarchar(812)
    * * Description: The time the event was created, in ISO format. Read-only.
    */
    get create_time(): string | null {
        return this.Get('create_time');
    }
    set create_time(value: string | null) {
        this.Set('create_time', value);
    }

    /**
    * * Field Name: event_id
    * * Display Name: Event Id
    * * SQL Data Type: nvarchar(450)
    * * Description: The ID that uniquely identifies the event.
    */
    get event_id(): string | null {
        return this.Get('event_id');
    }
    set event_id(value: string | null) {
        this.Set('event_id', value);
    }

    /**
    * * Field Name: status
    * * Display Name: status
    * * SQL Data Type: nvarchar(812)
    * * Description: Specifies the event's current status.
    */
    get status(): string | null {
        return this.Get('status');
    }
    set status(value: string | null) {
        this.Set('status', value);
    }

    /**
    * * Field Name: contact
    * * Display Name: contact
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The contact information associated with the event.
    */
    get contact(): string | null {
        return this.Get('contact');
    }
    set contact(value: string | null) {
        this.Set('contact', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: time_zone_abbreviation
    * * Display Name: Time Zone Abbreviation
    * * SQL Data Type: nvarchar(812)
    * * Description: The abbreviation to use to indicate the time zone where the event takes place.
    */
    get time_zone_abbreviation(): string | null {
        return this.Get('time_zone_abbreviation');
    }
    set time_zone_abbreviation(value: string | null) {
        this.Set('time_zone_abbreviation', value);
    }

    /**
    * * Field Name: deleted_time
    * * Display Name: Deleted Time
    * * SQL Data Type: nvarchar(812)
    * * Description: The time the event was deleted, in ISO format. Read-only.
    */
    get deleted_time(): string | null {
        return this.Get('deleted_time');
    }
    set deleted_time(value: string | null) {
        this.Set('deleted_time', value);
    }

    /**
    * * Field Name: address
    * * Display Name: address
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Address (events).
    */
    get address(): string | null {
        return this.Get('address');
    }
    set address(value: string | null) {
        this.Set('address', value);
    }

    /**
    * * Field Name: display_end_time_flag
    * * Display Name: Display End Time Flag
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Display or hide the event end time on the registration form and registration confirmation message.
    */
    get display_end_time_flag(): string | null {
        return this.Get('display_end_time_flag');
    }
    set display_end_time_flag(value: string | null) {
        this.Set('display_end_time_flag', value);
    }

    /**
    * * Field Name: event_settings
    * * Display Name: Event Settings
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Event Settings (events).
    */
    get event_settings(): string | null {
        return this.Get('event_settings');
    }
    set event_settings(value: string | null) {
        this.Set('event_settings', value);
    }

    /**
    * * Field Name: event_start
    * * Display Name: Event Start
    * * SQL Data Type: nvarchar(812)
    * * Description: The date the event starts.
    */
    get event_start(): string | null {
        return this.Get('event_start');
    }
    set event_start(value: string | null) {
        this.Set('event_start', value);
    }

    /**
    * * Field Name: default_track
    * * Display Name: Default Track
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Default Track (events).
    */
    get default_track(): string | null {
        return this.Get('default_track');
    }
    set default_track(value: string | null) {
        this.Set('default_track', value);
    }

    /**
    * * Field Name: name
    * * Display Name: name
    * * SQL Data Type: nvarchar(812)
    * * Description: The name of the event, has to be unique for the account.
    */
    get name(): string | null {
        return this.Get('name');
    }
    set name(value: string | null) {
        this.Set('name', value);
    }

    /**
    * * Field Name: online_meeting
    * * Display Name: Online Meeting
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The online meeting information for a virtual event.
    */
    get online_meeting(): string | null {
        return this.Get('online_meeting');
    }
    set online_meeting(value: string | null) {
        this.Set('online_meeting', value);
    }

    /**
    * * Field Name: title
    * * Display Name: title
    * * SQL Data Type: nvarchar(812)
    * * Description: The title for the event. The title does not have to be unique for an account.
    */
    get title(): string | null {
        return this.Get('title');
    }
    set title(value: string | null) {
        this.Set('title', value);
    }

    /**
    * * Field Name: currency_type
    * * Display Name: Currency Type
    * * SQL Data Type: nvarchar(812)
    * * Description: The accepted currency for payments. Required for events collecting payments ['AUD','BRL','CAD','CHF','CZK','DKK','EUR','GBP','HKD','HUF','ILS','JPY','MXN','MYR','NOK','NZD','PHP','PLN','RUB','SEK','SGD','THB','TRY','TWD','USD']
    */
    get currency_type(): string | null {
        return this.Get('currency_type');
    }
    set currency_type(value: string | null) {
        this.Set('currency_type', value);
    }

    /**
    * * Field Name: time_zone
    * * Display Name: Time Zone
    * * SQL Data Type: nvarchar(812)
    * * Description: The time zone where the event takes place.
    */
    get time_zone(): string | null {
        return this.Get('time_zone');
    }
    set time_zone(value: string | null) {
        this.Set('time_zone', value);
    }

    /**
    * * Field Name: notify_owner_on_reg
    * * Display Name: Notify Owner On Reg
    * * SQL Data Type: nvarchar(MAX)
    * * Description: If \`true\`, sends an email to the event owner when a registration is made.
    */
    get notify_owner_on_reg(): string | null {
        return this.Get('notify_owner_on_reg');
    }
    set notify_owner_on_reg(value: string | null) {
        this.Set('notify_owner_on_reg', value);
    }

    /**
    * * Field Name: last_update_time
    * * Display Name: Last Update Time
    * * SQL Data Type: nvarchar(812)
    * * Description: The date and time the event was last modified.
    */
    get last_update_time(): string | null {
        return this.Get('last_update_time');
    }
    set last_update_time(value: string | null) {
        this.Set('last_update_time', value);
    }

    /**
    * * Field Name: event_promotions
    * * Display Name: Event Promotions
    * * SQL Data Type: nvarchar(MAX)
    * * Description: List of event promotions.
    */
    get event_promotions(): string | null {
        return this.Get('event_promotions');
    }
    set event_promotions(value: string | null) {
        this.Set('event_promotions', value);
    }

    /**
    * * Field Name: display_time_zone_flag
    * * Display Name: Display Time Zone Flag
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Display the time zone on the registration form and registration confirmation message.
    */
    get display_time_zone_flag(): string | null {
        return this.Get('display_time_zone_flag');
    }
    set display_time_zone_flag(value: string | null) {
        this.Set('display_time_zone_flag', value);
    }

    /**
    * * Field Name: cancelled_time
    * * Display Name: Cancelled Time
    * * SQL Data Type: nvarchar(812)
    * * Description: The time the event was cancelled, in ISO format. Read-only.
    */
    get cancelled_time(): string | null {
        return this.Get('cancelled_time');
    }
    set cancelled_time(value: string | null) {
        this.Set('cancelled_time', value);
    }

    /**
    * * Field Name: display_contact_flag
    * * Display Name: Display Contact Flag
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Display or hide event contact information on the registration form and registration confirmation message.
    */
    get display_contact_flag(): string | null {
        return this.Get('display_contact_flag');
    }
    set display_contact_flag(value: string | null) {
        this.Set('display_contact_flag', value);
    }

    /**
    * * Field Name: location_type
    * * Display Name: Location Type
    * * SQL Data Type: nvarchar(812)
    * * Description: Specifies if the event is physical and/or virtual, or to be determined.
    */
    get location_type(): string | null {
        return this.Get('location_type');
    }
    set location_type(value: string | null) {
        this.Set('location_type', value);
    }

    /**
    * * Field Name: display_on_calendar_flag
    * * Display Name: Display On Calendar Flag
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Display the event on the Event Calendar.
    */
    get display_on_calendar_flag(): string | null {
        return this.Get('display_on_calendar_flag');
    }
    set display_on_calendar_flag(value: string | null) {
        this.Set('display_on_calendar_flag', value);
    }

    /**
    * * Field Name: event_end
    * * Display Name: Event End
    * * SQL Data Type: nvarchar(812)
    * * Description: The date the event ends.
    */
    get event_end(): string | null {
        return this.Get('event_end');
    }
    set event_end(value: string | null) {
        this.Set('event_end', value);
    }

    /**
    * * Field Name: description
    * * Display Name: description
    * * SQL Data Type: nvarchar(900)
    * * Description: Provides the event description.
    */
    get description(): string | null {
        return this.Get('description');
    }
    set description(value: string | null) {
        this.Set('description', value);
    }

    /**
    * * Field Name: event_type
    * * Display Name: Event Type
    * * SQL Data Type: nvarchar(812)
    * * Description: Identifies the event type.
    */
    get event_type(): string | null {
        return this.Get('event_type');
    }
    set event_type(value: string | null) {
        this.Set('event_type', value);
    }

    /**
    * * Field Name: registration_url
    * * Display Name: Registration Url
    * * SQL Data Type: nvarchar(812)
    * * Description: The event registration URL.
    */
    get registration_url(): string | null {
        return this.Get('registration_url');
    }
    set registration_url(value: string | null) {
        this.Set('registration_url', value);
    }

    /**
    * * Field Name: event_code
    * * Display Name: Event Code
    * * SQL Data Type: nvarchar(812)
    * * Description: The short code to use for the event.
    */
    get event_code(): string | null {
        return this.Get('event_code');
    }
    set event_code(value: string | null) {
        this.Set('event_code', value);
    }

    /**
    * * Field Name: active_time
    * * Display Name: Active Time
    * * SQL Data Type: nvarchar(812)
    * * Description: The time the event was published, in ISO format.
    */
    get active_time(): string | null {
        return this.Get('active_time');
    }
    set active_time(value: string | null) {
        this.Set('active_time', value);
    }

    /**
    * * Field Name: event_widget_url
    * * Display Name: Event Widget Url
    * * SQL Data Type: nvarchar(812)
    * * Description: The event widget URL.
    */
    get event_widget_url(): string | null {
        return this.Get('event_widget_url');
    }
    set event_widget_url(value: string | null) {
        this.Set('event_widget_url', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Events Copies - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: events_copy
 * * Base View: vwEvents_copies
 * * @description POST (copy) an existing event.
 * * Primary Key: event_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Events Copies')
export class constantcontactevents_copyEntity extends BaseEntity<constantcontactevents_copyEntityType> {
    /**
    * Loads the Events Copies record from the database
    * @param event_id: string - primary key value to load the Events Copies record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactevents_copyEntity
    * @method
    * @override
    */
    public async Load(event_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'event_id', Value: event_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: display_on_calendar_flag
    * * Display Name: Display On Calendar Flag
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Display the event on the Event Calendar.
    */
    get display_on_calendar_flag(): string | null {
        return this.Get('display_on_calendar_flag');
    }
    set display_on_calendar_flag(value: string | null) {
        this.Set('display_on_calendar_flag', value);
    }

    /**
    * * Field Name: title
    * * Display Name: title
    * * SQL Data Type: nvarchar(400)
    * * Description: The title for the event. The title does not have to be unique for an account.
    */
    get title(): string | null {
        return this.Get('title');
    }
    set title(value: string | null) {
        this.Set('title', value);
    }

    /**
    * * Field Name: default_track
    * * Display Name: Default Track
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Default Track (events_copy).
    */
    get default_track(): string | null {
        return this.Get('default_track');
    }
    set default_track(value: string | null) {
        this.Set('default_track', value);
    }

    /**
    * * Field Name: deleted_time
    * * Display Name: Deleted Time
    * * SQL Data Type: nvarchar(255)
    * * Description: The time the event was deleted, in ISO format. Read-only.
    */
    get deleted_time(): string | null {
        return this.Get('deleted_time');
    }
    set deleted_time(value: string | null) {
        this.Set('deleted_time', value);
    }

    /**
    * * Field Name: event_type
    * * Display Name: Event Type
    * * SQL Data Type: nvarchar(255)
    * * Description: Identifies the event type.
    */
    get event_type(): string | null {
        return this.Get('event_type');
    }
    set event_type(value: string | null) {
        this.Set('event_type', value);
    }

    /**
    * * Field Name: display_time_zone_flag
    * * Display Name: Display Time Zone Flag
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Display the time zone on the registration form and registration confirmation message.
    */
    get display_time_zone_flag(): string | null {
        return this.Get('display_time_zone_flag');
    }
    set display_time_zone_flag(value: string | null) {
        this.Set('display_time_zone_flag', value);
    }

    /**
    * * Field Name: event_code
    * * Display Name: Event Code
    * * SQL Data Type: nvarchar(255)
    * * Description: The short code to use for the event.
    */
    get event_code(): string | null {
        return this.Get('event_code');
    }
    set event_code(value: string | null) {
        this.Set('event_code', value);
    }

    /**
    * * Field Name: address
    * * Display Name: address
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Address (events_copy).
    */
    get address(): string | null {
        return this.Get('address');
    }
    set address(value: string | null) {
        this.Set('address', value);
    }

    /**
    * * Field Name: time_zone
    * * Display Name: Time Zone
    * * SQL Data Type: nvarchar(255)
    * * Description: The time zone where the event takes place.
    */
    get time_zone(): string | null {
        return this.Get('time_zone');
    }
    set time_zone(value: string | null) {
        this.Set('time_zone', value);
    }

    /**
    * * Field Name: event_id
    * * Display Name: Event Id
    * * SQL Data Type: nvarchar(255)
    * * Related Entity/Foreign Key: Events (vwEvents.event_id)
    * * Description: The ID that uniquely identifies the event.
    */
    get event_id(): string | null {
        return this.Get('event_id');
    }
    set event_id(value: string | null) {
        this.Set('event_id', value);
    }

    /**
    * * Field Name: event_widget_url
    * * Display Name: Event Widget Url
    * * SQL Data Type: nvarchar(255)
    * * Description: The event widget URL.
    */
    get event_widget_url(): string | null {
        return this.Get('event_widget_url');
    }
    set event_widget_url(value: string | null) {
        this.Set('event_widget_url', value);
    }

    /**
    * * Field Name: last_update_time
    * * Display Name: Last Update Time
    * * SQL Data Type: nvarchar(255)
    * * Description: The date and time the event was last modified.
    */
    get last_update_time(): string | null {
        return this.Get('last_update_time');
    }
    set last_update_time(value: string | null) {
        this.Set('last_update_time', value);
    }

    /**
    * * Field Name: event_start
    * * Display Name: Event Start
    * * SQL Data Type: nvarchar(255)
    * * Description: The date the event starts.
    */
    get event_start(): string | null {
        return this.Get('event_start');
    }
    set event_start(value: string | null) {
        this.Set('event_start', value);
    }

    /**
    * * Field Name: create_time
    * * Display Name: Create Time
    * * SQL Data Type: nvarchar(255)
    * * Description: The time the event was created, in ISO format. Read-only.
    */
    get create_time(): string | null {
        return this.Get('create_time');
    }
    set create_time(value: string | null) {
        this.Set('create_time', value);
    }

    /**
    * * Field Name: event_promotions
    * * Display Name: Event Promotions
    * * SQL Data Type: nvarchar(MAX)
    * * Description: List of event promotions.
    */
    get event_promotions(): string | null {
        return this.Get('event_promotions');
    }
    set event_promotions(value: string | null) {
        this.Set('event_promotions', value);
    }

    /**
    * * Field Name: description
    * * Display Name: description
    * * SQL Data Type: nvarchar(900)
    * * Description: Provides the event description.
    */
    get description(): string | null {
        return this.Get('description');
    }
    set description(value: string | null) {
        this.Set('description', value);
    }

    /**
    * * Field Name: location_type
    * * Display Name: Location Type
    * * SQL Data Type: nvarchar(255)
    * * Description: Specifies if the event is physical and/or virtual, or to be determined.
    */
    get location_type(): string | null {
        return this.Get('location_type');
    }
    set location_type(value: string | null) {
        this.Set('location_type', value);
    }

    /**
    * * Field Name: failed_campaign_activities
    * * Display Name: Failed Campaign Activities
    * * SQL Data Type: nvarchar(MAX)
    * * Description: List of failed campaign activities.
    */
    get failed_campaign_activities(): string | null {
        return this.Get('failed_campaign_activities');
    }
    set failed_campaign_activities(value: string | null) {
        this.Set('failed_campaign_activities', value);
    }

    /**
    * * Field Name: active_time
    * * Display Name: Active Time
    * * SQL Data Type: nvarchar(255)
    * * Description: The time the event was published, in ISO format.
    */
    get active_time(): string | null {
        return this.Get('active_time');
    }
    set active_time(value: string | null) {
        this.Set('active_time', value);
    }

    /**
    * * Field Name: campaign_id
    * * Display Name: Campaign Id
    * * SQL Data Type: nvarchar(255)
    * * Related Entity/Foreign Key: Emails (vwEmails.campaign_id)
    * * Description: The system assigned ID that uniquely identifies the event and is identical to the \`event_id\`.
    */
    get campaign_id(): string | null {
        return this.Get('campaign_id');
    }
    set campaign_id(value: string | null) {
        this.Set('campaign_id', value);
    }

    /**
    * * Field Name: name
    * * Display Name: name
    * * SQL Data Type: nvarchar(400)
    * * Description: The name of the event, has to be unique for the account.
    */
    get name(): string | null {
        return this.Get('name');
    }
    set name(value: string | null) {
        this.Set('name', value);
    }

    /**
    * * Field Name: event_calendar_url
    * * Display Name: Event Calendar Url
    * * SQL Data Type: nvarchar(255)
    * * Description: The event calendar URL.
    */
    get event_calendar_url(): string | null {
        return this.Get('event_calendar_url');
    }
    set event_calendar_url(value: string | null) {
        this.Set('event_calendar_url', value);
    }

    /**
    * * Field Name: registration_url
    * * Display Name: Registration Url
    * * SQL Data Type: nvarchar(255)
    * * Description: The event registration URL.
    */
    get registration_url(): string | null {
        return this.Get('registration_url');
    }
    set registration_url(value: string | null) {
        this.Set('registration_url', value);
    }

    /**
    * * Field Name: currency_type
    * * Display Name: Currency Type
    * * SQL Data Type: nvarchar(255)
    * * Description: The accepted currency for payments. Required for events collecting payments ['AUD','BRL','CAD','CHF','CZK','DKK','EUR','GBP','HKD','HUF','ILS','JPY','MXN','MYR','NOK','NZD','PHP','PLN','RUB','SEK','SGD','THB','TRY','TWD','USD']
    */
    get currency_type(): string | null {
        return this.Get('currency_type');
    }
    set currency_type(value: string | null) {
        this.Set('currency_type', value);
    }

    /**
    * * Field Name: eso
    * * Display Name: eso
    * * SQL Data Type: nvarchar(255)
    * * Description: The encrypted SOId.
    */
    get eso(): string | null {
        return this.Get('eso');
    }
    set eso(value: string | null) {
        this.Set('eso', value);
    }

    /**
    * * Field Name: cancelled_time
    * * Display Name: Cancelled Time
    * * SQL Data Type: nvarchar(255)
    * * Description: The time the event was cancelled, in ISO format. Read-only.
    */
    get cancelled_time(): string | null {
        return this.Get('cancelled_time');
    }
    set cancelled_time(value: string | null) {
        this.Set('cancelled_time', value);
    }

    /**
    * * Field Name: display_contact_flag
    * * Display Name: Display Contact Flag
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Display or hide event contact information on the registration form and registration confirmation message.
    */
    get display_contact_flag(): string | null {
        return this.Get('display_contact_flag');
    }
    set display_contact_flag(value: string | null) {
        this.Set('display_contact_flag', value);
    }

    /**
    * * Field Name: event_end
    * * Display Name: Event End
    * * SQL Data Type: nvarchar(255)
    * * Description: The date the event ends.
    */
    get event_end(): string | null {
        return this.Get('event_end');
    }
    set event_end(value: string | null) {
        this.Set('event_end', value);
    }

    /**
    * * Field Name: online_meeting
    * * Display Name: Online Meeting
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The online meeting information for a virtual event.
    */
    get online_meeting(): string | null {
        return this.Get('online_meeting');
    }
    set online_meeting(value: string | null) {
        this.Set('online_meeting', value);
    }

    /**
    * * Field Name: display_end_time_flag
    * * Display Name: Display End Time Flag
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Display or hide the event end time on the registration form and registration confirmation message.
    */
    get display_end_time_flag(): string | null {
        return this.Get('display_end_time_flag');
    }
    set display_end_time_flag(value: string | null) {
        this.Set('display_end_time_flag', value);
    }

    /**
    * * Field Name: contact
    * * Display Name: contact
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The contact information associated with the event.
    */
    get contact(): string | null {
        return this.Get('contact');
    }
    set contact(value: string | null) {
        this.Set('contact', value);
    }

    /**
    * * Field Name: status
    * * Display Name: status
    * * SQL Data Type: nvarchar(255)
    * * Description: Specifies the event's current status.
    */
    get status(): string | null {
        return this.Get('status');
    }
    set status(value: string | null) {
        this.Set('status', value);
    }

    /**
    * * Field Name: event_metadata
    * * Display Name: Event Metadata
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Includes additional event information.
    */
    get event_metadata(): string | null {
        return this.Get('event_metadata');
    }
    set event_metadata(value: string | null) {
        this.Set('event_metadata', value);
    }

    /**
    * * Field Name: time_zone_abbreviation
    * * Display Name: Time Zone Abbreviation
    * * SQL Data Type: nvarchar(255)
    * * Description: The abbreviation to use to indicate the time zone where the event takes place.
    */
    get time_zone_abbreviation(): string | null {
        return this.Get('time_zone_abbreviation');
    }
    set time_zone_abbreviation(value: string | null) {
        this.Set('time_zone_abbreviation', value);
    }

    /**
    * * Field Name: notify_owner_on_reg
    * * Display Name: Notify Owner On Reg
    * * SQL Data Type: nvarchar(MAX)
    * * Description: If \`true\`, sends an email to the event owner when a registration is made.
    */
    get notify_owner_on_reg(): string | null {
        return this.Get('notify_owner_on_reg');
    }
    set notify_owner_on_reg(value: string | null) {
        this.Set('notify_owner_on_reg', value);
    }

    /**
    * * Field Name: event_settings
    * * Display Name: Event Settings
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Event Settings (events_copy).
    */
    get event_settings(): string | null {
        return this.Get('event_settings');
    }
    set event_settings(value: string | null) {
        this.Set('event_settings', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Events Registrations - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: events_registrations
 * * Base View: vwEvents_registrations
 * * @description Get a list of registrations for an event.
 * * Primary Key: registration_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Events Registrations')
export class constantcontactevents_registrationsEntity extends BaseEntity<constantcontactevents_registrationsEntityType> {
    /**
    * Loads the Events Registrations record from the database
    * @param registration_id: string - primary key value to load the Events Registrations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactevents_registrationsEntity
    * @method
    * @override
    */
    public async Load(registration_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'registration_id', Value: registration_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: registration_date
    * * Display Name: Registration Date
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The event registration date, in ISO format.
    */
    get registration_date(): string | null {
        return this.Get('registration_date');
    }
    set registration_date(value: string | null) {
        this.Set('registration_date', value);
    }

    /**
    * * Field Name: eligible_checkin_tickets
    * * Display Name: Eligible Checkin Tickets
    * * SQL Data Type: nvarchar(255)
    * * Description: The total number of tickets eligible for checkin.
    */
    get eligible_checkin_tickets(): string | null {
        return this.Get('eligible_checkin_tickets');
    }
    set eligible_checkin_tickets(value: string | null) {
        this.Set('eligible_checkin_tickets', value);
    }

    /**
    * * Field Name: display_physical_tickets
    * * Display Name: Display Physical Tickets
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Determines if the physical tickets should display or not display.
    */
    get display_physical_tickets(): string | null {
        return this.Get('display_physical_tickets');
    }
    set display_physical_tickets(value: string | null) {
        this.Set('display_physical_tickets', value);
    }

    /**
    * * Field Name: contact_id
    * * Display Name: Contact Id
    * * SQL Data Type: nvarchar(255)
    * * Related Entity/Foreign Key: Contacts (vwContacts.contact_id)
    * * Description: The unique ID used to identify a contact.
    */
    get contact_id(): string | null {
        return this.Get('contact_id');
    }
    set contact_id(value: string | null) {
        this.Set('contact_id', value);
    }

    /**
    * * Field Name: contact
    * * Display Name: contact
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Contact (events_registrations).
    */
    get contact(): string | null {
        return this.Get('contact');
    }
    set contact(value: string | null) {
        this.Set('contact', value);
    }

    /**
    * * Field Name: registration_id
    * * Display Name: Registration Id
    * * SQL Data Type: nvarchar(255)
    * * Description: The unique ID used to identify an event registration.
    */
    get registration_id(): string | null {
        return this.Get('registration_id');
    }
    set registration_id(value: string | null) {
        this.Set('registration_id', value);
    }

    /**
    * * Field Name: checkedIn_tickets
    * * Display Name: Checked In Tickets
    * * SQL Data Type: nvarchar(255)
    * * Description: The total number of tickets assigned to a given registration_id.
    */
    get checkedIn_tickets(): string | null {
        return this.Get('checkedIn_tickets');
    }
    set checkedIn_tickets(value: string | null) {
        this.Set('checkedIn_tickets', value);
    }

    /**
    * * Field Name: registration_status
    * * Display Name: Registration Status
    * * SQL Data Type: nvarchar(255)
    * * Description: Provides the current registration status; REGISTERED, PENDING, CANCELED, EXPIRED, IN_PROGRESS, FAILED.
    */
    get registration_status(): string | null {
        return this.Get('registration_status');
    }
    set registration_status(value: string | null) {
        this.Set('registration_status', value);
    }

    /**
    * * Field Name: checkin_status
    * * Display Name: Checkin Status
    * * SQL Data Type: nvarchar(255)
    * * Description: Provides the status of eligible checkin tickets.
    */
    get checkin_status(): string | null {
        return this.Get('checkin_status');
    }
    set checkin_status(value: string | null) {
        this.Set('checkin_status', value);
    }

    /**
    * * Field Name: order_summary
    * * Display Name: Order Summary
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Order Summary (events_registrations).
    */
    get order_summary(): string | null {
        return this.Get('order_summary');
    }
    set order_summary(value: string | null) {
        this.Set('order_summary', value);
    }

    /**
    * * Field Name: tickets
    * * Display Name: tickets
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Tickets (events_registrations).
    */
    get tickets(): string | null {
        return this.Get('tickets');
    }
    set tickets(value: string | null) {
        this.Set('tickets', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Segments - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: segments
 * * Base View: vwSegments
 * * @description GET all Segments
 * * Primary Key: segment_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Segments')
export class constantcontactsegmentsEntity extends BaseEntity<constantcontactsegmentsEntityType> {
    /**
    * Loads the Segments record from the database
    * @param segment_id: string - primary key value to load the Segments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactsegmentsEntity
    * @method
    * @override
    */
    public async Load(segment_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'segment_id', Value: segment_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: created_at
    * * Display Name: Created At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The system generated date and time (ISO-8601) that the segment was created.
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: edited_at
    * * Display Name: Edited At
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The system generated date and time (ISO-8601) that the segment's name or  segment_criteria was last updated.
    */
    get edited_at(): string | null {
        return this.Get('edited_at');
    }
    set edited_at(value: string | null) {
        this.Set('edited_at', value);
    }

    /**
    * * Field Name: segment_id
    * * Display Name: Segment Id
    * * SQL Data Type: nvarchar(450)
    * * Description: The system generated number that uniquely identifies the segment.
    */
    get segment_id(): string | null {
        return this.Get('segment_id');
    }
    set segment_id(value: string | null) {
        this.Set('segment_id', value);
    }

    /**
    * * Field Name: name
    * * Display Name: name
    * * SQL Data Type: nvarchar(812)
    * * Description: The segment's unique descriptive name.
    */
    get name(): string | null {
        return this.Get('name');
    }
    set name(value: string | null) {
        this.Set('name', value);
    }

    /**
    * * Field Name: segment_criteria
    * * Display Name: Segment Criteria
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The segment's contact selection criteria formatted as single-string escaped JSON.
    */
    get segment_criteria(): string | null {
        return this.Get('segment_criteria');
    }
    set segment_criteria(value: string | null) {
        this.Set('segment_criteria', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Social Connections - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: social_connections
 * * Base View: vwSocial_connections
 * * @description GET social network connections
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Social Connections')
export class constantcontactsocial_connectionsEntity extends BaseEntity<constantcontactsocial_connectionsEntityType> {
    /**
    * Loads the Social Connections record from the database
    * @param ID: string - primary key value to load the Social Connections record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactsocial_connectionsEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: account_info
    * * Display Name: Account Info
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Account information for this connection.
    */
    get account_info(): string | null {
        return this.Get('account_info');
    }
    set account_info(value: string | null) {
        this.Set('account_info', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: nvarchar(450)
    */
    get ID(): string | null {
        return this.Get('ID');
    }
    set ID(value: string | null) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: connection_status
    * * Display Name: Connection Status
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Status details for this connection.
    */
    get connection_status(): string | null {
        return this.Get('connection_status');
    }
    set connection_status(value: string | null) {
        this.Set('connection_status', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Social Hashtag Groups - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: social_hashtag_groups
 * * Base View: vwSocial_hashtag_groups
 * * @description GET hashtag groups
 * * Primary Key: hashtag_group_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Social Hashtag Groups')
export class constantcontactsocial_hashtag_groupsEntity extends BaseEntity<constantcontactsocial_hashtag_groupsEntityType> {
    /**
    * Loads the Social Hashtag Groups record from the database
    * @param hashtag_group_id: string - primary key value to load the Social Hashtag Groups record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactsocial_hashtag_groupsEntity
    * @method
    * @override
    */
    public async Load(hashtag_group_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'hashtag_group_id', Value: hashtag_group_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: hashtag_group_id
    * * Display Name: Hashtag Group Id
    * * SQL Data Type: nvarchar(450)
    * * Description: Unique identifier for this hashtag group. Automatically generated on creation and returned in all responses.
    */
    get hashtag_group_id(): string | null {
        return this.Get('hashtag_group_id');
    }
    set hashtag_group_id(value: string | null) {
        this.Set('hashtag_group_id', value);
    }

    /**
    * * Field Name: hashtag_group_name
    * * Display Name: Hashtag Group Name
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The human-readable name for this group. This name will be sanitized before saving, which may include trimming whitespace, truncation, and/or removing invalid characters. If the sanitized name results in a blank string, it will not be able to be saved, and any create or update operation will fail.The name is currently limited to a maximum of 150 characters, but the effective length may be shorter, depending on whether special characters (such as emoji) are used.
    */
    get hashtag_group_name(): string | null {
        return this.Get('hashtag_group_name');
    }
    set hashtag_group_name(value: string | null) {
        this.Set('hashtag_group_name', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: hashtag_names
    * * Display Name: Hashtag Names
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The list of hashtag names for this group. Hashtag names do not include any leading '#' character. They can only consist of alphanumeric characters and '_' (underscore). The hashtag name cannot begin or end with an underscore. Hashtag names may begin with a letter or a number, and may consist of only numbers. Hashtag names are currently limited to a maximum of 30 characters.The list order is preserved. If duplicates exist, they will be removed when saving, and the first occurrence will 
    */
    get hashtag_names(): string | null {
        return this.Get('hashtag_names');
    }
    set hashtag_names(value: string | null) {
        this.Set('hashtag_names', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Social Posts - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: social_posts
 * * Base View: vwSocial_posts
 * * @description POST (create) a social media post
 * * Primary Key: campaign_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Social Posts')
export class constantcontactsocial_postsEntity extends BaseEntity<constantcontactsocial_postsEntityType> {
    /**
    * Loads the Social Posts record from the database
    * @param campaign_id: string - primary key value to load the Social Posts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactsocial_postsEntity
    * @method
    * @override
    */
    public async Load(campaign_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'campaign_id', Value: campaign_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: campaign_id
    * * Display Name: Campaign Id
    * * SQL Data Type: nvarchar(450)
    * * Related Entity/Foreign Key: Emails (vwEmails.campaign_id)
    * * Description: Unique identifier for the post campaign. Generated by the server on creation. Use this value to reference the post in subsequent requests.
    */
    get campaign_id(): string | null {
        return this.Get('campaign_id');
    }
    set campaign_id(value: string | null) {
        this.Set('campaign_id', value);
    }

    /**
    * * Field Name: status
    * * Display Name: status
    * * SQL Data Type: nvarchar(812)
    * * Description: The current status of the post. Possible values include:

  DRAFT — saved without being scheduled for publication
  SCHEDULED — scheduled for future publication at scheduled_time
  EXECUTING — currently being published
  ACTIVE — the post has been published and is active on the social network
  PAUSED — publication has been paused
  SUSPENDED — publication has been suspended
  REMOVED — the post has been removed
  DONE — publication has completed
  ERROR — publication encountered an er
    */
    get status(): string | null {
        return this.Get('status');
    }
    set status(value: string | null) {
        this.Set('status', value);
    }

    /**
    * * Field Name: profile_posts
    * * Display Name: Profile Posts
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The list of per-profile posts that make up this campaign.
    */
    get profile_posts(): string | null {
        return this.Get('profile_posts');
    }
    set profile_posts(value: string | null) {
        this.Set('profile_posts', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: name
    * * Display Name: name
    * * SQL Data Type: nvarchar(812)
    * * Description: Campaign name for this post. The value provided on creation is sanitized before saving, so the returned value may not exactly match what was sent.
    */
    get name(): string | null {
        return this.Get('name');
    }
    set name(value: string | null) {
        this.Set('name', value);
    }

    /**
    * * Field Name: scheduled_time
    * * Display Name: Scheduled Time
    * * SQL Data Type: nvarchar(812)
    * * Description: The date and time to publish the post, in ISO-8601 format. Only set when status is SCHEDULED.
    */
    get scheduled_time(): string | null {
        return this.Get('scheduled_time');
    }
    set scheduled_time(value: string | null) {
        this.Set('scheduled_time', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
 * Social Profiles - strongly typed entity sub-class
 * * Schema: constant_contact
 * * Base Table: social_profiles
 * * Base View: vwSocial_profiles
 * * @description GET social media profiles
 * * Primary Key: profile_id
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Social Profiles')
export class constantcontactsocial_profilesEntity extends BaseEntity<constantcontactsocial_profilesEntityType> {
    /**
    * Loads the Social Profiles record from the database
    * @param profile_id: string - primary key value to load the Social Profiles record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof constantcontactsocial_profilesEntity
    * @method
    * @override
    */
    public async Load(profile_id: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'profile_id', Value: profile_id });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: name
    * * Display Name: name
    * * SQL Data Type: nvarchar(812)
    * * Description: Display name of the profile.
    */
    get name(): string | null {
        return this.Get('name');
    }
    set name(value: string | null) {
        this.Set('name', value);
    }

    /**
    * * Field Name: account_info
    * * Display Name: Account Info
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Account Info (social_profiles).
    */
    get account_info(): string | null {
        return this.Get('account_info');
    }
    set account_info(value: string | null) {
        this.Set('account_info', value);
    }

    /**
    * * Field Name: mj_e2e_custom_attr
    * * Display Name: Mj E 2e Custom Attr
    * * SQL Data Type: nvarchar(812)
    */
    get mj_e2e_custom_attr(): string | null {
        return this.Get('mj_e2e_custom_attr');
    }
    set mj_e2e_custom_attr(value: string | null) {
        this.Set('mj_e2e_custom_attr', value);
    }

    /**
    * * Field Name: handle
    * * Display Name: handle
    * * SQL Data Type: nvarchar(812)
    * * Description: The profile's handle on the social network (for example, an Instagram or TikTok username). May be null if the network does not expose a separate handle (for example, Facebook).
    */
    get handle(): string | null {
        return this.Get('handle');
    }
    set handle(value: string | null) {
        this.Set('handle', value);
    }

    /**
    * * Field Name: settings
    * * Display Name: settings
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Network-specific settings for the profile. Only populated when the request includes include=accessible and settings are available for the network. Currently, only TikTok provides settings: "content": {
  "comment_disabled": Boolean,
  "duet_disabled": Boolean,
  "stitch_disabled": Boolean,
  "max_video_post_duration_sec": Integer
}
    */
    get settings(): string | null {
        return this.Get('settings');
    }
    set settings(value: string | null) {
        this.Set('settings', value);
    }

    /**
    * * Field Name: url
    * * Display Name: url
    * * SQL Data Type: nvarchar(812)
    * * Description: URL to the profile on the social network.
    */
    get url(): string | null {
        return this.Get('url');
    }
    set url(value: string | null) {
        this.Set('url', value);
    }

    /**
    * * Field Name: accessible
    * * Display Name: accessible
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Whether the profile is currently accessible for posting. Publishing a post will fail if its profile is not currently accessible. Only populated when the GET request includes the query parameter include=accessible.
    */
    get accessible(): string | null {
        return this.Get('accessible');
    }
    set accessible(value: string | null) {
        this.Set('accessible', value);
    }

    /**
    * * Field Name: network_user_id
    * * Display Name: Network User Id
    * * SQL Data Type: nvarchar(812)
    * * Description: The social network-specific identifier for the user who owns this profile.
    */
    get network_user_id(): string | null {
        return this.Get('network_user_id');
    }
    set network_user_id(value: string | null) {
        this.Set('network_user_id', value);
    }

    /**
    * * Field Name: connected
    * * Display Name: connected
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Whether this profile is currently connected. You can only create and publish posts with connected profiles.
    */
    get connected(): string | null {
        return this.Get('connected');
    }
    set connected(value: string | null) {
        this.Set('connected', value);
    }

    /**
    * * Field Name: network
    * * Display Name: network
    * * SQL Data Type: nvarchar(812)
    * * Description: The social network this profile belongs to.
    */
    get network(): string | null {
        return this.Get('network');
    }
    set network(value: string | null) {
        this.Set('network', value);
    }

    /**
    * * Field Name: image_url
    * * Display Name: Image Url
    * * SQL Data Type: nvarchar(812)
    * * Description: URL of the profile's image or avatar.
    */
    get image_url(): string | null {
        return this.Get('image_url');
    }
    set image_url(value: string | null) {
        this.Set('image_url', value);
    }

    /**
    * * Field Name: network_profile_id
    * * Display Name: Network Profile Id
    * * SQL Data Type: nvarchar(812)
    * * Description: The social network-specific identifier for this profile.
    */
    get network_profile_id(): string | null {
        return this.Get('network_profile_id');
    }
    set network_profile_id(value: string | null) {
        this.Set('network_profile_id', value);
    }

    /**
    * * Field Name: profile_id
    * * Display Name: Profile Id
    * * SQL Data Type: nvarchar(450)
    * * Description: Unique identifier for this profile. Use this value in the profile_id field of a ProfilePost when creating a post.
    */
    get profile_id(): string | null {
        return this.Get('profile_id');
    }
    set profile_id(value: string | null) {
        this.Set('profile_id', value);
    }

    /**
    * * Field Name: __mj_integration_SyncStatus
    * * Display Name: Mj Integration Sync Status
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
    * * Display Name: Mj Integration Last Synced At
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
    * * Field Name: __mj_integration_LastSyncedSnapshot
    * * Display Name: Mj Integration Last Synced Snapshot
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.
    */
    get __mj_integration_LastSyncedSnapshot(): string | null {
        return this.Get('__mj_integration_LastSyncedSnapshot');
    }
    set __mj_integration_LastSyncedSnapshot(value: string | null) {
        this.Set('__mj_integration_LastSyncedSnapshot', value);
    }

    /**
    * * Field Name: __mj_integration_SyncMessage
    * * Display Name: Mj Integration Sync Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.
    */
    get __mj_integration_SyncMessage(): string | null {
        return this.Get('__mj_integration_SyncMessage');
    }
    set __mj_integration_SyncMessage(value: string | null) {
        this.Set('__mj_integration_SyncMessage', value);
    }

    /**
    * * Field Name: __mj_integration_ContentHash
    * * Display Name: Mj Integration Content Hash
    * * SQL Data Type: nvarchar(64)
    * * Description: SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).
    */
    get __mj_integration_ContentHash(): string | null {
        return this.Get('__mj_integration_ContentHash');
    }
    set __mj_integration_ContentHash(value: string | null) {
        this.Set('__mj_integration_ContentHash', value);
    }

    /**
    * * Field Name: __mj_integration_CustomOverflow
    * * Display Name: Mj Integration Custom Overflow
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.
    */
    get __mj_integration_CustomOverflow(): string | null {
        return this.Get('__mj_integration_CustomOverflow');
    }
    set __mj_integration_CustomOverflow(value: string | null) {
        this.Set('__mj_integration_CustomOverflow', value);
    }

    /**
    * * Field Name: __mj_integration_ExternalVersion
    * * Display Name: Mj Integration External Version
    * * SQL Data Type: nvarchar(255)
    * * Description: The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.
    */
    get __mj_integration_ExternalVersion(): string | null {
        return this.Get('__mj_integration_ExternalVersion');
    }
    set __mj_integration_ExternalVersion(value: string | null) {
        this.Set('__mj_integration_ExternalVersion', value);
    }

    /**
    * * Field Name: __mj_integration_LastSeenModifiedValue
    * * Display Name: Mj Integration Last Seen Modified Value
    * * SQL Data Type: nvarchar(255)
    * * Description: The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).
    */
    get __mj_integration_LastSeenModifiedValue(): string | null {
        return this.Get('__mj_integration_LastSeenModifiedValue');
    }
    set __mj_integration_LastSeenModifiedValue(value: string | null) {
        this.Set('__mj_integration_LastSeenModifiedValue', value);
    }

    /**
    * * Field Name: __mj_integration_LastReconciledAt
    * * Display Name: Mj Integration Last Reconciled At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).
    */
    get __mj_integration_LastReconciledAt(): Date | null {
        return this.Get('__mj_integration_LastReconciledAt');
    }
    set __mj_integration_LastReconciledAt(value: Date | null) {
        this.Set('__mj_integration_LastReconciledAt', value);
    }

    /**
    * * Field Name: __mj_integration_LastWriterDirection
    * * Display Name: Mj Integration Last Writer Direction
    * * SQL Data Type: nvarchar(10)
    * * Description: Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.
    */
    get __mj_integration_LastWriterDirection(): string | null {
        return this.Get('__mj_integration_LastWriterDirection');
    }
    set __mj_integration_LastWriterDirection(value: string | null) {
        this.Set('__mj_integration_LastWriterDirection', value);
    }

    /**
    * * Field Name: __mj_integration_IsTombstoned
    * * Display Name: Mj Integration Is Tombstoned
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.
    */
    get __mj_integration_IsTombstoned(): boolean {
        return this.Get('__mj_integration_IsTombstoned');
    }
    set __mj_integration_IsTombstoned(value: boolean) {
        this.Set('__mj_integration_IsTombstoned', value);
    }

    /**
    * * Field Name: __mj_integration_DeletedDetectedAt
    * * Display Name: Mj Integration Deleted Detected At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.
    */
    get __mj_integration_DeletedDetectedAt(): Date | null {
        return this.Get('__mj_integration_DeletedDetectedAt');
    }
    set __mj_integration_DeletedDetectedAt(value: Date | null) {
        this.Set('__mj_integration_DeletedDetectedAt', value);
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
