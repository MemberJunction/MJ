import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Account Insights
 */
export const AccountInsightSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    AccountID: z.number().describe(`
        * * Field Name: AccountID
        * * Display Name: Account ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Accounts (vwAccounts.ID)`),
    InsightType: z.union([z.literal('Earnings Call'), z.literal('Financial Report'), z.literal('Leadership Change'), z.literal('Manual'), z.literal('Market Analysis'), z.literal('News Article'), z.literal('Patent Filing'), z.literal('Press Release'), z.literal('SEC Filing'), z.literal('Social Media')]).describe(`
        * * Field Name: InsightType
        * * Display Name: Insight Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Earnings Call
    *   * Financial Report
    *   * Leadership Change
    *   * Manual
    *   * Market Analysis
    *   * News Article
    *   * Patent Filing
    *   * Press Release
    *   * SEC Filing
    *   * Social Media
        * * Description: Type of insight (Manual, News Article, SEC Filing, Press Release, Social Media, Financial Report, Market Analysis, Earnings Call, Patent Filing, Leadership Change)`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(500)
        * * Description: Title or headline of the insight`),
    Content: z.string().nullable().describe(`
        * * Field Name: Content
        * * Display Name: Content
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Full content or detailed notes about the insight`),
    SourceURL: z.string().nullable().describe(`
        * * Field Name: SourceURL
        * * Display Name: Source URL
        * * SQL Data Type: nvarchar(500)
        * * Description: URL to the source article, filing, or document`),
    PublishedDate: z.date().nullable().describe(`
        * * Field Name: PublishedDate
        * * Display Name: Published Date
        * * SQL Data Type: datetime
        * * Description: Date the original content was published (not when it was added to CRM)`),
    CreatedAt: z.date().describe(`
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        * * Description: Timestamp when this insight was added to the system`),
    CreatedByContactID: z.number().nullable().describe(`
        * * Field Name: CreatedByContactID
        * * Display Name: Created By Contact ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
        * * Description: Contact who manually created this insight (NULL for AI-generated insights)`),
    Sentiment: z.string().nullable().describe(`
        * * Field Name: Sentiment
        * * Display Name: Sentiment
        * * SQL Data Type: nvarchar(20)
        * * Description: AI-analyzed sentiment of the insight (Positive, Negative, Neutral, Mixed)`),
    Priority: z.string().nullable().describe(`
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: nvarchar(20)
        * * Description: Priority level for follow-up or attention (High, Medium, Low)`),
    Tags: z.string().nullable().describe(`
        * * Field Name: Tags
        * * Display Name: Tags
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON array of tags for categorization and filtering`),
    Summary: z.string().nullable().describe(`
        * * Field Name: Summary
        * * Display Name: Summary
        * * SQL Data Type: nvarchar(2000)
        * * Description: AI-generated concise summary of the content for quick reading`),
    IsArchived: z.boolean().nullable().describe(`
        * * Field Name: IsArchived
        * * Display Name: Is Archived
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this insight has been archived (hidden from default views)`),
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
    Account: z.string().describe(`
        * * Field Name: Account
        * * Display Name: Account
        * * SQL Data Type: nvarchar(100)`),
});

export type AccountInsightEntityType = z.infer<typeof AccountInsightSchema>;

/**
 * zod schema definition for the entity Account Status
 */
export const AccountStatusSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    Name: z.union([z.literal('Active'), z.literal('Closed'), z.literal('Inactive'), z.literal('On Hold')]).describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Closed
    *   * Inactive
    *   * On Hold
        * * Description: Name of the account status`),
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

export type AccountStatusEntityType = z.infer<typeof AccountStatusSchema>;

/**
 * zod schema definition for the entity Account Types
 */
export const AccountTypeSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    Name: z.union([z.literal('Competitor'), z.literal('Customer'), z.literal('Other'), z.literal('Partner'), z.literal('Prospect'), z.literal('Vendor')]).describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Competitor
    *   * Customer
    *   * Other
    *   * Partner
    *   * Prospect
    *   * Vendor
        * * Description: Name of the account type`),
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

export type AccountTypeEntityType = z.infer<typeof AccountTypeSchema>;

/**
 * zod schema definition for the entity Accounts
 */
export const AccountSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Official name of the organization or company`),
    Industry: z.string().nullable().describe(`
        * * Field Name: Industry
        * * Display Name: Industry
        * * SQL Data Type: nvarchar(50)
        * * Description: Industry sector the account belongs to`),
    AnnualRevenue: z.number().nullable().describe(`
        * * Field Name: AnnualRevenue
        * * Display Name: Annual Revenue
        * * SQL Data Type: decimal(18, 2)
        * * Description: Estimated annual revenue of the account in local currency`),
    TickerSymbol: z.string().nullable().describe(`
        * * Field Name: TickerSymbol
        * * Display Name: Ticker Symbol
        * * SQL Data Type: nvarchar(10)
        * * Description: Stock ticker symbol for publicly traded companies`),
    Exchange: z.string().nullable().describe(`
        * * Field Name: Exchange
        * * Display Name: Exchange
        * * SQL Data Type: nvarchar(20)
        * * Description: Stock exchange where company is listed (NYSE, NASDAQ, AMEX, LSE, TSE, HKEX, SSE, Other)`),
    EmployeeCount: z.number().nullable().describe(`
        * * Field Name: EmployeeCount
        * * Display Name: Employee Count
        * * SQL Data Type: int
        * * Description: Approximate number of employees`),
    Founded: z.number().nullable().describe(`
        * * Field Name: Founded
        * * Display Name: Founded
        * * SQL Data Type: int
        * * Description: Year the company was founded`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(255)
        * * Description: Primary website URL of the account`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(20)
        * * Description: Main phone number for the account`),
    Fax: z.string().nullable().describe(`
        * * Field Name: Fax
        * * Display Name: Fax
        * * SQL Data Type: nvarchar(20)
        * * Description: Fax number for the account`),
    BillingStreet: z.string().nullable().describe(`
        * * Field Name: BillingStreet
        * * Display Name: Billing Street
        * * SQL Data Type: nvarchar(100)
        * * Description: Street address for billing`),
    BillingCity: z.string().nullable().describe(`
        * * Field Name: BillingCity
        * * Display Name: Billing City
        * * SQL Data Type: nvarchar(50)
        * * Description: City for billing address`),
    BillingState: z.string().nullable().describe(`
        * * Field Name: BillingState
        * * Display Name: Billing State
        * * SQL Data Type: nvarchar(50)
        * * Description: State/province for billing address`),
    BillingPostalCode: z.string().nullable().describe(`
        * * Field Name: BillingPostalCode
        * * Display Name: Billing Postal Code
        * * SQL Data Type: nvarchar(20)
        * * Description: Postal/ZIP code for billing address`),
    BillingCountry: z.string().nullable().describe(`
        * * Field Name: BillingCountry
        * * Display Name: Billing Country
        * * SQL Data Type: nvarchar(50)
        * * Description: Country for billing address`),
    ShippingStreet: z.string().nullable().describe(`
        * * Field Name: ShippingStreet
        * * Display Name: Shipping Street
        * * SQL Data Type: nvarchar(100)
        * * Description: Street address for shipping`),
    ShippingCity: z.string().nullable().describe(`
        * * Field Name: ShippingCity
        * * Display Name: Shipping City
        * * SQL Data Type: nvarchar(50)
        * * Description: City for shipping address`),
    ShippingState: z.string().nullable().describe(`
        * * Field Name: ShippingState
        * * Display Name: Shipping State
        * * SQL Data Type: nvarchar(50)
        * * Description: State/province for shipping address`),
    ShippingPostalCode: z.string().nullable().describe(`
        * * Field Name: ShippingPostalCode
        * * Display Name: Shipping Postal Code
        * * SQL Data Type: nvarchar(20)
        * * Description: Postal/ZIP code for shipping address`),
    ShippingCountry: z.string().nullable().describe(`
        * * Field Name: ShippingCountry
        * * Display Name: Shipping Country
        * * SQL Data Type: nvarchar(50)
        * * Description: Country for shipping address`),
    AccountType: z.union([z.literal('Competitor'), z.literal('Customer'), z.literal('Other'), z.literal('Partner'), z.literal('Prospect'), z.literal('Vendor')]).nullable().describe(`
        * * Field Name: AccountType
        * * Display Name: Account Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Competitor
    *   * Customer
    *   * Other
    *   * Partner
    *   * Prospect
    *   * Vendor
        * * Description: Type of relationship with the account (Prospect, Customer, etc.)`),
    AccountStatus: z.union([z.literal('Active'), z.literal('Closed'), z.literal('Inactive'), z.literal('On Hold')]).nullable().describe(`
        * * Field Name: AccountStatus
        * * Display Name: Account Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Closed
    *   * Inactive
    *   * On Hold
        * * Description: Current status of the account (Active, Inactive, etc.)`),
    IsActive: z.boolean().nullable().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Indicates whether the account is currently active`),
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

export type AccountEntityType = z.infer<typeof AccountSchema>;

/**
 * zod schema definition for the entity Activities
 */
export const ActivitySchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    AccountID: z.number().nullable().describe(`
        * * Field Name: AccountID
        * * Display Name: Account ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Accounts (vwAccounts.ID)`),
    ContactID: z.number().nullable().describe(`
        * * Field Name: ContactID
        * * Display Name: Contact ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)`),
    ActivityType: z.union([z.literal('Call'), z.literal('Demo'), z.literal('Email'), z.literal('Meeting'), z.literal('Note'), z.literal('Other'), z.literal('Site Visit'), z.literal('Task')]).describe(`
        * * Field Name: ActivityType
        * * Display Name: Activity Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Call
    *   * Demo
    *   * Email
    *   * Meeting
    *   * Note
    *   * Other
    *   * Site Visit
    *   * Task
        * * Description: Type of activity (Call, Email, Meeting, etc.)`),
    Subject: z.string().describe(`
        * * Field Name: Subject
        * * Display Name: Subject
        * * SQL Data Type: nvarchar(200)
        * * Description: Brief description of the activity`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed description or notes about the activity`),
    StartDate: z.date().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: datetime
        * * Description: Date and time when the activity starts`),
    EndDate: z.date().nullable().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: datetime
        * * Description: Date and time when the activity ends`),
    Status: z.union([z.literal('Canceled'), z.literal('Completed'), z.literal('Deferred'), z.literal('In Progress'), z.literal('Planned')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Canceled
    *   * Completed
    *   * Deferred
    *   * In Progress
    *   * Planned
        * * Description: Current status of the activity (Planned, Completed, etc.)`),
    Priority: z.union([z.literal('High'), z.literal('Low'), z.literal('Medium')]).nullable().describe(`
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: nvarchar(10)
    * * Value List Type: List
    * * Possible Values 
    *   * High
    *   * Low
    *   * Medium
        * * Description: Priority level of the activity (High, Medium, Low)`),
    Direction: z.union([z.literal('Inbound'), z.literal('Internal'), z.literal('Outbound')]).nullable().describe(`
        * * Field Name: Direction
        * * Display Name: Direction
        * * SQL Data Type: nvarchar(10)
    * * Value List Type: List
    * * Possible Values 
    *   * Inbound
    *   * Internal
    *   * Outbound
        * * Description: Direction of communication (Inbound, Outbound, Internal)`),
    Location: z.string().nullable().describe(`
        * * Field Name: Location
        * * Display Name: Location
        * * SQL Data Type: nvarchar(100)
        * * Description: Physical or virtual location of the activity`),
    Result: z.string().nullable().describe(`
        * * Field Name: Result
        * * Display Name: Result
        * * SQL Data Type: nvarchar(100)
        * * Description: Outcome or result of the activity`),
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
    Account: z.string().nullable().describe(`
        * * Field Name: Account
        * * Display Name: Account
        * * SQL Data Type: nvarchar(100)`),
});

export type ActivityEntityType = z.infer<typeof ActivitySchema>;

/**
 * zod schema definition for the entity Activity Types
 */
export const ActivityTypeSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    Name: z.union([z.literal('Call'), z.literal('Demo'), z.literal('Email'), z.literal('Meeting'), z.literal('Note'), z.literal('Other'), z.literal('Site Visit'), z.literal('Task')]).describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Call
    *   * Demo
    *   * Email
    *   * Meeting
    *   * Note
    *   * Other
    *   * Site Visit
    *   * Task
        * * Description: Name of the activity type`),
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

export type ActivityTypeEntityType = z.infer<typeof ActivityTypeSchema>;

/**
 * zod schema definition for the entity Contact Relationships
 */
export const ContactRelationshipSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    PrimaryContactID: z.number().describe(`
        * * Field Name: PrimaryContactID
        * * Display Name: Primary Contact ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
        * * Description: ID of the primary contact in the relationship (e.g., the parent)`),
    RelatedContactID: z.number().describe(`
        * * Field Name: RelatedContactID
        * * Display Name: Related Contact ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
        * * Description: ID of the related contact in the relationship (e.g., the child)`),
    RelationshipTypeID: z.number().describe(`
        * * Field Name: RelationshipTypeID
        * * Display Name: Relationship Type ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Relationship Types (vwRelationshipTypes.ID)
        * * Description: ID of the relationship type defining how contacts are related`),
    StartDate: z.date().nullable().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: date
        * * Description: Date when the relationship started`),
    EndDate: z.date().nullable().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: date
        * * Description: Date when the relationship ended (if applicable)`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(500)
        * * Description: Additional notes or details about the relationship`),
    IsActive: z.boolean().nullable().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Indicates whether the relationship is currently active`),
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
    RelationshipType: z.string().describe(`
        * * Field Name: RelationshipType
        * * Display Name: Relationship Type
        * * SQL Data Type: nvarchar(50)`),
});

export type ContactRelationshipEntityType = z.infer<typeof ContactRelationshipSchema>;

/**
 * zod schema definition for the entity Contacts
 */
export const ContactSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    AccountID: z.number().nullable().describe(`
        * * Field Name: AccountID
        * * Display Name: Account ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Accounts (vwAccounts.ID)`),
    Salutation: z.string().nullable().describe(`
        * * Field Name: Salutation
        * * Display Name: Salutation
        * * SQL Data Type: nvarchar(10)
        * * Description: Salutation or title prefix (Mr., Ms., Dr., etc.)`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(50)
        * * Description: First name of the contact`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(50)
        * * Description: Last name of the contact`),
    FullName: z.string().describe(`
        * * Field Name: FullName
        * * Display Name: Full Name
        * * SQL Data Type: nvarchar(101)
        * * Description: Full name of the contact (computed column)`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(100)
        * * Description: Job title of the contact`),
    Department: z.string().nullable().describe(`
        * * Field Name: Department
        * * Display Name: Department
        * * SQL Data Type: nvarchar(100)
        * * Description: Department the contact works in`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(100)
        * * Description: Email address of the contact`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(20)
        * * Description: Primary work phone number of the contact`),
    Mobile: z.string().nullable().describe(`
        * * Field Name: Mobile
        * * Display Name: Mobile
        * * SQL Data Type: nvarchar(20)
        * * Description: Mobile phone number of the contact`),
    ReportsToID: z.number().nullable().describe(`
        * * Field Name: ReportsToID
        * * Display Name: Reports To ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)`),
    MailingStreet: z.string().nullable().describe(`
        * * Field Name: MailingStreet
        * * Display Name: Mailing Street
        * * SQL Data Type: nvarchar(100)
        * * Description: Street address for mailing`),
    MailingCity: z.string().nullable().describe(`
        * * Field Name: MailingCity
        * * Display Name: Mailing City
        * * SQL Data Type: nvarchar(50)
        * * Description: City for mailing address`),
    MailingState: z.string().nullable().describe(`
        * * Field Name: MailingState
        * * Display Name: Mailing State
        * * SQL Data Type: nvarchar(50)
        * * Description: State/province for mailing address`),
    MailingPostalCode: z.string().nullable().describe(`
        * * Field Name: MailingPostalCode
        * * Display Name: Mailing Postal Code
        * * SQL Data Type: nvarchar(20)
        * * Description: Postal/ZIP code for mailing address`),
    MailingCountry: z.string().nullable().describe(`
        * * Field Name: MailingCountry
        * * Display Name: Mailing Country
        * * SQL Data Type: nvarchar(50)
        * * Description: Country for mailing address`),
    BirthDate: z.date().nullable().describe(`
        * * Field Name: BirthDate
        * * Display Name: Birth Date
        * * SQL Data Type: date
        * * Description: Birth date of the contact`),
    PreferredContactMethod: z.union([z.literal('Email'), z.literal('Mail'), z.literal('Mobile'), z.literal('None'), z.literal('Phone')]).nullable().describe(`
        * * Field Name: PreferredContactMethod
        * * Display Name: Preferred Contact Method
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Email
    *   * Mail
    *   * Mobile
    *   * None
    *   * Phone
        * * Description: Preferred method of communication (Email, Phone, Mobile, etc.)`),
    IsActive: z.boolean().nullable().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Indicates whether the contact is currently active`),
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
    Account: z.string().nullable().describe(`
        * * Field Name: Account
        * * Display Name: Account
        * * SQL Data Type: nvarchar(100)`),
    RootReportsToID: z.number().nullable().describe(`
        * * Field Name: RootReportsToID
        * * Display Name: Root Reports To ID
        * * SQL Data Type: int`),
});

export type ContactEntityType = z.infer<typeof ContactSchema>;

/**
 * zod schema definition for the entity Deal Products
 */
export const DealProductSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    DealID: z.number().describe(`
        * * Field Name: DealID
        * * Display Name: Deal ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Deals (vwDeals.ID)`),
    ProductID: z.number().describe(`
        * * Field Name: ProductID
        * * Display Name: Product ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Products (vwProducts.ID)`),
    Quantity: z.number().describe(`
        * * Field Name: Quantity
        * * Display Name: Quantity
        * * SQL Data Type: decimal(18, 4)
        * * Description: Number of units of the product included in the deal`),
    UnitPrice: z.number().describe(`
        * * Field Name: UnitPrice
        * * Display Name: Unit Price
        * * SQL Data Type: decimal(18, 2)
        * * Description: Negotiated price per unit for this deal (may differ from standard price)`),
    Discount: z.number().nullable().describe(`
        * * Field Name: Discount
        * * Display Name: Discount
        * * SQL Data Type: decimal(5, 2)
        * * Default Value: 0
        * * Description: Discount percentage applied to this line item (0-100)`),
    TotalPrice: z.number().nullable().describe(`
        * * Field Name: TotalPrice
        * * Display Name: Total Price
        * * SQL Data Type: numeric(38, 6)
        * * Description: Calculated field: Quantity × UnitPrice × (1 - Discount percentage)`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(500)
        * * Description: Additional notes or specifications for this line item`),
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
    Deal: z.string().describe(`
        * * Field Name: Deal
        * * Display Name: Deal
        * * SQL Data Type: nvarchar(200)`),
    Product: z.string().describe(`
        * * Field Name: Product
        * * Display Name: Product
        * * SQL Data Type: nvarchar(200)`),
});

export type DealProductEntityType = z.infer<typeof DealProductSchema>;

/**
 * zod schema definition for the entity Deals
 */
export const DealSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Descriptive name for the deal or opportunity`),
    AccountID: z.number().describe(`
        * * Field Name: AccountID
        * * Display Name: Account ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Accounts (vwAccounts.ID)`),
    ContactID: z.number().nullable().describe(`
        * * Field Name: ContactID
        * * Display Name: Contact ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)`),
    Stage: z.union([z.literal('Closed Lost'), z.literal('Closed Won'), z.literal('Negotiation'), z.literal('Proposal'), z.literal('Prospecting'), z.literal('Qualification')]).describe(`
        * * Field Name: Stage
        * * Display Name: Stage
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Closed Lost
    *   * Closed Won
    *   * Negotiation
    *   * Proposal
    *   * Prospecting
    *   * Qualification
        * * Description: Current stage in the sales pipeline (Prospecting, Qualification, Proposal, Negotiation, Closed Won, Closed Lost)`),
    Amount: z.number().nullable().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(18, 2)
        * * Description: Total potential value of the deal in local currency`),
    Probability: z.number().nullable().describe(`
        * * Field Name: Probability
        * * Display Name: Probability
        * * SQL Data Type: int
        * * Description: Estimated probability of closing the deal (0-100 percent)`),
    ExpectedRevenue: z.number().nullable().describe(`
        * * Field Name: ExpectedRevenue
        * * Display Name: Expected Revenue
        * * SQL Data Type: numeric(35, 7)
        * * Description: Calculated field: Amount multiplied by Probability percentage`),
    CloseDate: z.date().nullable().describe(`
        * * Field Name: CloseDate
        * * Display Name: Close Date
        * * SQL Data Type: date
        * * Description: Target date for closing the deal`),
    ActualCloseDate: z.date().nullable().describe(`
        * * Field Name: ActualCloseDate
        * * Display Name: Actual Close Date
        * * SQL Data Type: date
        * * Description: Actual date the deal was closed (won or lost)`),
    DealSource: z.union([z.literal('Cold Call'), z.literal('Direct'), z.literal('Marketing Campaign'), z.literal('Other'), z.literal('Partner'), z.literal('Referral'), z.literal('Trade Show'), z.literal('Web')]).nullable().describe(`
        * * Field Name: DealSource
        * * Display Name: Deal Source
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Cold Call
    *   * Direct
    *   * Marketing Campaign
    *   * Other
    *   * Partner
    *   * Referral
    *   * Trade Show
    *   * Web
        * * Description: Origin of the deal (Web, Referral, Cold Call, Trade Show, Marketing Campaign, Partner, Direct, Other)`),
    Competitor: z.string().nullable().describe(`
        * * Field Name: Competitor
        * * Display Name: Competitor
        * * SQL Data Type: nvarchar(100)
        * * Description: Name of competing company or solution being considered`),
    LossReason: z.string().nullable().describe(`
        * * Field Name: LossReason
        * * Display Name: Loss Reason
        * * SQL Data Type: nvarchar(200)
        * * Description: Reason for losing the deal if Stage is Closed Lost`),
    NextStep: z.string().nullable().describe(`
        * * Field Name: NextStep
        * * Display Name: Next Step
        * * SQL Data Type: nvarchar(500)
        * * Description: Description of the next action to be taken for this deal`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed description of the deal, requirements, and notes`),
    OwnerID: z.number().nullable().describe(`
        * * Field Name: OwnerID
        * * Display Name: Owner ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
        * * Description: Sales representative or owner responsible for this deal`),
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
    Account: z.string().describe(`
        * * Field Name: Account
        * * Display Name: Account
        * * SQL Data Type: nvarchar(100)`),
});

