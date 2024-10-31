import { BaseEntity, EntitySaveOptions, CompositeKey } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Channel Message Types
 */
export const ChannelMessageTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ChannelID: z.string().describe(`
        * * Field Name: ChannelID
        * * Display Name: Channel ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Channels (vwChannels.ID)
    * * Description: Foreign key to Channels table; links to a specific channel`),
    MessageTypeID: z.string().describe(`
        * * Field Name: MessageTypeID
        * * Display Name: Message Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Message Types (vwMessageTypes.ID)
    * * Description: Foreign key to MessageType table; links to a specific message type`),
    IsDefault: z.boolean().describe(`
        * * Field Name: IsDefault
        * * Display Name: Is Default
        * * SQL Data Type: bit
    * * Description: Indicates if this message type is the default for the linked channel`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
    * * Description: Indicates if the message type is currently active for the linked channel`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Channel: z.string().describe(`
        * * Field Name: Channel
        * * Display Name: Channel
        * * SQL Data Type: nvarchar(255)`),
    MessageType: z.string().describe(`
        * * Field Name: MessageType
        * * Display Name: Message Type
        * * SQL Data Type: nvarchar(255)`),
});

export type ChannelMessageTypeEntityType = z.infer<typeof ChannelMessageTypeSchema>;

/**
 * zod schema definition for the entity Channel Messages
 */
export const ChannelMessageSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ChannelMessageTypeID: z.string().describe(`
        * * Field Name: ChannelMessageTypeID
        * * Display Name: Channel Message Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Channel Message Types (vwChannelMessageTypes.ID)
    * * Description: Link to ChannelMessageType table identifying the type and channel of the message`),
    ExternalSystemRecordID: z.string().nullish().describe(`
        * * Field Name: ExternalSystemRecordID
        * * Display Name: External System Record ID
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Identifier for the message as provided by the communication provider; not unique globally but is indexed`),
    ReceivedAt: z.date().describe(`
        * * Field Name: ReceivedAt
        * * Display Name: Received At
        * * SQL Data Type: datetime
    * * Description: Timestamp when the message was received from the communication provider`),
    MessageContent: z.string().describe(`
        * * Field Name: MessageContent
        * * Display Name: Message Content
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Content of the message received from the end user`),
    ResponseContent: z.string().nullish().describe(`
        * * Field Name: ResponseContent
        * * Display Name: Response Content
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Content of the response sent back to the end user`),
    Status: z.union([z.literal('Pending'), z.literal('Completed'), z.literal('In Progress'), z.literal('Failed'), z.literal('Skipped')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(255)
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Completed
    *   * In Progress
    *   * Failed
    *   * Skipped
    * * Description: Current status of the message processing; constrained to specific values`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ChannelMessageEntityType = z.infer<typeof ChannelMessageSchema>;

/**
 * zod schema definition for the entity Channel Types
 */
export const ChannelTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
    * * Description: Name of the channel type`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Detailed description of the channel type`),
    CommunicationProviderID: z.string().describe(`
        * * Field Name: CommunicationProviderID
        * * Display Name: Communication Provider ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Communication Providers (vwCommunicationProviders.ID)
    * * Description: Foreign key linking to the MJ Communication Provider table`),
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
    CommunicationProvider: z.string().describe(`
        * * Field Name: CommunicationProvider
        * * Display Name: Communication Provider
        * * SQL Data Type: nvarchar(255)`),
});

export type ChannelTypeEntityType = z.infer<typeof ChannelTypeSchema>;

/**
 * zod schema definition for the entity Channels
 */
export const ChannelSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
    * * Description: Name of the channel`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Detailed description of the channel`),
    AccountID: z.string().nullish().describe(`
        * * Field Name: AccountID
        * * Display Name: Account ID
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Account identifier, typically an email address, unique for each channel`),
    ChannelTypeID: z.string().describe(`
        * * Field Name: ChannelTypeID
        * * Display Name: Channel Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Channel Types (vwChannelTypes.ID)
    * * Description: ID of the Channel Type reference`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
    * * Description: Indicates whether the channel is currently active`),
    CheckFrequency: z.number().nullish().describe(`
        * * Field Name: CheckFrequency
        * * Display Name: Check Frequency
        * * SQL Data Type: int
    * * Description: Interval in minutes to check the channel`),
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
    ChannelType: z.string().describe(`
        * * Field Name: ChannelType
        * * Display Name: Channel Type
        * * SQL Data Type: nvarchar(255)`),
});

export type ChannelEntityType = z.infer<typeof ChannelSchema>;

/**
 * zod schema definition for the entity Message Type Model Roles
 */
export const MessageTypeModelRoleSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullish().describe(`
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
});

export type MessageTypeModelRoleEntityType = z.infer<typeof MessageTypeModelRoleSchema>;

