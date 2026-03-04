import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Agents
 */
export const AgentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: varchar(20)`),
    LicenseNumber: z.string().describe(`
        * * Field Name: LicenseNumber
        * * Display Name: License Number
        * * SQL Data Type: varchar(30)
        * * Description: State license number for the agent`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    HireDate: z.date().describe(`
        * * Field Name: HireDate
        * * Display Name: Hire Date
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
    CommissionRate: z.number().describe(`
        * * Field Name: CommissionRate
        * * Display Name: Commission Rate
        * * SQL Data Type: decimal(5, 2)
        * * Default Value: 3.00
        * * Description: Default commission percentage for this agent`),
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

export type AgentEntityType = z.infer<typeof AgentSchema>;

/**
 * zod schema definition for the entity Authors
 */
export const AuthorSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)`),
    BirthYear: z.number().nullable().describe(`
        * * Field Name: BirthYear
        * * Display Name: Birth Year
        * * SQL Data Type: smallint`),
    Nationality: z.string().nullable().describe(`
        * * Field Name: Nationality
        * * Display Name: Nationality
        * * SQL Data Type: nvarchar(100)`),
    Bio: z.string().nullable().describe(`
        * * Field Name: Bio
        * * Display Name: Bio
        * * SQL Data Type: nvarchar(MAX)`),
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

export type AuthorEntityType = z.infer<typeof AuthorSchema>;

/**
 * zod schema definition for the entity Book Copies
 */
export const BookCopySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    BookID: z.string().describe(`
        * * Field Name: BookID
        * * Display Name: Book ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Books (vwBooks.ID)`),
    BranchID: z.string().describe(`
        * * Field Name: BranchID
        * * Display Name: Branch ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Branches (vwBranches.ID)`),
    Barcode: z.string().describe(`
        * * Field Name: Barcode
        * * Display Name: Barcode
        * * SQL Data Type: varchar(30)
        * * Description: Unique barcode for physical copy tracking`),
    Condition: z.union([z.literal('Damaged'), z.literal('Fair'), z.literal('Good'), z.literal('New'), z.literal('Poor')]).describe(`
        * * Field Name: Condition
        * * Display Name: Condition
        * * SQL Data Type: varchar(20)
        * * Default Value: Good
    * * Value List Type: List
    * * Possible Values 
    *   * Damaged
    *   * Fair
    *   * Good
    *   * New
    *   * Poor
        * * Description: Physical condition of the copy`),
    AcquiredDate: z.date().describe(`
        * * Field Name: AcquiredDate
        * * Display Name: Acquired Date
        * * SQL Data Type: date
        * * Default Value: getutcdate()`),
    IsAvailable: z.boolean().describe(`
        * * Field Name: IsAvailable
        * * Display Name: Is Available
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether the copy is available for checkout`),
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
    Branch: z.string().describe(`
        * * Field Name: Branch
        * * Display Name: Branch
        * * SQL Data Type: nvarchar(200)`),
});

export type BookCopyEntityType = z.infer<typeof BookCopySchema>;

/**
 * zod schema definition for the entity Books
 */
export const BookSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ISBN: z.string().describe(`
        * * Field Name: ISBN
        * * Display Name: ISBN
        * * SQL Data Type: varchar(13)
        * * Description: International Standard Book Number`),
    Title: z.string().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(300)`),
    PublicationYear: z.number().describe(`
        * * Field Name: PublicationYear
        * * Display Name: Publication Year
        * * SQL Data Type: smallint`),
    Publisher: z.string().describe(`
        * * Field Name: Publisher
        * * Display Name: Publisher
        * * SQL Data Type: nvarchar(200)`),
    PageCount: z.number().nullable().describe(`
        * * Field Name: PageCount
        * * Display Name: Page Count
        * * SQL Data Type: int`),
    Language: z.string().describe(`
        * * Field Name: Language
        * * Display Name: Language
        * * SQL Data Type: varchar(30)
        * * Default Value: English`),
    GenreID: z.string().describe(`
        * * Field Name: GenreID
        * * Display Name: Genre ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Genres (vwGenres.ID)`),
    AuthorID: z.string().describe(`
        * * Field Name: AuthorID
        * * Display Name: Author ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Authors (vwAuthors.ID)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    AddedAt: z.date().describe(`
        * * Field Name: AddedAt
        * * Display Name: Added At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
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
    Genre: z.string().describe(`
        * * Field Name: Genre
        * * Display Name: Genre
        * * SQL Data Type: nvarchar(100)`),
});

export type BookEntityType = z.infer<typeof BookSchema>;

/**
 * zod schema definition for the entity Branches
 */
export const BranchSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Address: z.string().describe(`
        * * Field Name: Address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(300)`),
    City: z.string().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: varchar(2)`),
    ZipCode: z.string().describe(`
        * * Field Name: ZipCode
        * * Display Name: Zip Code
        * * SQL Data Type: varchar(10)`),
    Phone: z.string().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: varchar(20)`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    OpeningYear: z.number().describe(`
        * * Field Name: OpeningYear
        * * Display Name: Opening Year
        * * SQL Data Type: smallint`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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

export type BranchEntityType = z.infer<typeof BranchSchema>;

/**
 * zod schema definition for the entity Campaigns
 */
export const CampaignSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for the campaign`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    GoalAmount: z.number().describe(`
        * * Field Name: GoalAmount
        * * Display Name: Goal Amount
        * * SQL Data Type: decimal(12, 2)
        * * Description: Target fundraising amount for the campaign`),
    StartDate: z.date().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: date`),
    EndDate: z.date().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: date`),
    Status: z.union([z.literal('Active'), z.literal('Cancelled'), z.literal('Completed'), z.literal('Planning')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: varchar(20)
        * * Default Value: Planning
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Cancelled
    *   * Completed
    *   * Planning
        * * Description: Current status: Planning, Active, Completed, or Cancelled`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    CreatedAt: z.date().describe(`
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
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

export type CampaignEntityType = z.infer<typeof CampaignSchema>;

/**
 * zod schema definition for the entity Categories
 */
export const CategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(150)`),
    ParentCategoryID: z.string().nullable().describe(`
        * * Field Name: ParentCategoryID
        * * Display Name: Parent Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Categories (vwCategories.ID)
        * * Description: Self-referencing FK for category hierarchy`),
    DepartmentID: z.string().nullable().describe(`
        * * Field Name: DepartmentID
        * * Display Name: Department ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Departments (vwDepartments.ID)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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
    ParentCategory: z.string().nullable().describe(`
        * * Field Name: ParentCategory
        * * Display Name: Parent Category
        * * SQL Data Type: nvarchar(150)`),
    Department: z.string().nullable().describe(`
        * * Field Name: Department
        * * Display Name: Department
        * * SQL Data Type: nvarchar(150)`),
    RootParentCategoryID: z.string().nullable().describe(`
        * * Field Name: RootParentCategoryID
        * * Display Name: Root Parent Category ID
        * * SQL Data Type: uniqueidentifier`),
});

export type CategoryEntityType = z.infer<typeof CategorySchema>;

/**
 * zod schema definition for the entity Checkouts
 */
export const CheckoutSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    BookCopyID: z.string().describe(`
        * * Field Name: BookCopyID
        * * Display Name: Book Copy ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Book Copies (vwBookCopies.ID)`),
    PatronID: z.string().describe(`
        * * Field Name: PatronID
        * * Display Name: Patron ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Patrons (vwPatrons.ID)`),
    CheckoutDate: z.date().describe(`
        * * Field Name: CheckoutDate
        * * Display Name: Checkout Date
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
    DueDate: z.date().describe(`
        * * Field Name: DueDate
        * * Display Name: Due Date
        * * SQL Data Type: date
        * * Description: Expected return date for the checked out book`),
    ReturnDate: z.date().nullable().describe(`
        * * Field Name: ReturnDate
        * * Display Name: Return Date
        * * SQL Data Type: datetime`),
    IsReturned: z.boolean().describe(`
        * * Field Name: IsReturned
        * * Display Name: Is Returned
        * * SQL Data Type: bit
        * * Default Value: 0`),
    LateFee: z.number().describe(`
        * * Field Name: LateFee
        * * Display Name: Late Fee
        * * SQL Data Type: decimal(6, 2)
        * * Default Value: 0
        * * Description: Fee charged for late return`),
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

export type CheckoutEntityType = z.infer<typeof CheckoutSchema>;

/**
 * zod schema definition for the entity Class Bookings
 */
export const ClassBookingSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ClassID: z.string().describe(`
        * * Field Name: ClassID
        * * Display Name: Class ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Fitness Classes (vwFitnessClasses.ID)`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    BookingDate: z.date().describe(`
        * * Field Name: BookingDate
        * * Display Name: Booking Date
        * * SQL Data Type: date`),
    Status: z.union([z.literal('Cancelled'), z.literal('Confirmed'), z.literal('Waitlisted')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: varchar(20)
        * * Default Value: Confirmed
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Confirmed
    *   * Waitlisted`),
    CheckedIn: z.boolean().describe(`
        * * Field Name: CheckedIn
        * * Display Name: Checked In
        * * SQL Data Type: bit
        * * Default Value: 0`),
    CancelledAt: z.date().nullable().describe(`
        * * Field Name: CancelledAt
        * * Display Name: Cancelled At
        * * SQL Data Type: datetime`),
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
    Class: z.string().describe(`
        * * Field Name: Class
        * * Display Name: Class
        * * SQL Data Type: nvarchar(200)`),
});

export type ClassBookingEntityType = z.infer<typeof ClassBookingSchema>;

/**
 * zod schema definition for the entity Clients
 */
export const ClientSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: varchar(20)`),
    PreferredContactMethod: z.union([z.literal('Email'), z.literal('Phone'), z.literal('Text')]).describe(`
        * * Field Name: PreferredContactMethod
        * * Display Name: Preferred Contact Method
        * * SQL Data Type: varchar(10)
        * * Default Value: Email
    * * Value List Type: List
    * * Possible Values 
    *   * Email
    *   * Phone
    *   * Text
        * * Description: Preferred method of contact: Email, Phone, or Text`),
    Budget: z.number().nullable().describe(`
        * * Field Name: Budget
        * * Display Name: Budget
        * * SQL Data Type: decimal(12, 2)
        * * Description: Maximum budget for property search`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)`),
    AgentID: z.string().describe(`
        * * Field Name: AgentID
        * * Display Name: Agent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Agents (vwAgents.ID)`),
    CreatedAt: z.date().describe(`
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
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

export type ClientEntityType = z.infer<typeof ClientSchema>;

/**
 * zod schema definition for the entity Customer Orders
 */
export const CustomerOrderSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrderNumber: z.string().describe(`
        * * Field Name: OrderNumber
        * * Display Name: Order Number
        * * SQL Data Type: varchar(20)
        * * Description: Unique sequential order identifier`),
    TableID: z.string().describe(`
        * * Field Name: TableID
        * * Display Name: Table ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Table Seatings (vwTableSeatings.ID)`),
    ServerID: z.string().describe(`
        * * Field Name: ServerID
        * * Display Name: Server ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Staffs (vwStaffs.ID)`),
    OrderDate: z.date().describe(`
        * * Field Name: OrderDate
        * * Display Name: Order Date
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
    Status: z.union([z.literal('Closed'), z.literal('InProgress'), z.literal('Open'), z.literal('Ready'), z.literal('Served')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: varchar(20)
        * * Default Value: Open
    * * Value List Type: List
    * * Possible Values 
    *   * Closed
    *   * InProgress
    *   * Open
    *   * Ready
    *   * Served`),
    SubTotal: z.number().describe(`
        * * Field Name: SubTotal
        * * Display Name: Sub Total
        * * SQL Data Type: decimal(10, 2)
        * * Default Value: 0`),
    TaxAmount: z.number().describe(`
        * * Field Name: TaxAmount
        * * Display Name: Tax Amount
        * * SQL Data Type: decimal(10, 2)
        * * Default Value: 0`),
    TipAmount: z.number().describe(`
        * * Field Name: TipAmount
        * * Display Name: Tip Amount
        * * SQL Data Type: decimal(10, 2)
        * * Default Value: 0`),
    TotalAmount: z.number().describe(`
        * * Field Name: TotalAmount
        * * Display Name: Total Amount
        * * SQL Data Type: decimal(10, 2)
        * * Default Value: 0
        * * Description: Order total including tax and tip`),
    IsPaid: z.boolean().describe(`
        * * Field Name: IsPaid
        * * Display Name: Is Paid
        * * SQL Data Type: bit
        * * Default Value: 0`),
    PaidAt: z.date().nullable().describe(`
        * * Field Name: PaidAt
        * * Display Name: Paid At
        * * SQL Data Type: datetime`),
    PaymentMethod: z.string().nullable().describe(`
        * * Field Name: PaymentMethod
        * * Display Name: Payment Method
        * * SQL Data Type: varchar(20)`),
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

export type CustomerOrderEntityType = z.infer<typeof CustomerOrderSchema>;

/**
 * zod schema definition for the entity Daily Revenues
 */
export const DailyRevenueSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    BusinessDate: z.date().describe(`
        * * Field Name: BusinessDate
        * * Display Name: Business Date
        * * SQL Data Type: date
        * * Description: Calendar date for revenue aggregation`),
    TotalOrders: z.number().describe(`
        * * Field Name: TotalOrders
        * * Display Name: Total Orders
        * * SQL Data Type: int
        * * Default Value: 0`),
    TotalRevenue: z.number().describe(`
        * * Field Name: TotalRevenue
        * * Display Name: Total Revenue
        * * SQL Data Type: decimal(12, 2)
        * * Default Value: 0`),
    TotalTips: z.number().describe(`
        * * Field Name: TotalTips
        * * Display Name: Total Tips
        * * SQL Data Type: decimal(10, 2)
        * * Default Value: 0`),
    CustomerCount: z.number().describe(`
        * * Field Name: CustomerCount
        * * Display Name: Customer Count
        * * SQL Data Type: int
        * * Default Value: 0`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)`),
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

export type DailyRevenueEntityType = z.infer<typeof DailyRevenueSchema>;

/**
 * zod schema definition for the entity Departments
 */
export const DepartmentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(150)`),
    ManagerEmail: z.string().nullable().describe(`
        * * Field Name: ManagerEmail
        * * Display Name: Manager Email
        * * SQL Data Type: nvarchar(255)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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

export type DepartmentEntityType = z.infer<typeof DepartmentSchema>;

/**
 * zod schema definition for the entity Donations
 */
export const DonationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    DonorID: z.string().describe(`
        * * Field Name: DonorID
        * * Display Name: Donor ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Donors (vwDonors.ID)`),
    CampaignID: z.string().nullable().describe(`
        * * Field Name: CampaignID
        * * Display Name: Campaign ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Campaigns (vwCampaigns.ID)`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(10, 2)
        * * Description: Donation amount in dollars`),
    DonationDate: z.date().describe(`
        * * Field Name: DonationDate
        * * Display Name: Donation Date
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
    PaymentMethod: z.union([z.literal('ACH'), z.literal('Cash'), z.literal('Check'), z.literal('Credit'), z.literal('Stock'), z.literal('Wire')]).describe(`
        * * Field Name: PaymentMethod
        * * Display Name: Payment Method
        * * SQL Data Type: varchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * ACH
    *   * Cash
    *   * Check
    *   * Credit
    *   * Stock
    *   * Wire`),
    IsRecurring: z.boolean().describe(`
        * * Field Name: IsRecurring
        * * Display Name: Is Recurring
        * * SQL Data Type: bit
        * * Default Value: 0`),
    ReceiptNumber: z.string().describe(`
        * * Field Name: ReceiptNumber
        * * Display Name: Receipt Number
        * * SQL Data Type: varchar(30)`),
    TaxDeductible: z.boolean().describe(`
        * * Field Name: TaxDeductible
        * * Display Name: Tax Deductible
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this is a tax-deductible contribution`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)`),
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
    Campaign: z.string().nullable().describe(`
        * * Field Name: Campaign
        * * Display Name: Campaign
        * * SQL Data Type: nvarchar(200)`),
});

export type DonationEntityType = z.infer<typeof DonationSchema>;

/**
 * zod schema definition for the entity Donors
 */
export const DonorSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for the donor`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: varchar(20)`),
    Address: z.string().nullable().describe(`
        * * Field Name: Address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(300)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: varchar(2)`),
    ZipCode: z.string().nullable().describe(`
        * * Field Name: ZipCode
        * * Display Name: Zip Code
        * * SQL Data Type: varchar(10)`),
    DonorType: z.union([z.literal('Corporate'), z.literal('Foundation'), z.literal('Individual')]).describe(`
        * * Field Name: DonorType
        * * Display Name: Donor Type
        * * SQL Data Type: varchar(20)
        * * Default Value: Individual
    * * Value List Type: List
    * * Possible Values 
    *   * Corporate
    *   * Foundation
    *   * Individual
        * * Description: Type of donor: Individual, Corporate, or Foundation`),
    IsAnonymous: z.boolean().describe(`
        * * Field Name: IsAnonymous
        * * Display Name: Is Anonymous
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether the donor prefers to remain anonymous`),
    FirstDonationDate: z.date().nullable().describe(`
        * * Field Name: FirstDonationDate
        * * Display Name: First Donation Date
        * * SQL Data Type: datetime`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)`),
    RegisteredAt: z.date().describe(`
        * * Field Name: RegisteredAt
        * * Display Name: Registered At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
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

export type DonorEntityType = z.infer<typeof DonorSchema>;

/**
 * zod schema definition for the entity Event Attendees
 */
export const EventAttendeeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EventID: z.string().describe(`
        * * Field Name: EventID
        * * Display Name: Event ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Events (vwEvents.ID)`),
    DonorID: z.string().nullable().describe(`
        * * Field Name: DonorID
        * * Display Name: Donor ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Donors (vwDonors.ID)`),
    VolunteerID: z.string().nullable().describe(`
        * * Field Name: VolunteerID
        * * Display Name: Volunteer ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Volunteers (vwVolunteers.ID)`),
    AttendeeType: z.union([z.literal('Donor'), z.literal('Guest'), z.literal('Volunteer')]).describe(`
        * * Field Name: AttendeeType
        * * Display Name: Attendee Type
        * * SQL Data Type: varchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Donor
    *   * Guest
    *   * Volunteer`),
    CheckedIn: z.boolean().describe(`
        * * Field Name: CheckedIn
        * * Display Name: Checked In
        * * SQL Data Type: bit
        * * Default Value: 0`),
    RegisteredAt: z.date().describe(`
        * * Field Name: RegisteredAt
        * * Display Name: Registered At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
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

export type EventAttendeeEntityType = z.infer<typeof EventAttendeeSchema>;

/**
 * zod schema definition for the entity Events
 */
export const EventSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    CampaignID: z.string().nullable().describe(`
        * * Field Name: CampaignID
        * * Display Name: Campaign ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Campaigns (vwCampaigns.ID)`),
    EventDate: z.date().describe(`
        * * Field Name: EventDate
        * * Display Name: Event Date
        * * SQL Data Type: date`),
    StartTime: z.date().describe(`
        * * Field Name: StartTime
        * * Display Name: Start Time
        * * SQL Data Type: time
        * * Description: Event start time`),
    EndTime: z.date().describe(`
        * * Field Name: EndTime
        * * Display Name: End Time
        * * SQL Data Type: time
        * * Description: Event end time`),
    Location: z.string().describe(`
        * * Field Name: Location
        * * Display Name: Location
        * * SQL Data Type: nvarchar(300)`),
    MaxAttendees: z.number().nullable().describe(`
        * * Field Name: MaxAttendees
        * * Display Name: Max Attendees
        * * SQL Data Type: int`),
    Status: z.union([z.literal('Cancelled'), z.literal('Completed'), z.literal('InProgress'), z.literal('Upcoming')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: varchar(20)
        * * Default Value: Upcoming
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * InProgress
    *   * Upcoming`),
    CreatedAt: z.date().describe(`
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
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
    Campaign: z.string().nullable().describe(`
        * * Field Name: Campaign
        * * Display Name: Campaign
        * * SQL Data Type: nvarchar(200)`),
});

export type EventEntityType = z.infer<typeof EventSchema>;

/**
 * zod schema definition for the entity Fines
 */
export const FineSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PatronID: z.string().describe(`
        * * Field Name: PatronID
        * * Display Name: Patron ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Patrons (vwPatrons.ID)`),
    CheckoutID: z.string().nullable().describe(`
        * * Field Name: CheckoutID
        * * Display Name: Checkout ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Checkouts (vwCheckouts.ID)`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(6, 2)`),
    Reason: z.string().describe(`
        * * Field Name: Reason
        * * Display Name: Reason
        * * SQL Data Type: nvarchar(200)`),
    IssuedAt: z.date().describe(`
        * * Field Name: IssuedAt
        * * Display Name: Issued At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
    PaidAt: z.date().nullable().describe(`
        * * Field Name: PaidAt
        * * Display Name: Paid At
        * * SQL Data Type: datetime`),
    IsPaid: z.boolean().describe(`
        * * Field Name: IsPaid
        * * Display Name: Is Paid
        * * SQL Data Type: bit
        * * Default Value: 0`),
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

export type FineEntityType = z.infer<typeof FineSchema>;

/**
 * zod schema definition for the entity Fitness Classes
 */
export const FitnessClassSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    TrainerID: z.string().describe(`
        * * Field Name: TrainerID
        * * Display Name: Trainer ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Trainers (vwTrainers.ID)`),
    LocationID: z.string().describe(`
        * * Field Name: LocationID
        * * Display Name: Location ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Locations (vwLocations.ID)`),
    DayOfWeek: z.union([z.literal('Friday'), z.literal('Monday'), z.literal('Saturday'), z.literal('Sunday'), z.literal('Thursday'), z.literal('Tuesday'), z.literal('Wednesday')]).describe(`
        * * Field Name: DayOfWeek
        * * Display Name: Day Of Week
        * * SQL Data Type: varchar(10)
    * * Value List Type: List
    * * Possible Values 
    *   * Friday
    *   * Monday
    *   * Saturday
    *   * Sunday
    *   * Thursday
    *   * Tuesday
    *   * Wednesday
        * * Description: Day of week: Monday through Sunday`),
    StartTime: z.date().describe(`
        * * Field Name: StartTime
        * * Display Name: Start Time
        * * SQL Data Type: time
        * * Description: Class start time of day`),
    DurationMinutes: z.number().describe(`
        * * Field Name: DurationMinutes
        * * Display Name: Duration Minutes
        * * SQL Data Type: int
        * * Default Value: 60`),
    MaxCapacity: z.number().describe(`
        * * Field Name: MaxCapacity
        * * Display Name: Max Capacity
        * * SQL Data Type: int
        * * Default Value: 20`),
    ClassType: z.union([z.literal('Boxing'), z.literal('CrossFit'), z.literal('HIIT'), z.literal('Other'), z.literal('Pilates'), z.literal('Spin'), z.literal('Swimming'), z.literal('Yoga')]).describe(`
        * * Field Name: ClassType
        * * Display Name: Class Type
        * * SQL Data Type: varchar(30)
    * * Value List Type: List
    * * Possible Values 
    *   * Boxing
    *   * CrossFit
    *   * HIIT
    *   * Other
    *   * Pilates
    *   * Spin
    *   * Swimming
    *   * Yoga
        * * Description: Class type: Yoga, HIIT, Spin, Pilates, CrossFit, Boxing, Swimming, Other`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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
    Location: z.string().describe(`
        * * Field Name: Location
        * * Display Name: Location
        * * SQL Data Type: nvarchar(200)`),
});

export type FitnessClassEntityType = z.infer<typeof FitnessClassSchema>;

/**
 * zod schema definition for the entity Genres
 */
export const GenreSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
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

export type GenreEntityType = z.infer<typeof GenreSchema>;

/**
 * zod schema definition for the entity Grant _s
 */
export const Grant_Schema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    GrantorName: z.string().describe(`
        * * Field Name: GrantorName
        * * Display Name: Grantor Name
        * * SQL Data Type: nvarchar(200)`),
    Title: z.string().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(300)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(12, 2)
        * * Description: Grant amount in dollars`),
    ApplicationDate: z.date().describe(`
        * * Field Name: ApplicationDate
        * * Display Name: Application Date
        * * SQL Data Type: date`),
    AwardDate: z.date().nullable().describe(`
        * * Field Name: AwardDate
        * * Display Name: Award Date
        * * SQL Data Type: date`),
    ExpirationDate: z.date().nullable().describe(`
        * * Field Name: ExpirationDate
        * * Display Name: Expiration Date
        * * SQL Data Type: date`),
    Status: z.union([z.literal('Applied'), z.literal('Awarded'), z.literal('Completed'), z.literal('Rejected')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: varchar(20)
        * * Default Value: Applied
    * * Value List Type: List
    * * Possible Values 
    *   * Applied
    *   * Awarded
    *   * Completed
    *   * Rejected`),
    RequirementsNotes: z.string().nullable().describe(`
        * * Field Name: RequirementsNotes
        * * Display Name: Requirements Notes
        * * SQL Data Type: nvarchar(MAX)`),
    CampaignID: z.string().nullable().describe(`
        * * Field Name: CampaignID
        * * Display Name: Campaign ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Campaigns (vwCampaigns.ID)`),
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
    Campaign: z.string().nullable().describe(`
        * * Field Name: Campaign
        * * Display Name: Campaign
        * * SQL Data Type: nvarchar(200)`),
});

export type Grant_EntityType = z.infer<typeof Grant_Schema>;

/**
 * zod schema definition for the entity Inspections
 */
export const InspectionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PropertyID: z.string().describe(`
        * * Field Name: PropertyID
        * * Display Name: Property ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Properties__sample_property (vwProperties__sample_property.ID)`),
    InspectionDate: z.date().describe(`
        * * Field Name: InspectionDate
        * * Display Name: Inspection Date
        * * SQL Data Type: date`),
    InspectionTime: z.date().nullable().describe(`
        * * Field Name: InspectionTime
        * * Display Name: Inspection Time
        * * SQL Data Type: time`),
    InspectorName: z.string().describe(`
        * * Field Name: InspectorName
        * * Display Name: Inspector Name
        * * SQL Data Type: nvarchar(100)`),
    OverallRating: z.number().describe(`
        * * Field Name: OverallRating
        * * Display Name: Overall Rating
        * * SQL Data Type: smallint`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)`),
    FollowUpRequired: z.boolean().describe(`
        * * Field Name: FollowUpRequired
        * * Display Name: Follow Up Required
        * * SQL Data Type: bit
        * * Default Value: 0`),
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
    Property: z.string().describe(`
        * * Field Name: Property
        * * Display Name: Property
        * * SQL Data Type: nvarchar(200)`),
});