export type DealEntityType = z.infer<typeof DealSchema>;

/**
 * zod schema definition for the entity Event Review Tasks
 */
export const EventReviewTaskSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()
        * * Description: Unique identifier for the review task`),
    EventID: z.string().describe(`
        * * Field Name: EventID
        * * Display Name: Event ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Events (vwEvents.ID)
        * * Description: Event this review task is for`),
    SubmissionID: z.string().describe(`
        * * Field Name: SubmissionID
        * * Display Name: Submission ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Submissions (vwSubmissions.ID)
        * * Description: Submission to be reviewed`),
    AssignedToContactID: z.number().nullable().describe(`
        * * Field Name: AssignedToContactID
        * * Display Name: Assigned To Contact ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
        * * Description: CRM Contact ID of assigned reviewer (NULL if unassigned)`),
    Status: z.union([z.literal('Canceled'), z.literal('Completed'), z.literal('In Progress'), z.literal('Pending')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Canceled
    *   * Completed
    *   * In Progress
    *   * Pending
        * * Description: Current status of the review task (Pending, In Progress, Completed, Canceled)`),
    Priority: z.union([z.literal('High'), z.literal('Low'), z.literal('Normal')]).nullable().describe(`
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Normal
    * * Value List Type: List
    * * Possible Values 
    *   * High
    *   * Low
    *   * Normal
        * * Description: Priority level (High, Normal, Low)`),
    DueDate: z.date().nullable().describe(`
        * * Field Name: DueDate
        * * Display Name: Due Date
        * * SQL Data Type: datetime
        * * Description: Due date for completing the review`),
    CompletedAt: z.date().nullable().describe(`
        * * Field Name: CompletedAt
        * * Display Name: Completed At
        * * SQL Data Type: datetime
        * * Description: Timestamp when task was completed`),
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
    Event: z.string().describe(`
        * * Field Name: Event
        * * Display Name: Event
        * * SQL Data Type: nvarchar(200)`),
});

export type EventReviewTaskEntityType = z.infer<typeof EventReviewTaskSchema>;

/**
 * zod schema definition for the entity Events
 */
export const EventSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()
        * * Description: Unique identifier for the event`),
    ParentID: z.string().nullable().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Events (vwEvents.ID)
        * * Description: Parent event ID for multi-day or related events`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Name of the event or conference`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Full description of the event`),
    ConferenceTheme: z.string().nullable().describe(`
        * * Field Name: ConferenceTheme
        * * Display Name: Conference Theme
        * * SQL Data Type: nvarchar(500)
        * * Description: Main theme or focus area of the conference`),
    TargetAudience: z.string().nullable().describe(`
        * * Field Name: TargetAudience
        * * Display Name: Target Audience
        * * SQL Data Type: nvarchar(500)
        * * Description: Description of target audience and their expertise levels`),
    StartDate: z.date().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: datetime
        * * Description: Start date and time of the event`),
    EndDate: z.date().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: datetime
        * * Description: End date and time of the event`),
    Location: z.string().nullable().describe(`
        * * Field Name: Location
        * * Display Name: Location
        * * SQL Data Type: nvarchar(200)
        * * Description: Physical or virtual location of the event`),
    Status: z.union([z.literal('Canceled'), z.literal('Closed'), z.literal('Completed'), z.literal('Open for Submissions'), z.literal('Planning'), z.literal('Review')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Canceled
    *   * Closed
    *   * Completed
    *   * Open for Submissions
    *   * Planning
    *   * Review
        * * Description: Current status of the event (Planning, Open for Submissions, Review, Closed, Completed, Canceled)`),
    SubmissionDeadline: z.date().describe(`
        * * Field Name: SubmissionDeadline
        * * Display Name: Submission Deadline
        * * SQL Data Type: datetime
        * * Description: Deadline for submitting proposals`),
    NotificationDate: z.date().nullable().describe(`
        * * Field Name: NotificationDate
        * * Display Name: Notification Date
        * * SQL Data Type: datetime
        * * Description: Date when speakers will be notified of acceptance/rejection`),
    EvaluationRubric: z.string().nullable().describe(`
        * * Field Name: EvaluationRubric
        * * Display Name: Evaluation Rubric
        * * SQL Data Type: nvarchar(MAX)
        * * Description: AI prompt/rubric for evaluating submissions (JSON or text)`),
    BaselinePassingScore: z.number().nullable().describe(`
        * * Field Name: BaselinePassingScore
        * * Display Name: Baseline Passing Score
        * * SQL Data Type: decimal(5, 2)
        * * Description: Minimum score required to pass initial screening (0-100)`),
    ReviewCommitteeEmails: z.string().nullable().describe(`
        * * Field Name: ReviewCommitteeEmails
        * * Display Name: Review Committee Emails
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON array of review committee member email addresses`),
    TypeformID: z.string().nullable().describe(`
        * * Field Name: TypeformID
        * * Display Name: Typeform ID
        * * SQL Data Type: nvarchar(100)
        * * Description: Typeform form ID for submission intake`),
    TypeformMonitorEnabled: z.boolean().nullable().describe(`
        * * Field Name: TypeformMonitorEnabled
        * * Display Name: Typeform Monitor Enabled
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether automated Typeform monitoring is enabled`),
    TypeformCheckFrequencyMinutes: z.number().nullable().describe(`
        * * Field Name: TypeformCheckFrequencyMinutes
        * * Display Name: Typeform Check Frequency Minutes
        * * SQL Data Type: int
        * * Default Value: 60
        * * Description: How often to check Typeform for new submissions (minutes)`),
    BoxFolderID: z.string().nullable().describe(`
        * * Field Name: BoxFolderID
        * * Display Name: Box Folder ID
        * * SQL Data Type: nvarchar(100)
        * * Description: Box.com folder ID where submission files are stored`),
    SessionFormats: z.string().nullable().describe(`
        * * Field Name: SessionFormats
        * * Display Name: Session Formats
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON array of allowed session formats (Workshop, Keynote, Panel, Lightning Talk, etc.)`),
    AccountID: z.number().nullable().describe(`
        * * Field Name: AccountID
        * * Display Name: Account ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Accounts (vwAccounts.ID)
        * * Description: Optional reference to CRM Account for event organization`),
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
    Parent: z.string().nullable().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(200)`),
    Account: z.string().nullable().describe(`
        * * Field Name: Account
        * * Display Name: Account
        * * SQL Data Type: nvarchar(100)`),
    RootParentID: z.string().nullable().describe(`
        * * Field Name: RootParentID
        * * Display Name: Root Parent ID
        * * SQL Data Type: uniqueidentifier`),
});

export type EventEntityType = z.infer<typeof EventSchema>;

/**
 * zod schema definition for the entity Industries
 */
export const IndustrySchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)
        * * Description: Name of the industry`),
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

export type IndustryEntityType = z.infer<typeof IndustrySchema>;

/**
 * zod schema definition for the entity Invoice Line Items
 */
export const InvoiceLineItemSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    InvoiceID: z.number().describe(`
        * * Field Name: InvoiceID
        * * Display Name: Invoice ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Invoices (vwInvoices.ID)`),
    ProductID: z.number().nullable().describe(`
        * * Field Name: ProductID
        * * Display Name: Product ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Products (vwProducts.ID)`),
    Description: z.string().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)
        * * Description: Description of the product or service being invoiced`),
    Quantity: z.number().describe(`
        * * Field Name: Quantity
        * * Display Name: Quantity
        * * SQL Data Type: decimal(18, 4)
        * * Description: Number of units being invoiced`),
    UnitPrice: z.number().describe(`
        * * Field Name: UnitPrice
        * * Display Name: Unit Price
        * * SQL Data Type: decimal(18, 2)
        * * Description: Price per unit for this line item`),
    Discount: z.number().nullable().describe(`
        * * Field Name: Discount
        * * Display Name: Discount
        * * SQL Data Type: decimal(5, 2)
        * * Default Value: 0
        * * Description: Discount percentage applied to this line item (0-100)`),
    TotalPrice: z.number().nullable().describe(`
        * * Field Name: TotalPrice
        * * Display Name: Total Price
        * * SQL Data Type: numeric(38, 6)
        * * Description: Calculated field: Quantity × UnitPrice × (1 - Discount percentage)`),
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
    Product: z.string().nullable().describe(`
        * * Field Name: Product
        * * Display Name: Product
        * * SQL Data Type: nvarchar(200)`),
});

export type InvoiceLineItemEntityType = z.infer<typeof InvoiceLineItemSchema>;

/**
 * zod schema definition for the entity Invoices
 */
export const InvoiceSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    InvoiceNumber: z.string().describe(`
        * * Field Name: InvoiceNumber
        * * Display Name: Invoice Number
        * * SQL Data Type: nvarchar(50)
        * * Description: Unique invoice identifier for external reference`),
    AccountID: z.number().describe(`
        * * Field Name: AccountID
        * * Display Name: Account ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Accounts (vwAccounts.ID)`),
    DealID: z.number().nullable().describe(`
        * * Field Name: DealID
        * * Display Name: Deal ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Deals (vwDeals.ID)`),
    InvoiceDate: z.date().describe(`
        * * Field Name: InvoiceDate
        * * Display Name: Invoice Date
        * * SQL Data Type: date
        * * Description: Date the invoice was issued`),
    DueDate: z.date().describe(`
        * * Field Name: DueDate
        * * Display Name: Due Date
        * * SQL Data Type: date
        * * Description: Payment due date for the invoice`),
    Status: z.union([z.literal('Cancelled'), z.literal('Draft'), z.literal('Overdue'), z.literal('Paid'), z.literal('Partial'), z.literal('Sent')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Draft
    *   * Overdue
    *   * Paid
    *   * Partial
    *   * Sent
        * * Description: Current status of the invoice (Draft, Sent, Paid, Partial, Overdue, Cancelled)`),
    SubTotal: z.number().describe(`
        * * Field Name: SubTotal
        * * Display Name: Sub Total
        * * SQL Data Type: decimal(18, 2)
        * * Description: Sum of all line items before tax`),
    TaxRate: z.number().nullable().describe(`
        * * Field Name: TaxRate
        * * Display Name: Tax Rate
        * * SQL Data Type: decimal(5, 2)
        * * Default Value: 0
        * * Description: Tax rate percentage to apply to the subtotal`),
    TaxAmount: z.number().nullable().describe(`
        * * Field Name: TaxAmount
        * * Display Name: Tax Amount
        * * SQL Data Type: numeric(30, 9)
        * * Description: Calculated field: SubTotal × TaxRate percentage`),
    TotalAmount: z.number().nullable().describe(`
        * * Field Name: TotalAmount
        * * Display Name: Total Amount
        * * SQL Data Type: numeric(31, 9)
        * * Description: Calculated field: SubTotal + TaxAmount`),
    AmountPaid: z.number().nullable().describe(`
        * * Field Name: AmountPaid
        * * Display Name: Amount Paid
        * * SQL Data Type: decimal(18, 2)
        * * Default Value: 0
        * * Description: Total amount paid against this invoice`),
    BalanceDue: z.number().nullable().describe(`
        * * Field Name: BalanceDue
        * * Display Name: Balance Due
        * * SQL Data Type: numeric(32, 9)
        * * Description: Calculated field: TotalAmount - AmountPaid`),
    Terms: z.string().nullable().describe(`
        * * Field Name: Terms
        * * Display Name: Terms
        * * SQL Data Type: nvarchar(100)
        * * Description: Payment terms (e.g., Net 30, Net 15, Due on Receipt, 2/10 Net 30)`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Additional notes or special instructions for the invoice`),
    BillingStreet: z.string().nullable().describe(`
        * * Field Name: BillingStreet
        * * Display Name: Billing Street
        * * SQL Data Type: nvarchar(100)
        * * Description: Billing address street`),
    BillingCity: z.string().nullable().describe(`
        * * Field Name: BillingCity
        * * Display Name: Billing City
        * * SQL Data Type: nvarchar(50)
        * * Description: Billing address city`),
    BillingState: z.string().nullable().describe(`
        * * Field Name: BillingState
        * * Display Name: Billing State
        * * SQL Data Type: nvarchar(50)
        * * Description: Billing address state or province`),
    BillingPostalCode: z.string().nullable().describe(`
        * * Field Name: BillingPostalCode
        * * Display Name: Billing Postal Code
        * * SQL Data Type: nvarchar(20)
        * * Description: Billing address postal or ZIP code`),
    BillingCountry: z.string().nullable().describe(`
        * * Field Name: BillingCountry
        * * Display Name: Billing Country
        * * SQL Data Type: nvarchar(50)
        * * Description: Billing address country`),
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
    Account: z.string().describe(`
        * * Field Name: Account
        * * Display Name: Account
        * * SQL Data Type: nvarchar(100)`),
    Deal: z.string().nullable().describe(`
        * * Field Name: Deal
        * * Display Name: Deal
        * * SQL Data Type: nvarchar(200)`),
});

export type InvoiceEntityType = z.infer<typeof InvoiceSchema>;

/**
 * zod schema definition for the entity Payments
 */
export const PaymentSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    InvoiceID: z.number().describe(`
        * * Field Name: InvoiceID
        * * Display Name: Invoice ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Invoices (vwInvoices.ID)`),
    PaymentDate: z.date().describe(`
        * * Field Name: PaymentDate
        * * Display Name: Payment Date
        * * SQL Data Type: date
        * * Description: Date the payment was received`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(18, 2)
        * * Description: Amount of the payment in local currency`),
    PaymentMethod: z.union([z.literal('ACH'), z.literal('Cash'), z.literal('Check'), z.literal('Credit Card'), z.literal('Other'), z.literal('Wire Transfer')]).nullable().describe(`
        * * Field Name: PaymentMethod
        * * Display Name: Payment Method
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * ACH
    *   * Cash
    *   * Check
    *   * Credit Card
    *   * Other
    *   * Wire Transfer
        * * Description: Method of payment (Check, Credit Card, Wire Transfer, ACH, Cash, Other)`),
    ReferenceNumber: z.string().nullable().describe(`
        * * Field Name: ReferenceNumber
        * * Display Name: Reference Number
        * * SQL Data Type: nvarchar(100)
        * * Description: Check number, transaction ID, or other payment reference`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(500)
        * * Description: Additional notes about the payment`),
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

export type PaymentEntityType = z.infer<typeof PaymentSchema>;

/**
 * zod schema definition for the entity Products
 */
export const ProductSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    ProductCode: z.string().describe(`
        * * Field Name: ProductCode
        * * Display Name: Product Code
        * * SQL Data Type: nvarchar(50)
        * * Description: Unique identifier code for the product, used in external systems and reports`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Display name of the product or service`),
    Category: z.string().nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)
        * * Description: Product category for grouping and analysis (e.g., Advertising, Sponsorship, Events, Publications)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed description of the product features and benefits`),
    UnitPrice: z.number().describe(`
        * * Field Name: UnitPrice
        * * Display Name: Unit Price
        * * SQL Data Type: decimal(18, 2)
        * * Description: Standard selling price per unit in local currency`),
    Cost: z.number().nullable().describe(`
        * * Field Name: Cost
        * * Display Name: Cost
        * * SQL Data Type: decimal(18, 2)
        * * Description: Internal cost per unit for margin calculations`),
    IsActive: z.boolean().nullable().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Indicates if the product is currently available for sale`),
    SKU: z.string().nullable().describe(`
        * * Field Name: SKU
        * * Display Name: SKU
        * * SQL Data Type: nvarchar(50)
        * * Description: Stock Keeping Unit identifier for inventory tracking`),
    UnitOfMeasure: z.union([z.literal('Each'), z.literal('GB'), z.literal('Hour'), z.literal('License'), z.literal('Subscription'), z.literal('Unit'), z.literal('User')]).nullable().describe(`
        * * Field Name: UnitOfMeasure
        * * Display Name: Unit Of Measure
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Each
    *   * GB
    *   * Hour
    *   * License
    *   * Subscription
    *   * Unit
    *   * User
        * * Description: How the product is measured and sold (Each, Hour, License, Subscription, User, GB, Unit)`),
    RecurringBillingPeriod: z.string().nullable().describe(`
        * * Field Name: RecurringBillingPeriod
        * * Display Name: Recurring Billing Period
        * * SQL Data Type: nvarchar(20)
        * * Description: Billing frequency for subscription products (NULL for one-time, Monthly, Quarterly, Annual, Biannual)`),
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

export type ProductEntityType = z.infer<typeof ProductSchema>;

/**
 * zod schema definition for the entity Relationship Types
 */
export const RelationshipTypeSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)
        * * Description: Name of the relationship type (e.g., Parent, Child, Spouse)`),
    IsBidirectional: z.boolean().describe(`
        * * Field Name: IsBidirectional
        * * Display Name: Is Bidirectional
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Indicates if the relationship is the same in both directions (e.g., Spouse, Friend)`),
    InverseRelationshipID: z.number().nullable().describe(`
        * * Field Name: InverseRelationshipID
        * * Display Name: Inverse Relationship ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Relationship Types (vwRelationshipTypes.ID)
        * * Description: ID of the inverse relationship type (e.g., Parent → Child)`),
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
    InverseRelationship: z.string().nullable().describe(`
        * * Field Name: InverseRelationship
        * * Display Name: Inverse Relationship
        * * SQL Data Type: nvarchar(50)`),
    RootInverseRelationshipID: z.number().nullable().describe(`
        * * Field Name: RootInverseRelationshipID
        * * Display Name: Root Inverse Relationship ID
        * * SQL Data Type: int`),
});

export type RelationshipTypeEntityType = z.infer<typeof RelationshipTypeSchema>;

/**
 * zod schema definition for the entity Speakers
 */
