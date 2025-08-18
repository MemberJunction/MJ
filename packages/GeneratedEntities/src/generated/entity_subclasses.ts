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
    * * Table-Level: This rule ensures that if an end date is provided, it cannot be earlier than the start date.
    * * Table-Level: This rule ensures that the primary contact and the related contact are not the same person. The IDs for each must be different.  
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateEndDateAfterOrNullComparedToStartDate(result);
        this.ValidatePrimaryContactIDNotEqualRelatedContactID(result);

        return result;
    }

    /**
    * This rule ensures that if an end date is provided, it cannot be earlier than the start date.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateEndDateAfterOrNullComparedToStartDate(result: ValidationResult) {
    	if (this.EndDate !== null && this.EndDate < this.StartDate) {
    		result.Errors.push(new ValidationErrorInfo("EndDate", "If provided, End Date cannot be before Start Date.", this.EndDate, ValidationErrorType.Failure));
    	}
    }

    /**
    * This rule ensures that the primary contact and the related contact are not the same person. The IDs for each must be different.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidatePrimaryContactIDNotEqualRelatedContactID(result: ValidationResult) {
    	if (this.PrimaryContactID === this.RelatedContactID) {
    		result.Errors.push(new ValidationErrorInfo("PrimaryContactID", "The Primary Contact and Related Contact cannot be the same person.", this.PrimaryContactID, ValidationErrorType.Failure));
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