/**
 * zod schema definition for the entity Message Type Models
 */
export const MessageTypeModelSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
    * * Description: Name of the model relationship`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
    * * Description: Order in which models are executed; must be 1 or greater`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the model relationship`),
    AIModelID: z.string().nullish().describe(`
        * * Field Name: AIModelID
        * * Display Name: AIModel ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)
    * * Description: Foreign key linking to an AI model in __mj.AIModel table`),
    SystemPrompt: z.string().nullish().describe(`
        * * Field Name: SystemPrompt
        * * Display Name: System Prompt
        * * SQL Data Type: nvarchar(MAX)
    * * Description: System prompt for interacting with the model for a specific message type`),
    RoleID: z.string().describe(`
        * * Field Name: RoleID
        * * Display Name: Role ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Message Type Model Roles (vwMessageTypeModelRoles.ID)`),
    MessageTypeID: z.string().describe(`
        * * Field Name: MessageTypeID
        * * Display Name: Message Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Message Types (vwMessageTypes.ID)`),
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
    ForwardEmailList: z.string().nullish().describe(`
        * * Field Name: ForwardEmailList
        * * Display Name: Forward Email List
        * * SQL Data Type: nvarchar(MAX)`),
    ActionID: z.string().nullish().describe(`
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Actions (vwActions.ID)`),
    AIModel: z.string().nullish().describe(`
        * * Field Name: AIModel
        * * Display Name: AIModel
        * * SQL Data Type: nvarchar(50)`),
    Role: z.string().describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(255)`),
    MessageType: z.string().describe(`
        * * Field Name: MessageType
        * * Display Name: Message Type
        * * SQL Data Type: nvarchar(255)`),
    Action: z.string().nullish().describe(`
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)`),
});

export type MessageTypeModelEntityType = z.infer<typeof MessageTypeModelSchema>;

/**
 * zod schema definition for the entity Message Types
 */
export const MessageTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
    * * Description: Name of the message type`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Detailed human-readable description of the message type`),
    PromptDescription: z.string().describe(`
        * * Field Name: PromptDescription
        * * Display Name: Prompt Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: A prompt element for AI to use in determining a message match`),
    Examples: z.string().nullish().describe(`
        * * Field Name: Examples
        * * Display Name: Examples
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Examples of messages for this type, used in AI routing logic`),
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

export type MessageTypeEntityType = z.infer<typeof MessageTypeSchema>;
 
 