export type InspectionEntityType = z.infer<typeof InspectionSchema>;

/**
 * zod schema definition for the entity Knowledge Articles
 */
export const KnowledgeArticleSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Title: z.string().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(300)`),
    Slug: z.string().describe(`
        * * Field Name: Slug
        * * Display Name: Slug
        * * SQL Data Type: varchar(300)
        * * Description: URL-friendly unique identifier for the article`),
    Body: z.string().describe(`
        * * Field Name: Body
        * * Display Name: Body
        * * SQL Data Type: nvarchar(MAX)`),
    CategoryID: z.string().nullable().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Categories (vwCategories.ID)`),
    AuthorAgentID: z.string().describe(`
        * * Field Name: AuthorAgentID
        * * Display Name: Author Agent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Support Agents (vwSupportAgents.ID)`),
    IsPublished: z.boolean().describe(`
        * * Field Name: IsPublished
        * * Display Name: Is Published
        * * SQL Data Type: bit
        * * Default Value: 0`),
    ViewCount: z.number().describe(`
        * * Field Name: ViewCount
        * * Display Name: View Count
        * * SQL Data Type: int
        * * Default Value: 0`),
    HelpfulCount: z.number().describe(`
        * * Field Name: HelpfulCount
        * * Display Name: Helpful Count
        * * SQL Data Type: int
        * * Default Value: 0`),
    CreatedAt: z.date().describe(`
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
    UpdatedAt: z.date().describe(`
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
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
    Category: z.string().nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(150)`),
});

export type KnowledgeArticleEntityType = z.infer<typeof KnowledgeArticleSchema>;

/**
 * zod schema definition for the entity Leases
 */
export const LeaseSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PropertyID: z.string().describe(`
        * * Field Name: PropertyID
        * * Display Name: Property ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Properties__sample_property (vwProperties__sample_property.ID)`),
    TenantID: z.string().describe(`
        * * Field Name: TenantID
        * * Display Name: Tenant ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Tenants (vwTenants.ID)`),
    StartDate: z.date().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: date`),
    EndDate: z.date().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: date`),
    MonthlyRent: z.number().describe(`
        * * Field Name: MonthlyRent
        * * Display Name: Monthly Rent
        * * SQL Data Type: decimal(10, 2)`),
    SecurityDeposit: z.number().describe(`
        * * Field Name: SecurityDeposit
        * * Display Name: Security Deposit
        * * SQL Data Type: decimal(10, 2)
        * * Default Value: 0`),
    Status: z.union([z.literal('Active'), z.literal('Expired'), z.literal('Pending'), z.literal('Terminated')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Expired
    *   * Pending
    *   * Terminated`),
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
    Property: z.string().describe(`
        * * Field Name: Property
        * * Display Name: Property
        * * SQL Data Type: nvarchar(200)`),
});

export type LeaseEntityType = z.infer<typeof LeaseSchema>;

/**
 * zod schema definition for the entity Locations
 */
export const LocationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Address: z.string().describe(`
        * * Field Name: Address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(300)`),
    City: z.string().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: varchar(2)`),
    ZipCode: z.string().describe(`
        * * Field Name: ZipCode
        * * Display Name: Zip Code
        * * SQL Data Type: varchar(10)`),
    Phone: z.string().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: varchar(20)`),
    OpenTime: z.date().describe(`
        * * Field Name: OpenTime
        * * Display Name: Open Time
        * * SQL Data Type: time
        * * Description: Facility daily opening time`),
    CloseTime: z.date().describe(`
        * * Field Name: CloseTime
        * * Display Name: Close Time
        * * SQL Data Type: time
        * * Description: Facility daily closing time`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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

export type LocationEntityType = z.infer<typeof LocationSchema>;

/**
 * zod schema definition for the entity Maintenance Requests
 */
export const MaintenanceRequestSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PropertyID: z.string().describe(`
        * * Field Name: PropertyID
        * * Display Name: Property ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Properties__sample_property (vwProperties__sample_property.ID)`),
    TenantID: z.string().nullable().describe(`
        * * Field Name: TenantID
        * * Display Name: Tenant ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Tenants (vwTenants.ID)`),
    Title: z.string().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Priority: z.union([z.literal('Emergency'), z.literal('High'), z.literal('Low'), z.literal('Medium')]).describe(`
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Medium
    * * Value List Type: List
    * * Possible Values 
    *   * Emergency
    *   * High
    *   * Low
    *   * Medium`),
    Status: z.union([z.literal('Cancelled'), z.literal('Completed'), z.literal('InProgress'), z.literal('Open')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Open
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * InProgress
    *   * Open`),
    RequestDate: z.date().describe(`
        * * Field Name: RequestDate
        * * Display Name: Request Date
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
    CompletedDate: z.date().nullable().describe(`
        * * Field Name: CompletedDate
        * * Display Name: Completed Date
        * * SQL Data Type: datetime`),
    EstimatedCost: z.number().nullable().describe(`
        * * Field Name: EstimatedCost
        * * Display Name: Estimated Cost
        * * SQL Data Type: decimal(10, 2)`),
    ActualCost: z.number().nullable().describe(`
        * * Field Name: ActualCost
        * * Display Name: Actual Cost
        * * SQL Data Type: decimal(10, 2)`),
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
    Property: z.string().describe(`
        * * Field Name: Property
        * * Display Name: Property
        * * SQL Data Type: nvarchar(200)`),
});

export type MaintenanceRequestEntityType = z.infer<typeof MaintenanceRequestSchema>;

/**
 * zod schema definition for the entity Member Measurements
 */
export const MemberMeasurementSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    MeasurementDate: z.date().describe(`
        * * Field Name: MeasurementDate
        * * Display Name: Measurement Date
        * * SQL Data Type: date
        * * Default Value: getutcdate()`),
    WeightLbs: z.number().describe(`
        * * Field Name: WeightLbs
        * * Display Name: Weight Lbs
        * * SQL Data Type: decimal(5, 1)
        * * Description: Member weight in pounds`),
    BodyFatPercent: z.number().nullable().describe(`
        * * Field Name: BodyFatPercent
        * * Display Name: Body Fat Percent
        * * SQL Data Type: decimal(4, 1)
        * * Description: Body fat percentage`),
    BMI: z.number().nullable().describe(`
        * * Field Name: BMI
        * * Display Name: BMI
        * * SQL Data Type: decimal(4, 1)`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)`),
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

export type MemberMeasurementEntityType = z.infer<typeof MemberMeasurementSchema>;

/**
 * zod schema definition for the entity Members
 */
export const MemberSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: varchar(20)`),
    DateOfBirth: z.date().describe(`
        * * Field Name: DateOfBirth
        * * Display Name: Date Of Birth
        * * SQL Data Type: date`),
    EmergencyContact: z.string().describe(`
        * * Field Name: EmergencyContact
        * * Display Name: Emergency Contact
        * * SQL Data Type: nvarchar(200)
        * * Description: Emergency contact name and phone number`),
    MembershipTierID: z.string().describe(`
        * * Field Name: MembershipTierID
        * * Display Name: Membership Tier ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Membership Tiers (vwMembershipTiers.ID)`),
    LocationID: z.string().describe(`
        * * Field Name: LocationID
        * * Display Name: Location ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Locations (vwLocations.ID)`),
    JoinDate: z.date().describe(`
        * * Field Name: JoinDate
        * * Display Name: Join Date
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)`),
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
    MembershipTier: z.string().describe(`
        * * Field Name: MembershipTier
        * * Display Name: Membership Tier
        * * SQL Data Type: nvarchar(100)`),
    Location: z.string().describe(`
        * * Field Name: Location
        * * Display Name: Location
        * * SQL Data Type: nvarchar(200)`),
});

export type MemberEntityType = z.infer<typeof MemberSchema>;

/**
 * zod schema definition for the entity Membership Tiers
 */
