import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Activities
 */
export const ActivitiesSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Primary key for the activity record`),
    Type: z.union([z.literal('Call'), z.literal('Email'), z.literal('Meeting'), z.literal('Note'), z.literal('Task')]).describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Call
    *   * Email
    *   * Meeting
    *   * Note
    *   * Task
        * * Description: Activity type: Call, Email, Meeting, Note, or Task`),
    Subject: z.string().describe(`
        * * Field Name: Subject
        * * Display Name: Subject
        * * SQL Data Type: nvarchar(500)
        * * Description: Brief subject line for the activity`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed description or body of the activity`),
    ActivityDate: z.date().describe(`
        * * Field Name: ActivityDate
        * * Display Name: Activity Date
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()
        * * Description: When the activity occurred or is scheduled`),
    DurationMinutes: z.number().nullable().describe(`
        * * Field Name: DurationMinutes
        * * Display Name: Duration Minutes
        * * SQL Data Type: int
        * * Description: Duration of the activity in minutes`),
    CompanyID: z.string().nullable().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Companies (vwCompanies.ID)
        * * Description: Optional link to a company`),
    ContactID: z.string().nullable().describe(`
        * * Field Name: ContactID
        * * Display Name: Contact ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
        * * Description: Optional link to a contact`),
    DealID: z.string().nullable().describe(`
        * * Field Name: DealID
        * * Display Name: Deal ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Deals (vwDeals.ID)
        * * Description: Optional link to a deal`),
    CompletedAt: z.date().nullable().describe(`
        * * Field Name: CompletedAt
        * * Display Name: Completed At
        * * SQL Data Type: datetime
        * * Description: Timestamp when the activity was completed, null if pending`),
    CreatedByUserID: z.string().nullable().describe(`
        * * Field Name: CreatedByUserID
        * * Display Name: Created By User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
        * * Description: User who created this activity record`),
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
    Company: z.string().nullable().describe(`
        * * Field Name: Company
        * * Display Name: Company
        * * SQL Data Type: nvarchar(200)`),
    Deal: z.string().nullable().describe(`
        * * Field Name: Deal
        * * Display Name: Deal
        * * SQL Data Type: nvarchar(200)`),
    CreatedByUser: z.string().nullable().describe(`
        * * Field Name: CreatedByUser
        * * Display Name: Created By User
        * * SQL Data Type: nvarchar(100)`),
});

export type ActivitiesEntityType = z.infer<typeof ActivitiesSchema>;

/**
 * zod schema definition for the entity Companies
 */
export const CompaniesSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Primary key for the company record`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Legal or trading name of the company`),
    Industry: z.string().nullable().describe(`
        * * Field Name: Industry
        * * Display Name: Industry
        * * SQL Data Type: nvarchar(100)
        * * Description: Industry vertical the company operates in`),
    Website: z.string().nullable().describe(`
        * * Field Name: Website
        * * Display Name: Website
        * * SQL Data Type: nvarchar(500)
        * * Description: Company website URL`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(50)
        * * Description: Main phone number`),
    AnnualRevenue: z.number().nullable().describe(`
        * * Field Name: AnnualRevenue
        * * Display Name: Annual Revenue
        * * SQL Data Type: decimal(18, 2)
        * * Description: Estimated annual revenue in USD`),
    EmployeeCount: z.number().nullable().describe(`
        * * Field Name: EmployeeCount
        * * Display Name: Employee Count
        * * SQL Data Type: int
        * * Description: Approximate number of employees`),
    Status: z.union([z.literal('Active'), z.literal('Churned'), z.literal('Inactive'), z.literal('Prospect')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Churned
    *   * Inactive
    *   * Prospect
        * * Description: Current relationship status: Active, Inactive, Prospect, or Churned`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Free-form notes about the company`),
    CreatedByUserID: z.string().nullable().describe(`
        * * Field Name: CreatedByUserID
        * * Display Name: Created By User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
        * * Description: User who created this company record`),
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
    CreatedByUser: z.string().nullable().describe(`
        * * Field Name: CreatedByUser
        * * Display Name: Created By User
        * * SQL Data Type: nvarchar(100)`),
});

export type CompaniesEntityType = z.infer<typeof CompaniesSchema>;

/**
 * zod schema definition for the entity Company Tags
 */
export const CompanyTagsSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Primary key`),
    CompanyID: z.string().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Companies (vwCompanies.ID)
        * * Description: The company being tagged`),
    TagID: z.string().describe(`
        * * Field Name: TagID
        * * Display Name: Tag ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Tags (vwTags.ID)
        * * Description: The tag applied to the company`),
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
    Company: z.string().describe(`
        * * Field Name: Company
        * * Display Name: Company
        * * SQL Data Type: nvarchar(200)`),
    Tag: z.string().describe(`
        * * Field Name: Tag
        * * Display Name: Tag
        * * SQL Data Type: nvarchar(100)`),
});

export type CompanyTagsEntityType = z.infer<typeof CompanyTagsSchema>;

/**
 * zod schema definition for the entity Contact Tags
 */
export const ContactTagsSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Primary key`),
    ContactID: z.string().describe(`
        * * Field Name: ContactID
        * * Display Name: Contact ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
        * * Description: The contact being tagged`),
    TagID: z.string().describe(`
        * * Field Name: TagID
        * * Display Name: Tag ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Tags (vwTags.ID)
        * * Description: The tag applied to the contact`),
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
    Tag: z.string().describe(`
        * * Field Name: Tag
        * * Display Name: Tag
        * * SQL Data Type: nvarchar(100)`),
});

