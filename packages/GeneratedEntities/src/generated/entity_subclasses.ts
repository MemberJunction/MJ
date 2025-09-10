import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Contents
 */
export const ContentSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: float(53)`),
    SourceID: z.string().nullable().describe(`
        * * Field Name: SourceID
        * * Display Name: Source ID
        * * SQL Data Type: nvarchar(255)`),
    Source: z.string().nullable().describe(`
        * * Field Name: Source
        * * Display Name: Source
        * * SQL Data Type: nvarchar(255)`),
    ContentID: z.number().nullable().describe(`
        * * Field Name: ContentID
        * * Display Name: Content ID
        * * SQL Data Type: float(53)`),
    ContentType: z.string().nullable().describe(`
        * * Field Name: ContentType
        * * Display Name: Content Type
        * * SQL Data Type: nvarchar(255)`),
    Title: z.string().nullable().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(1000)`),
    Text: z.string().nullable().describe(`
        * * Field Name: Text
        * * Display Name: Text
        * * SQL Data Type: nvarchar(MAX)`),
    DOI: z.string().nullable().describe(`
        * * Field Name: DOI
        * * Display Name: DOI
        * * SQL Data Type: nvarchar(255)`),
    URL: z.string().nullable().describe(`
        * * Field Name: URL
        * * Display Name: URL
        * * SQL Data Type: nvarchar(1000)`),
    Date: z.date().nullable().describe(`
        * * Field Name: Date
        * * Display Name: Date
        * * SQL Data Type: datetime`),
    EmbeddingID: z.string().nullable().describe(`
        * * Field Name: EmbeddingID
        * * Display Name: Embedding ID
        * * SQL Data Type: nvarchar(255)`),
    UpdateVector: z.number().nullable().describe(`
        * * Field Name: UpdateVector
        * * Display Name: Update Vector
        * * SQL Data Type: float(53)`),
    IsError: z.number().nullable().describe(`
        * * Field Name: IsError
        * * Display Name: Is Error
        * * SQL Data Type: float(53)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Metadata: z.string().nullable().describe(`
        * * Field Name: Metadata
        * * Display Name: Metadata
        * * SQL Data Type: nvarchar(255)`),
});

export type ContentEntityType = z.infer<typeof ContentSchema>;

/**
 * zod schema definition for the entity Contributor Contents
 */
export const ContributorContentSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: float(53)`),
    SourceID: z.string().nullable().describe(`
        * * Field Name: SourceID
        * * Display Name: Source ID
        * * SQL Data Type: nvarchar(255)`),
    Source: z.string().nullable().describe(`
        * * Field Name: Source
        * * Display Name: Source
        * * SQL Data Type: nvarchar(255)`),
    ContributorID: z.number().nullable().describe(`
        * * Field Name: ContributorID
        * * Display Name: Contributor ID
        * * SQL Data Type: float(53)`),
    ContentID: z.number().nullable().describe(`
        * * Field Name: ContentID
        * * Display Name: Content ID
        * * SQL Data Type: float(53)`),
    DOI: z.string().nullable().describe(`
        * * Field Name: DOI
        * * Display Name: DOI
        * * SQL Data Type: nvarchar(255)`),
    Role1: z.string().nullable().describe(`
        * * Field Name: Role1
        * * Display Name: Role 1
        * * SQL Data Type: nvarchar(255)`),
    Role2: z.string().nullable().describe(`
        * * Field Name: Role2
        * * Display Name: Role 2
        * * SQL Data Type: nvarchar(255)`),
    CorrespondingAuthor: z.string().nullable().describe(`
        * * Field Name: CorrespondingAuthor
        * * Display Name: Corresponding Author
        * * SQL Data Type: nvarchar(255)`),
    Affiliation: z.string().nullable().describe(`
        * * Field Name: Affiliation
        * * Display Name: Affiliation
        * * SQL Data Type: nvarchar(255)`),
    Order: z.number().nullable().describe(`
        * * Field Name: Order
        * * Display Name: Order
        * * SQL Data Type: float(53)`),
    __mj_CreatedAt: z.date().describe(`
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
    CustomerID: z.string().nullable().describe(`
        * * Field Name: CustomerID
        * * Display Name: Customer ID
        * * SQL Data Type: nvarchar(255)`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Organization: z.string().nullable().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(MAX)`),
    JobTitle: z.string().nullable().describe(`
        * * Field Name: JobTitle
        * * Display Name: Job Title
        * * SQL Data Type: nvarchar(255)`),
    DoNotDisplay: z.string().nullable().describe(`
        * * Field Name: DoNotDisplay
        * * Display Name: Do Not Display
        * * SQL Data Type: nvarchar(50)`),
    EmbeddingID: z.string().nullable().describe(`
        * * Field Name: EmbeddingID
        * * Display Name: Embedding ID
        * * SQL Data Type: nvarchar(255)`),
    UpdateVector: z.string().nullable().describe(`
        * * Field Name: UpdateVector
        * * Display Name: Update Vector
        * * SQL Data Type: nvarchar(50)`),
    IsError: z.string().nullable().describe(`
        * * Field Name: IsError
        * * Display Name: Is Error
        * * SQL Data Type: nvarchar(50)`),
    __mj_CreatedAt: z.date().describe(`
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
 * zod schema definition for the entity Full Random Reviewer Lists
 */
export const FullRandomReviewerListSchema = z.object({
    CustomerID: z.string().describe(`
        * * Field Name: CustomerID
        * * Display Name: Customer ID
        * * SQL Data Type: nvarchar(50)`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(255)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(255)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    Affiliation: z.string().describe(`
        * * Field Name: Affiliation
        * * Display Name: Affiliation
        * * SQL Data Type: nvarchar(1000)`),
    __mj_CreatedAt: z.date().describe(`
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

export type FullRandomReviewerListEntityType = z.infer<typeof FullRandomReviewerListSchema>;

/**
 * zod schema definition for the entity Target Lists
 */
export const TargetListSchema = z.object({
    CustomerID: z.string().describe(`
        * * Field Name: CustomerID
        * * Display Name: Customer ID
        * * SQL Data Type: nvarchar(255)`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(255)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(255)`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    Organization: z.string().nullable().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(510)`),
    __mj_CreatedAt: z.date().describe(`
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

export type TargetListEntityType = z.infer<typeof TargetListSchema>;

/**
 * zod schema definition for the entity Targetted Reviewer Recruitment Emails
 */
export const TargettedReviewerRecruitmentEmailSchema = z.object({
    CustomerID: z.string().describe(`
        * * Field Name: CustomerID
        * * Display Name: Customer ID
        * * SQL Data Type: nvarchar(255)`),
    FirstName: z.string().nullable().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(255)`),
    LastName: z.string().nullable().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(255)`),
    Email: z.string().nullable().describe(`
        * * Field Name: Email
        * * Display Name: Email
        * * SQL Data Type: nvarchar(255)`),
    Affiliation: z.string().nullable().describe(`
        * * Field Name: Affiliation
        * * Display Name: Affiliation
        * * SQL Data Type: nvarchar(510)`),
    __mj_CreatedAt: z.date().describe(`
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

export type TargettedReviewerRecruitmentEmailEntityType = z.infer<typeof TargettedReviewerRecruitmentEmailSchema>;
 
 

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
    * * SQL Data Type: float(53)
    */
    get ID(): number {
        return this.Get('ID');
    }
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: SourceID
    * * Display Name: Source ID
    * * SQL Data Type: nvarchar(255)
    */
    get SourceID(): string | null {
        return this.Get('SourceID');
    }
    set SourceID(value: string | null) {
        this.Set('SourceID', value);
    }

    /**
    * * Field Name: Source
    * * Display Name: Source
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: float(53)
    */
    get ContentID(): number | null {
        return this.Get('ContentID');
    }
    set ContentID(value: number | null) {
        this.Set('ContentID', value);
    }

    /**
    * * Field Name: ContentType
    * * Display Name: Content Type
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: nvarchar(1000)
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
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: nvarchar(1000)
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
    * * SQL Data Type: datetime
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
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: float(53)
    */
    get UpdateVector(): number | null {
        return this.Get('UpdateVector');
    }
    set UpdateVector(value: number | null) {
        this.Set('UpdateVector', value);
    }

    /**
    * * Field Name: IsError
    * * Display Name: Is Error
    * * SQL Data Type: float(53)
    */
    get IsError(): number | null {
        return this.Get('IsError');
    }
    set IsError(value: number | null) {
        this.Set('IsError', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
    * * Field Name: Metadata
    * * Display Name: Metadata
    * * SQL Data Type: nvarchar(255)
    */
    get Metadata(): string | null {
        return this.Get('Metadata');
    }
    set Metadata(value: string | null) {
        this.Set('Metadata', value);
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
    * * SQL Data Type: float(53)
    */
    get ID(): number {
        return this.Get('ID');
    }
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: SourceID
    * * Display Name: Source ID
    * * SQL Data Type: nvarchar(255)
    */
    get SourceID(): string | null {
        return this.Get('SourceID');
    }
    set SourceID(value: string | null) {
        this.Set('SourceID', value);
    }

    /**
    * * Field Name: Source
    * * Display Name: Source
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: float(53)
    */
    get ContributorID(): number | null {
        return this.Get('ContributorID');
    }
    set ContributorID(value: number | null) {
        this.Set('ContributorID', value);
    }

    /**
    * * Field Name: ContentID
    * * Display Name: Content ID
    * * SQL Data Type: float(53)
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
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: nvarchar(255)
    */
    get CorrespondingAuthor(): string | null {
        return this.Get('CorrespondingAuthor');
    }
    set CorrespondingAuthor(value: string | null) {
        this.Set('CorrespondingAuthor', value);
    }

    /**
    * * Field Name: Affiliation
    * * Display Name: Affiliation
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: float(53)
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
    set ID(value: number) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CustomerID
    * * Display Name: Customer ID
    * * SQL Data Type: nvarchar(255)
    */
    get CustomerID(): string | null {
        return this.Get('CustomerID');
    }
    set CustomerID(value: string | null) {
        this.Set('CustomerID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: nvarchar(MAX)
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
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: nvarchar(50)
    */
    get DoNotDisplay(): string | null {
        return this.Get('DoNotDisplay');
    }
    set DoNotDisplay(value: string | null) {
        this.Set('DoNotDisplay', value);
    }

    /**
    * * Field Name: EmbeddingID
    * * Display Name: Embedding ID
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: nvarchar(50)
    */
    get UpdateVector(): string | null {
        return this.Get('UpdateVector');
    }
    set UpdateVector(value: string | null) {
        this.Set('UpdateVector', value);
    }

    /**
    * * Field Name: IsError
    * * Display Name: Is Error
    * * SQL Data Type: nvarchar(50)
    */
    get IsError(): string | null {
        return this.Get('IsError');
    }
    set IsError(value: string | null) {
        this.Set('IsError', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
 * Full Random Reviewer Lists - strongly typed entity sub-class
 * * Schema: dbo
 * * Base Table: FullRandomReviewerList
 * * Base View: vwFullRandomReviewerLists
 * * Primary Key: CustomerID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Full Random Reviewer Lists')
export class FullRandomReviewerListEntity extends BaseEntity<FullRandomReviewerListEntityType> {
    /**
    * Loads the Full Random Reviewer Lists record from the database
    * @param CustomerID: string - primary key value to load the Full Random Reviewer Lists record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof FullRandomReviewerListEntity
    * @method
    * @override
    */
    public async Load(CustomerID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'CustomerID', Value: CustomerID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: CustomerID
    * * Display Name: Customer ID
    * * SQL Data Type: nvarchar(50)
    */
    get CustomerID(): string {
        return this.Get('CustomerID');
    }
    set CustomerID(value: string) {
        this.Set('CustomerID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: nvarchar(255)
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
    * * Field Name: Affiliation
    * * Display Name: Affiliation
    * * SQL Data Type: nvarchar(1000)
    */
    get Affiliation(): string {
        return this.Get('Affiliation');
    }
    set Affiliation(value: string) {
        this.Set('Affiliation', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
 * Target Lists - strongly typed entity sub-class
 * * Schema: dbo
 * * Base Table: TargetList
 * * Base View: vwTargetLists
 * * Primary Key: CustomerID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Target Lists')
export class TargetListEntity extends BaseEntity<TargetListEntityType> {
    /**
    * Loads the Target Lists record from the database
    * @param CustomerID: string - primary key value to load the Target Lists record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TargetListEntity
    * @method
    * @override
    */
    public async Load(CustomerID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'CustomerID', Value: CustomerID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: CustomerID
    * * Display Name: Customer ID
    * * SQL Data Type: nvarchar(255)
    */
    get CustomerID(): string {
        return this.Get('CustomerID');
    }
    set CustomerID(value: string) {
        this.Set('CustomerID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: nvarchar(510)
    */
    get Organization(): string | null {
        return this.Get('Organization');
    }
    set Organization(value: string | null) {
        this.Set('Organization', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
 * Targetted Reviewer Recruitment Emails - strongly typed entity sub-class
 * * Schema: dbo
 * * Base Table: TargettedReviewerRecruitmentEmail
 * * Base View: vwTargettedReviewerRecruitmentEmails
 * * Primary Key: CustomerID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Targetted Reviewer Recruitment Emails')
export class TargettedReviewerRecruitmentEmailEntity extends BaseEntity<TargettedReviewerRecruitmentEmailEntityType> {
    /**
    * Loads the Targetted Reviewer Recruitment Emails record from the database
    * @param CustomerID: string - primary key value to load the Targetted Reviewer Recruitment Emails record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TargettedReviewerRecruitmentEmailEntity
    * @method
    * @override
    */
    public async Load(CustomerID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'CustomerID', Value: CustomerID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: CustomerID
    * * Display Name: Customer ID
    * * SQL Data Type: nvarchar(255)
    */
    get CustomerID(): string {
        return this.Get('CustomerID');
    }
    set CustomerID(value: string) {
        this.Set('CustomerID', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: nvarchar(255)
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
    * * SQL Data Type: nvarchar(255)
    */
    get Email(): string | null {
        return this.Get('Email');
    }
    set Email(value: string | null) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Affiliation
    * * Display Name: Affiliation
    * * SQL Data Type: nvarchar(510)
    */
    get Affiliation(): string | null {
        return this.Get('Affiliation');
    }
    set Affiliation(value: string | null) {
        this.Set('Affiliation', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
