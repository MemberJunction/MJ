import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Customer Order Summaries
 */
export const vwCustomerOrderSummarySchema = z.object({
    CustomerID: z.string().describe(`
        * * Field Name: CustomerID
        * * SQL Data Type: uniqueidentifier`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * SQL Data Type: nvarchar(100)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * SQL Data Type: nvarchar(100)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * SQL Data Type: nvarchar(255)`),
    Company: z.string().nullable().describe(`
        * * Field Name: Company
        * * SQL Data Type: nvarchar(200)`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * SQL Data Type: nvarchar(100)`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * SQL Data Type: nvarchar(50)`),
    Country: z.string().describe(`
        * * Field Name: Country
        * * SQL Data Type: nvarchar(100)`),
    Tier: z.string().describe(`
        * * Field Name: Tier
        * * SQL Data Type: nvarchar(20)`),
    CustomerSince: z.date().describe(`
        * * Field Name: CustomerSince
        * * SQL Data Type: date`),
    TotalOrders: z.number().nullable().describe(`
        * * Field Name: TotalOrders
        * * SQL Data Type: int`),
    LifetimeSpend: z.number().describe(`
        * * Field Name: LifetimeSpend
        * * SQL Data Type: decimal(38, 2)`),
    AvgOrderValue: z.number().describe(`
        * * Field Name: AvgOrderValue
        * * SQL Data Type: decimal(38, 6)`),
    SmallestOrder: z.number().describe(`
        * * Field Name: SmallestOrder
        * * SQL Data Type: decimal(18, 2)`),
    LargestOrder: z.number().describe(`
        * * Field Name: LargestOrder
        * * SQL Data Type: decimal(18, 2)`),
    FirstOrderDate: z.date().nullable().describe(`
        * * Field Name: FirstOrderDate
        * * SQL Data Type: datetime2`),
    LastOrderDate: z.date().nullable().describe(`
        * * Field Name: LastOrderDate
        * * SQL Data Type: datetime2`),
    TotalItemsPurchased: z.number().describe(`
        * * Field Name: TotalItemsPurchased
        * * SQL Data Type: int`),
    CancelledOrders: z.number().nullable().describe(`
        * * Field Name: CancelledOrders
        * * SQL Data Type: int`),
    DeliveredOrders: z.number().nullable().describe(`
        * * Field Name: DeliveredOrders
        * * SQL Data Type: int`),
    DaysSinceLastOrder: z.number().nullable().describe(`
        * * Field Name: DaysSinceLastOrder
        * * SQL Data Type: int`),
});

export type vwCustomerOrderSummaryEntityType = z.infer<typeof vwCustomerOrderSummarySchema>;

/**
 * zod schema definition for the entity Customers
 */
export const CustomerSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique customer identifier.`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Customer first name.`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Customer last name.`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)
        * * Description: Primary email address (unique).`),
    Phone: z.string().nullable().describe(`
        * * Field Name: Phone
        * * Display Name: Phone
        * * SQL Data Type: nvarchar(50)
        * * Description: Contact phone number.`),
    Company: z.string().nullable().describe(`
        * * Field Name: Company
        * * Display Name: Company
        * * SQL Data Type: nvarchar(200)
        * * Description: Company or organization name.`),
    City: z.string().nullable().describe(`
        * * Field Name: City
        * * Display Name: City
        * * SQL Data Type: nvarchar(100)
        * * Description: City of the customer.`),
    State: z.string().nullable().describe(`
        * * Field Name: State
        * * Display Name: State
        * * SQL Data Type: nvarchar(50)
        * * Description: State or province.`),
    Country: z.string().describe(`
        * * Field Name: Country
        * * Display Name: Country
        * * SQL Data Type: nvarchar(100)
        * * Default Value: USA
        * * Description: Country (defaults to USA).`),
    CustomerSince: z.date().describe(`
        * * Field Name: CustomerSince
        * * Display Name: Customer Since
        * * SQL Data Type: date
        * * Description: Date the customer account was created.`),
    Tier: z.union([z.literal('Bronze'), z.literal('Gold'), z.literal('Platinum'), z.literal('Silver')]).describe(`
        * * Field Name: Tier
        * * Display Name: Tier
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Bronze
    *   * Gold
    *   * Platinum
    *   * Silver
        * * Description: Loyalty tier: Bronze, Silver, Gold, or Platinum.`),
    __mj_CreatedAt: z.date().describe(`
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

export type CustomerEntityType = z.infer<typeof CustomerSchema>;

/**
 * zod schema definition for the entity Meetings
 */
export const MeetingSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Products (vwProducts.ID)
        * * Description: Shared primary key with Product. This is the same UUID as the parent Product.ID.`),
    StartTime: z.date().describe(`
        * * Field Name: StartTime
        * * Display Name: Start Time
        * * SQL Data Type: datetime2
        * * Description: When the meeting begins.`),
    EndTime: z.date().describe(`
        * * Field Name: EndTime
        * * Display Name: End Time
        * * SQL Data Type: datetime2
        * * Description: When the meeting ends.`),
    Location: z.string().nullable().describe(`
        * * Field Name: Location
        * * Display Name: Location
        * * SQL Data Type: nvarchar(500)
        * * Description: Physical address or virtual meeting room URL.`),
    MaxAttendees: z.number().nullable().describe(`
        * * Field Name: MaxAttendees
        * * Display Name: Maximum Attendees
        * * SQL Data Type: int
        * * Description: Maximum number of attendees allowed.`),
    MeetingPlatform: z.string().nullable().describe(`
        * * Field Name: MeetingPlatform
        * * Display Name: Meeting Platform
        * * SQL Data Type: nvarchar(100)
        * * Description: Platform used for virtual meetings (e.g., Zoom, Microsoft Teams, Google Meet).`),
    OrganizerName: z.string().describe(`
        * * Field Name: OrganizerName
        * * Display Name: Organizer Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Name of the person organizing this meeting.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Price: z.number().describe(`
        * * Field Name: Price
        * * Display Name: Price
        * * SQL Data Type: decimal(18, 2)`),
    SKU: z.string().describe(`
        * * Field Name: SKU
        * * Display Name: SKU
        * * SQL Data Type: nvarchar(50)`),
    Category: z.string().nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Active
        * * SQL Data Type: bit`),
});

export type MeetingEntityType = z.infer<typeof MeetingSchema>;

/**
 * zod schema definition for the entity Orders
 */
export const OrderSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique order identifier.`),
    CustomerID: z.string().describe(`
        * * Field Name: CustomerID
        * * Display Name: Customer
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Customers (vwCustomers.ID)
        * * Description: Foreign key to Customer. Each order belongs to exactly one customer.`),
    OrderDate: z.date().describe(`
        * * Field Name: OrderDate
        * * Display Name: Order Date
        * * SQL Data Type: datetime2
        * * Description: Date and time the order was placed.`),
    TotalAmount: z.number().describe(`
        * * Field Name: TotalAmount
        * * Display Name: Total Amount
        * * SQL Data Type: decimal(18, 2)
        * * Description: Total monetary value of the order in USD.`),
    Status: z.union([z.literal('Cancelled'), z.literal('Delivered'), z.literal('Pending'), z.literal('Processing'), z.literal('Shipped')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Delivered
    *   * Pending
    *   * Processing
    *   * Shipped
        * * Description: Order fulfillment status: Pending, Processing, Shipped, Delivered, or Cancelled.`),
    ItemCount: z.number().describe(`
        * * Field Name: ItemCount
        * * Display Name: Item Count
        * * SQL Data Type: int
        * * Default Value: 1
        * * Description: Number of items in this order.`),
    ShippingAddress: z.string().nullable().describe(`
        * * Field Name: ShippingAddress
        * * Display Name: Shipping Address
        * * SQL Data Type: nvarchar(500)
        * * Description: Delivery address for physical shipments.`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optional notes or special instructions.`),
    __mj_CreatedAt: z.date().describe(`
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

export type OrderEntityType = z.infer<typeof OrderSchema>;

/**
 * zod schema definition for the entity Products
 */
export const ProductSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
        * * Description: Unique identifier for this product. Shared across the IS-A chain (same UUID in Product, Meeting/Publication, and Webinar tables).`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)
        * * Description: Display name of the product.`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Detailed description of the product.`),
    Price: z.number().describe(`
        * * Field Name: Price
        * * Display Name: Price
        * * SQL Data Type: decimal(18, 2)
        * * Description: Price in USD.`),
    SKU: z.string().describe(`
        * * Field Name: SKU
        * * Display Name: SKU
        * * SQL Data Type: nvarchar(50)
        * * Description: Stock Keeping Unit. Unique identifier for inventory and catalog purposes.`),
    Category: z.string().nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)
        * * Description: Product category for grouping and filtering.`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Active
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: Whether this product is currently active and available.`),
    __mj_CreatedAt: z.date().describe(`
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
 * zod schema definition for the entity Publications
 */
export const PublicationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Products (vwProducts.ID)
        * * Description: Shared primary key with Product. This is the same UUID as the parent Product.ID.`),
    ISBN: z.string().nullable().describe(`
        * * Field Name: ISBN
        * * Display Name: ISBN
        * * SQL Data Type: nvarchar(20)
        * * Description: International Standard Book Number.`),
    PublishDate: z.date().describe(`
        * * Field Name: PublishDate
        * * Display Name: Publish Date
        * * SQL Data Type: date
        * * Description: Date the publication was released.`),
    Publisher: z.string().describe(`
        * * Field Name: Publisher
        * * Display Name: Publisher
        * * SQL Data Type: nvarchar(200)
        * * Description: Name of the publishing company.`),
    Format: z.union([z.literal('AudioBook'), z.literal('PDF'), z.literal('Print'), z.literal('eBook')]).describe(`
        * * Field Name: Format
        * * Display Name: Format
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * AudioBook
    *   * PDF
    *   * Print
    *   * eBook
        * * Description: Publication format: eBook, Print, AudioBook, or PDF.`),
    PageCount: z.number().nullable().describe(`
        * * Field Name: PageCount
        * * Display Name: Page Count
        * * SQL Data Type: int
        * * Description: Total number of pages (for Print and PDF formats).`),
    Author: z.string().describe(`
        * * Field Name: Author
        * * Display Name: Author
        * * SQL Data Type: nvarchar(200)
        * * Description: Author of the publication.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Price: z.number().describe(`
        * * Field Name: Price
        * * Display Name: Price
        * * SQL Data Type: decimal(18, 2)`),
    SKU: z.string().describe(`
        * * Field Name: SKU
        * * Display Name: SKU
        * * SQL Data Type: nvarchar(50)`),
    Category: z.string().nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Active
        * * SQL Data Type: bit`),
});

