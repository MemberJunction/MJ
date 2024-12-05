import { BaseEntity, EntitySaveOptions, CompositeKey } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Abstracts _2024_Decembers
 */
export const Abstracts_2024_DecemberSchema = z.object({
    Content_ID: z.string().nullish().describe(`
        * * Field Name: Content_ID
        * * Display Name: Content _ID
        * * SQL Data Type: nvarchar(MAX)`),
    Content_Type: z.string().nullish().describe(`
        * * Field Name: Content_Type
        * * Display Name: Content _Type
        * * SQL Data Type: nvarchar(MAX)`),
    Content_Title: z.string().nullish().describe(`
        * * Field Name: Content_Title
        * * Display Name: Content _Title
        * * SQL Data Type: nvarchar(MAX)`),
    Abstract: z.string().nullish().describe(`
        * * Field Name: Abstract
        * * Display Name: Abstract
        * * SQL Data Type: nvarchar(MAX)`),
    DOI: z.string().nullish().describe(`
        * * Field Name: DOI
        * * Display Name: DOI
        * * SQL Data Type: nvarchar(MAX)`),
    Content_Date: z.string().nullish().describe(`
        * * Field Name: Content_Date
        * * Display Name: Content _Date
        * * SQL Data Type: nvarchar(MAX)`),
    Category: z.string().nullish().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(MAX)`),
    Meeting: z.string().nullish().describe(`
        * * Field Name: Meeting
        * * Display Name: Meeting
        * * SQL Data Type: nvarchar(MAX)`),
    URL: z.string().nullish().describe(`
        * * Field Name: URL
        * * Display Name: URL
        * * SQL Data Type: nvarchar(MAX)`),
    Old_DOI: z.string().nullish().describe(`
        * * Field Name: Old_DOI
        * * Display Name: Old _DOI
        * * SQL Data Type: nvarchar(MAX)`),
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()`),
    __mj_CreatedAt: z.date().describe(`
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

export type Abstracts_2024_DecemberEntityType = z.infer<typeof Abstracts_2024_DecemberSchema>;

/**
 * zod schema definition for the entity Abstracts _Presenters _2024_Decembers
 */
export const Abstracts_Presenters_2024_DecemberSchema = z.object({
    Customer_ID: z.string().nullish().describe(`
        * * Field Name: Customer_ID
        * * Display Name: Customer _ID
        * * SQL Data Type: nvarchar(MAX)`),
    DOI: z.string().nullish().describe(`
        * * Field Name: DOI
        * * Display Name: DOI
        * * SQL Data Type: nvarchar(MAX)`),
    Role_1: z.string().nullish().describe(`
        * * Field Name: Role_1
        * * Display Name: Role _1
        * * SQL Data Type: nvarchar(MAX)`),
    Role_2: z.string().nullish().describe(`
        * * Field Name: Role_2
        * * Display Name: Role _2
        * * SQL Data Type: nvarchar(MAX)`),
    Affiliation: z.string().nullish().describe(`
        * * Field Name: Affiliation
        * * Display Name: Affiliation
        * * SQL Data Type: nvarchar(MAX)`),
    Order: z.string().nullish().describe(`
        * * Field Name: Order
        * * Display Name: Order
        * * SQL Data Type: nvarchar(MAX)`),
    old_DOI: z.string().nullish().describe(`
        * * Field Name: old_DOI
        * * Display Name: old _DOI
        * * SQL Data Type: nvarchar(MAX)`),
    column8: z.string().nullish().describe(`
        * * Field Name: column8
        * * Display Name: column 8
        * * SQL Data Type: nvarchar(MAX)`),
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()`),
    __mj_CreatedAt: z.date().describe(`
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

export type Abstracts_Presenters_2024_DecemberEntityType = z.infer<typeof Abstracts_Presenters_2024_DecemberSchema>;

/**
 * zod schema definition for the entity Abstracts _Presenters _2024s
 */
export const Abstracts_Presenters_2024Schema = z.object({
    Customer_ID: z.string().nullish().describe(`
        * * Field Name: Customer_ID
        * * Display Name: Customer _ID
        * * SQL Data Type: nvarchar(MAX)`),
    DOI: z.string().nullish().describe(`
        * * Field Name: DOI
        * * Display Name: DOI
        * * SQL Data Type: nvarchar(MAX)`),
    Role_1: z.string().nullish().describe(`
        * * Field Name: Role_1
        * * Display Name: Role _1
        * * SQL Data Type: nvarchar(MAX)`),
    Role_2: z.string().nullish().describe(`
        * * Field Name: Role_2
        * * Display Name: Role _2
        * * SQL Data Type: nvarchar(MAX)`),
    Affiliation: z.string().nullish().describe(`
        * * Field Name: Affiliation
        * * Display Name: Affiliation
        * * SQL Data Type: nvarchar(MAX)`),
    Order: z.string().nullish().describe(`
        * * Field Name: Order
        * * Display Name: Order
        * * SQL Data Type: nvarchar(MAX)`),
    column7: z.string().nullish().describe(`
        * * Field Name: column7
        * * Display Name: column 7
        * * SQL Data Type: nvarchar(MAX)`),
    rlt: z.string().nullish().describe(`
        * * Field Name: rlt
        * * Display Name: rlt
        * * SQL Data Type: nvarchar(MAX)`),
    abs: z.string().nullish().describe(`
        * * Field Name: abs
        * * Display Name: abs
        * * SQL Data Type: nvarchar(MAX)`),
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()`),
    __mj_CreatedAt: z.date().describe(`
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

export type Abstracts_Presenters_2024EntityType = z.infer<typeof Abstracts_Presenters_2024Schema>;

/**
 * zod schema definition for the entity Contents
 */
export const ContentSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    SourceID: z.number().nullish().describe(`
        * * Field Name: SourceID
        * * Display Name: Source ID
        * * SQL Data Type: int`),
    Source: z.string().nullish().describe(`
        * * Field Name: Source
        * * Display Name: Source
        * * SQL Data Type: nvarchar(100)`),
    ContentID: z.string().nullish().describe(`
        * * Field Name: ContentID
        * * Display Name: Content ID
        * * SQL Data Type: nvarchar(100)`),
    ContentType: z.string().nullish().describe(`
        * * Field Name: ContentType
        * * Display Name: Content Type
        * * SQL Data Type: nvarchar(100)`),
    Title: z.string().nullish().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(500)`),
    Text: z.string().nullish().describe(`
        * * Field Name: Text
        * * Display Name: Text
        * * SQL Data Type: nvarchar(MAX)`),
    DOI: z.string().nullish().describe(`
        * * Field Name: DOI
        * * Display Name: DOI
        * * SQL Data Type: nvarchar(100)`),
    URL: z.string().nullish().describe(`
        * * Field Name: URL
        * * Display Name: URL
        * * SQL Data Type: nvarchar(MAX)`),
    Date: z.date().nullish().describe(`
        * * Field Name: Date
        * * Display Name: Date
        * * SQL Data Type: date`),
    EmbeddingID: z.string().nullish().describe(`
        * * Field Name: EmbeddingID
        * * Display Name: Embedding ID
        * * SQL Data Type: nvarchar(50)`),
    UpdateVector: z.boolean().describe(`
        * * Field Name: UpdateVector
        * * Display Name: Update Vector
        * * SQL Data Type: bit`),
    isError: z.boolean().describe(`
        * * Field Name: isError
        * * Display Name: is Error
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

export type ContentEntityType = z.infer<typeof ContentSchema>;

/**
 * zod schema definition for the entity Contributor Contents
 */
export const ContributorContentSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    SourceID: z.number().nullish().describe(`
        * * Field Name: SourceID
        * * Display Name: Source ID
        * * SQL Data Type: int`),
    Source: z.string().nullish().describe(`
        * * Field Name: Source
        * * Display Name: Source
        * * SQL Data Type: varchar(15)`),
    ContributorID: z.number().describe(`
        * * Field Name: ContributorID
        * * Display Name: Contributor ID
        * * SQL Data Type: int`),
    ContentID: z.number().nullish().describe(`
        * * Field Name: ContentID
        * * Display Name: Content ID
        * * SQL Data Type: int`),
    DOI: z.string().nullish().describe(`
        * * Field Name: DOI
        * * Display Name: DOI
        * * SQL Data Type: nvarchar(100)`),
    Role1: z.string().nullish().describe(`
        * * Field Name: Role1
        * * Display Name: Role 1
        * * SQL Data Type: nvarchar(100)`),
    Role2: z.string().nullish().describe(`
        * * Field Name: Role2
        * * Display Name: Role 2
        * * SQL Data Type: nvarchar(100)`),
    CorrespondingAuthor: z.number().nullish().describe(`
        * * Field Name: CorrespondingAuthor
        * * Display Name: Corresponding Author
        * * SQL Data Type: int`),
    Affiliation: z.string().nullish().describe(`
        * * Field Name: Affiliation
        * * Display Name: Affiliation
        * * SQL Data Type: nvarchar(500)`),
    Order: z.number().nullish().describe(`
        * * Field Name: Order
        * * Display Name: Order
        * * SQL Data Type: int`),
    __mj_CreatedAt: z.date().describe(`
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

export type ContributorContentEntityType = z.infer<typeof ContributorContentSchema>;

/**
 * zod schema definition for the entity Contributors
 */
export const ContributorSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    CustomerID: z.string().describe(`
        * * Field Name: CustomerID
        * * Display Name: Customer ID
        * * SQL Data Type: nvarchar(100)`),
    Name: z.string().nullish().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Organization: z.string().nullish().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(500)`),
    JobTitle: z.string().nullish().describe(`
        * * Field Name: JobTitle
        * * Display Name: Job Title
        * * SQL Data Type: nvarchar(500)`),
    DoNotDisplay: z.boolean().describe(`
        * * Field Name: DoNotDisplay
        * * Display Name: Do Not Display
        * * SQL Data Type: bit
        * * Default Value: 0`),
    EmbeddingID: z.string().nullish().describe(`
        * * Field Name: EmbeddingID
        * * Display Name: Embedding ID
        * * SQL Data Type: nvarchar(50)`),
    UpdateVector: z.boolean().describe(`
        * * Field Name: UpdateVector
        * * Display Name: Update Vector
        * * SQL Data Type: bit`),
    isError: z.boolean().describe(`
        * * Field Name: isError
        * * Display Name: is Error
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

export type ContributorEntityType = z.infer<typeof ContributorSchema>;

/**
 * zod schema definition for the entity Csv Processing Logs
 */
export const CsvProcessingLogSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    TotalRecords: z.number().nullish().describe(`
        * * Field Name: TotalRecords
        * * Display Name: Total Records
        * * SQL Data Type: int`),
    ProcessedRecords: z.number().nullish().describe(`
        * * Field Name: ProcessedRecords
        * * Display Name: Processed Records
        * * SQL Data Type: int`),
    FileName: z.string().nullish().describe(`
        * * Field Name: FileName
        * * Display Name: File Name
        * * SQL Data Type: nvarchar(255)`),
    CreatedAt: z.date().nullish().describe(`
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    UpdatedAt: z.date().nullish().describe(`
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
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
});

export type CsvProcessingLogEntityType = z.infer<typeof CsvProcessingLogSchema>;

/**
 * zod schema definition for the entity Presenter _2024_Emails
 */
export const Presenter_2024_EmailsSchema = z.object({
    Customer_ID: z.string().describe(`
        * * Field Name: Customer_ID
        * * Display Name: Customer _ID
        * * SQL Data Type: nvarchar(MAX)`),
    First_Name: z.string().describe(`
        * * Field Name: First_Name
        * * Display Name: First _Name
        * * SQL Data Type: nvarchar(MAX)`),
    Last_Name: z.string().describe(`
        * * Field Name: Last_Name
        * * Display Name: Last _Name
        * * SQL Data Type: nvarchar(MAX)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(MAX)`),
    Profile_Link: z.string().describe(`
        * * Field Name: Profile_Link
        * * Display Name: Profile _Link
        * * SQL Data Type: nvarchar(MAX)`),
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    __mj_CreatedAt: z.date().describe(`
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

export type Presenter_2024_EmailsEntityType = z.infer<typeof Presenter_2024_EmailsSchema>;
 
 

/**
 * Abstracts _2024_Decembers - strongly typed entity sub-class
 * * Schema: dbo
 * * Base Table: Abstracts_2024_December
 * * Base View: vwAbstracts_2024_Decembers
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Abstracts _2024_Decembers')
export class Abstracts_2024_DecemberEntity extends BaseEntity<Abstracts_2024_DecemberEntityType> {
    /**
    * Loads the Abstracts _2024_Decembers record from the database
    * @param ID: string - primary key value to load the Abstracts _2024_Decembers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Abstracts_2024_DecemberEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Content_ID
    * * Display Name: Content _ID
    * * SQL Data Type: nvarchar(MAX)
    */
    get Content_ID(): string | null {
        return this.Get('Content_ID');
    }
    set Content_ID(value: string | null) {
        this.Set('Content_ID', value);
    }

    /**
    * * Field Name: Content_Type
    * * Display Name: Content _Type
    * * SQL Data Type: nvarchar(MAX)
    */
    get Content_Type(): string | null {
        return this.Get('Content_Type');
    }
    set Content_Type(value: string | null) {
        this.Set('Content_Type', value);
    }

    /**
    * * Field Name: Content_Title
    * * Display Name: Content _Title
    * * SQL Data Type: nvarchar(MAX)
    */
    get Content_Title(): string | null {
        return this.Get('Content_Title');
    }
    set Content_Title(value: string | null) {
        this.Set('Content_Title', value);
    }

    /**
    * * Field Name: Abstract
    * * Display Name: Abstract
    * * SQL Data Type: nvarchar(MAX)
    */
    get Abstract(): string | null {
        return this.Get('Abstract');
    }
    set Abstract(value: string | null) {
        this.Set('Abstract', value);
    }

    /**
    * * Field Name: DOI
    * * Display Name: DOI
    * * SQL Data Type: nvarchar(MAX)
    */
    get DOI(): string | null {
        return this.Get('DOI');
    }
    set DOI(value: string | null) {
        this.Set('DOI', value);
    }

    /**
    * * Field Name: Content_Date
    * * Display Name: Content _Date
    * * SQL Data Type: nvarchar(MAX)
    */
    get Content_Date(): string | null {
        return this.Get('Content_Date');
    }
    set Content_Date(value: string | null) {
        this.Set('Content_Date', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(MAX)
    */
    get Category(): string | null {
        return this.Get('Category');
    }
    set Category(value: string | null) {
        this.Set('Category', value);
    }

    /**
    * * Field Name: Meeting
    * * Display Name: Meeting
    * * SQL Data Type: nvarchar(MAX)
    */
    get Meeting(): string | null {
        return this.Get('Meeting');
    }
    set Meeting(value: string | null) {
        this.Set('Meeting', value);
    }

    /**
    * * Field Name: URL
    * * Display Name: URL
    * * SQL Data Type: nvarchar(MAX)
    */
    get URL(): string | null {
        return this.Get('URL');
    }
    set URL(value: string | null) {
        this.Set('URL', value);
    }

    /**
    * * Field Name: Old_DOI
    * * Display Name: Old _DOI
    * * SQL Data Type: nvarchar(MAX)
    */
    get Old_DOI(): string | null {
        return this.Get('Old_DOI');
    }
    set Old_DOI(value: string | null) {
        this.Set('Old_DOI', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newid()
    */
    get ID(): string {
        return this.Get('ID');
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
 * Abstracts _Presenters _2024_Decembers - strongly typed entity sub-class
 * * Schema: dbo
 * * Base Table: Abstracts_Presenters_2024_December
 * * Base View: vwAbstracts_Presenters_2024_Decembers
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Abstracts _Presenters _2024_Decembers')
export class Abstracts_Presenters_2024_DecemberEntity extends BaseEntity<Abstracts_Presenters_2024_DecemberEntityType> {
    /**
    * Loads the Abstracts _Presenters _2024_Decembers record from the database
    * @param ID: string - primary key value to load the Abstracts _Presenters _2024_Decembers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Abstracts_Presenters_2024_DecemberEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Customer_ID
    * * Display Name: Customer _ID
    * * SQL Data Type: nvarchar(MAX)
    */
    get Customer_ID(): string | null {
        return this.Get('Customer_ID');
    }
    set Customer_ID(value: string | null) {
        this.Set('Customer_ID', value);
    }

    /**
    * * Field Name: DOI
    * * Display Name: DOI
    * * SQL Data Type: nvarchar(MAX)
    */
    get DOI(): string | null {
        return this.Get('DOI');
    }
    set DOI(value: string | null) {
        this.Set('DOI', value);
    }

    /**
    * * Field Name: Role_1
    * * Display Name: Role _1
    * * SQL Data Type: nvarchar(MAX)
    */
    get Role_1(): string | null {
        return this.Get('Role_1');
    }
    set Role_1(value: string | null) {
        this.Set('Role_1', value);
    }

    /**
    * * Field Name: Role_2
    * * Display Name: Role _2
    * * SQL Data Type: nvarchar(MAX)
    */
    get Role_2(): string | null {
        return this.Get('Role_2');
    }
    set Role_2(value: string | null) {
        this.Set('Role_2', value);
    }

    /**
    * * Field Name: Affiliation
    * * Display Name: Affiliation
    * * SQL Data Type: nvarchar(MAX)
    */
    get Affiliation(): string | null {
        return this.Get('Affiliation');
    }
    set Affiliation(value: string | null) {
        this.Set('Affiliation', value);
    }

    /**
    * * Field Name: Order
    * * Display Name: Order
    * * SQL Data Type: nvarchar(MAX)
    */
    get Order(): string | null {
        return this.Get('Order');
    }
    set Order(value: string | null) {
        this.Set('Order', value);
    }

    /**
    * * Field Name: old_DOI
    * * Display Name: old _DOI
    * * SQL Data Type: nvarchar(MAX)
    */
    get old_DOI(): string | null {
        return this.Get('old_DOI');
    }
    set old_DOI(value: string | null) {
        this.Set('old_DOI', value);
    }

    /**
    * * Field Name: column8
    * * Display Name: column 8
    * * SQL Data Type: nvarchar(MAX)
    */
    get column8(): string | null {
        return this.Get('column8');
    }
    set column8(value: string | null) {
        this.Set('column8', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newid()
    */
    get ID(): string {
        return this.Get('ID');
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
 * Abstracts _Presenters _2024s - strongly typed entity sub-class
 * * Schema: dbo
 * * Base Table: Abstracts_Presenters_2024
 * * Base View: vwAbstracts_Presenters_2024s
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Abstracts _Presenters _2024s')
export class Abstracts_Presenters_2024Entity extends BaseEntity<Abstracts_Presenters_2024EntityType> {
    /**
    * Loads the Abstracts _Presenters _2024s record from the database
    * @param ID: string - primary key value to load the Abstracts _Presenters _2024s record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Abstracts_Presenters_2024Entity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Customer_ID
    * * Display Name: Customer _ID
    * * SQL Data Type: nvarchar(MAX)
    */
    get Customer_ID(): string | null {
        return this.Get('Customer_ID');
    }
    set Customer_ID(value: string | null) {
        this.Set('Customer_ID', value);
    }

    /**
    * * Field Name: DOI
    * * Display Name: DOI
    * * SQL Data Type: nvarchar(MAX)
    */
    get DOI(): string | null {
        return this.Get('DOI');
    }
    set DOI(value: string | null) {
        this.Set('DOI', value);
    }

    /**
    * * Field Name: Role_1
    * * Display Name: Role _1
    * * SQL Data Type: nvarchar(MAX)
    */
    get Role_1(): string | null {
        return this.Get('Role_1');
    }
    set Role_1(value: string | null) {
        this.Set('Role_1', value);
    }

    /**
    * * Field Name: Role_2
    * * Display Name: Role _2
    * * SQL Data Type: nvarchar(MAX)
    */
    get Role_2(): string | null {
        return this.Get('Role_2');
    }
    set Role_2(value: string | null) {
        this.Set('Role_2', value);
    }

    /**
    * * Field Name: Affiliation
    * * Display Name: Affiliation
    * * SQL Data Type: nvarchar(MAX)
    */
    get Affiliation(): string | null {
        return this.Get('Affiliation');
    }
    set Affiliation(value: string | null) {
        this.Set('Affiliation', value);
    }

    /**
    * * Field Name: Order
    * * Display Name: Order
    * * SQL Data Type: nvarchar(MAX)
    */
    get Order(): string | null {
        return this.Get('Order');
    }
    set Order(value: string | null) {
        this.Set('Order', value);
    }

    /**
    * * Field Name: column7
    * * Display Name: column 7
    * * SQL Data Type: nvarchar(MAX)
    */
    get column7(): string | null {
        return this.Get('column7');
    }
    set column7(value: string | null) {
        this.Set('column7', value);
    }

    /**
    * * Field Name: rlt
    * * Display Name: rlt
    * * SQL Data Type: nvarchar(MAX)
    */
    get rlt(): string | null {
        return this.Get('rlt');
    }
    set rlt(value: string | null) {
        this.Set('rlt', value);
    }

    /**
    * * Field Name: abs
    * * Display Name: abs
    * * SQL Data Type: nvarchar(MAX)
    */
    get abs(): string | null {
        return this.Get('abs');
    }
    set abs(value: string | null) {
        this.Set('abs', value);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newid()
    */
    get ID(): string {
        return this.Get('ID');
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
 * Contents - strongly typed entity sub-class
 * * Schema: dbo
 * * Base Table: Content
 * * Base View: vwContents
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contents')
export class ContentEntity extends BaseEntity<ContentEntityType> {
    /**
    * Loads the Contents record from the database
    * @param ID: number - primary key value to load the Contents record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ContentEntity
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
    * * Field Name: SourceID
    * * Display Name: Source ID
    * * SQL Data Type: int
    */
    get SourceID(): number | null {
        return this.Get('SourceID');
    }
    set SourceID(value: number | null) {
        this.Set('SourceID', value);
    }

    /**
    * * Field Name: Source
    * * Display Name: Source
    * * SQL Data Type: nvarchar(100)
    */
    get Source(): string | null {
        return this.Get('Source');
    }
    set Source(value: string | null) {
        this.Set('Source', value);
    }

    /**
    * * Field Name: ContentID
    * * Display Name: Content ID
    * * SQL Data Type: nvarchar(100)
    */
    get ContentID(): string | null {
        return this.Get('ContentID');
    }
    set ContentID(value: string | null) {
        this.Set('ContentID', value);
    }

    /**
    * * Field Name: ContentType
    * * Display Name: Content Type
    * * SQL Data Type: nvarchar(100)
    */
    get ContentType(): string | null {
        return this.Get('ContentType');
    }
    set ContentType(value: string | null) {
        this.Set('ContentType', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(500)
    */
    get Title(): string | null {
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Text
    * * Display Name: Text
    * * SQL Data Type: nvarchar(MAX)
    */
    get Text(): string | null {
        return this.Get('Text');
    }
    set Text(value: string | null) {
        this.Set('Text', value);
    }

    /**
    * * Field Name: DOI
    * * Display Name: DOI
    * * SQL Data Type: nvarchar(100)
    */
    get DOI(): string | null {
        return this.Get('DOI');
    }
    set DOI(value: string | null) {
        this.Set('DOI', value);
    }

    /**
    * * Field Name: URL
    * * Display Name: URL
    * * SQL Data Type: nvarchar(MAX)
    */
    get URL(): string | null {
        return this.Get('URL');
    }
    set URL(value: string | null) {
        this.Set('URL', value);
    }

    /**
    * * Field Name: Date
    * * Display Name: Date
    * * SQL Data Type: date
    */
    get Date(): Date | null {
        return this.Get('Date');
    }
    set Date(value: Date | null) {
        this.Set('Date', value);
    }

    /**
    * * Field Name: EmbeddingID
    * * Display Name: Embedding ID
    * * SQL Data Type: nvarchar(50)
    */
    get EmbeddingID(): string | null {
        return this.Get('EmbeddingID');
    }
    set EmbeddingID(value: string | null) {
        this.Set('EmbeddingID', value);
    }

    /**
    * * Field Name: UpdateVector
    * * Display Name: Update Vector
    * * SQL Data Type: bit
    */
    get UpdateVector(): boolean {
        return this.Get('UpdateVector');
    }
    set UpdateVector(value: boolean) {
        this.Set('UpdateVector', value);
    }

    /**
    * * Field Name: isError
    * * Display Name: is Error
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get isError(): boolean {
        return this.Get('isError');
    }
    set isError(value: boolean) {
        this.Set('isError', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
 * Contributor Contents - strongly typed entity sub-class
 * * Schema: dbo
 * * Base Table: ContributorContent
 * * Base View: vwContributorContents
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contributor Contents')
export class ContributorContentEntity extends BaseEntity<ContributorContentEntityType> {
    /**
    * Loads the Contributor Contents record from the database
    * @param ID: number - primary key value to load the Contributor Contents record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ContributorContentEntity
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
    * * Field Name: SourceID
    * * Display Name: Source ID
    * * SQL Data Type: int
    */
    get SourceID(): number | null {
        return this.Get('SourceID');
    }
    set SourceID(value: number | null) {
        this.Set('SourceID', value);
    }

    /**
    * * Field Name: Source
    * * Display Name: Source
    * * SQL Data Type: varchar(15)
    */
    get Source(): string | null {
        return this.Get('Source');
    }
    set Source(value: string | null) {
        this.Set('Source', value);
    }

    /**
    * * Field Name: ContributorID
    * * Display Name: Contributor ID
    * * SQL Data Type: int
    */
    get ContributorID(): number {
        return this.Get('ContributorID');
    }
    set ContributorID(value: number) {
        this.Set('ContributorID', value);
    }

    /**
    * * Field Name: ContentID
    * * Display Name: Content ID
    * * SQL Data Type: int
    */
    get ContentID(): number | null {
        return this.Get('ContentID');
    }
    set ContentID(value: number | null) {
        this.Set('ContentID', value);
    }

    /**
    * * Field Name: DOI
    * * Display Name: DOI
    * * SQL Data Type: nvarchar(100)
    */
    get DOI(): string | null {
        return this.Get('DOI');
    }
    set DOI(value: string | null) {
        this.Set('DOI', value);
    }

    /**
    * * Field Name: Role1
    * * Display Name: Role 1
    * * SQL Data Type: nvarchar(100)
    */
    get Role1(): string | null {
        return this.Get('Role1');
    }
    set Role1(value: string | null) {
        this.Set('Role1', value);
    }

    /**
    * * Field Name: Role2
    * * Display Name: Role 2
    * * SQL Data Type: nvarchar(100)
    */
    get Role2(): string | null {
        return this.Get('Role2');
    }
    set Role2(value: string | null) {
        this.Set('Role2', value);
    }

    /**
    * * Field Name: CorrespondingAuthor
    * * Display Name: Corresponding Author
    * * SQL Data Type: int
    */
    get CorrespondingAuthor(): number | null {
        return this.Get('CorrespondingAuthor');
    }
    set CorrespondingAuthor(value: number | null) {
        this.Set('CorrespondingAuthor', value);
    }

    /**
    * * Field Name: Affiliation
    * * Display Name: Affiliation
    * * SQL Data Type: nvarchar(500)
    */
    get Affiliation(): string | null {
        return this.Get('Affiliation');
    }
    set Affiliation(value: string | null) {
        this.Set('Affiliation', value);
    }

    /**
    * * Field Name: Order
    * * Display Name: Order
    * * SQL Data Type: int
    */
    get Order(): number | null {
        return this.Get('Order');
    }
    set Order(value: number | null) {
        this.Set('Order', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
 * Contributors - strongly typed entity sub-class
 * * Schema: dbo
 * * Base Table: Contributor
 * * Base View: vwContributors
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Contributors')
export class ContributorEntity extends BaseEntity<ContributorEntityType> {
    /**
    * Loads the Contributors record from the database
    * @param ID: number - primary key value to load the Contributors record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ContributorEntity
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
    * * Field Name: CustomerID
    * * Display Name: Customer ID
    * * SQL Data Type: nvarchar(100)
    */
    get CustomerID(): string {
        return this.Get('CustomerID');
    }
    set CustomerID(value: string) {
        this.Set('CustomerID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(500)
    */
    get Organization(): string | null {
        return this.Get('Organization');
    }
    set Organization(value: string | null) {
        this.Set('Organization', value);
    }

    /**
    * * Field Name: JobTitle
    * * Display Name: Job Title
    * * SQL Data Type: nvarchar(500)
    */
    get JobTitle(): string | null {
        return this.Get('JobTitle');
    }
    set JobTitle(value: string | null) {
        this.Set('JobTitle', value);
    }

    /**
    * * Field Name: DoNotDisplay
    * * Display Name: Do Not Display
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get DoNotDisplay(): boolean {
        return this.Get('DoNotDisplay');
    }
    set DoNotDisplay(value: boolean) {
        this.Set('DoNotDisplay', value);
    }

    /**
    * * Field Name: EmbeddingID
    * * Display Name: Embedding ID
    * * SQL Data Type: nvarchar(50)
    */
    get EmbeddingID(): string | null {
        return this.Get('EmbeddingID');
    }
    set EmbeddingID(value: string | null) {
        this.Set('EmbeddingID', value);
    }

    /**
    * * Field Name: UpdateVector
    * * Display Name: Update Vector
    * * SQL Data Type: bit
    */
    get UpdateVector(): boolean {
        return this.Get('UpdateVector');
    }
    set UpdateVector(value: boolean) {
        this.Set('UpdateVector', value);
    }

    /**
    * * Field Name: isError
    * * Display Name: is Error
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get isError(): boolean {
        return this.Get('isError');
    }
    set isError(value: boolean) {
        this.Set('isError', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
 * Csv Processing Logs - strongly typed entity sub-class
 * * Schema: dbo
 * * Base Table: CsvProcessingLog
 * * Base View: vwCsvProcessingLogs
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Csv Processing Logs')
export class CsvProcessingLogEntity extends BaseEntity<CsvProcessingLogEntityType> {
    /**
    * Loads the Csv Processing Logs record from the database
    * @param ID: number - primary key value to load the Csv Processing Logs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CsvProcessingLogEntity
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
    * * Field Name: TotalRecords
    * * Display Name: Total Records
    * * SQL Data Type: int
    */
    get TotalRecords(): number | null {
        return this.Get('TotalRecords');
    }
    set TotalRecords(value: number | null) {
        this.Set('TotalRecords', value);
    }

    /**
    * * Field Name: ProcessedRecords
    * * Display Name: Processed Records
    * * SQL Data Type: int
    */
    get ProcessedRecords(): number | null {
        return this.Get('ProcessedRecords');
    }
    set ProcessedRecords(value: number | null) {
        this.Set('ProcessedRecords', value);
    }

    /**
    * * Field Name: FileName
    * * Display Name: File Name
    * * SQL Data Type: nvarchar(255)
    */
    get FileName(): string | null {
        return this.Get('FileName');
    }
    set FileName(value: string | null) {
        this.Set('FileName', value);
    }

    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get CreatedAt(): Date | null {
        return this.Get('CreatedAt');
    }
    set CreatedAt(value: Date | null) {
        this.Set('CreatedAt', value);
    }

    /**
    * * Field Name: UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetime
    */
    get UpdatedAt(): Date | null {
        return this.Get('UpdatedAt');
    }
    set UpdatedAt(value: Date | null) {
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
}


/**
 * Presenter _2024_Emails - strongly typed entity sub-class
 * * Schema: dbo
 * * Base Table: Presenter_2024_Emails
 * * Base View: vwPresenter_2024_Emails
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Presenter _2024_Emails')
export class Presenter_2024_EmailsEntity extends BaseEntity<Presenter_2024_EmailsEntityType> {
    /**
    * Loads the Presenter _2024_Emails record from the database
    * @param ID: number - primary key value to load the Presenter _2024_Emails record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof Presenter_2024_EmailsEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: Customer_ID
    * * Display Name: Customer _ID
    * * SQL Data Type: nvarchar(MAX)
    */
    get Customer_ID(): string {
        return this.Get('Customer_ID');
    }
    set Customer_ID(value: string) {
        this.Set('Customer_ID', value);
    }

    /**
    * * Field Name: First_Name
    * * Display Name: First _Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get First_Name(): string {
        return this.Get('First_Name');
    }
    set First_Name(value: string) {
        this.Set('First_Name', value);
    }

    /**
    * * Field Name: Last_Name
    * * Display Name: Last _Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get Last_Name(): string {
        return this.Get('Last_Name');
    }
    set Last_Name(value: string) {
        this.Set('Last_Name', value);
    }

    /**
    * * Field Name: Email
    * * Display Name: Email
    * * SQL Data Type: nvarchar(MAX)
    */
    get Email(): string {
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Profile_Link
    * * Display Name: Profile _Link
    * * SQL Data Type: nvarchar(MAX)
    */
    get Profile_Link(): string {
        return this.Get('Profile_Link');
    }
    set Profile_Link(value: string) {
        this.Set('Profile_Link', value);
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
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
