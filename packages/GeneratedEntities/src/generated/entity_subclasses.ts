import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Content Items
 */
export const bettyContentItemSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Content Items (vwContentItems.ID)
        * * Description: Shared primary key with the parent __mj.ContentItem row. Same UUID, enforced by FK_BettyContentItem_Inherits. Generate the UUID once when creating the __mj.ContentItem row, then propagate it here.`),
    OrganizationID: z.string().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)
        * * Description: FK to betty.Organization. Required — every Betty content item belongs to exactly one organization, and the BLA search path filters by this column at runtime via the Search Scope's Nunjucks-rendered MetadataFilter.`),
    Decorator: z.string().nullable().describe(`
        * * Field Name: Decorator
        * * Display Name: Decorator
        * * SQL Data Type: nvarchar(2000)
        * * Description: Optional free-text context that helps the LLM (and human reviewers) understand what this content item is and when it's relevant. Indexed into Azure AI Search alongside Name/Description/Text so retrieval can hit author-supplied hints in addition to the raw body text.`),
    SourceIdentifier: z.string().describe(`
        * * Field Name: SourceIdentifier
        * * Display Name: Source Identifier
        * * SQL Data Type: nvarchar(2000)
        * * Description: Stable identifier of the original source (URL, file path, or other globally-unique string). Used by ingest code to detect and skip duplicates when re-ingesting from the same source. Required.`),
    UserLink: z.string().nullable().describe(`
        * * Field Name: UserLink
        * * Display Name: User Link
        * * SQL Data Type: nvarchar(2000)
        * * Description: Optional URL the end user follows to view the source in its original context (e.g. a public web page, an authenticated CMS deep-link, or a doc viewer). Separate from SourceIdentifier — SourceIdentifier is for dedup; UserLink is for human navigation.`),
    ParentID: z.string().nullable().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Content Items (vwContentItems.ID)
        * * Description: Optional self-reference. When the source content is large enough to be split into chunks for embedding/indexing, each chunk's ParentID points at the top-level betty.ContentItem.ID (which is identical to the top-level __mj.ContentItem.ID, by TPT). NULL on the top-level item itself.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Organization: z.string().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(255)`),
    RootParentID: z.string().nullable().describe(`
        * * Field Name: RootParentID
        * * Display Name: Root Parent ID
        * * SQL Data Type: uniqueidentifier`),
    ContentSourceID: z.string().describe(`
        * * Field Name: ContentSourceID
        * * Display Name: Content Source
        * * SQL Data Type: uniqueidentifier`),
    Name: z.string().nullable().describe(`
        * * Field Name: Name
        * * SQL Data Type: nvarchar(250)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    ContentTypeID: z.string().describe(`
        * * Field Name: ContentTypeID
        * * Display Name: Content Type
        * * SQL Data Type: uniqueidentifier`),
    ContentSourceTypeID: z.string().describe(`
        * * Field Name: ContentSourceTypeID
        * * Display Name: Content Source Type
        * * SQL Data Type: uniqueidentifier`),
    ContentFileTypeID: z.string().describe(`
        * * Field Name: ContentFileTypeID
        * * Display Name: Content File Type
        * * SQL Data Type: uniqueidentifier`),
    Checksum: z.string().nullable().describe(`
        * * Field Name: Checksum
        * * SQL Data Type: nvarchar(100)`),
    URL: z.string().describe(`
        * * Field Name: URL
        * * SQL Data Type: nvarchar(2000)`),
    Text: z.string().nullable().describe(`
        * * Field Name: Text
        * * SQL Data Type: nvarchar(MAX)`),
    EntityRecordDocumentID: z.string().nullable().describe(`
        * * Field Name: EntityRecordDocumentID
        * * Display Name: Entity Record Document
        * * SQL Data Type: uniqueidentifier`),
    EmbeddingStatus: z.string().describe(`
        * * Field Name: EmbeddingStatus
        * * Display Name: Embedding Status
        * * SQL Data Type: nvarchar(20)`),
    LastEmbeddedAt: z.date().nullable().describe(`
        * * Field Name: LastEmbeddedAt
        * * Display Name: Last Embedded At
        * * SQL Data Type: datetimeoffset`),
    EmbeddingModelID: z.string().nullable().describe(`
        * * Field Name: EmbeddingModelID
        * * Display Name: Embedding Model
        * * SQL Data Type: uniqueidentifier`),
    TaggingStatus: z.string().describe(`
        * * Field Name: TaggingStatus
        * * Display Name: Tagging Status
        * * SQL Data Type: nvarchar(20)`),
    LastTaggedAt: z.date().nullable().describe(`
        * * Field Name: LastTaggedAt
        * * Display Name: Last Tagged At
        * * SQL Data Type: datetimeoffset`),
});

export type bettyContentItemEntityType = z.infer<typeof bettyContentItemSchema>;

/**
 * zod schema definition for the entity Instances
 */
export const bettyInstanceSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    OrganizationID: z.string().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)
        * * Description: FK to the parent Organization. Required.`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Instance name. Unique within an Organization.`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optional free-text description of the instance.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Organization: z.string().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(255)`),
});