export const MembershipTierSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    MonthlyFee: z.number().describe(`
        * * Field Name: MonthlyFee
        * * Display Name: Monthly Fee
        * * SQL Data Type: decimal(8, 2)
        * * Description: Monthly membership fee in dollars`),
    AnnualFee: z.number().nullable().describe(`
        * * Field Name: AnnualFee
        * * Display Name: Annual Fee
        * * SQL Data Type: decimal(8, 2)
        * * Description: Optional annual fee (discount vs monthly)`),
    MaxClassesPerWeek: z.number().nullable().describe(`
        * * Field Name: MaxClassesPerWeek
        * * Display Name: Max Classes Per Week
        * * SQL Data Type: int
        * * Description: Maximum group classes allowed per week for this tier`),
    HasPoolAccess: z.boolean().describe(`
        * * Field Name: HasPoolAccess
        * * Display Name: Has Pool Access
        * * SQL Data Type: bit
        * * Default Value: 0`),
    HasSaunaAccess: z.boolean().describe(`
        * * Field Name: HasSaunaAccess
        * * Display Name: Has Sauna Access
        * * SQL Data Type: bit
        * * Default Value: 0`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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

export type MembershipTierEntityType = z.infer<typeof MembershipTierSchema>;

/**
 * zod schema definition for the entity Menu Categories
 */
export const MenuCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    SortOrder: z.number().describe(`
        * * Field Name: SortOrder
        * * Display Name: Sort Order
        * * SQL Data Type: int
        * * Default Value: 0`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
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

export type MenuCategoryEntityType = z.infer<typeof MenuCategorySchema>;

/**
 * zod schema definition for the entity Menu Items
 */
export const MenuItemSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    CategoryID: z.string().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Menu Categories (vwMenuCategories.ID)`),
    Price: z.number().describe(`
        * * Field Name: Price
        * * Display Name: Price
        * * SQL Data Type: decimal(8, 2)
        * * Description: Menu item sale price`),
    CalorieCount: z.number().nullable().describe(`
        * * Field Name: CalorieCount
        * * Display Name: Calorie Count
        * * SQL Data Type: int`),
    IsVegetarian: z.boolean().describe(`
        * * Field Name: IsVegetarian
        * * Display Name: Is Vegetarian
        * * SQL Data Type: bit
        * * Default Value: 0`),
    IsGlutenFree: z.boolean().describe(`
        * * Field Name: IsGlutenFree
        * * Display Name: Is Gluten Free
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether the item contains no gluten ingredients`),
    IsAvailable: z.boolean().describe(`
        * * Field Name: IsAvailable
        * * Display Name: Is Available
        * * SQL Data Type: bit
        * * Default Value: 1`),
    PrepTimeMinutes: z.number().describe(`
        * * Field Name: PrepTimeMinutes
        * * Display Name: Prep Time Minutes
        * * SQL Data Type: int
        * * Default Value: 15
        * * Description: Estimated preparation time in minutes`),
    ImageURL: z.string().nullable().describe(`
        * * Field Name: ImageURL
        * * Display Name: Image URL
        * * SQL Data Type: nvarchar(500)`),
    CreatedAt: z.date().describe(`
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
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
    Category: z.string().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)`),
});

export type MenuItemEntityType = z.infer<typeof MenuItemSchema>;

/**
 * zod schema definition for the entity Offers
 */
export const OfferSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PropertyID: z.string().describe(`
        * * Field Name: PropertyID
        * * Display Name: Property ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Properties (vwProperties.ID)`),
    ClientID: z.string().describe(`
        * * Field Name: ClientID
        * * Display Name: Client ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Clients (vwClients.ID)`),
    OfferAmount: z.number().describe(`
        * * Field Name: OfferAmount
        * * Display Name: Offer Amount
        * * SQL Data Type: decimal(12, 2)
        * * Description: Amount offered by the buyer`),
    OfferDate: z.date().describe(`
        * * Field Name: OfferDate
        * * Display Name: Offer Date
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
    ExpirationDate: z.date().describe(`
        * * Field Name: ExpirationDate
        * * Display Name: Expiration Date
        * * SQL Data Type: datetime`),
    Status: z.union([z.literal('Accepted'), z.literal('Countered'), z.literal('Expired'), z.literal('Pending'), z.literal('Rejected')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: varchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Accepted
    *   * Countered
    *   * Expired
    *   * Pending
    *   * Rejected`),
    CounterOfferAmount: z.number().nullable().describe(`
        * * Field Name: CounterOfferAmount
        * * Display Name: Counter Offer Amount
        * * SQL Data Type: decimal(12, 2)`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)`),
    IsAccepted: z.boolean().describe(`
        * * Field Name: IsAccepted
        * * Display Name: Is Accepted
        * * SQL Data Type: bit
        * * Default Value: 0`),
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

export type OfferEntityType = z.infer<typeof OfferSchema>;

/**
 * zod schema definition for the entity Open Houses
 */
export const OpenHouseSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PropertyID: z.string().describe(`
        * * Field Name: PropertyID
        * * Display Name: Property ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Properties (vwProperties.ID)`),
    AgentID: z.string().describe(`
        * * Field Name: AgentID
        * * Display Name: Agent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Agents (vwAgents.ID)`),
    StartTime: z.date().describe(`
        * * Field Name: StartTime
        * * Display Name: Start Time
        * * SQL Data Type: datetime`),
    EndTime: z.date().describe(`
        * * Field Name: EndTime
        * * Display Name: End Time
        * * SQL Data Type: datetime`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
    MaxAttendees: z.number().nullable().describe(`
        * * Field Name: MaxAttendees
        * * Display Name: Max Attendees
        * * SQL Data Type: int
        * * Description: Maximum allowed attendees for the open house`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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

export type OpenHouseEntityType = z.infer<typeof OpenHouseSchema>;

/**
 * zod schema definition for the entity Order Items
 */
export const OrderItemSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrderID: z.string().describe(`
        * * Field Name: OrderID
        * * Display Name: Order ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Customer Orders (vwCustomerOrders.ID)`),
    MenuItemID: z.string().describe(`
        * * Field Name: MenuItemID
        * * Display Name: Menu Item ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Menu Items (vwMenuItems.ID)`),
    Quantity: z.number().describe(`
        * * Field Name: Quantity
        * * Display Name: Quantity
        * * SQL Data Type: smallint
        * * Default Value: 1`),
    UnitPrice: z.number().describe(`
        * * Field Name: UnitPrice
        * * Display Name: Unit Price
        * * SQL Data Type: decimal(8, 2)`),
    SpecialInstructions: z.string().nullable().describe(`
        * * Field Name: SpecialInstructions
        * * Display Name: Special Instructions
        * * SQL Data Type: nvarchar(500)
        * * Description: Guest dietary modification or preference notes`),
    Status: z.union([z.literal('Cancelled'), z.literal('Pending'), z.literal('Preparing'), z.literal('Ready'), z.literal('Served')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: varchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Pending
    *   * Preparing
    *   * Ready
    *   * Served`),
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
    MenuItem: z.string().describe(`
        * * Field Name: MenuItem
        * * Display Name: Menu Item
        * * SQL Data Type: nvarchar(200)`),
});

export type OrderItemEntityType = z.infer<typeof OrderItemSchema>;

/**
 * zod schema definition for the entity Owners
 */
export const OwnerSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(50)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(50)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(200)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: varchar(20)`),
    Address: z.string().nullable().describe(`
        * * Field Name: Address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(300)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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

export type OwnerEntityType = z.infer<typeof OwnerSchema>;

/**
 * zod schema definition for the entity Patrons
 */
export const PatronSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CardNumber: z.string().describe(`
        * * Field Name: CardNumber
        * * Display Name: Card Number
        * * SQL Data Type: varchar(20)
        * * Description: Library card number for patron identification`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: varchar(20)`),
    DateOfBirth: z.date().nullable().describe(`
        * * Field Name: DateOfBirth
        * * Display Name: Date Of Birth
        * * SQL Data Type: date`),
    Address: z.string().nullable().describe(`
        * * Field Name: Address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(300)`),
    JoinDate: z.date().describe(`
        * * Field Name: JoinDate
        * * Display Name: Join Date
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
    HomeBranchID: z.string().describe(`
        * * Field Name: HomeBranchID
        * * Display Name: Home Branch ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Branches (vwBranches.ID)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    MaxCheckouts: z.number().describe(`
        * * Field Name: MaxCheckouts
        * * Display Name: Max Checkouts
        * * SQL Data Type: int
        * * Default Value: 10
        * * Description: Maximum number of books a patron can check out simultaneously`),
    FinesOwed: z.number().describe(`
        * * Field Name: FinesOwed
        * * Display Name: Fines Owed
        * * SQL Data Type: decimal(8, 2)
        * * Default Value: 0
        * * Description: Total outstanding fines owed by the patron`),
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
    HomeBranch: z.string().describe(`
        * * Field Name: HomeBranch
        * * Display Name: Home Branch
        * * SQL Data Type: nvarchar(200)`),
});

export type PatronEntityType = z.infer<typeof PatronSchema>;

/**
 * zod schema definition for the entity Payments
 */
export const PaymentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(8, 2)`),
    PaymentDate: z.date().describe(`
        * * Field Name: PaymentDate
        * * Display Name: Payment Date
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
    PaymentMethod: z.union([z.literal('ACH'), z.literal('Cash'), z.literal('Check'), z.literal('Credit'), z.literal('Debit')]).describe(`
        * * Field Name: PaymentMethod
        * * Display Name: Payment Method
        * * SQL Data Type: varchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * ACH
    *   * Cash
    *   * Check
    *   * Credit
    *   * Debit
        * * Description: Payment method: Credit, Debit, Cash, ACH, Check`),
    Description: z.string().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(300)`),
    ReferenceNumber: z.string().nullable().describe(`
        * * Field Name: ReferenceNumber
        * * Display Name: Reference Number
        * * SQL Data Type: varchar(50)`),
    IsRefund: z.boolean().describe(`
        * * Field Name: IsRefund
        * * Display Name: Is Refund
        * * SQL Data Type: bit
        * * Default Value: 0`),
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
 * zod schema definition for the entity Payments__sample_property
 */
export const Payment__sample_propertySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    LeaseID: z.string().describe(`
        * * Field Name: LeaseID
        * * Display Name: Lease ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Leases (vwLeases.ID)`),
    PaymentDate: z.date().describe(`
        * * Field Name: PaymentDate
        * * Display Name: Payment Date
        * * SQL Data Type: date`),
    Amount: z.number().describe(`
        * * Field Name: Amount
        * * Display Name: Amount
        * * SQL Data Type: decimal(10, 2)`),
    PaymentMethod: z.union([z.literal('ACH'), z.literal('Cash'), z.literal('Check'), z.literal('CreditCard'), z.literal('Wire')]).describe(`
        * * Field Name: PaymentMethod
        * * Display Name: Payment Method
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Check
    * * Value List Type: List
    * * Possible Values 
    *   * ACH
    *   * Cash
    *   * Check
    *   * CreditCard
    *   * Wire`),
    IsLatePayment: z.boolean().describe(`
        * * Field Name: IsLatePayment
        * * Display Name: Is Late Payment
        * * SQL Data Type: bit
        * * Default Value: 0`),
    LateFee: z.number().describe(`
        * * Field Name: LateFee
        * * Display Name: Late Fee
        * * SQL Data Type: decimal(8, 2)
        * * Default Value: 0`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(500)`),
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

export type Payment__sample_propertyEntityType = z.infer<typeof Payment__sample_propertySchema>;

/**
 * zod schema definition for the entity Personal Training Sessions
 */
export const PersonalTrainingSessionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TrainerID: z.string().describe(`
        * * Field Name: TrainerID
        * * Display Name: Trainer ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Trainers (vwTrainers.ID)`),
    MemberID: z.string().describe(`
        * * Field Name: MemberID
        * * Display Name: Member ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Members (vwMembers.ID)`),
    SessionDate: z.date().describe(`
        * * Field Name: SessionDate
        * * Display Name: Session Date
        * * SQL Data Type: date`),
    StartTime: z.date().describe(`
        * * Field Name: StartTime
        * * Display Name: Start Time
        * * SQL Data Type: time`),
    DurationMinutes: z.number().describe(`
        * * Field Name: DurationMinutes
        * * Display Name: Duration Minutes
        * * SQL Data Type: int
        * * Default Value: 60`),
    Status: z.union([z.literal('Cancelled'), z.literal('Completed'), z.literal('NoShow'), z.literal('Scheduled')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: varchar(20)
        * * Default Value: Scheduled
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * NoShow
    *   * Scheduled`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)`),
    Rating: z.number().nullable().describe(`
        * * Field Name: Rating
        * * Display Name: Rating
        * * SQL Data Type: smallint
        * * Description: Session rating by member (1-5 scale)`),
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

export type PersonalTrainingSessionEntityType = z.infer<typeof PersonalTrainingSessionSchema>;

/**
 * zod schema definition for the entity Priorities
 */
export const PrioritySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)`),
    SortOrder: z.number().describe(`
        * * Field Name: SortOrder
        * * Display Name: Sort Order
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Display order for priority listing (lower = higher priority)`),
    ColorHex: z.string().nullable().describe(`
        * * Field Name: ColorHex
        * * Display Name: Color Hex
        * * SQL Data Type: varchar(7)`),
    SLAResponseMinutes: z.number().nullable().describe(`
        * * Field Name: SLAResponseMinutes
        * * Display Name: SLA Response Minutes
        * * SQL Data Type: int
        * * Description: SLA target for initial response in minutes`),
    SLAResolutionMinutes: z.number().nullable().describe(`
        * * Field Name: SLAResolutionMinutes
        * * Display Name: SLA Resolution Minutes
        * * SQL Data Type: int
        * * Description: SLA target for full resolution in minutes`),
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

export type PriorityEntityType = z.infer<typeof PrioritySchema>;

/**
 * zod schema definition for the entity Properties
 */
export const PropertySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Address: z.string().describe(`
        * * Field Name: Address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(300)`),
    City: z.string().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: varchar(2)`),
    ZipCode: z.string().describe(`
        * * Field Name: ZipCode
        * * Display Name: Zip Code
        * * SQL Data Type: varchar(10)`),
    PropertyTypeID: z.string().describe(`
        * * Field Name: PropertyTypeID
        * * Display Name: Property Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Property Types (vwPropertyTypes.ID)`),
    Bedrooms: z.number().describe(`
        * * Field Name: Bedrooms
        * * Display Name: Bedrooms
        * * SQL Data Type: smallint`),
    Bathrooms: z.number().describe(`
        * * Field Name: Bathrooms
        * * Display Name: Bathrooms
        * * SQL Data Type: decimal(3, 1)`),
    SquareFeet: z.number().describe(`
        * * Field Name: SquareFeet
        * * Display Name: Square Feet
        * * SQL Data Type: int
        * * Description: Total livable area in square feet`),
    LotSizeAcres: z.number().nullable().describe(`
        * * Field Name: LotSizeAcres
        * * Display Name: Lot Size Acres
        * * SQL Data Type: decimal(8, 3)
        * * Description: Lot size in acres for the property parcel`),
    YearBuilt: z.number().nullable().describe(`
        * * Field Name: YearBuilt
        * * Display Name: Year Built
        * * SQL Data Type: smallint`),
    ListPrice: z.number().describe(`
        * * Field Name: ListPrice
        * * Display Name: List Price
        * * SQL Data Type: decimal(12, 2)
        * * Description: Asking price for the property`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    AgentID: z.string().describe(`
        * * Field Name: AgentID
        * * Display Name: Agent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Agents (vwAgents.ID)`),
    Status: z.union([z.literal('Active'), z.literal('Pending'), z.literal('Rented'), z.literal('Sold'), z.literal('Withdrawn')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: varchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Pending
    *   * Rented
    *   * Sold
    *   * Withdrawn
        * * Description: Current listing status: Active, Pending, Sold, Withdrawn, or Rented`),
    ListedAt: z.date().describe(`
        * * Field Name: ListedAt
        * * Display Name: Listed At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
    IsForSale: z.boolean().describe(`
        * * Field Name: IsForSale
        * * Display Name: Is For Sale
        * * SQL Data Type: bit
        * * Default Value: 1`),
    IsForRent: z.boolean().describe(`
        * * Field Name: IsForRent
        * * Display Name: Is For Rent
        * * SQL Data Type: bit
        * * Default Value: 0`),
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
    PropertyType: z.string().describe(`
        * * Field Name: PropertyType
        * * Display Name: Property Type
        * * SQL Data Type: nvarchar(100)`),
});

export type PropertyEntityType = z.infer<typeof PropertySchema>;

/**
 * zod schema definition for the entity Properties__sample_property
 */
export const Property__sample_propertySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Address: z.string().describe(`
        * * Field Name: Address
        * * Display Name: Address
        * * SQL Data Type: nvarchar(300)`),
    City: z.string().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: varchar(2)`),
    ZipCode: z.string().describe(`
        * * Field Name: ZipCode
        * * Display Name: Zip Code
        * * SQL Data Type: varchar(10)`),
    PropertyTypeID: z.string().describe(`
        * * Field Name: PropertyTypeID
        * * Display Name: Property Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Property Types__sample_property (vwPropertyTypes__sample_property.ID)`),
    OwnerID: z.string().describe(`
        * * Field Name: OwnerID
        * * Display Name: Owner ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Owners (vwOwners.ID)`),
    SquareFootage: z.number().describe(`
        * * Field Name: SquareFootage
        * * Display Name: Square Footage
        * * SQL Data Type: int`),
    Bedrooms: z.number().nullable().describe(`
        * * Field Name: Bedrooms
        * * Display Name: Bedrooms
        * * SQL Data Type: smallint`),
    Bathrooms: z.number().nullable().describe(`
        * * Field Name: Bathrooms
        * * Display Name: Bathrooms
        * * SQL Data Type: decimal(3, 1)
        * * Description: Number of half-baths counted as 0.5`),
    YearBuilt: z.number().describe(`
        * * Field Name: YearBuilt
        * * Display Name: Year Built
        * * SQL Data Type: smallint`),
    PurchasePrice: z.number().describe(`
        * * Field Name: PurchasePrice
        * * Display Name: Purchase Price
        * * SQL Data Type: decimal(12, 2)`),
    CurrentValue: z.number().nullable().describe(`
        * * Field Name: CurrentValue
        * * Display Name: Current Value
        * * SQL Data Type: decimal(12, 2)`),
    IsAvailable: z.boolean().describe(`
        * * Field Name: IsAvailable
        * * Display Name: Is Available
        * * SQL Data Type: bit
        * * Default Value: 1`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
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
    PropertyType: z.string().describe(`
        * * Field Name: PropertyType
        * * Display Name: Property Type
        * * SQL Data Type: nvarchar(50)`),
});

export type Property__sample_propertyEntityType = z.infer<typeof Property__sample_propertySchema>;

/**
 * zod schema definition for the entity Property Images
 */
export const PropertyImageSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PropertyID: z.string().describe(`
        * * Field Name: PropertyID
        * * Display Name: Property ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Properties (vwProperties.ID)`),
    ImageURL: z.string().describe(`
        * * Field Name: ImageURL
        * * Display Name: Image URL
        * * SQL Data Type: nvarchar(500)`),
    Caption: z.string().nullable().describe(`
        * * Field Name: Caption
        * * Display Name: Caption
        * * SQL Data Type: nvarchar(200)`),
    SortOrder: z.number().describe(`
        * * Field Name: SortOrder
        * * Display Name: Sort Order
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Display order for property image gallery`),
    IsPrimary: z.boolean().describe(`
        * * Field Name: IsPrimary
        * * Display Name: Is Primary
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this is the primary listing photo`),
    UploadedAt: z.date().describe(`
        * * Field Name: UploadedAt
        * * Display Name: Uploaded At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
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

export type PropertyImageEntityType = z.infer<typeof PropertyImageSchema>;

/**
 * zod schema definition for the entity Property Types
 */
export const PropertyTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(500)`),
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

export type PropertyTypeEntityType = z.infer<typeof PropertyTypeSchema>;

/**
 * zod schema definition for the entity Property Types__sample_property
 */
export const PropertyType__sample_propertySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    IsResidential: z.boolean().describe(`
        * * Field Name: IsResidential
        * * Display Name: Is Residential
        * * SQL Data Type: bit
        * * Default Value: 1`),
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

export type PropertyType__sample_propertyEntityType = z.infer<typeof PropertyType__sample_propertySchema>;

/**
 * zod schema definition for the entity Reservations
 */
export const ReservationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    GuestName: z.string().describe(`
        * * Field Name: GuestName
        * * Display Name: Guest Name
        * * SQL Data Type: nvarchar(200)`),
    GuestPhone: z.string().describe(`
        * * Field Name: GuestPhone
        * * Display Name: Guest Phone
        * * SQL Data Type: varchar(20)`),
    GuestEmail: z.string().nullable().describe(`
        * * Field Name: GuestEmail
        * * Display Name: Guest Email
        * * SQL Data Type: nvarchar(255)`),
    PartySize: z.number().describe(`
        * * Field Name: PartySize
        * * Display Name: Party Size
        * * SQL Data Type: smallint`),
    TableID: z.string().nullable().describe(`
        * * Field Name: TableID
        * * Display Name: Table ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Table Seatings (vwTableSeatings.ID)`),
    ReservationDate: z.date().describe(`
        * * Field Name: ReservationDate
        * * Display Name: Reservation Date
        * * SQL Data Type: date`),
    ReservationTime: z.date().describe(`
        * * Field Name: ReservationTime
        * * Display Name: Reservation Time
        * * SQL Data Type: time`),
    Status: z.union([z.literal('Cancelled'), z.literal('Completed'), z.literal('Confirmed'), z.literal('NoShow'), z.literal('Seated')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: varchar(20)
        * * Default Value: Confirmed
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * Confirmed
    *   * NoShow
    *   * Seated
        * * Description: Current status of the reservation`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedAt: z.date().describe(`
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
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

export type ReservationEntityType = z.infer<typeof ReservationSchema>;

/**
 * zod schema definition for the entity Showings
 */
export const ShowingSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PropertyID: z.string().describe(`
        * * Field Name: PropertyID
        * * Display Name: Property ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Properties (vwProperties.ID)`),
    ClientID: z.string().describe(`
        * * Field Name: ClientID
        * * Display Name: Client ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Clients (vwClients.ID)`),
    AgentID: z.string().describe(`
        * * Field Name: AgentID
        * * Display Name: Agent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Agents (vwAgents.ID)`),
    ScheduledAt: z.date().describe(`
        * * Field Name: ScheduledAt
        * * Display Name: Scheduled At
        * * SQL Data Type: datetime`),
    DurationMinutes: z.number().describe(`
        * * Field Name: DurationMinutes
        * * Display Name: Duration Minutes
        * * SQL Data Type: int
        * * Default Value: 30`),
    Feedback: z.string().nullable().describe(`
        * * Field Name: Feedback
        * * Display Name: Feedback
        * * SQL Data Type: nvarchar(MAX)`),
    Rating: z.number().nullable().describe(`
        * * Field Name: Rating
        * * Display Name: Rating
        * * SQL Data Type: smallint
        * * Description: Client rating of the showing experience (1-5)`),
    Status: z.union([z.literal('Cancelled'), z.literal('Completed'), z.literal('NoShow'), z.literal('Scheduled')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: varchar(20)
        * * Default Value: Scheduled
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * NoShow
    *   * Scheduled`),
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

export type ShowingEntityType = z.infer<typeof ShowingSchema>;

/**
 * zod schema definition for the entity Staffs
 */
export const StaffSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    Phone: z.string().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: varchar(20)`),
    Role: z.union([z.literal('Bartender'), z.literal('Busser'), z.literal('Chef'), z.literal('Host'), z.literal('Manager'), z.literal('Server')]).describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: varchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Bartender
    *   * Busser
    *   * Chef
    *   * Host
    *   * Manager
    *   * Server
        * * Description: Staff role determining job responsibilities`),
    HourlyRate: z.number().describe(`
        * * Field Name: HourlyRate
        * * Display Name: Hourly Rate
        * * SQL Data Type: decimal(6, 2)`),
    HireDate: z.date().describe(`
        * * Field Name: HireDate
        * * Display Name: Hire Date
        * * SQL Data Type: date`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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

export type StaffEntityType = z.infer<typeof StaffSchema>;

/**
 * zod schema definition for the entity Support Agents
 */
export const SupportAgentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: varchar(20)`),
    DepartmentID: z.string().describe(`
        * * Field Name: DepartmentID
        * * Display Name: Department ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Departments (vwDepartments.ID)`),
    Tier: z.number().describe(`
        * * Field Name: Tier
        * * Display Name: Tier
        * * SQL Data Type: smallint
        * * Default Value: 1
        * * Description: Support tier level: 1=Basic, 2=Advanced, 3=Expert`),
    IsAvailable: z.boolean().describe(`
        * * Field Name: IsAvailable
        * * Display Name: Is Available
        * * SQL Data Type: bit
        * * Default Value: 1`),
    HireDate: z.date().describe(`
        * * Field Name: HireDate
        * * Display Name: Hire Date
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
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
    Department: z.string().describe(`
        * * Field Name: Department
        * * Display Name: Department
        * * SQL Data Type: nvarchar(150)`),
});

export type SupportAgentEntityType = z.infer<typeof SupportAgentSchema>;

/**
 * zod schema definition for the entity Table Seatings
 */
export const TableSeatingSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TableNumber: z.string().describe(`
        * * Field Name: TableNumber
        * * Display Name: Table Number
        * * SQL Data Type: varchar(10)
        * * Description: Display number for the table (e.g. T1, B2)`),
    Capacity: z.number().describe(`
        * * Field Name: Capacity
        * * Display Name: Capacity
        * * SQL Data Type: smallint
        * * Description: Maximum number of guests the table can accommodate`),
    Section: z.string().describe(`
        * * Field Name: Section
        * * Display Name: Section
        * * SQL Data Type: varchar(30)
        * * Default Value: Main`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
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

export type TableSeatingEntityType = z.infer<typeof TableSeatingSchema>;

/**
 * zod schema definition for the entity Tenants
 */
export const TenantSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(50)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(50)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(200)`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: varchar(20)`),
    DateOfBirth: z.date().nullable().describe(`
        * * Field Name: DateOfBirth
        * * Display Name: Date Of Birth
        * * SQL Data Type: date`),
    CreditScore: z.number().nullable().describe(`
        * * Field Name: CreditScore
        * * Display Name: Credit Score
        * * SQL Data Type: smallint
        * * Description: FICO credit score`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    EmergencyContact: z.string().nullable().describe(`
        * * Field Name: EmergencyContact
        * * Display Name: Emergency Contact
        * * SQL Data Type: nvarchar(100)`),
    EmergencyPhone: z.string().nullable().describe(`
        * * Field Name: EmergencyPhone
        * * Display Name: Emergency Phone
        * * SQL Data Type: varchar(20)`),
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

export type TenantEntityType = z.infer<typeof TenantSchema>;

/**
 * zod schema definition for the entity Ticket Attachments
 */
export const TicketAttachmentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TicketID: z.string().describe(`
        * * Field Name: TicketID
        * * Display Name: Ticket ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Tickets (vwTickets.ID)`),
    FileName: z.string().describe(`
        * * Field Name: FileName
        * * Display Name: File Name
        * * SQL Data Type: nvarchar(300)`),
    FileSize: z.number().describe(`
        * * Field Name: FileSize
        * * Display Name: File Size
        * * SQL Data Type: int`),
    MimeType: z.string().describe(`
        * * Field Name: MimeType
        * * Display Name: Mime Type
        * * SQL Data Type: varchar(100)`),
    StoragePath: z.string().describe(`
        * * Field Name: StoragePath
        * * Display Name: Storage Path
        * * SQL Data Type: nvarchar(500)`),
    UploadedAt: z.date().describe(`
        * * Field Name: UploadedAt
        * * Display Name: Uploaded At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
    UploadedBy: z.string().describe(`
        * * Field Name: UploadedBy
        * * Display Name: Uploaded By
        * * SQL Data Type: nvarchar(255)`),
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

export type TicketAttachmentEntityType = z.infer<typeof TicketAttachmentSchema>;

/**
 * zod schema definition for the entity Ticket Comments
 */
export const TicketCommentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TicketID: z.string().describe(`
        * * Field Name: TicketID
        * * Display Name: Ticket ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Tickets (vwTickets.ID)`),
    AuthorEmail: z.string().describe(`
        * * Field Name: AuthorEmail
        * * Display Name: Author Email
        * * SQL Data Type: nvarchar(255)`),
    AuthorName: z.string().describe(`
        * * Field Name: AuthorName
        * * Display Name: Author Name
        * * SQL Data Type: nvarchar(200)`),
    Body: z.string().describe(`
        * * Field Name: Body
        * * Display Name: Body
        * * SQL Data Type: nvarchar(MAX)`),
    IsInternal: z.boolean().describe(`
        * * Field Name: IsInternal
        * * Display Name: Is Internal
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this comment is internal-only (not visible to requestor)`),
    CreatedAt: z.date().describe(`
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
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

export type TicketCommentEntityType = z.infer<typeof TicketCommentSchema>;

/**
 * zod schema definition for the entity Ticket Tags
 */
export const TicketTagSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TicketID: z.string().describe(`
        * * Field Name: TicketID
        * * Display Name: Ticket ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Tickets (vwTickets.ID)`),
    TagName: z.string().describe(`
        * * Field Name: TagName
        * * Display Name: Tag Name
        * * SQL Data Type: nvarchar(50)`),
    AddedAt: z.date().describe(`
        * * Field Name: AddedAt
        * * Display Name: Added At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
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

export type TicketTagEntityType = z.infer<typeof TicketTagSchema>;

/**
 * zod schema definition for the entity Tickets
 */
export const TicketSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TicketNumber: z.string().describe(`
        * * Field Name: TicketNumber
        * * Display Name: Ticket Number
        * * SQL Data Type: varchar(20)
        * * Description: Auto-generated human-readable ticket identifier`),
    Subject: z.string().describe(`
        * * Field Name: Subject
        * * Display Name: Subject
        * * SQL Data Type: nvarchar(300)`),
    Description: z.string().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    RequestorEmail: z.string().describe(`
        * * Field Name: RequestorEmail
        * * Display Name: Requestor Email
        * * SQL Data Type: nvarchar(255)`),
    RequestorName: z.string().describe(`
        * * Field Name: RequestorName
        * * Display Name: Requestor Name
        * * SQL Data Type: nvarchar(200)`),
    CategoryID: z.string().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Categories (vwCategories.ID)`),
    PriorityID: z.string().describe(`
        * * Field Name: PriorityID
        * * Display Name: Priority ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Priorities (vwPriorities.ID)`),
    AssignedAgentID: z.string().nullable().describe(`
        * * Field Name: AssignedAgentID
        * * Display Name: Assigned Agent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Support Agents (vwSupportAgents.ID)`),
    Status: z.union([z.literal('Closed'), z.literal('InProgress'), z.literal('Open'), z.literal('Resolved'), z.literal('Waiting')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: varchar(20)
        * * Default Value: Open
    * * Value List Type: List
    * * Possible Values 
    *   * Closed
    *   * InProgress
    *   * Open
    *   * Resolved
    *   * Waiting
        * * Description: Current ticket lifecycle status`),
    CreatedAt: z.date().describe(`
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
    UpdatedAt: z.date().describe(`
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
    ResolvedAt: z.date().nullable().describe(`
        * * Field Name: ResolvedAt
        * * Display Name: Resolved At
        * * SQL Data Type: datetime`),
    ClosedAt: z.date().nullable().describe(`
        * * Field Name: ClosedAt
        * * Display Name: Closed At
        * * SQL Data Type: datetime`),
    DueDate: z.date().nullable().describe(`
        * * Field Name: DueDate
        * * Display Name: Due Date
        * * SQL Data Type: datetime`),
    IsEscalated: z.boolean().describe(`
        * * Field Name: IsEscalated
        * * Display Name: Is Escalated
        * * SQL Data Type: bit
        * * Default Value: 0`),
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
    Category: z.string().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(150)`),
    Priority: z.string().describe(`
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: nvarchar(50)`),
});

export type TicketEntityType = z.infer<typeof TicketSchema>;

/**
 * zod schema definition for the entity Trainers
 */
export const TrainerSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    Phone: z.string().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: varchar(20)`),
    Specialization: z.string().describe(`
        * * Field Name: Specialization
        * * Display Name: Specialization
        * * SQL Data Type: nvarchar(200)`),
    HourlyRate: z.number().describe(`
        * * Field Name: HourlyRate
        * * Display Name: Hourly Rate
        * * SQL Data Type: decimal(6, 2)
        * * Description: Trainer per-hour rate for personal training sessions`),
    Bio: z.string().nullable().describe(`
        * * Field Name: Bio
        * * Display Name: Bio
        * * SQL Data Type: nvarchar(MAX)`),
    LocationID: z.string().describe(`
        * * Field Name: LocationID
        * * Display Name: Location ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Locations (vwLocations.ID)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    CertifiedSince: z.date().describe(`
        * * Field Name: CertifiedSince
        * * Display Name: Certified Since
        * * SQL Data Type: date
        * * Description: Date trainer obtained primary certification`),
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
    Location: z.string().describe(`
        * * Field Name: Location
        * * Display Name: Location
        * * SQL Data Type: nvarchar(200)`),
});

export type TrainerEntityType = z.infer<typeof TrainerSchema>;

/**
 * zod schema definition for the entity Transactions
 */
export const TransactionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PropertyID: z.string().describe(`
        * * Field Name: PropertyID
        * * Display Name: Property ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Properties (vwProperties.ID)`),
    BuyerID: z.string().describe(`
        * * Field Name: BuyerID
        * * Display Name: Buyer ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Clients (vwClients.ID)`),
    SellerAgentID: z.string().describe(`
        * * Field Name: SellerAgentID
        * * Display Name: Seller Agent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Agents (vwAgents.ID)`),
    BuyerAgentID: z.string().describe(`
        * * Field Name: BuyerAgentID
        * * Display Name: Buyer Agent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Agents (vwAgents.ID)`),
    SalePrice: z.number().describe(`
        * * Field Name: SalePrice
        * * Display Name: Sale Price
        * * SQL Data Type: decimal(12, 2)
        * * Description: Final sale price at closing`),
    ClosingDate: z.date().describe(`
        * * Field Name: ClosingDate
        * * Display Name: Closing Date
        * * SQL Data Type: date`),
    CommissionTotal: z.number().describe(`
        * * Field Name: CommissionTotal
        * * Display Name: Commission Total
        * * SQL Data Type: decimal(10, 2)
        * * Description: Total commission paid across both agents`),
    EscrowCompany: z.string().nullable().describe(`
        * * Field Name: EscrowCompany
        * * Display Name: Escrow Company
        * * SQL Data Type: nvarchar(200)`),
    Status: z.union([z.literal('Cancelled'), z.literal('Closed'), z.literal('InProgress')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: varchar(20)
        * * Default Value: InProgress
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Closed
    *   * InProgress`),
    CreatedAt: z.date().describe(`
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
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

export type TransactionEntityType = z.infer<typeof TransactionSchema>;

/**
 * zod schema definition for the entity Volunteer Logs
 */
export const VolunteerLogSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    VolunteerID: z.string().describe(`
        * * Field Name: VolunteerID
        * * Display Name: Volunteer ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Volunteers (vwVolunteers.ID)`),
    EventID: z.string().nullable().describe(`
        * * Field Name: EventID
        * * Display Name: Event ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Events (vwEvents.ID)`),
    LogDate: z.date().describe(`
        * * Field Name: LogDate
        * * Display Name: Log Date
        * * SQL Data Type: date`),
    HoursWorked: z.number().describe(`
        * * Field Name: HoursWorked
        * * Display Name: Hours Worked
        * * SQL Data Type: decimal(4, 1)
        * * Description: Number of hours worked on this task`),
    TaskDescription: z.string().describe(`
        * * Field Name: TaskDescription
        * * Display Name: Task Description
        * * SQL Data Type: nvarchar(500)`),
    ApprovedBy: z.string().nullable().describe(`
        * * Field Name: ApprovedBy
        * * Display Name: Approved By
        * * SQL Data Type: nvarchar(200)`),
    IsApproved: z.boolean().describe(`
        * * Field Name: IsApproved
        * * Display Name: Is Approved
        * * SQL Data Type: bit
        * * Default Value: 0`),
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
    Event: z.string().nullable().describe(`
        * * Field Name: Event
        * * Display Name: Event
        * * SQL Data Type: nvarchar(200)`),
});

export type VolunteerLogEntityType = z.infer<typeof VolunteerLogSchema>;

/**
 * zod schema definition for the entity Volunteers
 */
export const VolunteerSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    Phone: z.string().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: varchar(20)`),
    Skills: z.string().nullable().describe(`
        * * Field Name: Skills
        * * Display Name: Skills
        * * SQL Data Type: nvarchar(MAX)`),
    AvailableDays: z.string().nullable().describe(`
        * * Field Name: AvailableDays
        * * Display Name: Available Days
        * * SQL Data Type: varchar(50)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    JoinDate: z.date().describe(`
        * * Field Name: JoinDate
        * * Display Name: Join Date
        * * SQL Data Type: datetime
        * * Default Value: getutcdate()`),
    TotalHours: z.number().describe(`
        * * Field Name: TotalHours
        * * Display Name: Total Hours
        * * SQL Data Type: decimal(8, 1)
        * * Default Value: 0
        * * Description: Cumulative hours volunteered`),
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

export type VolunteerEntityType = z.infer<typeof VolunteerSchema>;
 
 

/**
 * Agents - strongly typed entity sub-class
 * * Schema: sample_re
 * * Base Table: Agent
 * * Base View: vwAgents
 * * @description Real estate agents and brokers
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Agents')
export class AgentEntity extends BaseEntity<AgentEntityType> {
    /**
    * Loads the Agents record from the database
    * @param ID: string - primary key value to load the Agents record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AgentEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: varchar(20)
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: LicenseNumber
    * * Display Name: License Number
    * * SQL Data Type: varchar(30)
    * * Description: State license number for the agent
    */
    get LicenseNumber(): string {
        return this.Get('LicenseNumber');
    }
    set LicenseNumber(value: string) {
        this.Set('LicenseNumber', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: HireDate
    * * Display Name: Hire Date
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get HireDate(): Date {
        return this.Get('HireDate');
    }
    set HireDate(value: Date) {
        this.Set('HireDate', value);
    }

    /**
    * * Field Name: CommissionRate
    * * Display Name: Commission Rate
    * * SQL Data Type: decimal(5, 2)
    * * Default Value: 3.00
    * * Description: Default commission percentage for this agent
    */
    get CommissionRate(): number {
        return this.Get('CommissionRate');
    }
    set CommissionRate(value: number) {
        this.Set('CommissionRate', value);
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
 * Authors - strongly typed entity sub-class
 * * Schema: sample_lib
 * * Base Table: Author
 * * Base View: vwAuthors
 * * @description Book authors
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Authors')
export class AuthorEntity extends BaseEntity<AuthorEntityType> {
    /**
    * Loads the Authors record from the database
    * @param ID: string - primary key value to load the Authors record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AuthorEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
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
    */
    get LastName(): string {
        return this.Get('LastName');
    }
    set LastName(value: string) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: BirthYear
    * * Display Name: Birth Year
    * * SQL Data Type: smallint
    */
    get BirthYear(): number | null {
        return this.Get('BirthYear');
    }
    set BirthYear(value: number | null) {
        this.Set('BirthYear', value);
    }

    /**
    * * Field Name: Nationality
    * * Display Name: Nationality
    * * SQL Data Type: nvarchar(100)
    */
    get Nationality(): string | null {
        return this.Get('Nationality');
    }
    set Nationality(value: string | null) {
        this.Set('Nationality', value);
    }

    /**
    * * Field Name: Bio
    * * Display Name: Bio
    * * SQL Data Type: nvarchar(MAX)
    */
    get Bio(): string | null {
        return this.Get('Bio');
    }
    set Bio(value: string | null) {
        this.Set('Bio', value);
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
 * Book Copies - strongly typed entity sub-class
 * * Schema: sample_lib
 * * Base Table: BookCopy
 * * Base View: vwBookCopies
 * * @description Physical copies of books at branches
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Book Copies')
export class BookCopyEntity extends BaseEntity<BookCopyEntityType> {
    /**
    * Loads the Book Copies record from the database
    * @param ID: string - primary key value to load the Book Copies record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof BookCopyEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: BookID
    * * Display Name: Book ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Books (vwBooks.ID)
    */
    get BookID(): string {
        return this.Get('BookID');
    }
    set BookID(value: string) {
        this.Set('BookID', value);
    }

    /**
    * * Field Name: BranchID
    * * Display Name: Branch ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Branches (vwBranches.ID)
    */
    get BranchID(): string {
        return this.Get('BranchID');
    }
    set BranchID(value: string) {
        this.Set('BranchID', value);
    }

    /**
    * * Field Name: Barcode
    * * Display Name: Barcode
    * * SQL Data Type: varchar(30)
    * * Description: Unique barcode for physical copy tracking
    */
    get Barcode(): string {
        return this.Get('Barcode');
    }
    set Barcode(value: string) {
        this.Set('Barcode', value);
    }

    /**
    * * Field Name: Condition
    * * Display Name: Condition
    * * SQL Data Type: varchar(20)
    * * Default Value: Good
    * * Value List Type: List
    * * Possible Values 
    *   * Damaged
    *   * Fair
    *   * Good
    *   * New
    *   * Poor
    * * Description: Physical condition of the copy
    */
    get Condition(): 'Damaged' | 'Fair' | 'Good' | 'New' | 'Poor' {
        return this.Get('Condition');
    }
    set Condition(value: 'Damaged' | 'Fair' | 'Good' | 'New' | 'Poor') {
        this.Set('Condition', value);
    }

    /**
    * * Field Name: AcquiredDate
    * * Display Name: Acquired Date
    * * SQL Data Type: date
    * * Default Value: getutcdate()
    */
    get AcquiredDate(): Date {
        return this.Get('AcquiredDate');
    }
    set AcquiredDate(value: Date) {
        this.Set('AcquiredDate', value);
    }

    /**
    * * Field Name: IsAvailable
    * * Display Name: Is Available
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether the copy is available for checkout
    */
    get IsAvailable(): boolean {
        return this.Get('IsAvailable');
    }
    set IsAvailable(value: boolean) {
        this.Set('IsAvailable', value);
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
    * * Field Name: Branch
    * * Display Name: Branch
    * * SQL Data Type: nvarchar(200)
    */
    get Branch(): string {
        return this.Get('Branch');
    }
}


/**
 * Books - strongly typed entity sub-class
 * * Schema: sample_lib
 * * Base Table: Book
 * * Base View: vwBooks
 * * @description Catalog of books in the library system
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Books')
export class BookEntity extends BaseEntity<BookEntityType> {
    /**
    * Loads the Books record from the database
    * @param ID: string - primary key value to load the Books record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof BookEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ISBN
    * * Display Name: ISBN
    * * SQL Data Type: varchar(13)
    * * Description: International Standard Book Number
    */
    get ISBN(): string {
        return this.Get('ISBN');
    }
    set ISBN(value: string) {
        this.Set('ISBN', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(300)
    */
    get Title(): string {
        return this.Get('Title');
    }
    set Title(value: string) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: PublicationYear
    * * Display Name: Publication Year
    * * SQL Data Type: smallint
    */
    get PublicationYear(): number {
        return this.Get('PublicationYear');
    }
    set PublicationYear(value: number) {
        this.Set('PublicationYear', value);
    }

    /**
    * * Field Name: Publisher
    * * Display Name: Publisher
    * * SQL Data Type: nvarchar(200)
    */
    get Publisher(): string {
        return this.Get('Publisher');
    }
    set Publisher(value: string) {
        this.Set('Publisher', value);
    }

    /**
    * * Field Name: PageCount
    * * Display Name: Page Count
    * * SQL Data Type: int
    */
    get PageCount(): number | null {
        return this.Get('PageCount');
    }
    set PageCount(value: number | null) {
        this.Set('PageCount', value);
    }

    /**
    * * Field Name: Language
    * * Display Name: Language
    * * SQL Data Type: varchar(30)
    * * Default Value: English
    */
    get Language(): string {
        return this.Get('Language');
    }
    set Language(value: string) {
        this.Set('Language', value);
    }

    /**
    * * Field Name: GenreID
    * * Display Name: Genre ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Genres (vwGenres.ID)
    */
    get GenreID(): string {
        return this.Get('GenreID');
    }
    set GenreID(value: string) {
        this.Set('GenreID', value);
    }

    /**
    * * Field Name: AuthorID
    * * Display Name: Author ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Authors (vwAuthors.ID)
    */
    get AuthorID(): string {
        return this.Get('AuthorID');
    }
    set AuthorID(value: string) {
        this.Set('AuthorID', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: AddedAt
    * * Display Name: Added At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get AddedAt(): Date {
        return this.Get('AddedAt');
    }
    set AddedAt(value: Date) {
        this.Set('AddedAt', value);
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
    * * Field Name: Genre
    * * Display Name: Genre
    * * SQL Data Type: nvarchar(100)
    */
    get Genre(): string {
        return this.Get('Genre');
    }
}


/**
 * Branches - strongly typed entity sub-class
 * * Schema: sample_lib
 * * Base Table: Branch
 * * Base View: vwBranches
 * * @description Library branch locations
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Branches')
export class BranchEntity extends BaseEntity<BranchEntityType> {
    /**
    * Loads the Branches record from the database
    * @param ID: string - primary key value to load the Branches record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof BranchEntity
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
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(300)
    */
    get Address(): string {
        return this.Get('Address');
    }
    set Address(value: string) {
        this.Set('Address', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
    */
    get City(): string {
        return this.Get('City');
    }
    set City(value: string) {
        this.Set('City', value);
    }

    /**
    * * Field Name: State
    * * Display Name: State
    * * SQL Data Type: varchar(2)
    */
    get State(): string {
        return this.Get('State');
    }
    set State(value: string) {
        this.Set('State', value);
    }

    /**
    * * Field Name: ZipCode
    * * Display Name: Zip Code
    * * SQL Data Type: varchar(10)
    */
    get ZipCode(): string {
        return this.Get('ZipCode');
    }
    set ZipCode(value: string) {
        this.Set('ZipCode', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: varchar(20)
    */
    get Phone(): string {
        return this.Get('Phone');
    }
    set Phone(value: string) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: OpeningYear
    * * Display Name: Opening Year
    * * SQL Data Type: smallint
    */
    get OpeningYear(): number {
        return this.Get('OpeningYear');
    }
    set OpeningYear(value: number) {
        this.Set('OpeningYear', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
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
 * Campaigns - strongly typed entity sub-class
 * * Schema: sample_npo
 * * Base Table: Campaign
 * * Base View: vwCampaigns
 * * @description Fundraising campaigns with goals and timelines
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Campaigns')
export class CampaignEntity extends BaseEntity<CampaignEntityType> {
    /**
    * Loads the Campaigns record from the database
    * @param ID: string - primary key value to load the Campaigns record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CampaignEntity
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
    * * Description: Unique identifier for the campaign
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
    */
    get Description(): string {
        return this.Get('Description');
    }
    set Description(value: string) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: GoalAmount
    * * Display Name: Goal Amount
    * * SQL Data Type: decimal(12, 2)
    * * Description: Target fundraising amount for the campaign
    */
    get GoalAmount(): number {
        return this.Get('GoalAmount');
    }
    set GoalAmount(value: number) {
        this.Set('GoalAmount', value);
    }

    /**
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: date
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
    * * SQL Data Type: date
    */
    get EndDate(): Date {
        return this.Get('EndDate');
    }
    set EndDate(value: Date) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: varchar(20)
    * * Default Value: Planning
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Cancelled
    *   * Completed
    *   * Planning
    * * Description: Current status: Planning, Active, Completed, or Cancelled
    */
    get Status(): 'Active' | 'Cancelled' | 'Completed' | 'Planning' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Cancelled' | 'Completed' | 'Planning') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get CreatedAt(): Date {
        return this.Get('CreatedAt');
    }
    set CreatedAt(value: Date) {
        this.Set('CreatedAt', value);
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
 * Categories - strongly typed entity sub-class
 * * Schema: sample_hd
 * * Base Table: Category
 * * Base View: vwCategories
 * * @description Hierarchical ticket categories for classification
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Categories')
export class CategoryEntity extends BaseEntity<CategoryEntityType> {
    /**
    * Loads the Categories record from the database
    * @param ID: string - primary key value to load the Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CategoryEntity
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
    * * SQL Data Type: nvarchar(150)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: ParentCategoryID
    * * Display Name: Parent Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Categories (vwCategories.ID)
    * * Description: Self-referencing FK for category hierarchy
    */
    get ParentCategoryID(): string | null {
        return this.Get('ParentCategoryID');
    }
    set ParentCategoryID(value: string | null) {
        this.Set('ParentCategoryID', value);
    }

    /**
    * * Field Name: DepartmentID
    * * Display Name: Department ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Departments (vwDepartments.ID)
    */
    get DepartmentID(): string | null {
        return this.Get('DepartmentID');
    }
    set DepartmentID(value: string | null) {
        this.Set('DepartmentID', value);
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
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
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
    * * Field Name: ParentCategory
    * * Display Name: Parent Category
    * * SQL Data Type: nvarchar(150)
    */
    get ParentCategory(): string | null {
        return this.Get('ParentCategory');
    }

    /**
    * * Field Name: Department
    * * Display Name: Department
    * * SQL Data Type: nvarchar(150)
    */
    get Department(): string | null {
        return this.Get('Department');
    }

    /**
    * * Field Name: RootParentCategoryID
    * * Display Name: Root Parent Category ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentCategoryID(): string | null {
        return this.Get('RootParentCategoryID');
    }
}


/**
 * Checkouts - strongly typed entity sub-class
 * * Schema: sample_lib
 * * Base Table: Checkout
 * * Base View: vwCheckouts
 * * @description Book checkout records
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Checkouts')
export class CheckoutEntity extends BaseEntity<CheckoutEntityType> {
    /**
    * Loads the Checkouts record from the database
    * @param ID: string - primary key value to load the Checkouts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CheckoutEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: BookCopyID
    * * Display Name: Book Copy ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Book Copies (vwBookCopies.ID)
    */
    get BookCopyID(): string {
        return this.Get('BookCopyID');
    }
    set BookCopyID(value: string) {
        this.Set('BookCopyID', value);
    }

    /**
    * * Field Name: PatronID
    * * Display Name: Patron ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Patrons (vwPatrons.ID)
    */
    get PatronID(): string {
        return this.Get('PatronID');
    }
    set PatronID(value: string) {
        this.Set('PatronID', value);
    }

    /**
    * * Field Name: CheckoutDate
    * * Display Name: Checkout Date
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get CheckoutDate(): Date {
        return this.Get('CheckoutDate');
    }
    set CheckoutDate(value: Date) {
        this.Set('CheckoutDate', value);
    }

    /**
    * * Field Name: DueDate
    * * Display Name: Due Date
    * * SQL Data Type: date
    * * Description: Expected return date for the checked out book
    */
    get DueDate(): Date {
        return this.Get('DueDate');
    }
    set DueDate(value: Date) {
        this.Set('DueDate', value);
    }

    /**
    * * Field Name: ReturnDate
    * * Display Name: Return Date
    * * SQL Data Type: datetime
    */
    get ReturnDate(): Date | null {
        return this.Get('ReturnDate');
    }
    set ReturnDate(value: Date | null) {
        this.Set('ReturnDate', value);
    }

    /**
    * * Field Name: IsReturned
    * * Display Name: Is Returned
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsReturned(): boolean {
        return this.Get('IsReturned');
    }
    set IsReturned(value: boolean) {
        this.Set('IsReturned', value);
    }

    /**
    * * Field Name: LateFee
    * * Display Name: Late Fee
    * * SQL Data Type: decimal(6, 2)
    * * Default Value: 0
    * * Description: Fee charged for late return
    */
    get LateFee(): number {
        return this.Get('LateFee');
    }
    set LateFee(value: number) {
        this.Set('LateFee', value);
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
 * Class Bookings - strongly typed entity sub-class
 * * Schema: sample_fit
 * * Base Table: ClassBooking
 * * Base View: vwClassBookings
 * * @description Member bookings for group fitness classes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Class Bookings')
export class ClassBookingEntity extends BaseEntity<ClassBookingEntityType> {
    /**
    * Loads the Class Bookings record from the database
    * @param ID: string - primary key value to load the Class Bookings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ClassBookingEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ClassID
    * * Display Name: Class ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Fitness Classes (vwFitnessClasses.ID)
    */
    get ClassID(): string {
        return this.Get('ClassID');
    }
    set ClassID(value: string) {
        this.Set('ClassID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: BookingDate
    * * Display Name: Booking Date
    * * SQL Data Type: date
    */
    get BookingDate(): Date {
        return this.Get('BookingDate');
    }
    set BookingDate(value: Date) {
        this.Set('BookingDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: varchar(20)
    * * Default Value: Confirmed
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Confirmed
    *   * Waitlisted
    */
    get Status(): 'Cancelled' | 'Confirmed' | 'Waitlisted' {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Confirmed' | 'Waitlisted') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: CheckedIn
    * * Display Name: Checked In
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get CheckedIn(): boolean {
        return this.Get('CheckedIn');
    }
    set CheckedIn(value: boolean) {
        this.Set('CheckedIn', value);
    }

    /**
    * * Field Name: CancelledAt
    * * Display Name: Cancelled At
    * * SQL Data Type: datetime
    */
    get CancelledAt(): Date | null {
        return this.Get('CancelledAt');
    }
    set CancelledAt(value: Date | null) {
        this.Set('CancelledAt', value);
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
    * * Field Name: Class
    * * Display Name: Class
    * * SQL Data Type: nvarchar(200)
    */
    get Class(): string {
        return this.Get('Class');
    }
}


/**
 * Clients - strongly typed entity sub-class
 * * Schema: sample_re
 * * Base Table: Client
 * * Base View: vwClients
 * * @description Prospective buyers and renters
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Clients')
export class ClientEntity extends BaseEntity<ClientEntityType> {
    /**
    * Loads the Clients record from the database
    * @param ID: string - primary key value to load the Clients record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ClientEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: varchar(20)
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: PreferredContactMethod
    * * Display Name: Preferred Contact Method
    * * SQL Data Type: varchar(10)
    * * Default Value: Email
    * * Value List Type: List
    * * Possible Values 
    *   * Email
    *   * Phone
    *   * Text
    * * Description: Preferred method of contact: Email, Phone, or Text
    */
    get PreferredContactMethod(): 'Email' | 'Phone' | 'Text' {
        return this.Get('PreferredContactMethod');
    }
    set PreferredContactMethod(value: 'Email' | 'Phone' | 'Text') {
        this.Set('PreferredContactMethod', value);
    }

    /**
    * * Field Name: Budget
    * * Display Name: Budget
    * * SQL Data Type: decimal(12, 2)
    * * Description: Maximum budget for property search
    */
    get Budget(): number | null {
        return this.Get('Budget');
    }
    set Budget(value: number | null) {
        this.Set('Budget', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: AgentID
    * * Display Name: Agent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Agents (vwAgents.ID)
    */
    get AgentID(): string {
        return this.Get('AgentID');
    }
    set AgentID(value: string) {
        this.Set('AgentID', value);
    }

    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get CreatedAt(): Date {
        return this.Get('CreatedAt');
    }
    set CreatedAt(value: Date) {
        this.Set('CreatedAt', value);
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
 * Customer Orders - strongly typed entity sub-class
 * * Schema: sample_rest
 * * Base Table: CustomerOrder
 * * Base View: vwCustomerOrders
 * * @description Customer orders placed at tables
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Customer Orders')
export class CustomerOrderEntity extends BaseEntity<CustomerOrderEntityType> {
    /**
    * Loads the Customer Orders record from the database
    * @param ID: string - primary key value to load the Customer Orders record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CustomerOrderEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrderNumber
    * * Display Name: Order Number
    * * SQL Data Type: varchar(20)
    * * Description: Unique sequential order identifier
    */
    get OrderNumber(): string {
        return this.Get('OrderNumber');
    }
    set OrderNumber(value: string) {
        this.Set('OrderNumber', value);
    }

    /**
    * * Field Name: TableID
    * * Display Name: Table ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Table Seatings (vwTableSeatings.ID)
    */
    get TableID(): string {
        return this.Get('TableID');
    }
    set TableID(value: string) {
        this.Set('TableID', value);
    }

    /**
    * * Field Name: ServerID
    * * Display Name: Server ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Staffs (vwStaffs.ID)
    */
    get ServerID(): string {
        return this.Get('ServerID');
    }
    set ServerID(value: string) {
        this.Set('ServerID', value);
    }

    /**
    * * Field Name: OrderDate
    * * Display Name: Order Date
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get OrderDate(): Date {
        return this.Get('OrderDate');
    }
    set OrderDate(value: Date) {
        this.Set('OrderDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: varchar(20)
    * * Default Value: Open
    * * Value List Type: List
    * * Possible Values 
    *   * Closed
    *   * InProgress
    *   * Open
    *   * Ready
    *   * Served
    */
    get Status(): 'Closed' | 'InProgress' | 'Open' | 'Ready' | 'Served' {
        return this.Get('Status');
    }
    set Status(value: 'Closed' | 'InProgress' | 'Open' | 'Ready' | 'Served') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: SubTotal
    * * Display Name: Sub Total
    * * SQL Data Type: decimal(10, 2)
    * * Default Value: 0
    */
    get SubTotal(): number {
        return this.Get('SubTotal');
    }
    set SubTotal(value: number) {
        this.Set('SubTotal', value);
    }

    /**
    * * Field Name: TaxAmount
    * * Display Name: Tax Amount
    * * SQL Data Type: decimal(10, 2)
    * * Default Value: 0
    */
    get TaxAmount(): number {
        return this.Get('TaxAmount');
    }
    set TaxAmount(value: number) {
        this.Set('TaxAmount', value);
    }

    /**
    * * Field Name: TipAmount
    * * Display Name: Tip Amount
    * * SQL Data Type: decimal(10, 2)
    * * Default Value: 0
    */
    get TipAmount(): number {
        return this.Get('TipAmount');
    }
    set TipAmount(value: number) {
        this.Set('TipAmount', value);
    }

    /**
    * * Field Name: TotalAmount
    * * Display Name: Total Amount
    * * SQL Data Type: decimal(10, 2)
    * * Default Value: 0
    * * Description: Order total including tax and tip
    */
    get TotalAmount(): number {
        return this.Get('TotalAmount');
    }
    set TotalAmount(value: number) {
        this.Set('TotalAmount', value);
    }

    /**
    * * Field Name: IsPaid
    * * Display Name: Is Paid
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsPaid(): boolean {
        return this.Get('IsPaid');
    }
    set IsPaid(value: boolean) {
        this.Set('IsPaid', value);
    }

    /**
    * * Field Name: PaidAt
    * * Display Name: Paid At
    * * SQL Data Type: datetime
    */
    get PaidAt(): Date | null {
        return this.Get('PaidAt');
    }
    set PaidAt(value: Date | null) {
        this.Set('PaidAt', value);
    }

    /**
    * * Field Name: PaymentMethod
    * * Display Name: Payment Method
    * * SQL Data Type: varchar(20)
    */
    get PaymentMethod(): string | null {
        return this.Get('PaymentMethod');
    }
    set PaymentMethod(value: string | null) {
        this.Set('PaymentMethod', value);
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
 * Daily Revenues - strongly typed entity sub-class
 * * Schema: sample_rest
 * * Base Table: DailyRevenue
 * * Base View: vwDailyRevenues
 * * @description Daily aggregated revenue and performance data
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Daily Revenues')
export class DailyRevenueEntity extends BaseEntity<DailyRevenueEntityType> {
    /**
    * Loads the Daily Revenues record from the database
    * @param ID: string - primary key value to load the Daily Revenues record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DailyRevenueEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: BusinessDate
    * * Display Name: Business Date
    * * SQL Data Type: date
    * * Description: Calendar date for revenue aggregation
    */
    get BusinessDate(): Date {
        return this.Get('BusinessDate');
    }
    set BusinessDate(value: Date) {
        this.Set('BusinessDate', value);
    }

    /**
    * * Field Name: TotalOrders
    * * Display Name: Total Orders
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get TotalOrders(): number {
        return this.Get('TotalOrders');
    }
    set TotalOrders(value: number) {
        this.Set('TotalOrders', value);
    }

    /**
    * * Field Name: TotalRevenue
    * * Display Name: Total Revenue
    * * SQL Data Type: decimal(12, 2)
    * * Default Value: 0
    */
    get TotalRevenue(): number {
        return this.Get('TotalRevenue');
    }
    set TotalRevenue(value: number) {
        this.Set('TotalRevenue', value);
    }

    /**
    * * Field Name: TotalTips
    * * Display Name: Total Tips
    * * SQL Data Type: decimal(10, 2)
    * * Default Value: 0
    */
    get TotalTips(): number {
        return this.Get('TotalTips');
    }
    set TotalTips(value: number) {
        this.Set('TotalTips', value);
    }

    /**
    * * Field Name: CustomerCount
    * * Display Name: Customer Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get CustomerCount(): number {
        return this.Get('CustomerCount');
    }
    set CustomerCount(value: number) {
        this.Set('CustomerCount', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
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
 * Departments - strongly typed entity sub-class
 * * Schema: sample_hd
 * * Base Table: Department
 * * Base View: vwDepartments
 * * @description Organizational departments for agent grouping
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Departments')
export class DepartmentEntity extends BaseEntity<DepartmentEntityType> {
    /**
    * Loads the Departments record from the database
    * @param ID: string - primary key value to load the Departments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DepartmentEntity
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
    * * SQL Data Type: nvarchar(150)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: ManagerEmail
    * * Display Name: Manager Email
    * * SQL Data Type: nvarchar(255)
    */
    get ManagerEmail(): string | null {
        return this.Get('ManagerEmail');
    }
    set ManagerEmail(value: string | null) {
        this.Set('ManagerEmail', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
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
 * Donations - strongly typed entity sub-class
 * * Schema: sample_npo
 * * Base Table: Donation
 * * Base View: vwDonations
 * * @description Financial contributions from donors
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Donations')
export class DonationEntity extends BaseEntity<DonationEntityType> {
    /**
    * Loads the Donations record from the database
    * @param ID: string - primary key value to load the Donations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DonationEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: DonorID
    * * Display Name: Donor ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Donors (vwDonors.ID)
    */
    get DonorID(): string {
        return this.Get('DonorID');
    }
    set DonorID(value: string) {
        this.Set('DonorID', value);
    }

    /**
    * * Field Name: CampaignID
    * * Display Name: Campaign ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Campaigns (vwCampaigns.ID)
    */
    get CampaignID(): string | null {
        return this.Get('CampaignID');
    }
    set CampaignID(value: string | null) {
        this.Set('CampaignID', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(10, 2)
    * * Description: Donation amount in dollars
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: DonationDate
    * * Display Name: Donation Date
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get DonationDate(): Date {
        return this.Get('DonationDate');
    }
    set DonationDate(value: Date) {
        this.Set('DonationDate', value);
    }

    /**
    * * Field Name: PaymentMethod
    * * Display Name: Payment Method
    * * SQL Data Type: varchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * ACH
    *   * Cash
    *   * Check
    *   * Credit
    *   * Stock
    *   * Wire
    */
    get PaymentMethod(): 'ACH' | 'Cash' | 'Check' | 'Credit' | 'Stock' | 'Wire' {
        return this.Get('PaymentMethod');
    }
    set PaymentMethod(value: 'ACH' | 'Cash' | 'Check' | 'Credit' | 'Stock' | 'Wire') {
        this.Set('PaymentMethod', value);
    }

    /**
    * * Field Name: IsRecurring
    * * Display Name: Is Recurring
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsRecurring(): boolean {
        return this.Get('IsRecurring');
    }
    set IsRecurring(value: boolean) {
        this.Set('IsRecurring', value);
    }

    /**
    * * Field Name: ReceiptNumber
    * * Display Name: Receipt Number
    * * SQL Data Type: varchar(30)
    */
    get ReceiptNumber(): string {
        return this.Get('ReceiptNumber');
    }
    set ReceiptNumber(value: string) {
        this.Set('ReceiptNumber', value);
    }

    /**
    * * Field Name: TaxDeductible
    * * Display Name: Tax Deductible
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this is a tax-deductible contribution
    */
    get TaxDeductible(): boolean {
        return this.Get('TaxDeductible');
    }
    set TaxDeductible(value: boolean) {
        this.Set('TaxDeductible', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
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
    * * Field Name: Campaign
    * * Display Name: Campaign
    * * SQL Data Type: nvarchar(200)
    */
    get Campaign(): string | null {
        return this.Get('Campaign');
    }
}


/**
 * Donors - strongly typed entity sub-class
 * * Schema: sample_npo
 * * Base Table: Donor
 * * Base View: vwDonors
 * * @description Individual, corporate, and foundation donors
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Donors')
export class DonorEntity extends BaseEntity<DonorEntityType> {
    /**
    * Loads the Donors record from the database
    * @param ID: string - primary key value to load the Donors record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DonorEntity
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
    * * Description: Unique identifier for the donor
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: varchar(20)
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(300)
    */
    get Address(): string | null {
        return this.Get('Address');
    }
    set Address(value: string | null) {
        this.Set('Address', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: varchar(2)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: ZipCode
    * * Display Name: Zip Code
    * * SQL Data Type: varchar(10)
    */
    get ZipCode(): string | null {
        return this.Get('ZipCode');
    }
    set ZipCode(value: string | null) {
        this.Set('ZipCode', value);
    }

    /**
    * * Field Name: DonorType
    * * Display Name: Donor Type
    * * SQL Data Type: varchar(20)
    * * Default Value: Individual
    * * Value List Type: List
    * * Possible Values 
    *   * Corporate
    *   * Foundation
    *   * Individual
    * * Description: Type of donor: Individual, Corporate, or Foundation
    */
    get DonorType(): 'Corporate' | 'Foundation' | 'Individual' {
        return this.Get('DonorType');
    }
    set DonorType(value: 'Corporate' | 'Foundation' | 'Individual') {
        this.Set('DonorType', value);
    }

    /**
    * * Field Name: IsAnonymous
    * * Display Name: Is Anonymous
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether the donor prefers to remain anonymous
    */
    get IsAnonymous(): boolean {
        return this.Get('IsAnonymous');
    }
    set IsAnonymous(value: boolean) {
        this.Set('IsAnonymous', value);
    }

    /**
    * * Field Name: FirstDonationDate
    * * Display Name: First Donation Date
    * * SQL Data Type: datetime
    */
    get FirstDonationDate(): Date | null {
        return this.Get('FirstDonationDate');
    }
    set FirstDonationDate(value: Date | null) {
        this.Set('FirstDonationDate', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: RegisteredAt
    * * Display Name: Registered At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get RegisteredAt(): Date {
        return this.Get('RegisteredAt');
    }
    set RegisteredAt(value: Date) {
        this.Set('RegisteredAt', value);
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
 * Event Attendees - strongly typed entity sub-class
 * * Schema: sample_npo
 * * Base Table: EventAttendee
 * * Base View: vwEventAttendees
 * * @description Links donors and volunteers to events
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Event Attendees')
export class EventAttendeeEntity extends BaseEntity<EventAttendeeEntityType> {
    /**
    * Loads the Event Attendees record from the database
    * @param ID: string - primary key value to load the Event Attendees record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EventAttendeeEntity
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
    */
    get EventID(): string {
        return this.Get('EventID');
    }
    set EventID(value: string) {
        this.Set('EventID', value);
    }

    /**
    * * Field Name: DonorID
    * * Display Name: Donor ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Donors (vwDonors.ID)
    */
    get DonorID(): string | null {
        return this.Get('DonorID');
    }
    set DonorID(value: string | null) {
        this.Set('DonorID', value);
    }

    /**
    * * Field Name: VolunteerID
    * * Display Name: Volunteer ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Volunteers (vwVolunteers.ID)
    */
    get VolunteerID(): string | null {
        return this.Get('VolunteerID');
    }
    set VolunteerID(value: string | null) {
        this.Set('VolunteerID', value);
    }

    /**
    * * Field Name: AttendeeType
    * * Display Name: Attendee Type
    * * SQL Data Type: varchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Donor
    *   * Guest
    *   * Volunteer
    */
    get AttendeeType(): 'Donor' | 'Guest' | 'Volunteer' {
        return this.Get('AttendeeType');
    }
    set AttendeeType(value: 'Donor' | 'Guest' | 'Volunteer') {
        this.Set('AttendeeType', value);
    }

    /**
    * * Field Name: CheckedIn
    * * Display Name: Checked In
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get CheckedIn(): boolean {
        return this.Get('CheckedIn');
    }
    set CheckedIn(value: boolean) {
        this.Set('CheckedIn', value);
    }

    /**
    * * Field Name: RegisteredAt
    * * Display Name: Registered At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get RegisteredAt(): Date {
        return this.Get('RegisteredAt');
    }
    set RegisteredAt(value: Date) {
        this.Set('RegisteredAt', value);
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
 * * Schema: sample_npo
 * * Base Table: Event
 * * Base View: vwEvents
 * * @description Fundraising and community events
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
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
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
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: CampaignID
    * * Display Name: Campaign ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Campaigns (vwCampaigns.ID)
    */
    get CampaignID(): string | null {
        return this.Get('CampaignID');
    }
    set CampaignID(value: string | null) {
        this.Set('CampaignID', value);
    }

    /**
    * * Field Name: EventDate
    * * Display Name: Event Date
    * * SQL Data Type: date
    */
    get EventDate(): Date {
        return this.Get('EventDate');
    }
    set EventDate(value: Date) {
        this.Set('EventDate', value);
    }

    /**
    * * Field Name: StartTime
    * * Display Name: Start Time
    * * SQL Data Type: time
    * * Description: Event start time
    */
    get StartTime(): Date {
        return this.Get('StartTime');
    }
    set StartTime(value: Date) {
        this.Set('StartTime', value);
    }

    /**
    * * Field Name: EndTime
    * * Display Name: End Time
    * * SQL Data Type: time
    * * Description: Event end time
    */
    get EndTime(): Date {
        return this.Get('EndTime');
    }
    set EndTime(value: Date) {
        this.Set('EndTime', value);
    }

    /**
    * * Field Name: Location
    * * Display Name: Location
    * * SQL Data Type: nvarchar(300)
    */
    get Location(): string {
        return this.Get('Location');
    }
    set Location(value: string) {
        this.Set('Location', value);
    }

    /**
    * * Field Name: MaxAttendees
    * * Display Name: Max Attendees
    * * SQL Data Type: int
    */
    get MaxAttendees(): number | null {
        return this.Get('MaxAttendees');
    }
    set MaxAttendees(value: number | null) {
        this.Set('MaxAttendees', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: varchar(20)
    * * Default Value: Upcoming
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * InProgress
    *   * Upcoming
    */
    get Status(): 'Cancelled' | 'Completed' | 'InProgress' | 'Upcoming' {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Completed' | 'InProgress' | 'Upcoming') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get CreatedAt(): Date {
        return this.Get('CreatedAt');
    }
    set CreatedAt(value: Date) {
        this.Set('CreatedAt', value);
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
    * * Field Name: Campaign
    * * Display Name: Campaign
    * * SQL Data Type: nvarchar(200)
    */
    get Campaign(): string | null {
        return this.Get('Campaign');
    }
}


/**
 * Fines - strongly typed entity sub-class
 * * Schema: sample_lib
 * * Base Table: Fine
 * * Base View: vwFines
 * * @description Patron fines and fees
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Fines')
export class FineEntity extends BaseEntity<FineEntityType> {
    /**
    * Loads the Fines record from the database
    * @param ID: string - primary key value to load the Fines record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof FineEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PatronID
    * * Display Name: Patron ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Patrons (vwPatrons.ID)
    */
    get PatronID(): string {
        return this.Get('PatronID');
    }
    set PatronID(value: string) {
        this.Set('PatronID', value);
    }

    /**
    * * Field Name: CheckoutID
    * * Display Name: Checkout ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Checkouts (vwCheckouts.ID)
    */
    get CheckoutID(): string | null {
        return this.Get('CheckoutID');
    }
    set CheckoutID(value: string | null) {
        this.Set('CheckoutID', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(6, 2)
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: Reason
    * * Display Name: Reason
    * * SQL Data Type: nvarchar(200)
    */
    get Reason(): string {
        return this.Get('Reason');
    }
    set Reason(value: string) {
        this.Set('Reason', value);
    }

    /**
    * * Field Name: IssuedAt
    * * Display Name: Issued At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get IssuedAt(): Date {
        return this.Get('IssuedAt');
    }
    set IssuedAt(value: Date) {
        this.Set('IssuedAt', value);
    }

    /**
    * * Field Name: PaidAt
    * * Display Name: Paid At
    * * SQL Data Type: datetime
    */
    get PaidAt(): Date | null {
        return this.Get('PaidAt');
    }
    set PaidAt(value: Date | null) {
        this.Set('PaidAt', value);
    }

    /**
    * * Field Name: IsPaid
    * * Display Name: Is Paid
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsPaid(): boolean {
        return this.Get('IsPaid');
    }
    set IsPaid(value: boolean) {
        this.Set('IsPaid', value);
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
 * Fitness Classes - strongly typed entity sub-class
 * * Schema: sample_fit
 * * Base Table: FitnessClass
 * * Base View: vwFitnessClasses
 * * @description Scheduled group fitness classes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Fitness Classes')
export class FitnessClassEntity extends BaseEntity<FitnessClassEntityType> {
    /**
    * Loads the Fitness Classes record from the database
    * @param ID: string - primary key value to load the Fitness Classes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof FitnessClassEntity
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
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: TrainerID
    * * Display Name: Trainer ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Trainers (vwTrainers.ID)
    */
    get TrainerID(): string {
        return this.Get('TrainerID');
    }
    set TrainerID(value: string) {
        this.Set('TrainerID', value);
    }

    /**
    * * Field Name: LocationID
    * * Display Name: Location ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Locations (vwLocations.ID)
    */
    get LocationID(): string {
        return this.Get('LocationID');
    }
    set LocationID(value: string) {
        this.Set('LocationID', value);
    }

    /**
    * * Field Name: DayOfWeek
    * * Display Name: Day Of Week
    * * SQL Data Type: varchar(10)
    * * Value List Type: List
    * * Possible Values 
    *   * Friday
    *   * Monday
    *   * Saturday
    *   * Sunday
    *   * Thursday
    *   * Tuesday
    *   * Wednesday
    * * Description: Day of week: Monday through Sunday
    */
    get DayOfWeek(): 'Friday' | 'Monday' | 'Saturday' | 'Sunday' | 'Thursday' | 'Tuesday' | 'Wednesday' {
        return this.Get('DayOfWeek');
    }
    set DayOfWeek(value: 'Friday' | 'Monday' | 'Saturday' | 'Sunday' | 'Thursday' | 'Tuesday' | 'Wednesday') {
        this.Set('DayOfWeek', value);
    }

    /**
    * * Field Name: StartTime
    * * Display Name: Start Time
    * * SQL Data Type: time
    * * Description: Class start time of day
    */
    get StartTime(): Date {
        return this.Get('StartTime');
    }
    set StartTime(value: Date) {
        this.Set('StartTime', value);
    }

    /**
    * * Field Name: DurationMinutes
    * * Display Name: Duration Minutes
    * * SQL Data Type: int
    * * Default Value: 60
    */
    get DurationMinutes(): number {
        return this.Get('DurationMinutes');
    }
    set DurationMinutes(value: number) {
        this.Set('DurationMinutes', value);
    }

    /**
    * * Field Name: MaxCapacity
    * * Display Name: Max Capacity
    * * SQL Data Type: int
    * * Default Value: 20
    */
    get MaxCapacity(): number {
        return this.Get('MaxCapacity');
    }
    set MaxCapacity(value: number) {
        this.Set('MaxCapacity', value);
    }

    /**
    * * Field Name: ClassType
    * * Display Name: Class Type
    * * SQL Data Type: varchar(30)
    * * Value List Type: List
    * * Possible Values 
    *   * Boxing
    *   * CrossFit
    *   * HIIT
    *   * Other
    *   * Pilates
    *   * Spin
    *   * Swimming
    *   * Yoga
    * * Description: Class type: Yoga, HIIT, Spin, Pilates, CrossFit, Boxing, Swimming, Other
    */
    get ClassType(): 'Boxing' | 'CrossFit' | 'HIIT' | 'Other' | 'Pilates' | 'Spin' | 'Swimming' | 'Yoga' {
        return this.Get('ClassType');
    }
    set ClassType(value: 'Boxing' | 'CrossFit' | 'HIIT' | 'Other' | 'Pilates' | 'Spin' | 'Swimming' | 'Yoga') {
        this.Set('ClassType', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
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
    * * Field Name: Location
    * * Display Name: Location
    * * SQL Data Type: nvarchar(200)
    */
    get Location(): string {
        return this.Get('Location');
    }
}


/**
 * Genres - strongly typed entity sub-class
 * * Schema: sample_lib
 * * Base Table: Genre
 * * Base View: vwGenres
 * * @description Book genres/categories
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Genres')
export class GenreEntity extends BaseEntity<GenreEntityType> {
    /**
    * Loads the Genres record from the database
    * @param ID: string - primary key value to load the Genres record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof GenreEntity
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
    * * SQL Data Type: nvarchar(500)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
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
 * Grant _s - strongly typed entity sub-class
 * * Schema: sample_npo
 * * Base Table: Grant_
 * * Base View: vwGrant_s
 * * @description Grants applied for and received from external organizations
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Grant _s')
export class Grant_Entity extends BaseEntity<Grant_EntityType> {
    /**
    * Loads the Grant _s record from the database
    * @param ID: string - primary key value to load the Grant _s record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Grant_Entity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: GrantorName
    * * Display Name: Grantor Name
    * * SQL Data Type: nvarchar(200)
    */
    get GrantorName(): string {
        return this.Get('GrantorName');
    }
    set GrantorName(value: string) {
        this.Set('GrantorName', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(300)
    */
    get Title(): string {
        return this.Get('Title');
    }
    set Title(value: string) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
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
    * * SQL Data Type: decimal(12, 2)
    * * Description: Grant amount in dollars
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: ApplicationDate
    * * Display Name: Application Date
    * * SQL Data Type: date
    */
    get ApplicationDate(): Date {
        return this.Get('ApplicationDate');
    }
    set ApplicationDate(value: Date) {
        this.Set('ApplicationDate', value);
    }

    /**
    * * Field Name: AwardDate
    * * Display Name: Award Date
    * * SQL Data Type: date
    */
    get AwardDate(): Date | null {
        return this.Get('AwardDate');
    }
    set AwardDate(value: Date | null) {
        this.Set('AwardDate', value);
    }

    /**
    * * Field Name: ExpirationDate
    * * Display Name: Expiration Date
    * * SQL Data Type: date
    */
    get ExpirationDate(): Date | null {
        return this.Get('ExpirationDate');
    }
    set ExpirationDate(value: Date | null) {
        this.Set('ExpirationDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: varchar(20)
    * * Default Value: Applied
    * * Value List Type: List
    * * Possible Values 
    *   * Applied
    *   * Awarded
    *   * Completed
    *   * Rejected
    */
    get Status(): 'Applied' | 'Awarded' | 'Completed' | 'Rejected' {
        return this.Get('Status');
    }
    set Status(value: 'Applied' | 'Awarded' | 'Completed' | 'Rejected') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: RequirementsNotes
    * * Display Name: Requirements Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get RequirementsNotes(): string | null {
        return this.Get('RequirementsNotes');
    }
    set RequirementsNotes(value: string | null) {
        this.Set('RequirementsNotes', value);
    }

    /**
    * * Field Name: CampaignID
    * * Display Name: Campaign ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Campaigns (vwCampaigns.ID)
    */
    get CampaignID(): string | null {
        return this.Get('CampaignID');
    }
    set CampaignID(value: string | null) {
        this.Set('CampaignID', value);
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
    * * Field Name: Campaign
    * * Display Name: Campaign
    * * SQL Data Type: nvarchar(200)
    */
    get Campaign(): string | null {
        return this.Get('Campaign');
    }
}


/**
 * Inspections - strongly typed entity sub-class
 * * Schema: sample_property
 * * Base Table: Inspection
 * * Base View: vwInspections
 * * @description Property inspections
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Inspections')
export class InspectionEntity extends BaseEntity<InspectionEntityType> {
    /**
    * Loads the Inspections record from the database
    * @param ID: string - primary key value to load the Inspections record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof InspectionEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PropertyID
    * * Display Name: Property ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Properties__sample_property (vwProperties__sample_property.ID)
    */
    get PropertyID(): string {
        return this.Get('PropertyID');
    }
    set PropertyID(value: string) {
        this.Set('PropertyID', value);
    }

    /**
    * * Field Name: InspectionDate
    * * Display Name: Inspection Date
    * * SQL Data Type: date
    */
    get InspectionDate(): Date {
        return this.Get('InspectionDate');
    }
    set InspectionDate(value: Date) {
        this.Set('InspectionDate', value);
    }

    /**
    * * Field Name: InspectionTime
    * * Display Name: Inspection Time
    * * SQL Data Type: time
    */
    get InspectionTime(): Date | null {
        return this.Get('InspectionTime');
    }
    set InspectionTime(value: Date | null) {
        this.Set('InspectionTime', value);
    }

    /**
    * * Field Name: InspectorName
    * * Display Name: Inspector Name
    * * SQL Data Type: nvarchar(100)
    */
    get InspectorName(): string {
        return this.Get('InspectorName');
    }
    set InspectorName(value: string) {
        this.Set('InspectorName', value);
    }

    /**
    * * Field Name: OverallRating
    * * Display Name: Overall Rating
    * * SQL Data Type: smallint
    */
    get OverallRating(): number {
        return this.Get('OverallRating');
    }
    set OverallRating(value: number) {
        this.Set('OverallRating', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: FollowUpRequired
    * * Display Name: Follow Up Required
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get FollowUpRequired(): boolean {
        return this.Get('FollowUpRequired');
    }
    set FollowUpRequired(value: boolean) {
        this.Set('FollowUpRequired', value);
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
    * * Field Name: Property
    * * Display Name: Property
    * * SQL Data Type: nvarchar(200)
    */
    get Property(): string {
        return this.Get('Property');
    }
}


/**
 * Knowledge Articles - strongly typed entity sub-class
 * * Schema: sample_hd
 * * Base Table: KnowledgeArticle
 * * Base View: vwKnowledgeArticles
 * * @description Self-service knowledge base articles
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Knowledge Articles')
export class KnowledgeArticleEntity extends BaseEntity<KnowledgeArticleEntityType> {
    /**
    * Loads the Knowledge Articles record from the database
    * @param ID: string - primary key value to load the Knowledge Articles record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof KnowledgeArticleEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(300)
    */
    get Title(): string {
        return this.Get('Title');
    }
    set Title(value: string) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Slug
    * * Display Name: Slug
    * * SQL Data Type: varchar(300)
    * * Description: URL-friendly unique identifier for the article
    */
    get Slug(): string {
        return this.Get('Slug');
    }
    set Slug(value: string) {
        this.Set('Slug', value);
    }

    /**
    * * Field Name: Body
    * * Display Name: Body
    * * SQL Data Type: nvarchar(MAX)
    */
    get Body(): string {
        return this.Get('Body');
    }
    set Body(value: string) {
        this.Set('Body', value);
    }

    /**
    * * Field Name: CategoryID
    * * Display Name: Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Categories (vwCategories.ID)
    */
    get CategoryID(): string | null {
        return this.Get('CategoryID');
    }
    set CategoryID(value: string | null) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: AuthorAgentID
    * * Display Name: Author Agent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Support Agents (vwSupportAgents.ID)
    */
    get AuthorAgentID(): string {
        return this.Get('AuthorAgentID');
    }
    set AuthorAgentID(value: string) {
        this.Set('AuthorAgentID', value);
    }

    /**
    * * Field Name: IsPublished
    * * Display Name: Is Published
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsPublished(): boolean {
        return this.Get('IsPublished');
    }
    set IsPublished(value: boolean) {
        this.Set('IsPublished', value);
    }

    /**
    * * Field Name: ViewCount
    * * Display Name: View Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get ViewCount(): number {
        return this.Get('ViewCount');
    }
    set ViewCount(value: number) {
        this.Set('ViewCount', value);
    }

    /**
    * * Field Name: HelpfulCount
    * * Display Name: Helpful Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get HelpfulCount(): number {
        return this.Get('HelpfulCount');
    }
    set HelpfulCount(value: number) {
        this.Set('HelpfulCount', value);
    }

    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get CreatedAt(): Date {
        return this.Get('CreatedAt');
    }
    set CreatedAt(value: Date) {
        this.Set('CreatedAt', value);
    }

    /**
    * * Field Name: UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get UpdatedAt(): Date {
        return this.Get('UpdatedAt');
    }
    set UpdatedAt(value: Date) {
        this.Set('UpdatedAt', value);
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
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(150)
    */
    get Category(): string | null {
        return this.Get('Category');
    }
}


/**
 * Leases - strongly typed entity sub-class
 * * Schema: sample_property
 * * Base Table: Lease
 * * Base View: vwLeases
 * * @description Lease agreements
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Leases')
export class LeaseEntity extends BaseEntity<LeaseEntityType> {
    /**
    * Loads the Leases record from the database
    * @param ID: string - primary key value to load the Leases record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof LeaseEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PropertyID
    * * Display Name: Property ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Properties__sample_property (vwProperties__sample_property.ID)
    */
    get PropertyID(): string {
        return this.Get('PropertyID');
    }
    set PropertyID(value: string) {
        this.Set('PropertyID', value);
    }

    /**
    * * Field Name: TenantID
    * * Display Name: Tenant ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Tenants (vwTenants.ID)
    */
    get TenantID(): string {
        return this.Get('TenantID');
    }
    set TenantID(value: string) {
        this.Set('TenantID', value);
    }

    /**
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: date
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
    * * SQL Data Type: date
    */
    get EndDate(): Date {
        return this.Get('EndDate');
    }
    set EndDate(value: Date) {
        this.Set('EndDate', value);
    }

    /**
    * * Field Name: MonthlyRent
    * * Display Name: Monthly Rent
    * * SQL Data Type: decimal(10, 2)
    */
    get MonthlyRent(): number {
        return this.Get('MonthlyRent');
    }
    set MonthlyRent(value: number) {
        this.Set('MonthlyRent', value);
    }

    /**
    * * Field Name: SecurityDeposit
    * * Display Name: Security Deposit
    * * SQL Data Type: decimal(10, 2)
    * * Default Value: 0
    */
    get SecurityDeposit(): number {
        return this.Get('SecurityDeposit');
    }
    set SecurityDeposit(value: number) {
        this.Set('SecurityDeposit', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Expired
    *   * Pending
    *   * Terminated
    */
    get Status(): 'Active' | 'Expired' | 'Pending' | 'Terminated' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Expired' | 'Pending' | 'Terminated') {
        this.Set('Status', value);
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
    * * Field Name: Property
    * * Display Name: Property
    * * SQL Data Type: nvarchar(200)
    */
    get Property(): string {
        return this.Get('Property');
    }
}


/**
 * Locations - strongly typed entity sub-class
 * * Schema: sample_fit
 * * Base Table: Location
 * * Base View: vwLocations
 * * @description Gym and fitness center locations
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Locations')
export class LocationEntity extends BaseEntity<LocationEntityType> {
    /**
    * Loads the Locations record from the database
    * @param ID: string - primary key value to load the Locations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof LocationEntity
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
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(300)
    */
    get Address(): string {
        return this.Get('Address');
    }
    set Address(value: string) {
        this.Set('Address', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
    */
    get City(): string {
        return this.Get('City');
    }
    set City(value: string) {
        this.Set('City', value);
    }

    /**
    * * Field Name: State
    * * Display Name: State
    * * SQL Data Type: varchar(2)
    */
    get State(): string {
        return this.Get('State');
    }
    set State(value: string) {
        this.Set('State', value);
    }

    /**
    * * Field Name: ZipCode
    * * Display Name: Zip Code
    * * SQL Data Type: varchar(10)
    */
    get ZipCode(): string {
        return this.Get('ZipCode');
    }
    set ZipCode(value: string) {
        this.Set('ZipCode', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: varchar(20)
    */
    get Phone(): string {
        return this.Get('Phone');
    }
    set Phone(value: string) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: OpenTime
    * * Display Name: Open Time
    * * SQL Data Type: time
    * * Description: Facility daily opening time
    */
    get OpenTime(): Date {
        return this.Get('OpenTime');
    }
    set OpenTime(value: Date) {
        this.Set('OpenTime', value);
    }

    /**
    * * Field Name: CloseTime
    * * Display Name: Close Time
    * * SQL Data Type: time
    * * Description: Facility daily closing time
    */
    get CloseTime(): Date {
        return this.Get('CloseTime');
    }
    set CloseTime(value: Date) {
        this.Set('CloseTime', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
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
 * Maintenance Requests - strongly typed entity sub-class
 * * Schema: sample_property
 * * Base Table: MaintenanceRequest
 * * Base View: vwMaintenanceRequests
 * * @description Maintenance work requests
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Maintenance Requests')
export class MaintenanceRequestEntity extends BaseEntity<MaintenanceRequestEntityType> {
    /**
    * Loads the Maintenance Requests record from the database
    * @param ID: string - primary key value to load the Maintenance Requests record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof MaintenanceRequestEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PropertyID
    * * Display Name: Property ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Properties__sample_property (vwProperties__sample_property.ID)
    */
    get PropertyID(): string {
        return this.Get('PropertyID');
    }
    set PropertyID(value: string) {
        this.Set('PropertyID', value);
    }

    /**
    * * Field Name: TenantID
    * * Display Name: Tenant ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Tenants (vwTenants.ID)
    */
    get TenantID(): string | null {
        return this.Get('TenantID');
    }
    set TenantID(value: string | null) {
        this.Set('TenantID', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(200)
    */
    get Title(): string {
        return this.Get('Title');
    }
    set Title(value: string) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Priority
    * * Display Name: Priority
    * * SQL Data Type: nvarchar(10)
    * * Default Value: Medium
    * * Value List Type: List
    * * Possible Values 
    *   * Emergency
    *   * High
    *   * Low
    *   * Medium
    */
    get Priority(): 'Emergency' | 'High' | 'Low' | 'Medium' {
        return this.Get('Priority');
    }
    set Priority(value: 'Emergency' | 'High' | 'Low' | 'Medium') {
        this.Set('Priority', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Open
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * InProgress
    *   * Open
    */
    get Status(): 'Cancelled' | 'Completed' | 'InProgress' | 'Open' {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Completed' | 'InProgress' | 'Open') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: RequestDate
    * * Display Name: Request Date
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get RequestDate(): Date {
        return this.Get('RequestDate');
    }
    set RequestDate(value: Date) {
        this.Set('RequestDate', value);
    }

    /**
    * * Field Name: CompletedDate
    * * Display Name: Completed Date
    * * SQL Data Type: datetime
    */
    get CompletedDate(): Date | null {
        return this.Get('CompletedDate');
    }
    set CompletedDate(value: Date | null) {
        this.Set('CompletedDate', value);
    }

    /**
    * * Field Name: EstimatedCost
    * * Display Name: Estimated Cost
    * * SQL Data Type: decimal(10, 2)
    */
    get EstimatedCost(): number | null {
        return this.Get('EstimatedCost');
    }
    set EstimatedCost(value: number | null) {
        this.Set('EstimatedCost', value);
    }

    /**
    * * Field Name: ActualCost
    * * Display Name: Actual Cost
    * * SQL Data Type: decimal(10, 2)
    */
    get ActualCost(): number | null {
        return this.Get('ActualCost');
    }
    set ActualCost(value: number | null) {
        this.Set('ActualCost', value);
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
    * * Field Name: Property
    * * Display Name: Property
    * * SQL Data Type: nvarchar(200)
    */
    get Property(): string {
        return this.Get('Property');
    }
}


/**
 * Member Measurements - strongly typed entity sub-class
 * * Schema: sample_fit
 * * Base Table: MemberMeasurement
 * * Base View: vwMemberMeasurements
 * * @description Body measurement tracking for members
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Member Measurements')
export class MemberMeasurementEntity extends BaseEntity<MemberMeasurementEntityType> {
    /**
    * Loads the Member Measurements record from the database
    * @param ID: string - primary key value to load the Member Measurements record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof MemberMeasurementEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: MeasurementDate
    * * Display Name: Measurement Date
    * * SQL Data Type: date
    * * Default Value: getutcdate()
    */
    get MeasurementDate(): Date {
        return this.Get('MeasurementDate');
    }
    set MeasurementDate(value: Date) {
        this.Set('MeasurementDate', value);
    }

    /**
    * * Field Name: WeightLbs
    * * Display Name: Weight Lbs
    * * SQL Data Type: decimal(5, 1)
    * * Description: Member weight in pounds
    */
    get WeightLbs(): number {
        return this.Get('WeightLbs');
    }
    set WeightLbs(value: number) {
        this.Set('WeightLbs', value);
    }

    /**
    * * Field Name: BodyFatPercent
    * * Display Name: Body Fat Percent
    * * SQL Data Type: decimal(4, 1)
    * * Description: Body fat percentage
    */
    get BodyFatPercent(): number | null {
        return this.Get('BodyFatPercent');
    }
    set BodyFatPercent(value: number | null) {
        this.Set('BodyFatPercent', value);
    }

    /**
    * * Field Name: BMI
    * * Display Name: BMI
    * * SQL Data Type: decimal(4, 1)
    */
    get BMI(): number | null {
        return this.Get('BMI');
    }
    set BMI(value: number | null) {
        this.Set('BMI', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
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
 * Members - strongly typed entity sub-class
 * * Schema: sample_fit
 * * Base Table: Member
 * * Base View: vwMembers
 * * @description Gym members with membership tier and home location
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Members')
export class MemberEntity extends BaseEntity<MemberEntityType> {
    /**
    * Loads the Members record from the database
    * @param ID: string - primary key value to load the Members record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof MemberEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: varchar(20)
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: DateOfBirth
    * * Display Name: Date Of Birth
    * * SQL Data Type: date
    */
    get DateOfBirth(): Date {
        return this.Get('DateOfBirth');
    }
    set DateOfBirth(value: Date) {
        this.Set('DateOfBirth', value);
    }

    /**
    * * Field Name: EmergencyContact
    * * Display Name: Emergency Contact
    * * SQL Data Type: nvarchar(200)
    * * Description: Emergency contact name and phone number
    */
    get EmergencyContact(): string {
        return this.Get('EmergencyContact');
    }
    set EmergencyContact(value: string) {
        this.Set('EmergencyContact', value);
    }

    /**
    * * Field Name: MembershipTierID
    * * Display Name: Membership Tier ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Membership Tiers (vwMembershipTiers.ID)
    */
    get MembershipTierID(): string {
        return this.Get('MembershipTierID');
    }
    set MembershipTierID(value: string) {
        this.Set('MembershipTierID', value);
    }

    /**
    * * Field Name: LocationID
    * * Display Name: Location ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Locations (vwLocations.ID)
    */
    get LocationID(): string {
        return this.Get('LocationID');
    }
    set LocationID(value: string) {
        this.Set('LocationID', value);
    }

    /**
    * * Field Name: JoinDate
    * * Display Name: Join Date
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get JoinDate(): Date {
        return this.Get('JoinDate');
    }
    set JoinDate(value: Date) {
        this.Set('JoinDate', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
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
    * * Field Name: MembershipTier
    * * Display Name: Membership Tier
    * * SQL Data Type: nvarchar(100)
    */
    get MembershipTier(): string {
        return this.Get('MembershipTier');
    }

    /**
    * * Field Name: Location
    * * Display Name: Location
    * * SQL Data Type: nvarchar(200)
    */
    get Location(): string {
        return this.Get('Location');
    }
}


/**
 * Membership Tiers - strongly typed entity sub-class
 * * Schema: sample_fit
 * * Base Table: MembershipTier
 * * Base View: vwMembershipTiers
 * * @description Membership tier definitions with pricing and amenity access
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Membership Tiers')
export class MembershipTierEntity extends BaseEntity<MembershipTierEntityType> {
    /**
    * Loads the Membership Tiers record from the database
    * @param ID: string - primary key value to load the Membership Tiers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof MembershipTierEntity
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
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: MonthlyFee
    * * Display Name: Monthly Fee
    * * SQL Data Type: decimal(8, 2)
    * * Description: Monthly membership fee in dollars
    */
    get MonthlyFee(): number {
        return this.Get('MonthlyFee');
    }
    set MonthlyFee(value: number) {
        this.Set('MonthlyFee', value);
    }

    /**
    * * Field Name: AnnualFee
    * * Display Name: Annual Fee
    * * SQL Data Type: decimal(8, 2)
    * * Description: Optional annual fee (discount vs monthly)
    */
    get AnnualFee(): number | null {
        return this.Get('AnnualFee');
    }
    set AnnualFee(value: number | null) {
        this.Set('AnnualFee', value);
    }

    /**
    * * Field Name: MaxClassesPerWeek
    * * Display Name: Max Classes Per Week
    * * SQL Data Type: int
    * * Description: Maximum group classes allowed per week for this tier
    */
    get MaxClassesPerWeek(): number | null {
        return this.Get('MaxClassesPerWeek');
    }
    set MaxClassesPerWeek(value: number | null) {
        this.Set('MaxClassesPerWeek', value);
    }

    /**
    * * Field Name: HasPoolAccess
    * * Display Name: Has Pool Access
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get HasPoolAccess(): boolean {
        return this.Get('HasPoolAccess');
    }
    set HasPoolAccess(value: boolean) {
        this.Set('HasPoolAccess', value);
    }

    /**
    * * Field Name: HasSaunaAccess
    * * Display Name: Has Sauna Access
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get HasSaunaAccess(): boolean {
        return this.Get('HasSaunaAccess');
    }
    set HasSaunaAccess(value: boolean) {
        this.Set('HasSaunaAccess', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
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
 * Menu Categories - strongly typed entity sub-class
 * * Schema: sample_rest
 * * Base Table: MenuCategory
 * * Base View: vwMenuCategories
 * * @description Categories for organizing the restaurant menu
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Menu Categories')
export class MenuCategoryEntity extends BaseEntity<MenuCategoryEntityType> {
    /**
    * Loads the Menu Categories record from the database
    * @param ID: string - primary key value to load the Menu Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof MenuCategoryEntity
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
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: SortOrder
    * * Display Name: Sort Order
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get SortOrder(): number {
        return this.Get('SortOrder');
    }
    set SortOrder(value: number) {
        this.Set('SortOrder', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
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
 * Menu Items - strongly typed entity sub-class
 * * Schema: sample_rest
 * * Base Table: MenuItem
 * * Base View: vwMenuItems
 * * @description Individual dishes and beverages on the menu
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Menu Items')
export class MenuItemEntity extends BaseEntity<MenuItemEntityType> {
    /**
    * Loads the Menu Items record from the database
    * @param ID: string - primary key value to load the Menu Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof MenuItemEntity
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
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: CategoryID
    * * Display Name: Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Menu Categories (vwMenuCategories.ID)
    */
    get CategoryID(): string {
        return this.Get('CategoryID');
    }
    set CategoryID(value: string) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: Price
    * * Display Name: Price
    * * SQL Data Type: decimal(8, 2)
    * * Description: Menu item sale price
    */
    get Price(): number {
        return this.Get('Price');
    }
    set Price(value: number) {
        this.Set('Price', value);
    }

    /**
    * * Field Name: CalorieCount
    * * Display Name: Calorie Count
    * * SQL Data Type: int
    */
    get CalorieCount(): number | null {
        return this.Get('CalorieCount');
    }
    set CalorieCount(value: number | null) {
        this.Set('CalorieCount', value);
    }

    /**
    * * Field Name: IsVegetarian
    * * Display Name: Is Vegetarian
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsVegetarian(): boolean {
        return this.Get('IsVegetarian');
    }
    set IsVegetarian(value: boolean) {
        this.Set('IsVegetarian', value);
    }

    /**
    * * Field Name: IsGlutenFree
    * * Display Name: Is Gluten Free
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether the item contains no gluten ingredients
    */
    get IsGlutenFree(): boolean {
        return this.Get('IsGlutenFree');
    }
    set IsGlutenFree(value: boolean) {
        this.Set('IsGlutenFree', value);
    }

    /**
    * * Field Name: IsAvailable
    * * Display Name: Is Available
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsAvailable(): boolean {
        return this.Get('IsAvailable');
    }
    set IsAvailable(value: boolean) {
        this.Set('IsAvailable', value);
    }

    /**
    * * Field Name: PrepTimeMinutes
    * * Display Name: Prep Time Minutes
    * * SQL Data Type: int
    * * Default Value: 15
    * * Description: Estimated preparation time in minutes
    */
    get PrepTimeMinutes(): number {
        return this.Get('PrepTimeMinutes');
    }
    set PrepTimeMinutes(value: number) {
        this.Set('PrepTimeMinutes', value);
    }

    /**
    * * Field Name: ImageURL
    * * Display Name: Image URL
    * * SQL Data Type: nvarchar(500)
    */
    get ImageURL(): string | null {
        return this.Get('ImageURL');
    }
    set ImageURL(value: string | null) {
        this.Set('ImageURL', value);
    }

    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get CreatedAt(): Date {
        return this.Get('CreatedAt');
    }
    set CreatedAt(value: Date) {
        this.Set('CreatedAt', value);
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
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(100)
    */
    get Category(): string {
        return this.Get('Category');
    }
}


/**
 * Offers - strongly typed entity sub-class
 * * Schema: sample_re
 * * Base Table: Offer
 * * Base View: vwOffers
 * * @description Purchase offers on properties
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Offers')
export class OfferEntity extends BaseEntity<OfferEntityType> {
    /**
    * Loads the Offers record from the database
    * @param ID: string - primary key value to load the Offers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof OfferEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PropertyID
    * * Display Name: Property ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Properties (vwProperties.ID)
    */
    get PropertyID(): string {
        return this.Get('PropertyID');
    }
    set PropertyID(value: string) {
        this.Set('PropertyID', value);
    }

    /**
    * * Field Name: ClientID
    * * Display Name: Client ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Clients (vwClients.ID)
    */
    get ClientID(): string {
        return this.Get('ClientID');
    }
    set ClientID(value: string) {
        this.Set('ClientID', value);
    }

    /**
    * * Field Name: OfferAmount
    * * Display Name: Offer Amount
    * * SQL Data Type: decimal(12, 2)
    * * Description: Amount offered by the buyer
    */
    get OfferAmount(): number {
        return this.Get('OfferAmount');
    }
    set OfferAmount(value: number) {
        this.Set('OfferAmount', value);
    }

    /**
    * * Field Name: OfferDate
    * * Display Name: Offer Date
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get OfferDate(): Date {
        return this.Get('OfferDate');
    }
    set OfferDate(value: Date) {
        this.Set('OfferDate', value);
    }

    /**
    * * Field Name: ExpirationDate
    * * Display Name: Expiration Date
    * * SQL Data Type: datetime
    */
    get ExpirationDate(): Date {
        return this.Get('ExpirationDate');
    }
    set ExpirationDate(value: Date) {
        this.Set('ExpirationDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: varchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Accepted
    *   * Countered
    *   * Expired
    *   * Pending
    *   * Rejected
    */
    get Status(): 'Accepted' | 'Countered' | 'Expired' | 'Pending' | 'Rejected' {
        return this.Get('Status');
    }
    set Status(value: 'Accepted' | 'Countered' | 'Expired' | 'Pending' | 'Rejected') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: CounterOfferAmount
    * * Display Name: Counter Offer Amount
    * * SQL Data Type: decimal(12, 2)
    */
    get CounterOfferAmount(): number | null {
        return this.Get('CounterOfferAmount');
    }
    set CounterOfferAmount(value: number | null) {
        this.Set('CounterOfferAmount', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: IsAccepted
    * * Display Name: Is Accepted
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsAccepted(): boolean {
        return this.Get('IsAccepted');
    }
    set IsAccepted(value: boolean) {
        this.Set('IsAccepted', value);
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
 * Open Houses - strongly typed entity sub-class
 * * Schema: sample_re
 * * Base Table: OpenHouse
 * * Base View: vwOpenHouses
 * * @description Scheduled open house events
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Open Houses')
export class OpenHouseEntity extends BaseEntity<OpenHouseEntityType> {
    /**
    * Loads the Open Houses record from the database
    * @param ID: string - primary key value to load the Open Houses record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof OpenHouseEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PropertyID
    * * Display Name: Property ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Properties (vwProperties.ID)
    */
    get PropertyID(): string {
        return this.Get('PropertyID');
    }
    set PropertyID(value: string) {
        this.Set('PropertyID', value);
    }

    /**
    * * Field Name: AgentID
    * * Display Name: Agent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Agents (vwAgents.ID)
    */
    get AgentID(): string {
        return this.Get('AgentID');
    }
    set AgentID(value: string) {
        this.Set('AgentID', value);
    }

    /**
    * * Field Name: StartTime
    * * Display Name: Start Time
    * * SQL Data Type: datetime
    */
    get StartTime(): Date {
        return this.Get('StartTime');
    }
    set StartTime(value: Date) {
        this.Set('StartTime', value);
    }

    /**
    * * Field Name: EndTime
    * * Display Name: End Time
    * * SQL Data Type: datetime
    */
    get EndTime(): Date {
        return this.Get('EndTime');
    }
    set EndTime(value: Date) {
        this.Set('EndTime', value);
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
    * * Field Name: MaxAttendees
    * * Display Name: Max Attendees
    * * SQL Data Type: int
    * * Description: Maximum allowed attendees for the open house
    */
    get MaxAttendees(): number | null {
        return this.Get('MaxAttendees');
    }
    set MaxAttendees(value: number | null) {
        this.Set('MaxAttendees', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
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
 * Order Items - strongly typed entity sub-class
 * * Schema: sample_rest
 * * Base Table: OrderItem
 * * Base View: vwOrderItems
 * * @description Individual items within a customer order
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Order Items')
export class OrderItemEntity extends BaseEntity<OrderItemEntityType> {
    /**
    * Loads the Order Items record from the database
    * @param ID: string - primary key value to load the Order Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof OrderItemEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrderID
    * * Display Name: Order ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Customer Orders (vwCustomerOrders.ID)
    */
    get OrderID(): string {
        return this.Get('OrderID');
    }
    set OrderID(value: string) {
        this.Set('OrderID', value);
    }

    /**
    * * Field Name: MenuItemID
    * * Display Name: Menu Item ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Menu Items (vwMenuItems.ID)
    */
    get MenuItemID(): string {
        return this.Get('MenuItemID');
    }
    set MenuItemID(value: string) {
        this.Set('MenuItemID', value);
    }

    /**
    * * Field Name: Quantity
    * * Display Name: Quantity
    * * SQL Data Type: smallint
    * * Default Value: 1
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
    * * SQL Data Type: decimal(8, 2)
    */
    get UnitPrice(): number {
        return this.Get('UnitPrice');
    }
    set UnitPrice(value: number) {
        this.Set('UnitPrice', value);
    }

    /**
    * * Field Name: SpecialInstructions
    * * Display Name: Special Instructions
    * * SQL Data Type: nvarchar(500)
    * * Description: Guest dietary modification or preference notes
    */
    get SpecialInstructions(): string | null {
        return this.Get('SpecialInstructions');
    }
    set SpecialInstructions(value: string | null) {
        this.Set('SpecialInstructions', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: varchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Pending
    *   * Preparing
    *   * Ready
    *   * Served
    */
    get Status(): 'Cancelled' | 'Pending' | 'Preparing' | 'Ready' | 'Served' {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Pending' | 'Preparing' | 'Ready' | 'Served') {
        this.Set('Status', value);
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
    * * Field Name: MenuItem
    * * Display Name: Menu Item
    * * SQL Data Type: nvarchar(200)
    */
    get MenuItem(): string {
        return this.Get('MenuItem');
    }
}


/**
 * Owners - strongly typed entity sub-class
 * * Schema: sample_property
 * * Base Table: Owner
 * * Base View: vwOwners
 * * @description Property owners
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Owners')
export class OwnerEntity extends BaseEntity<OwnerEntityType> {
    /**
    * Loads the Owners record from the database
    * @param ID: string - primary key value to load the Owners record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof OwnerEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(50)
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
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: varchar(20)
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(300)
    */
    get Address(): string | null {
        return this.Get('Address');
    }
    set Address(value: string | null) {
        this.Set('Address', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
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
 * Patrons - strongly typed entity sub-class
 * * Schema: sample_lib
 * * Base Table: Patron
 * * Base View: vwPatrons
 * * @description Library patrons/members
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Patrons')
export class PatronEntity extends BaseEntity<PatronEntityType> {
    /**
    * Loads the Patrons record from the database
    * @param ID: string - primary key value to load the Patrons record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PatronEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CardNumber
    * * Display Name: Card Number
    * * SQL Data Type: varchar(20)
    * * Description: Library card number for patron identification
    */
    get CardNumber(): string {
        return this.Get('CardNumber');
    }
    set CardNumber(value: string) {
        this.Set('CardNumber', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: varchar(20)
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: DateOfBirth
    * * Display Name: Date Of Birth
    * * SQL Data Type: date
    */
    get DateOfBirth(): Date | null {
        return this.Get('DateOfBirth');
    }
    set DateOfBirth(value: Date | null) {
        this.Set('DateOfBirth', value);
    }

    /**
    * * Field Name: Address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(300)
    */
    get Address(): string | null {
        return this.Get('Address');
    }
    set Address(value: string | null) {
        this.Set('Address', value);
    }

    /**
    * * Field Name: JoinDate
    * * Display Name: Join Date
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get JoinDate(): Date {
        return this.Get('JoinDate');
    }
    set JoinDate(value: Date) {
        this.Set('JoinDate', value);
    }

    /**
    * * Field Name: HomeBranchID
    * * Display Name: Home Branch ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Branches (vwBranches.ID)
    */
    get HomeBranchID(): string {
        return this.Get('HomeBranchID');
    }
    set HomeBranchID(value: string) {
        this.Set('HomeBranchID', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: MaxCheckouts
    * * Display Name: Max Checkouts
    * * SQL Data Type: int
    * * Default Value: 10
    * * Description: Maximum number of books a patron can check out simultaneously
    */
    get MaxCheckouts(): number {
        return this.Get('MaxCheckouts');
    }
    set MaxCheckouts(value: number) {
        this.Set('MaxCheckouts', value);
    }

    /**
    * * Field Name: FinesOwed
    * * Display Name: Fines Owed
    * * SQL Data Type: decimal(8, 2)
    * * Default Value: 0
    * * Description: Total outstanding fines owed by the patron
    */
    get FinesOwed(): number {
        return this.Get('FinesOwed');
    }
    set FinesOwed(value: number) {
        this.Set('FinesOwed', value);
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
    * * Field Name: HomeBranch
    * * Display Name: Home Branch
    * * SQL Data Type: nvarchar(200)
    */
    get HomeBranch(): string {
        return this.Get('HomeBranch');
    }
}


/**
 * Payments - strongly typed entity sub-class
 * * Schema: sample_fit
 * * Base Table: Payment
 * * Base View: vwPayments
 * * @description Payment transactions for memberships and services
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Payments')
export class PaymentEntity extends BaseEntity<PaymentEntityType> {
    /**
    * Loads the Payments record from the database
    * @param ID: string - primary key value to load the Payments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PaymentEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: Amount
    * * Display Name: Amount
    * * SQL Data Type: decimal(8, 2)
    */
    get Amount(): number {
        return this.Get('Amount');
    }
    set Amount(value: number) {
        this.Set('Amount', value);
    }

    /**
    * * Field Name: PaymentDate
    * * Display Name: Payment Date
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get PaymentDate(): Date {
        return this.Get('PaymentDate');
    }
    set PaymentDate(value: Date) {
        this.Set('PaymentDate', value);
    }

    /**
    * * Field Name: PaymentMethod
    * * Display Name: Payment Method
    * * SQL Data Type: varchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * ACH
    *   * Cash
    *   * Check
    *   * Credit
    *   * Debit
    * * Description: Payment method: Credit, Debit, Cash, ACH, Check
    */
    get PaymentMethod(): 'ACH' | 'Cash' | 'Check' | 'Credit' | 'Debit' {
        return this.Get('PaymentMethod');
    }
    set PaymentMethod(value: 'ACH' | 'Cash' | 'Check' | 'Credit' | 'Debit') {
        this.Set('PaymentMethod', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(300)
    */
    get Description(): string {
        return this.Get('Description');
    }
    set Description(value: string) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ReferenceNumber
    * * Display Name: Reference Number
    * * SQL Data Type: varchar(50)
    */
    get ReferenceNumber(): string | null {
        return this.Get('ReferenceNumber');
    }
    set ReferenceNumber(value: string | null) {
        this.Set('ReferenceNumber', value);
    }

    /**
    * * Field Name: IsRefund
    * * Display Name: Is Refund
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsRefund(): boolean {
        return this.Get('IsRefund');
    }
    set IsRefund(value: boolean) {
        this.Set('IsRefund', value);
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
 * Payments__sample_property - strongly typed entity sub-class
 * * Schema: sample_property
 * * Base Table: Payment
 * * Base View: vwPayments__sample_property
 * * @description Rent payments
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Payments__sample_property')
export class Payment__sample_propertyEntity extends BaseEntity<Payment__sample_propertyEntityType> {
    /**
    * Loads the Payments__sample_property record from the database
    * @param ID: string - primary key value to load the Payments__sample_property record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Payment__sample_propertyEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: LeaseID
    * * Display Name: Lease ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Leases (vwLeases.ID)
    */
    get LeaseID(): string {
        return this.Get('LeaseID');
    }
    set LeaseID(value: string) {
        this.Set('LeaseID', value);
    }

    /**
    * * Field Name: PaymentDate
    * * Display Name: Payment Date
    * * SQL Data Type: date
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
    * * SQL Data Type: decimal(10, 2)
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
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Check
    * * Value List Type: List
    * * Possible Values 
    *   * ACH
    *   * Cash
    *   * Check
    *   * CreditCard
    *   * Wire
    */
    get PaymentMethod(): 'ACH' | 'Cash' | 'Check' | 'CreditCard' | 'Wire' {
        return this.Get('PaymentMethod');
    }
    set PaymentMethod(value: 'ACH' | 'Cash' | 'Check' | 'CreditCard' | 'Wire') {
        this.Set('PaymentMethod', value);
    }

    /**
    * * Field Name: IsLatePayment
    * * Display Name: Is Late Payment
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsLatePayment(): boolean {
        return this.Get('IsLatePayment');
    }
    set IsLatePayment(value: boolean) {
        this.Set('IsLatePayment', value);
    }

    /**
    * * Field Name: LateFee
    * * Display Name: Late Fee
    * * SQL Data Type: decimal(8, 2)
    * * Default Value: 0
    */
    get LateFee(): number {
        return this.Get('LateFee');
    }
    set LateFee(value: number) {
        this.Set('LateFee', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(500)
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
 * Personal Training Sessions - strongly typed entity sub-class
 * * Schema: sample_fit
 * * Base Table: PersonalTrainingSession
 * * Base View: vwPersonalTrainingSessions
 * * @description One-on-one personal training sessions
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Personal Training Sessions')
export class PersonalTrainingSessionEntity extends BaseEntity<PersonalTrainingSessionEntityType> {
    /**
    * Loads the Personal Training Sessions record from the database
    * @param ID: string - primary key value to load the Personal Training Sessions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PersonalTrainingSessionEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: TrainerID
    * * Display Name: Trainer ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Trainers (vwTrainers.ID)
    */
    get TrainerID(): string {
        return this.Get('TrainerID');
    }
    set TrainerID(value: string) {
        this.Set('TrainerID', value);
    }

    /**
    * * Field Name: MemberID
    * * Display Name: Member ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Members (vwMembers.ID)
    */
    get MemberID(): string {
        return this.Get('MemberID');
    }
    set MemberID(value: string) {
        this.Set('MemberID', value);
    }

    /**
    * * Field Name: SessionDate
    * * Display Name: Session Date
    * * SQL Data Type: date
    */
    get SessionDate(): Date {
        return this.Get('SessionDate');
    }
    set SessionDate(value: Date) {
        this.Set('SessionDate', value);
    }

    /**
    * * Field Name: StartTime
    * * Display Name: Start Time
    * * SQL Data Type: time
    */
    get StartTime(): Date {
        return this.Get('StartTime');
    }
    set StartTime(value: Date) {
        this.Set('StartTime', value);
    }

    /**
    * * Field Name: DurationMinutes
    * * Display Name: Duration Minutes
    * * SQL Data Type: int
    * * Default Value: 60
    */
    get DurationMinutes(): number {
        return this.Get('DurationMinutes');
    }
    set DurationMinutes(value: number) {
        this.Set('DurationMinutes', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: varchar(20)
    * * Default Value: Scheduled
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * NoShow
    *   * Scheduled
    */
    get Status(): 'Cancelled' | 'Completed' | 'NoShow' | 'Scheduled' {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Completed' | 'NoShow' | 'Scheduled') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: Rating
    * * Display Name: Rating
    * * SQL Data Type: smallint
    * * Description: Session rating by member (1-5 scale)
    */
    get Rating(): number | null {
        return this.Get('Rating');
    }
    set Rating(value: number | null) {
        this.Set('Rating', value);
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
 * Priorities - strongly typed entity sub-class
 * * Schema: sample_hd
 * * Base Table: Priority
 * * Base View: vwPriorities
 * * @description Ticket priority levels with SLA thresholds
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Priorities')
export class PriorityEntity extends BaseEntity<PriorityEntityType> {
    /**
    * Loads the Priorities record from the database
    * @param ID: string - primary key value to load the Priorities record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PriorityEntity
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
    * * SQL Data Type: nvarchar(50)
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: SortOrder
    * * Display Name: Sort Order
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Display order for priority listing (lower = higher priority)
    */
    get SortOrder(): number {
        return this.Get('SortOrder');
    }
    set SortOrder(value: number) {
        this.Set('SortOrder', value);
    }

    /**
    * * Field Name: ColorHex
    * * Display Name: Color Hex
    * * SQL Data Type: varchar(7)
    */
    get ColorHex(): string | null {
        return this.Get('ColorHex');
    }
    set ColorHex(value: string | null) {
        this.Set('ColorHex', value);
    }

    /**
    * * Field Name: SLAResponseMinutes
    * * Display Name: SLA Response Minutes
    * * SQL Data Type: int
    * * Description: SLA target for initial response in minutes
    */
    get SLAResponseMinutes(): number | null {
        return this.Get('SLAResponseMinutes');
    }
    set SLAResponseMinutes(value: number | null) {
        this.Set('SLAResponseMinutes', value);
    }

    /**
    * * Field Name: SLAResolutionMinutes
    * * Display Name: SLA Resolution Minutes
    * * SQL Data Type: int
    * * Description: SLA target for full resolution in minutes
    */
    get SLAResolutionMinutes(): number | null {
        return this.Get('SLAResolutionMinutes');
    }
    set SLAResolutionMinutes(value: number | null) {
        this.Set('SLAResolutionMinutes', value);
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
 * Properties - strongly typed entity sub-class
 * * Schema: sample_re
 * * Base Table: Property
 * * Base View: vwProperties
 * * @description Real estate property listings
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Properties')
export class PropertyEntity extends BaseEntity<PropertyEntityType> {
    /**
    * Loads the Properties record from the database
    * @param ID: string - primary key value to load the Properties record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PropertyEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(300)
    */
    get Address(): string {
        return this.Get('Address');
    }
    set Address(value: string) {
        this.Set('Address', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
    */
    get City(): string {
        return this.Get('City');
    }
    set City(value: string) {
        this.Set('City', value);
    }

    /**
    * * Field Name: State
    * * Display Name: State
    * * SQL Data Type: varchar(2)
    */
    get State(): string {
        return this.Get('State');
    }
    set State(value: string) {
        this.Set('State', value);
    }

    /**
    * * Field Name: ZipCode
    * * Display Name: Zip Code
    * * SQL Data Type: varchar(10)
    */
    get ZipCode(): string {
        return this.Get('ZipCode');
    }
    set ZipCode(value: string) {
        this.Set('ZipCode', value);
    }

    /**
    * * Field Name: PropertyTypeID
    * * Display Name: Property Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Property Types (vwPropertyTypes.ID)
    */
    get PropertyTypeID(): string {
        return this.Get('PropertyTypeID');
    }
    set PropertyTypeID(value: string) {
        this.Set('PropertyTypeID', value);
    }

    /**
    * * Field Name: Bedrooms
    * * Display Name: Bedrooms
    * * SQL Data Type: smallint
    */
    get Bedrooms(): number {
        return this.Get('Bedrooms');
    }
    set Bedrooms(value: number) {
        this.Set('Bedrooms', value);
    }

    /**
    * * Field Name: Bathrooms
    * * Display Name: Bathrooms
    * * SQL Data Type: decimal(3, 1)
    */
    get Bathrooms(): number {
        return this.Get('Bathrooms');
    }
    set Bathrooms(value: number) {
        this.Set('Bathrooms', value);
    }

    /**
    * * Field Name: SquareFeet
    * * Display Name: Square Feet
    * * SQL Data Type: int
    * * Description: Total livable area in square feet
    */
    get SquareFeet(): number {
        return this.Get('SquareFeet');
    }
    set SquareFeet(value: number) {
        this.Set('SquareFeet', value);
    }

    /**
    * * Field Name: LotSizeAcres
    * * Display Name: Lot Size Acres
    * * SQL Data Type: decimal(8, 3)
    * * Description: Lot size in acres for the property parcel
    */
    get LotSizeAcres(): number | null {
        return this.Get('LotSizeAcres');
    }
    set LotSizeAcres(value: number | null) {
        this.Set('LotSizeAcres', value);
    }

    /**
    * * Field Name: YearBuilt
    * * Display Name: Year Built
    * * SQL Data Type: smallint
    */
    get YearBuilt(): number | null {
        return this.Get('YearBuilt');
    }
    set YearBuilt(value: number | null) {
        this.Set('YearBuilt', value);
    }

    /**
    * * Field Name: ListPrice
    * * Display Name: List Price
    * * SQL Data Type: decimal(12, 2)
    * * Description: Asking price for the property
    */
    get ListPrice(): number {
        return this.Get('ListPrice');
    }
    set ListPrice(value: number) {
        this.Set('ListPrice', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: AgentID
    * * Display Name: Agent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Agents (vwAgents.ID)
    */
    get AgentID(): string {
        return this.Get('AgentID');
    }
    set AgentID(value: string) {
        this.Set('AgentID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: varchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Pending
    *   * Rented
    *   * Sold
    *   * Withdrawn
    * * Description: Current listing status: Active, Pending, Sold, Withdrawn, or Rented
    */
    get Status(): 'Active' | 'Pending' | 'Rented' | 'Sold' | 'Withdrawn' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Pending' | 'Rented' | 'Sold' | 'Withdrawn') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ListedAt
    * * Display Name: Listed At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get ListedAt(): Date {
        return this.Get('ListedAt');
    }
    set ListedAt(value: Date) {
        this.Set('ListedAt', value);
    }

    /**
    * * Field Name: IsForSale
    * * Display Name: Is For Sale
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsForSale(): boolean {
        return this.Get('IsForSale');
    }
    set IsForSale(value: boolean) {
        this.Set('IsForSale', value);
    }

    /**
    * * Field Name: IsForRent
    * * Display Name: Is For Rent
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsForRent(): boolean {
        return this.Get('IsForRent');
    }
    set IsForRent(value: boolean) {
        this.Set('IsForRent', value);
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
    * * Field Name: PropertyType
    * * Display Name: Property Type
    * * SQL Data Type: nvarchar(100)
    */
    get PropertyType(): string {
        return this.Get('PropertyType');
    }
}


/**
 * Properties__sample_property - strongly typed entity sub-class
 * * Schema: sample_property
 * * Base Table: Property
 * * Base View: vwProperties__sample_property
 * * @description Real estate properties
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Properties__sample_property')
export class Property__sample_propertyEntity extends BaseEntity<Property__sample_propertyEntityType> {
    /**
    * Loads the Properties__sample_property record from the database
    * @param ID: string - primary key value to load the Properties__sample_property record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Property__sample_propertyEntity
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
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Address
    * * Display Name: Address
    * * SQL Data Type: nvarchar(300)
    */
    get Address(): string {
        return this.Get('Address');
    }
    set Address(value: string) {
        this.Set('Address', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
    */
    get City(): string {
        return this.Get('City');
    }
    set City(value: string) {
        this.Set('City', value);
    }

    /**
    * * Field Name: State
    * * Display Name: State
    * * SQL Data Type: varchar(2)
    */
    get State(): string {
        return this.Get('State');
    }
    set State(value: string) {
        this.Set('State', value);
    }

    /**
    * * Field Name: ZipCode
    * * Display Name: Zip Code
    * * SQL Data Type: varchar(10)
    */
    get ZipCode(): string {
        return this.Get('ZipCode');
    }
    set ZipCode(value: string) {
        this.Set('ZipCode', value);
    }

    /**
    * * Field Name: PropertyTypeID
    * * Display Name: Property Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Property Types__sample_property (vwPropertyTypes__sample_property.ID)
    */
    get PropertyTypeID(): string {
        return this.Get('PropertyTypeID');
    }
    set PropertyTypeID(value: string) {
        this.Set('PropertyTypeID', value);
    }

    /**
    * * Field Name: OwnerID
    * * Display Name: Owner ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Owners (vwOwners.ID)
    */
    get OwnerID(): string {
        return this.Get('OwnerID');
    }
    set OwnerID(value: string) {
        this.Set('OwnerID', value);
    }

    /**
    * * Field Name: SquareFootage
    * * Display Name: Square Footage
    * * SQL Data Type: int
    */
    get SquareFootage(): number {
        return this.Get('SquareFootage');
    }
    set SquareFootage(value: number) {
        this.Set('SquareFootage', value);
    }

    /**
    * * Field Name: Bedrooms
    * * Display Name: Bedrooms
    * * SQL Data Type: smallint
    */
    get Bedrooms(): number | null {
        return this.Get('Bedrooms');
    }
    set Bedrooms(value: number | null) {
        this.Set('Bedrooms', value);
    }

    /**
    * * Field Name: Bathrooms
    * * Display Name: Bathrooms
    * * SQL Data Type: decimal(3, 1)
    * * Description: Number of half-baths counted as 0.5
    */
    get Bathrooms(): number | null {
        return this.Get('Bathrooms');
    }
    set Bathrooms(value: number | null) {
        this.Set('Bathrooms', value);
    }

    /**
    * * Field Name: YearBuilt
    * * Display Name: Year Built
    * * SQL Data Type: smallint
    */
    get YearBuilt(): number {
        return this.Get('YearBuilt');
    }
    set YearBuilt(value: number) {
        this.Set('YearBuilt', value);
    }

    /**
    * * Field Name: PurchasePrice
    * * Display Name: Purchase Price
    * * SQL Data Type: decimal(12, 2)
    */
    get PurchasePrice(): number {
        return this.Get('PurchasePrice');
    }
    set PurchasePrice(value: number) {
        this.Set('PurchasePrice', value);
    }

    /**
    * * Field Name: CurrentValue
    * * Display Name: Current Value
    * * SQL Data Type: decimal(12, 2)
    */
    get CurrentValue(): number | null {
        return this.Get('CurrentValue');
    }
    set CurrentValue(value: number | null) {
        this.Set('CurrentValue', value);
    }

    /**
    * * Field Name: IsAvailable
    * * Display Name: Is Available
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsAvailable(): boolean {
        return this.Get('IsAvailable');
    }
    set IsAvailable(value: boolean) {
        this.Set('IsAvailable', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
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
    * * Field Name: PropertyType
    * * Display Name: Property Type
    * * SQL Data Type: nvarchar(50)
    */
    get PropertyType(): string {
        return this.Get('PropertyType');
    }
}


/**
 * Property Images - strongly typed entity sub-class
 * * Schema: sample_re
 * * Base Table: PropertyImage
 * * Base View: vwPropertyImages
 * * @description Property listing photographs
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Property Images')
export class PropertyImageEntity extends BaseEntity<PropertyImageEntityType> {
    /**
    * Loads the Property Images record from the database
    * @param ID: string - primary key value to load the Property Images record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PropertyImageEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PropertyID
    * * Display Name: Property ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Properties (vwProperties.ID)
    */
    get PropertyID(): string {
        return this.Get('PropertyID');
    }
    set PropertyID(value: string) {
        this.Set('PropertyID', value);
    }

    /**
    * * Field Name: ImageURL
    * * Display Name: Image URL
    * * SQL Data Type: nvarchar(500)
    */
    get ImageURL(): string {
        return this.Get('ImageURL');
    }
    set ImageURL(value: string) {
        this.Set('ImageURL', value);
    }

    /**
    * * Field Name: Caption
    * * Display Name: Caption
    * * SQL Data Type: nvarchar(200)
    */
    get Caption(): string | null {
        return this.Get('Caption');
    }
    set Caption(value: string | null) {
        this.Set('Caption', value);
    }

    /**
    * * Field Name: SortOrder
    * * Display Name: Sort Order
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Display order for property image gallery
    */
    get SortOrder(): number {
        return this.Get('SortOrder');
    }
    set SortOrder(value: number) {
        this.Set('SortOrder', value);
    }

    /**
    * * Field Name: IsPrimary
    * * Display Name: Is Primary
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this is the primary listing photo
    */
    get IsPrimary(): boolean {
        return this.Get('IsPrimary');
    }
    set IsPrimary(value: boolean) {
        this.Set('IsPrimary', value);
    }

    /**
    * * Field Name: UploadedAt
    * * Display Name: Uploaded At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get UploadedAt(): Date {
        return this.Get('UploadedAt');
    }
    set UploadedAt(value: Date) {
        this.Set('UploadedAt', value);
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
 * Property Types - strongly typed entity sub-class
 * * Schema: sample_re
 * * Base Table: PropertyType
 * * Base View: vwPropertyTypes
 * * @description Lookup table for property classifications
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Property Types')
export class PropertyTypeEntity extends BaseEntity<PropertyTypeEntityType> {
    /**
    * Loads the Property Types record from the database
    * @param ID: string - primary key value to load the Property Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PropertyTypeEntity
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
    * * SQL Data Type: nvarchar(500)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
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
 * Property Types__sample_property - strongly typed entity sub-class
 * * Schema: sample_property
 * * Base Table: PropertyType
 * * Base View: vwPropertyTypes__sample_property
 * * @description Property type classifications
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Property Types__sample_property')
export class PropertyType__sample_propertyEntity extends BaseEntity<PropertyType__sample_propertyEntityType> {
    /**
    * Loads the Property Types__sample_property record from the database
    * @param ID: string - primary key value to load the Property Types__sample_property record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PropertyType__sample_propertyEntity
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
    * * SQL Data Type: nvarchar(50)
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
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: IsResidential
    * * Display Name: Is Residential
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsResidential(): boolean {
        return this.Get('IsResidential');
    }
    set IsResidential(value: boolean) {
        this.Set('IsResidential', value);
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
 * Reservations - strongly typed entity sub-class
 * * Schema: sample_rest
 * * Base Table: Reservation
 * * Base View: vwReservations
 * * @description Guest reservation bookings
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Reservations')
export class ReservationEntity extends BaseEntity<ReservationEntityType> {
    /**
    * Loads the Reservations record from the database
    * @param ID: string - primary key value to load the Reservations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ReservationEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: GuestName
    * * Display Name: Guest Name
    * * SQL Data Type: nvarchar(200)
    */
    get GuestName(): string {
        return this.Get('GuestName');
    }
    set GuestName(value: string) {
        this.Set('GuestName', value);
    }

    /**
    * * Field Name: GuestPhone
    * * Display Name: Guest Phone
    * * SQL Data Type: varchar(20)
    */
    get GuestPhone(): string {
        return this.Get('GuestPhone');
    }
    set GuestPhone(value: string) {
        this.Set('GuestPhone', value);
    }

    /**
    * * Field Name: GuestEmail
    * * Display Name: Guest Email
    * * SQL Data Type: nvarchar(255)
    */
    get GuestEmail(): string | null {
        return this.Get('GuestEmail');
    }
    set GuestEmail(value: string | null) {
        this.Set('GuestEmail', value);
    }

    /**
    * * Field Name: PartySize
    * * Display Name: Party Size
    * * SQL Data Type: smallint
    */
    get PartySize(): number {
        return this.Get('PartySize');
    }
    set PartySize(value: number) {
        this.Set('PartySize', value);
    }

    /**
    * * Field Name: TableID
    * * Display Name: Table ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Table Seatings (vwTableSeatings.ID)
    */
    get TableID(): string | null {
        return this.Get('TableID');
    }
    set TableID(value: string | null) {
        this.Set('TableID', value);
    }

    /**
    * * Field Name: ReservationDate
    * * Display Name: Reservation Date
    * * SQL Data Type: date
    */
    get ReservationDate(): Date {
        return this.Get('ReservationDate');
    }
    set ReservationDate(value: Date) {
        this.Set('ReservationDate', value);
    }

    /**
    * * Field Name: ReservationTime
    * * Display Name: Reservation Time
    * * SQL Data Type: time
    */
    get ReservationTime(): Date {
        return this.Get('ReservationTime');
    }
    set ReservationTime(value: Date) {
        this.Set('ReservationTime', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: varchar(20)
    * * Default Value: Confirmed
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * Confirmed
    *   * NoShow
    *   * Seated
    * * Description: Current status of the reservation
    */
    get Status(): 'Cancelled' | 'Completed' | 'Confirmed' | 'NoShow' | 'Seated' {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Completed' | 'Confirmed' | 'NoShow' | 'Seated') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get CreatedAt(): Date {
        return this.Get('CreatedAt');
    }
    set CreatedAt(value: Date) {
        this.Set('CreatedAt', value);
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
 * Showings - strongly typed entity sub-class
 * * Schema: sample_re
 * * Base Table: Showing
 * * Base View: vwShowings
 * * @description Scheduled property viewings
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Showings')
export class ShowingEntity extends BaseEntity<ShowingEntityType> {
    /**
    * Loads the Showings record from the database
    * @param ID: string - primary key value to load the Showings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ShowingEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PropertyID
    * * Display Name: Property ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Properties (vwProperties.ID)
    */
    get PropertyID(): string {
        return this.Get('PropertyID');
    }
    set PropertyID(value: string) {
        this.Set('PropertyID', value);
    }

    /**
    * * Field Name: ClientID
    * * Display Name: Client ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Clients (vwClients.ID)
    */
    get ClientID(): string {
        return this.Get('ClientID');
    }
    set ClientID(value: string) {
        this.Set('ClientID', value);
    }

    /**
    * * Field Name: AgentID
    * * Display Name: Agent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Agents (vwAgents.ID)
    */
    get AgentID(): string {
        return this.Get('AgentID');
    }
    set AgentID(value: string) {
        this.Set('AgentID', value);
    }

    /**
    * * Field Name: ScheduledAt
    * * Display Name: Scheduled At
    * * SQL Data Type: datetime
    */
    get ScheduledAt(): Date {
        return this.Get('ScheduledAt');
    }
    set ScheduledAt(value: Date) {
        this.Set('ScheduledAt', value);
    }

    /**
    * * Field Name: DurationMinutes
    * * Display Name: Duration Minutes
    * * SQL Data Type: int
    * * Default Value: 30
    */
    get DurationMinutes(): number {
        return this.Get('DurationMinutes');
    }
    set DurationMinutes(value: number) {
        this.Set('DurationMinutes', value);
    }

    /**
    * * Field Name: Feedback
    * * Display Name: Feedback
    * * SQL Data Type: nvarchar(MAX)
    */
    get Feedback(): string | null {
        return this.Get('Feedback');
    }
    set Feedback(value: string | null) {
        this.Set('Feedback', value);
    }

    /**
    * * Field Name: Rating
    * * Display Name: Rating
    * * SQL Data Type: smallint
    * * Description: Client rating of the showing experience (1-5)
    */
    get Rating(): number | null {
        return this.Get('Rating');
    }
    set Rating(value: number | null) {
        this.Set('Rating', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: varchar(20)
    * * Default Value: Scheduled
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Completed
    *   * NoShow
    *   * Scheduled
    */
    get Status(): 'Cancelled' | 'Completed' | 'NoShow' | 'Scheduled' {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Completed' | 'NoShow' | 'Scheduled') {
        this.Set('Status', value);
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
 * Staffs - strongly typed entity sub-class
 * * Schema: sample_rest
 * * Base Table: Staff
 * * Base View: vwStaffs
 * * @description Restaurant staff members
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Staffs')
export class StaffEntity extends BaseEntity<StaffEntityType> {
    /**
    * Loads the Staffs record from the database
    * @param ID: string - primary key value to load the Staffs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof StaffEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: varchar(20)
    */
    get Phone(): string {
        return this.Get('Phone');
    }
    set Phone(value: string) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: varchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Bartender
    *   * Busser
    *   * Chef
    *   * Host
    *   * Manager
    *   * Server
    * * Description: Staff role determining job responsibilities
    */
    get Role(): 'Bartender' | 'Busser' | 'Chef' | 'Host' | 'Manager' | 'Server' {
        return this.Get('Role');
    }
    set Role(value: 'Bartender' | 'Busser' | 'Chef' | 'Host' | 'Manager' | 'Server') {
        this.Set('Role', value);
    }

    /**
    * * Field Name: HourlyRate
    * * Display Name: Hourly Rate
    * * SQL Data Type: decimal(6, 2)
    */
    get HourlyRate(): number {
        return this.Get('HourlyRate');
    }
    set HourlyRate(value: number) {
        this.Set('HourlyRate', value);
    }

    /**
    * * Field Name: HireDate
    * * Display Name: Hire Date
    * * SQL Data Type: date
    */
    get HireDate(): Date {
        return this.Get('HireDate');
    }
    set HireDate(value: Date) {
        this.Set('HireDate', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
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
 * Support Agents - strongly typed entity sub-class
 * * Schema: sample_hd
 * * Base Table: SupportAgent
 * * Base View: vwSupportAgents
 * * @description Help desk support agents and technicians
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Support Agents')
export class SupportAgentEntity extends BaseEntity<SupportAgentEntityType> {
    /**
    * Loads the Support Agents record from the database
    * @param ID: string - primary key value to load the Support Agents record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof SupportAgentEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: varchar(20)
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: DepartmentID
    * * Display Name: Department ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Departments (vwDepartments.ID)
    */
    get DepartmentID(): string {
        return this.Get('DepartmentID');
    }
    set DepartmentID(value: string) {
        this.Set('DepartmentID', value);
    }

    /**
    * * Field Name: Tier
    * * Display Name: Tier
    * * SQL Data Type: smallint
    * * Default Value: 1
    * * Description: Support tier level: 1=Basic, 2=Advanced, 3=Expert
    */
    get Tier(): number {
        return this.Get('Tier');
    }
    set Tier(value: number) {
        this.Set('Tier', value);
    }

    /**
    * * Field Name: IsAvailable
    * * Display Name: Is Available
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsAvailable(): boolean {
        return this.Get('IsAvailable');
    }
    set IsAvailable(value: boolean) {
        this.Set('IsAvailable', value);
    }

    /**
    * * Field Name: HireDate
    * * Display Name: Hire Date
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get HireDate(): Date {
        return this.Get('HireDate');
    }
    set HireDate(value: Date) {
        this.Set('HireDate', value);
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
    * * Field Name: Department
    * * Display Name: Department
    * * SQL Data Type: nvarchar(150)
    */
    get Department(): string {
        return this.Get('Department');
    }
}


/**
 * Table Seatings - strongly typed entity sub-class
 * * Schema: sample_rest
 * * Base Table: TableSeating
 * * Base View: vwTableSeatings
 * * @description Physical tables available for seating guests
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Table Seatings')
export class TableSeatingEntity extends BaseEntity<TableSeatingEntityType> {
    /**
    * Loads the Table Seatings record from the database
    * @param ID: string - primary key value to load the Table Seatings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TableSeatingEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: TableNumber
    * * Display Name: Table Number
    * * SQL Data Type: varchar(10)
    * * Description: Display number for the table (e.g. T1, B2)
    */
    get TableNumber(): string {
        return this.Get('TableNumber');
    }
    set TableNumber(value: string) {
        this.Set('TableNumber', value);
    }

    /**
    * * Field Name: Capacity
    * * Display Name: Capacity
    * * SQL Data Type: smallint
    * * Description: Maximum number of guests the table can accommodate
    */
    get Capacity(): number {
        return this.Get('Capacity');
    }
    set Capacity(value: number) {
        this.Set('Capacity', value);
    }

    /**
    * * Field Name: Section
    * * Display Name: Section
    * * SQL Data Type: varchar(30)
    * * Default Value: Main
    */
    get Section(): string {
        return this.Get('Section');
    }
    set Section(value: string) {
        this.Set('Section', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
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
 * Tenants - strongly typed entity sub-class
 * * Schema: sample_property
 * * Base Table: Tenant
 * * Base View: vwTenants
 * * @description Property tenants
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Tenants')
export class TenantEntity extends BaseEntity<TenantEntityType> {
    /**
    * Loads the Tenants record from the database
    * @param ID: string - primary key value to load the Tenants record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TenantEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(50)
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
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: varchar(20)
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: DateOfBirth
    * * Display Name: Date Of Birth
    * * SQL Data Type: date
    */
    get DateOfBirth(): Date | null {
        return this.Get('DateOfBirth');
    }
    set DateOfBirth(value: Date | null) {
        this.Set('DateOfBirth', value);
    }

    /**
    * * Field Name: CreditScore
    * * Display Name: Credit Score
    * * SQL Data Type: smallint
    * * Description: FICO credit score
    */
    get CreditScore(): number | null {
        return this.Get('CreditScore');
    }
    set CreditScore(value: number | null) {
        this.Set('CreditScore', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: EmergencyContact
    * * Display Name: Emergency Contact
    * * SQL Data Type: nvarchar(100)
    */
    get EmergencyContact(): string | null {
        return this.Get('EmergencyContact');
    }
    set EmergencyContact(value: string | null) {
        this.Set('EmergencyContact', value);
    }

    /**
    * * Field Name: EmergencyPhone
    * * Display Name: Emergency Phone
    * * SQL Data Type: varchar(20)
    */
    get EmergencyPhone(): string | null {
        return this.Get('EmergencyPhone');
    }
    set EmergencyPhone(value: string | null) {
        this.Set('EmergencyPhone', value);
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
 * Ticket Attachments - strongly typed entity sub-class
 * * Schema: sample_hd
 * * Base Table: TicketAttachment
 * * Base View: vwTicketAttachments
 * * @description File attachments associated with tickets
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Ticket Attachments')
export class TicketAttachmentEntity extends BaseEntity<TicketAttachmentEntityType> {
    /**
    * Loads the Ticket Attachments record from the database
    * @param ID: string - primary key value to load the Ticket Attachments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TicketAttachmentEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: TicketID
    * * Display Name: Ticket ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Tickets (vwTickets.ID)
    */
    get TicketID(): string {
        return this.Get('TicketID');
    }
    set TicketID(value: string) {
        this.Set('TicketID', value);
    }

    /**
    * * Field Name: FileName
    * * Display Name: File Name
    * * SQL Data Type: nvarchar(300)
    */
    get FileName(): string {
        return this.Get('FileName');
    }
    set FileName(value: string) {
        this.Set('FileName', value);
    }

    /**
    * * Field Name: FileSize
    * * Display Name: File Size
    * * SQL Data Type: int
    */
    get FileSize(): number {
        return this.Get('FileSize');
    }
    set FileSize(value: number) {
        this.Set('FileSize', value);
    }

    /**
    * * Field Name: MimeType
    * * Display Name: Mime Type
    * * SQL Data Type: varchar(100)
    */
    get MimeType(): string {
        return this.Get('MimeType');
    }
    set MimeType(value: string) {
        this.Set('MimeType', value);
    }

    /**
    * * Field Name: StoragePath
    * * Display Name: Storage Path
    * * SQL Data Type: nvarchar(500)
    */
    get StoragePath(): string {
        return this.Get('StoragePath');
    }
    set StoragePath(value: string) {
        this.Set('StoragePath', value);
    }

    /**
    * * Field Name: UploadedAt
    * * Display Name: Uploaded At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get UploadedAt(): Date {
        return this.Get('UploadedAt');
    }
    set UploadedAt(value: Date) {
        this.Set('UploadedAt', value);
    }

    /**
    * * Field Name: UploadedBy
    * * Display Name: Uploaded By
    * * SQL Data Type: nvarchar(255)
    */
    get UploadedBy(): string {
        return this.Get('UploadedBy');
    }
    set UploadedBy(value: string) {
        this.Set('UploadedBy', value);
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
 * Ticket Comments - strongly typed entity sub-class
 * * Schema: sample_hd
 * * Base Table: TicketComment
 * * Base View: vwTicketComments
 * * @description Comments and notes on support tickets
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Ticket Comments')
export class TicketCommentEntity extends BaseEntity<TicketCommentEntityType> {
    /**
    * Loads the Ticket Comments record from the database
    * @param ID: string - primary key value to load the Ticket Comments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TicketCommentEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: TicketID
    * * Display Name: Ticket ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Tickets (vwTickets.ID)
    */
    get TicketID(): string {
        return this.Get('TicketID');
    }
    set TicketID(value: string) {
        this.Set('TicketID', value);
    }

    /**
    * * Field Name: AuthorEmail
    * * Display Name: Author Email
    * * SQL Data Type: nvarchar(255)
    */
    get AuthorEmail(): string {
        return this.Get('AuthorEmail');
    }
    set AuthorEmail(value: string) {
        this.Set('AuthorEmail', value);
    }

    /**
    * * Field Name: AuthorName
    * * Display Name: Author Name
    * * SQL Data Type: nvarchar(200)
    */
    get AuthorName(): string {
        return this.Get('AuthorName');
    }
    set AuthorName(value: string) {
        this.Set('AuthorName', value);
    }

    /**
    * * Field Name: Body
    * * Display Name: Body
    * * SQL Data Type: nvarchar(MAX)
    */
    get Body(): string {
        return this.Get('Body');
    }
    set Body(value: string) {
        this.Set('Body', value);
    }

    /**
    * * Field Name: IsInternal
    * * Display Name: Is Internal
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this comment is internal-only (not visible to requestor)
    */
    get IsInternal(): boolean {
        return this.Get('IsInternal');
    }
    set IsInternal(value: boolean) {
        this.Set('IsInternal', value);
    }

    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get CreatedAt(): Date {
        return this.Get('CreatedAt');
    }
    set CreatedAt(value: Date) {
        this.Set('CreatedAt', value);
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
 * Ticket Tags - strongly typed entity sub-class
 * * Schema: sample_hd
 * * Base Table: TicketTag
 * * Base View: vwTicketTags
 * * @description Tags applied to tickets for flexible categorization
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Ticket Tags')
export class TicketTagEntity extends BaseEntity<TicketTagEntityType> {
    /**
    * Loads the Ticket Tags record from the database
    * @param ID: string - primary key value to load the Ticket Tags record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TicketTagEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: TicketID
    * * Display Name: Ticket ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Tickets (vwTickets.ID)
    */
    get TicketID(): string {
        return this.Get('TicketID');
    }
    set TicketID(value: string) {
        this.Set('TicketID', value);
    }

    /**
    * * Field Name: TagName
    * * Display Name: Tag Name
    * * SQL Data Type: nvarchar(50)
    */
    get TagName(): string {
        return this.Get('TagName');
    }
    set TagName(value: string) {
        this.Set('TagName', value);
    }

    /**
    * * Field Name: AddedAt
    * * Display Name: Added At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get AddedAt(): Date {
        return this.Get('AddedAt');
    }
    set AddedAt(value: Date) {
        this.Set('AddedAt', value);
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
 * * Schema: sample_hd
 * * Base Table: Ticket
 * * Base View: vwTickets
 * * @description Help desk support tickets from requestors
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Tickets')
export class TicketEntity extends BaseEntity<TicketEntityType> {
    /**
    * Loads the Tickets record from the database
    * @param ID: string - primary key value to load the Tickets record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TicketEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: TicketNumber
    * * Display Name: Ticket Number
    * * SQL Data Type: varchar(20)
    * * Description: Auto-generated human-readable ticket identifier
    */
    get TicketNumber(): string {
        return this.Get('TicketNumber');
    }
    set TicketNumber(value: string) {
        this.Set('TicketNumber', value);
    }

    /**
    * * Field Name: Subject
    * * Display Name: Subject
    * * SQL Data Type: nvarchar(300)
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
    */
    get Description(): string {
        return this.Get('Description');
    }
    set Description(value: string) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: RequestorEmail
    * * Display Name: Requestor Email
    * * SQL Data Type: nvarchar(255)
    */
    get RequestorEmail(): string {
        return this.Get('RequestorEmail');
    }
    set RequestorEmail(value: string) {
        this.Set('RequestorEmail', value);
    }

    /**
    * * Field Name: RequestorName
    * * Display Name: Requestor Name
    * * SQL Data Type: nvarchar(200)
    */
    get RequestorName(): string {
        return this.Get('RequestorName');
    }
    set RequestorName(value: string) {
        this.Set('RequestorName', value);
    }

    /**
    * * Field Name: CategoryID
    * * Display Name: Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Categories (vwCategories.ID)
    */
    get CategoryID(): string {
        return this.Get('CategoryID');
    }
    set CategoryID(value: string) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: PriorityID
    * * Display Name: Priority ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Priorities (vwPriorities.ID)
    */
    get PriorityID(): string {
        return this.Get('PriorityID');
    }
    set PriorityID(value: string) {
        this.Set('PriorityID', value);
    }

    /**
    * * Field Name: AssignedAgentID
    * * Display Name: Assigned Agent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Support Agents (vwSupportAgents.ID)
    */
    get AssignedAgentID(): string | null {
        return this.Get('AssignedAgentID');
    }
    set AssignedAgentID(value: string | null) {
        this.Set('AssignedAgentID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: varchar(20)
    * * Default Value: Open
    * * Value List Type: List
    * * Possible Values 
    *   * Closed
    *   * InProgress
    *   * Open
    *   * Resolved
    *   * Waiting
    * * Description: Current ticket lifecycle status
    */
    get Status(): 'Closed' | 'InProgress' | 'Open' | 'Resolved' | 'Waiting' {
        return this.Get('Status');
    }
    set Status(value: 'Closed' | 'InProgress' | 'Open' | 'Resolved' | 'Waiting') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get CreatedAt(): Date {
        return this.Get('CreatedAt');
    }
    set CreatedAt(value: Date) {
        this.Set('CreatedAt', value);
    }

    /**
    * * Field Name: UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get UpdatedAt(): Date {
        return this.Get('UpdatedAt');
    }
    set UpdatedAt(value: Date) {
        this.Set('UpdatedAt', value);
    }

    /**
    * * Field Name: ResolvedAt
    * * Display Name: Resolved At
    * * SQL Data Type: datetime
    */
    get ResolvedAt(): Date | null {
        return this.Get('ResolvedAt');
    }
    set ResolvedAt(value: Date | null) {
        this.Set('ResolvedAt', value);
    }

    /**
    * * Field Name: ClosedAt
    * * Display Name: Closed At
    * * SQL Data Type: datetime
    */
    get ClosedAt(): Date | null {
        return this.Get('ClosedAt');
    }
    set ClosedAt(value: Date | null) {
        this.Set('ClosedAt', value);
    }

    /**
    * * Field Name: DueDate
    * * Display Name: Due Date
    * * SQL Data Type: datetime
    */
    get DueDate(): Date | null {
        return this.Get('DueDate');
    }
    set DueDate(value: Date | null) {
        this.Set('DueDate', value);
    }

    /**
    * * Field Name: IsEscalated
    * * Display Name: Is Escalated
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsEscalated(): boolean {
        return this.Get('IsEscalated');
    }
    set IsEscalated(value: boolean) {
        this.Set('IsEscalated', value);
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
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(150)
    */
    get Category(): string {
        return this.Get('Category');
    }

    /**
    * * Field Name: Priority
    * * Display Name: Priority
    * * SQL Data Type: nvarchar(50)
    */
    get Priority(): string {
        return this.Get('Priority');
    }
}


/**
 * Trainers - strongly typed entity sub-class
 * * Schema: sample_fit
 * * Base Table: Trainer
 * * Base View: vwTrainers
 * * @description Personal trainers and fitness instructors
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Trainers')
export class TrainerEntity extends BaseEntity<TrainerEntityType> {
    /**
    * Loads the Trainers record from the database
    * @param ID: string - primary key value to load the Trainers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TrainerEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: varchar(20)
    */
    get Phone(): string {
        return this.Get('Phone');
    }
    set Phone(value: string) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Specialization
    * * Display Name: Specialization
    * * SQL Data Type: nvarchar(200)
    */
    get Specialization(): string {
        return this.Get('Specialization');
    }
    set Specialization(value: string) {
        this.Set('Specialization', value);
    }

    /**
    * * Field Name: HourlyRate
    * * Display Name: Hourly Rate
    * * SQL Data Type: decimal(6, 2)
    * * Description: Trainer per-hour rate for personal training sessions
    */
    get HourlyRate(): number {
        return this.Get('HourlyRate');
    }
    set HourlyRate(value: number) {
        this.Set('HourlyRate', value);
    }

    /**
    * * Field Name: Bio
    * * Display Name: Bio
    * * SQL Data Type: nvarchar(MAX)
    */
    get Bio(): string | null {
        return this.Get('Bio');
    }
    set Bio(value: string | null) {
        this.Set('Bio', value);
    }

    /**
    * * Field Name: LocationID
    * * Display Name: Location ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Locations (vwLocations.ID)
    */
    get LocationID(): string {
        return this.Get('LocationID');
    }
    set LocationID(value: string) {
        this.Set('LocationID', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: CertifiedSince
    * * Display Name: Certified Since
    * * SQL Data Type: date
    * * Description: Date trainer obtained primary certification
    */
    get CertifiedSince(): Date {
        return this.Get('CertifiedSince');
    }
    set CertifiedSince(value: Date) {
        this.Set('CertifiedSince', value);
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
    * * Field Name: Location
    * * Display Name: Location
    * * SQL Data Type: nvarchar(200)
    */
    get Location(): string {
        return this.Get('Location');
    }
}


/**
 * Transactions - strongly typed entity sub-class
 * * Schema: sample_re
 * * Base Table: Transaction
 * * Base View: vwTransactions
 * * @description Completed real estate transactions
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Transactions')
export class TransactionEntity extends BaseEntity<TransactionEntityType> {
    /**
    * Loads the Transactions record from the database
    * @param ID: string - primary key value to load the Transactions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TransactionEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PropertyID
    * * Display Name: Property ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Properties (vwProperties.ID)
    */
    get PropertyID(): string {
        return this.Get('PropertyID');
    }
    set PropertyID(value: string) {
        this.Set('PropertyID', value);
    }

    /**
    * * Field Name: BuyerID
    * * Display Name: Buyer ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Clients (vwClients.ID)
    */
    get BuyerID(): string {
        return this.Get('BuyerID');
    }
    set BuyerID(value: string) {
        this.Set('BuyerID', value);
    }

    /**
    * * Field Name: SellerAgentID
    * * Display Name: Seller Agent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Agents (vwAgents.ID)
    */
    get SellerAgentID(): string {
        return this.Get('SellerAgentID');
    }
    set SellerAgentID(value: string) {
        this.Set('SellerAgentID', value);
    }

    /**
    * * Field Name: BuyerAgentID
    * * Display Name: Buyer Agent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Agents (vwAgents.ID)
    */
    get BuyerAgentID(): string {
        return this.Get('BuyerAgentID');
    }
    set BuyerAgentID(value: string) {
        this.Set('BuyerAgentID', value);
    }

    /**
    * * Field Name: SalePrice
    * * Display Name: Sale Price
    * * SQL Data Type: decimal(12, 2)
    * * Description: Final sale price at closing
    */
    get SalePrice(): number {
        return this.Get('SalePrice');
    }
    set SalePrice(value: number) {
        this.Set('SalePrice', value);
    }

    /**
    * * Field Name: ClosingDate
    * * Display Name: Closing Date
    * * SQL Data Type: date
    */
    get ClosingDate(): Date {
        return this.Get('ClosingDate');
    }
    set ClosingDate(value: Date) {
        this.Set('ClosingDate', value);
    }

    /**
    * * Field Name: CommissionTotal
    * * Display Name: Commission Total
    * * SQL Data Type: decimal(10, 2)
    * * Description: Total commission paid across both agents
    */
    get CommissionTotal(): number {
        return this.Get('CommissionTotal');
    }
    set CommissionTotal(value: number) {
        this.Set('CommissionTotal', value);
    }

    /**
    * * Field Name: EscrowCompany
    * * Display Name: Escrow Company
    * * SQL Data Type: nvarchar(200)
    */
    get EscrowCompany(): string | null {
        return this.Get('EscrowCompany');
    }
    set EscrowCompany(value: string | null) {
        this.Set('EscrowCompany', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: varchar(20)
    * * Default Value: InProgress
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Closed
    *   * InProgress
    */
    get Status(): 'Cancelled' | 'Closed' | 'InProgress' {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Closed' | 'InProgress') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get CreatedAt(): Date {
        return this.Get('CreatedAt');
    }
    set CreatedAt(value: Date) {
        this.Set('CreatedAt', value);
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
 * Volunteer Logs - strongly typed entity sub-class
 * * Schema: sample_npo
 * * Base Table: VolunteerLog
 * * Base View: vwVolunteerLogs
 * * @description Tracks volunteer hours and task descriptions
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Volunteer Logs')
export class VolunteerLogEntity extends BaseEntity<VolunteerLogEntityType> {
    /**
    * Loads the Volunteer Logs record from the database
    * @param ID: string - primary key value to load the Volunteer Logs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof VolunteerLogEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: VolunteerID
    * * Display Name: Volunteer ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Volunteers (vwVolunteers.ID)
    */
    get VolunteerID(): string {
        return this.Get('VolunteerID');
    }
    set VolunteerID(value: string) {
        this.Set('VolunteerID', value);
    }

    /**
    * * Field Name: EventID
    * * Display Name: Event ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Events (vwEvents.ID)
    */
    get EventID(): string | null {
        return this.Get('EventID');
    }
    set EventID(value: string | null) {
        this.Set('EventID', value);
    }

    /**
    * * Field Name: LogDate
    * * Display Name: Log Date
    * * SQL Data Type: date
    */
    get LogDate(): Date {
        return this.Get('LogDate');
    }
    set LogDate(value: Date) {
        this.Set('LogDate', value);
    }

    /**
    * * Field Name: HoursWorked
    * * Display Name: Hours Worked
    * * SQL Data Type: decimal(4, 1)
    * * Description: Number of hours worked on this task
    */
    get HoursWorked(): number {
        return this.Get('HoursWorked');
    }
    set HoursWorked(value: number) {
        this.Set('HoursWorked', value);
    }

    /**
    * * Field Name: TaskDescription
    * * Display Name: Task Description
    * * SQL Data Type: nvarchar(500)
    */
    get TaskDescription(): string {
        return this.Get('TaskDescription');
    }
    set TaskDescription(value: string) {
        this.Set('TaskDescription', value);
    }

    /**
    * * Field Name: ApprovedBy
    * * Display Name: Approved By
    * * SQL Data Type: nvarchar(200)
    */
    get ApprovedBy(): string | null {
        return this.Get('ApprovedBy');
    }
    set ApprovedBy(value: string | null) {
        this.Set('ApprovedBy', value);
    }

    /**
    * * Field Name: IsApproved
    * * Display Name: Is Approved
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsApproved(): boolean {
        return this.Get('IsApproved');
    }
    set IsApproved(value: boolean) {
        this.Set('IsApproved', value);
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
    get Event(): string | null {
        return this.Get('Event');
    }
}


/**
 * Volunteers - strongly typed entity sub-class
 * * Schema: sample_npo
 * * Base Table: Volunteer
 * * Base View: vwVolunteers
 * * @description People who donate their time to the organization
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Volunteers')
export class VolunteerEntity extends BaseEntity<VolunteerEntityType> {
    /**
    * Loads the Volunteers record from the database
    * @param ID: string - primary key value to load the Volunteers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof VolunteerEntity
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
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(100)
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
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * Display Name: Phone
    * * SQL Data Type: varchar(20)
    */
    get Phone(): string {
        return this.Get('Phone');
    }
    set Phone(value: string) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Skills
    * * Display Name: Skills
    * * SQL Data Type: nvarchar(MAX)
    */
    get Skills(): string | null {
        return this.Get('Skills');
    }
    set Skills(value: string | null) {
        this.Set('Skills', value);
    }

    /**
    * * Field Name: AvailableDays
    * * Display Name: Available Days
    * * SQL Data Type: varchar(50)
    */
    get AvailableDays(): string | null {
        return this.Get('AvailableDays');
    }
    set AvailableDays(value: string | null) {
        this.Set('AvailableDays', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: JoinDate
    * * Display Name: Join Date
    * * SQL Data Type: datetime
    * * Default Value: getutcdate()
    */
    get JoinDate(): Date {
        return this.Get('JoinDate');
    }
    set JoinDate(value: Date) {
        this.Set('JoinDate', value);
    }

    /**
    * * Field Name: TotalHours
    * * Display Name: Total Hours
    * * SQL Data Type: decimal(8, 1)
    * * Default Value: 0
    * * Description: Cumulative hours volunteered
    */
    get TotalHours(): number {
        return this.Get('TotalHours');
    }
    set TotalHours(value: number) {
        this.Set('TotalHours', value);
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