export type PublicationEntityType = z.infer<typeof PublicationSchema>;

/**
 * zod schema definition for the entity Webinars
 */
export const WebinarSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Meetings (vwMeetings.ID)
        * * Description: Shared primary key with Meeting and Product. Same UUID across all three tables.`),
    StreamingURL: z.string().nullable().describe(`
        * * Field Name: StreamingURL
        * * Display Name: Streaming URL
        * * SQL Data Type: nvarchar(1000)
        * * Description: URL for the live stream.`),
    IsRecorded: z.boolean().describe(`
        * * Field Name: IsRecorded
        * * Display Name: Recorded
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Whether this webinar will be recorded for later viewing.`),
    WebinarProvider: z.string().describe(`
        * * Field Name: WebinarProvider
        * * Display Name: Webinar Provider
        * * SQL Data Type: nvarchar(100)
        * * Description: The webinar hosting platform (e.g., Zoom Webinars, GoToWebinar, Webex Events).`),
    RegistrationURL: z.string().nullable().describe(`
        * * Field Name: RegistrationURL
        * * Display Name: Registration URL
        * * SQL Data Type: nvarchar(1000)
        * * Description: URL where attendees can register for the webinar.`),
    ExpectedAttendees: z.number().nullable().describe(`
        * * Field Name: ExpectedAttendees
        * * Display Name: Expected Attendees
        * * SQL Data Type: int
        * * Description: Expected number of attendees for planning purposes.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    StartTime: z.date().describe(`
        * * Field Name: StartTime
        * * Display Name: Start Time
        * * SQL Data Type: datetime2`),
    EndTime: z.date().describe(`
        * * Field Name: EndTime
        * * Display Name: End Time
        * * SQL Data Type: datetime2`),
    Location: z.string().nullable().describe(`
        * * Field Name: Location
        * * Display Name: Location
        * * SQL Data Type: nvarchar(500)`),
    MaxAttendees: z.number().nullable().describe(`
        * * Field Name: MaxAttendees
        * * Display Name: Maximum Attendees
        * * SQL Data Type: int`),
    MeetingPlatform: z.string().nullable().describe(`
        * * Field Name: MeetingPlatform
        * * Display Name: Meeting Platform
        * * SQL Data Type: nvarchar(100)`),
    OrganizerName: z.string().describe(`
        * * Field Name: OrganizerName
        * * Display Name: Organizer Name
        * * SQL Data Type: nvarchar(200)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Webinar Name
        * * SQL Data Type: nvarchar(200)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Price: z.number().describe(`
        * * Field Name: Price
        * * Display Name: Price
        * * SQL Data Type: decimal(18, 2)`),
    SKU: z.string().describe(`
        * * Field Name: SKU
        * * Display Name: SKU
        * * SQL Data Type: nvarchar(50)`),
    Category: z.string().nullable().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Active
        * * SQL Data Type: bit`),
});