export type ContactTagsEntityType = z.infer<typeof ContactTagsSchema>;

/**
 * zod schema definition for the entity Contacts
 */
export const ContactsSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Primary key for the contact record`),
    CompanyID: z.string().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Companies (vwCompanies.ID)
        * * Description: Company this contact belongs to`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Contact first name`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Contact last name`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(200)
        * * Description: Email address`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(50)
        * * Description: Direct phone number`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(100)
        * * Description: Job title`),
    Department: z.string().nullable().describe(`
        * * Field Name: Department
        * * Display Name: Department
        * * SQL Data Type: nvarchar(100)
        * * Description: Department within the company`),
    ReportsToContactID: z.string().nullable().describe(`
        * * Field Name: ReportsToContactID
        * * Display Name: Reports To Contact ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
        * * Description: Self-referential FK to the contact this person reports to`),
    IsPrimary: z.boolean().describe(`
        * * Field Name: IsPrimary
        * * Display Name: Is Primary
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this is the primary contact for the company`),
    Status: z.union([z.literal('Active'), z.literal('Churned'), z.literal('Inactive'), z.literal('Prospect')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Churned
    *   * Inactive
    *   * Prospect
        * * Description: Current status: Active, Inactive, Prospect, or Churned`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Free-form notes about the contact`),
    CreatedByUserID: z.string().nullable().describe(`
        * * Field Name: CreatedByUserID
        * * Display Name: Created By User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
        * * Description: User who created this contact record`),
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
    Company: z.string().describe(`
        * * Field Name: Company
        * * Display Name: Company
        * * SQL Data Type: nvarchar(200)`),
    CreatedByUser: z.string().nullable().describe(`
        * * Field Name: CreatedByUser
        * * Display Name: Created By User
        * * SQL Data Type: nvarchar(100)`),
    RootReportsToContactID: z.string().nullable().describe(`
        * * Field Name: RootReportsToContactID
        * * Display Name: Root Reports To Contact ID
        * * SQL Data Type: uniqueidentifier`),
});

export type ContactsEntityType = z.infer<typeof ContactsSchema>;

/**
 * zod schema definition for the entity Deal Products
 */
export const DealProductsSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Primary key for the deal-product link`),
    DealID: z.string().describe(`
        * * Field Name: DealID
        * * Display Name: Deal ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Deals (vwDeals.ID)
        * * Description: Deal this product is part of`),
    ProductID: z.string().describe(`
        * * Field Name: ProductID
        * * Display Name: Product ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Products (vwProducts.ID)
        * * Description: Product being sold in this deal`),
    Quantity: z.number().describe(`
        * * Field Name: Quantity
        * * Display Name: Quantity
        * * SQL Data Type: int
        * * Default Value: 1
        * * Description: Number of units included in the deal`),
    UnitPrice: z.number().describe(`
        * * Field Name: UnitPrice
        * * Display Name: Unit Price
        * * SQL Data Type: decimal(18, 2)
        * * Description: Price per unit for this deal, may differ from catalog price`),
    Discount: z.number().describe(`
        * * Field Name: Discount
        * * Display Name: Discount
        * * SQL Data Type: decimal(5, 2)
        * * Default Value: 0
        * * Description: Discount percentage from 0 to 100`),
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

export type DealProductsEntityType = z.infer<typeof DealProductsSchema>;

/**
 * zod schema definition for the entity Deal Tags
 */