export const SpeakerSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()
        * * Description: Unique identifier for the speaker`),
    ContactID: z.number().nullable().describe(`
        * * Field Name: ContactID
        * * Display Name: Contact ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
        * * Description: Optional reference to CRM Contact record`),
    FullName: z.string().describe(`
        * * Field Name: FullName
        * * Display Name: Full Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Full name of the speaker`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(100)
        * * Description: Primary email address`),
    PhoneNumber: z.string().nullable().describe(`
        * * Field Name: PhoneNumber
        * * Display Name: Phone Number
        * * SQL Data Type: nvarchar(20)
        * * Description: Contact phone number`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(100)
        * * Description: Professional title or position`),
    Organization: z.string().nullable().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(200)
        * * Description: Company or organization affiliation`),
    Bio: z.string().nullable().describe(`
        * * Field Name: Bio
        * * Display Name: Bio
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Speaker biography as submitted`),
    LinkedInURL: z.string().nullable().describe(`
        * * Field Name: LinkedInURL
        * * Display Name: Linked In URL
        * * SQL Data Type: nvarchar(255)
        * * Description: LinkedIn profile URL`),
    TwitterHandle: z.string().nullable().describe(`
        * * Field Name: TwitterHandle
        * * Display Name: Twitter Handle
        * * SQL Data Type: nvarchar(50)
        * * Description: Twitter/X handle`),
    WebsiteURL: z.string().nullable().describe(`
        * * Field Name: WebsiteURL
        * * Display Name: Website URL
        * * SQL Data Type: nvarchar(255)
        * * Description: Personal or professional website URL`),
    PhotoURL: z.string().nullable().describe(`
        * * Field Name: PhotoURL
        * * Display Name: Photo URL
        * * SQL Data Type: nvarchar(255)
        * * Description: URL to speaker headshot or profile photo`),
    SpeakingExperience: z.string().nullable().describe(`
        * * Field Name: SpeakingExperience
        * * Display Name: Speaking Experience
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Description of previous speaking experience as submitted`),
    DossierResearchedAt: z.date().nullable().describe(`
        * * Field Name: DossierResearchedAt
        * * Display Name: Dossier Researched At
        * * SQL Data Type: datetime
        * * Description: Timestamp when AI research was last performed on this speaker`),
    DossierJSON: z.string().nullable().describe(`
        * * Field Name: DossierJSON
        * * Display Name: Dossier JSON
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Comprehensive JSON research results from web searches and social media`),
    DossierSummary: z.string().nullable().describe(`
        * * Field Name: DossierSummary
        * * Display Name: Dossier Summary
        * * SQL Data Type: nvarchar(MAX)
        * * Description: AI-generated summary of speaker background and credibility`),
    CredibilityScore: z.number().nullable().describe(`
        * * Field Name: CredibilityScore
        * * Display Name: Credibility Score
        * * SQL Data Type: decimal(5, 2)
        * * Description: AI-calculated credibility score based on research (0-100)`),
    SpeakingHistory: z.string().nullable().describe(`
        * * Field Name: SpeakingHistory
        * * Display Name: Speaking History
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON array of previous speaking engagements discovered through research`),
    Expertise: z.string().nullable().describe(`
        * * Field Name: Expertise
        * * Display Name: Expertise
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON array of expertise topics and domains`),
    PublicationsCount: z.number().nullable().describe(`
        * * Field Name: PublicationsCount
        * * Display Name: Publications Count
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Number of publications, articles, or blog posts discovered`),
    SocialMediaReach: z.number().nullable().describe(`
        * * Field Name: SocialMediaReach
        * * Display Name: Social Media Reach
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Total social media followers/reach across platforms`),
    RedFlags: z.string().nullable().describe(`
        * * Field Name: RedFlags
        * * Display Name: Red Flags
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON array of any concerns or red flags identified during research`),
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

export type SpeakerEntityType = z.infer<typeof SpeakerSchema>;

/**
 * zod schema definition for the entity Submission Notifications
 */