export type WebinarEntityType = z.infer<typeof WebinarSchema>;
 
 

/**
 * Customer Order Summaries - strongly typed entity sub-class
 * * Schema: AdvancedEntities
 * * Base Table: vwCustomerOrderSummary
 * * Base View: vwCustomerOrderSummary
 * * Primary Key: CustomerID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Customer Order Summaries')
export class vwCustomerOrderSummaryEntity extends BaseEntity<vwCustomerOrderSummaryEntityType> {
    /**
    * Loads the Customer Order Summaries record from the database
    * @param CustomerID: string - primary key value to load the Customer Order Summaries record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof vwCustomerOrderSummaryEntity
    * @method
    * @override
    */
    public async Load(CustomerID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'CustomerID', Value: CustomerID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Customer Order Summaries - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof vwCustomerOrderSummaryEntity
    * @throws {Error} - Save is not allowed for Customer Order Summaries, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for Customer Order Summaries, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }

    /**
    * Customer Order Summaries - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof vwCustomerOrderSummaryEntity
    * @throws {Error} - Delete is not allowed for Customer Order Summaries, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Customer Order Summaries, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: CustomerID
    * * SQL Data Type: uniqueidentifier
    */
    get CustomerID(): string {
        return this.Get('CustomerID');
    }
    set CustomerID(value: string) {
        this.Set('CustomerID', value);
    }

    /**
    * * Field Name: FirstName
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
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Company
    * * SQL Data Type: nvarchar(200)
    */
    get Company(): string | null {
        return this.Get('Company');
    }
    set Company(value: string | null) {
        this.Set('Company', value);
    }

    /**
    * * Field Name: City
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
    * * SQL Data Type: nvarchar(50)
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: Country
    * * SQL Data Type: nvarchar(100)
    */
    get Country(): string {
        return this.Get('Country');
    }
    set Country(value: string) {
        this.Set('Country', value);
    }

    /**
    * * Field Name: Tier
    * * SQL Data Type: nvarchar(20)
    */
    get Tier(): string {
        return this.Get('Tier');
    }
    set Tier(value: string) {
        this.Set('Tier', value);
    }

    /**
    * * Field Name: CustomerSince
    * * SQL Data Type: date
    */
    get CustomerSince(): Date {
        return this.Get('CustomerSince');
    }
    set CustomerSince(value: Date) {
        this.Set('CustomerSince', value);
    }

    /**
    * * Field Name: TotalOrders
    * * SQL Data Type: int
    */
    get TotalOrders(): number | null {
        return this.Get('TotalOrders');
    }
    set TotalOrders(value: number | null) {
        this.Set('TotalOrders', value);
    }

    /**
    * * Field Name: LifetimeSpend
    * * SQL Data Type: decimal(38, 2)
    */
    get LifetimeSpend(): number {
        return this.Get('LifetimeSpend');
    }
    set LifetimeSpend(value: number) {
        this.Set('LifetimeSpend', value);
    }

    /**
    * * Field Name: AvgOrderValue
    * * SQL Data Type: decimal(38, 6)
    */
    get AvgOrderValue(): number {
        return this.Get('AvgOrderValue');
    }
    set AvgOrderValue(value: number) {
        this.Set('AvgOrderValue', value);
    }

    /**
    * * Field Name: SmallestOrder
    * * SQL Data Type: decimal(18, 2)
    */
    get SmallestOrder(): number {
        return this.Get('SmallestOrder');
    }
    set SmallestOrder(value: number) {
        this.Set('SmallestOrder', value);
    }

    /**
    * * Field Name: LargestOrder
    * * SQL Data Type: decimal(18, 2)
    */
    get LargestOrder(): number {
        return this.Get('LargestOrder');
    }
    set LargestOrder(value: number) {
        this.Set('LargestOrder', value);
    }

    /**
    * * Field Name: FirstOrderDate
    * * SQL Data Type: datetime2
    */
    get FirstOrderDate(): Date | null {
        return this.Get('FirstOrderDate');
    }
    set FirstOrderDate(value: Date | null) {
        this.Set('FirstOrderDate', value);
    }

    /**
    * * Field Name: LastOrderDate
    * * SQL Data Type: datetime2
    */
    get LastOrderDate(): Date | null {
        return this.Get('LastOrderDate');
    }
    set LastOrderDate(value: Date | null) {
        this.Set('LastOrderDate', value);
    }

    /**
    * * Field Name: TotalItemsPurchased
    * * SQL Data Type: int
    */
    get TotalItemsPurchased(): number {
        return this.Get('TotalItemsPurchased');
    }
    set TotalItemsPurchased(value: number) {
        this.Set('TotalItemsPurchased', value);
    }

    /**
    * * Field Name: CancelledOrders
    * * SQL Data Type: int
    */
    get CancelledOrders(): number | null {
        return this.Get('CancelledOrders');
    }
    set CancelledOrders(value: number | null) {
        this.Set('CancelledOrders', value);
    }

    /**
    * * Field Name: DeliveredOrders
    * * SQL Data Type: int
    */
    get DeliveredOrders(): number | null {
        return this.Get('DeliveredOrders');
    }
    set DeliveredOrders(value: number | null) {
        this.Set('DeliveredOrders', value);
    }

    /**
    * * Field Name: DaysSinceLastOrder
    * * SQL Data Type: int
    */
    get DaysSinceLastOrder(): number | null {
        return this.Get('DaysSinceLastOrder');
    }
    set DaysSinceLastOrder(value: number | null) {
        this.Set('DaysSinceLastOrder', value);
    }
}