export const DealTagsSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Primary key`),
    DealID: z.string().describe(`
        * * Field Name: DealID
        * * Display Name: Deal ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Deals (vwDeals.ID)
        * * Description: The deal being tagged`),
    TagID: z.string().describe(`
        * * Field Name: TagID
        * * Display Name: Tag ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Tags (vwTags.ID)
        * * Description: The tag applied to the deal`),
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
    Tag: z.string().describe(`
        * * Field Name: Tag
        * * Display Name: Tag
        * * SQL Data Type: nvarchar(100)`),
});

export type DealTagsEntityType = z.infer<typeof DealTagsSchema>;

/**
 * zod schema definition for the entity Deals
 */
export const DealsSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Primary key for the deal record`),
    CompanyID: z.string().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Companies (vwCompanies.ID)
        * * Description: Company this deal is associated with`),
    ContactID: z.string().describe(`
        * * Field Name: ContactID
        * * Display Name: Contact ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
        * * Description: Primary contact for this deal`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Short name or title of the deal`),
    Amount: z.number().nullable().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(18, 2)
        * * Description: Total deal value in USD`),
    Stage: z.union([z.literal('Closed Lost'), z.literal('Closed Won'), z.literal('Lead'), z.literal('Negotiation'), z.literal('Proposal'), z.literal('Qualified')]).describe(`
        * * Field Name: Stage
        * * Display Name: Stage
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Closed Lost
    *   * Closed Won
    *   * Lead
    *   * Negotiation
    *   * Proposal
    *   * Qualified
        * * Description: Current sales stage: Lead, Qualified, Proposal, Negotiation, Closed Won, or Closed Lost`),
    Probability: z.number().nullable().describe(`
        * * Field Name: Probability
        * * Display Name: Probability
        * * SQL Data Type: int
        * * Description: Win probability percentage from 0 to 100`),
    ExpectedCloseDate: z.date().nullable().describe(`
        * * Field Name: ExpectedCloseDate
        * * Display Name: Expected Close Date
        * * SQL Data Type: datetime
        * * Description: Projected close date`),
    ActualCloseDate: z.date().nullable().describe(`
        * * Field Name: ActualCloseDate
        * * Display Name: Actual Close Date
        * * SQL Data Type: datetime
        * * Description: Date the deal was actually closed, null if still open`),
    AssignedToUserID: z.string().nullable().describe(`
        * * Field Name: AssignedToUserID
        * * Display Name: Assigned To User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
        * * Description: Sales rep assigned to this deal`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Free-form notes about the deal`),
    CreatedByUserID: z.string().nullable().describe(`
        * * Field Name: CreatedByUserID
        * * Display Name: Created By User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
        * * Description: User who created this deal record`),
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
    Company: z.string().describe(`
        * * Field Name: Company
        * * Display Name: Company
        * * SQL Data Type: nvarchar(200)`),
    AssignedToUser: z.string().nullable().describe(`
        * * Field Name: AssignedToUser
        * * Display Name: Assigned To User
        * * SQL Data Type: nvarchar(100)`),
    CreatedByUser: z.string().nullable().describe(`
        * * Field Name: CreatedByUser
        * * Display Name: Created By User
        * * SQL Data Type: nvarchar(100)`),
});

export type DealsEntityType = z.infer<typeof DealsSchema>;

/**
 * zod schema definition for the entity Pipeline Stages
 */
export const PipelineStagesSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Primary key for the pipeline stage`),
    PipelineID: z.string().describe(`
        * * Field Name: PipelineID
        * * Display Name: Pipeline ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Pipelines (vwPipelines.ID)
        * * Description: Pipeline this stage belongs to`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Stage display name`),
    DisplayOrder: z.number().describe(`
        * * Field Name: DisplayOrder
        * * Display Name: Display Order
        * * SQL Data Type: int
        * * Description: Ordering position within the pipeline, lower numbers appear first`),
    Probability: z.number().describe(`
        * * Field Name: Probability
        * * Display Name: Probability
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Default win probability percentage for deals entering this stage`),
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
    Pipeline: z.string().describe(`
        * * Field Name: Pipeline
        * * Display Name: Pipeline
        * * SQL Data Type: nvarchar(200)`),
});

export type PipelineStagesEntityType = z.infer<typeof PipelineStagesSchema>;

/**
 * zod schema definition for the entity Pipelines
 */
export const PipelinesSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Primary key for the pipeline`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Display name of the pipeline`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Description of the pipeline purpose and usage`),
    IsDefault: z.boolean().describe(`
        * * Field Name: IsDefault
        * * Display Name: Is Default
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this is the default pipeline for new deals`),
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

export type PipelinesEntityType = z.infer<typeof PipelinesSchema>;

/**
 * zod schema definition for the entity Products
 */
export const ProductsSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Primary key for the product record`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Product display name`),
    SKU: z.string().nullable().describe(`
        * * Field Name: SKU
        * * Display Name: SKU
        * * SQL Data Type: nvarchar(50)
        * * Description: Stock keeping unit, unique product identifier`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed product description`),
    UnitPrice: z.number().describe(`
        * * Field Name: UnitPrice
        * * Display Name: Unit Price
        * * SQL Data Type: decimal(18, 2)
        * * Description: Standard unit price in USD`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether the product is currently available for sale`),
    Category: z.string().nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)
        * * Description: Product category for grouping and filtering`),
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

