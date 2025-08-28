import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Account Status
 */
export const AccountStatusSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    StatusName: z.union([z.literal('Active'), z.literal('Inactive'), z.literal('On Hold'), z.literal('Closed')]).describe(`
        * * Field Name: StatusName
        * * Display Name: Status Name
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    *   * On Hold
    *   * Closed
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
    TypeName: z.union([z.literal('Prospect'), z.literal('Customer'), z.literal('Vendor'), z.literal('Partner'), z.literal('Competitor'), z.literal('Other')]).describe(`
        * * Field Name: TypeName
        * * Display Name: Type Name
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Prospect
    *   * Customer
    *   * Vendor
    *   * Partner
    *   * Competitor
    *   * Other
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
    AccountName: z.string().describe(`
        * * Field Name: AccountName
        * * Display Name: Account Name
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
    AccountType: z.union([z.literal('Prospect'), z.literal('Customer'), z.literal('Vendor'), z.literal('Partner'), z.literal('Competitor'), z.literal('Other')]).nullable().describe(`
        * * Field Name: AccountType
        * * Display Name: Account Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Prospect
    *   * Customer
    *   * Vendor
    *   * Partner
    *   * Competitor
    *   * Other
        * * Description: Type of relationship with the account (Prospect, Customer, etc.)`),
    AccountStatus: z.union([z.literal('Active'), z.literal('Inactive'), z.literal('On Hold'), z.literal('Closed')]).nullable().describe(`
        * * Field Name: AccountStatus
        * * Display Name: Account Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    *   * On Hold
    *   * Closed
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
    ActivityType: z.union([z.literal('Call'), z.literal('Email'), z.literal('Meeting'), z.literal('Task'), z.literal('Note'), z.literal('Demo'), z.literal('Site Visit'), z.literal('Other')]).describe(`
        * * Field Name: ActivityType
        * * Display Name: Activity Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Call
    *   * Email
    *   * Meeting
    *   * Task
    *   * Note
    *   * Demo
    *   * Site Visit
    *   * Other
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
    Status: z.union([z.literal('Planned'), z.literal('In Progress'), z.literal('Completed'), z.literal('Canceled'), z.literal('Deferred')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Planned
    *   * In Progress
    *   * Completed
    *   * Canceled
    *   * Deferred
        * * Description: Current status of the activity (Planned, Completed, etc.)`),
    Priority: z.union([z.literal('High'), z.literal('Medium'), z.literal('Low')]).nullable().describe(`
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: nvarchar(10)
    * * Value List Type: List
    * * Possible Values 
    *   * High
    *   * Medium
    *   * Low
        * * Description: Priority level of the activity (High, Medium, Low)`),
    Direction: z.union([z.literal('Inbound'), z.literal('Outbound'), z.literal('Internal')]).nullable().describe(`
        * * Field Name: Direction
        * * Display Name: Direction
        * * SQL Data Type: nvarchar(10)
    * * Value List Type: List
    * * Possible Values 
    *   * Inbound
    *   * Outbound
    *   * Internal
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
    TypeName: z.union([z.literal('Call'), z.literal('Email'), z.literal('Meeting'), z.literal('Task'), z.literal('Note'), z.literal('Demo'), z.literal('Site Visit'), z.literal('Other')]).describe(`
        * * Field Name: TypeName
        * * Display Name: Type Name
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Call
    *   * Email
    *   * Meeting
    *   * Task
    *   * Note
    *   * Demo
    *   * Site Visit
    *   * Other
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
    PreferredContactMethod: z.union([z.literal('Email'), z.literal('Phone'), z.literal('Mobile'), z.literal('Mail'), z.literal('None')]).nullable().describe(`
        * * Field Name: PreferredContactMethod
        * * Display Name: Preferred Contact Method
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Email
    *   * Phone
    *   * Mobile
    *   * Mail
    *   * None
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
    DealName: z.string().describe(`
        * * Field Name: DealName
        * * Display Name: Deal Name
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
    Stage: z.union([z.literal('Prospecting'), z.literal('Qualification'), z.literal('Proposal'), z.literal('Negotiation'), z.literal('Closed Won'), z.literal('Closed Lost')]).describe(`
        * * Field Name: Stage
        * * Display Name: Stage
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Prospecting
    *   * Qualification
    *   * Proposal
    *   * Negotiation
    *   * Closed Won
    *   * Closed Lost
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
    DealSource: z.union([z.literal('Web'), z.literal('Referral'), z.literal('Cold Call'), z.literal('Trade Show'), z.literal('Marketing Campaign'), z.literal('Partner'), z.literal('Direct'), z.literal('Other')]).nullable().describe(`
        * * Field Name: DealSource
        * * Display Name: Deal Source
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Web
    *   * Referral
    *   * Cold Call
    *   * Trade Show
    *   * Marketing Campaign
    *   * Partner
    *   * Direct
    *   * Other
        * * Description: Origin of the deal (Web, Referral, Cold Call, Trade Show, Marketing Campaign, Partner, Direct, Other)`),
    CompetitorName: z.string().nullable().describe(`
        * * Field Name: CompetitorName
        * * Display Name: Competitor Name
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
});

export type DealEntityType = z.infer<typeof DealSchema>;

/**
 * zod schema definition for the entity Industries
 */
export const IndustrySchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    IndustryName: z.string().describe(`
        * * Field Name: IndustryName
        * * Display Name: Industry Name
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
    Status: z.union([z.literal('Draft'), z.literal('Sent'), z.literal('Paid'), z.literal('Partial'), z.literal('Overdue'), z.literal('Cancelled')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Draft
    *   * Sent
    *   * Paid
    *   * Partial
    *   * Overdue
    *   * Cancelled
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
    PaymentMethod: z.union([z.literal('Check'), z.literal('Credit Card'), z.literal('Wire Transfer'), z.literal('ACH'), z.literal('Cash'), z.literal('Other')]).nullable().describe(`
        * * Field Name: PaymentMethod
        * * Display Name: Payment Method
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Check
    *   * Credit Card
    *   * Wire Transfer
    *   * ACH
    *   * Cash
    *   * Other
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
    ProductName: z.string().describe(`
        * * Field Name: ProductName
        * * Display Name: Product Name
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
    UnitOfMeasure: z.union([z.literal('Each'), z.literal('Hour'), z.literal('License'), z.literal('Subscription'), z.literal('User'), z.literal('GB'), z.literal('Unit')]).nullable().describe(`
        * * Field Name: UnitOfMeasure
        * * Display Name: Unit Of Measure
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Each
    *   * Hour
    *   * License
    *   * Subscription
    *   * User
    *   * GB
    *   * Unit
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
    TypeName: z.string().describe(`
        * * Field Name: TypeName
        * * Display Name: Type Name
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
});

export type RelationshipTypeEntityType = z.infer<typeof RelationshipTypeSchema>;
 
 

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
    * * Field Name: StatusName
    * * Display Name: Status Name
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    *   * On Hold
    *   * Closed
    * * Description: Name of the account status
    */
    get StatusName(): 'Active' | 'Inactive' | 'On Hold' | 'Closed' {
        return this.Get('StatusName');
    }
    set StatusName(value: 'Active' | 'Inactive' | 'On Hold' | 'Closed') {
        this.Set('StatusName', value);
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
    * * Field Name: TypeName
    * * Display Name: Type Name
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Prospect
    *   * Customer
    *   * Vendor
    *   * Partner
    *   * Competitor
    *   * Other
    * * Description: Name of the account type
    */
    get TypeName(): 'Prospect' | 'Customer' | 'Vendor' | 'Partner' | 'Competitor' | 'Other' {
        return this.Get('TypeName');
    }
    set TypeName(value: 'Prospect' | 'Customer' | 'Vendor' | 'Partner' | 'Competitor' | 'Other') {
        this.Set('TypeName', value);
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
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: AccountName
    * * Display Name: Account Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Official name of the organization or company
    */
    get AccountName(): string {
        return this.Get('AccountName');
    }
    set AccountName(value: string) {
        this.Set('AccountName', value);
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
    *   * Prospect
    *   * Customer
    *   * Vendor
    *   * Partner
    *   * Competitor
    *   * Other
    * * Description: Type of relationship with the account (Prospect, Customer, etc.)
    */
    get AccountType(): 'Prospect' | 'Customer' | 'Vendor' | 'Partner' | 'Competitor' | 'Other' | null {
        return this.Get('AccountType');
    }
    set AccountType(value: 'Prospect' | 'Customer' | 'Vendor' | 'Partner' | 'Competitor' | 'Other' | null) {
        this.Set('AccountType', value);
    }

    /**
    * * Field Name: AccountStatus
    * * Display Name: Account Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    *   * On Hold
    *   * Closed
    * * Description: Current status of the account (Active, Inactive, etc.)
    */
    get AccountStatus(): 'Active' | 'Inactive' | 'On Hold' | 'Closed' | null {
        return this.Get('AccountStatus');
    }
    set AccountStatus(value: 'Active' | 'Inactive' | 'On Hold' | 'Closed' | null) {
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
    *   * Email
    *   * Meeting
    *   * Task
    *   * Note
    *   * Demo
    *   * Site Visit
    *   * Other
    * * Description: Type of activity (Call, Email, Meeting, etc.)
    */
    get ActivityType(): 'Call' | 'Email' | 'Meeting' | 'Task' | 'Note' | 'Demo' | 'Site Visit' | 'Other' {
        return this.Get('ActivityType');
    }
    set ActivityType(value: 'Call' | 'Email' | 'Meeting' | 'Task' | 'Note' | 'Demo' | 'Site Visit' | 'Other') {
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
    *   * Planned
    *   * In Progress
    *   * Completed
    *   * Canceled
    *   * Deferred
    * * Description: Current status of the activity (Planned, Completed, etc.)
    */
    get Status(): 'Planned' | 'In Progress' | 'Completed' | 'Canceled' | 'Deferred' {
        return this.Get('Status');
    }
    set Status(value: 'Planned' | 'In Progress' | 'Completed' | 'Canceled' | 'Deferred') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Priority
    * * Display Name: Priority
    * * SQL Data Type: nvarchar(10)
    * * Value List Type: List
    * * Possible Values 
    *   * High
    *   * Medium
    *   * Low
    * * Description: Priority level of the activity (High, Medium, Low)
    */
    get Priority(): 'High' | 'Medium' | 'Low' | null {
        return this.Get('Priority');
    }
    set Priority(value: 'High' | 'Medium' | 'Low' | null) {
        this.Set('Priority', value);
    }

    /**
    * * Field Name: Direction
    * * Display Name: Direction
    * * SQL Data Type: nvarchar(10)
    * * Value List Type: List
    * * Possible Values 
    *   * Inbound
    *   * Outbound
    *   * Internal
    * * Description: Direction of communication (Inbound, Outbound, Internal)
    */
    get Direction(): 'Inbound' | 'Outbound' | 'Internal' | null {
        return this.Get('Direction');
    }
    set Direction(value: 'Inbound' | 'Outbound' | 'Internal' | null) {
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
    * * Field Name: TypeName
    * * Display Name: Type Name
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Call
    *   * Email
    *   * Meeting
    *   * Task
    *   * Note
    *   * Demo
    *   * Site Visit
    *   * Other
    * * Description: Name of the activity type
    */
    get TypeName(): 'Call' | 'Email' | 'Meeting' | 'Task' | 'Note' | 'Demo' | 'Site Visit' | 'Other' {
        return this.Get('TypeName');
    }
    set TypeName(value: 'Call' | 'Email' | 'Meeting' | 'Task' | 'Note' | 'Demo' | 'Site Visit' | 'Other') {
        this.Set('TypeName', value);
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
    * * Table-Level: This rule ensures that if the end date is provided, it must be the same as or after the start date. If the end date is left blank, that's allowed.
    * * Table-Level: This rule ensures that the Primary Contact and the Related Contact must be different people. You cannot have the same person assigned as both the primary and related contact.  
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateEndDateAfterOrEqualsStartDate(result);
        this.ValidatePrimaryContactIDNotEqualRelatedContactID(result);

        return result;
    }

    /**
    * This rule ensures that if the end date is provided, it must be the same as or after the start date. If the end date is left blank, that's allowed.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateEndDateAfterOrEqualsStartDate(result: ValidationResult) {
    	if (this.EndDate !== null && this.EndDate < this.StartDate) {
    		result.Errors.push(new ValidationErrorInfo("EndDate", "End date must be the same as or after the start date.", this.EndDate, ValidationErrorType.Failure));
    	}
    }

    /**
    * This rule ensures that the Primary Contact and the Related Contact must be different people. You cannot have the same person assigned as both the primary and related contact.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidatePrimaryContactIDNotEqualRelatedContactID(result: ValidationResult) {
    	if (this.PrimaryContactID === this.RelatedContactID) {
    		result.Errors.push(new ValidationErrorInfo("PrimaryContactID", "Primary Contact and Related Contact cannot be the same person.", this.PrimaryContactID, ValidationErrorType.Failure));
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
    *   * Phone
    *   * Mobile
    *   * Mail
    *   * None
    * * Description: Preferred method of communication (Email, Phone, Mobile, etc.)
    */
    get PreferredContactMethod(): 'Email' | 'Phone' | 'Mobile' | 'Mail' | 'None' | null {
        return this.Get('PreferredContactMethod');
    }
    set PreferredContactMethod(value: 'Email' | 'Phone' | 'Mobile' | 'Mail' | 'None' | null) {
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
    * * Discount: This rule ensures that the Discount value is between 0 and 100, inclusive.
    * * Quantity: This rule ensures that the quantity for a deal product must be greater than zero. Negative quantities or zero are not allowed.  
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateDiscountIsBetweenZeroAndHundred(result);
        this.ValidateQuantityGreaterThanZero(result);

        return result;
    }

    /**
    * This rule ensures that the Discount value is between 0 and 100, inclusive.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateDiscountIsBetweenZeroAndHundred(result: ValidationResult) {
    	if (this.Discount < 0 || this.Discount > 100) {
    		result.Errors.push(new ValidationErrorInfo("Discount", "Discount must be between 0 and 100, inclusive.", this.Discount, ValidationErrorType.Failure));
    	}
    }

    /**
    * This rule ensures that the quantity for a deal product must be greater than zero. Negative quantities or zero are not allowed.
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
    * * Probability: This rule ensures that the probability value for the deal must be between 0 and 100, inclusive.  
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateProbabilityWithinRange(result);

        return result;
    }

    /**
    * This rule ensures that the probability value for the deal must be between 0 and 100, inclusive.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateProbabilityWithinRange(result: ValidationResult) {
    	if (this.Probability < 0 || this.Probability > 100) {
    		result.Errors.push(new ValidationErrorInfo("Probability", "Probability must be between 0 and 100.", this.Probability, ValidationErrorType.Failure));
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
    * * Field Name: DealName
    * * Display Name: Deal Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Descriptive name for the deal or opportunity
    */
    get DealName(): string {
        return this.Get('DealName');
    }
    set DealName(value: string) {
        this.Set('DealName', value);
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
    *   * Prospecting
    *   * Qualification
    *   * Proposal
    *   * Negotiation
    *   * Closed Won
    *   * Closed Lost
    * * Description: Current stage in the sales pipeline (Prospecting, Qualification, Proposal, Negotiation, Closed Won, Closed Lost)
    */
    get Stage(): 'Prospecting' | 'Qualification' | 'Proposal' | 'Negotiation' | 'Closed Won' | 'Closed Lost' {
        return this.Get('Stage');
    }
    set Stage(value: 'Prospecting' | 'Qualification' | 'Proposal' | 'Negotiation' | 'Closed Won' | 'Closed Lost') {
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
    *   * Web
    *   * Referral
    *   * Cold Call
    *   * Trade Show
    *   * Marketing Campaign
    *   * Partner
    *   * Direct
    *   * Other
    * * Description: Origin of the deal (Web, Referral, Cold Call, Trade Show, Marketing Campaign, Partner, Direct, Other)
    */
    get DealSource(): 'Web' | 'Referral' | 'Cold Call' | 'Trade Show' | 'Marketing Campaign' | 'Partner' | 'Direct' | 'Other' | null {
        return this.Get('DealSource');
    }
    set DealSource(value: 'Web' | 'Referral' | 'Cold Call' | 'Trade Show' | 'Marketing Campaign' | 'Partner' | 'Direct' | 'Other' | null) {
        this.Set('DealSource', value);
    }

    /**
    * * Field Name: CompetitorName
    * * Display Name: Competitor Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Name of competing company or solution being considered
    */
    get CompetitorName(): string | null {
        return this.Get('CompetitorName');
    }
    set CompetitorName(value: string | null) {
        this.Set('CompetitorName', value);
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
    * * Field Name: IndustryName
    * * Display Name: Industry Name
    * * SQL Data Type: nvarchar(50)
    * * Description: Name of the industry
    */
    get IndustryName(): string {
        return this.Get('IndustryName');
    }
    set IndustryName(value: string) {
        this.Set('IndustryName', value);
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
    * * Discount: This rule ensures that the Discount value must be between 0 and 100, inclusive. In other words, discounts cannot be negative or greater than 100.
    * * Quantity: This rule ensures that the quantity must always be greater than zero. Negative or zero quantities are not allowed.  
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateDiscountIsBetweenZeroAndHundred(result);
        this.ValidateQuantityGreaterThanZero(result);

        return result;
    }

    /**
    * This rule ensures that the Discount value must be between 0 and 100, inclusive. In other words, discounts cannot be negative or greater than 100.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateDiscountIsBetweenZeroAndHundred(result: ValidationResult) {
    	if (this.Discount < 0 || this.Discount > 100) {
    		result.Errors.push(new ValidationErrorInfo("Discount", "Discount must be between 0 and 100, inclusive.", this.Discount, ValidationErrorType.Failure));
    	}
    }

    /**
    * This rule ensures that the quantity must always be greater than zero. Negative or zero quantities are not allowed.
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
    * * TaxRate: This rule ensures that the tax rate must be between 0 and 100, inclusive.
    * * Table-Level: This rule ensures that the due date for an invoice is either the same as or comes after the invoice date. In other words, an invoice cannot be due before it is created.  
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateTaxRateWithinZeroAndHundred(result);
        this.ValidateDueDateAfterOrEqualToInvoiceDate(result);

        return result;
    }

    /**
    * This rule ensures that the tax rate must be between 0 and 100, inclusive.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateTaxRateWithinZeroAndHundred(result: ValidationResult) {
    	if (this.TaxRate < 0 || this.TaxRate > 100) {
    		result.Errors.push(new ValidationErrorInfo("TaxRate", "The tax rate must be between 0 and 100, inclusive.", this.TaxRate, ValidationErrorType.Failure));
    	}
    }

    /**
    * This rule ensures that the due date for an invoice is either the same as or comes after the invoice date. In other words, an invoice cannot be due before it is created.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateDueDateAfterOrEqualToInvoiceDate(result: ValidationResult) {
    	if (this.DueDate && this.InvoiceDate && this.DueDate < this.InvoiceDate) {
    		result.Errors.push(new ValidationErrorInfo("DueDate", "The due date must be the same as or after the invoice date.", this.DueDate, ValidationErrorType.Failure));
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
    *   * Draft
    *   * Sent
    *   * Paid
    *   * Partial
    *   * Overdue
    *   * Cancelled
    * * Description: Current status of the invoice (Draft, Sent, Paid, Partial, Overdue, Cancelled)
    */
    get Status(): 'Draft' | 'Sent' | 'Paid' | 'Partial' | 'Overdue' | 'Cancelled' {
        return this.Get('Status');
    }
    set Status(value: 'Draft' | 'Sent' | 'Paid' | 'Partial' | 'Overdue' | 'Cancelled') {
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
    * * Amount: This rule ensures that the payment amount must be greater than zero. Negative or zero amounts are not allowed.  
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateAmountGreaterThanZero(result);

        return result;
    }

    /**
    * This rule ensures that the payment amount must be greater than zero. Negative or zero amounts are not allowed.
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
    *   * Check
    *   * Credit Card
    *   * Wire Transfer
    *   * ACH
    *   * Cash
    *   * Other
    * * Description: Method of payment (Check, Credit Card, Wire Transfer, ACH, Cash, Other)
    */
    get PaymentMethod(): 'Check' | 'Credit Card' | 'Wire Transfer' | 'ACH' | 'Cash' | 'Other' | null {
        return this.Get('PaymentMethod');
    }
    set PaymentMethod(value: 'Check' | 'Credit Card' | 'Wire Transfer' | 'ACH' | 'Cash' | 'Other' | null) {
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
    * * RecurringBillingPeriod: This rule ensures that if a recurring billing period is specified, it must be either 'Biannual', 'Annual', 'Quarterly', or 'Monthly'. Alternatively, the value can be left blank.  
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateRecurringBillingPeriodIsAllowedValue(result);

        return result;
    }

    /**
    * This rule ensures that if a recurring billing period is specified, it must be either 'Biannual', 'Annual', 'Quarterly', or 'Monthly'. Alternatively, the value can be left blank.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateRecurringBillingPeriodIsAllowedValue(result: ValidationResult) {
    	const allowedValues = ["Biannual", "Annual", "Quarterly", "Monthly"];
    	if (this.RecurringBillingPeriod !== null && !allowedValues.includes(this.RecurringBillingPeriod)) {
    		result.Errors.push(new ValidationErrorInfo(
    			"RecurringBillingPeriod",
    			"If specified, the recurring billing period must be one of: 'Biannual', 'Annual', 'Quarterly', or 'Monthly'.",
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
    * * Field Name: ProductName
    * * Display Name: Product Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Display name of the product or service
    */
    get ProductName(): string {
        return this.Get('ProductName');
    }
    set ProductName(value: string) {
        this.Set('ProductName', value);
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
    *   * Hour
    *   * License
    *   * Subscription
    *   * User
    *   * GB
    *   * Unit
    * * Description: How the product is measured and sold (Each, Hour, License, Subscription, User, GB, Unit)
    */
    get UnitOfMeasure(): 'Each' | 'Hour' | 'License' | 'Subscription' | 'User' | 'GB' | 'Unit' | null {
        return this.Get('UnitOfMeasure');
    }
    set UnitOfMeasure(value: 'Each' | 'Hour' | 'License' | 'Subscription' | 'User' | 'GB' | 'Unit' | null) {
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
    * * Field Name: TypeName
    * * Display Name: Type Name
    * * SQL Data Type: nvarchar(50)
    * * Description: Name of the relationship type (e.g., Parent, Child, Spouse)
    */
    get TypeName(): string {
        return this.Get('TypeName');
    }
    set TypeName(value: string) {
        this.Set('TypeName', value);
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
}