export type bettyInstanceEntityType = z.infer<typeof bettyInstanceSchema>;

/**
 * zod schema definition for the entity Organizations
 */
export const bettyOrganizationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Human-readable name of the organization. Unique.`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optional free-text description of the organization.`),
    __mj_CreatedAt: z.date().describe(`
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

export type bettyOrganizationEntityType = z.infer<typeof bettyOrganizationSchema>;

/**
 * zod schema definition for the entity Prompt Components
 */
export const bettyPromptComponentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PromptID: z.string().describe(`
        * * Field Name: PromptID
        * * Display Name: Prompt ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: AI Prompts (vwAIPrompts.ID)
        * * Description: FK to the __mj.AIPrompt the component belongs to. Only components matching this PromptID are ever considered, regardless of any other scoping match.`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Logical name of the component within the prompt (e.g. "persona", "task-rules", "few-shot-example"). The BLA selects at most one row per (PromptID, Name) at runtime, using the cascading specificity match.`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Optional free-text description of the component's intent. Not used at runtime.`),
    Text: z.string().describe(`
        * * Field Name: Text
        * * Display Name: Text
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The actual text content rendered into a ChatMessage. May include template variables that downstream rendering substitutes.`),
    Sort: z.number().describe(`
        * * Field Name: Sort
        * * Display Name: Sort
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Final-assembly ordering. Lower Sort renders earlier in the ChatMessage[] (after conversation history). NOT used for selection tie-breaking among same-tier matches — that uses a stable TOP 1 by ID.`),
    Role: z.union([z.literal('Assistant'), z.literal('System'), z.literal('User')]).describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(20)
        * * Default Value: System
    * * Value List Type: List
    * * Possible Values 
    *   * Assistant
    *   * System
    *   * User
        * * Description: Role of the rendered message in the final ChatMessage[]: System, User, or Assistant. Each component becomes its own message at the LLM API layer, so System -> User -> System -> User sequences are preserved.`),
    OrganizationID: z.string().nullable().describe(`
        * * Field Name: OrganizationID
        * * Display Name: Organization ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)
        * * Description: Optional FK to betty.Organization. NULL means "applies to any organization" (least-specific tier). When non-NULL, the component only matches at runtime if the caller-supplied OrganizationID equals this value.`),
    InstanceID: z.string().nullable().describe(`
        * * Field Name: InstanceID
        * * Display Name: Instance ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Instances (vwInstances.ID)
        * * Description: Optional FK to betty.Instance. NULL means "applies to any instance within whatever Organization scope is set" (or any instance globally if OrganizationID is also NULL). When non-NULL, the component only matches at runtime if the caller-supplied InstanceID equals this value AND its Organization matches too.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Prompt: z.string().describe(`
        * * Field Name: Prompt
        * * Display Name: Prompt
        * * SQL Data Type: nvarchar(255)`),
    Organization: z.string().nullable().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(255)`),
    Instance: z.string().nullable().describe(`
        * * Field Name: Instance
        * * Display Name: Instance
        * * SQL Data Type: nvarchar(255)`),
});

export type bettyPromptComponentEntityType = z.infer<typeof bettyPromptComponentSchema>;
 
 

/**
 * Content Items - strongly typed entity sub-class
 * * Schema: betty
 * * Base Table: ContentItem
 * * Base View: vwContentItems
 * * @description Betty-specific extension of MJ: Content Items. Shares its primary key with the parent __mj.ContentItem row (TPT inheritance) — a betty.ContentItem.ID is always the same UUID as its corresponding __mj.ContentItem.ID. Adds the tenant scope (OrganizationID), retrieval-context fields (Decorator, SourceIdentifier, UserLink), and chunk hierarchy (ParentID) used by the BLA / BettyNext agents.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Content Items')
export class bettyContentItemEntity extends BaseEntity<bettyContentItemEntityType> {
    /**
    * Loads the Content Items record from the database
    * @param ID: string - primary key value to load the Content Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof bettyContentItemEntity
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
    * * Related Entity/Foreign Key: MJ: Content Items (vwContentItems.ID)
    * * Description: Shared primary key with the parent __mj.ContentItem row. Same UUID, enforced by FK_BettyContentItem_Inherits. Generate the UUID once when creating the __mj.ContentItem row, then propagate it here.
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)
    * * Description: FK to betty.Organization. Required — every Betty content item belongs to exactly one organization, and the BLA search path filters by this column at runtime via the Search Scope's Nunjucks-rendered MetadataFilter.
    */
    get OrganizationID(): string {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: string) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: Decorator
    * * Display Name: Decorator
    * * SQL Data Type: nvarchar(2000)
    * * Description: Optional free-text context that helps the LLM (and human reviewers) understand what this content item is and when it's relevant. Indexed into Azure AI Search alongside Name/Description/Text so retrieval can hit author-supplied hints in addition to the raw body text.
    */
    get Decorator(): string | null {
        return this.Get('Decorator');
    }
    set Decorator(value: string | null) {
        this.Set('Decorator', value);
    }

    /**
    * * Field Name: SourceIdentifier
    * * Display Name: Source Identifier
    * * SQL Data Type: nvarchar(2000)
    * * Description: Stable identifier of the original source (URL, file path, or other globally-unique string). Used by ingest code to detect and skip duplicates when re-ingesting from the same source. Required.
    */
    get SourceIdentifier(): string {
        return this.Get('SourceIdentifier');
    }
    set SourceIdentifier(value: string) {
        this.Set('SourceIdentifier', value);
    }

    /**
    * * Field Name: UserLink
    * * Display Name: User Link
    * * SQL Data Type: nvarchar(2000)
    * * Description: Optional URL the end user follows to view the source in its original context (e.g. a public web page, an authenticated CMS deep-link, or a doc viewer). Separate from SourceIdentifier — SourceIdentifier is for dedup; UserLink is for human navigation.
    */
    get UserLink(): string | null {
        return this.Get('UserLink');
    }
    set UserLink(value: string | null) {
        this.Set('UserLink', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Content Items (vwContentItems.ID)
    * * Description: Optional self-reference. When the source content is large enough to be split into chunks for embedding/indexing, each chunk's ParentID points at the top-level betty.ContentItem.ID (which is identical to the top-level __mj.ContentItem.ID, by TPT). NULL on the top-level item itself.
    */
    get ParentID(): string | null {
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(255)
    */
    get Organization(): string {
        return this.Get('Organization');
    }

    /**
    * * Field Name: RootParentID
    * * Display Name: Root Parent ID
    * * SQL Data Type: uniqueidentifier
    */
    get RootParentID(): string | null {
        return this.Get('RootParentID');
    }

    /**
    * * Field Name: ContentSourceID
    * * Display Name: Content Source
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ: Content Items
    */
    get ContentSourceID(): string {
        return this.Get('ContentSourceID');
    }
    set ContentSourceID(value: string) {
        this.Set('ContentSourceID', value);
    }

    /**
    * * Field Name: Name
    * * SQL Data Type: nvarchar(250)
    * * IS-A Source: Inherited from MJ: Content Items
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * IS-A Source: Inherited from MJ: Content Items
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ContentTypeID
    * * Display Name: Content Type
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ: Content Items
    */
    get ContentTypeID(): string {
        return this.Get('ContentTypeID');
    }
    set ContentTypeID(value: string) {
        this.Set('ContentTypeID', value);
    }

    /**
    * * Field Name: ContentSourceTypeID
    * * Display Name: Content Source Type
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ: Content Items
    */
    get ContentSourceTypeID(): string {
        return this.Get('ContentSourceTypeID');
    }
    set ContentSourceTypeID(value: string) {
        this.Set('ContentSourceTypeID', value);
    }

    /**
    * * Field Name: ContentFileTypeID
    * * Display Name: Content File Type
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ: Content Items
    */
    get ContentFileTypeID(): string {
        return this.Get('ContentFileTypeID');
    }
    set ContentFileTypeID(value: string) {
        this.Set('ContentFileTypeID', value);
    }

    /**
    * * Field Name: Checksum
    * * SQL Data Type: nvarchar(100)
    * * IS-A Source: Inherited from MJ: Content Items
    */
    get Checksum(): string | null {
        return this.Get('Checksum');
    }
    set Checksum(value: string | null) {
        this.Set('Checksum', value);
    }

    /**
    * * Field Name: URL
    * * SQL Data Type: nvarchar(2000)
    * * IS-A Source: Inherited from MJ: Content Items
    */
    get URL(): string {
        return this.Get('URL');
    }
    set URL(value: string) {
        this.Set('URL', value);
    }

    /**
    * * Field Name: Text
    * * SQL Data Type: nvarchar(MAX)
    * * IS-A Source: Inherited from MJ: Content Items
    */
    get Text(): string | null {
        return this.Get('Text');
    }
    set Text(value: string | null) {
        this.Set('Text', value);
    }

    /**
    * * Field Name: EntityRecordDocumentID
    * * Display Name: Entity Record Document
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ: Content Items
    */
    get EntityRecordDocumentID(): string | null {
        return this.Get('EntityRecordDocumentID');
    }
    set EntityRecordDocumentID(value: string | null) {
        this.Set('EntityRecordDocumentID', value);
    }

    /**
    * * Field Name: EmbeddingStatus
    * * Display Name: Embedding Status
    * * SQL Data Type: nvarchar(20)
    * * IS-A Source: Inherited from MJ: Content Items
    */
    get EmbeddingStatus(): string {
        return this.Get('EmbeddingStatus');
    }
    set EmbeddingStatus(value: string) {
        this.Set('EmbeddingStatus', value);
    }

    /**
    * * Field Name: LastEmbeddedAt
    * * Display Name: Last Embedded At
    * * SQL Data Type: datetimeoffset
    * * IS-A Source: Inherited from MJ: Content Items
    */
    get LastEmbeddedAt(): Date | null {
        return this.Get('LastEmbeddedAt');
    }
    set LastEmbeddedAt(value: Date | null) {
        this.Set('LastEmbeddedAt', value);
    }

    /**
    * * Field Name: EmbeddingModelID
    * * Display Name: Embedding Model
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ: Content Items
    */
    get EmbeddingModelID(): string | null {
        return this.Get('EmbeddingModelID');
    }
    set EmbeddingModelID(value: string | null) {
        this.Set('EmbeddingModelID', value);
    }

    /**
    * * Field Name: TaggingStatus
    * * Display Name: Tagging Status
    * * SQL Data Type: nvarchar(20)
    * * IS-A Source: Inherited from MJ: Content Items
    */
    get TaggingStatus(): string {
        return this.Get('TaggingStatus');
    }
    set TaggingStatus(value: string) {
        this.Set('TaggingStatus', value);
    }

    /**
    * * Field Name: LastTaggedAt
    * * Display Name: Last Tagged At
    * * SQL Data Type: datetimeoffset
    * * IS-A Source: Inherited from MJ: Content Items
    */
    get LastTaggedAt(): Date | null {
        return this.Get('LastTaggedAt');
    }
    set LastTaggedAt(value: Date | null) {
        this.Set('LastTaggedAt', value);
    }
}


/**
 * Instances - strongly typed entity sub-class
 * * Schema: betty
 * * Base Table: Instance
 * * Base View: vwInstances
 * * @description A deployment or environment within an Organization (e.g. dev, prod, customer-specific). InstanceID is always under exactly one OrganizationID; the BLA agent assumes this when narrowing PromptComponent matches.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Instances')
export class bettyInstanceEntity extends BaseEntity<bettyInstanceEntityType> {
    /**
    * Loads the Instances record from the database
    * @param ID: string - primary key value to load the Instances record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof bettyInstanceEntity
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
    * * Field Name: OrganizationID
    * * Display Name: Organization ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)
    * * Description: FK to the parent Organization. Required.
    */
    get OrganizationID(): string {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: string) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Instance name. Unique within an Organization.
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
    * * Description: Optional free-text description of the instance.
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
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(255)
    */
    get Organization(): string {
        return this.Get('Organization');
    }
}


/**
 * Organizations - strongly typed entity sub-class
 * * Schema: betty
 * * Base Table: Organization
 * * Base View: vwOrganizations
 * * @description Tenant root for the BLA agent. PromptComponents may be scoped to a specific Organization; rows with no OrganizationID match any organization (least-specific tier).
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Organizations')
export class bettyOrganizationEntity extends BaseEntity<bettyOrganizationEntityType> {
    /**
    * Loads the Organizations record from the database
    * @param ID: string - primary key value to load the Organizations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof bettyOrganizationEntity
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
    * * SQL Data Type: nvarchar(255)
    * * Description: Human-readable name of the organization. Unique.
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
    * * Description: Optional free-text description of the organization.
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
 * Prompt Components - strongly typed entity sub-class
 * * Schema: betty
 * * Base Table: PromptComponent
 * * Base View: vwPromptComponents
 * * @description A single reusable text snippet for an AIPrompt, optionally scoped to an Organization and/or Instance. The BLA assemble-prompt action selects the most specific component per Name within the matching PromptID (Org+Instance > Org > none) and renders them by Sort + Role into a structured ChatMessage[] for AIPromptRunner.ExecutePrompt.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Prompt Components')
export class bettyPromptComponentEntity extends BaseEntity<bettyPromptComponentEntityType> {
    /**
    * Loads the Prompt Components record from the database
    * @param ID: string - primary key value to load the Prompt Components record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof bettyPromptComponentEntity
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
    * * Field Name: PromptID
    * * Display Name: Prompt ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: AI Prompts (vwAIPrompts.ID)
    * * Description: FK to the __mj.AIPrompt the component belongs to. Only components matching this PromptID are ever considered, regardless of any other scoping match.
    */
    get PromptID(): string {
        return this.Get('PromptID');
    }
    set PromptID(value: string) {
        this.Set('PromptID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Logical name of the component within the prompt (e.g. "persona", "task-rules", "few-shot-example"). The BLA selects at most one row per (PromptID, Name) at runtime, using the cascading specificity match.
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
    * * Description: Optional free-text description of the component's intent. Not used at runtime.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Text
    * * Display Name: Text
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The actual text content rendered into a ChatMessage. May include template variables that downstream rendering substitutes.
    */
    get Text(): string {
        return this.Get('Text');
    }
    set Text(value: string) {
        this.Set('Text', value);
    }

    /**
    * * Field Name: Sort
    * * Display Name: Sort
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Final-assembly ordering. Lower Sort renders earlier in the ChatMessage[] (after conversation history). NOT used for selection tie-breaking among same-tier matches — that uses a stable TOP 1 by ID.
    */
    get Sort(): number {
        return this.Get('Sort');
    }
    set Sort(value: number) {
        this.Set('Sort', value);
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(20)
    * * Default Value: System
    * * Value List Type: List
    * * Possible Values 
    *   * Assistant
    *   * System
    *   * User
    * * Description: Role of the rendered message in the final ChatMessage[]: System, User, or Assistant. Each component becomes its own message at the LLM API layer, so System -> User -> System -> User sequences are preserved.
    */
    get Role(): 'Assistant' | 'System' | 'User' {
        return this.Get('Role');
    }
    set Role(value: 'Assistant' | 'System' | 'User') {
        this.Set('Role', value);
    }

    /**
    * * Field Name: OrganizationID
    * * Display Name: Organization ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Organizations (vwOrganizations.ID)
    * * Description: Optional FK to betty.Organization. NULL means "applies to any organization" (least-specific tier). When non-NULL, the component only matches at runtime if the caller-supplied OrganizationID equals this value.
    */
    get OrganizationID(): string | null {
        return this.Get('OrganizationID');
    }
    set OrganizationID(value: string | null) {
        this.Set('OrganizationID', value);
    }

    /**
    * * Field Name: InstanceID
    * * Display Name: Instance ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Instances (vwInstances.ID)
    * * Description: Optional FK to betty.Instance. NULL means "applies to any instance within whatever Organization scope is set" (or any instance globally if OrganizationID is also NULL). When non-NULL, the component only matches at runtime if the caller-supplied InstanceID equals this value AND its Organization matches too.
    */
    get InstanceID(): string | null {
        return this.Get('InstanceID');
    }
    set InstanceID(value: string | null) {
        this.Set('InstanceID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

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
    * * Field Name: Prompt
    * * Display Name: Prompt
    * * SQL Data Type: nvarchar(255)
    */
    get Prompt(): string {
        return this.Get('Prompt');
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(255)
    */
    get Organization(): string | null {
        return this.Get('Organization');
    }

    /**
    * * Field Name: Instance
    * * Display Name: Instance
    * * SQL Data Type: nvarchar(255)
    */
    get Instance(): string | null {
        return this.Get('Instance');
    }
}