export type ProductsEntityType = z.infer<typeof ProductsSchema>;

/**
 * zod schema definition for the entity Tags
 */
export const TagsSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Primary key for the tag`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Display name of the tag, must be unique`),
    Color: z.string().nullable().describe(`
        * * Field Name: Color
        * * Display Name: Color
        * * SQL Data Type: nvarchar(7)
        * * Description: Hex color code for visual display, e.g. #FF5733`),
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

export type TagsEntityType = z.infer<typeof TagsSchema>;
 
 

/**
 * Activities - strongly typed entity sub-class
 * * Schema: sample_crm
 * * Base Table: Activity
 * * Base View: vwActivities
 * * @description Interactions and tasks related to CRM entities such as calls, emails, meetings, notes, and tasks
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Activities')
export class ActivitiesEntity extends BaseEntity<ActivitiesEntityType> {
    /**
    * Loads the Activities record from the database
    * @param ID: string - primary key value to load the Activities record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActivitiesEntity
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
    * * Default Value: newsequentialid()
    * * Description: Primary key for the activity record
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Call
    *   * Email
    *   * Meeting
    *   * Note
    *   * Task
    * * Description: Activity type: Call, Email, Meeting, Note, or Task
    */
    get Type(): 'Call' | 'Email' | 'Meeting' | 'Note' | 'Task' {
        return this.Get('Type');
    }
    set Type(value: 'Call' | 'Email' | 'Meeting' | 'Note' | 'Task') {
        this.Set('Type', value);
    }

    /**
    * * Field Name: Subject
    * * Display Name: Subject
    * * SQL Data Type: nvarchar(500)
    * * Description: Brief subject line for the activity
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
    * * Description: Detailed description or body of the activity
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ActivityDate
    * * Display Name: Activity Date
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    * * Description: When the activity occurred or is scheduled
    */
    get ActivityDate(): Date {
        return this.Get('ActivityDate');
    }
    set ActivityDate(value: Date) {
        this.Set('ActivityDate', value);
    }

    /**
    * * Field Name: DurationMinutes
    * * Display Name: Duration Minutes
    * * SQL Data Type: int
    * * Description: Duration of the activity in minutes
    */
    get DurationMinutes(): number | null {
        return this.Get('DurationMinutes');
    }
    set DurationMinutes(value: number | null) {
        this.Set('DurationMinutes', value);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Companies (vwCompanies.ID)
    * * Description: Optional link to a company
    */
    get CompanyID(): string | null {
        return this.Get('CompanyID');
    }
    set CompanyID(value: string | null) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: ContactID
    * * Display Name: Contact ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    * * Description: Optional link to a contact
    */
    get ContactID(): string | null {
        return this.Get('ContactID');
    }
    set ContactID(value: string | null) {
        this.Set('ContactID', value);
    }

    /**
    * * Field Name: DealID
    * * Display Name: Deal ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Deals (vwDeals.ID)
    * * Description: Optional link to a deal
    */
    get DealID(): string | null {
        return this.Get('DealID');
    }
    set DealID(value: string | null) {
        this.Set('DealID', value);
    }

    /**
    * * Field Name: CompletedAt
    * * Display Name: Completed At
    * * SQL Data Type: datetime
    * * Description: Timestamp when the activity was completed, null if pending
    */
    get CompletedAt(): Date | null {
        return this.Get('CompletedAt');
    }
    set CompletedAt(value: Date | null) {
        this.Set('CompletedAt', value);
    }

    /**
    * * Field Name: CreatedByUserID
    * * Display Name: Created By User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
    * * Description: User who created this activity record
    */
    get CreatedByUserID(): string | null {
        return this.Get('CreatedByUserID');
    }
    set CreatedByUserID(value: string | null) {
        this.Set('CreatedByUserID', value);
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
    * * Field Name: Company
    * * Display Name: Company
    * * SQL Data Type: nvarchar(200)
    */
    get Company(): string | null {
        return this.Get('Company');
    }

    /**
    * * Field Name: Deal
    * * Display Name: Deal
    * * SQL Data Type: nvarchar(200)
    */
    get Deal(): string | null {
        return this.Get('Deal');
    }

    /**
    * * Field Name: CreatedByUser
    * * Display Name: Created By User
    * * SQL Data Type: nvarchar(100)
    */
    get CreatedByUser(): string | null {
        return this.Get('CreatedByUser');
    }
}


/**
 * Companies - strongly typed entity sub-class
 * * Schema: sample_crm
 * * Base Table: Company
 * * Base View: vwCompanies
 * * @description Organizations that are customers, prospects, or partners
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Companies')
export class CompaniesEntity extends BaseEntity<CompaniesEntityType> {
    /**
    * Loads the Companies record from the database
    * @param ID: string - primary key value to load the Companies record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CompaniesEntity
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
    * * Default Value: newsequentialid()
    * * Description: Primary key for the company record
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Legal or trading name of the company
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
    * * SQL Data Type: nvarchar(100)
    * * Description: Industry vertical the company operates in
    */
    get Industry(): string | null {
        return this.Get('Industry');
    }
    set Industry(value: string | null) {
        this.Set('Industry', value);
    }

    /**
    * * Field Name: Website
    * * Display Name: Website
    * * SQL Data Type: nvarchar(500)
    * * Description: Company website URL
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
    * * SQL Data Type: nvarchar(50)
    * * Description: Main phone number
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: AnnualRevenue
    * * Display Name: Annual Revenue
    * * SQL Data Type: decimal(18, 2)
    * * Description: Estimated annual revenue in USD
    */
    get AnnualRevenue(): number | null {
        return this.Get('AnnualRevenue');
    }
    set AnnualRevenue(value: number | null) {
        this.Set('AnnualRevenue', value);
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
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Churned
    *   * Inactive
    *   * Prospect
    * * Description: Current relationship status: Active, Inactive, Prospect, or Churned
    */
    get Status(): 'Active' | 'Churned' | 'Inactive' | 'Prospect' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Churned' | 'Inactive' | 'Prospect') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Free-form notes about the company
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: CreatedByUserID
    * * Display Name: Created By User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
    * * Description: User who created this company record
    */
    get CreatedByUserID(): string | null {
        return this.Get('CreatedByUserID');
    }
    set CreatedByUserID(value: string | null) {
        this.Set('CreatedByUserID', value);
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
    * * Field Name: CreatedByUser
    * * Display Name: Created By User
    * * SQL Data Type: nvarchar(100)
    */
    get CreatedByUser(): string | null {
        return this.Get('CreatedByUser');
    }
}


/**
 * Company Tags - strongly typed entity sub-class
 * * Schema: sample_crm
 * * Base Table: CompanyTag
 * * Base View: vwCompanyTags
 * * @description Junction table linking tags to companies
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Company Tags')
export class CompanyTagsEntity extends BaseEntity<CompanyTagsEntityType> {
    /**
    * Loads the Company Tags record from the database
    * @param ID: string - primary key value to load the Company Tags record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CompanyTagsEntity
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
    * * Default Value: newsequentialid()
    * * Description: Primary key
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Companies (vwCompanies.ID)
    * * Description: The company being tagged
    */
    get CompanyID(): string {
        return this.Get('CompanyID');
    }
    set CompanyID(value: string) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: TagID
    * * Display Name: Tag ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Tags (vwTags.ID)
    * * Description: The tag applied to the company
    */
    get TagID(): string {
        return this.Get('TagID');
    }
    set TagID(value: string) {
        this.Set('TagID', value);
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
    * * Field Name: Company
    * * Display Name: Company
    * * SQL Data Type: nvarchar(200)
    */
    get Company(): string {
        return this.Get('Company');
    }

    /**
    * * Field Name: Tag
    * * Display Name: Tag
    * * SQL Data Type: nvarchar(100)
    */
    get Tag(): string {
        return this.Get('Tag');
    }
}


/**
 * Contact Tags - strongly typed entity sub-class
 * * Schema: sample_crm
 * * Base Table: ContactTag
 * * Base View: vwContactTags
 * * @description Junction table linking tags to contacts
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contact Tags')
export class ContactTagsEntity extends BaseEntity<ContactTagsEntityType> {
    /**
    * Loads the Contact Tags record from the database
    * @param ID: string - primary key value to load the Contact Tags record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ContactTagsEntity
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
    * * Default Value: newsequentialid()
    * * Description: Primary key
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
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    * * Description: The contact being tagged
    */
    get ContactID(): string {
        return this.Get('ContactID');
    }
    set ContactID(value: string) {
        this.Set('ContactID', value);
    }

    /**
    * * Field Name: TagID
    * * Display Name: Tag ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Tags (vwTags.ID)
    * * Description: The tag applied to the contact
    */
    get TagID(): string {
        return this.Get('TagID');
    }
    set TagID(value: string) {
        this.Set('TagID', value);
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
    * * Field Name: Tag
    * * Display Name: Tag
    * * SQL Data Type: nvarchar(100)
    */
    get Tag(): string {
        return this.Get('Tag');
    }
}


/**
 * Contacts - strongly typed entity sub-class
 * * Schema: sample_crm
 * * Base Table: Contact
 * * Base View: vwContacts
 * * @description Individual people associated with companies
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contacts')
export class ContactsEntity extends BaseEntity<ContactsEntityType> {
    /**
    * Loads the Contacts record from the database
    * @param ID: string - primary key value to load the Contacts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ContactsEntity
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
    * * Default Value: newsequentialid()
    * * Description: Primary key for the contact record
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Companies (vwCompanies.ID)
    * * Description: Company this contact belongs to
    */
    get CompanyID(): string {
        return this.Get('CompanyID');
    }
    set CompanyID(value: string) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Contact first name
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
    * * SQL Data Type: nvarchar(100)
    * * Description: Contact last name
    */
    get LastName(): string {
        return this.Get('LastName');
    }
    set LastName(value: string) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(200)
    * * Description: Email address
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
    * * SQL Data Type: nvarchar(50)
    * * Description: Direct phone number
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(100)
    * * Description: Job title
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
    * * Description: Department within the company
    */
    get Department(): string | null {
        return this.Get('Department');
    }
    set Department(value: string | null) {
        this.Set('Department', value);
    }

    /**
    * * Field Name: ReportsToContactID
    * * Display Name: Reports To Contact ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    * * Description: Self-referential FK to the contact this person reports to
    */
    get ReportsToContactID(): string | null {
        return this.Get('ReportsToContactID');
    }
    set ReportsToContactID(value: string | null) {
        this.Set('ReportsToContactID', value);
    }

    /**
    * * Field Name: IsPrimary
    * * Display Name: Is Primary
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this is the primary contact for the company
    */
    get IsPrimary(): boolean {
        return this.Get('IsPrimary');
    }
    set IsPrimary(value: boolean) {
        this.Set('IsPrimary', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Churned
    *   * Inactive
    *   * Prospect
    * * Description: Current status: Active, Inactive, Prospect, or Churned
    */
    get Status(): 'Active' | 'Churned' | 'Inactive' | 'Prospect' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Churned' | 'Inactive' | 'Prospect') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Free-form notes about the contact
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: CreatedByUserID
    * * Display Name: Created By User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
    * * Description: User who created this contact record
    */
    get CreatedByUserID(): string | null {
        return this.Get('CreatedByUserID');
    }
    set CreatedByUserID(value: string | null) {
        this.Set('CreatedByUserID', value);
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
    * * Field Name: Company
    * * Display Name: Company
    * * SQL Data Type: nvarchar(200)
    */
    get Company(): string {
        return this.Get('Company');
    }

    /**
    * * Field Name: CreatedByUser
    * * Display Name: Created By User
    * * SQL Data Type: nvarchar(100)
    */
    get CreatedByUser(): string | null {
        return this.Get('CreatedByUser');
    }

    /**
    * * Field Name: RootReportsToContactID
    * * Display Name: Root Reports To Contact ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootReportsToContactID(): string | null {
        return this.Get('RootReportsToContactID');
    }
}


/**
 * Deal Products - strongly typed entity sub-class
 * * Schema: sample_crm
 * * Base Table: DealProduct
 * * Base View: vwDealProducts
 * * @description Junction table linking products to deals with pricing and quantity details
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Deal Products')
export class DealProductsEntity extends BaseEntity<DealProductsEntityType> {
    /**
    * Loads the Deal Products record from the database
    * @param ID: string - primary key value to load the Deal Products record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DealProductsEntity
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
    * * Default Value: newsequentialid()
    * * Description: Primary key for the deal-product link
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: DealID
    * * Display Name: Deal ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Deals (vwDeals.ID)
    * * Description: Deal this product is part of
    */
    get DealID(): string {
        return this.Get('DealID');
    }
    set DealID(value: string) {
        this.Set('DealID', value);
    }

    /**
    * * Field Name: ProductID
    * * Display Name: Product ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Products (vwProducts.ID)
    * * Description: Product being sold in this deal
    */
    get ProductID(): string {
        return this.Get('ProductID');
    }
    set ProductID(value: string) {
        this.Set('ProductID', value);
    }

    /**
    * * Field Name: Quantity
    * * Display Name: Quantity
    * * SQL Data Type: int
    * * Default Value: 1
    * * Description: Number of units included in the deal
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
    * * Description: Price per unit for this deal, may differ from catalog price
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
    * * Description: Discount percentage from 0 to 100
    */
    get Discount(): number {
        return this.Get('Discount');
    }
    set Discount(value: number) {
        this.Set('Discount', value);
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
 * Deal Tags - strongly typed entity sub-class
 * * Schema: sample_crm
 * * Base Table: DealTag
 * * Base View: vwDealTags
 * * @description Junction table linking tags to deals
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Deal Tags')
export class DealTagsEntity extends BaseEntity<DealTagsEntityType> {
    /**
    * Loads the Deal Tags record from the database
    * @param ID: string - primary key value to load the Deal Tags record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DealTagsEntity
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
    * * Default Value: newsequentialid()
    * * Description: Primary key
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: DealID
    * * Display Name: Deal ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Deals (vwDeals.ID)
    * * Description: The deal being tagged
    */
    get DealID(): string {
        return this.Get('DealID');
    }
    set DealID(value: string) {
        this.Set('DealID', value);
    }

    /**
    * * Field Name: TagID
    * * Display Name: Tag ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Tags (vwTags.ID)
    * * Description: The tag applied to the deal
    */
    get TagID(): string {
        return this.Get('TagID');
    }
    set TagID(value: string) {
        this.Set('TagID', value);
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
    * * Field Name: Tag
    * * Display Name: Tag
    * * SQL Data Type: nvarchar(100)
    */
    get Tag(): string {
        return this.Get('Tag');
    }
}


/**
 * Deals - strongly typed entity sub-class
 * * Schema: sample_crm
 * * Base Table: Deal
 * * Base View: vwDeals
 * * @description Sales opportunities being pursued with companies
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Deals')
export class DealsEntity extends BaseEntity<DealsEntityType> {
    /**
    * Loads the Deals record from the database
    * @param ID: string - primary key value to load the Deals record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DealsEntity
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
    * * Default Value: newsequentialid()
    * * Description: Primary key for the deal record
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Companies (vwCompanies.ID)
    * * Description: Company this deal is associated with
    */
    get CompanyID(): string {
        return this.Get('CompanyID');
    }
    set CompanyID(value: string) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: ContactID
    * * Display Name: Contact ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Contacts (vwContacts.ID)
    * * Description: Primary contact for this deal
    */
    get ContactID(): string {
        return this.Get('ContactID');
    }
    set ContactID(value: string) {
        this.Set('ContactID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Short name or title of the deal
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(18, 2)
    * * Description: Total deal value in USD
    */
    get Amount(): number | null {
        return this.Get('Amount');
    }
    set Amount(value: number | null) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: Stage
    * * Display Name: Stage
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Closed Lost
    *   * Closed Won
    *   * Lead
    *   * Negotiation
    *   * Proposal
    *   * Qualified
    * * Description: Current sales stage: Lead, Qualified, Proposal, Negotiation, Closed Won, or Closed Lost
    */
    get Stage(): 'Closed Lost' | 'Closed Won' | 'Lead' | 'Negotiation' | 'Proposal' | 'Qualified' {
        return this.Get('Stage');
    }
    set Stage(value: 'Closed Lost' | 'Closed Won' | 'Lead' | 'Negotiation' | 'Proposal' | 'Qualified') {
        this.Set('Stage', value);
    }

    /**
    * * Field Name: Probability
    * * Display Name: Probability
    * * SQL Data Type: int
    * * Description: Win probability percentage from 0 to 100
    */
    get Probability(): number | null {
        return this.Get('Probability');
    }
    set Probability(value: number | null) {
        this.Set('Probability', value);
    }

    /**
    * * Field Name: ExpectedCloseDate
    * * Display Name: Expected Close Date
    * * SQL Data Type: datetime
    * * Description: Projected close date
    */
    get ExpectedCloseDate(): Date | null {
        return this.Get('ExpectedCloseDate');
    }
    set ExpectedCloseDate(value: Date | null) {
        this.Set('ExpectedCloseDate', value);
    }

    /**
    * * Field Name: ActualCloseDate
    * * Display Name: Actual Close Date
    * * SQL Data Type: datetime
    * * Description: Date the deal was actually closed, null if still open
    */
    get ActualCloseDate(): Date | null {
        return this.Get('ActualCloseDate');
    }
    set ActualCloseDate(value: Date | null) {
        this.Set('ActualCloseDate', value);
    }

    /**
    * * Field Name: AssignedToUserID
    * * Display Name: Assigned To User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
    * * Description: Sales rep assigned to this deal
    */
    get AssignedToUserID(): string | null {
        return this.Get('AssignedToUserID');
    }
    set AssignedToUserID(value: string | null) {
        this.Set('AssignedToUserID', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Free-form notes about the deal
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: CreatedByUserID
    * * Display Name: Created By User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
    * * Description: User who created this deal record
    */
    get CreatedByUserID(): string | null {
        return this.Get('CreatedByUserID');
    }
    set CreatedByUserID(value: string | null) {
        this.Set('CreatedByUserID', value);
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
    * * Field Name: Company
    * * Display Name: Company
    * * SQL Data Type: nvarchar(200)
    */
    get Company(): string {
        return this.Get('Company');
    }

    /**
    * * Field Name: AssignedToUser
    * * Display Name: Assigned To User
    * * SQL Data Type: nvarchar(100)
    */
    get AssignedToUser(): string | null {
        return this.Get('AssignedToUser');
    }

    /**
    * * Field Name: CreatedByUser
    * * Display Name: Created By User
    * * SQL Data Type: nvarchar(100)
    */
    get CreatedByUser(): string | null {
        return this.Get('CreatedByUser');
    }
}


/**
 * Pipeline Stages - strongly typed entity sub-class
 * * Schema: sample_crm
 * * Base Table: PipelineStage
 * * Base View: vwPipelineStages
 * * @description Ordered stages within a sales pipeline
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Pipeline Stages')
export class PipelineStagesEntity extends BaseEntity<PipelineStagesEntityType> {
    /**
    * Loads the Pipeline Stages record from the database
    * @param ID: string - primary key value to load the Pipeline Stages record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PipelineStagesEntity
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
    * * Default Value: newsequentialid()
    * * Description: Primary key for the pipeline stage
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PipelineID
    * * Display Name: Pipeline ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Pipelines (vwPipelines.ID)
    * * Description: Pipeline this stage belongs to
    */
    get PipelineID(): string {
        return this.Get('PipelineID');
    }
    set PipelineID(value: string) {
        this.Set('PipelineID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Stage display name
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: DisplayOrder
    * * Display Name: Display Order
    * * SQL Data Type: int
    * * Description: Ordering position within the pipeline, lower numbers appear first
    */
    get DisplayOrder(): number {
        return this.Get('DisplayOrder');
    }
    set DisplayOrder(value: number) {
        this.Set('DisplayOrder', value);
    }

    /**
    * * Field Name: Probability
    * * Display Name: Probability
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Default win probability percentage for deals entering this stage
    */
    get Probability(): number {
        return this.Get('Probability');
    }
    set Probability(value: number) {
        this.Set('Probability', value);
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
    * * Field Name: Pipeline
    * * Display Name: Pipeline
    * * SQL Data Type: nvarchar(200)
    */
    get Pipeline(): string {
        return this.Get('Pipeline');
    }
}


/**
 * Pipelines - strongly typed entity sub-class
 * * Schema: sample_crm
 * * Base Table: Pipeline
 * * Base View: vwPipelines
 * * @description Sales pipelines defining the stages deals progress through
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Pipelines')
export class PipelinesEntity extends BaseEntity<PipelinesEntityType> {
    /**
    * Loads the Pipelines record from the database
    * @param ID: string - primary key value to load the Pipelines record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PipelinesEntity
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
    * * Default Value: newsequentialid()
    * * Description: Primary key for the pipeline
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Display name of the pipeline
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
    * * Description: Description of the pipeline purpose and usage
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
    * * Default Value: 0
    * * Description: Whether this is the default pipeline for new deals
    */
    get IsDefault(): boolean {
        return this.Get('IsDefault');
    }
    set IsDefault(value: boolean) {
        this.Set('IsDefault', value);
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
 * * Schema: sample_crm
 * * Base Table: Product
 * * Base View: vwProducts
 * * @description Products and services available for sale in deals
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Products')
export class ProductsEntity extends BaseEntity<ProductsEntityType> {
    /**
    * Loads the Products record from the database
    * @param ID: string - primary key value to load the Products record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ProductsEntity
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
    * * Default Value: newsequentialid()
    * * Description: Primary key for the product record
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Product display name
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: SKU
    * * Display Name: SKU
    * * SQL Data Type: nvarchar(50)
    * * Description: Stock keeping unit, unique product identifier
    */
    get SKU(): string | null {
        return this.Get('SKU');
    }
    set SKU(value: string | null) {
        this.Set('SKU', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Detailed product description
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
    * * Description: Standard unit price in USD
    */
    get UnitPrice(): number {
        return this.Get('UnitPrice');
    }
    set UnitPrice(value: number) {
        this.Set('UnitPrice', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether the product is currently available for sale
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(100)
    * * Description: Product category for grouping and filtering
    */
    get Category(): string | null {
        return this.Get('Category');
    }
    set Category(value: string | null) {
        this.Set('Category', value);
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
 * Tags - strongly typed entity sub-class
 * * Schema: sample_crm
 * * Base Table: Tag
 * * Base View: vwTags
 * * @description Labels for categorizing and filtering CRM records
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Tags')
export class TagsEntity extends BaseEntity<TagsEntityType> {
    /**
    * Loads the Tags record from the database
    * @param ID: string - primary key value to load the Tags record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TagsEntity
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
    * * Default Value: newsequentialid()
    * * Description: Primary key for the tag
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Display name of the tag, must be unique
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Color
    * * Display Name: Color
    * * SQL Data Type: nvarchar(7)
    * * Description: Hex color code for visual display, e.g. #FF5733
    */
    get Color(): string | null {
        return this.Get('Color');
    }
    set Color(value: string | null) {
        this.Set('Color', value);
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