/**
 * Channel Message Types - strongly typed entity sub-class
 * * Schema: MJ_ServiceAgent
 * * Base Table: ChannelMessageType
 * * Base View: vwChannelMessageTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Channel Message Types')
export class ChannelMessageTypeEntity extends BaseEntity<ChannelMessageTypeEntityType> {
    /**
    * Loads the Channel Message Types record from the database
    * @param ID: string - primary key value to load the Channel Message Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ChannelMessageTypeEntity
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

    /**
    * * Field Name: ChannelID
    * * Display Name: Channel ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Channels (vwChannels.ID)
    * * Description: Foreign key to Channels table; links to a specific channel
    */
    get ChannelID(): string {
        return this.Get('ChannelID');
    }
    set ChannelID(value: string) {
        this.Set('ChannelID', value);
    }

    /**
    * * Field Name: MessageTypeID
    * * Display Name: Message Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Message Types (vwMessageTypes.ID)
    * * Description: Foreign key to MessageType table; links to a specific message type
    */
    get MessageTypeID(): string {
        return this.Get('MessageTypeID');
    }
    set MessageTypeID(value: string) {
        this.Set('MessageTypeID', value);
    }

    /**
    * * Field Name: IsDefault
    * * Display Name: Is Default
    * * SQL Data Type: bit
    * * Description: Indicates if this message type is the default for the linked channel
    */
    get IsDefault(): boolean {
        return this.Get('IsDefault');
    }
    set IsDefault(value: boolean) {
        this.Set('IsDefault', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Description: Indicates if the message type is currently active for the linked channel
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
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
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: Channel
    * * Display Name: Channel
    * * SQL Data Type: nvarchar(255)
    */
    get Channel(): string {
        return this.Get('Channel');
    }

    /**
    * * Field Name: MessageType
    * * Display Name: Message Type
    * * SQL Data Type: nvarchar(255)
    */
    get MessageType(): string {
        return this.Get('MessageType');
    }
}


/**
 * Channel Messages - strongly typed entity sub-class
 * * Schema: MJ_ServiceAgent
 * * Base Table: ChannelMessage
 * * Base View: vwChannelMessages
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Channel Messages')
export class ChannelMessageEntity extends BaseEntity<ChannelMessageEntityType> {
    /**
    * Loads the Channel Messages record from the database
    * @param ID: string - primary key value to load the Channel Messages record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ChannelMessageEntity
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

    /**
    * * Field Name: ChannelMessageTypeID
    * * Display Name: Channel Message Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Channel Message Types (vwChannelMessageTypes.ID)
    * * Description: Link to ChannelMessageType table identifying the type and channel of the message
    */
    get ChannelMessageTypeID(): string {
        return this.Get('ChannelMessageTypeID');
    }
    set ChannelMessageTypeID(value: string) {
        this.Set('ChannelMessageTypeID', value);
    }

    /**
    * * Field Name: ExternalSystemRecordID
    * * Display Name: External System Record ID
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Identifier for the message as provided by the communication provider; not unique globally but is indexed
    */
    get ExternalSystemRecordID(): string | null {
        return this.Get('ExternalSystemRecordID');
    }
    set ExternalSystemRecordID(value: string | null) {
        this.Set('ExternalSystemRecordID', value);
    }

    /**
    * * Field Name: ReceivedAt
    * * Display Name: Received At
    * * SQL Data Type: datetime
    * * Description: Timestamp when the message was received from the communication provider
    */
    get ReceivedAt(): Date {
        return this.Get('ReceivedAt');
    }
    set ReceivedAt(value: Date) {
        this.Set('ReceivedAt', value);
    }

    /**
    * * Field Name: MessageContent
    * * Display Name: Message Content
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Content of the message received from the end user
    */
    get MessageContent(): string {
        return this.Get('MessageContent');
    }
    set MessageContent(value: string) {
        this.Set('MessageContent', value);
    }

    /**
    * * Field Name: ResponseContent
    * * Display Name: Response Content
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Content of the response sent back to the end user
    */
    get ResponseContent(): string | null {
        return this.Get('ResponseContent');
    }
    set ResponseContent(value: string | null) {
        this.Set('ResponseContent', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(255)
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Completed
    *   * In Progress
    *   * Failed
    *   * Skipped
    * * Description: Current status of the message processing; constrained to specific values
    */
    get Status(): 'Pending' | 'Completed' | 'In Progress' | 'Failed' | 'Skipped' {
        return this.Get('Status');
    }
    set Status(value: 'Pending' | 'Completed' | 'In Progress' | 'Failed' | 'Skipped') {
        this.Set('Status', value);
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
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }
}


/**
 * Channel Types - strongly typed entity sub-class
 * * Schema: MJ_ServiceAgent
 * * Base Table: ChannelType
 * * Base View: vwChannelTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Channel Types')
export class ChannelTypeEntity extends BaseEntity<ChannelTypeEntityType> {
    /**
    * Loads the Channel Types record from the database
    * @param ID: string - primary key value to load the Channel Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ChannelTypeEntity
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

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Name of the channel type
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
    * * Description: Detailed description of the channel type
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: CommunicationProviderID
    * * Display Name: Communication Provider ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Communication Providers (vwCommunicationProviders.ID)
    * * Description: Foreign key linking to the MJ Communication Provider table
    */
    get CommunicationProviderID(): string {
        return this.Get('CommunicationProviderID');
    }
    set CommunicationProviderID(value: string) {
        this.Set('CommunicationProviderID', value);
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
    * * Field Name: CommunicationProvider
    * * Display Name: Communication Provider
    * * SQL Data Type: nvarchar(255)
    */
    get CommunicationProvider(): string {
        return this.Get('CommunicationProvider');
    }
}


/**
 * Channels - strongly typed entity sub-class
 * * Schema: MJ_ServiceAgent
 * * Base Table: Channel
 * * Base View: vwChannels
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Channels')
export class ChannelEntity extends BaseEntity<ChannelEntityType> {
    /**
    * Loads the Channels record from the database
    * @param ID: string - primary key value to load the Channels record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ChannelEntity
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

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Name of the channel
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
    * * Description: Detailed description of the channel
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: AccountID
    * * Display Name: Account ID
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Account identifier, typically an email address, unique for each channel
    */
    get AccountID(): string | null {
        return this.Get('AccountID');
    }
    set AccountID(value: string | null) {
        this.Set('AccountID', value);
    }

    /**
    * * Field Name: ChannelTypeID
    * * Display Name: Channel Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Channel Types (vwChannelTypes.ID)
    * * Description: ID of the Channel Type reference
    */
    get ChannelTypeID(): string {
        return this.Get('ChannelTypeID');
    }
    set ChannelTypeID(value: string) {
        this.Set('ChannelTypeID', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Description: Indicates whether the channel is currently active
    */
    get IsActive(): boolean {
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: CheckFrequency
    * * Display Name: Check Frequency
    * * SQL Data Type: int
    * * Description: Interval in minutes to check the channel
    */
    get CheckFrequency(): number | null {
        return this.Get('CheckFrequency');
    }
    set CheckFrequency(value: number | null) {
        this.Set('CheckFrequency', value);
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
    * * Field Name: ChannelType
    * * Display Name: Channel Type
    * * SQL Data Type: nvarchar(255)
    */
    get ChannelType(): string {
        return this.Get('ChannelType');
    }
}


/**
 * Message Type Model Roles - strongly typed entity sub-class
 * * Schema: MJ_ServiceAgent
 * * Base Table: MessageTypeModelRole
 * * Base View: vwMessageTypeModelRoles
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Message Type Model Roles')
export class MessageTypeModelRoleEntity extends BaseEntity<MessageTypeModelRoleEntityType> {
    /**
    * Loads the Message Type Model Roles record from the database
    * @param ID: string - primary key value to load the Message Type Model Roles record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof MessageTypeModelRoleEntity
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

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
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
 * Message Type Models - strongly typed entity sub-class
 * * Schema: MJ_ServiceAgent
 * * Base Table: MessageTypeModel
 * * Base View: vwMessageTypeModels
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Message Type Models')
export class MessageTypeModelEntity extends BaseEntity<MessageTypeModelEntityType> {
    /**
    * Loads the Message Type Models record from the database
    * @param ID: string - primary key value to load the Message Type Models record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof MessageTypeModelEntity
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

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Name of the model relationship
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Description: Order in which models are executed; must be 1 or greater
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the model relationship
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: AIModelID
    * * Display Name: AIModel ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)
    * * Description: Foreign key linking to an AI model in __mj.AIModel table
    */
    get AIModelID(): string | null {
        return this.Get('AIModelID');
    }
    set AIModelID(value: string | null) {
        this.Set('AIModelID', value);
    }

    /**
    * * Field Name: SystemPrompt
    * * Display Name: System Prompt
    * * SQL Data Type: nvarchar(MAX)
    * * Description: System prompt for interacting with the model for a specific message type
    */
    get SystemPrompt(): string | null {
        return this.Get('SystemPrompt');
    }
    set SystemPrompt(value: string | null) {
        this.Set('SystemPrompt', value);
    }

    /**
    * * Field Name: RoleID
    * * Display Name: Role ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Message Type Model Roles (vwMessageTypeModelRoles.ID)
    */
    get RoleID(): string {
        return this.Get('RoleID');
    }
    set RoleID(value: string) {
        this.Set('RoleID', value);
    }

    /**
    * * Field Name: MessageTypeID
    * * Display Name: Message Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Message Types (vwMessageTypes.ID)
    */
    get MessageTypeID(): string {
        return this.Get('MessageTypeID');
    }
    set MessageTypeID(value: string) {
        this.Set('MessageTypeID', value);
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
    * * Field Name: ForwardEmailList
    * * Display Name: Forward Email List
    * * SQL Data Type: nvarchar(MAX)
    */
    get ForwardEmailList(): string | null {
        return this.Get('ForwardEmailList');
    }
    set ForwardEmailList(value: string | null) {
        this.Set('ForwardEmailList', value);
    }

    /**
    * * Field Name: ActionID
    * * Display Name: Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Actions (vwActions.ID)
    */
    get ActionID(): string | null {
        return this.Get('ActionID');
    }
    set ActionID(value: string | null) {
        this.Set('ActionID', value);
    }

    /**
    * * Field Name: AIModel
    * * Display Name: AIModel
    * * SQL Data Type: nvarchar(50)
    */
    get AIModel(): string | null {
        return this.Get('AIModel');
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(255)
    */
    get Role(): string {
        return this.Get('Role');
    }

    /**
    * * Field Name: MessageType
    * * Display Name: Message Type
    * * SQL Data Type: nvarchar(255)
    */
    get MessageType(): string {
        return this.Get('MessageType');
    }

    /**
    * * Field Name: Action
    * * Display Name: Action
    * * SQL Data Type: nvarchar(425)
    */
    get Action(): string | null {
        return this.Get('Action');
    }
}


/**
 * Message Types - strongly typed entity sub-class
 * * Schema: MJ_ServiceAgent
 * * Base Table: MessageType
 * * Base View: vwMessageTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Message Types')
export class MessageTypeEntity extends BaseEntity<MessageTypeEntityType> {
    /**
    * Loads the Message Types record from the database
    * @param ID: string - primary key value to load the Message Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof MessageTypeEntity
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

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Name of the message type
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
    * * Description: Detailed human-readable description of the message type
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: PromptDescription
    * * Display Name: Prompt Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: A prompt element for AI to use in determining a message match
    */
    get PromptDescription(): string {
        return this.Get('PromptDescription');
    }
    set PromptDescription(value: string) {
        this.Set('PromptDescription', value);
    }

    /**
    * * Field Name: Examples
    * * Display Name: Examples
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Examples of messages for this type, used in AI routing logic
    */
    get Examples(): string | null {
        return this.Get('Examples');
    }
    set Examples(value: string | null) {
        this.Set('Examples', value);
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