export const SubmissionNotificationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()
        * * Description: Unique identifier for the notification`),
    SubmissionID: z.string().describe(`
        * * Field Name: SubmissionID
        * * Display Name: Submission ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Submissions (vwSubmissions.ID)
        * * Description: Submission this notification is about`),
    NotificationType: z.union([z.literal('Accepted'), z.literal('Failed Screening'), z.literal('Initial Received'), z.literal('Passed to Review'), z.literal('Rejected'), z.literal('Reminder'), z.literal('Request Resubmission'), z.literal('Waitlisted')]).describe(`
        * * Field Name: NotificationType
        * * Display Name: Notification Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Accepted
    *   * Failed Screening
    *   * Initial Received
    *   * Passed to Review
    *   * Rejected
    *   * Reminder
    *   * Request Resubmission
    *   * Waitlisted
        * * Description: Type of notification (Initial Received, Failed Screening, Passed to Review, Request Resubmission, Accepted, Rejected, Waitlisted, Reminder)`),
    SentAt: z.date().describe(`
        * * Field Name: SentAt
        * * Display Name: Sent At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        * * Description: Timestamp when notification was sent`),
    RecipientEmail: z.string().describe(`
        * * Field Name: RecipientEmail
        * * Display Name: Recipient Email
        * * SQL Data Type: nvarchar(100)
        * * Description: Email address of recipient`),
    Subject: z.string().nullable().describe(`
        * * Field Name: Subject
        * * Display Name: Subject
        * * SQL Data Type: nvarchar(500)
        * * Description: Email subject line`),
    MessageBody: z.string().nullable().describe(`
        * * Field Name: MessageBody
        * * Display Name: Message Body
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Full email message body`),
    DeliveryStatus: z.union([z.literal('Bounced'), z.literal('Delivered'), z.literal('Failed'), z.literal('Pending'), z.literal('Sent')]).nullable().describe(`
        * * Field Name: DeliveryStatus
        * * Display Name: Delivery Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Bounced
    *   * Delivered
    *   * Failed
    *   * Pending
    *   * Sent
        * * Description: Delivery status from email system (Pending, Sent, Delivered, Bounced, Failed)`),
    ClickedAt: z.date().nullable().describe(`
        * * Field Name: ClickedAt
        * * Display Name: Clicked At
        * * SQL Data Type: datetime
        * * Description: Timestamp when recipient clicked a link in the email (for engagement tracking)`),
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

export type SubmissionNotificationEntityType = z.infer<typeof SubmissionNotificationSchema>;

/**
 * zod schema definition for the entity Submission Reviews
 */
export const SubmissionReviewSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()
        * * Description: Unique identifier for the review`),
    SubmissionID: z.string().describe(`
        * * Field Name: SubmissionID
        * * Display Name: Submission ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Submissions (vwSubmissions.ID)
        * * Description: Submission being reviewed`),
    ReviewerContactID: z.number().describe(`
        * * Field Name: ReviewerContactID
        * * Display Name: Reviewer Contact ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
        * * Description: CRM Contact ID of the reviewer`),
    ReviewedAt: z.date().describe(`
        * * Field Name: ReviewedAt
        * * Display Name: Reviewed At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        * * Description: Timestamp when review was submitted`),
    OverallScore: z.number().nullable().describe(`
        * * Field Name: OverallScore
        * * Display Name: Overall Score
        * * SQL Data Type: decimal(3, 1)
        * * Description: Overall score from 0-10`),
    RelevanceScore: z.number().nullable().describe(`
        * * Field Name: RelevanceScore
        * * Display Name: Relevance Score
        * * SQL Data Type: decimal(3, 1)
        * * Description: Relevance to conference theme score (0-10)`),
    QualityScore: z.number().nullable().describe(`
        * * Field Name: QualityScore
        * * Display Name: Quality Score
        * * SQL Data Type: decimal(3, 1)
        * * Description: Quality of abstract and proposed content score (0-10)`),
    SpeakerExperienceScore: z.number().nullable().describe(`
        * * Field Name: SpeakerExperienceScore
        * * Display Name: Speaker Experience Score
        * * SQL Data Type: decimal(3, 1)
        * * Description: Speaker experience and credibility score (0-10)`),
    Comments: z.string().nullable().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Reviewer comments and feedback`),
    Recommendation: z.union([z.literal('Accept'), z.literal('Needs Discussion'), z.literal('Reject'), z.literal('Waitlist')]).nullable().describe(`
        * * Field Name: Recommendation
        * * Display Name: Recommendation
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Accept
    *   * Needs Discussion
    *   * Reject
    *   * Waitlist
        * * Description: Reviewer recommendation (Accept, Reject, Waitlist, Needs Discussion)`),
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

export type SubmissionReviewEntityType = z.infer<typeof SubmissionReviewSchema>;

/**
 * zod schema definition for the entity Submission Speakers
 */
export const SubmissionSpeakerSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()
        * * Description: Unique identifier for the relationship`),
    SubmissionID: z.string().describe(`
        * * Field Name: SubmissionID
        * * Display Name: Submission ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Submissions (vwSubmissions.ID)
        * * Description: Reference to the submission`),
    SpeakerID: z.string().describe(`
        * * Field Name: SpeakerID
        * * Display Name: Speaker ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Speakers (vwSpeakers.ID)
        * * Description: Reference to the speaker`),
    IsPrimaryContact: z.boolean().nullable().describe(`
        * * Field Name: IsPrimaryContact
        * * Display Name: Is Primary Contact
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this speaker is the primary contact for the submission`),
    Role: z.union([z.literal('Co-Presenter'), z.literal('Moderator'), z.literal('Panelist'), z.literal('Presenter')]).nullable().describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Co-Presenter
    *   * Moderator
    *   * Panelist
    *   * Presenter
        * * Description: Role of speaker in this submission (Presenter, Co-Presenter, Moderator, Panelist)`),
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

export type SubmissionSpeakerEntityType = z.infer<typeof SubmissionSpeakerSchema>;

/**
 * zod schema definition for the entity Submissions
 */
export const SubmissionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()
        * * Description: Unique identifier for the submission`),
    EventID: z.string().describe(`
        * * Field Name: EventID
        * * Display Name: Event ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Events (vwEvents.ID)
        * * Description: Event this submission is for`),
    TypeformResponseID: z.string().nullable().describe(`
        * * Field Name: TypeformResponseID
        * * Display Name: Typeform Response ID
        * * SQL Data Type: nvarchar(100)
        * * Description: External response ID from Typeform`),
    SubmittedAt: z.date().describe(`
        * * Field Name: SubmittedAt
        * * Display Name: Submitted At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
        * * Description: Timestamp when submission was received`),
    Status: z.union([z.literal('Accepted'), z.literal('Analyzing'), z.literal('Failed Initial'), z.literal('New'), z.literal('Passed Initial'), z.literal('Rejected'), z.literal('Resubmitted'), z.literal('Under Review'), z.literal('Waitlisted')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: New
    * * Value List Type: List
    * * Possible Values 
    *   * Accepted
    *   * Analyzing
    *   * Failed Initial
    *   * New
    *   * Passed Initial
    *   * Rejected
    *   * Resubmitted
    *   * Under Review
    *   * Waitlisted
        * * Description: Current status in workflow (New, Analyzing, Passed Initial, Failed Initial, Under Review, Accepted, Rejected, Waitlisted, Resubmitted)`),
    SubmissionTitle: z.string().describe(`
        * * Field Name: SubmissionTitle
        * * Display Name: Submission Title
        * * SQL Data Type: nvarchar(500)
        * * Description: Title of the proposed session or talk`),
    SubmissionAbstract: z.string().describe(`
        * * Field Name: SubmissionAbstract
        * * Display Name: Submission Abstract
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Full abstract or proposal text as submitted`),
    SubmissionSummary: z.string().nullable().describe(`
        * * Field Name: SubmissionSummary
        * * Display Name: Submission Summary
        * * SQL Data Type: nvarchar(MAX)
        * * Description: AI-generated concise summary of the abstract`),
    SessionFormat: z.union([z.literal('Keynote'), z.literal('Lightning Talk'), z.literal('Other'), z.literal('Panel'), z.literal('Presentation'), z.literal('Roundtable'), z.literal('Tutorial'), z.literal('Workshop')]).nullable().describe(`
        * * Field Name: SessionFormat
        * * Display Name: Session Format
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Keynote
    *   * Lightning Talk
    *   * Other
    *   * Panel
    *   * Presentation
    *   * Roundtable
    *   * Tutorial
    *   * Workshop
        * * Description: Format of the proposed session (Workshop, Keynote, Panel, Lightning Talk, Tutorial, Presentation, Roundtable, Other)`),
    Duration: z.number().nullable().describe(`
        * * Field Name: Duration
        * * Display Name: Duration
        * * SQL Data Type: int
        * * Description: Duration in minutes`),
    TargetAudienceLevel: z.union([z.literal('Advanced'), z.literal('All Levels'), z.literal('Beginner'), z.literal('Intermediate')]).nullable().describe(`
        * * Field Name: TargetAudienceLevel
        * * Display Name: Target Audience Level
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Advanced
    *   * All Levels
    *   * Beginner
    *   * Intermediate
        * * Description: Target audience expertise level (Beginner, Intermediate, Advanced, All Levels)`),
    KeyTopics: z.string().nullable().describe(`
        * * Field Name: KeyTopics
        * * Display Name: Key Topics
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON array of key topics extracted by AI`),
    PresentationFileURL: z.string().nullable().describe(`
        * * Field Name: PresentationFileURL
        * * Display Name: Presentation File URL
        * * SQL Data Type: nvarchar(500)
        * * Description: URL to presentation file in Box.com`),
    PresentationFileSummary: z.string().nullable().describe(`
        * * Field Name: PresentationFileSummary
        * * Display Name: Presentation File Summary
        * * SQL Data Type: nvarchar(MAX)
        * * Description: AI-generated summary of presentation slides/materials`),
    AdditionalMaterialsURLs: z.string().nullable().describe(`
        * * Field Name: AdditionalMaterialsURLs
        * * Display Name: Additional Materials UR Ls
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON array of additional material URLs`),
    SpecialRequirements: z.string().nullable().describe(`
        * * Field Name: SpecialRequirements
        * * Display Name: Special Requirements
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Any special requirements (AV equipment, accessibility needs, etc.)`),
    AIEvaluationScore: z.number().nullable().describe(`
        * * Field Name: AIEvaluationScore
        * * Display Name: AI Evaluation Score
        * * SQL Data Type: decimal(5, 2)
        * * Description: Overall AI evaluation score (0-100)`),
    AIEvaluationReasoning: z.string().nullable().describe(`
        * * Field Name: AIEvaluationReasoning
        * * Display Name: AI Evaluation Reasoning
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed AI explanation of evaluation and score`),
    AIEvaluationDimensions: z.string().nullable().describe(`
        * * Field Name: AIEvaluationDimensions
        * * Display Name: AI Evaluation Dimensions
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON object with scores per rubric dimension (relevance, quality, experience, etc.)`),
    PassedInitialScreening: z.boolean().nullable().describe(`
        * * Field Name: PassedInitialScreening
        * * Display Name: Passed Initial Screening
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether submission passed baseline screening criteria`),
    FailureReasons: z.string().nullable().describe(`
        * * Field Name: FailureReasons
        * * Display Name: Failure Reasons
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON array of specific failure reasons if screening failed`),
    IsFixable: z.boolean().nullable().describe(`
        * * Field Name: IsFixable
        * * Display Name: Is Fixable
        * * SQL Data Type: bit
        * * Description: Whether identified issues can be fixed via resubmission`),
    ResubmissionOfID: z.string().nullable().describe(`
        * * Field Name: ResubmissionOfID
        * * Display Name: Resubmission Of ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Submissions (vwSubmissions.ID)
        * * Description: Reference to original submission if this is a resubmission`),
    ReviewNotes: z.string().nullable().describe(`
        * * Field Name: ReviewNotes
        * * Display Name: Review Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Notes added by human reviewers during evaluation`),
    FinalDecision: z.string().nullable().describe(`
        * * Field Name: FinalDecision
        * * Display Name: Final Decision
        * * SQL Data Type: nvarchar(50)
        * * Description: Final decision on submission (Accepted, Rejected, Waitlisted)`),
    FinalDecisionDate: z.date().nullable().describe(`
        * * Field Name: FinalDecisionDate
        * * Display Name: Final Decision Date
        * * SQL Data Type: datetime
        * * Description: Date when final decision was made`),
    FinalDecisionReasoning: z.string().nullable().describe(`
        * * Field Name: FinalDecisionReasoning
        * * Display Name: Final Decision Reasoning
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Explanation for final decision`),
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
    Event: z.string().describe(`
        * * Field Name: Event
        * * Display Name: Event
        * * SQL Data Type: nvarchar(200)`),
    RootResubmissionOfID: z.string().nullable().describe(`
        * * Field Name: RootResubmissionOfID
        * * Display Name: Root Resubmission Of ID
        * * SQL Data Type: uniqueidentifier`),
});

export type SubmissionEntityType = z.infer<typeof SubmissionSchema>;
 
 

/**
 * Account Insights - strongly typed entity sub-class
 * * Schema: CRM
 * * Base Table: AccountInsight
 * * Base View: vwAccountInsights
 * * @description Stores research, news, and intelligence gathered about accounts from various sources
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Account Insights')
export class AccountInsightEntity extends BaseEntity<AccountInsightEntityType> {
    /**
    * Loads the Account Insights record from the database
    * @param ID: number - primary key value to load the Account Insights record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AccountInsightEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Account Insights entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Priority: This rule ensures that if a priority is provided, it must be either 'Low', 'Medium', or 'High'. It also allows the priority to be left blank.
    * * Sentiment: This rule ensures that if a sentiment is provided, it must be one of the following values: Mixed, Neutral, Negative, or Positive. The sentiment field can also be left blank.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidatePriorityAgainstAllowedValues(result);
        this.ValidateSentimentAgainstAllowedSet(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * This rule ensures that if a priority is provided, it must be either 'Low', 'Medium', or 'High'. It also allows the priority to be left blank.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidatePriorityAgainstAllowedValues(result: ValidationResult) {
    	if (this.Priority != null && this.Priority !== "Low" && this.Priority !== "Medium" && this.Priority !== "High") {
    		result.Errors.push(new ValidationErrorInfo("Priority", "Priority must be 'Low', 'Medium', or 'High' if specified.", this.Priority, ValidationErrorType.Failure));
    	}
    }

    /**
    * This rule ensures that if a sentiment is provided, it must be one of the following values: Mixed, Neutral, Negative, or Positive. The sentiment field can also be left blank.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateSentimentAgainstAllowedSet(result: ValidationResult) {
    	if (this.Sentiment != null 
    		&& this.Sentiment !== "Mixed" 
    		&& this.Sentiment !== "Neutral" 
    		&& this.Sentiment !== "Negative" 
    		&& this.Sentiment !== "Positive") {
    		result.Errors.push(new ValidationErrorInfo("Sentiment", "Sentiment must be one of: 'Mixed', 'Neutral', 'Negative', or 'Positive'.", this.Sentiment, ValidationErrorType.Failure));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: AccountID
    * * Display Name: Account ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Accounts (vwAccounts.ID)
    */
    get AccountID(): number {
        return this.Get('AccountID');
    }
    set AccountID(value: number) {
        this.Set('AccountID', value);
    }

    /**
    * * Field Name: InsightType
    * * Display Name: Insight Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Earnings Call
    *   * Financial Report
    *   * Leadership Change
    *   * Manual
    *   * Market Analysis
    *   * News Article
    *   * Patent Filing
    *   * Press Release
    *   * SEC Filing
    *   * Social Media
    * * Description: Type of insight (Manual, News Article, SEC Filing, Press Release, Social Media, Financial Report, Market Analysis, Earnings Call, Patent Filing, Leadership Change)
    */
    get InsightType(): 'Earnings Call' | 'Financial Report' | 'Leadership Change' | 'Manual' | 'Market Analysis' | 'News Article' | 'Patent Filing' | 'Press Release' | 'SEC Filing' | 'Social Media' {
        return this.Get('InsightType');
    }
    set InsightType(value: 'Earnings Call' | 'Financial Report' | 'Leadership Change' | 'Manual' | 'Market Analysis' | 'News Article' | 'Patent Filing' | 'Press Release' | 'SEC Filing' | 'Social Media') {
        this.Set('InsightType', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(500)
    * * Description: Title or headline of the insight
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Content
    * * Display Name: Content
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Full content or detailed notes about the insight
    */
    get Content(): string | null {
        return this.Get('Content');
    }
    set Content(value: string | null) {
        this.Set('Content', value);
    }

    /**
    * * Field Name: SourceURL
    * * Display Name: Source URL
    * * SQL Data Type: nvarchar(500)
    * * Description: URL to the source article, filing, or document
    */
    get SourceURL(): string | null {
        return this.Get('SourceURL');
    }
    set SourceURL(value: string | null) {
        this.Set('SourceURL', value);
    }

    /**
    * * Field Name: PublishedDate
    * * Display Name: Published Date
    * * SQL Data Type: datetime
    * * Description: Date the original content was published (not when it was added to CRM)
    */
    get PublishedDate(): Date | null {
        return this.Get('PublishedDate');
    }
    set PublishedDate(value: Date | null) {
        this.Set('PublishedDate', value);
    }

    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    * * Description: Timestamp when this insight was added to the system
    */
    get CreatedAt(): Date {
        return this.Get('CreatedAt');
    }
    set CreatedAt(value: Date) {
        this.Set('CreatedAt', value);
    }

    /**
    * * Field Name: CreatedByContactID
    * * Display Name: Created By Contact ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    * * Description: Contact who manually created this insight (NULL for AI-generated insights)
    */
    get CreatedByContactID(): number | null {
        return this.Get('CreatedByContactID');
    }
    set CreatedByContactID(value: number | null) {
        this.Set('CreatedByContactID', value);
    }

    /**
    * * Field Name: Sentiment
    * * Display Name: Sentiment
    * * SQL Data Type: nvarchar(20)
    * * Description: AI-analyzed sentiment of the insight (Positive, Negative, Neutral, Mixed)
    */
    get Sentiment(): string | null {
        return this.Get('Sentiment');
    }
    set Sentiment(value: string | null) {
        this.Set('Sentiment', value);
    }

    /**
    * * Field Name: Priority
    * * Display Name: Priority
    * * SQL Data Type: nvarchar(20)
    * * Description: Priority level for follow-up or attention (High, Medium, Low)
    */
    get Priority(): string | null {
        return this.Get('Priority');
    }
    set Priority(value: string | null) {
        this.Set('Priority', value);
    }

    /**
    * * Field Name: Tags
    * * Display Name: Tags
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON array of tags for categorization and filtering
    */
    get Tags(): string | null {
        return this.Get('Tags');
    }
    set Tags(value: string | null) {
        this.Set('Tags', value);
    }

    /**
    * * Field Name: Summary
    * * Display Name: Summary
    * * SQL Data Type: nvarchar(2000)
    * * Description: AI-generated concise summary of the content for quick reading
    */
    get Summary(): string | null {
        return this.Get('Summary');
    }
    set Summary(value: string | null) {
        this.Set('Summary', value);
    }

    /**
    * * Field Name: IsArchived
    * * Display Name: Is Archived
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this insight has been archived (hidden from default views)
    */
    get IsArchived(): boolean | null {
        return this.Get('IsArchived');
    }
    set IsArchived(value: boolean | null) {
        this.Set('IsArchived', value);
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

    /**
    * * Field Name: Account
    * * Display Name: Account
    * * SQL Data Type: nvarchar(100)
    */
    get Account(): string {
        return this.Get('Account');
    }
}


/**
 * Account Status - strongly typed entity sub-class
 * * Schema: CRM
 * * Base Table: AccountStatus
 * * Base View: vwAccountStatus
 * * @description Lookup table for standardizing account status values
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Account Status')
export class AccountStatusEntity extends BaseEntity<AccountStatusEntityType> {
    /**
    * Loads the Account Status record from the database
    * @param ID: number - primary key value to load the Account Status record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AccountStatusEntity
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

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Closed
    *   * Inactive
    *   * On Hold
    * * Description: Name of the account status
    */
    get Name(): 'Active' | 'Closed' | 'Inactive' | 'On Hold' {
        return this.Get('Name');
    }
    set Name(value: 'Active' | 'Closed' | 'Inactive' | 'On Hold') {
        this.Set('Name', value);
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
 * Account Types - strongly typed entity sub-class
 * * Schema: CRM
 * * Base Table: AccountType
 * * Base View: vwAccountTypes
 * * @description Lookup table for standardizing account type values
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Account Types')
export class AccountTypeEntity extends BaseEntity<AccountTypeEntityType> {
    /**
    * Loads the Account Types record from the database
    * @param ID: number - primary key value to load the Account Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AccountTypeEntity
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

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Competitor
    *   * Customer
    *   * Other
    *   * Partner
    *   * Prospect
    *   * Vendor
    * * Description: Name of the account type
    */
    get Name(): 'Competitor' | 'Customer' | 'Other' | 'Partner' | 'Prospect' | 'Vendor' {
        return this.Get('Name');
    }
    set Name(value: 'Competitor' | 'Customer' | 'Other' | 'Partner' | 'Prospect' | 'Vendor') {
        this.Set('Name', value);
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
 * Accounts - strongly typed entity sub-class
 * * Schema: CRM
 * * Base Table: Account
 * * Base View: vwAccounts
 * * @description Stores information about customer organizations and companies
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Accounts')
export class AccountEntity extends BaseEntity<AccountEntityType> {
    /**
    * Loads the Accounts record from the database
    * @param ID: number - primary key value to load the Accounts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AccountEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Accounts entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Exchange: This rule ensures that the Exchange field, if provided, must be either 'Other', 'SSE', 'HKEX', 'TSE', 'LSE', 'AMEX', 'NASDAQ', 'NYSE', or left blank (null).
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateExchangeAgainstAllowedValues(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * This rule ensures that the Exchange field, if provided, must be either 'Other', 'SSE', 'HKEX', 'TSE', 'LSE', 'AMEX', 'NASDAQ', 'NYSE', or left blank (null).
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateExchangeAgainstAllowedValues(result: ValidationResult) {
    	const allowedExchanges = [
    		"Other",
    		"SSE",
    		"HKEX",
    		"TSE",
    		"LSE",
    		"AMEX",
    		"NASDAQ",
    		"NYSE"
    	];
    	if (this.Exchange != null && allowedExchanges.indexOf(this.Exchange) === -1) {
    		result.Errors.push(new ValidationErrorInfo("Exchange", "Exchange must be one of: Other, SSE, HKEX, TSE, LSE, AMEX, NASDAQ, NYSE, or left blank.", this.Exchange, ValidationErrorType.Failure));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Official name of the organization or company
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Industry
    * * Display Name: Industry
    * * SQL Data Type: nvarchar(50)
    * * Description: Industry sector the account belongs to
    */
    get Industry(): string | null {
        return this.Get('Industry');
    }
    set Industry(value: string | null) {
        this.Set('Industry', value);
    }

    /**
    * * Field Name: AnnualRevenue
    * * Display Name: Annual Revenue
    * * SQL Data Type: decimal(18, 2)
    * * Description: Estimated annual revenue of the account in local currency
    */
    get AnnualRevenue(): number | null {
        return this.Get('AnnualRevenue');
    }
    set AnnualRevenue(value: number | null) {
        this.Set('AnnualRevenue', value);
    }

    /**
    * * Field Name: TickerSymbol
    * * Display Name: Ticker Symbol
    * * SQL Data Type: nvarchar(10)
    * * Description: Stock ticker symbol for publicly traded companies
    */
    get TickerSymbol(): string | null {
        return this.Get('TickerSymbol');
    }
    set TickerSymbol(value: string | null) {
        this.Set('TickerSymbol', value);
    }

    /**
    * * Field Name: Exchange
    * * Display Name: Exchange
    * * SQL Data Type: nvarchar(20)
    * * Description: Stock exchange where company is listed (NYSE, NASDAQ, AMEX, LSE, TSE, HKEX, SSE, Other)
    */
    get Exchange(): string | null {
        return this.Get('Exchange');
    }
    set Exchange(value: string | null) {
        this.Set('Exchange', value);
    }

    /**
    * * Field Name: EmployeeCount
    * * Display Name: Employee Count
    * * SQL Data Type: int
    * * Description: Approximate number of employees
    */
    get EmployeeCount(): number | null {
        return this.Get('EmployeeCount');
    }
    set EmployeeCount(value: number | null) {
        this.Set('EmployeeCount', value);
    }

    /**
    * * Field Name: Founded
    * * Display Name: Founded
    * * SQL Data Type: int
    * * Description: Year the company was founded
    */
    get Founded(): number | null {
        return this.Get('Founded');
    }
    set Founded(value: number | null) {
        this.Set('Founded', value);
    }

    /**
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(255)
    * * Description: Primary website URL of the account
    */
    get Website(): string | null {
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: nvarchar(20)
    * * Description: Main phone number for the account
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Fax
    * * Display Name: Fax
    * * SQL Data Type: nvarchar(20)
    * * Description: Fax number for the account
    */
    get Fax(): string | null {
        return this.Get('Fax');
    }
    set Fax(value: string | null) {
        this.Set('Fax', value);
    }

    /**
    * * Field Name: BillingStreet
    * * Display Name: Billing Street
    * * SQL Data Type: nvarchar(100)
    * * Description: Street address for billing
    */
    get BillingStreet(): string | null {
        return this.Get('BillingStreet');
    }
    set BillingStreet(value: string | null) {
        this.Set('BillingStreet', value);
    }

    /**
    * * Field Name: BillingCity
    * * Display Name: Billing City
    * * SQL Data Type: nvarchar(50)
    * * Description: City for billing address
    */
    get BillingCity(): string | null {
        return this.Get('BillingCity');
    }
    set BillingCity(value: string | null) {
        this.Set('BillingCity', value);
    }

    /**
    * * Field Name: BillingState
    * * Display Name: Billing State
    * * SQL Data Type: nvarchar(50)
    * * Description: State/province for billing address
    */
    get BillingState(): string | null {
        return this.Get('BillingState');
    }
    set BillingState(value: string | null) {
        this.Set('BillingState', value);
    }

    /**
    * * Field Name: BillingPostalCode
    * * Display Name: Billing Postal Code
    * * SQL Data Type: nvarchar(20)
    * * Description: Postal/ZIP code for billing address
    */
    get BillingPostalCode(): string | null {
        return this.Get('BillingPostalCode');
    }
    set BillingPostalCode(value: string | null) {
        this.Set('BillingPostalCode', value);
    }

    /**
    * * Field Name: BillingCountry
    * * Display Name: Billing Country
    * * SQL Data Type: nvarchar(50)
    * * Description: Country for billing address
    */
    get BillingCountry(): string | null {
        return this.Get('BillingCountry');
    }
    set BillingCountry(value: string | null) {
        this.Set('BillingCountry', value);
    }

    /**
    * * Field Name: ShippingStreet
    * * Display Name: Shipping Street
    * * SQL Data Type: nvarchar(100)
    * * Description: Street address for shipping
    */
    get ShippingStreet(): string | null {
        return this.Get('ShippingStreet');
    }
    set ShippingStreet(value: string | null) {
        this.Set('ShippingStreet', value);
    }

    /**
    * * Field Name: ShippingCity
    * * Display Name: Shipping City
    * * SQL Data Type: nvarchar(50)
    * * Description: City for shipping address
    */
    get ShippingCity(): string | null {
        return this.Get('ShippingCity');
    }
    set ShippingCity(value: string | null) {
        this.Set('ShippingCity', value);
    }

    /**
    * * Field Name: ShippingState
    * * Display Name: Shipping State
    * * SQL Data Type: nvarchar(50)
    * * Description: State/province for shipping address
    */
    get ShippingState(): string | null {
        return this.Get('ShippingState');
    }
    set ShippingState(value: string | null) {
        this.Set('ShippingState', value);
    }

    /**
    * * Field Name: ShippingPostalCode
    * * Display Name: Shipping Postal Code
    * * SQL Data Type: nvarchar(20)
    * * Description: Postal/ZIP code for shipping address
    */
    get ShippingPostalCode(): string | null {
        return this.Get('ShippingPostalCode');
    }
    set ShippingPostalCode(value: string | null) {
        this.Set('ShippingPostalCode', value);
    }

    /**
    * * Field Name: ShippingCountry
    * * Display Name: Shipping Country
    * * SQL Data Type: nvarchar(50)
    * * Description: Country for shipping address
    */
    get ShippingCountry(): string | null {
        return this.Get('ShippingCountry');
    }
    set ShippingCountry(value: string | null) {
        this.Set('ShippingCountry', value);
    }

    /**
    * * Field Name: AccountType
    * * Display Name: Account Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Competitor
    *   * Customer
    *   * Other
    *   * Partner
    *   * Prospect
    *   * Vendor
    * * Description: Type of relationship with the account (Prospect, Customer, etc.)
    */
    get AccountType(): 'Competitor' | 'Customer' | 'Other' | 'Partner' | 'Prospect' | 'Vendor' | null {
        return this.Get('AccountType');
    }
    set AccountType(value: 'Competitor' | 'Customer' | 'Other' | 'Partner' | 'Prospect' | 'Vendor' | null) {
        this.Set('AccountType', value);
    }

    /**
    * * Field Name: AccountStatus
    * * Display Name: Account Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Closed
    *   * Inactive
    *   * On Hold
    * * Description: Current status of the account (Active, Inactive, etc.)
    */
    get AccountStatus(): 'Active' | 'Closed' | 'Inactive' | 'On Hold' | null {
        return this.Get('AccountStatus');
    }
    set AccountStatus(value: 'Active' | 'Closed' | 'Inactive' | 'On Hold' | null) {
        this.Set('AccountStatus', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Indicates whether the account is currently active
    */
    get IsActive(): boolean | null {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean | null) {
        this.Set('IsActive', value);
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
 * * Schema: CRM
 * * Base Table: Activity
 * * Base View: vwActivities
 * * @description Tracks interactions with contacts and accounts
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities')
export class ActivityEntity extends BaseEntity<ActivityEntityType> {
    /**
    * Loads the Activities record from the database
    * @param ID: number - primary key value to load the Activities record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActivityEntity
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

    /**
    * * Field Name: AccountID
    * * Display Name: Account ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Accounts (vwAccounts.ID)
    */
    get AccountID(): number | null {
        return this.Get('AccountID');
    }
    set AccountID(value: number | null) {
        this.Set('AccountID', value);
    }

    /**
    * * Field Name: ContactID
    * * Display Name: Contact ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    */
    get ContactID(): number | null {
        return this.Get('ContactID');
    }
    set ContactID(value: number | null) {
        this.Set('ContactID', value);
    }

    /**
    * * Field Name: ActivityType
    * * Display Name: Activity Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Call
    *   * Demo
    *   * Email
    *   * Meeting
    *   * Note
    *   * Other
    *   * Site Visit
    *   * Task
    * * Description: Type of activity (Call, Email, Meeting, etc.)
    */
    get ActivityType(): 'Call' | 'Demo' | 'Email' | 'Meeting' | 'Note' | 'Other' | 'Site Visit' | 'Task' {
        return this.Get('ActivityType');
    }
    set ActivityType(value: 'Call' | 'Demo' | 'Email' | 'Meeting' | 'Note' | 'Other' | 'Site Visit' | 'Task') {
        this.Set('ActivityType', value);
    }

    /**
    * * Field Name: Subject
    * * Display Name: Subject
    * * SQL Data Type: nvarchar(200)
    * * Description: Brief description of the activity
    */
    get Subject(): string {
        return this.Get('Subject');
    }
    set Subject(value: string) {
        this.Set('Subject', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Detailed description or notes about the activity
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: datetime
    * * Description: Date and time when the activity starts
    */
    get StartDate(): Date {
        return this.Get('StartDate');
    }
    set StartDate(value: Date) {
        this.Set('StartDate', value);
    }

    /**
    * * Field Name: EndDate
    * * Display Name: End Date
    * * SQL Data Type: datetime
    * * Description: Date and time when the activity ends
    */
    get EndDate(): Date | null {
        return this.Get('EndDate');
    }
    set EndDate(value: Date | null) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Canceled
    *   * Completed
    *   * Deferred
    *   * In Progress
    *   * Planned
    * * Description: Current status of the activity (Planned, Completed, etc.)
    */
    get Status(): 'Canceled' | 'Completed' | 'Deferred' | 'In Progress' | 'Planned' {
        return this.Get('Status');
    }
    set Status(value: 'Canceled' | 'Completed' | 'Deferred' | 'In Progress' | 'Planned') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Priority
    * * Display Name: Priority
    * * SQL Data Type: nvarchar(10)
    * * Value List Type: List
    * * Possible Values 
    *   * High
    *   * Low
    *   * Medium
    * * Description: Priority level of the activity (High, Medium, Low)
    */
    get Priority(): 'High' | 'Low' | 'Medium' | null {
        return this.Get('Priority');
    }
    set Priority(value: 'High' | 'Low' | 'Medium' | null) {
        this.Set('Priority', value);
    }

    /**
    * * Field Name: Direction
    * * Display Name: Direction
    * * SQL Data Type: nvarchar(10)
    * * Value List Type: List
    * * Possible Values 
    *   * Inbound
    *   * Internal
    *   * Outbound
    * * Description: Direction of communication (Inbound, Outbound, Internal)
    */
    get Direction(): 'Inbound' | 'Internal' | 'Outbound' | null {
        return this.Get('Direction');
    }
    set Direction(value: 'Inbound' | 'Internal' | 'Outbound' | null) {
        this.Set('Direction', value);
    }

    /**
    * * Field Name: Location
    * * Display Name: Location
    * * SQL Data Type: nvarchar(100)
    * * Description: Physical or virtual location of the activity
    */
    get Location(): string | null {
        return this.Get('Location');
    }
    set Location(value: string | null) {
        this.Set('Location', value);
    }

    /**
    * * Field Name: Result
    * * Display Name: Result
    * * SQL Data Type: nvarchar(100)
    * * Description: Outcome or result of the activity
    */
    get Result(): string | null {
        return this.Get('Result');
    }
    set Result(value: string | null) {
        this.Set('Result', value);
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

    /**
    * * Field Name: Account
    * * Display Name: Account
    * * SQL Data Type: nvarchar(100)
    */
    get Account(): string | null {
        return this.Get('Account');
    }
}


/**
 * Activity Types - strongly typed entity sub-class
 * * Schema: CRM
 * * Base Table: ActivityType
 * * Base View: vwActivityTypes
 * * @description Lookup table for standardizing activity type values
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activity Types')
export class ActivityTypeEntity extends BaseEntity<ActivityTypeEntityType> {
    /**
    * Loads the Activity Types record from the database
    * @param ID: number - primary key value to load the Activity Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActivityTypeEntity
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

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Call
    *   * Demo
    *   * Email
    *   * Meeting
    *   * Note
    *   * Other
    *   * Site Visit
    *   * Task
    * * Description: Name of the activity type
    */
    get Name(): 'Call' | 'Demo' | 'Email' | 'Meeting' | 'Note' | 'Other' | 'Site Visit' | 'Task' {
        return this.Get('Name');
    }
    set Name(value: 'Call' | 'Demo' | 'Email' | 'Meeting' | 'Note' | 'Other' | 'Site Visit' | 'Task') {
        this.Set('Name', value);
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
 * Contact Relationships - strongly typed entity sub-class
 * * Schema: CRM
 * * Base Table: ContactRelationship
 * * Base View: vwContactRelationships
 * * @description Stores relationship connections between contacts
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Relationships')
export class ContactRelationshipEntity extends BaseEntity<ContactRelationshipEntityType> {
    /**
    * Loads the Contact Relationships record from the database
    * @param ID: number - primary key value to load the Contact Relationships record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ContactRelationshipEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Contact Relationships entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: This rule ensures that if an end date is provided, it must be on or after the start date. If the end date is not provided, then any value is allowed.
    * * Table-Level: This rule ensures that the primary contact and the related contact cannot be the same person. They must have different IDs.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateEndDateNotBeforeStartDate(result);
        this.ValidatePrimaryContactIDDifferentFromRelatedContactID(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * This rule ensures that if an end date is provided, it must be on or after the start date. If the end date is not provided, then any value is allowed.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateEndDateNotBeforeStartDate(result: ValidationResult) {
    	if (this.EndDate != null && this.StartDate != null && this.EndDate < this.StartDate) {
    		result.Errors.push(new ValidationErrorInfo("EndDate", "The end date cannot be before the start date.", this.EndDate, ValidationErrorType.Failure));
    	}
    }

    /**
    * This rule ensures that the primary contact and the related contact cannot be the same person. They must have different IDs.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidatePrimaryContactIDDifferentFromRelatedContactID(result: ValidationResult) {
    	if (this.PrimaryContactID === this.RelatedContactID) {
    		result.Errors.push(new ValidationErrorInfo("PrimaryContactID", "The primary contact cannot be the same as the related contact.", this.PrimaryContactID, ValidationErrorType.Failure));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: PrimaryContactID
    * * Display Name: Primary Contact ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    * * Description: ID of the primary contact in the relationship (e.g., the parent)
    */
    get PrimaryContactID(): number {
        return this.Get('PrimaryContactID');
    }
    set PrimaryContactID(value: number) {
        this.Set('PrimaryContactID', value);
    }

    /**
    * * Field Name: RelatedContactID
    * * Display Name: Related Contact ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    * * Description: ID of the related contact in the relationship (e.g., the child)
    */
    get RelatedContactID(): number {
        return this.Get('RelatedContactID');
    }
    set RelatedContactID(value: number) {
        this.Set('RelatedContactID', value);
    }

    /**
    * * Field Name: RelationshipTypeID
    * * Display Name: Relationship Type ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Relationship Types (vwRelationshipTypes.ID)
    * * Description: ID of the relationship type defining how contacts are related
    */
    get RelationshipTypeID(): number {
        return this.Get('RelationshipTypeID');
    }
    set RelationshipTypeID(value: number) {
        this.Set('RelationshipTypeID', value);
    }

    /**
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: date
    * * Description: Date when the relationship started
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
    * * SQL Data Type: date
    * * Description: Date when the relationship ended (if applicable)
    */
    get EndDate(): Date | null {
        return this.Get('EndDate');
    }
    set EndDate(value: Date | null) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(500)
    * * Description: Additional notes or details about the relationship
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Indicates whether the relationship is currently active
    */
    get IsActive(): boolean | null {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean | null) {
        this.Set('IsActive', value);
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

    /**
    * * Field Name: RelationshipType
    * * Display Name: Relationship Type
    * * SQL Data Type: nvarchar(50)
    */
    get RelationshipType(): string {
        return this.Get('RelationshipType');
    }
}


/**
 * Contacts - strongly typed entity sub-class
 * * Schema: CRM
 * * Base Table: Contact
 * * Base View: vwContacts
 * * @description Stores information about individual people associated with accounts
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contacts')
export class ContactEntity extends BaseEntity<ContactEntityType> {
    /**
    * Loads the Contacts record from the database
    * @param ID: number - primary key value to load the Contacts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ContactEntity
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

    /**
    * * Field Name: AccountID
    * * Display Name: Account ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Accounts (vwAccounts.ID)
    */
    get AccountID(): number | null {
        return this.Get('AccountID');
    }
    set AccountID(value: number | null) {
        this.Set('AccountID', value);
    }

    /**
    * * Field Name: Salutation
    * * Display Name: Salutation
    * * SQL Data Type: nvarchar(10)
    * * Description: Salutation or title prefix (Mr., Ms., Dr., etc.)
    */
    get Salutation(): string | null {
        return this.Get('Salutation');
    }
    set Salutation(value: string | null) {
        this.Set('Salutation', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(50)
    * * Description: First name of the contact
    */
    get FirstName(): string {
        return this.Get('FirstName');
    }
    set FirstName(value: string) {
        this.Set('FirstName', value);
    }

    /**
    * * Field Name: LastName
    * * Display Name: Last Name
    * * SQL Data Type: nvarchar(50)
    * * Description: Last name of the contact
    */
    get LastName(): string {
        return this.Get('LastName');
    }
    set LastName(value: string) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: FullName
    * * Display Name: Full Name
    * * SQL Data Type: nvarchar(101)
    * * Description: Full name of the contact (computed column)
    */
    get FullName(): string {
        return this.Get('FullName');
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(100)
    * * Description: Job title of the contact
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Department
    * * Display Name: Department
    * * SQL Data Type: nvarchar(100)
    * * Description: Department the contact works in
    */
    get Department(): string | null {
        return this.Get('Department');
    }
    set Department(value: string | null) {
        this.Set('Department', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(100)
    * * Description: Email address of the contact
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: nvarchar(20)
    * * Description: Primary work phone number of the contact
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Mobile
    * * Display Name: Mobile
    * * SQL Data Type: nvarchar(20)
    * * Description: Mobile phone number of the contact
    */
    get Mobile(): string | null {
        return this.Get('Mobile');
    }
    set Mobile(value: string | null) {
        this.Set('Mobile', value);
    }

    /**
    * * Field Name: ReportsToID
    * * Display Name: Reports To ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    */
    get ReportsToID(): number | null {
        return this.Get('ReportsToID');
    }
    set ReportsToID(value: number | null) {
        this.Set('ReportsToID', value);
    }

    /**
    * * Field Name: MailingStreet
    * * Display Name: Mailing Street
    * * SQL Data Type: nvarchar(100)
    * * Description: Street address for mailing
    */
    get MailingStreet(): string | null {
        return this.Get('MailingStreet');
    }
    set MailingStreet(value: string | null) {
        this.Set('MailingStreet', value);
    }

    /**
    * * Field Name: MailingCity
    * * Display Name: Mailing City
    * * SQL Data Type: nvarchar(50)
    * * Description: City for mailing address
    */
    get MailingCity(): string | null {
        return this.Get('MailingCity');
    }
    set MailingCity(value: string | null) {
        this.Set('MailingCity', value);
    }

    /**
    * * Field Name: MailingState
    * * Display Name: Mailing State
    * * SQL Data Type: nvarchar(50)
    * * Description: State/province for mailing address
    */
    get MailingState(): string | null {
        return this.Get('MailingState');
    }
    set MailingState(value: string | null) {
        this.Set('MailingState', value);
    }

    /**
    * * Field Name: MailingPostalCode
    * * Display Name: Mailing Postal Code
    * * SQL Data Type: nvarchar(20)
    * * Description: Postal/ZIP code for mailing address
    */
    get MailingPostalCode(): string | null {
        return this.Get('MailingPostalCode');
    }
    set MailingPostalCode(value: string | null) {
        this.Set('MailingPostalCode', value);
    }

    /**
    * * Field Name: MailingCountry
    * * Display Name: Mailing Country
    * * SQL Data Type: nvarchar(50)
    * * Description: Country for mailing address
    */
    get MailingCountry(): string | null {
        return this.Get('MailingCountry');
    }
    set MailingCountry(value: string | null) {
        this.Set('MailingCountry', value);
    }

    /**
    * * Field Name: BirthDate
    * * Display Name: Birth Date
    * * SQL Data Type: date
    * * Description: Birth date of the contact
    */
    get BirthDate(): Date | null {
        return this.Get('BirthDate');
    }
    set BirthDate(value: Date | null) {
        this.Set('BirthDate', value);
    }

    /**
    * * Field Name: PreferredContactMethod
    * * Display Name: Preferred Contact Method
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Email
    *   * Mail
    *   * Mobile
    *   * None
    *   * Phone
    * * Description: Preferred method of communication (Email, Phone, Mobile, etc.)
    */
    get PreferredContactMethod(): 'Email' | 'Mail' | 'Mobile' | 'None' | 'Phone' | null {
        return this.Get('PreferredContactMethod');
    }
    set PreferredContactMethod(value: 'Email' | 'Mail' | 'Mobile' | 'None' | 'Phone' | null) {
        this.Set('PreferredContactMethod', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Indicates whether the contact is currently active
    */
    get IsActive(): boolean | null {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean | null) {
        this.Set('IsActive', value);
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

    /**
    * * Field Name: Account
    * * Display Name: Account
    * * SQL Data Type: nvarchar(100)
    */
    get Account(): string | null {
        return this.Get('Account');
    }

    /**
    * * Field Name: RootReportsToID
    * * Display Name: Root Reports To ID
    * * SQL Data Type: int
    */
    get RootReportsToID(): number | null {
        return this.Get('RootReportsToID');
    }
}


/**
 * Deal Products - strongly typed entity sub-class
 * * Schema: CRM
 * * Base Table: DealProduct
 * * Base View: vwDealProducts
 * * @description Line items representing products and services included in a deal
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Deal Products')
export class DealProductEntity extends BaseEntity<DealProductEntityType> {
    /**
    * Loads the Deal Products record from the database
    * @param ID: number - primary key value to load the Deal Products record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DealProductEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Deal Products entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Discount: This rule ensures that if a discount is specified, its value must be between 0 and 100, inclusive.
    * * Quantity: This rule ensures that the quantity for this item must be greater than zero. You cannot have a quantity that is zero or negative.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateDiscountBetweenZeroAndHundred(result);
        this.ValidateQuantityGreaterThanZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * This rule ensures that if a discount is specified, its value must be between 0 and 100, inclusive.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateDiscountBetweenZeroAndHundred(result: ValidationResult) {
    	if (this.Discount != null && (this.Discount < 0 || this.Discount > 100)) {
    		result.Errors.push(new ValidationErrorInfo("Discount", "Discount must be between 0 and 100 (inclusive) if specified.", this.Discount, ValidationErrorType.Failure));
    	}
    }

    /**
    * This rule ensures that the quantity for this item must be greater than zero. You cannot have a quantity that is zero or negative.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateQuantityGreaterThanZero(result: ValidationResult) {
    	if (this.Quantity <= 0) {
    		result.Errors.push(new ValidationErrorInfo("Quantity", "The quantity must be greater than zero.", this.Quantity, ValidationErrorType.Failure));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: DealID
    * * Display Name: Deal ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Deals (vwDeals.ID)
    */
    get DealID(): number {
        return this.Get('DealID');
    }
    set DealID(value: number) {
        this.Set('DealID', value);
    }

    /**
    * * Field Name: ProductID
    * * Display Name: Product ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Products (vwProducts.ID)
    */
    get ProductID(): number {
        return this.Get('ProductID');
    }
    set ProductID(value: number) {
        this.Set('ProductID', value);
    }

    /**
    * * Field Name: Quantity
    * * Display Name: Quantity
    * * SQL Data Type: decimal(18, 4)
    * * Description: Number of units of the product included in the deal
    */
    get Quantity(): number {
        return this.Get('Quantity');
    }
    set Quantity(value: number) {
        this.Set('Quantity', value);
    }

    /**
    * * Field Name: UnitPrice
    * * Display Name: Unit Price
    * * SQL Data Type: decimal(18, 2)
    * * Description: Negotiated price per unit for this deal (may differ from standard price)
    */
    get UnitPrice(): number {
        return this.Get('UnitPrice');
    }
    set UnitPrice(value: number) {
        this.Set('UnitPrice', value);
    }

    /**
    * * Field Name: Discount
    * * Display Name: Discount
    * * SQL Data Type: decimal(5, 2)
    * * Default Value: 0
    * * Description: Discount percentage applied to this line item (0-100)
    */
    get Discount(): number | null {
        return this.Get('Discount');
    }
    set Discount(value: number | null) {
        this.Set('Discount', value);
    }

    /**
    * * Field Name: TotalPrice
    * * Display Name: Total Price
    * * SQL Data Type: numeric(38, 6)
    * * Description: Calculated field: Quantity × UnitPrice × (1 - Discount percentage)
    */
    get TotalPrice(): number | null {
        return this.Get('TotalPrice');
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(500)
    * * Description: Additional notes or specifications for this line item
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
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

    /**
    * * Field Name: Deal
    * * Display Name: Deal
    * * SQL Data Type: nvarchar(200)
    */
    get Deal(): string {
        return this.Get('Deal');
    }

    /**
    * * Field Name: Product
    * * Display Name: Product
    * * SQL Data Type: nvarchar(200)
    */
    get Product(): string {
        return this.Get('Product');
    }
}


/**
 * Deals - strongly typed entity sub-class
 * * Schema: CRM
 * * Base Table: Deal
 * * Base View: vwDeals
 * * @description Sales opportunities and deals in various stages of the sales pipeline
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Deals')
export class DealEntity extends BaseEntity<DealEntityType> {
    /**
    * Loads the Deals record from the database
    * @param ID: number - primary key value to load the Deals record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DealEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Deals entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Probability: This rule ensures that if the probability is provided, it cannot be lower than 0 or higher than 100.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateProbabilityWithinPercentageRange(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * This rule ensures that if the probability is provided, it cannot be lower than 0 or higher than 100.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateProbabilityWithinPercentageRange(result: ValidationResult) {
    	if (this.Probability != null && (this.Probability < 0 || this.Probability > 100)) {
    		result.Errors.push(new ValidationErrorInfo("Probability", "Probability must be between 0 and 100, inclusive.", this.Probability, ValidationErrorType.Failure));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Descriptive name for the deal or opportunity
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: AccountID
    * * Display Name: Account ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Accounts (vwAccounts.ID)
    */
    get AccountID(): number {
        return this.Get('AccountID');
    }
    set AccountID(value: number) {
        this.Set('AccountID', value);
    }

    /**
    * * Field Name: ContactID
    * * Display Name: Contact ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    */
    get ContactID(): number | null {
        return this.Get('ContactID');
    }
    set ContactID(value: number | null) {
        this.Set('ContactID', value);
    }

    /**
    * * Field Name: Stage
    * * Display Name: Stage
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Closed Lost
    *   * Closed Won
    *   * Negotiation
    *   * Proposal
    *   * Prospecting
    *   * Qualification
    * * Description: Current stage in the sales pipeline (Prospecting, Qualification, Proposal, Negotiation, Closed Won, Closed Lost)
    */
    get Stage(): 'Closed Lost' | 'Closed Won' | 'Negotiation' | 'Proposal' | 'Prospecting' | 'Qualification' {
        return this.Get('Stage');
    }
    set Stage(value: 'Closed Lost' | 'Closed Won' | 'Negotiation' | 'Proposal' | 'Prospecting' | 'Qualification') {
        this.Set('Stage', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(18, 2)
    * * Description: Total potential value of the deal in local currency
    */
    get Amount(): number | null {
        return this.Get('Amount');
    }
    set Amount(value: number | null) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: Probability
    * * Display Name: Probability
    * * SQL Data Type: int
    * * Description: Estimated probability of closing the deal (0-100 percent)
    */
    get Probability(): number | null {
        return this.Get('Probability');
    }
    set Probability(value: number | null) {
        this.Set('Probability', value);
    }

    /**
    * * Field Name: ExpectedRevenue
    * * Display Name: Expected Revenue
    * * SQL Data Type: numeric(35, 7)
    * * Description: Calculated field: Amount multiplied by Probability percentage
    */
    get ExpectedRevenue(): number | null {
        return this.Get('ExpectedRevenue');
    }

    /**
    * * Field Name: CloseDate
    * * Display Name: Close Date
    * * SQL Data Type: date
    * * Description: Target date for closing the deal
    */
    get CloseDate(): Date | null {
        return this.Get('CloseDate');
    }
    set CloseDate(value: Date | null) {
        this.Set('CloseDate', value);
    }

    /**
    * * Field Name: ActualCloseDate
    * * Display Name: Actual Close Date
    * * SQL Data Type: date
    * * Description: Actual date the deal was closed (won or lost)
    */
    get ActualCloseDate(): Date | null {
        return this.Get('ActualCloseDate');
    }
    set ActualCloseDate(value: Date | null) {
        this.Set('ActualCloseDate', value);
    }

    /**
    * * Field Name: DealSource
    * * Display Name: Deal Source
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Cold Call
    *   * Direct
    *   * Marketing Campaign
    *   * Other
    *   * Partner
    *   * Referral
    *   * Trade Show
    *   * Web
    * * Description: Origin of the deal (Web, Referral, Cold Call, Trade Show, Marketing Campaign, Partner, Direct, Other)
    */
    get DealSource(): 'Cold Call' | 'Direct' | 'Marketing Campaign' | 'Other' | 'Partner' | 'Referral' | 'Trade Show' | 'Web' | null {
        return this.Get('DealSource');
    }
    set DealSource(value: 'Cold Call' | 'Direct' | 'Marketing Campaign' | 'Other' | 'Partner' | 'Referral' | 'Trade Show' | 'Web' | null) {
        this.Set('DealSource', value);
    }

    /**
    * * Field Name: Competitor
    * * Display Name: Competitor
    * * SQL Data Type: nvarchar(100)
    * * Description: Name of competing company or solution being considered
    */
    get Competitor(): string | null {
        return this.Get('Competitor');
    }
    set Competitor(value: string | null) {
        this.Set('Competitor', value);
    }

    /**
    * * Field Name: LossReason
    * * Display Name: Loss Reason
    * * SQL Data Type: nvarchar(200)
    * * Description: Reason for losing the deal if Stage is Closed Lost
    */
    get LossReason(): string | null {
        return this.Get('LossReason');
    }
    set LossReason(value: string | null) {
        this.Set('LossReason', value);
    }

    /**
    * * Field Name: NextStep
    * * Display Name: Next Step
    * * SQL Data Type: nvarchar(500)
    * * Description: Description of the next action to be taken for this deal
    */
    get NextStep(): string | null {
        return this.Get('NextStep');
    }
    set NextStep(value: string | null) {
        this.Set('NextStep', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Detailed description of the deal, requirements, and notes
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: OwnerID
    * * Display Name: Owner ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    * * Description: Sales representative or owner responsible for this deal
    */
    get OwnerID(): number | null {
        return this.Get('OwnerID');
    }
    set OwnerID(value: number | null) {
        this.Set('OwnerID', value);
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

    /**
    * * Field Name: Account
    * * Display Name: Account
    * * SQL Data Type: nvarchar(100)
    */
    get Account(): string {
        return this.Get('Account');
    }
}


/**
 * Event Review Tasks - strongly typed entity sub-class
 * * Schema: Events
 * * Base Table: EventReviewTask
 * * Base View: vwEventReviewTasks
 * * @description Work queue for review committee members with task tracking
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Event Review Tasks')
export class EventReviewTaskEntity extends BaseEntity<EventReviewTaskEntityType> {
    /**
    * Loads the Event Review Tasks record from the database
    * @param ID: string - primary key value to load the Event Review Tasks record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EventReviewTaskEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newid()
    * * Description: Unique identifier for the review task
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: EventID
    * * Display Name: Event ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Events (vwEvents.ID)
    * * Description: Event this review task is for
    */
    get EventID(): string {
        return this.Get('EventID');
    }
    set EventID(value: string) {
        this.Set('EventID', value);
    }

    /**
    * * Field Name: SubmissionID
    * * Display Name: Submission ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Submissions (vwSubmissions.ID)
    * * Description: Submission to be reviewed
    */
    get SubmissionID(): string {
        return this.Get('SubmissionID');
    }
    set SubmissionID(value: string) {
        this.Set('SubmissionID', value);
    }

    /**
    * * Field Name: AssignedToContactID
    * * Display Name: Assigned To Contact ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    * * Description: CRM Contact ID of assigned reviewer (NULL if unassigned)
    */
    get AssignedToContactID(): number | null {
        return this.Get('AssignedToContactID');
    }
    set AssignedToContactID(value: number | null) {
        this.Set('AssignedToContactID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Canceled
    *   * Completed
    *   * In Progress
    *   * Pending
    * * Description: Current status of the review task (Pending, In Progress, Completed, Canceled)
    */
    get Status(): 'Canceled' | 'Completed' | 'In Progress' | 'Pending' {
        return this.Get('Status');
    }
    set Status(value: 'Canceled' | 'Completed' | 'In Progress' | 'Pending') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Priority
    * * Display Name: Priority
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Normal
    * * Value List Type: List
    * * Possible Values 
    *   * High
    *   * Low
    *   * Normal
    * * Description: Priority level (High, Normal, Low)
    */
    get Priority(): 'High' | 'Low' | 'Normal' | null {
        return this.Get('Priority');
    }
    set Priority(value: 'High' | 'Low' | 'Normal' | null) {
        this.Set('Priority', value);
    }

    /**
    * * Field Name: DueDate
    * * Display Name: Due Date
    * * SQL Data Type: datetime
    * * Description: Due date for completing the review
    */
    get DueDate(): Date | null {
        return this.Get('DueDate');
    }
    set DueDate(value: Date | null) {
        this.Set('DueDate', value);
    }

    /**
    * * Field Name: CompletedAt
    * * Display Name: Completed At
    * * SQL Data Type: datetime
    * * Description: Timestamp when task was completed
    */
    get CompletedAt(): Date | null {
        return this.Get('CompletedAt');
    }
    set CompletedAt(value: Date | null) {
        this.Set('CompletedAt', value);
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

    /**
    * * Field Name: Event
    * * Display Name: Event
    * * SQL Data Type: nvarchar(200)
    */
    get Event(): string {
        return this.Get('Event');
    }
}


/**
 * Events - strongly typed entity sub-class
 * * Schema: Events
 * * Base Table: Event
 * * Base View: vwEvents
 * * @description Master table for events, conferences, and call for proposals
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Events')
export class EventEntity extends BaseEntity<EventEntityType> {
    /**
    * Loads the Events record from the database
    * @param ID: string - primary key value to load the Events record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EventEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Events entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * BaselinePassingScore: This rule ensures that if a baseline passing score is provided, it must be a number between 0 and 100 (inclusive).
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateBaselinePassingScoreWithinRange(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * This rule ensures that if a baseline passing score is provided, it must be a number between 0 and 100 (inclusive).
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateBaselinePassingScoreWithinRange(result: ValidationResult) {
    	if (this.BaselinePassingScore != null && (this.BaselinePassingScore < 0 || this.BaselinePassingScore > 100)) {
    		result.Errors.push(new ValidationErrorInfo("BaselinePassingScore", "Baseline passing score must be between 0 and 100.", this.BaselinePassingScore, ValidationErrorType.Failure));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newid()
    * * Description: Unique identifier for the event
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Events (vwEvents.ID)
    * * Description: Parent event ID for multi-day or related events
    */
    get ParentID(): string | null {
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Name of the event or conference
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Full description of the event
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ConferenceTheme
    * * Display Name: Conference Theme
    * * SQL Data Type: nvarchar(500)
    * * Description: Main theme or focus area of the conference
    */
    get ConferenceTheme(): string | null {
        return this.Get('ConferenceTheme');
    }
    set ConferenceTheme(value: string | null) {
        this.Set('ConferenceTheme', value);
    }

    /**
    * * Field Name: TargetAudience
    * * Display Name: Target Audience
    * * SQL Data Type: nvarchar(500)
    * * Description: Description of target audience and their expertise levels
    */
    get TargetAudience(): string | null {
        return this.Get('TargetAudience');
    }
    set TargetAudience(value: string | null) {
        this.Set('TargetAudience', value);
    }

    /**
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: datetime
    * * Description: Start date and time of the event
    */
    get StartDate(): Date {
        return this.Get('StartDate');
    }
    set StartDate(value: Date) {
        this.Set('StartDate', value);
    }

    /**
    * * Field Name: EndDate
    * * Display Name: End Date
    * * SQL Data Type: datetime
    * * Description: End date and time of the event
    */
    get EndDate(): Date {
        return this.Get('EndDate');
    }
    set EndDate(value: Date) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: Location
    * * Display Name: Location
    * * SQL Data Type: nvarchar(200)
    * * Description: Physical or virtual location of the event
    */
    get Location(): string | null {
        return this.Get('Location');
    }
    set Location(value: string | null) {
        this.Set('Location', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Canceled
    *   * Closed
    *   * Completed
    *   * Open for Submissions
    *   * Planning
    *   * Review
    * * Description: Current status of the event (Planning, Open for Submissions, Review, Closed, Completed, Canceled)
    */
    get Status(): 'Canceled' | 'Closed' | 'Completed' | 'Open for Submissions' | 'Planning' | 'Review' {
        return this.Get('Status');
    }
    set Status(value: 'Canceled' | 'Closed' | 'Completed' | 'Open for Submissions' | 'Planning' | 'Review') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: SubmissionDeadline
    * * Display Name: Submission Deadline
    * * SQL Data Type: datetime
    * * Description: Deadline for submitting proposals
    */
    get SubmissionDeadline(): Date {
        return this.Get('SubmissionDeadline');
    }
    set SubmissionDeadline(value: Date) {
        this.Set('SubmissionDeadline', value);
    }

    /**
    * * Field Name: NotificationDate
    * * Display Name: Notification Date
    * * SQL Data Type: datetime
    * * Description: Date when speakers will be notified of acceptance/rejection
    */
    get NotificationDate(): Date | null {
        return this.Get('NotificationDate');
    }
    set NotificationDate(value: Date | null) {
        this.Set('NotificationDate', value);
    }

    /**
    * * Field Name: EvaluationRubric
    * * Display Name: Evaluation Rubric
    * * SQL Data Type: nvarchar(MAX)
    * * Description: AI prompt/rubric for evaluating submissions (JSON or text)
    */
    get EvaluationRubric(): string | null {
        return this.Get('EvaluationRubric');
    }
    set EvaluationRubric(value: string | null) {
        this.Set('EvaluationRubric', value);
    }

    /**
    * * Field Name: BaselinePassingScore
    * * Display Name: Baseline Passing Score
    * * SQL Data Type: decimal(5, 2)
    * * Description: Minimum score required to pass initial screening (0-100)
    */
    get BaselinePassingScore(): number | null {
        return this.Get('BaselinePassingScore');
    }
    set BaselinePassingScore(value: number | null) {
        this.Set('BaselinePassingScore', value);
    }

    /**
    * * Field Name: ReviewCommitteeEmails
    * * Display Name: Review Committee Emails
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON array of review committee member email addresses
    */
    get ReviewCommitteeEmails(): string | null {
        return this.Get('ReviewCommitteeEmails');
    }
    set ReviewCommitteeEmails(value: string | null) {
        this.Set('ReviewCommitteeEmails', value);
    }

    /**
    * * Field Name: TypeformID
    * * Display Name: Typeform ID
    * * SQL Data Type: nvarchar(100)
    * * Description: Typeform form ID for submission intake
    */
    get TypeformID(): string | null {
        return this.Get('TypeformID');
    }
    set TypeformID(value: string | null) {
        this.Set('TypeformID', value);
    }

    /**
    * * Field Name: TypeformMonitorEnabled
    * * Display Name: Typeform Monitor Enabled
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether automated Typeform monitoring is enabled
    */
    get TypeformMonitorEnabled(): boolean | null {
        return this.Get('TypeformMonitorEnabled');
    }
    set TypeformMonitorEnabled(value: boolean | null) {
        this.Set('TypeformMonitorEnabled', value);
    }

    /**
    * * Field Name: TypeformCheckFrequencyMinutes
    * * Display Name: Typeform Check Frequency Minutes
    * * SQL Data Type: int
    * * Default Value: 60
    * * Description: How often to check Typeform for new submissions (minutes)
    */
    get TypeformCheckFrequencyMinutes(): number | null {
        return this.Get('TypeformCheckFrequencyMinutes');
    }
    set TypeformCheckFrequencyMinutes(value: number | null) {
        this.Set('TypeformCheckFrequencyMinutes', value);
    }

    /**
    * * Field Name: BoxFolderID
    * * Display Name: Box Folder ID
    * * SQL Data Type: nvarchar(100)
    * * Description: Box.com folder ID where submission files are stored
    */
    get BoxFolderID(): string | null {
        return this.Get('BoxFolderID');
    }
    set BoxFolderID(value: string | null) {
        this.Set('BoxFolderID', value);
    }

    /**
    * * Field Name: SessionFormats
    * * Display Name: Session Formats
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON array of allowed session formats (Workshop, Keynote, Panel, Lightning Talk, etc.)
    */
    get SessionFormats(): string | null {
        return this.Get('SessionFormats');
    }
    set SessionFormats(value: string | null) {
        this.Set('SessionFormats', value);
    }

    /**
    * * Field Name: AccountID
    * * Display Name: Account ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Accounts (vwAccounts.ID)
    * * Description: Optional reference to CRM Account for event organization
    */
    get AccountID(): number | null {
        return this.Get('AccountID');
    }
    set AccountID(value: number | null) {
        this.Set('AccountID', value);
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

    /**
    * * Field Name: Parent
    * * Display Name: Parent
    * * SQL Data Type: nvarchar(200)
    */
    get Parent(): string | null {
        return this.Get('Parent');
    }

    /**
    * * Field Name: Account
    * * Display Name: Account
    * * SQL Data Type: nvarchar(100)
    */
    get Account(): string | null {
        return this.Get('Account');
    }

    /**
    * * Field Name: RootParentID
    * * Display Name: Root Parent ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentID(): string | null {
        return this.Get('RootParentID');
    }
}


/**
 * Industries - strongly typed entity sub-class
 * * Schema: CRM
 * * Base Table: Industry
 * * Base View: vwIndustries
 * * @description Lookup table for standardizing industry values
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Industries')
export class IndustryEntity extends BaseEntity<IndustryEntityType> {
    /**
    * Loads the Industries record from the database
    * @param ID: number - primary key value to load the Industries record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof IndustryEntity
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

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(50)
    * * Description: Name of the industry
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
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
 * Invoice Line Items - strongly typed entity sub-class
 * * Schema: CRM
 * * Base Table: InvoiceLineItem
 * * Base View: vwInvoiceLineItems
 * * @description Individual line items that appear on an invoice
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Invoice Line Items')
export class InvoiceLineItemEntity extends BaseEntity<InvoiceLineItemEntityType> {
    /**
    * Loads the Invoice Line Items record from the database
    * @param ID: number - primary key value to load the Invoice Line Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof InvoiceLineItemEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Invoice Line Items entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Discount: This rule ensures that if a discount is provided, it must be between 0 and 100, inclusive.
    * * Quantity: This rule ensures that the quantity for an invoice line item must be greater than zero.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateDiscountWithinZeroToHundred(result);
        this.ValidateQuantityGreaterThanZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * This rule ensures that if a discount is provided, it must be between 0 and 100, inclusive.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateDiscountWithinZeroToHundred(result: ValidationResult) {
    	if (this.Discount != null && (this.Discount < 0 || this.Discount > 100)) {
    		result.Errors.push(new ValidationErrorInfo("Discount", "Discount must be between 0 and 100.", this.Discount, ValidationErrorType.Failure));
    	}
    }

    /**
    * This rule ensures that the quantity for an invoice line item must be greater than zero.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateQuantityGreaterThanZero(result: ValidationResult) {
    	if (this.Quantity <= 0) {
    		result.Errors.push(new ValidationErrorInfo("Quantity", "Quantity must be greater than zero.", this.Quantity, ValidationErrorType.Failure));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: InvoiceID
    * * Display Name: Invoice ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Invoices (vwInvoices.ID)
    */
    get InvoiceID(): number {
        return this.Get('InvoiceID');
    }
    set InvoiceID(value: number) {
        this.Set('InvoiceID', value);
    }

    /**
    * * Field Name: ProductID
    * * Display Name: Product ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Products (vwProducts.ID)
    */
    get ProductID(): number | null {
        return this.Get('ProductID');
    }
    set ProductID(value: number | null) {
        this.Set('ProductID', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(500)
    * * Description: Description of the product or service being invoiced
    */
    get Description(): string {
        return this.Get('Description');
    }
    set Description(value: string) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Quantity
    * * Display Name: Quantity
    * * SQL Data Type: decimal(18, 4)
    * * Description: Number of units being invoiced
    */
    get Quantity(): number {
        return this.Get('Quantity');
    }
    set Quantity(value: number) {
        this.Set('Quantity', value);
    }

    /**
    * * Field Name: UnitPrice
    * * Display Name: Unit Price
    * * SQL Data Type: decimal(18, 2)
    * * Description: Price per unit for this line item
    */
    get UnitPrice(): number {
        return this.Get('UnitPrice');
    }
    set UnitPrice(value: number) {
        this.Set('UnitPrice', value);
    }

    /**
    * * Field Name: Discount
    * * Display Name: Discount
    * * SQL Data Type: decimal(5, 2)
    * * Default Value: 0
    * * Description: Discount percentage applied to this line item (0-100)
    */
    get Discount(): number | null {
        return this.Get('Discount');
    }
    set Discount(value: number | null) {
        this.Set('Discount', value);
    }

    /**
    * * Field Name: TotalPrice
    * * Display Name: Total Price
    * * SQL Data Type: numeric(38, 6)
    * * Description: Calculated field: Quantity × UnitPrice × (1 - Discount percentage)
    */
    get TotalPrice(): number | null {
        return this.Get('TotalPrice');
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

    /**
    * * Field Name: Product
    * * Display Name: Product
    * * SQL Data Type: nvarchar(200)
    */
    get Product(): string | null {
        return this.Get('Product');
    }
}


/**
 * Invoices - strongly typed entity sub-class
 * * Schema: CRM
 * * Base Table: Invoice
 * * Base View: vwInvoices
 * * @description Customer invoices for products and services rendered
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Invoices')
export class InvoiceEntity extends BaseEntity<InvoiceEntityType> {
    /**
    * Loads the Invoices record from the database
    * @param ID: number - primary key value to load the Invoices record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof InvoiceEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Invoices entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * TaxRate: This rule ensures that if a tax rate is provided, it must be between 0 and 100 percent (inclusive). If no tax rate is specified, this rule does not apply.
    * * Table-Level: This rule ensures that the due date of the invoice cannot be before the invoice date.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateTaxRateBetween0And100(result);
        this.ValidateDueDateNotBeforeInvoiceDate(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * This rule ensures that if a tax rate is provided, it must be between 0 and 100 percent (inclusive). If no tax rate is specified, this rule does not apply.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateTaxRateBetween0And100(result: ValidationResult) {
    	if (this.TaxRate != null && (this.TaxRate < 0 || this.TaxRate > 100)) {
    		result.Errors.push(new ValidationErrorInfo("TaxRate", "The tax rate must be between 0 and 100 percent.", this.TaxRate, ValidationErrorType.Failure));
    	}
    }

    /**
    * This rule ensures that the due date of the invoice cannot be before the invoice date.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateDueDateNotBeforeInvoiceDate(result: ValidationResult) {
    	if (this.DueDate < this.InvoiceDate) {
    		result.Errors.push(new ValidationErrorInfo("DueDate", "The due date cannot be before the invoice date.", this.DueDate, ValidationErrorType.Failure));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: InvoiceNumber
    * * Display Name: Invoice Number
    * * SQL Data Type: nvarchar(50)
    * * Description: Unique invoice identifier for external reference
    */
    get InvoiceNumber(): string {
        return this.Get('InvoiceNumber');
    }
    set InvoiceNumber(value: string) {
        this.Set('InvoiceNumber', value);
    }

    /**
    * * Field Name: AccountID
    * * Display Name: Account ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Accounts (vwAccounts.ID)
    */
    get AccountID(): number {
        return this.Get('AccountID');
    }
    set AccountID(value: number) {
        this.Set('AccountID', value);
    }

    /**
    * * Field Name: DealID
    * * Display Name: Deal ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Deals (vwDeals.ID)
    */
    get DealID(): number | null {
        return this.Get('DealID');
    }
    set DealID(value: number | null) {
        this.Set('DealID', value);
    }

    /**
    * * Field Name: InvoiceDate
    * * Display Name: Invoice Date
    * * SQL Data Type: date
    * * Description: Date the invoice was issued
    */
    get InvoiceDate(): Date {
        return this.Get('InvoiceDate');
    }
    set InvoiceDate(value: Date) {
        this.Set('InvoiceDate', value);
    }

    /**
    * * Field Name: DueDate
    * * Display Name: Due Date
    * * SQL Data Type: date
    * * Description: Payment due date for the invoice
    */
    get DueDate(): Date {
        return this.Get('DueDate');
    }
    set DueDate(value: Date) {
        this.Set('DueDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Draft
    *   * Overdue
    *   * Paid
    *   * Partial
    *   * Sent
    * * Description: Current status of the invoice (Draft, Sent, Paid, Partial, Overdue, Cancelled)
    */
    get Status(): 'Cancelled' | 'Draft' | 'Overdue' | 'Paid' | 'Partial' | 'Sent' {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Draft' | 'Overdue' | 'Paid' | 'Partial' | 'Sent') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: SubTotal
    * * Display Name: Sub Total
    * * SQL Data Type: decimal(18, 2)
    * * Description: Sum of all line items before tax
    */
    get SubTotal(): number {
        return this.Get('SubTotal');
    }
    set SubTotal(value: number) {
        this.Set('SubTotal', value);
    }

    /**
    * * Field Name: TaxRate
    * * Display Name: Tax Rate
    * * SQL Data Type: decimal(5, 2)
    * * Default Value: 0
    * * Description: Tax rate percentage to apply to the subtotal
    */
    get TaxRate(): number | null {
        return this.Get('TaxRate');
    }
    set TaxRate(value: number | null) {
        this.Set('TaxRate', value);
    }

    /**
    * * Field Name: TaxAmount
    * * Display Name: Tax Amount
    * * SQL Data Type: numeric(30, 9)
    * * Description: Calculated field: SubTotal × TaxRate percentage
    */
    get TaxAmount(): number | null {
        return this.Get('TaxAmount');
    }

    /**
    * * Field Name: TotalAmount
    * * Display Name: Total Amount
    * * SQL Data Type: numeric(31, 9)
    * * Description: Calculated field: SubTotal + TaxAmount
    */
    get TotalAmount(): number | null {
        return this.Get('TotalAmount');
    }

    /**
    * * Field Name: AmountPaid
    * * Display Name: Amount Paid
    * * SQL Data Type: decimal(18, 2)
    * * Default Value: 0
    * * Description: Total amount paid against this invoice
    */
    get AmountPaid(): number | null {
        return this.Get('AmountPaid');
    }
    set AmountPaid(value: number | null) {
        this.Set('AmountPaid', value);
    }

    /**
    * * Field Name: BalanceDue
    * * Display Name: Balance Due
    * * SQL Data Type: numeric(32, 9)
    * * Description: Calculated field: TotalAmount - AmountPaid
    */
    get BalanceDue(): number | null {
        return this.Get('BalanceDue');
    }

    /**
    * * Field Name: Terms
    * * Display Name: Terms
    * * SQL Data Type: nvarchar(100)
    * * Description: Payment terms (e.g., Net 30, Net 15, Due on Receipt, 2/10 Net 30)
    */
    get Terms(): string | null {
        return this.Get('Terms');
    }
    set Terms(value: string | null) {
        this.Set('Terms', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Additional notes or special instructions for the invoice
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: BillingStreet
    * * Display Name: Billing Street
    * * SQL Data Type: nvarchar(100)
    * * Description: Billing address street
    */
    get BillingStreet(): string | null {
        return this.Get('BillingStreet');
    }
    set BillingStreet(value: string | null) {
        this.Set('BillingStreet', value);
    }

    /**
    * * Field Name: BillingCity
    * * Display Name: Billing City
    * * SQL Data Type: nvarchar(50)
    * * Description: Billing address city
    */
    get BillingCity(): string | null {
        return this.Get('BillingCity');
    }
    set BillingCity(value: string | null) {
        this.Set('BillingCity', value);
    }

    /**
    * * Field Name: BillingState
    * * Display Name: Billing State
    * * SQL Data Type: nvarchar(50)
    * * Description: Billing address state or province
    */
    get BillingState(): string | null {
        return this.Get('BillingState');
    }
    set BillingState(value: string | null) {
        this.Set('BillingState', value);
    }

    /**
    * * Field Name: BillingPostalCode
    * * Display Name: Billing Postal Code
    * * SQL Data Type: nvarchar(20)
    * * Description: Billing address postal or ZIP code
    */
    get BillingPostalCode(): string | null {
        return this.Get('BillingPostalCode');
    }
    set BillingPostalCode(value: string | null) {
        this.Set('BillingPostalCode', value);
    }

    /**
    * * Field Name: BillingCountry
    * * Display Name: Billing Country
    * * SQL Data Type: nvarchar(50)
    * * Description: Billing address country
    */
    get BillingCountry(): string | null {
        return this.Get('BillingCountry');
    }
    set BillingCountry(value: string | null) {
        this.Set('BillingCountry', value);
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

    /**
    * * Field Name: Account
    * * Display Name: Account
    * * SQL Data Type: nvarchar(100)
    */
    get Account(): string {
        return this.Get('Account');
    }

    /**
    * * Field Name: Deal
    * * Display Name: Deal
    * * SQL Data Type: nvarchar(200)
    */
    get Deal(): string | null {
        return this.Get('Deal');
    }
}


/**
 * Payments - strongly typed entity sub-class
 * * Schema: CRM
 * * Base Table: Payment
 * * Base View: vwPayments
 * * @description Payment transactions recorded against invoices
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Payments')
export class PaymentEntity extends BaseEntity<PaymentEntityType> {
    /**
    * Loads the Payments record from the database
    * @param ID: number - primary key value to load the Payments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PaymentEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Payments entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Amount: This rule ensures that the payment amount must be greater than zero.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateAmountGreaterThanZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * This rule ensures that the payment amount must be greater than zero.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAmountGreaterThanZero(result: ValidationResult) {
    	if (this.Amount <= 0) {
    		result.Errors.push(new ValidationErrorInfo("Amount", "The payment amount must be greater than zero.", this.Amount, ValidationErrorType.Failure));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: InvoiceID
    * * Display Name: Invoice ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Invoices (vwInvoices.ID)
    */
    get InvoiceID(): number {
        return this.Get('InvoiceID');
    }
    set InvoiceID(value: number) {
        this.Set('InvoiceID', value);
    }

    /**
    * * Field Name: PaymentDate
    * * Display Name: Payment Date
    * * SQL Data Type: date
    * * Description: Date the payment was received
    */
    get PaymentDate(): Date {
        return this.Get('PaymentDate');
    }
    set PaymentDate(value: Date) {
        this.Set('PaymentDate', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(18, 2)
    * * Description: Amount of the payment in local currency
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: PaymentMethod
    * * Display Name: Payment Method
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * ACH
    *   * Cash
    *   * Check
    *   * Credit Card
    *   * Other
    *   * Wire Transfer
    * * Description: Method of payment (Check, Credit Card, Wire Transfer, ACH, Cash, Other)
    */
    get PaymentMethod(): 'ACH' | 'Cash' | 'Check' | 'Credit Card' | 'Other' | 'Wire Transfer' | null {
        return this.Get('PaymentMethod');
    }
    set PaymentMethod(value: 'ACH' | 'Cash' | 'Check' | 'Credit Card' | 'Other' | 'Wire Transfer' | null) {
        this.Set('PaymentMethod', value);
    }

    /**
    * * Field Name: ReferenceNumber
    * * Display Name: Reference Number
    * * SQL Data Type: nvarchar(100)
    * * Description: Check number, transaction ID, or other payment reference
    */
    get ReferenceNumber(): string | null {
        return this.Get('ReferenceNumber');
    }
    set ReferenceNumber(value: string | null) {
        this.Set('ReferenceNumber', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(500)
    * * Description: Additional notes about the payment
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
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
 * * Schema: CRM
 * * Base Table: Product
 * * Base View: vwProducts
 * * @description Master catalog of products and services offered by the organization
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Products')
export class ProductEntity extends BaseEntity<ProductEntityType> {
    /**
    * Loads the Products record from the database
    * @param ID: number - primary key value to load the Products record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ProductEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Products entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * RecurringBillingPeriod: This rule ensures that if a billing period is specified for a product, it must be either 'Biannual', 'Annual', 'Quarterly', or 'Monthly'. If the billing period is not specified, it can be left blank.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateRecurringBillingPeriodAllowedValues(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * This rule ensures that if a billing period is specified for a product, it must be either 'Biannual', 'Annual', 'Quarterly', or 'Monthly'. If the billing period is not specified, it can be left blank.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateRecurringBillingPeriodAllowedValues(result: ValidationResult) {
    	if (
    		this.RecurringBillingPeriod != null &&
    		this.RecurringBillingPeriod !== "Biannual" &&
    		this.RecurringBillingPeriod !== "Annual" &&
    		this.RecurringBillingPeriod !== "Quarterly" &&
    		this.RecurringBillingPeriod !== "Monthly"
    	) {
    		result.Errors.push(new ValidationErrorInfo(
    			"RecurringBillingPeriod",
    			"RecurringBillingPeriod, if specified, must be one of: 'Biannual', 'Annual', 'Quarterly', or 'Monthly'.",
    			this.RecurringBillingPeriod,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: ProductCode
    * * Display Name: Product Code
    * * SQL Data Type: nvarchar(50)
    * * Description: Unique identifier code for the product, used in external systems and reports
    */
    get ProductCode(): string {
        return this.Get('ProductCode');
    }
    set ProductCode(value: string) {
        this.Set('ProductCode', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Display name of the product or service
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(100)
    * * Description: Product category for grouping and analysis (e.g., Advertising, Sponsorship, Events, Publications)
    */
    get Category(): string | null {
        return this.Get('Category');
    }
    set Category(value: string | null) {
        this.Set('Category', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Detailed description of the product features and benefits
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: UnitPrice
    * * Display Name: Unit Price
    * * SQL Data Type: decimal(18, 2)
    * * Description: Standard selling price per unit in local currency
    */
    get UnitPrice(): number {
        return this.Get('UnitPrice');
    }
    set UnitPrice(value: number) {
        this.Set('UnitPrice', value);
    }

    /**
    * * Field Name: Cost
    * * Display Name: Cost
    * * SQL Data Type: decimal(18, 2)
    * * Description: Internal cost per unit for margin calculations
    */
    get Cost(): number | null {
        return this.Get('Cost');
    }
    set Cost(value: number | null) {
        this.Set('Cost', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Indicates if the product is currently available for sale
    */
    get IsActive(): boolean | null {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean | null) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: SKU
    * * Display Name: SKU
    * * SQL Data Type: nvarchar(50)
    * * Description: Stock Keeping Unit identifier for inventory tracking
    */
    get SKU(): string | null {
        return this.Get('SKU');
    }
    set SKU(value: string | null) {
        this.Set('SKU', value);
    }

    /**
    * * Field Name: UnitOfMeasure
    * * Display Name: Unit Of Measure
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Each
    *   * GB
    *   * Hour
    *   * License
    *   * Subscription
    *   * Unit
    *   * User
    * * Description: How the product is measured and sold (Each, Hour, License, Subscription, User, GB, Unit)
    */
    get UnitOfMeasure(): 'Each' | 'GB' | 'Hour' | 'License' | 'Subscription' | 'Unit' | 'User' | null {
        return this.Get('UnitOfMeasure');
    }
    set UnitOfMeasure(value: 'Each' | 'GB' | 'Hour' | 'License' | 'Subscription' | 'Unit' | 'User' | null) {
        this.Set('UnitOfMeasure', value);
    }

    /**
    * * Field Name: RecurringBillingPeriod
    * * Display Name: Recurring Billing Period
    * * SQL Data Type: nvarchar(20)
    * * Description: Billing frequency for subscription products (NULL for one-time, Monthly, Quarterly, Annual, Biannual)
    */
    get RecurringBillingPeriod(): string | null {
        return this.Get('RecurringBillingPeriod');
    }
    set RecurringBillingPeriod(value: string | null) {
        this.Set('RecurringBillingPeriod', value);
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
 * Relationship Types - strongly typed entity sub-class
 * * Schema: CRM
 * * Base Table: RelationshipType
 * * Base View: vwRelationshipTypes
 * * @description Lookup table for defining relationship types between contacts and their inverse relationships
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Relationship Types')
export class RelationshipTypeEntity extends BaseEntity<RelationshipTypeEntityType> {
    /**
    * Loads the Relationship Types record from the database
    * @param ID: number - primary key value to load the Relationship Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof RelationshipTypeEntity
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

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(50)
    * * Description: Name of the relationship type (e.g., Parent, Child, Spouse)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: IsBidirectional
    * * Display Name: Is Bidirectional
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Indicates if the relationship is the same in both directions (e.g., Spouse, Friend)
    */
    get IsBidirectional(): boolean {
        return this.Get('IsBidirectional');
    }
    set IsBidirectional(value: boolean) {
        this.Set('IsBidirectional', value);
    }

    /**
    * * Field Name: InverseRelationshipID
    * * Display Name: Inverse Relationship ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Relationship Types (vwRelationshipTypes.ID)
    * * Description: ID of the inverse relationship type (e.g., Parent → Child)
    */
    get InverseRelationshipID(): number | null {
        return this.Get('InverseRelationshipID');
    }
    set InverseRelationshipID(value: number | null) {
        this.Set('InverseRelationshipID', value);
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

    /**
    * * Field Name: InverseRelationship
    * * Display Name: Inverse Relationship
    * * SQL Data Type: nvarchar(50)
    */
    get InverseRelationship(): string | null {
        return this.Get('InverseRelationship');
    }

    /**
    * * Field Name: RootInverseRelationshipID
    * * Display Name: Root Inverse Relationship ID
    * * SQL Data Type: int
    */
    get RootInverseRelationshipID(): number | null {
        return this.Get('RootInverseRelationshipID');
    }
}


/**
 * Speakers - strongly typed entity sub-class
 * * Schema: Events
 * * Base Table: Speaker
 * * Base View: vwSpeakers
 * * @description Master table for speakers and presenters, with AI-enhanced research dossiers
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Speakers')
export class SpeakerEntity extends BaseEntity<SpeakerEntityType> {
    /**
    * Loads the Speakers record from the database
    * @param ID: string - primary key value to load the Speakers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof SpeakerEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Speakers entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * CredibilityScore: This rule ensures that the credibility score, if provided, must be a number between 0 and 100, inclusive.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateCredibilityScoreWithin0to100(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * This rule ensures that the credibility score, if provided, must be a number between 0 and 100, inclusive.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateCredibilityScoreWithin0to100(result: ValidationResult) {
    	if (this.CredibilityScore != null && (this.CredibilityScore < 0 || this.CredibilityScore > 100)) {
    		result.Errors.push(new ValidationErrorInfo("CredibilityScore", "Credibility score must be between 0 and 100.", this.CredibilityScore, ValidationErrorType.Failure));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newid()
    * * Description: Unique identifier for the speaker
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ContactID
    * * Display Name: Contact ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    * * Description: Optional reference to CRM Contact record
    */
    get ContactID(): number | null {
        return this.Get('ContactID');
    }
    set ContactID(value: number | null) {
        this.Set('ContactID', value);
    }

    /**
    * * Field Name: FullName
    * * Display Name: Full Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Full name of the speaker
    */
    get FullName(): string {
        return this.Get('FullName');
    }
    set FullName(value: string) {
        this.Set('FullName', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(100)
    * * Description: Primary email address
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: PhoneNumber
    * * Display Name: Phone Number
    * * SQL Data Type: nvarchar(20)
    * * Description: Contact phone number
    */
    get PhoneNumber(): string | null {
        return this.Get('PhoneNumber');
    }
    set PhoneNumber(value: string | null) {
        this.Set('PhoneNumber', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(100)
    * * Description: Professional title or position
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(200)
    * * Description: Company or organization affiliation
    */
    get Organization(): string | null {
        return this.Get('Organization');
    }
    set Organization(value: string | null) {
        this.Set('Organization', value);
    }

    /**
    * * Field Name: Bio
    * * Display Name: Bio
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Speaker biography as submitted
    */
    get Bio(): string | null {
        return this.Get('Bio');
    }
    set Bio(value: string | null) {
        this.Set('Bio', value);
    }

    /**
    * * Field Name: LinkedInURL
    * * Display Name: Linked In URL
    * * SQL Data Type: nvarchar(255)
    * * Description: LinkedIn profile URL
    */
    get LinkedInURL(): string | null {
        return this.Get('LinkedInURL');
    }
    set LinkedInURL(value: string | null) {
        this.Set('LinkedInURL', value);
    }

    /**
    * * Field Name: TwitterHandle
    * * Display Name: Twitter Handle
    * * SQL Data Type: nvarchar(50)
    * * Description: Twitter/X handle
    */
    get TwitterHandle(): string | null {
        return this.Get('TwitterHandle');
    }
    set TwitterHandle(value: string | null) {
        this.Set('TwitterHandle', value);
    }

    /**
    * * Field Name: WebsiteURL
    * * Display Name: Website URL
    * * SQL Data Type: nvarchar(255)
    * * Description: Personal or professional website URL
    */
    get WebsiteURL(): string | null {
        return this.Get('WebsiteURL');
    }
    set WebsiteURL(value: string | null) {
        this.Set('WebsiteURL', value);
    }

    /**
    * * Field Name: PhotoURL
    * * Display Name: Photo URL
    * * SQL Data Type: nvarchar(255)
    * * Description: URL to speaker headshot or profile photo
    */
    get PhotoURL(): string | null {
        return this.Get('PhotoURL');
    }
    set PhotoURL(value: string | null) {
        this.Set('PhotoURL', value);
    }

    /**
    * * Field Name: SpeakingExperience
    * * Display Name: Speaking Experience
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of previous speaking experience as submitted
    */
    get SpeakingExperience(): string | null {
        return this.Get('SpeakingExperience');
    }
    set SpeakingExperience(value: string | null) {
        this.Set('SpeakingExperience', value);
    }

    /**
    * * Field Name: DossierResearchedAt
    * * Display Name: Dossier Researched At
    * * SQL Data Type: datetime
    * * Description: Timestamp when AI research was last performed on this speaker
    */
    get DossierResearchedAt(): Date | null {
        return this.Get('DossierResearchedAt');
    }
    set DossierResearchedAt(value: Date | null) {
        this.Set('DossierResearchedAt', value);
    }

    /**
    * * Field Name: DossierJSON
    * * Display Name: Dossier JSON
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Comprehensive JSON research results from web searches and social media
    */
    get DossierJSON(): string | null {
        return this.Get('DossierJSON');
    }
    set DossierJSON(value: string | null) {
        this.Set('DossierJSON', value);
    }

    /**
    * * Field Name: DossierSummary
    * * Display Name: Dossier Summary
    * * SQL Data Type: nvarchar(MAX)
    * * Description: AI-generated summary of speaker background and credibility
    */
    get DossierSummary(): string | null {
        return this.Get('DossierSummary');
    }
    set DossierSummary(value: string | null) {
        this.Set('DossierSummary', value);
    }

    /**
    * * Field Name: CredibilityScore
    * * Display Name: Credibility Score
    * * SQL Data Type: decimal(5, 2)
    * * Description: AI-calculated credibility score based on research (0-100)
    */
    get CredibilityScore(): number | null {
        return this.Get('CredibilityScore');
    }
    set CredibilityScore(value: number | null) {
        this.Set('CredibilityScore', value);
    }

    /**
    * * Field Name: SpeakingHistory
    * * Display Name: Speaking History
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON array of previous speaking engagements discovered through research
    */
    get SpeakingHistory(): string | null {
        return this.Get('SpeakingHistory');
    }
    set SpeakingHistory(value: string | null) {
        this.Set('SpeakingHistory', value);
    }

    /**
    * * Field Name: Expertise
    * * Display Name: Expertise
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON array of expertise topics and domains
    */
    get Expertise(): string | null {
        return this.Get('Expertise');
    }
    set Expertise(value: string | null) {
        this.Set('Expertise', value);
    }

    /**
    * * Field Name: PublicationsCount
    * * Display Name: Publications Count
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Number of publications, articles, or blog posts discovered
    */
    get PublicationsCount(): number | null {
        return this.Get('PublicationsCount');
    }
    set PublicationsCount(value: number | null) {
        this.Set('PublicationsCount', value);
    }

    /**
    * * Field Name: SocialMediaReach
    * * Display Name: Social Media Reach
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Total social media followers/reach across platforms
    */
    get SocialMediaReach(): number | null {
        return this.Get('SocialMediaReach');
    }
    set SocialMediaReach(value: number | null) {
        this.Set('SocialMediaReach', value);
    }

    /**
    * * Field Name: RedFlags
    * * Display Name: Red Flags
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON array of any concerns or red flags identified during research
    */
    get RedFlags(): string | null {
        return this.Get('RedFlags');
    }
    set RedFlags(value: string | null) {
        this.Set('RedFlags', value);
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
 * Submission Notifications - strongly typed entity sub-class
 * * Schema: Events
 * * Base Table: SubmissionNotification
 * * Base View: vwSubmissionNotifications
 * * @description Audit trail of all notifications sent to speakers regarding their submissions
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Submission Notifications')
export class SubmissionNotificationEntity extends BaseEntity<SubmissionNotificationEntityType> {
    /**
    * Loads the Submission Notifications record from the database
    * @param ID: string - primary key value to load the Submission Notifications record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof SubmissionNotificationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newid()
    * * Description: Unique identifier for the notification
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: SubmissionID
    * * Display Name: Submission ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Submissions (vwSubmissions.ID)
    * * Description: Submission this notification is about
    */
    get SubmissionID(): string {
        return this.Get('SubmissionID');
    }
    set SubmissionID(value: string) {
        this.Set('SubmissionID', value);
    }

    /**
    * * Field Name: NotificationType
    * * Display Name: Notification Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Accepted
    *   * Failed Screening
    *   * Initial Received
    *   * Passed to Review
    *   * Rejected
    *   * Reminder
    *   * Request Resubmission
    *   * Waitlisted
    * * Description: Type of notification (Initial Received, Failed Screening, Passed to Review, Request Resubmission, Accepted, Rejected, Waitlisted, Reminder)
    */
    get NotificationType(): 'Accepted' | 'Failed Screening' | 'Initial Received' | 'Passed to Review' | 'Rejected' | 'Reminder' | 'Request Resubmission' | 'Waitlisted' {
        return this.Get('NotificationType');
    }
    set NotificationType(value: 'Accepted' | 'Failed Screening' | 'Initial Received' | 'Passed to Review' | 'Rejected' | 'Reminder' | 'Request Resubmission' | 'Waitlisted') {
        this.Set('NotificationType', value);
    }

    /**
    * * Field Name: SentAt
    * * Display Name: Sent At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    * * Description: Timestamp when notification was sent
    */
    get SentAt(): Date {
        return this.Get('SentAt');
    }
    set SentAt(value: Date) {
        this.Set('SentAt', value);
    }

    /**
    * * Field Name: RecipientEmail
    * * Display Name: Recipient Email
    * * SQL Data Type: nvarchar(100)
    * * Description: Email address of recipient
    */
    get RecipientEmail(): string {
        return this.Get('RecipientEmail');
    }
    set RecipientEmail(value: string) {
        this.Set('RecipientEmail', value);
    }

    /**
    * * Field Name: Subject
    * * Display Name: Subject
    * * SQL Data Type: nvarchar(500)
    * * Description: Email subject line
    */
    get Subject(): string | null {
        return this.Get('Subject');
    }
    set Subject(value: string | null) {
        this.Set('Subject', value);
    }

    /**
    * * Field Name: MessageBody
    * * Display Name: Message Body
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Full email message body
    */
    get MessageBody(): string | null {
        return this.Get('MessageBody');
    }
    set MessageBody(value: string | null) {
        this.Set('MessageBody', value);
    }

    /**
    * * Field Name: DeliveryStatus
    * * Display Name: Delivery Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Bounced
    *   * Delivered
    *   * Failed
    *   * Pending
    *   * Sent
    * * Description: Delivery status from email system (Pending, Sent, Delivered, Bounced, Failed)
    */
    get DeliveryStatus(): 'Bounced' | 'Delivered' | 'Failed' | 'Pending' | 'Sent' | null {
        return this.Get('DeliveryStatus');
    }
    set DeliveryStatus(value: 'Bounced' | 'Delivered' | 'Failed' | 'Pending' | 'Sent' | null) {
        this.Set('DeliveryStatus', value);
    }

    /**
    * * Field Name: ClickedAt
    * * Display Name: Clicked At
    * * SQL Data Type: datetime
    * * Description: Timestamp when recipient clicked a link in the email (for engagement tracking)
    */
    get ClickedAt(): Date | null {
        return this.Get('ClickedAt');
    }
    set ClickedAt(value: Date | null) {
        this.Set('ClickedAt', value);
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
 * Submission Reviews - strongly typed entity sub-class
 * * Schema: Events
 * * Base Table: SubmissionReview
 * * Base View: vwSubmissionReviews
 * * @description Human reviews and scoring of submissions by review committee members
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Submission Reviews')
export class SubmissionReviewEntity extends BaseEntity<SubmissionReviewEntityType> {
    /**
    * Loads the Submission Reviews record from the database
    * @param ID: string - primary key value to load the Submission Reviews record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof SubmissionReviewEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Submission Reviews entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * OverallScore: This rule ensures that if an overall score is provided, it must be between 0 and 10 (inclusive).
    * * QualityScore: This rule ensures that if a quality score is provided, it must be between 0 and 10, inclusive.
    * * RelevanceScore: This rule ensures that the relevance score, if provided, must be between 0 and 10.
    * * SpeakerExperienceScore: This rule ensures that if a speaker experience score is provided, it must be a number between 0 and 10, inclusive.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateOverallScoreBetweenZeroAndTen(result);
        this.ValidateQualityScoreBetweenZeroAndTen(result);
        this.ValidateRelevanceScoreWithinRange(result);
        this.ValidateSpeakerExperienceScoreBetween0And10(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * This rule ensures that if an overall score is provided, it must be between 0 and 10 (inclusive).
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateOverallScoreBetweenZeroAndTen(result: ValidationResult) {
    	if (this.OverallScore != null && (this.OverallScore < 0 || this.OverallScore > 10)) {
    		result.Errors.push(new ValidationErrorInfo("OverallScore", "If specified, the overall score must be between 0 and 10.", this.OverallScore, ValidationErrorType.Failure));
    	}
    }

    /**
    * This rule ensures that if a quality score is provided, it must be between 0 and 10, inclusive.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateQualityScoreBetweenZeroAndTen(result: ValidationResult) {
    	if (this.QualityScore != null && (this.QualityScore < 0 || this.QualityScore > 10)) {
    		result.Errors.push(new ValidationErrorInfo("QualityScore", "Quality score must be between 0 and 10 when specified.", this.QualityScore, ValidationErrorType.Failure));
    	}
    }

    /**
    * This rule ensures that the relevance score, if provided, must be between 0 and 10.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateRelevanceScoreWithinRange(result: ValidationResult) {
    	if (this.RelevanceScore != null && (this.RelevanceScore < 0 || this.RelevanceScore > 10)) {
    		result.Errors.push(new ValidationErrorInfo("RelevanceScore", "Relevance score must be between 0 and 10.", this.RelevanceScore, ValidationErrorType.Failure));
    	}
    }

    /**
    * This rule ensures that if a speaker experience score is provided, it must be a number between 0 and 10, inclusive.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateSpeakerExperienceScoreBetween0And10(result: ValidationResult) {
    	if (this.SpeakerExperienceScore != null && (this.SpeakerExperienceScore < 0 || this.SpeakerExperienceScore > 10)) {
    		result.Errors.push(new ValidationErrorInfo("SpeakerExperienceScore", "Speaker experience score must be between 0 and 10.", this.SpeakerExperienceScore, ValidationErrorType.Failure));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newid()
    * * Description: Unique identifier for the review
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: SubmissionID
    * * Display Name: Submission ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Submissions (vwSubmissions.ID)
    * * Description: Submission being reviewed
    */
    get SubmissionID(): string {
        return this.Get('SubmissionID');
    }
    set SubmissionID(value: string) {
        this.Set('SubmissionID', value);
    }

    /**
    * * Field Name: ReviewerContactID
    * * Display Name: Reviewer Contact ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    * * Description: CRM Contact ID of the reviewer
    */
    get ReviewerContactID(): number {
        return this.Get('ReviewerContactID');
    }
    set ReviewerContactID(value: number) {
        this.Set('ReviewerContactID', value);
    }

    /**
    * * Field Name: ReviewedAt
    * * Display Name: Reviewed At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    * * Description: Timestamp when review was submitted
    */
    get ReviewedAt(): Date {
        return this.Get('ReviewedAt');
    }
    set ReviewedAt(value: Date) {
        this.Set('ReviewedAt', value);
    }

    /**
    * * Field Name: OverallScore
    * * Display Name: Overall Score
    * * SQL Data Type: decimal(3, 1)
    * * Description: Overall score from 0-10
    */
    get OverallScore(): number | null {
        return this.Get('OverallScore');
    }
    set OverallScore(value: number | null) {
        this.Set('OverallScore', value);
    }

    /**
    * * Field Name: RelevanceScore
    * * Display Name: Relevance Score
    * * SQL Data Type: decimal(3, 1)
    * * Description: Relevance to conference theme score (0-10)
    */
    get RelevanceScore(): number | null {
        return this.Get('RelevanceScore');
    }
    set RelevanceScore(value: number | null) {
        this.Set('RelevanceScore', value);
    }

    /**
    * * Field Name: QualityScore
    * * Display Name: Quality Score
    * * SQL Data Type: decimal(3, 1)
    * * Description: Quality of abstract and proposed content score (0-10)
    */
    get QualityScore(): number | null {
        return this.Get('QualityScore');
    }
    set QualityScore(value: number | null) {
        this.Set('QualityScore', value);
    }

    /**
    * * Field Name: SpeakerExperienceScore
    * * Display Name: Speaker Experience Score
    * * SQL Data Type: decimal(3, 1)
    * * Description: Speaker experience and credibility score (0-10)
    */
    get SpeakerExperienceScore(): number | null {
        return this.Get('SpeakerExperienceScore');
    }
    set SpeakerExperienceScore(value: number | null) {
        this.Set('SpeakerExperienceScore', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Reviewer comments and feedback
    */
    get Comments(): string | null {
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
    }

    /**
    * * Field Name: Recommendation
    * * Display Name: Recommendation
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Accept
    *   * Needs Discussion
    *   * Reject
    *   * Waitlist
    * * Description: Reviewer recommendation (Accept, Reject, Waitlist, Needs Discussion)
    */
    get Recommendation(): 'Accept' | 'Needs Discussion' | 'Reject' | 'Waitlist' | null {
        return this.Get('Recommendation');
    }
    set Recommendation(value: 'Accept' | 'Needs Discussion' | 'Reject' | 'Waitlist' | null) {
        this.Set('Recommendation', value);
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
 * Submission Speakers - strongly typed entity sub-class
 * * Schema: Events
 * * Base Table: SubmissionSpeaker
 * * Base View: vwSubmissionSpeakers
 * * @description Junction table linking submissions to speakers (many-to-many relationship)
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Submission Speakers')
export class SubmissionSpeakerEntity extends BaseEntity<SubmissionSpeakerEntityType> {
    /**
    * Loads the Submission Speakers record from the database
    * @param ID: string - primary key value to load the Submission Speakers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof SubmissionSpeakerEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newid()
    * * Description: Unique identifier for the relationship
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: SubmissionID
    * * Display Name: Submission ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Submissions (vwSubmissions.ID)
    * * Description: Reference to the submission
    */
    get SubmissionID(): string {
        return this.Get('SubmissionID');
    }
    set SubmissionID(value: string) {
        this.Set('SubmissionID', value);
    }

    /**
    * * Field Name: SpeakerID
    * * Display Name: Speaker ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Speakers (vwSpeakers.ID)
    * * Description: Reference to the speaker
    */
    get SpeakerID(): string {
        return this.Get('SpeakerID');
    }
    set SpeakerID(value: string) {
        this.Set('SpeakerID', value);
    }

    /**
    * * Field Name: IsPrimaryContact
    * * Display Name: Is Primary Contact
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this speaker is the primary contact for the submission
    */
    get IsPrimaryContact(): boolean | null {
        return this.Get('IsPrimaryContact');
    }
    set IsPrimaryContact(value: boolean | null) {
        this.Set('IsPrimaryContact', value);
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Co-Presenter
    *   * Moderator
    *   * Panelist
    *   * Presenter
    * * Description: Role of speaker in this submission (Presenter, Co-Presenter, Moderator, Panelist)
    */
    get Role(): 'Co-Presenter' | 'Moderator' | 'Panelist' | 'Presenter' | null {
        return this.Get('Role');
    }
    set Role(value: 'Co-Presenter' | 'Moderator' | 'Panelist' | 'Presenter' | null) {
        this.Set('Role', value);
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
 * Submissions - strongly typed entity sub-class
 * * Schema: Events
 * * Base Table: Submission
 * * Base View: vwSubmissions
 * * @description Abstract submissions for events with AI-powered evaluation and human review tracking
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Submissions')
export class SubmissionEntity extends BaseEntity<SubmissionEntityType> {
    /**
    * Loads the Submissions record from the database
    * @param ID: string - primary key value to load the Submissions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof SubmissionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for Submissions entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * AIEvaluationScore: This rule ensures that if an AI evaluation score is provided, it must be a number between 0 and 100, inclusive.
    * * FinalDecision: This rule ensures that the final decision for a submission, if provided, must be either 'Waitlisted', 'Rejected', or 'Accepted'. If no decision has been made, the field can be left blank.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateAIEvaluationScoreWithinRange(result);
        this.ValidateFinalDecisionIsAllowedValue(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * This rule ensures that if an AI evaluation score is provided, it must be a number between 0 and 100, inclusive.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAIEvaluationScoreWithinRange(result: ValidationResult) {
    	if (this.AIEvaluationScore != null && (this.AIEvaluationScore < 0 || this.AIEvaluationScore > 100)) {
    		result.Errors.push(new ValidationErrorInfo("AIEvaluationScore", "AI evaluation score must be between 0 and 100.", this.AIEvaluationScore, ValidationErrorType.Failure));
    	}
    }

    /**
    * This rule ensures that the final decision for a submission, if provided, must be either 'Waitlisted', 'Rejected', or 'Accepted'. If no decision has been made, the field can be left blank.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateFinalDecisionIsAllowedValue(result: ValidationResult) {
    	if (this.FinalDecision != null && this.FinalDecision !== "Waitlisted" && this.FinalDecision !== "Rejected" && this.FinalDecision !== "Accepted") {
    		result.Errors.push(new ValidationErrorInfo("FinalDecision", "FinalDecision must be either 'Waitlisted', 'Rejected', or 'Accepted' if provided.", this.FinalDecision, ValidationErrorType.Failure));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newid()
    * * Description: Unique identifier for the submission
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: EventID
    * * Display Name: Event ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Events (vwEvents.ID)
    * * Description: Event this submission is for
    */
    get EventID(): string {
        return this.Get('EventID');
    }
    set EventID(value: string) {
        this.Set('EventID', value);
    }

    /**
    * * Field Name: TypeformResponseID
    * * Display Name: Typeform Response ID
    * * SQL Data Type: nvarchar(100)
    * * Description: External response ID from Typeform
    */
    get TypeformResponseID(): string | null {
        return this.Get('TypeformResponseID');
    }
    set TypeformResponseID(value: string | null) {
        this.Set('TypeformResponseID', value);
    }

    /**
    * * Field Name: SubmittedAt
    * * Display Name: Submitted At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    * * Description: Timestamp when submission was received
    */
    get SubmittedAt(): Date {
        return this.Get('SubmittedAt');
    }
    set SubmittedAt(value: Date) {
        this.Set('SubmittedAt', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: New
    * * Value List Type: List
    * * Possible Values 
    *   * Accepted
    *   * Analyzing
    *   * Failed Initial
    *   * New
    *   * Passed Initial
    *   * Rejected
    *   * Resubmitted
    *   * Under Review
    *   * Waitlisted
    * * Description: Current status in workflow (New, Analyzing, Passed Initial, Failed Initial, Under Review, Accepted, Rejected, Waitlisted, Resubmitted)
    */
    get Status(): 'Accepted' | 'Analyzing' | 'Failed Initial' | 'New' | 'Passed Initial' | 'Rejected' | 'Resubmitted' | 'Under Review' | 'Waitlisted' {
        return this.Get('Status');
    }
    set Status(value: 'Accepted' | 'Analyzing' | 'Failed Initial' | 'New' | 'Passed Initial' | 'Rejected' | 'Resubmitted' | 'Under Review' | 'Waitlisted') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: SubmissionTitle
    * * Display Name: Submission Title
    * * SQL Data Type: nvarchar(500)
    * * Description: Title of the proposed session or talk
    */
    get SubmissionTitle(): string {
        return this.Get('SubmissionTitle');
    }
    set SubmissionTitle(value: string) {
        this.Set('SubmissionTitle', value);
    }

    /**
    * * Field Name: SubmissionAbstract
    * * Display Name: Submission Abstract
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Full abstract or proposal text as submitted
    */
    get SubmissionAbstract(): string {
        return this.Get('SubmissionAbstract');
    }
    set SubmissionAbstract(value: string) {
        this.Set('SubmissionAbstract', value);
    }

    /**
    * * Field Name: SubmissionSummary
    * * Display Name: Submission Summary
    * * SQL Data Type: nvarchar(MAX)
    * * Description: AI-generated concise summary of the abstract
    */
    get SubmissionSummary(): string | null {
        return this.Get('SubmissionSummary');
    }
    set SubmissionSummary(value: string | null) {
        this.Set('SubmissionSummary', value);
    }

    /**
    * * Field Name: SessionFormat
    * * Display Name: Session Format
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Keynote
    *   * Lightning Talk
    *   * Other
    *   * Panel
    *   * Presentation
    *   * Roundtable
    *   * Tutorial
    *   * Workshop
    * * Description: Format of the proposed session (Workshop, Keynote, Panel, Lightning Talk, Tutorial, Presentation, Roundtable, Other)
    */
    get SessionFormat(): 'Keynote' | 'Lightning Talk' | 'Other' | 'Panel' | 'Presentation' | 'Roundtable' | 'Tutorial' | 'Workshop' | null {
        return this.Get('SessionFormat');
    }
    set SessionFormat(value: 'Keynote' | 'Lightning Talk' | 'Other' | 'Panel' | 'Presentation' | 'Roundtable' | 'Tutorial' | 'Workshop' | null) {
        this.Set('SessionFormat', value);
    }

    /**
    * * Field Name: Duration
    * * Display Name: Duration
    * * SQL Data Type: int
    * * Description: Duration in minutes
    */
    get Duration(): number | null {
        return this.Get('Duration');
    }
    set Duration(value: number | null) {
        this.Set('Duration', value);
    }

    /**
    * * Field Name: TargetAudienceLevel
    * * Display Name: Target Audience Level
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Advanced
    *   * All Levels
    *   * Beginner
    *   * Intermediate
    * * Description: Target audience expertise level (Beginner, Intermediate, Advanced, All Levels)
    */
    get TargetAudienceLevel(): 'Advanced' | 'All Levels' | 'Beginner' | 'Intermediate' | null {
        return this.Get('TargetAudienceLevel');
    }
    set TargetAudienceLevel(value: 'Advanced' | 'All Levels' | 'Beginner' | 'Intermediate' | null) {
        this.Set('TargetAudienceLevel', value);
    }

    /**
    * * Field Name: KeyTopics
    * * Display Name: Key Topics
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON array of key topics extracted by AI
    */
    get KeyTopics(): string | null {
        return this.Get('KeyTopics');
    }
    set KeyTopics(value: string | null) {
        this.Set('KeyTopics', value);
    }

    /**
    * * Field Name: PresentationFileURL
    * * Display Name: Presentation File URL
    * * SQL Data Type: nvarchar(500)
    * * Description: URL to presentation file in Box.com
    */
    get PresentationFileURL(): string | null {
        return this.Get('PresentationFileURL');
    }
    set PresentationFileURL(value: string | null) {
        this.Set('PresentationFileURL', value);
    }

    /**
    * * Field Name: PresentationFileSummary
    * * Display Name: Presentation File Summary
    * * SQL Data Type: nvarchar(MAX)
    * * Description: AI-generated summary of presentation slides/materials
    */
    get PresentationFileSummary(): string | null {
        return this.Get('PresentationFileSummary');
    }
    set PresentationFileSummary(value: string | null) {
        this.Set('PresentationFileSummary', value);
    }

    /**
    * * Field Name: AdditionalMaterialsURLs
    * * Display Name: Additional Materials UR Ls
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON array of additional material URLs
    */
    get AdditionalMaterialsURLs(): string | null {
        return this.Get('AdditionalMaterialsURLs');
    }
    set AdditionalMaterialsURLs(value: string | null) {
        this.Set('AdditionalMaterialsURLs', value);
    }

    /**
    * * Field Name: SpecialRequirements
    * * Display Name: Special Requirements
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Any special requirements (AV equipment, accessibility needs, etc.)
    */
    get SpecialRequirements(): string | null {
        return this.Get('SpecialRequirements');
    }
    set SpecialRequirements(value: string | null) {
        this.Set('SpecialRequirements', value);
    }

    /**
    * * Field Name: AIEvaluationScore
    * * Display Name: AI Evaluation Score
    * * SQL Data Type: decimal(5, 2)
    * * Description: Overall AI evaluation score (0-100)
    */
    get AIEvaluationScore(): number | null {
        return this.Get('AIEvaluationScore');
    }
    set AIEvaluationScore(value: number | null) {
        this.Set('AIEvaluationScore', value);
    }

    /**
    * * Field Name: AIEvaluationReasoning
    * * Display Name: AI Evaluation Reasoning
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Detailed AI explanation of evaluation and score
    */
    get AIEvaluationReasoning(): string | null {
        return this.Get('AIEvaluationReasoning');
    }
    set AIEvaluationReasoning(value: string | null) {
        this.Set('AIEvaluationReasoning', value);
    }

    /**
    * * Field Name: AIEvaluationDimensions
    * * Display Name: AI Evaluation Dimensions
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON object with scores per rubric dimension (relevance, quality, experience, etc.)
    */
    get AIEvaluationDimensions(): string | null {
        return this.Get('AIEvaluationDimensions');
    }
    set AIEvaluationDimensions(value: string | null) {
        this.Set('AIEvaluationDimensions', value);
    }

    /**
    * * Field Name: PassedInitialScreening
    * * Display Name: Passed Initial Screening
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether submission passed baseline screening criteria
    */
    get PassedInitialScreening(): boolean | null {
        return this.Get('PassedInitialScreening');
    }
    set PassedInitialScreening(value: boolean | null) {
        this.Set('PassedInitialScreening', value);
    }

    /**
    * * Field Name: FailureReasons
    * * Display Name: Failure Reasons
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON array of specific failure reasons if screening failed
    */
    get FailureReasons(): string | null {
        return this.Get('FailureReasons');
    }
    set FailureReasons(value: string | null) {
        this.Set('FailureReasons', value);
    }

    /**
    * * Field Name: IsFixable
    * * Display Name: Is Fixable
    * * SQL Data Type: bit
    * * Description: Whether identified issues can be fixed via resubmission
    */
    get IsFixable(): boolean | null {
        return this.Get('IsFixable');
    }
    set IsFixable(value: boolean | null) {
        this.Set('IsFixable', value);
    }

    /**
    * * Field Name: ResubmissionOfID
    * * Display Name: Resubmission Of ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Submissions (vwSubmissions.ID)
    * * Description: Reference to original submission if this is a resubmission
    */
    get ResubmissionOfID(): string | null {
        return this.Get('ResubmissionOfID');
    }
    set ResubmissionOfID(value: string | null) {
        this.Set('ResubmissionOfID', value);
    }

    /**
    * * Field Name: ReviewNotes
    * * Display Name: Review Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Notes added by human reviewers during evaluation
    */
    get ReviewNotes(): string | null {
        return this.Get('ReviewNotes');
    }
    set ReviewNotes(value: string | null) {
        this.Set('ReviewNotes', value);
    }

    /**
    * * Field Name: FinalDecision
    * * Display Name: Final Decision
    * * SQL Data Type: nvarchar(50)
    * * Description: Final decision on submission (Accepted, Rejected, Waitlisted)
    */
    get FinalDecision(): string | null {
        return this.Get('FinalDecision');
    }
    set FinalDecision(value: string | null) {
        this.Set('FinalDecision', value);
    }

    /**
    * * Field Name: FinalDecisionDate
    * * Display Name: Final Decision Date
    * * SQL Data Type: datetime
    * * Description: Date when final decision was made
    */
    get FinalDecisionDate(): Date | null {
        return this.Get('FinalDecisionDate');
    }
    set FinalDecisionDate(value: Date | null) {
        this.Set('FinalDecisionDate', value);
    }

    /**
    * * Field Name: FinalDecisionReasoning
    * * Display Name: Final Decision Reasoning
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Explanation for final decision
    */
    get FinalDecisionReasoning(): string | null {
        return this.Get('FinalDecisionReasoning');
    }
    set FinalDecisionReasoning(value: string | null) {
        this.Set('FinalDecisionReasoning', value);
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

    /**
    * * Field Name: Event
    * * Display Name: Event
    * * SQL Data Type: nvarchar(200)
    */
    get Event(): string {
        return this.Get('Event');
    }

    /**
    * * Field Name: RootResubmissionOfID
    * * Display Name: Root Resubmission Of ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootResubmissionOfID(): string | null {
        return this.Get('RootResubmissionOfID');
    }
}