/**
 * Customers - strongly typed entity sub-class
 * * Schema: AdvancedEntities
 * * Base Table: Customer
 * * Base View: vwCustomers
 * * @description Customer records for the virtual entity demo. Combined with Order data to produce the vwCustomerOrderSummary virtual entity.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Customers')
export class CustomerEntity extends BaseEntity<CustomerEntityType> {
    /**
    * Loads the Customers record from the database
    * @param ID: string - primary key value to load the Customers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CustomerEntity
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
    * * Description: Unique customer identifier.
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
    * * Description: Customer first name.
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
    * * Description: Customer last name.
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
    * * Description: Primary email address (unique).
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
    * * SQL Data Type: nvarchar(50)
    * * Description: Contact phone number.
    */
    get Phone(): string | null {
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Company
    * * Display Name: Company
    * * SQL Data Type: nvarchar(200)
    * * Description: Company or organization name.
    */
    get Company(): string | null {
        return this.Get('Company');
    }
    set Company(value: string | null) {
        this.Set('Company', value);
    }

    /**
    * * Field Name: City
    * * Display Name: City
    * * SQL Data Type: nvarchar(100)
    * * Description: City of the customer.
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
    * * SQL Data Type: nvarchar(50)
    * * Description: State or province.
    */
    get State(): string | null {
        return this.Get('State');
    }
    set State(value: string | null) {
        this.Set('State', value);
    }

    /**
    * * Field Name: Country
    * * Display Name: Country
    * * SQL Data Type: nvarchar(100)
    * * Default Value: USA
    * * Description: Country (defaults to USA).
    */
    get Country(): string {
        return this.Get('Country');
    }
    set Country(value: string) {
        this.Set('Country', value);
    }

    /**
    * * Field Name: CustomerSince
    * * Display Name: Customer Since
    * * SQL Data Type: date
    * * Description: Date the customer account was created.
    */
    get CustomerSince(): Date {
        return this.Get('CustomerSince');
    }
    set CustomerSince(value: Date) {
        this.Set('CustomerSince', value);
    }

    /**
    * * Field Name: Tier
    * * Display Name: Tier
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Bronze
    *   * Gold
    *   * Platinum
    *   * Silver
    * * Description: Loyalty tier: Bronze, Silver, Gold, or Platinum.
    */
    get Tier(): 'Bronze' | 'Gold' | 'Platinum' | 'Silver' {
        return this.Get('Tier');
    }
    set Tier(value: 'Bronze' | 'Gold' | 'Platinum' | 'Silver') {
        this.Set('Tier', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
 * * Schema: AdvancedEntities
 * * Base Table: Meeting
 * * Base View: vwMeetings
 * * @description IS-A child of Product. Represents a meeting-type product (conference session, workshop, training). Shares the same primary key as its parent Product record.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Meetings')
export class MeetingEntity extends BaseEntity<MeetingEntityType> {
    /**
    * Loads the Meetings record from the database
    * @param ID: string - primary key value to load the Meetings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof MeetingEntity
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
    * * Related Entity/Foreign Key: Products (vwProducts.ID)
    * * Description: Shared primary key with Product. This is the same UUID as the parent Product.ID.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: StartTime
    * * Display Name: Start Time
    * * SQL Data Type: datetime2
    * * Description: When the meeting begins.
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
    * * SQL Data Type: datetime2
    * * Description: When the meeting ends.
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
    * * SQL Data Type: nvarchar(500)
    * * Description: Physical address or virtual meeting room URL.
    */
    get Location(): string | null {
        return this.Get('Location');
    }
    set Location(value: string | null) {
        this.Set('Location', value);
    }

    /**
    * * Field Name: MaxAttendees
    * * Display Name: Maximum Attendees
    * * SQL Data Type: int
    * * Description: Maximum number of attendees allowed.
    */
    get MaxAttendees(): number | null {
        return this.Get('MaxAttendees');
    }
    set MaxAttendees(value: number | null) {
        this.Set('MaxAttendees', value);
    }

    /**
    * * Field Name: MeetingPlatform
    * * Display Name: Meeting Platform
    * * SQL Data Type: nvarchar(100)
    * * Description: Platform used for virtual meetings (e.g., Zoom, Microsoft Teams, Google Meet).
    */
    get MeetingPlatform(): string | null {
        return this.Get('MeetingPlatform');
    }
    set MeetingPlatform(value: string | null) {
        this.Set('MeetingPlatform', value);
    }

    /**
    * * Field Name: OrganizerName
    * * Display Name: Organizer Name
    * * SQL Data Type: nvarchar(200)
    * * Description: Name of the person organizing this meeting.
    */
    get OrganizerName(): string {
        return this.Get('OrganizerName');
    }
    set OrganizerName(value: string) {
        this.Set('OrganizerName', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * IS-A Source: Inherited from Products
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
    * * IS-A Source: Inherited from Products
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Price
    * * Display Name: Price
    * * SQL Data Type: decimal(18, 2)
    * * IS-A Source: Inherited from Products
    */
    get Price(): number {
        return this.Get('Price');
    }
    set Price(value: number) {
        this.Set('Price', value);
    }

    /**
    * * Field Name: SKU
    * * Display Name: SKU
    * * SQL Data Type: nvarchar(50)
    * * IS-A Source: Inherited from Products
    */
    get SKU(): string {
        return this.Get('SKU');
    }
    set SKU(value: string) {
        this.Set('SKU', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(100)
    * * IS-A Source: Inherited from Products
    */
    get Category(): string | null {
        return this.Get('Category');
    }
    set Category(value: string | null) {
        this.Set('Category', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Active
    * * SQL Data Type: bit
    * * IS-A Source: Inherited from Products
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }
}


/**
 * Orders - strongly typed entity sub-class
 * * Schema: AdvancedEntities
 * * Base Table: Order
 * * Base View: vwOrders
 * * @description Customer orders for the virtual entity demo. Aggregated with Customer data in vwCustomerOrderSummary.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Orders')
export class OrderEntity extends BaseEntity<OrderEntityType> {
    /**
    * Loads the Orders record from the database
    * @param ID: string - primary key value to load the Orders record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof OrderEntity
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
    * * Description: Unique order identifier.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CustomerID
    * * Display Name: Customer
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Customers (vwCustomers.ID)
    * * Description: Foreign key to Customer. Each order belongs to exactly one customer.
    */
    get CustomerID(): string {
        return this.Get('CustomerID');
    }
    set CustomerID(value: string) {
        this.Set('CustomerID', value);
    }

    /**
    * * Field Name: OrderDate
    * * Display Name: Order Date
    * * SQL Data Type: datetime2
    * * Description: Date and time the order was placed.
    */
    get OrderDate(): Date {
        return this.Get('OrderDate');
    }
    set OrderDate(value: Date) {
        this.Set('OrderDate', value);
    }

    /**
    * * Field Name: TotalAmount
    * * Display Name: Total Amount
    * * SQL Data Type: decimal(18, 2)
    * * Description: Total monetary value of the order in USD.
    */
    get TotalAmount(): number {
        return this.Get('TotalAmount');
    }
    set TotalAmount(value: number) {
        this.Set('TotalAmount', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Delivered
    *   * Pending
    *   * Processing
    *   * Shipped
    * * Description: Order fulfillment status: Pending, Processing, Shipped, Delivered, or Cancelled.
    */
    get Status(): 'Cancelled' | 'Delivered' | 'Pending' | 'Processing' | 'Shipped' {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Delivered' | 'Pending' | 'Processing' | 'Shipped') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ItemCount
    * * Display Name: Item Count
    * * SQL Data Type: int
    * * Default Value: 1
    * * Description: Number of items in this order.
    */
    get ItemCount(): number {
        return this.Get('ItemCount');
    }
    set ItemCount(value: number) {
        this.Set('ItemCount', value);
    }

    /**
    * * Field Name: ShippingAddress
    * * Display Name: Shipping Address
    * * SQL Data Type: nvarchar(500)
    * * Description: Delivery address for physical shipments.
    */
    get ShippingAddress(): string | null {
        return this.Get('ShippingAddress');
    }
    set ShippingAddress(value: string | null) {
        this.Set('ShippingAddress', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Optional notes or special instructions.
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
 * * Schema: AdvancedEntities
 * * Base Table: Product
 * * Base View: vwProducts
 * * @description Root entity in the IS-A hierarchy. All Meetings, Webinars, and Publications are also Products. Demonstrates Table-Per-Type inheritance with shared primary keys.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Products')
export class ProductEntity extends BaseEntity<ProductEntityType> {
    /**
    * Loads the Products record from the database
    * @param ID: string - primary key value to load the Products record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ProductEntity
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
    * * Description: Unique identifier for this product. Shared across the IS-A chain (same UUID in Product, Meeting/Publication, and Webinar tables).
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
    * * Description: Display name of the product.
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
    * * Description: Detailed description of the product.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Price
    * * Display Name: Price
    * * SQL Data Type: decimal(18, 2)
    * * Description: Price in USD.
    */
    get Price(): number {
        return this.Get('Price');
    }
    set Price(value: number) {
        this.Set('Price', value);
    }

    /**
    * * Field Name: SKU
    * * Display Name: SKU
    * * SQL Data Type: nvarchar(50)
    * * Description: Stock Keeping Unit. Unique identifier for inventory and catalog purposes.
    */
    get SKU(): string {
        return this.Get('SKU');
    }
    set SKU(value: string) {
        this.Set('SKU', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(100)
    * * Description: Product category for grouping and filtering.
    */
    get Category(): string | null {
        return this.Get('Category');
    }
    set Category(value: string | null) {
        this.Set('Category', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Whether this product is currently active and available.
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
 * Publications - strongly typed entity sub-class
 * * Schema: AdvancedEntities
 * * Base Table: Publication
 * * Base View: vwPublications
 * * @description IS-A child of Product (sibling to Meeting). Represents a publication-type product such as a book, eBook, or guide. Shares the same primary key as its parent Product record. Disjoint from Meeting: a Product cannot be both a Meeting and a Publication.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Publications')
export class PublicationEntity extends BaseEntity<PublicationEntityType> {
    /**
    * Loads the Publications record from the database
    * @param ID: string - primary key value to load the Publications record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PublicationEntity
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
    * * Related Entity/Foreign Key: Products (vwProducts.ID)
    * * Description: Shared primary key with Product. This is the same UUID as the parent Product.ID.
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
    * * SQL Data Type: nvarchar(20)
    * * Description: International Standard Book Number.
    */
    get ISBN(): string | null {
        return this.Get('ISBN');
    }
    set ISBN(value: string | null) {
        this.Set('ISBN', value);
    }

    /**
    * * Field Name: PublishDate
    * * Display Name: Publish Date
    * * SQL Data Type: date
    * * Description: Date the publication was released.
    */
    get PublishDate(): Date {
        return this.Get('PublishDate');
    }
    set PublishDate(value: Date) {
        this.Set('PublishDate', value);
    }

    /**
    * * Field Name: Publisher
    * * Display Name: Publisher
    * * SQL Data Type: nvarchar(200)
    * * Description: Name of the publishing company.
    */
    get Publisher(): string {
        return this.Get('Publisher');
    }
    set Publisher(value: string) {
        this.Set('Publisher', value);
    }

    /**
    * * Field Name: Format
    * * Display Name: Format
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * AudioBook
    *   * PDF
    *   * Print
    *   * eBook
    * * Description: Publication format: eBook, Print, AudioBook, or PDF.
    */
    get Format(): 'AudioBook' | 'PDF' | 'Print' | 'eBook' {
        return this.Get('Format');
    }
    set Format(value: 'AudioBook' | 'PDF' | 'Print' | 'eBook') {
        this.Set('Format', value);
    }

    /**
    * * Field Name: PageCount
    * * Display Name: Page Count
    * * SQL Data Type: int
    * * Description: Total number of pages (for Print and PDF formats).
    */
    get PageCount(): number | null {
        return this.Get('PageCount');
    }
    set PageCount(value: number | null) {
        this.Set('PageCount', value);
    }

    /**
    * * Field Name: Author
    * * Display Name: Author
    * * SQL Data Type: nvarchar(200)
    * * Description: Author of the publication.
    */
    get Author(): string {
        return this.Get('Author');
    }
    set Author(value: string) {
        this.Set('Author', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(200)
    * * IS-A Source: Inherited from Products
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
    * * IS-A Source: Inherited from Products
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Price
    * * Display Name: Price
    * * SQL Data Type: decimal(18, 2)
    * * IS-A Source: Inherited from Products
    */
    get Price(): number {
        return this.Get('Price');
    }
    set Price(value: number) {
        this.Set('Price', value);
    }

    /**
    * * Field Name: SKU
    * * Display Name: SKU
    * * SQL Data Type: nvarchar(50)
    * * IS-A Source: Inherited from Products
    */
    get SKU(): string {
        return this.Get('SKU');
    }
    set SKU(value: string) {
        this.Set('SKU', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(100)
    * * IS-A Source: Inherited from Products
    */
    get Category(): string | null {
        return this.Get('Category');
    }
    set Category(value: string | null) {
        this.Set('Category', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Active
    * * SQL Data Type: bit
    * * IS-A Source: Inherited from Products
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }
}


/**
 * Webinars - strongly typed entity sub-class
 * * Schema: AdvancedEntities
 * * Base Table: Webinar
 * * Base View: vwWebinars
 * * @description IS-A grandchild: Webinar IS-A Meeting IS-A Product. Represents a webinar-type meeting with streaming capabilities. Shares the same primary key as its parent Meeting and grandparent Product.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Webinars')
export class WebinarEntity extends BaseEntity<WebinarEntityType> {
    /**
    * Loads the Webinars record from the database
    * @param ID: string - primary key value to load the Webinars record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof WebinarEntity
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
    * * Related Entity/Foreign Key: Meetings (vwMeetings.ID)
    * * Description: Shared primary key with Meeting and Product. Same UUID across all three tables.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: StreamingURL
    * * Display Name: Streaming URL
    * * SQL Data Type: nvarchar(1000)
    * * Description: URL for the live stream.
    */
    get StreamingURL(): string | null {
        return this.Get('StreamingURL');
    }
    set StreamingURL(value: string | null) {
        this.Set('StreamingURL', value);
    }

    /**
    * * Field Name: IsRecorded
    * * Display Name: Recorded
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Whether this webinar will be recorded for later viewing.
    */
    get IsRecorded(): boolean {
        return this.Get('IsRecorded');
    }
    set IsRecorded(value: boolean) {
        this.Set('IsRecorded', value);
    }

    /**
    * * Field Name: WebinarProvider
    * * Display Name: Webinar Provider
    * * SQL Data Type: nvarchar(100)
    * * Description: The webinar hosting platform (e.g., Zoom Webinars, GoToWebinar, Webex Events).
    */
    get WebinarProvider(): string {
        return this.Get('WebinarProvider');
    }
    set WebinarProvider(value: string) {
        this.Set('WebinarProvider', value);
    }

    /**
    * * Field Name: RegistrationURL
    * * Display Name: Registration URL
    * * SQL Data Type: nvarchar(1000)
    * * Description: URL where attendees can register for the webinar.
    */
    get RegistrationURL(): string | null {
        return this.Get('RegistrationURL');
    }
    set RegistrationURL(value: string | null) {
        this.Set('RegistrationURL', value);
    }

    /**
    * * Field Name: ExpectedAttendees
    * * Display Name: Expected Attendees
    * * SQL Data Type: int
    * * Description: Expected number of attendees for planning purposes.
    */
    get ExpectedAttendees(): number | null {
        return this.Get('ExpectedAttendees');
    }
    set ExpectedAttendees(value: number | null) {
        this.Set('ExpectedAttendees', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
    * * Field Name: StartTime
    * * Display Name: Start Time
    * * SQL Data Type: datetime2
    * * IS-A Source: Inherited from Meetings
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
    * * SQL Data Type: datetime2
    * * IS-A Source: Inherited from Meetings
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
    * * SQL Data Type: nvarchar(500)
    * * IS-A Source: Inherited from Meetings
    */
    get Location(): string | null {
        return this.Get('Location');
    }
    set Location(value: string | null) {
        this.Set('Location', value);
    }

    /**
    * * Field Name: MaxAttendees
    * * Display Name: Maximum Attendees
    * * SQL Data Type: int
    * * IS-A Source: Inherited from Meetings
    */
    get MaxAttendees(): number | null {
        return this.Get('MaxAttendees');
    }
    set MaxAttendees(value: number | null) {
        this.Set('MaxAttendees', value);
    }

    /**
    * * Field Name: MeetingPlatform
    * * Display Name: Meeting Platform
    * * SQL Data Type: nvarchar(100)
    * * IS-A Source: Inherited from Meetings
    */
    get MeetingPlatform(): string | null {
        return this.Get('MeetingPlatform');
    }
    set MeetingPlatform(value: string | null) {
        this.Set('MeetingPlatform', value);
    }

    /**
    * * Field Name: OrganizerName
    * * Display Name: Organizer Name
    * * SQL Data Type: nvarchar(200)
    * * IS-A Source: Inherited from Meetings
    */
    get OrganizerName(): string {
        return this.Get('OrganizerName');
    }
    set OrganizerName(value: string) {
        this.Set('OrganizerName', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Webinar Name
    * * SQL Data Type: nvarchar(200)
    * * IS-A Source: Inherited from Products
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
    * * IS-A Source: Inherited from Products
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Price
    * * Display Name: Price
    * * SQL Data Type: decimal(18, 2)
    * * IS-A Source: Inherited from Products
    */
    get Price(): number {
        return this.Get('Price');
    }
    set Price(value: number) {
        this.Set('Price', value);
    }

    /**
    * * Field Name: SKU
    * * Display Name: SKU
    * * SQL Data Type: nvarchar(50)
    * * IS-A Source: Inherited from Products
    */
    get SKU(): string {
        return this.Get('SKU');
    }
    set SKU(value: string) {
        this.Set('SKU', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(100)
    * * IS-A Source: Inherited from Products
    */
    get Category(): string | null {
        return this.Get('Category');
    }
    set Category(value: string | null) {
        this.Set('Category', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Active
    * * SQL Data Type: bit
    * * IS-A Source: Inherited from Products
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }
}
