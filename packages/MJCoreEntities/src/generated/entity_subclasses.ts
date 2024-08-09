import { BaseEntity, EntitySaveOptions, CompositeKey } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";
     
        
/**
 * zod schema definition for the entity Action Authorizations
 */
export const ActionAuthorizationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ActionID: z.string().describe(`
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Actions (vwActions.ID)`),
    AuthorizationID: z.string().describe(`
        * * Field Name: AuthorizationID
        * * Display Name: Authorization ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Authorizations (vwAuthorizations.ID)`),
    Comments: z.string().nullish().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
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
    Action: z.string().describe(`
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)`),
    Authorization: z.string().describe(`
        * * Field Name: Authorization
        * * Display Name: Authorization
        * * SQL Data Type: nvarchar(100)`),
});

export type ActionAuthorizationEntityType = z.infer<typeof ActionAuthorizationSchema>;
       
/**
 * zod schema definition for the entity Action Categories
 */
export const ActionCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
    * * Description: Name of the action category.`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the action category.`),
    ParentID: z.string().nullish().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Action Categories (vwActionCategories.ID)`),
    Status: z.union([z.literal('Disabled'), z.literal('Active'), z.literal('Pending')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Disabled
    *   * Active
    *   * Pending
    * * Description: Status of the action category (Pending, Active, Disabled).`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Parent: z.string().nullish().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(255)`),
});

export type ActionCategoryEntityType = z.infer<typeof ActionCategorySchema>;
       
/**
 * zod schema definition for the entity Action Context Types
 */
export const ActionContextTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
    * * Description: Name of the context type.`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the context type.`),
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

export type ActionContextTypeEntityType = z.infer<typeof ActionContextTypeSchema>;
       
/**
 * zod schema definition for the entity Action Contexts
 */
export const ActionContextSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ActionID: z.string().describe(`
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Actions (vwActions.ID)`),
    ContextTypeID: z.string().nullish().describe(`
        * * Field Name: ContextTypeID
        * * Display Name: Context Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Action Context Types (vwActionContextTypes.ID)`),
    Status: z.union([z.literal('Disabled'), z.literal('Active'), z.literal('Pending')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Disabled
    *   * Active
    *   * Pending
    * * Description: Status of the action context (Pending, Active, Disabled).`),
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
    Action: z.string().describe(`
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)`),
    ContextType: z.string().nullish().describe(`
        * * Field Name: ContextType
        * * Display Name: Context Type
        * * SQL Data Type: nvarchar(255)`),
});

export type ActionContextEntityType = z.infer<typeof ActionContextSchema>;
       
/**
 * zod schema definition for the entity Action Execution Logs
 */
export const ActionExecutionLogSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ActionID: z.string().describe(`
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Actions (vwActions.ID)`),
    StartedAt: z.date().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime
        * * Default Value: getdate()
    * * Description: Timestamp of when the action started execution.`),
    EndedAt: z.date().nullish().describe(`
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime
    * * Description: Timestamp of when the action ended execution.`),
    Params: z.string().nullish().describe(`
        * * Field Name: Params
        * * Display Name: Params
        * * SQL Data Type: nvarchar(MAX)`),
    ResultCode: z.string().nullish().describe(`
        * * Field Name: ResultCode
        * * Display Name: Result Code
        * * SQL Data Type: nvarchar(255)`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    RetentionPeriod: z.number().nullish().describe(`
        * * Field Name: RetentionPeriod
        * * Display Name: Retention Period
        * * SQL Data Type: int
    * * Description: Number of days to retain the log; NULL for indefinite retention.`),
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
    Action: z.string().describe(`
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
});

export type ActionExecutionLogEntityType = z.infer<typeof ActionExecutionLogSchema>;
       
/**
 * zod schema definition for the entity Action Filters
 */
export const ActionFilterSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    UserDescription: z.string().describe(`
        * * Field Name: UserDescription
        * * Display Name: User Description
        * * SQL Data Type: nvarchar(MAX)`),
    UserComments: z.string().nullish().describe(`
        * * Field Name: UserComments
        * * Display Name: User Comments
        * * SQL Data Type: nvarchar(MAX)`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(MAX)`),
    CodeExplanation: z.string().nullish().describe(`
        * * Field Name: CodeExplanation
        * * Display Name: Code Explanation
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ActionFilterEntityType = z.infer<typeof ActionFilterSchema>;
       
/**
 * zod schema definition for the entity Action Libraries
 */
export const ActionLibrarySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ActionID: z.string().describe(`
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Actions (vwActions.ID)`),
    LibraryID: z.string().describe(`
        * * Field Name: LibraryID
        * * Display Name: Library ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Libraries (vwLibraries.ID)`),
    ItemsUsed: z.string().nullish().describe(`
        * * Field Name: ItemsUsed
        * * Display Name: Items Used
        * * SQL Data Type: nvarchar(MAX)
    * * Description: List of classes and functions used by the action from the library.`),
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
    Action: z.string().describe(`
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)`),
    Library: z.string().describe(`
        * * Field Name: Library
        * * Display Name: Library
        * * SQL Data Type: nvarchar(255)`),
});

export type ActionLibraryEntityType = z.infer<typeof ActionLibrarySchema>;
       
/**
 * zod schema definition for the entity Action Params
 */
export const ActionParamSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ActionID: z.string().describe(`
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Actions (vwActions.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    DefaultValue: z.string().nullish().describe(`
        * * Field Name: DefaultValue
        * * Display Name: Default Value
        * * SQL Data Type: nvarchar(MAX)`),
    Type: z.union([z.literal('Input'), z.literal('Output'), z.literal('Both')]).describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nchar(10)
    * * Value List Type: List
    * * Possible Values 
    *   * Input
    *   * Output
    *   * Both`),
    ValueType: z.union([z.literal('Scalar'), z.literal('Simple Object'), z.literal('BaseEntity Sub-Class'), z.literal('Other')]).describe(`
        * * Field Name: ValueType
        * * Display Name: Value Type
        * * SQL Data Type: nvarchar(30)
    * * Value List Type: List
    * * Possible Values 
    *   * Scalar
    *   * Simple Object
    *   * BaseEntity Sub-Class
    *   * Other
    * * Description: Tracks the basic value type of the parameter, additional information can be provided in the Description field`),
    IsArray: z.boolean().describe(`
        * * Field Name: IsArray
        * * Display Name: Is Array
        * * SQL Data Type: bit
        * * Default Value: 0`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    IsRequired: z.boolean().describe(`
        * * Field Name: IsRequired
        * * Display Name: Is Required
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
    Action: z.string().describe(`
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)`),
});

export type ActionParamEntityType = z.infer<typeof ActionParamSchema>;
       
/**
 * zod schema definition for the entity Action Result Codes
 */
export const ActionResultCodeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ActionID: z.string().describe(`
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Actions (vwActions.ID)`),
    ResultCode: z.string().describe(`
        * * Field Name: ResultCode
        * * Display Name: Result Code
        * * SQL Data Type: nvarchar(255)`),
    IsSuccess: z.boolean().describe(`
        * * Field Name: IsSuccess
        * * Display Name: Is Success
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: Indicates if the result code is a success or not. It is possible an action might have more than one failure condition/result code and same for success conditions.`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the result code.`),
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
    Action: z.string().describe(`
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)`),
});

export type ActionResultCodeEntityType = z.infer<typeof ActionResultCodeSchema>;
       
/**
 * zod schema definition for the entity Actions
 */
export const ActionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CategoryID: z.string().nullish().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Action Categories (vwActionCategories.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(425)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Type: z.union([z.literal('Generated'), z.literal('Custom')]).describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Generated
    * * Value List Type: List
    * * Possible Values 
    *   * Generated
    *   * Custom
    * * Description: Generated or Custom. Generated means the UserPrompt is used to prompt an AI model to automatically create the code for the Action. Custom means that a custom class has been implemented that subclasses the BaseAction class. The custom class needs to use the @RegisterClass decorator and be included in the MJAPI (or other runtime environment) to be available for execution.`),
    UserPrompt: z.string().nullish().describe(`
        * * Field Name: UserPrompt
        * * Display Name: User Prompt
        * * SQL Data Type: nvarchar(MAX)`),
    UserComments: z.string().nullish().describe(`
        * * Field Name: UserComments
        * * Display Name: User Comments
        * * SQL Data Type: nvarchar(MAX)
    * * Description: User's comments not shared with the LLM.`),
    Code: z.string().nullish().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(MAX)`),
    CodeComments: z.string().nullish().describe(`
        * * Field Name: CodeComments
        * * Display Name: Code Comments
        * * SQL Data Type: nvarchar(MAX)
    * * Description: AI's explanation of the code.`),
    CodeApprovalStatus: z.union([z.literal('Rejected'), z.literal('Approved'), z.literal('Pending')]).describe(`
        * * Field Name: CodeApprovalStatus
        * * Display Name: Code Approval Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Rejected
    *   * Approved
    *   * Pending
    * * Description: An action won't be usable until the code is approved.`),
    CodeApprovalComments: z.string().nullish().describe(`
        * * Field Name: CodeApprovalComments
        * * Display Name: Code Approval Comments
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Optional comments when an individual (or an AI) reviews and approves the code.`),
    CodeApprovedByUserID: z.string().nullish().describe(`
        * * Field Name: CodeApprovedByUserID
        * * Display Name: Code Approved By User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    CodeApprovedAt: z.date().nullish().describe(`
        * * Field Name: CodeApprovedAt
        * * Display Name: Code Approved At
        * * SQL Data Type: datetime
    * * Description: When the code was approved.`),
    CodeLocked: z.boolean().describe(`
        * * Field Name: CodeLocked
        * * Display Name: Code Locked
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: If set to 1, Code will never be generated by the AI system. This overrides all other settings including the ForceCodeGeneration bit`),
    ForceCodeGeneration: z.boolean().describe(`
        * * Field Name: ForceCodeGeneration
        * * Display Name: Force Code Generation
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: If set to 1, the Action will generate code for the provided UserPrompt on the next Save even if the UserPrompt hasn't changed. This is useful to force regeneration when other candidates (such as a change in Action Inputs/Outputs) occurs or on demand by a user.`),
    RetentionPeriod: z.number().nullish().describe(`
        * * Field Name: RetentionPeriod
        * * Display Name: Retention Period
        * * SQL Data Type: int
    * * Description: Number of days to retain execution logs; NULL for indefinite.`),
    Status: z.union([z.literal('Disabled'), z.literal('Active'), z.literal('Pending')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Disabled
    *   * Active
    *   * Pending
    * * Description: Status of the action (Pending, Active, Disabled).`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Category: z.string().nullish().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(255)`),
    CodeApprovedByUser: z.string().nullish().describe(`
        * * Field Name: CodeApprovedByUser
        * * Display Name: Code Approved By User
        * * SQL Data Type: nvarchar(100)`),
});

export type ActionEntityType = z.infer<typeof ActionSchema>;
       
/**
 * zod schema definition for the entity AI Actions
 */
export const AIActionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    DefaultPrompt: z.string().nullish().describe(`
        * * Field Name: DefaultPrompt
        * * Display Name: Default Prompt
        * * SQL Data Type: nvarchar(MAX)`),
    DefaultModelID: z.string().nullish().describe(`
        * * Field Name: DefaultModelID
        * * Display Name: Default Model ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)`),
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
    DefaultModel: z.string().nullish().describe(`
        * * Field Name: DefaultModel
        * * Display Name: Default Model
        * * SQL Data Type: nvarchar(50)`),
});

export type AIActionEntityType = z.infer<typeof AIActionSchema>;
       
/**
 * zod schema definition for the entity AI Model Actions
 */
export const AIModelActionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    AIModelID: z.string().describe(`
        * * Field Name: AIModelID
        * * Display Name: AI Model ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)`),
    AIActionID: z.string().describe(`
        * * Field Name: AIActionID
        * * Display Name: AI Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: AI Actions (vwAIActions.ID)`),
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
    AIModel: z.string().describe(`
        * * Field Name: AIModel
        * * Display Name: AIModel
        * * SQL Data Type: nvarchar(50)`),
    AIAction: z.string().describe(`
        * * Field Name: AIAction
        * * Display Name: AIAction
        * * SQL Data Type: nvarchar(50)`),
});

export type AIModelActionEntityType = z.infer<typeof AIModelActionSchema>;
       
/**
 * zod schema definition for the entity AI Model Types
 */
export const AIModelTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)`),
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

export type AIModelTypeEntityType = z.infer<typeof AIModelTypeSchema>;
       
/**
 * zod schema definition for the entity AI Models
 */
export const AIModelSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Vendor: z.string().nullish().describe(`
        * * Field Name: Vendor
        * * Display Name: Vendor
        * * SQL Data Type: nvarchar(50)`),
    AIModelTypeID: z.string().describe(`
        * * Field Name: AIModelTypeID
        * * Display Name: AI Model Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: AI Model Types (vwAIModelTypes.ID)`),
    PowerRank: z.number().nullish().describe(`
        * * Field Name: PowerRank
        * * Display Name: Power Rank
        * * SQL Data Type: int
        * * Default Value: 0
    * * Description: Optional column that ranks the power of the AI model. Default is 0 and should be non-negative.`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    DriverClass: z.string().nullish().describe(`
        * * Field Name: DriverClass
        * * Display Name: Driver Class
        * * SQL Data Type: nvarchar(100)`),
    DriverImportPath: z.string().nullish().describe(`
        * * Field Name: DriverImportPath
        * * Display Name: Driver Import Path
        * * SQL Data Type: nvarchar(255)`),
    APIName: z.string().nullish().describe(`
        * * Field Name: APIName
        * * Display Name: APIName
        * * SQL Data Type: nvarchar(100)
    * * Description: The name of the model to use with API calls which might differ from the Name, if APIName is not provided, Name will be used for API calls`),
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
    SpeedRank: z.number().nullish().describe(`
        * * Field Name: SpeedRank
        * * Display Name: Speed Rank
        * * SQL Data Type: int
        * * Default Value: 0
    * * Description: Optional column that ranks the speed of the AI model. Default is 0 and should be non-negative.`),
    CostRank: z.number().nullish().describe(`
        * * Field Name: CostRank
        * * Display Name: Cost Rank
        * * SQL Data Type: int
        * * Default Value: 0
    * * Description: Optional column that ranks the cost of the AI model. Default is 0 and should be non-negative.`),
    AIModelType: z.string().describe(`
        * * Field Name: AIModelType
        * * Display Name: AIModel Type
        * * SQL Data Type: nvarchar(50)`),
});

export type AIModelEntityType = z.infer<typeof AIModelSchema>;
       
/**
 * zod schema definition for the entity Application Entities
 */
export const ApplicationEntitySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ApplicationID: z.string().describe(`
        * * Field Name: ApplicationID
        * * Display Name: Application ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Applications (vwApplications.ID)`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * SQL Data Type: int`),
    DefaultForNewUser: z.boolean().describe(`
        * * Field Name: DefaultForNewUser
        * * Display Name: Default For New User
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: When set to 1, the entity will be included by default for a new user when they first access the application in question`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Application: z.string().describe(`
        * * Field Name: Application
        * * SQL Data Type: nvarchar(100)`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    EntityBaseTable: z.string().describe(`
        * * Field Name: EntityBaseTable
        * * Display Name: Entity Base Table
        * * SQL Data Type: nvarchar(255)`),
    EntityCodeName: z.string().nullish().describe(`
        * * Field Name: EntityCodeName
        * * Display Name: Entity Code Name
        * * SQL Data Type: nvarchar(MAX)`),
    EntityClassName: z.string().nullish().describe(`
        * * Field Name: EntityClassName
        * * Display Name: Entity Class Name
        * * SQL Data Type: nvarchar(MAX)`),
    EntityBaseTableCodeName: z.string().nullish().describe(`
        * * Field Name: EntityBaseTableCodeName
        * * Display Name: Entity Base Table Code Name
        * * SQL Data Type: nvarchar(MAX)`),
});

export type ApplicationEntityEntityType = z.infer<typeof ApplicationEntitySchema>;
       
/**
 * zod schema definition for the entity Application Settings
 */
export const ApplicationSettingSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ApplicationID: z.string().describe(`
        * * Field Name: ApplicationID
        * * Display Name: Application ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Applications (vwApplications.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Value: z.string().describe(`
        * * Field Name: Value
        * * Display Name: Value
        * * SQL Data Type: nvarchar(MAX)`),
    Comments: z.string().nullish().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Application: z.string().describe(`
        * * Field Name: Application
        * * Display Name: Application
        * * SQL Data Type: nvarchar(100)`),
});

export type ApplicationSettingEntityType = z.infer<typeof ApplicationSettingSchema>;
       
/**
 * zod schema definition for the entity Applications
 */
export const ApplicationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Icon: z.string().nullish().describe(`
        * * Field Name: Icon
        * * Display Name: Icon
        * * SQL Data Type: nvarchar(500)
    * * Description: Specify the CSS class information for the display icon for each application.`),
    DefaultForNewUser: z.boolean().describe(`
        * * Field Name: DefaultForNewUser
        * * Display Name: Default For New User
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: If turned on, when a new user first uses the MJ Explorer app, the application records with this turned on will have this application included in their selected application list.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type ApplicationEntityType = z.infer<typeof ApplicationSchema>;
       
/**
 * zod schema definition for the entity Audit Log Types
 */
export const AuditLogTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    ParentID: z.string().nullish().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Audit Log Types (vwAuditLogTypes.ID)`),
    AuthorizationID: z.string().nullish().describe(`
        * * Field Name: AuthorizationID
        * * Display Name: Authorization ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Authorizations (vwAuthorizations.ID)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Parent: z.string().nullish().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(50)`),
    Authorization: z.string().nullish().describe(`
        * * Field Name: Authorization
        * * Display Name: Authorization
        * * SQL Data Type: nvarchar(100)`),
});

export type AuditLogTypeEntityType = z.infer<typeof AuditLogTypeSchema>;
       
/**
 * zod schema definition for the entity Audit Logs
 */
export const AuditLogSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    AuditLogTypeID: z.string().describe(`
        * * Field Name: AuditLogTypeID
        * * Display Name: Audit Log Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Audit Log Types (vwAuditLogTypes.ID)`),
    AuthorizationID: z.string().nullish().describe(`
        * * Field Name: AuthorizationID
        * * Display Name: Authorization ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Authorizations (vwAuthorizations.ID)`),
    Status: z.union([z.literal('Success'), z.literal('Failed')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Allow
    * * Value List Type: List
    * * Possible Values 
    *   * Success
    *   * Failed`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Details: z.string().nullish().describe(`
        * * Field Name: Details
        * * Display Name: Details
        * * SQL Data Type: nvarchar(MAX)`),
    EntityID: z.string().nullish().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    RecordID: z.string().nullish().describe(`
        * * Field Name: RecordID
        * * Display Name: Record
        * * SQL Data Type: nvarchar(450)`),
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
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
    AuditLogType: z.string().describe(`
        * * Field Name: AuditLogType
        * * Display Name: Audit Log Type
        * * SQL Data Type: nvarchar(50)`),
    Authorization: z.string().nullish().describe(`
        * * Field Name: Authorization
        * * Display Name: Authorization
        * * SQL Data Type: nvarchar(100)`),
    Entity: z.string().nullish().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type AuditLogEntityType = z.infer<typeof AuditLogSchema>;
       
/**
 * zod schema definition for the entity Authorization Roles
 */
export const AuthorizationRoleSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    AuthorizationID: z.string().describe(`
        * * Field Name: AuthorizationID
        * * Display Name: Authorization ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Authorizations (vwAuthorizations.ID)`),
    RoleID: z.string().describe(`
        * * Field Name: RoleID
        * * Display Name: Role ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Roles (vwRoles.ID)`),
    Type: z.union([z.literal('Allow'), z.literal('Deny')]).describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nchar(10)
        * * Default Value: grant
    * * Value List Type: List
    * * Possible Values 
    *   * Allow - User allowed to execute tasks linked to this authorization
    *   * Deny - User NOT allowed to execute tasks linked to this authorization - deny overrides Allow from all other roles a user may be part of`),
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
    Authorization: z.string().describe(`
        * * Field Name: Authorization
        * * Display Name: Authorization
        * * SQL Data Type: nvarchar(100)`),
    Role: z.string().describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(50)`),
});

export type AuthorizationRoleEntityType = z.infer<typeof AuthorizationRoleSchema>;
       
/**
 * zod schema definition for the entity Authorizations
 */
export const AuthorizationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ParentID: z.string().nullish().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Authorizations (vwAuthorizations.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    UseAuditLog: z.boolean().describe(`
        * * Field Name: UseAuditLog
        * * Display Name: Use Audit Log
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: When set to 1, Audit Log records are created whenever this authorization is invoked for a user`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Parent: z.string().nullish().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(100)`),
});

export type AuthorizationEntityType = z.infer<typeof AuthorizationSchema>;
       
/**
 * zod schema definition for the entity Communication Base Message Types
 */
export const CommunicationBaseMessageTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Type: z.string().describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(100)`),
    SupportsAttachments: z.boolean().describe(`
        * * Field Name: SupportsAttachments
        * * Display Name: Supports Attachments
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: Indicates if attachments are supported.`),
    SupportsSubjectLine: z.boolean().describe(`
        * * Field Name: SupportsSubjectLine
        * * Display Name: Supports Subject Line
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: Indicates if a subject line is supported.`),
    SupportsHtml: z.boolean().describe(`
        * * Field Name: SupportsHtml
        * * Display Name: Supports Html
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: Indicates if HTML content is supported.`),
    MaxBytes: z.number().nullish().describe(`
        * * Field Name: MaxBytes
        * * Display Name: Max Bytes
        * * SQL Data Type: int
    * * Description: The maximum size in bytes for the message.`),
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

export type CommunicationBaseMessageTypeEntityType = z.infer<typeof CommunicationBaseMessageTypeSchema>;
       
/**
 * zod schema definition for the entity Communication Logs
 */
export const CommunicationLogSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CommunicationProviderID: z.string().describe(`
        * * Field Name: CommunicationProviderID
        * * Display Name: Communication Provider ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Communication Providers (vwCommunicationProviders.ID)`),
    CommunicationProviderMessageTypeID: z.string().describe(`
        * * Field Name: CommunicationProviderMessageTypeID
        * * Display Name: Communication Provider Message Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Communication Provider Message Types (vwCommunicationProviderMessageTypes.ID)`),
    CommunicationRunID: z.string().nullish().describe(`
        * * Field Name: CommunicationRunID
        * * Display Name: Communication Run ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Communication Runs (vwCommunicationRuns.ID)`),
    Direction: z.union([z.literal('Sending'), z.literal('Receiving')]).describe(`
        * * Field Name: Direction
        * * Display Name: Direction
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Sending
    *   * Receiving
    * * Description: The direction of the communication log (Sending or Receiving).`),
    MessageDate: z.date().describe(`
        * * Field Name: MessageDate
        * * Display Name: Message Date
        * * SQL Data Type: datetime
    * * Description: The date and time when the message was logged.`),
    Status: z.union([z.literal('Pending'), z.literal('In-Progress'), z.literal('Complete'), z.literal('Failed')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * In-Progress
    *   * Complete
    *   * Failed
    * * Description: The status of the logged message (Pending, In-Progress, Complete, Failed).`),
    MessageContent: z.string().nullish().describe(`
        * * Field Name: MessageContent
        * * Display Name: Message Content
        * * SQL Data Type: nvarchar(MAX)
    * * Description: The content of the logged message.`),
    ErrorMessage: z.string().nullish().describe(`
        * * Field Name: ErrorMessage
        * * Display Name: Error Message
        * * SQL Data Type: nvarchar(MAX)
    * * Description: The error message if the message sending failed.`),
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
    CommunicationProviderMessageType: z.string().describe(`
        * * Field Name: CommunicationProviderMessageType
        * * Display Name: Communication Provider Message Type
        * * SQL Data Type: nvarchar(255)`),
});

export type CommunicationLogEntityType = z.infer<typeof CommunicationLogSchema>;
       
/**
 * zod schema definition for the entity Communication Provider Message Types
 */
export const CommunicationProviderMessageTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CommunicationProviderID: z.string().describe(`
        * * Field Name: CommunicationProviderID
        * * Display Name: Communication Provider ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Communication Providers (vwCommunicationProviders.ID)`),
    CommunicationBaseMessageTypeID: z.string().describe(`
        * * Field Name: CommunicationBaseMessageTypeID
        * * Display Name: Communication Base Message Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Communication Base Message Types (vwCommunicationBaseMessageTypes.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Status: z.union([z.literal('Disabled'), z.literal('Active')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Disabled
    * * Value List Type: List
    * * Possible Values 
    *   * Disabled
    *   * Active
    * * Description: The status of the provider message type (Disabled or Active).`),
    AdditionalAttributes: z.string().nullish().describe(`
        * * Field Name: AdditionalAttributes
        * * Display Name: Additional Attributes
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Additional attributes specific to the provider message type.`),
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
    CommunicationBaseMessageType: z.string().describe(`
        * * Field Name: CommunicationBaseMessageType
        * * Display Name: Communication Base Message Type
        * * SQL Data Type: nvarchar(100)`),
});

export type CommunicationProviderMessageTypeEntityType = z.infer<typeof CommunicationProviderMessageTypeSchema>;
       
/**
 * zod schema definition for the entity Communication Providers
 */
export const CommunicationProviderSchema = z.object({
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
    Status: z.union([z.literal('Disabled'), z.literal('Active')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Disabled
    * * Value List Type: List
    * * Possible Values 
    *   * Disabled
    *   * Active
    * * Description: The status of the communication provider (Disabled or Active).`),
    SupportsSending: z.boolean().describe(`
        * * Field Name: SupportsSending
        * * Display Name: Supports Sending
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: Indicates if the provider supports sending messages.`),
    SupportsReceiving: z.boolean().describe(`
        * * Field Name: SupportsReceiving
        * * Display Name: Supports Receiving
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: Indicates if the provider supports receiving messages.`),
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

export type CommunicationProviderEntityType = z.infer<typeof CommunicationProviderSchema>;
       
/**
 * zod schema definition for the entity Communication Runs
 */
export const CommunicationRunSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    Direction: z.union([z.literal('Sending'), z.literal('Receiving')]).describe(`
        * * Field Name: Direction
        * * Display Name: Direction
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Sending
    *   * Receiving
    * * Description: The direction of the communication run (Sending or Receiving).`),
    Status: z.union([z.literal('Pending'), z.literal('In-Progress'), z.literal('Complete'), z.literal('Failed')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * In-Progress
    *   * Complete
    *   * Failed
    * * Description: The status of the communication run (Pending, In-Progress, Complete, Failed).`),
    StartedAt: z.date().nullish().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime`),
    EndedAt: z.date().nullish().describe(`
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime`),
    Comments: z.string().nullish().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)`),
    ErrorMessage: z.string().nullish().describe(`
        * * Field Name: ErrorMessage
        * * Display Name: Error Message
        * * SQL Data Type: nvarchar(MAX)
    * * Description: The error message if the communication run failed.`),
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
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
});

export type CommunicationRunEntityType = z.infer<typeof CommunicationRunSchema>;
       
/**
 * zod schema definition for the entity Companies
 */
export const CompanySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * SQL Data Type: nvarchar(50)`),
    Description: z.string().describe(`
        * * Field Name: Description
        * * SQL Data Type: nvarchar(200)`),
    Website: z.string().nullish().describe(`
        * * Field Name: Website
        * * SQL Data Type: nvarchar(100)`),
    LogoURL: z.string().nullish().describe(`
        * * Field Name: LogoURL
        * * Display Name: Logo URL
        * * SQL Data Type: nvarchar(500)`),
    Domain: z.string().nullish().describe(`
        * * Field Name: Domain
        * * Display Name: Domain
        * * SQL Data Type: nvarchar(255)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type CompanyEntityType = z.infer<typeof CompanySchema>;
       
/**
 * zod schema definition for the entity Company Integration Record Maps
 */
export const CompanyIntegrationRecordMapSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CompanyIntegrationID: z.string().describe(`
        * * Field Name: CompanyIntegrationID
        * * Display Name: Company Integration ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Company Integrations (vwCompanyIntegrations.ID)`),
    ExternalSystemRecordID: z.string().describe(`
        * * Field Name: ExternalSystemRecordID
        * * Display Name: External System Record ID
        * * SQL Data Type: nvarchar(750)`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    EntityRecordID: z.string().describe(`
        * * Field Name: EntityRecordID
        * * Display Name: Entity Record ID
        * * SQL Data Type: nvarchar(750)`),
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
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type CompanyIntegrationRecordMapEntityType = z.infer<typeof CompanyIntegrationRecordMapSchema>;
       
/**
 * zod schema definition for the entity Company Integration Run API Logs
 */
export const CompanyIntegrationRunAPILogSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CompanyIntegrationRunID: z.string().describe(`
        * * Field Name: CompanyIntegrationRunID
        * * Display Name: Company Integration Run ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Company Integration Runs (vwCompanyIntegrationRuns.ID)`),
    ExecutedAt: z.date().describe(`
        * * Field Name: ExecutedAt
        * * Display Name: Executed At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    IsSuccess: z.boolean().describe(`
        * * Field Name: IsSuccess
        * * Display Name: Is Success
        * * SQL Data Type: bit
        * * Default Value: 0`),
    RequestMethod: z.union([z.literal('GET'), z.literal('POST'), z.literal('PUT'), z.literal('DELETE'), z.literal('PATCH'), z.literal('HEAD'), z.literal('OPTIONS')]).nullish().describe(`
        * * Field Name: RequestMethod
        * * Display Name: Request Method
        * * SQL Data Type: nvarchar(12)
    * * Value List Type: List
    * * Possible Values 
    *   * GET
    *   * POST
    *   * PUT
    *   * DELETE
    *   * PATCH
    *   * HEAD
    *   * OPTIONS`),
    URL: z.string().nullish().describe(`
        * * Field Name: URL
        * * SQL Data Type: nvarchar(MAX)`),
    Parameters: z.string().nullish().describe(`
        * * Field Name: Parameters
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

export type CompanyIntegrationRunAPILogEntityType = z.infer<typeof CompanyIntegrationRunAPILogSchema>;
       
/**
 * zod schema definition for the entity Company Integration Run Details
 */
export const CompanyIntegrationRunDetailSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CompanyIntegrationRunID: z.string().describe(`
        * * Field Name: CompanyIntegrationRunID
        * * Display Name: CompanyIntegrationRun ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Company Integration Runs (vwCompanyIntegrationRuns.ID)`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    RecordID: z.string().describe(`
        * * Field Name: RecordID
        * * Display Name: Record
        * * SQL Data Type: nvarchar(450)`),
    Action: z.string().describe(`
        * * Field Name: Action
        * * SQL Data Type: nchar(20)`),
    ExecutedAt: z.date().describe(`
        * * Field Name: ExecutedAt
        * * Display Name: Executed At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    IsSuccess: z.boolean().describe(`
        * * Field Name: IsSuccess
        * * Display Name: Is Success
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
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    RunStartedAt: z.date().nullish().describe(`
        * * Field Name: RunStartedAt
        * * Display Name: Run Started At
        * * SQL Data Type: datetime`),
    RunEndedAt: z.date().nullish().describe(`
        * * Field Name: RunEndedAt
        * * Display Name: Run Ended At
        * * SQL Data Type: datetime`),
});

export type CompanyIntegrationRunDetailEntityType = z.infer<typeof CompanyIntegrationRunDetailSchema>;
       
/**
 * zod schema definition for the entity Company Integration Runs
 */
export const CompanyIntegrationRunSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CompanyIntegrationID: z.string().describe(`
        * * Field Name: CompanyIntegrationID
        * * Display Name: CompanyIntegration ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Company Integrations (vwCompanyIntegrations.ID)`),
    RunByUserID: z.string().describe(`
        * * Field Name: RunByUserID
        * * Display Name: RunByUser ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    StartedAt: z.date().nullish().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime`),
    EndedAt: z.date().nullish().describe(`
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime`),
    TotalRecords: z.number().describe(`
        * * Field Name: TotalRecords
        * * Display Name: Total Records
        * * SQL Data Type: int`),
    Comments: z.string().nullish().describe(`
        * * Field Name: Comments
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
    RunByUser: z.string().describe(`
        * * Field Name: RunByUser
        * * Display Name: Run By User
        * * SQL Data Type: nvarchar(100)`),
});

export type CompanyIntegrationRunEntityType = z.infer<typeof CompanyIntegrationRunSchema>;
       
/**
 * zod schema definition for the entity Company Integrations
 */
export const CompanyIntegrationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CompanyID: z.string().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Companies (vwCompanies.ID)`),
    IntegrationID: z.string().describe(`
        * * Field Name: IntegrationID
        * * Display Name: Integration ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Integrations (vwIntegrations.ID)`),
    IsActive: z.boolean().nullish().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit`),
    AccessToken: z.string().nullish().describe(`
        * * Field Name: AccessToken
        * * Display Name: Access Token
        * * SQL Data Type: nvarchar(255)`),
    RefreshToken: z.string().nullish().describe(`
        * * Field Name: RefreshToken
        * * Display Name: Refresh Token
        * * SQL Data Type: nvarchar(255)`),
    TokenExpirationDate: z.date().nullish().describe(`
        * * Field Name: TokenExpirationDate
        * * Display Name: Token Expiration Date
        * * SQL Data Type: datetime`),
    APIKey: z.string().nullish().describe(`
        * * Field Name: APIKey
        * * SQL Data Type: nvarchar(255)`),
    ExternalSystemID: z.string().nullish().describe(`
        * * Field Name: ExternalSystemID
        * * Display Name: ExternalSystem
        * * SQL Data Type: nvarchar(100)`),
    IsExternalSystemReadOnly: z.boolean().describe(`
        * * Field Name: IsExternalSystemReadOnly
        * * Display Name: Is External System Read Only
        * * SQL Data Type: bit
        * * Default Value: 0`),
    ClientID: z.string().nullish().describe(`
        * * Field Name: ClientID
        * * Display Name: Client
        * * SQL Data Type: nvarchar(255)`),
    ClientSecret: z.string().nullish().describe(`
        * * Field Name: ClientSecret
        * * Display Name: Client Secret
        * * SQL Data Type: nvarchar(255)`),
    CustomAttribute1: z.string().nullish().describe(`
        * * Field Name: CustomAttribute1
        * * Display Name: Custom Attribute 1
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
    Company: z.string().describe(`
        * * Field Name: Company
        * * SQL Data Type: nvarchar(50)`),
    Integration: z.string().describe(`
        * * Field Name: Integration
        * * SQL Data Type: nvarchar(100)`),
    DriverClassName: z.string().nullish().describe(`
        * * Field Name: DriverClassName
        * * Display Name: Driver Class Name
        * * SQL Data Type: nvarchar(100)`),
    DriverImportPath: z.string().nullish().describe(`
        * * Field Name: DriverImportPath
        * * Display Name: Driver Import Path
        * * SQL Data Type: nvarchar(100)`),
    LastRunID: z.string().nullish().describe(`
        * * Field Name: LastRunID
        * * Display Name: LastRun
        * * SQL Data Type: uniqueidentifier`),
    LastRunStartedAt: z.date().nullish().describe(`
        * * Field Name: LastRunStartedAt
        * * Display Name: Last Run Started At
        * * SQL Data Type: datetime`),
    LastRunEndedAt: z.date().nullish().describe(`
        * * Field Name: LastRunEndedAt
        * * Display Name: Last Run Ended At
        * * SQL Data Type: datetime`),
});

export type CompanyIntegrationEntityType = z.infer<typeof CompanyIntegrationSchema>;
       
/**
 * zod schema definition for the entity Conversation Details
 */
export const ConversationDetailSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ConversationID: z.string().describe(`
        * * Field Name: ConversationID
        * * Display Name: Conversation ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Conversations (vwConversations.ID)`),
    ExternalID: z.string().nullish().describe(`
        * * Field Name: ExternalID
        * * Display Name: External ID
        * * SQL Data Type: nvarchar(100)`),
    Role: z.union([z.literal('User'), z.literal('AI'), z.literal('Error')]).describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(20)
        * * Default Value: user_name()
    * * Value List Type: List
    * * Possible Values 
    *   * User
    *   * AI
    *   * Error`),
    Message: z.string().describe(`
        * * Field Name: Message
        * * Display Name: Message
        * * SQL Data Type: nvarchar(MAX)`),
    Error: z.string().nullish().describe(`
        * * Field Name: Error
        * * Display Name: Error
        * * SQL Data Type: nvarchar(MAX)`),
    HiddenToUser: z.boolean().describe(`
        * * Field Name: HiddenToUser
        * * Display Name: Hidden To User
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
    Conversation: z.string().nullish().describe(`
        * * Field Name: Conversation
        * * Display Name: Conversation
        * * SQL Data Type: nvarchar(255)`),
});

export type ConversationDetailEntityType = z.infer<typeof ConversationDetailSchema>;
       
/**
 * zod schema definition for the entity Conversations
 */
export const ConversationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    ExternalID: z.string().nullish().describe(`
        * * Field Name: ExternalID
        * * Display Name: External ID
        * * SQL Data Type: nvarchar(500)`),
    Name: z.string().nullish().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Type: z.string().describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Skip`),
    IsArchived: z.boolean().describe(`
        * * Field Name: IsArchived
        * * Display Name: Is Archived
        * * SQL Data Type: bit
        * * Default Value: 0`),
    LinkedEntityID: z.string().nullish().describe(`
        * * Field Name: LinkedEntityID
        * * Display Name: Linked Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    LinkedRecordID: z.string().nullish().describe(`
        * * Field Name: LinkedRecordID
        * * Display Name: Linked Record ID
        * * SQL Data Type: nvarchar(500)`),
    DataContextID: z.string().nullish().describe(`
        * * Field Name: DataContextID
        * * Display Name: Data Context ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Data Contexts (vwDataContexts.ID)`),
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
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
    LinkedEntity: z.string().nullish().describe(`
        * * Field Name: LinkedEntity
        * * Display Name: Linked Entity
        * * SQL Data Type: nvarchar(255)`),
    DataContext: z.string().nullish().describe(`
        * * Field Name: DataContext
        * * Display Name: Data Context
        * * SQL Data Type: nvarchar(255)`),
});

export type ConversationEntityType = z.infer<typeof ConversationSchema>;
       
/**
 * zod schema definition for the entity Dashboard Categories
 */
export const DashboardCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    ParentID: z.string().nullish().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Dashboard Categories (vwDashboardCategories.ID)`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
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
    Parent: z.string().nullish().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(100)`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
});

export type DashboardCategoryEntityType = z.infer<typeof DashboardCategorySchema>;
       
/**
 * zod schema definition for the entity Dashboards
 */
export const DashboardSchema = z.object({
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
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    CategoryID: z.string().nullish().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Dashboard Categories (vwDashboardCategories.ID)`),
    UIConfigDetails: z.string().describe(`
        * * Field Name: UIConfigDetails
        * * Display Name: UIConfig Details
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
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
    Category: z.string().nullish().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)`),
});

export type DashboardEntityType = z.infer<typeof DashboardSchema>;
       
/**
 * zod schema definition for the entity Data Context Items
 */
export const DataContextItemSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    DataContextID: z.string().describe(`
        * * Field Name: DataContextID
        * * Display Name: Data Context ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Data Contexts (vwDataContexts.ID)`),
    Type: z.union([z.literal('view'), z.literal('sql'), z.literal('query'), z.literal('single_record'), z.literal('full_entity')]).describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * view
    *   * sql
    *   * query
    *   * single_record
    *   * full_entity
    * * Description: The type of the item, either "view", "query", "full_entity", "single_record", or "sql"`),
    ViewID: z.string().nullish().describe(`
        * * Field Name: ViewID
        * * Display Name: View ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: User Views (vwUserViews.ID)`),
    QueryID: z.string().nullish().describe(`
        * * Field Name: QueryID
        * * Display Name: Query ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Queries (vwQueries.ID)`),
    EntityID: z.string().nullish().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    RecordID: z.string().nullish().describe(`
        * * Field Name: RecordID
        * * Display Name: Record ID
        * * SQL Data Type: nvarchar(450)
    * * Description: The Primary Key value for the record, only used when Type='single_record'`),
    SQL: z.string().nullish().describe(`
        * * Field Name: SQL
        * * Display Name: SQL
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Only used when Type=sql`),
    DataJSON: z.string().nullish().describe(`
        * * Field Name: DataJSON
        * * Display Name: Data JSON
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Optionally used to cache results of an item. This can be used for performance optimization, and also for having snapshots of data for historical comparisons.`),
    LastRefreshedAt: z.date().nullish().describe(`
        * * Field Name: LastRefreshedAt
        * * Display Name: Last Refreshed At
        * * SQL Data Type: datetime
    * * Description: If DataJSON is populated, this field will show the date the the data was captured`),
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
    DataContext: z.string().describe(`
        * * Field Name: DataContext
        * * Display Name: Data Context
        * * SQL Data Type: nvarchar(255)`),
    View: z.string().nullish().describe(`
        * * Field Name: View
        * * Display Name: View
        * * SQL Data Type: nvarchar(100)`),
    Query: z.string().nullish().describe(`
        * * Field Name: Query
        * * Display Name: Query
        * * SQL Data Type: nvarchar(255)`),
    Entity: z.string().nullish().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type DataContextItemEntityType = z.infer<typeof DataContextItemSchema>;
       
/**
 * zod schema definition for the entity Data Contexts
 */
export const DataContextSchema = z.object({
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
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    LastRefreshedAt: z.date().nullish().describe(`
        * * Field Name: LastRefreshedAt
        * * Display Name: Last Refreshed At
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
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
});

export type DataContextEntityType = z.infer<typeof DataContextSchema>;
       
/**
 * zod schema definition for the entity Dataset Items
 */
export const DatasetItemSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(50)`),
    DatasetID: z.string().describe(`
        * * Field Name: DatasetID
        * * Display Name: Dataset ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Datasets (vwDatasets.ID)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    WhereClause: z.string().nullish().describe(`
        * * Field Name: WhereClause
        * * Display Name: Where Clause
        * * SQL Data Type: nvarchar(MAX)`),
    DateFieldToCheck: z.string().describe(`
        * * Field Name: DateFieldToCheck
        * * Display Name: Date Field To Check
        * * SQL Data Type: nvarchar(100)`),
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
    Dataset: z.string().describe(`
        * * Field Name: Dataset
        * * Display Name: Dataset
        * * SQL Data Type: nvarchar(100)`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type DatasetItemEntityType = z.infer<typeof DatasetItemSchema>;
       
/**
 * zod schema definition for the entity Datasets
 */
export const DatasetSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
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

export type DatasetEntityType = z.infer<typeof DatasetSchema>;
       
/**
 * zod schema definition for the entity Duplicate Run Detail Matches
 */
export const DuplicateRunDetailMatchSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    DuplicateRunDetailID: z.string().describe(`
        * * Field Name: DuplicateRunDetailID
        * * Display Name: Duplicate Run Detail ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Duplicate Run Details (vwDuplicateRunDetails.ID)`),
    MatchSource: z.union([z.literal('SP'), z.literal('Vector')]).describe(`
        * * Field Name: MatchSource
        * * Display Name: Match Source
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Vector
    * * Value List Type: List
    * * Possible Values 
    *   * SP
    *   * Vector
    * * Description: Either Vector or SP`),
    MatchRecordID: z.string().describe(`
        * * Field Name: MatchRecordID
        * * Display Name: Match Record ID
        * * SQL Data Type: nvarchar(500)`),
    MatchProbability: z.number().describe(`
        * * Field Name: MatchProbability
        * * Display Name: Match Probability
        * * SQL Data Type: numeric(12, 11)
        * * Default Value: 0
    * * Description: Value between 0 and 1 designating the computed probability of a match`),
    MatchedAt: z.date().describe(`
        * * Field Name: MatchedAt
        * * Display Name: Matched At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    Action: z.string().describe(`
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Ignore`),
    ApprovalStatus: z.union([z.literal('Rejected'), z.literal('Approved'), z.literal('Pending')]).describe(`
        * * Field Name: ApprovalStatus
        * * Display Name: Approval Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Rejected
    *   * Approved
    *   * Pending`),
    RecordMergeLogID: z.string().nullish().describe(`
        * * Field Name: RecordMergeLogID
        * * Display Name: Record Merge Log ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Record Merge Logs (vwRecordMergeLogs.ID)`),
    MergeStatus: z.union([z.literal('Error'), z.literal('Complete'), z.literal('Pending')]).describe(`
        * * Field Name: MergeStatus
        * * Display Name: Merge Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Error
    *   * Complete
    *   * Pending`),
    MergedAt: z.date().describe(`
        * * Field Name: MergedAt
        * * Display Name: Merged At
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
});

export type DuplicateRunDetailMatchEntityType = z.infer<typeof DuplicateRunDetailMatchSchema>;
       
/**
 * zod schema definition for the entity Duplicate Run Details
 */
export const DuplicateRunDetailSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    DuplicateRunID: z.string().describe(`
        * * Field Name: DuplicateRunID
        * * Display Name: Duplicate Run ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Duplicate Runs (vwDuplicateRuns.ID)`),
    RecordID: z.string().describe(`
        * * Field Name: RecordID
        * * Display Name: Record ID
        * * SQL Data Type: nvarchar(500)`),
    MatchStatus: z.union([z.literal('Error'), z.literal('Skipped'), z.literal('Complete'), z.literal('Pending')]).describe(`
        * * Field Name: MatchStatus
        * * Display Name: Match Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Error
    *   * Skipped
    *   * Complete
    *   * Pending`),
    SkippedReason: z.string().nullish().describe(`
        * * Field Name: SkippedReason
        * * Display Name: Skipped Reason
        * * SQL Data Type: nvarchar(MAX)
    * * Description: If MatchStatus=Skipped, this field can be used to store the reason why the record was skipped`),
    MatchErrorMessage: z.string().nullish().describe(`
        * * Field Name: MatchErrorMessage
        * * Display Name: Match Error Message
        * * SQL Data Type: nvarchar(MAX)
    * * Description: If MatchStatus='Error' this field can be used to track the error from that phase of the process for logging/diagnostics.`),
    MergeStatus: z.union([z.literal('Error'), z.literal('Complete'), z.literal('Pending'), z.literal('Not Applicable')]).describe(`
        * * Field Name: MergeStatus
        * * Display Name: Merge Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Not Applicable
    * * Value List Type: List
    * * Possible Values 
    *   * Error
    *   * Complete
    *   * Pending
    *   * Not Applicable`),
    MergeErrorMessage: z.string().nullish().describe(`
        * * Field Name: MergeErrorMessage
        * * Display Name: Merge Error Message
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

export type DuplicateRunDetailEntityType = z.infer<typeof DuplicateRunDetailSchema>;
       
/**
 * zod schema definition for the entity Duplicate Runs
 */
export const DuplicateRunSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    StartedByUserID: z.string().describe(`
        * * Field Name: StartedByUserID
        * * Display Name: Started By User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    SourceListID: z.string().describe(`
        * * Field Name: SourceListID
        * * Display Name: Source List ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Lists (vwLists.ID)`),
    StartedAt: z.date().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    EndedAt: z.date().nullish().describe(`
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime`),
    ApprovalStatus: z.union([z.literal('Rejected'), z.literal('Approved'), z.literal('Pending')]).describe(`
        * * Field Name: ApprovalStatus
        * * Display Name: Approval Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Rejected
    *   * Approved
    *   * Pending`),
    ApprovalComments: z.string().nullish().describe(`
        * * Field Name: ApprovalComments
        * * Display Name: Approval Comments
        * * SQL Data Type: nvarchar(MAX)`),
    ApprovedByUserID: z.string().nullish().describe(`
        * * Field Name: ApprovedByUserID
        * * Display Name: Approved By User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    ProcessingStatus: z.union([z.literal('Failed'), z.literal('Complete'), z.literal('In Progress'), z.literal('Pending')]).describe(`
        * * Field Name: ProcessingStatus
        * * Display Name: Processing Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Failed
    *   * Complete
    *   * In Progress
    *   * Pending`),
    ProcessingErrorMessage: z.string().nullish().describe(`
        * * Field Name: ProcessingErrorMessage
        * * Display Name: Processing Error Message
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
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    StartedByUser: z.string().describe(`
        * * Field Name: StartedByUser
        * * Display Name: Started By User
        * * SQL Data Type: nvarchar(100)`),
    SourceList: z.string().describe(`
        * * Field Name: SourceList
        * * Display Name: Source List
        * * SQL Data Type: nvarchar(100)`),
    ApprovedByUser: z.string().nullish().describe(`
        * * Field Name: ApprovedByUser
        * * Display Name: Approved By User
        * * SQL Data Type: nvarchar(100)`),
});

export type DuplicateRunEntityType = z.infer<typeof DuplicateRunSchema>;
       
/**
 * zod schema definition for the entity Employee Company Integrations
 */
export const EmployeeCompanyIntegrationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EmployeeID: z.string().describe(`
        * * Field Name: EmployeeID
        * * Display Name: Employee ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Employees (vwEmployees.ID)`),
    CompanyIntegrationID: z.string().describe(`
        * * Field Name: CompanyIntegrationID
        * * Display Name: Company Integration ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Company Integrations (vwCompanyIntegrations.ID)`),
    ExternalSystemRecordID: z.string().describe(`
        * * Field Name: ExternalSystemRecordID
        * * Display Name: External System Record
        * * SQL Data Type: nvarchar(750)`),
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

export type EmployeeCompanyIntegrationEntityType = z.infer<typeof EmployeeCompanyIntegrationSchema>;
       
/**
 * zod schema definition for the entity Employee Roles
 */
export const EmployeeRoleSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EmployeeID: z.string().describe(`
        * * Field Name: EmployeeID
        * * Display Name: Employee ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Employees (vwEmployees.ID)`),
    RoleID: z.string().describe(`
        * * Field Name: RoleID
        * * Display Name: Role ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Roles (vwRoles.ID)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Role: z.string().describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(50)`),
});

export type EmployeeRoleEntityType = z.infer<typeof EmployeeRoleSchema>;
       
/**
 * zod schema definition for the entity Employee Skills
 */
export const EmployeeSkillSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EmployeeID: z.string().describe(`
        * * Field Name: EmployeeID
        * * Display Name: Employee ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Employees (vwEmployees.ID)`),
    SkillID: z.string().describe(`
        * * Field Name: SkillID
        * * Display Name: Skill ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Skills (vwSkills.ID)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Skill: z.string().describe(`
        * * Field Name: Skill
        * * Display Name: Skill
        * * SQL Data Type: nvarchar(50)`),
});

export type EmployeeSkillEntityType = z.infer<typeof EmployeeSkillSchema>;
       
/**
 * zod schema definition for the entity Employees
 */
export const EmployeeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    BCMID: z.string().describe(`
        * * Field Name: BCMID
        * * Display Name: BCMID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()`),
    FirstName: z.string().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(30)`),
    LastName: z.string().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(50)`),
    CompanyID: z.string().describe(`
        * * Field Name: CompanyID
        * * Display Name: Company ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Companies (vwCompanies.ID)`),
    SupervisorID: z.string().nullish().describe(`
        * * Field Name: SupervisorID
        * * Display Name: Supervisor ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Employees (vwEmployees.ID)`),
    Title: z.string().nullish().describe(`
        * * Field Name: Title
        * * SQL Data Type: nvarchar(50)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * SQL Data Type: nvarchar(100)`),
    Phone: z.string().nullish().describe(`
        * * Field Name: Phone
        * * SQL Data Type: nvarchar(20)`),
    Active: z.boolean().describe(`
        * * Field Name: Active
        * * SQL Data Type: bit
        * * Default Value: 1`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    FirstLast: z.string().nullish().describe(`
        * * Field Name: FirstLast
        * * Display Name: First Last
        * * SQL Data Type: nvarchar(81)`),
    Supervisor: z.string().nullish().describe(`
        * * Field Name: Supervisor
        * * Display Name: Supervisor
        * * SQL Data Type: nvarchar(81)`),
    SupervisorFirstName: z.string().nullish().describe(`
        * * Field Name: SupervisorFirstName
        * * Display Name: Supervisor First Name
        * * SQL Data Type: nvarchar(30)`),
    SupervisorLastName: z.string().nullish().describe(`
        * * Field Name: SupervisorLastName
        * * Display Name: Supervisor Last Name
        * * SQL Data Type: nvarchar(50)`),
    SupervisorEmail: z.string().nullish().describe(`
        * * Field Name: SupervisorEmail
        * * Display Name: Supervisor Email
        * * SQL Data Type: nvarchar(100)`),
});

export type EmployeeEntityType = z.infer<typeof EmployeeSchema>;
       
/**
 * zod schema definition for the entity Entities
 */
export const EntitySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ParentID: z.string().nullish().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * SQL Data Type: nvarchar(255)`),
    NameSuffix: z.string().nullish().describe(`
        * * Field Name: NameSuffix
        * * Display Name: Name Suffix
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    AutoUpdateDescription: z.boolean().describe(`
        * * Field Name: AutoUpdateDescription
        * * Display Name: Auto Update Description
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: When set to 1 (default), whenever a description is modified in the underlying view (first choice) or table (second choice), the Description column in the entity definition will be automatically updated. If you never set metadata in the database directly, you can leave this alone. However, if you have metadata set in the database level for description, and you want to provide a DIFFERENT description in this entity definition, turn this bit off and then set the Description field and future CodeGen runs will NOT override the Description field here.`),
    BaseTable: z.string().describe(`
        * * Field Name: BaseTable
        * * Display Name: Base Table
        * * SQL Data Type: nvarchar(255)`),
    BaseView: z.string().describe(`
        * * Field Name: BaseView
        * * Display Name: Base View
        * * SQL Data Type: nvarchar(255)`),
    BaseViewGenerated: z.boolean().describe(`
        * * Field Name: BaseViewGenerated
        * * Display Name: Base View Generated
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: When set to 0, CodeGen no longer generates a base view for the entity.`),
    SchemaName: z.string().describe(`
        * * Field Name: SchemaName
        * * Display Name: Schema Name
        * * SQL Data Type: nvarchar(255)
        * * Default Value: dbo`),
    VirtualEntity: z.boolean().describe(`
        * * Field Name: VirtualEntity
        * * Display Name: Virtual Entity
        * * SQL Data Type: bit
        * * Default Value: 0`),
    TrackRecordChanges: z.boolean().describe(`
        * * Field Name: TrackRecordChanges
        * * Display Name: Track Record Changes
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: When set to 1, changes made via the MemberJunction architecture will result in tracking records being created in the RecordChange table. In addition, when turned on CodeGen will ensure that your table has two fields: __mj_CreatedAt and __mj_UpdatedAt which are special fields used in conjunction with the RecordChange table to track changes to rows in your entity.`),
    AuditRecordAccess: z.boolean().describe(`
        * * Field Name: AuditRecordAccess
        * * Display Name: Audit Record Access
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: When set to 1, accessing a record by an end-user will result in an Audit Log record being created`),
    AuditViewRuns: z.boolean().describe(`
        * * Field Name: AuditViewRuns
        * * Display Name: Audit View Runs
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: When set to 1, users running a view against this entity will result in an Audit Log record being created.`),
    IncludeInAPI: z.boolean().describe(`
        * * Field Name: IncludeInAPI
        * * Display Name: Include In API
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: If set to 0, the entity will not be available at all in the GraphQL API or the object model.`),
    AllowAllRowsAPI: z.boolean().describe(`
        * * Field Name: AllowAllRowsAPI
        * * Display Name: Allow All Rows API
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: If set to 1, a GraphQL query will be enabled that allows access to all rows in the entity.`),
    AllowUpdateAPI: z.boolean().describe(`
        * * Field Name: AllowUpdateAPI
        * * Display Name: Allow Update API
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: Global flag controlling if updates are allowed for any user, or not. If set to 1, a GraqhQL mutation and stored procedure are created. Permissions are still required to perform the action but if this flag is set to 0, no user will be able to perform the action.`),
    AllowCreateAPI: z.boolean().describe(`
        * * Field Name: AllowCreateAPI
        * * Display Name: Allow Create API
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: Global flag controlling if creates are allowed for any user, or not. If set to 1, a GraqhQL mutation and stored procedure are created. Permissions are still required to perform the action but if this flag is set to 0, no user will be able to perform the action.`),
    AllowDeleteAPI: z.boolean().describe(`
        * * Field Name: AllowDeleteAPI
        * * Display Name: Allow Delete API
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: Global flag controlling if deletes are allowed for any user, or not. If set to 1, a GraqhQL mutation and stored procedure are created. Permissions are still required to perform the action but if this flag is set to 0, no user will be able to perform the action.`),
    CustomResolverAPI: z.boolean().describe(`
        * * Field Name: CustomResolverAPI
        * * Display Name: Custom Resolver API
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: Set to 1 if a custom resolver has been created for the entity.`),
    AllowUserSearchAPI: z.boolean().describe(`
        * * Field Name: AllowUserSearchAPI
        * * Display Name: Allow User Search API
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: Enabling this bit will result in search being possible at the API and UI layers`),
    FullTextSearchEnabled: z.boolean().describe(`
        * * Field Name: FullTextSearchEnabled
        * * Display Name: Full Text Search Enabled
        * * SQL Data Type: bit
        * * Default Value: 0`),
    FullTextCatalog: z.string().nullish().describe(`
        * * Field Name: FullTextCatalog
        * * Display Name: Full Text Catalog
        * * SQL Data Type: nvarchar(255)`),
    FullTextCatalogGenerated: z.boolean().describe(`
        * * Field Name: FullTextCatalogGenerated
        * * Display Name: Full Text Catalog Generated
        * * SQL Data Type: bit
        * * Default Value: 1`),
    FullTextIndex: z.string().nullish().describe(`
        * * Field Name: FullTextIndex
        * * Display Name: Full Text Index
        * * SQL Data Type: nvarchar(255)`),
    FullTextIndexGenerated: z.boolean().describe(`
        * * Field Name: FullTextIndexGenerated
        * * Display Name: Full Text Index Generated
        * * SQL Data Type: bit
        * * Default Value: 1`),
    FullTextSearchFunction: z.string().nullish().describe(`
        * * Field Name: FullTextSearchFunction
        * * Display Name: Full Text Search Function
        * * SQL Data Type: nvarchar(255)`),
    FullTextSearchFunctionGenerated: z.boolean().describe(`
        * * Field Name: FullTextSearchFunctionGenerated
        * * Display Name: Full Text Search Function Generated
        * * SQL Data Type: bit
        * * Default Value: 1`),
    UserViewMaxRows: z.number().nullish().describe(`
        * * Field Name: UserViewMaxRows
        * * Display Name: User View Max Rows
        * * SQL Data Type: int
        * * Default Value: 1000`),
    spCreate: z.string().nullish().describe(`
        * * Field Name: spCreate
        * * Display Name: spCreate
        * * SQL Data Type: nvarchar(255)`),
    spUpdate: z.string().nullish().describe(`
        * * Field Name: spUpdate
        * * Display Name: spUpdate
        * * SQL Data Type: nvarchar(255)`),
    spDelete: z.string().nullish().describe(`
        * * Field Name: spDelete
        * * Display Name: spDelete
        * * SQL Data Type: nvarchar(255)`),
    spCreateGenerated: z.boolean().describe(`
        * * Field Name: spCreateGenerated
        * * Display Name: sp CreateGenerated
        * * SQL Data Type: bit
        * * Default Value: 1`),
    spUpdateGenerated: z.boolean().describe(`
        * * Field Name: spUpdateGenerated
        * * Display Name: sp Update Generated
        * * SQL Data Type: bit
        * * Default Value: 1`),
    spDeleteGenerated: z.boolean().describe(`
        * * Field Name: spDeleteGenerated
        * * Display Name: sp Delete Generated
        * * SQL Data Type: bit
        * * Default Value: 1`),
    CascadeDeletes: z.boolean().describe(`
        * * Field Name: CascadeDeletes
        * * Display Name: Cascade Deletes
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: When set to 1, the deleted spDelete will pre-process deletion to related entities that have 1:M cardinality with this entity. This does not have effect if spDeleteGenerated = 0`),
    DeleteType: z.union([z.literal('Hard'), z.literal('Soft')]).describe(`
        * * Field Name: DeleteType
        * * Display Name: Delete Type
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Hard
    * * Value List Type: List
    * * Possible Values 
    *   * Hard
    *   * Soft
    * * Description: Hard deletes physically remove rows from the underlying BaseTable. Soft deletes do not remove rows but instead mark the row as deleted by using the special field __mj_DeletedAt which will automatically be added to the entity's basetable by the CodeGen tool.`),
    AllowRecordMerge: z.boolean().describe(`
        * * Field Name: AllowRecordMerge
        * * Display Name: Allow Record Merge
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: This field must be turned on in order to enable merging of records for the entity. For AllowRecordMerge to be turned on, AllowDeleteAPI must be set to 1, and DeleteType must be set to Soft`),
    spMatch: z.string().nullish().describe(`
        * * Field Name: spMatch
        * * Display Name: sp Match
        * * SQL Data Type: nvarchar(255)
    * * Description: When specified, this stored procedure is used to find matching records in this particular entity. The convention is to pass in the primary key(s) columns for the given entity to the procedure and the return will be zero to many rows where there is a column for each primary key field(s) and a ProbabilityScore (numeric(1,12)) column that has a 0 to 1 value of the probability of a match.`),
    RelationshipDefaultDisplayType: z.union([z.literal('Search'), z.literal('Dropdown')]).describe(`
        * * Field Name: RelationshipDefaultDisplayType
        * * Display Name: Relationship Default Display Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Search
    * * Value List Type: List
    * * Possible Values 
    *   * Search
    *   * Dropdown
    * * Description: When another entity links to this entity with a foreign key, this is the default component type that will be used in the UI. CodeGen will populate the RelatedEntityDisplayType column in the Entity Fields entity with whatever is provided here whenever a new foreign key is detected by CodeGen. The selection can be overridden on a per-foreign-key basis in each row of the Entity Fields entity.`),
    UserFormGenerated: z.boolean().describe(`
        * * Field Name: UserFormGenerated
        * * Display Name: User Form Generated
        * * SQL Data Type: bit
        * * Default Value: 1`),
    EntityObjectSubclassName: z.string().nullish().describe(`
        * * Field Name: EntityObjectSubclassName
        * * Display Name: Entity Object Subclass Name
        * * SQL Data Type: nvarchar(255)`),
    EntityObjectSubclassImport: z.string().nullish().describe(`
        * * Field Name: EntityObjectSubclassImport
        * * Display Name: Entity Object Subclass Import
        * * SQL Data Type: nvarchar(255)`),
    PreferredCommunicationField: z.string().nullish().describe(`
        * * Field Name: PreferredCommunicationField
        * * Display Name: Preferred Communication Field
        * * SQL Data Type: nvarchar(255)
    * * Description: Used to specify a field within the entity that in turn contains the field name that will be used for record-level communication preferences. For example in a hypothetical entity called Contacts, say there is a field called PreferredComm and that field had possible values of Email1, SMS, and Phone, and those value in turn corresponded to field names in the entity. Each record in the Contacts entity could have a specific preference for which field would be used for communication. The MJ Communication Framework will use this information when available, as a priority ahead of the data in the Entity Communication Fields entity which is entity-level and not record-level.`),
    Icon: z.string().nullish().describe(`
        * * Field Name: Icon
        * * Display Name: Icon
        * * SQL Data Type: nvarchar(500)
    * * Description: Optional, specify an icon (CSS Class) for each entity for display in the UI`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    CodeName: z.string().nullish().describe(`
        * * Field Name: CodeName
        * * Display Name: Code Name
        * * SQL Data Type: nvarchar(MAX)`),
    ClassName: z.string().nullish().describe(`
        * * Field Name: ClassName
        * * Display Name: Class Name
        * * SQL Data Type: nvarchar(MAX)`),
    BaseTableCodeName: z.string().nullish().describe(`
        * * Field Name: BaseTableCodeName
        * * Display Name: Base Table Code Name
        * * SQL Data Type: nvarchar(MAX)`),
    ParentEntity: z.string().nullish().describe(`
        * * Field Name: ParentEntity
        * * Display Name: Parent Entity
        * * SQL Data Type: nvarchar(255)`),
    ParentBaseTable: z.string().nullish().describe(`
        * * Field Name: ParentBaseTable
        * * Display Name: Parent Base Table
        * * SQL Data Type: nvarchar(255)`),
    ParentBaseView: z.string().nullish().describe(`
        * * Field Name: ParentBaseView
        * * Display Name: Parent Base View
        * * SQL Data Type: nvarchar(255)`),
});

export type EntityEntityType = z.infer<typeof EntitySchema>;
       
/**
 * zod schema definition for the entity Entity Action Filters
 */
export const EntityActionFilterSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityActionID: z.string().describe(`
        * * Field Name: EntityActionID
        * * Display Name: Entity Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entity Actions (vwEntityActions.ID)`),
    ActionFilterID: z.string().describe(`
        * * Field Name: ActionFilterID
        * * Display Name: Action Filter ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Action Filters (vwActionFilters.ID)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
    * * Description: Order of filter execution.`),
    Status: z.union([z.literal('Disabled'), z.literal('Active'), z.literal('Pending')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Disabled
    *   * Active
    *   * Pending
    * * Description: Status of the entity action filter (Pending, Active, Disabled).`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type EntityActionFilterEntityType = z.infer<typeof EntityActionFilterSchema>;
       
/**
 * zod schema definition for the entity Entity Action Invocation Types
 */
export const EntityActionInvocationTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
    * * Description: Name of the invocation type such as Record Created/Updated/etc.`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the invocation type.`),
    DisplaySequence: z.number().describe(`
        * * Field Name: DisplaySequence
        * * Display Name: Display Sequence
        * * SQL Data Type: int
        * * Default Value: 0`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type EntityActionInvocationTypeEntityType = z.infer<typeof EntityActionInvocationTypeSchema>;
       
/**
 * zod schema definition for the entity Entity Action Invocations
 */
export const EntityActionInvocationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityActionID: z.string().describe(`
        * * Field Name: EntityActionID
        * * Display Name: Entity Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entity Actions (vwEntityActions.ID)`),
    InvocationTypeID: z.string().describe(`
        * * Field Name: InvocationTypeID
        * * Display Name: Invocation Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entity Action Invocation Types (vwEntityActionInvocationTypes.ID)`),
    Status: z.union([z.literal('Disabled'), z.literal('Active'), z.literal('Pending')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Disabled
    *   * Active
    *   * Pending
    * * Description: Status of the entity action invocation (Pending, Active, Disabled).`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    InvocationType: z.string().describe(`
        * * Field Name: InvocationType
        * * Display Name: Invocation Type
        * * SQL Data Type: nvarchar(255)`),
});

export type EntityActionInvocationEntityType = z.infer<typeof EntityActionInvocationSchema>;
       
/**
 * zod schema definition for the entity Entity Action Params
 */
export const EntityActionParamSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityActionID: z.string().describe(`
        * * Field Name: EntityActionID
        * * Display Name: Entity Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entity Actions (vwEntityActions.ID)`),
    ActionParamID: z.string().describe(`
        * * Field Name: ActionParamID
        * * Display Name: Action Param ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Action Params (vwActionParams.ID)`),
    ValueType: z.union([z.literal('Static'), z.literal('Entity Object'), z.literal('Script'), z.literal('Entity Field')]).describe(`
        * * Field Name: ValueType
        * * Display Name: Value Type
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Static
    *   * Entity Object
    *   * Script
    *   * Entity Field
    * * Description: Type of the value, which can be Static, Entity Object, or Script.`),
    Value: z.string().nullish().describe(`
        * * Field Name: Value
        * * Display Name: Value
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Value of the parameter, used only when ValueType is Static or Script. When value is Script, any valid JavaScript code can be provided. The script will have access to an object called EntityActionContext. This object will have a property called EntityObject on it that will contain the BaseEntity derived sub-class with the current data for the entity object this action is operating against. The script must provide the parameter value to the EntityActionContext.result property. This scripting capabilty is designed for very small and simple code, for anything of meaningful complexity, create a sub-class instead.`),
    Comments: z.string().nullish().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Additional comments regarding the parameter.`),
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
    ActionParam: z.string().describe(`
        * * Field Name: ActionParam
        * * Display Name: Action Param
        * * SQL Data Type: nvarchar(255)`),
});

export type EntityActionParamEntityType = z.infer<typeof EntityActionParamSchema>;
       
/**
 * zod schema definition for the entity Entity Actions
 */
export const EntityActionSchema = z.object({
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    ActionID: z.string().describe(`
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Actions (vwActions.ID)`),
    Status: z.union([z.literal('Disabled'), z.literal('Active'), z.literal('Pending')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Disabled
    *   * Active
    *   * Pending
    * * Description: Status of the entity action (Pending, Active, Disabled).`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    Action: z.string().describe(`
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)`),
});

export type EntityActionEntityType = z.infer<typeof EntityActionSchema>;
       
/**
 * zod schema definition for the entity Entity AI Actions
 */
export const EntityAIActionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    AIModelID: z.string().describe(`
        * * Field Name: AIModelID
        * * Display Name: AI Model ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)`),
    AIActionID: z.string().describe(`
        * * Field Name: AIActionID
        * * Display Name: AI Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: AI Actions (vwAIActions.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Prompt: z.string().nullish().describe(`
        * * Field Name: Prompt
        * * Display Name: Prompt
        * * SQL Data Type: nvarchar(MAX)`),
    TriggerEvent: z.union([z.literal('after save'), z.literal('before save')]).describe(`
        * * Field Name: TriggerEvent
        * * Display Name: Trigger Event
        * * SQL Data Type: nchar(15)
        * * Default Value: After Save
    * * Value List Type: List
    * * Possible Values 
    *   * after save
    *   * before save`),
    UserMessage: z.string().describe(`
        * * Field Name: UserMessage
        * * Display Name: User Message
        * * SQL Data Type: nvarchar(MAX)`),
    OutputType: z.union([z.literal('entity'), z.literal('field')]).describe(`
        * * Field Name: OutputType
        * * Display Name: Output Type
        * * SQL Data Type: nchar(10)
        * * Default Value: FIeld
    * * Value List Type: List
    * * Possible Values 
    *   * entity
    *   * field`),
    OutputField: z.string().nullish().describe(`
        * * Field Name: OutputField
        * * Display Name: Output Field
        * * SQL Data Type: nvarchar(50)`),
    SkipIfOutputFieldNotEmpty: z.boolean().describe(`
        * * Field Name: SkipIfOutputFieldNotEmpty
        * * Display Name: Skip If Output Field Not Empty
        * * SQL Data Type: bit
        * * Default Value: 1`),
    OutputEntityID: z.string().nullish().describe(`
        * * Field Name: OutputEntityID
        * * Display Name: Output Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    Comments: z.string().nullish().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    AIModel: z.string().describe(`
        * * Field Name: AIModel
        * * Display Name: AIModel
        * * SQL Data Type: nvarchar(50)`),
    AIAction: z.string().describe(`
        * * Field Name: AIAction
        * * Display Name: AIAction
        * * SQL Data Type: nvarchar(50)`),
    OutputEntity: z.string().nullish().describe(`
        * * Field Name: OutputEntity
        * * Display Name: Output Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type EntityAIActionEntityType = z.infer<typeof EntityAIActionSchema>;
       
/**
 * zod schema definition for the entity Entity Communication Fields
 */
export const EntityCommunicationFieldSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityCommunicationMessageTypeID: z.string().describe(`
        * * Field Name: EntityCommunicationMessageTypeID
        * * Display Name: Entity Communication Message Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entity Communication Message Types (vwEntityCommunicationMessageTypes.ID)`),
    FieldName: z.string().describe(`
        * * Field Name: FieldName
        * * Display Name: Field Name
        * * SQL Data Type: nvarchar(500)
    * * Description: Name of the field in the entity that maps to the communication base message type`),
    Priority: z.number().describe(`
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: int
    * * Description: Priority of the field for the communication base message type`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type EntityCommunicationFieldEntityType = z.infer<typeof EntityCommunicationFieldSchema>;
       
/**
 * zod schema definition for the entity Entity Communication Message Types
 */
export const EntityCommunicationMessageTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    BaseMessageTypeID: z.string().describe(`
        * * Field Name: BaseMessageTypeID
        * * Display Name: Base Message Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Communication Base Message Types (vwCommunicationBaseMessageTypes.ID)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: Indicates whether the message type is active`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    BaseMessageType: z.string().describe(`
        * * Field Name: BaseMessageType
        * * Display Name: Base Message Type
        * * SQL Data Type: nvarchar(100)`),
});

export type EntityCommunicationMessageTypeEntityType = z.infer<typeof EntityCommunicationMessageTypeSchema>;
       
/**
 * zod schema definition for the entity Entity Document Runs
 */
export const EntityDocumentRunSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityDocumentID: z.string().describe(`
        * * Field Name: EntityDocumentID
        * * Display Name: Entity Document ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entity Documents (vwEntityDocuments.ID)`),
    StartedAt: z.date().nullish().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime`),
    EndedAt: z.date().nullish().describe(`
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime`),
    Status: z.union([z.literal('Pending'), z.literal('Complete'), z.literal('Failed')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(15)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Complete
    *   * Failed
    * * Description: Can be Pending, In Progress, Completed, or Failed`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    EntityDocument: z.string().describe(`
        * * Field Name: EntityDocument
        * * Display Name: Entity Document
        * * SQL Data Type: nvarchar(250)`),
});

export type EntityDocumentRunEntityType = z.infer<typeof EntityDocumentRunSchema>;
       
/**
 * zod schema definition for the entity Entity Document Settings
 */
export const EntityDocumentSettingSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityDocumentID: z.string().describe(`
        * * Field Name: EntityDocumentID
        * * Display Name: Entity Document ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entity Documents (vwEntityDocuments.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Value: z.string().describe(`
        * * Field Name: Value
        * * Display Name: Value
        * * SQL Data Type: nvarchar(MAX)`),
    Comments: z.string().nullish().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    EntityDocument: z.string().describe(`
        * * Field Name: EntityDocument
        * * Display Name: Entity Document
        * * SQL Data Type: nvarchar(250)`),
});

export type EntityDocumentSettingEntityType = z.infer<typeof EntityDocumentSettingSchema>;
       
/**
 * zod schema definition for the entity Entity Document Types
 */
export const EntityDocumentTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type EntityDocumentTypeEntityType = z.infer<typeof EntityDocumentTypeSchema>;
       
/**
 * zod schema definition for the entity Entity Documents
 */
export const EntityDocumentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(250)`),
    TypeID: z.string().describe(`
        * * Field Name: TypeID
        * * Display Name: Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entity Document Types (vwEntityDocumentTypes.ID)`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    VectorDatabaseID: z.string().describe(`
        * * Field Name: VectorDatabaseID
        * * Display Name: Vector Database ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Vector Databases (vwVectorDatabases.ID)`),
    Status: z.union([z.literal('Active'), z.literal('Inactive')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(15)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive`),
    TemplateID: z.string().describe(`
        * * Field Name: TemplateID
        * * Display Name: Template ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Templates (vwTemplates.ID)`),
    AIModelID: z.string().describe(`
        * * Field Name: AIModelID
        * * Display Name: AIModel ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)`),
    PotentialMatchThreshold: z.number().describe(`
        * * Field Name: PotentialMatchThreshold
        * * Display Name: Potential Match Threshold
        * * SQL Data Type: numeric(12, 11)
        * * Default Value: 1
    * * Description: Value between 0 and 1 that determines what is considered a potential matching record. Value must be <= AbsoluteMatchThreshold. This is primarily used for duplicate detection but can be used for other applications as well where matching is relevant.`),
    AbsoluteMatchThreshold: z.number().describe(`
        * * Field Name: AbsoluteMatchThreshold
        * * Display Name: Absolute Match Threshold
        * * SQL Data Type: numeric(12, 11)
        * * Default Value: 1
    * * Description: Value between 0 and 1 that determines what is considered an absolute matching record. Value must be >= PotentialMatchThreshold. This is primarily used for duplicate detection but can be used for other applications as well where matching is relevant.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Type: z.string().describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(100)`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    VectorDatabase: z.string().describe(`
        * * Field Name: VectorDatabase
        * * Display Name: Vector Database
        * * SQL Data Type: nvarchar(100)`),
    Template: z.string().describe(`
        * * Field Name: Template
        * * Display Name: Template
        * * SQL Data Type: nvarchar(255)`),
    AIModel: z.string().describe(`
        * * Field Name: AIModel
        * * Display Name: AIModel
        * * SQL Data Type: nvarchar(50)`),
});

export type EntityDocumentEntityType = z.infer<typeof EntityDocumentSchema>;
       
/**
 * zod schema definition for the entity Entity Field Values
 */
export const EntityFieldValueSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityFieldID: z.string().describe(`
        * * Field Name: EntityFieldID
        * * Display Name: Entity Field ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entity Fields (vwEntityFields.ID)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int`),
    Value: z.string().describe(`
        * * Field Name: Value
        * * Display Name: Value
        * * SQL Data Type: nvarchar(255)`),
    Code: z.string().nullish().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(50)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    EntityField: z.string().describe(`
        * * Field Name: EntityField
        * * Display Name: Entity Field
        * * SQL Data Type: nvarchar(255)`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier`),
});

export type EntityFieldValueEntityType = z.infer<typeof EntityFieldValueSchema>;
       
/**
 * zod schema definition for the entity Entity Fields
 */
export const EntityFieldSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
    * * Description: Display order of the field within the entity`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * SQL Data Type: nvarchar(255)
    * * Description: Name of the field within the database table`),
    DisplayName: z.string().nullish().describe(`
        * * Field Name: DisplayName
        * * Display Name: Display Name
        * * SQL Data Type: nvarchar(255)
    * * Description: A user friendly alternative to the field name`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Descriptive text explaining the purpose of the field`),
    AutoUpdateDescription: z.boolean().describe(`
        * * Field Name: AutoUpdateDescription
        * * Display Name: Auto Update Description
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: When set to 1 (default), whenever a description is modified in the column within the underlying view (first choice) or table (second choice), the Description column in the entity field definition will be automatically updated. If you never set metadata in the database directly, you can leave this alone. However, if you have metadata set in the database level for description, and you want to provide a DIFFERENT description in this entity field definition, turn this bit off and then set the Description field and future CodeGen runs will NOT override the Description field here.`),
    IsPrimaryKey: z.boolean().describe(`
        * * Field Name: IsPrimaryKey
        * * Display Name: Is Primary Key
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: Indicates if the field is part of the primary key for the entity (auto maintained by CodeGen)`),
    IsUnique: z.boolean().describe(`
        * * Field Name: IsUnique
        * * Display Name: Is Unique
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: Indicates if the field must have unique values within the entity.`),
    Category: z.string().nullish().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(255)
    * * Description: Used for generating custom tabs in the generated forms, only utilized if GeneratedFormSection=Category`),
    Type: z.string().describe(`
        * * Field Name: Type
        * * SQL Data Type: nvarchar(100)
    * * Description: SQL Data type (auto maintained by CodeGen)`),
    Length: z.number().nullish().describe(`
        * * Field Name: Length
        * * SQL Data Type: int
    * * Description: SQL data length (auto maintained by CodeGen)`),
    Precision: z.number().nullish().describe(`
        * * Field Name: Precision
        * * SQL Data Type: int
    * * Description: SQL precision (auto maintained by CodeGen)`),
    Scale: z.number().nullish().describe(`
        * * Field Name: Scale
        * * SQL Data Type: int
    * * Description: SQL scale (auto maintained by CodeGen)`),
    AllowsNull: z.boolean().describe(`
        * * Field Name: AllowsNull
        * * Display Name: Allows Null
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: Does the column allow null or not (auto maintained by CodeGen)`),
    DefaultValue: z.string().nullish().describe(`
        * * Field Name: DefaultValue
        * * Display Name: Default Value
        * * SQL Data Type: nvarchar(255)
    * * Description: If a default value is defined for the field it is stored here (auto maintained by CodeGen)`),
    AutoIncrement: z.boolean().describe(`
        * * Field Name: AutoIncrement
        * * Display Name: Auto Increment
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: If this field automatically increments within the table, this field is set to 1 (auto maintained by CodeGen)`),
    ValueListType: z.union([z.literal('None'), z.literal('List'), z.literal('ListOrUserEntry')]).describe(`
        * * Field Name: ValueListType
        * * Display Name: Value List Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: None
    * * Value List Type: List
    * * Possible Values 
    *   * None
    *   * List
    *   * ListOrUserEntry
    * * Description: Possible Values of None, List, ListOrUserEntry - the last option meaning that the list of possible values are options, but a user can enter anything else desired too.`),
    ExtendedType: z.union([z.literal('Email'), z.literal('URL'), z.literal('Tel'), z.literal('SMS'), z.literal('Geo'), z.literal('WhatsApp'), z.literal('FaceTime'), z.literal('Skype'), z.literal('SIP'), z.literal('MSTeams'), z.literal('ZoomMtg'), z.literal('Other'), z.literal('Code')]).nullish().describe(`
        * * Field Name: ExtendedType
        * * Display Name: Extended Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Email
    *   * URL
    *   * Tel
    *   * SMS
    *   * Geo
    *   * WhatsApp
    *   * FaceTime
    *   * Skype
    *   * SIP
    *   * MSTeams
    *   * ZoomMtg
    *   * Other
    *   * Code
    * * Description: Defines extended behaviors for a field such as for Email, Web URLs, Code, etc.`),
    CodeType: z.union([z.literal('TypeScript'), z.literal('SQL'), z.literal('HTML'), z.literal('CSS'), z.literal('JavaScript'), z.literal('Other')]).nullish().describe(`
        * * Field Name: CodeType
        * * Display Name: Code Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * TypeScript
    *   * SQL
    *   * HTML
    *   * CSS
    *   * JavaScript
    *   * Other
    * * Description: The type of code associated with this field. Only used when the ExtendedType field is set to "Code"`),
    DefaultInView: z.boolean().describe(`
        * * Field Name: DefaultInView
        * * Display Name: Default In View
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: If set to 1, this field will be included by default in any new view created by a user.`),
    ViewCellTemplate: z.string().nullish().describe(`
        * * Field Name: ViewCellTemplate
        * * Display Name: View Cell Template
        * * SQL Data Type: nvarchar(MAX)
    * * Description: NULL`),
    DefaultColumnWidth: z.number().nullish().describe(`
        * * Field Name: DefaultColumnWidth
        * * Display Name: Default Column Width
        * * SQL Data Type: int
    * * Description: Determines the default width for this field when included in a view`),
    AllowUpdateAPI: z.boolean().describe(`
        * * Field Name: AllowUpdateAPI
        * * Display Name: Allow Update API
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: If set to 1, this field will be considered updateable by the API and object model. For this field to have effect, the column type must be updateable (e.g. not part of the primary key and not auto-increment)`),
    AllowUpdateInView: z.boolean().describe(`
        * * Field Name: AllowUpdateInView
        * * Display Name: Allow Update In View
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: If set to 1, and if AllowUpdateAPI=1, the field can be edited within a view when the view is in edit mode.`),
    IncludeInUserSearchAPI: z.boolean().describe(`
        * * Field Name: IncludeInUserSearchAPI
        * * Display Name: Include In User Search API
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: If set to 1, this column will be included in user search queries for both traditional and full text search`),
    FullTextSearchEnabled: z.boolean().describe(`
        * * Field Name: FullTextSearchEnabled
        * * Display Name: Full Text Search Enabled
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: If set to 1, CodeGen will automatically generate a Full Text Catalog/Index in the database and include this field in the search index.`),
    UserSearchParamFormatAPI: z.string().nullish().describe(`
        * * Field Name: UserSearchParamFormatAPI
        * * Display Name: User Search Param Format API
        * * SQL Data Type: nvarchar(500)
    * * Description: NULL`),
    IncludeInGeneratedForm: z.boolean().describe(`
        * * Field Name: IncludeInGeneratedForm
        * * Display Name: Include In Generated Form
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: If set to 1, this field will be included in the generated form by CodeGen. If set to 0, this field will be excluded from the generated form. For custom forms, this field has no effect as the layout is controlled independently.`),
    GeneratedFormSection: z.union([z.literal('Top'), z.literal('Category'), z.literal('Details')]).describe(`
        * * Field Name: GeneratedFormSection
        * * Display Name: Generated Form Section
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Details
    * * Value List Type: List
    * * Possible Values 
    *   * Top
    *   * Category
    *   * Details
    * * Description: When set to Top, the field will be placed in a "top area" on the top of a generated form and visible regardless of which tab is displayed. When set to "category" Options: Top, Category, Details`),
    IsVirtual: z.boolean().describe(`
        * * Field Name: IsVirtual
        * * Display Name: Is Virtual
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: NULL`),
    IsNameField: z.boolean().describe(`
        * * Field Name: IsNameField
        * * Display Name: Is Name Field
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: If set to 1, this column will be used as the "Name" field for the entity and will be used to display the name of the record in various places in the UI.`),
    RelatedEntityID: z.string().nullish().describe(`
        * * Field Name: RelatedEntityID
        * * Display Name: RelatedEntity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    RelatedEntityFieldName: z.string().nullish().describe(`
        * * Field Name: RelatedEntityFieldName
        * * Display Name: Related Entity Field Name
        * * SQL Data Type: nvarchar(255)
    * * Description: Name of the field in the Related Entity that this field links to (auto maintained by CodeGen)`),
    IncludeRelatedEntityNameFieldInBaseView: z.boolean().describe(`
        * * Field Name: IncludeRelatedEntityNameFieldInBaseView
        * * Display Name: Include Related Entity Name Field In Base View
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: If set to 1, the "Name" field of the Related Entity will be included in this entity as a virtual field`),
    RelatedEntityNameFieldMap: z.string().nullish().describe(`
        * * Field Name: RelatedEntityNameFieldMap
        * * Display Name: Related Entity Name Field Map
        * * SQL Data Type: nvarchar(255)`),
    RelatedEntityDisplayType: z.string().describe(`
        * * Field Name: RelatedEntityDisplayType
        * * Display Name: Related Entity Display Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Search
    * * Description: Controls the generated form in the MJ Explorer UI - defaults to a search box, other option is a drop down. Possible values are Search and Dropdown`),
    EntityIDFieldName: z.string().nullish().describe(`
        * * Field Name: EntityIDFieldName
        * * Display Name: Entity IDField Name
        * * SQL Data Type: nvarchar(100)
    * * Description: Optional, used for "Soft Keys" to link records to different entity/record combinations on a per-record basis (for example the FileEntityRecordLink table has an EntityID/RecordID field pair. For that entity, the RecordID specifies "EntityID" for this field. This information allows MJ to detect soft keys/links for dependency detection, merging and for preventing orphaned soft-linked records during delete operations.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    SchemaName: z.string().describe(`
        * * Field Name: SchemaName
        * * Display Name: Schema Name
        * * SQL Data Type: nvarchar(255)`),
    BaseTable: z.string().describe(`
        * * Field Name: BaseTable
        * * Display Name: Base Table
        * * SQL Data Type: nvarchar(255)`),
    BaseView: z.string().describe(`
        * * Field Name: BaseView
        * * Display Name: Base View
        * * SQL Data Type: nvarchar(255)`),
    EntityCodeName: z.string().nullish().describe(`
        * * Field Name: EntityCodeName
        * * Display Name: Entity Code Name
        * * SQL Data Type: nvarchar(MAX)`),
    EntityClassName: z.string().nullish().describe(`
        * * Field Name: EntityClassName
        * * Display Name: Entity Class Name
        * * SQL Data Type: nvarchar(MAX)`),
    RelatedEntity: z.string().nullish().describe(`
        * * Field Name: RelatedEntity
        * * Display Name: Related Entity
        * * SQL Data Type: nvarchar(255)`),
    RelatedEntitySchemaName: z.string().nullish().describe(`
        * * Field Name: RelatedEntitySchemaName
        * * Display Name: Related Entity Schema Name
        * * SQL Data Type: nvarchar(255)`),
    RelatedEntityBaseTable: z.string().nullish().describe(`
        * * Field Name: RelatedEntityBaseTable
        * * Display Name: Related Entity Base Table
        * * SQL Data Type: nvarchar(255)`),
    RelatedEntityBaseView: z.string().nullish().describe(`
        * * Field Name: RelatedEntityBaseView
        * * Display Name: Related Entity Base View
        * * SQL Data Type: nvarchar(255)`),
    RelatedEntityCodeName: z.string().nullish().describe(`
        * * Field Name: RelatedEntityCodeName
        * * Display Name: Related Entity Code Name
        * * SQL Data Type: nvarchar(MAX)`),
    RelatedEntityClassName: z.string().nullish().describe(`
        * * Field Name: RelatedEntityClassName
        * * Display Name: Related Entity Class Name
        * * SQL Data Type: nvarchar(MAX)`),
});

export type EntityFieldEntityType = z.infer<typeof EntityFieldSchema>;
       
/**
 * zod schema definition for the entity Entity Permissions
 */
export const EntityPermissionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    RoleID: z.string().describe(`
        * * Field Name: RoleID
        * * Display Name: Role ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Roles (vwRoles.ID)`),
    CanCreate: z.boolean().describe(`
        * * Field Name: CanCreate
        * * Display Name: Can Create
        * * SQL Data Type: bit
        * * Default Value: 0`),
    CanRead: z.boolean().describe(`
        * * Field Name: CanRead
        * * Display Name: Can Read
        * * SQL Data Type: bit
        * * Default Value: 0`),
    CanUpdate: z.boolean().describe(`
        * * Field Name: CanUpdate
        * * Display Name: Can Update
        * * SQL Data Type: bit
        * * Default Value: 0`),
    CanDelete: z.boolean().describe(`
        * * Field Name: CanDelete
        * * Display Name: Can Delete
        * * SQL Data Type: bit
        * * Default Value: 0`),
    ReadRLSFilterID: z.string().nullish().describe(`
        * * Field Name: ReadRLSFilterID
        * * Display Name: Read RLSFilter ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Row Level Security Filters (vwRowLevelSecurityFilters.ID)`),
    CreateRLSFilterID: z.string().nullish().describe(`
        * * Field Name: CreateRLSFilterID
        * * Display Name: Create RLSFilter ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Row Level Security Filters (vwRowLevelSecurityFilters.ID)`),
    UpdateRLSFilterID: z.string().nullish().describe(`
        * * Field Name: UpdateRLSFilterID
        * * Display Name: Update RLSFilter ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Row Level Security Filters (vwRowLevelSecurityFilters.ID)`),
    DeleteRLSFilterID: z.string().nullish().describe(`
        * * Field Name: DeleteRLSFilterID
        * * Display Name: Delete RLSFilter ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Row Level Security Filters (vwRowLevelSecurityFilters.ID)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    RoleName: z.string().describe(`
        * * Field Name: RoleName
        * * Display Name: Role Name
        * * SQL Data Type: nvarchar(50)`),
    RoleSQLName: z.string().nullish().describe(`
        * * Field Name: RoleSQLName
        * * Display Name: Role SQLName
        * * SQL Data Type: nvarchar(250)`),
    CreateRLSFilter: z.string().nullish().describe(`
        * * Field Name: CreateRLSFilter
        * * Display Name: Create RLSFilter
        * * SQL Data Type: nvarchar(100)`),
    ReadRLSFilter: z.string().nullish().describe(`
        * * Field Name: ReadRLSFilter
        * * Display Name: Read RLSFilter
        * * SQL Data Type: nvarchar(100)`),
    UpdateRLSFilter: z.string().nullish().describe(`
        * * Field Name: UpdateRLSFilter
        * * Display Name: Update RLSFilter
        * * SQL Data Type: nvarchar(100)`),
    DeleteRLSFilter: z.string().nullish().describe(`
        * * Field Name: DeleteRLSFilter
        * * Display Name: Delete RLSFilter
        * * SQL Data Type: nvarchar(100)`),
});

export type EntityPermissionEntityType = z.infer<typeof EntityPermissionSchema>;
       
/**
 * zod schema definition for the entity Entity Record Documents
 */
export const EntityRecordDocumentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    RecordID: z.string().describe(`
        * * Field Name: RecordID
        * * Display Name: Record ID
        * * SQL Data Type: nvarchar(450)`),
    EntityDocumentID: z.string().describe(`
        * * Field Name: EntityDocumentID
        * * Display Name: Entity Document ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entity Documents (vwEntityDocuments.ID)`),
    DocumentText: z.string().nullish().describe(`
        * * Field Name: DocumentText
        * * Display Name: Document Text
        * * SQL Data Type: nvarchar(MAX)`),
    VectorIndexID: z.string().describe(`
        * * Field Name: VectorIndexID
        * * Display Name: Vector Index ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Vector Indexes (vwVectorIndexes.ID)`),
    VectorID: z.string().nullish().describe(`
        * * Field Name: VectorID
        * * Display Name: Vector ID
        * * SQL Data Type: nvarchar(50)`),
    VectorJSON: z.string().nullish().describe(`
        * * Field Name: VectorJSON
        * * Display Name: Vector JSON
        * * SQL Data Type: nvarchar(MAX)`),
    EntityRecordUpdatedAt: z.date().describe(`
        * * Field Name: EntityRecordUpdatedAt
        * * Display Name: Entity Record Updated At
        * * SQL Data Type: datetime`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    EntityDocument: z.string().describe(`
        * * Field Name: EntityDocument
        * * Display Name: Entity Document
        * * SQL Data Type: nvarchar(250)`),
    VectorIndex: z.string().describe(`
        * * Field Name: VectorIndex
        * * Display Name: Vector Index
        * * SQL Data Type: nvarchar(255)`),
});

export type EntityRecordDocumentEntityType = z.infer<typeof EntityRecordDocumentSchema>;
       
/**
 * zod schema definition for the entity Entity Relationship Display Components
 */
export const EntityRelationshipDisplayComponentSchema = z.object({
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
    RelationshipType: z.union([z.literal('One to Many'), z.literal('Many to Many'), z.literal('Both')]).describe(`
        * * Field Name: RelationshipType
        * * Display Name: Relationship Type
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * One to Many
    *   * Many to Many
    *   * Both
    * * Description: The type of relationship the component displays. Valid values are "One to Many", "Many to Many", or "Both".`),
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

export type EntityRelationshipDisplayComponentEntityType = z.infer<typeof EntityRelationshipDisplayComponentSchema>;
       
/**
 * zod schema definition for the entity Entity Relationships
 */
export const EntityRelationshipSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
    * * Description: Used for display order in generated forms and in other places in the UI where relationships for an entity are shown`),
    RelatedEntityID: z.string().describe(`
        * * Field Name: RelatedEntityID
        * * Display Name: Related Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    BundleInAPI: z.boolean().describe(`
        * * Field Name: BundleInAPI
        * * Display Name: Bundle In API
        * * SQL Data Type: bit
        * * Default Value: 1`),
    IncludeInParentAllQuery: z.boolean().describe(`
        * * Field Name: IncludeInParentAllQuery
        * * Display Name: Include In Parent All Query
        * * SQL Data Type: bit
        * * Default Value: 0`),
    Type: z.union([z.literal('One To Many'), z.literal('Many To Many')]).describe(`
        * * Field Name: Type
        * * SQL Data Type: nchar(20)
        * * Default Value: One To Many
    * * Value List Type: List
    * * Possible Values 
    *   * One To Many
    *   * Many To Many`),
    EntityKeyField: z.string().nullish().describe(`
        * * Field Name: EntityKeyField
        * * Display Name: Entity Key Field
        * * SQL Data Type: nvarchar(255)`),
    RelatedEntityJoinField: z.string().describe(`
        * * Field Name: RelatedEntityJoinField
        * * Display Name: Related Entity Join Field
        * * SQL Data Type: nvarchar(255)`),
    JoinView: z.string().nullish().describe(`
        * * Field Name: JoinView
        * * Display Name: Join View
        * * SQL Data Type: nvarchar(255)`),
    JoinEntityJoinField: z.string().nullish().describe(`
        * * Field Name: JoinEntityJoinField
        * * Display Name: Join Entity Join Field
        * * SQL Data Type: nvarchar(255)`),
    JoinEntityInverseJoinField: z.string().nullish().describe(`
        * * Field Name: JoinEntityInverseJoinField
        * * Display Name: Join Entity Inverse Join Field
        * * SQL Data Type: nvarchar(255)`),
    DisplayInForm: z.boolean().describe(`
        * * Field Name: DisplayInForm
        * * Display Name: Display In Form
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: When unchecked the relationship will NOT be displayed on the generated form`),
    DisplayLocation: z.union([z.literal('After Field Tabs'), z.literal('Before Field Tabs')]).describe(`
        * * Field Name: DisplayLocation
        * * Display Name: Display Location
        * * SQL Data Type: nvarchar(50)
        * * Default Value: After Field Tabs
    * * Value List Type: List
    * * Possible Values 
    *   * After Field Tabs
    *   * Before Field Tabs`),
    DisplayName: z.string().nullish().describe(`
        * * Field Name: DisplayName
        * * Display Name: Display Name
        * * SQL Data Type: nvarchar(255)
    * * Description: Optional, when specified this value overrides the related entity name for the label on the tab`),
    DisplayIconType: z.union([z.literal('Related Entity Icon'), z.literal('Custom'), z.literal('None')]).describe(`
        * * Field Name: DisplayIconType
        * * Display Name: Display Icon Type
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Related Entity Icon
    * * Value List Type: List
    * * Possible Values 
    *   * Related Entity Icon
    *   * Custom
    *   * None
    * * Description: When Related Entity Icon - uses the icon from the related entity, if one exists. When Custom, uses the value in the DisplayIcon field in this record, and when None, no icon is displayed`),
    DisplayIcon: z.string().nullish().describe(`
        * * Field Name: DisplayIcon
        * * Display Name: Display Icon
        * * SQL Data Type: nvarchar(255)
    * * Description: If specified, the icon `),
    DisplayUserViewID: z.string().nullish().describe(`
        * * Field Name: DisplayUserViewID
        * * Display Name: Display User View ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: User Views (vwUserViews.ID)`),
    DisplayComponentID: z.string().nullish().describe(`
        * * Field Name: DisplayComponentID
        * * Display Name: Display Component ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entity Relationship Display Components (vwEntityRelationshipDisplayComponents.ID)`),
    DisplayComponentConfiguration: z.string().nullish().describe(`
        * * Field Name: DisplayComponentConfiguration
        * * Display Name: Display Component Configuration
        * * SQL Data Type: nvarchar(MAX)
    * * Description: If DisplayComponentID is specified, this field can optionally be used to track component-specific and relationship-specific configuration details that will be used by CodeGen to provide to the display component selected.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    EntityBaseTable: z.string().describe(`
        * * Field Name: EntityBaseTable
        * * Display Name: Entity Base Table
        * * SQL Data Type: nvarchar(255)`),
    EntityBaseView: z.string().describe(`
        * * Field Name: EntityBaseView
        * * Display Name: Entity Base View
        * * SQL Data Type: nvarchar(255)`),
    RelatedEntity: z.string().describe(`
        * * Field Name: RelatedEntity
        * * Display Name: Related Entity
        * * SQL Data Type: nvarchar(255)`),
    RelatedEntityBaseTable: z.string().describe(`
        * * Field Name: RelatedEntityBaseTable
        * * Display Name: Related Entity Base Table
        * * SQL Data Type: nvarchar(255)`),
    RelatedEntityBaseView: z.string().describe(`
        * * Field Name: RelatedEntityBaseView
        * * Display Name: Related Entity Base View
        * * SQL Data Type: nvarchar(255)`),
    RelatedEntityClassName: z.string().nullish().describe(`
        * * Field Name: RelatedEntityClassName
        * * Display Name: Related Entity Class Name
        * * SQL Data Type: nvarchar(MAX)`),
    RelatedEntityCodeName: z.string().nullish().describe(`
        * * Field Name: RelatedEntityCodeName
        * * Display Name: Related Entity Code Name
        * * SQL Data Type: nvarchar(MAX)`),
    RelatedEntityBaseTableCodeName: z.string().nullish().describe(`
        * * Field Name: RelatedEntityBaseTableCodeName
        * * Display Name: Related Entity Base Table Code Name
        * * SQL Data Type: nvarchar(MAX)`),
    DisplayUserViewName: z.string().nullish().describe(`
        * * Field Name: DisplayUserViewName
        * * Display Name: Display User View Name
        * * SQL Data Type: nvarchar(100)`),
});

export type EntityRelationshipEntityType = z.infer<typeof EntityRelationshipSchema>;
       
/**
 * zod schema definition for the entity Entity Settings
 */
export const EntitySettingSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Value: z.string().describe(`
        * * Field Name: Value
        * * Display Name: Value
        * * SQL Data Type: nvarchar(MAX)`),
    Comments: z.string().nullish().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type EntitySettingEntityType = z.infer<typeof EntitySettingSchema>;
       
/**
 * zod schema definition for the entity Error Logs
 */
export const ErrorLogSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CompanyIntegrationRunID: z.string().nullish().describe(`
        * * Field Name: CompanyIntegrationRunID
        * * Display Name: CompanyIntegrationRun ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Company Integration Runs (vwCompanyIntegrationRuns.ID)`),
    CompanyIntegrationRunDetailID: z.string().nullish().describe(`
        * * Field Name: CompanyIntegrationRunDetailID
        * * Display Name: CompanyIntegrationRunDetail ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Company Integration Run Details (vwCompanyIntegrationRunDetails.ID)`),
    Code: z.string().nullish().describe(`
        * * Field Name: Code
        * * SQL Data Type: nchar(20)`),
    Message: z.string().nullish().describe(`
        * * Field Name: Message
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedBy: z.string().nullish().describe(`
        * * Field Name: CreatedBy
        * * Display Name: Created By
        * * SQL Data Type: nvarchar(50)
        * * Default Value: suser_name()`),
    Status: z.string().nullish().describe(`
        * * Field Name: Status
        * * SQL Data Type: nvarchar(10)`),
    Category: z.string().nullish().describe(`
        * * Field Name: Category
        * * SQL Data Type: nvarchar(20)`),
    Details: z.string().nullish().describe(`
        * * Field Name: Details
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

export type ErrorLogEntityType = z.infer<typeof ErrorLogSchema>;
       
/**
 * zod schema definition for the entity Explorer Navigation Items
 */
export const ExplorerNavigationItemSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()
    * * Description: Unique identifier for each navigation item`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
    * * Description: Sequence number for the navigation item, must be unique and greater than 0`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
    * * Description: Unique name of the navigation item displayed to the user`),
    Route: z.string().describe(`
        * * Field Name: Route
        * * Display Name: Route
        * * SQL Data Type: nvarchar(255)
    * * Description: The route for the navigation item relative to the app main URL, using Angular syntax like "entity/:entityName"`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: Indicates if the navigation item is active; allows turning off items in the UI without deleting them from the metadata`),
    ShowInHomeScreen: z.boolean().describe(`
        * * Field Name: ShowInHomeScreen
        * * Display Name: Show In Home Screen
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: Controls if the navigation item is shown on the Home screen for MJ Explorer`),
    ShowInNavigationDrawer: z.boolean().describe(`
        * * Field Name: ShowInNavigationDrawer
        * * Display Name: Show In Navigation Drawer
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: Controls if the item is shown in the left navigation drawer in the MJ Explorer app or not.`),
    IconCSSClass: z.string().nullish().describe(`
        * * Field Name: IconCSSClass
        * * Display Name: Icon CSSClass
        * * SQL Data Type: nvarchar(100)
    * * Description: Optional, CSS class for an icon to be displayed with the navigation item`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the navigation item, shown to the user on hover or in larger displays`),
    Comments: z.string().nullish().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Administrator comments, not shown to the end user in MJ Explorer app`),
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

export type ExplorerNavigationItemEntityType = z.infer<typeof ExplorerNavigationItemSchema>;
       
/**
 * zod schema definition for the entity File Categories
 */
export const FileCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    ParentID: z.string().nullish().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: File Categories (vwFileCategories.ID)`),
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
    Parent: z.string().nullish().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(255)`),
});

export type FileCategoryEntityType = z.infer<typeof FileCategorySchema>;
       
/**
 * zod schema definition for the entity File Entity Record Links
 */
export const FileEntityRecordLinkSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    FileID: z.string().describe(`
        * * Field Name: FileID
        * * Display Name: File ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Files (vwFiles.ID)`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    RecordID: z.string().describe(`
        * * Field Name: RecordID
        * * Display Name: Record ID
        * * SQL Data Type: nvarchar(750)`),
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
    File: z.string().describe(`
        * * Field Name: File
        * * Display Name: File
        * * SQL Data Type: nvarchar(500)`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type FileEntityRecordLinkEntityType = z.infer<typeof FileEntityRecordLinkSchema>;
       
/**
 * zod schema definition for the entity File Storage Providers
 */
export const FileStorageProviderSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    ServerDriverKey: z.string().describe(`
        * * Field Name: ServerDriverKey
        * * Display Name: Server Driver Key
        * * SQL Data Type: nvarchar(100)`),
    ClientDriverKey: z.string().describe(`
        * * Field Name: ClientDriverKey
        * * Display Name: Client Driver Key
        * * SQL Data Type: nvarchar(100)`),
    Priority: z.number().describe(`
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: int
        * * Default Value: 0`),
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

export type FileStorageProviderEntityType = z.infer<typeof FileStorageProviderSchema>;
       
/**
 * zod schema definition for the entity Files
 */
export const FileSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(500)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    CategoryID: z.string().nullish().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: File Categories (vwFileCategories.ID)`),
    ProviderID: z.string().describe(`
        * * Field Name: ProviderID
        * * Display Name: Provider ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: File Storage Providers (vwFileStorageProviders.ID)`),
    ContentType: z.string().nullish().describe(`
        * * Field Name: ContentType
        * * Display Name: Content Type
        * * SQL Data Type: nvarchar(50)`),
    ProviderKey: z.string().nullish().describe(`
        * * Field Name: ProviderKey
        * * Display Name: Provider Key
        * * SQL Data Type: nvarchar(500)`),
    Status: z.string().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Description: Pending, Uploading, Uploaded, Deleting, Deleted`),
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
    Category: z.string().nullish().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(255)`),
    Provider: z.string().describe(`
        * * Field Name: Provider
        * * Display Name: Provider
        * * SQL Data Type: nvarchar(50)`),
});

export type FileEntityType = z.infer<typeof FileSchema>;
       
/**
 * zod schema definition for the entity flyway _schema _histories
 */
export const flyway_schema_historySchema = z.object({
    installed_rank: z.number().describe(`
        * * Field Name: installed_rank
        * * Display Name: installed _rank
        * * SQL Data Type: int`),
    version: z.string().nullish().describe(`
        * * Field Name: version
        * * Display Name: version
        * * SQL Data Type: nvarchar(50)`),
    description: z.string().nullish().describe(`
        * * Field Name: description
        * * Display Name: description
        * * SQL Data Type: nvarchar(200)`),
    type: z.string().describe(`
        * * Field Name: type
        * * Display Name: type
        * * SQL Data Type: nvarchar(20)`),
    script: z.string().describe(`
        * * Field Name: script
        * * Display Name: script
        * * SQL Data Type: nvarchar(1000)`),
    checksum: z.number().nullish().describe(`
        * * Field Name: checksum
        * * Display Name: checksum
        * * SQL Data Type: int`),
    installed_by: z.string().describe(`
        * * Field Name: installed_by
        * * Display Name: installed _by
        * * SQL Data Type: nvarchar(100)`),
    installed_on: z.date().describe(`
        * * Field Name: installed_on
        * * Display Name: installed _on
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    execution_time: z.number().describe(`
        * * Field Name: execution_time
        * * Display Name: execution _time
        * * SQL Data Type: int`),
    success: z.boolean().describe(`
        * * Field Name: success
        * * Display Name: success
        * * SQL Data Type: bit`),
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

export type flyway_schema_historyEntityType = z.infer<typeof flyway_schema_historySchema>;
       
/**
 * zod schema definition for the entity Integration URL Formats
 */
export const IntegrationURLFormatSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    IntegrationID: z.string().describe(`
        * * Field Name: IntegrationID
        * * Display Name: Integration ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Integrations (vwIntegrations.ID)`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    URLFormat: z.string().describe(`
        * * Field Name: URLFormat
        * * SQL Data Type: nvarchar(500)
    * * Description: The URL Format for the given integration including the ability to include markup with fields from the integration`),
    Comments: z.string().nullish().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
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
    Integration: z.string().describe(`
        * * Field Name: Integration
        * * Display Name: Integration
        * * SQL Data Type: nvarchar(100)`),
    NavigationBaseURL: z.string().nullish().describe(`
        * * Field Name: NavigationBaseURL
        * * Display Name: Navigation Base URL
        * * SQL Data Type: nvarchar(500)`),
    FullURLFormat: z.string().nullish().describe(`
        * * Field Name: FullURLFormat
        * * Display Name: Full URLFormat
        * * SQL Data Type: nvarchar(1000)`),
});

export type IntegrationURLFormatEntityType = z.infer<typeof IntegrationURLFormatSchema>;
       
/**
 * zod schema definition for the entity Integrations
 */
export const IntegrationSchema = z.object({
    Name: z.string().describe(`
        * * Field Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * SQL Data Type: nvarchar(255)`),
    NavigationBaseURL: z.string().nullish().describe(`
        * * Field Name: NavigationBaseURL
        * * Display Name: Navigation Base URL
        * * SQL Data Type: nvarchar(500)`),
    ClassName: z.string().nullish().describe(`
        * * Field Name: ClassName
        * * Display Name: Class Name
        * * SQL Data Type: nvarchar(100)`),
    ImportPath: z.string().nullish().describe(`
        * * Field Name: ImportPath
        * * Display Name: Import Path
        * * SQL Data Type: nvarchar(100)`),
    BatchMaxRequestCount: z.number().describe(`
        * * Field Name: BatchMaxRequestCount
        * * Display Name: Batch Max Request Count
        * * SQL Data Type: int
        * * Default Value: -1`),
    BatchRequestWaitTime: z.number().describe(`
        * * Field Name: BatchRequestWaitTime
        * * Display Name: Batch Request Wait Time
        * * SQL Data Type: int
        * * Default Value: -1`),
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
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
});

export type IntegrationEntityType = z.infer<typeof IntegrationSchema>;
       
/**
 * zod schema definition for the entity Libraries
 */
export const LibrarySchema = z.object({
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
    Status: z.union([z.literal('Pending'), z.literal('Active'), z.literal('Disabled')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Active
    *   * Disabled
    * * Description: Status of the library, only libraries marked as Active will be available for use by generated code. If a library was once active but no longer is, existing code that used the library will not be affected.`),
    TypeDefinitions: z.string().nullish().describe(`
        * * Field Name: TypeDefinitions
        * * Display Name: Type Definitions
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Code showing the types and functions defined in the library to be used for reference by humans and AI`),
    SampleCode: z.string().nullish().describe(`
        * * Field Name: SampleCode
        * * Display Name: Sample Code
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Examples of code use of the classes and/or functions from within the library`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type LibraryEntityType = z.infer<typeof LibrarySchema>;
       
/**
 * zod schema definition for the entity Library Items
 */
export const LibraryItemSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    LibraryID: z.string().describe(`
        * * Field Name: LibraryID
        * * Display Name: Library ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Libraries (vwLibraries.ID)`),
    Type: z.union([z.literal('Class'), z.literal('Interface'), z.literal('Variable'), z.literal('Type'), z.literal('Module'), z.literal('Function')]).describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Class
    *   * Interface
    *   * Variable
    *   * Type
    *   * Module
    *   * Function
    * * Description: Type of the library item for example Class, Interface, etc.`),
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
    Library: z.string().describe(`
        * * Field Name: Library
        * * Display Name: Library
        * * SQL Data Type: nvarchar(255)`),
});

export type LibraryItemEntityType = z.infer<typeof LibraryItemSchema>;
       
/**
 * zod schema definition for the entity List Categories
 */
export const ListCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    ParentID: z.string().nullish().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: List Categories (vwListCategories.ID)`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
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
    Parent: z.string().nullish().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(100)`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
});

export type ListCategoryEntityType = z.infer<typeof ListCategorySchema>;
       
/**
 * zod schema definition for the entity List Details
 */
export const ListDetailSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ListID: z.string().describe(`
        * * Field Name: ListID
        * * Display Name: List ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Lists (vwLists.ID)`),
    RecordID: z.string().describe(`
        * * Field Name: RecordID
        * * Display Name: Record
        * * SQL Data Type: nvarchar(445)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * SQL Data Type: int
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
    Status: z.union([z.literal('Pending'), z.literal('Active'), z.literal('Disabled'), z.literal('Rejected'), z.literal('Complete'), z.literal('Error'), z.literal('Other')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(30)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Active
    *   * Disabled
    *   * Rejected
    *   * Complete
    *   * Error
    *   * Other
    * * Description: Tracks the status of each individual list detail row to enable processing of various types and the use of the status column for filtering list detail rows within a list that are in a particular state.`),
    AdditionalData: z.string().nullish().describe(`
        * * Field Name: AdditionalData
        * * Display Name: Additional Data
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Optional column that allows for tracking any additional data for each ListDetail row`),
    List: z.string().describe(`
        * * Field Name: List
        * * Display Name: List
        * * SQL Data Type: nvarchar(100)`),
});

export type ListDetailEntityType = z.infer<typeof ListDetailSchema>;
       
/**
 * zod schema definition for the entity Lists
 */
export const ListSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    CategoryID: z.string().nullish().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: List Categories (vwListCategories.ID)`),
    ExternalSystemRecordID: z.string().nullish().describe(`
        * * Field Name: ExternalSystemRecordID
        * * Display Name: External System Record ID
        * * SQL Data Type: nvarchar(100)`),
    CompanyIntegrationID: z.string().nullish().describe(`
        * * Field Name: CompanyIntegrationID
        * * Display Name: Company Integration ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Company Integrations (vwCompanyIntegrations.ID)`),
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
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
    Category: z.string().nullish().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)`),
});

export type ListEntityType = z.infer<typeof ListSchema>;
       
/**
 * zod schema definition for the entity Output Delivery Types
 */
export const OutputDeliveryTypeSchema = z.object({
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

export type OutputDeliveryTypeEntityType = z.infer<typeof OutputDeliveryTypeSchema>;
       
/**
 * zod schema definition for the entity Output Format Types
 */
export const OutputFormatTypeSchema = z.object({
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
    DisplayFormat: z.string().nullish().describe(`
        * * Field Name: DisplayFormat
        * * Display Name: Display Format
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

export type OutputFormatTypeEntityType = z.infer<typeof OutputFormatTypeSchema>;
       
/**
 * zod schema definition for the entity Output Trigger Types
 */
export const OutputTriggerTypeSchema = z.object({
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

export type OutputTriggerTypeEntityType = z.infer<typeof OutputTriggerTypeSchema>;
       
/**
 * zod schema definition for the entity Queries
 */
export const QuerySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    CategoryID: z.string().nullish().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Query Categories (vwQueryCategories.ID)`),
    UserQuestion: z.string().nullish().describe(`
        * * Field Name: UserQuestion
        * * Display Name: User Question
        * * SQL Data Type: nvarchar(MAX)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    SQL: z.string().nullish().describe(`
        * * Field Name: SQL
        * * Display Name: SQL
        * * SQL Data Type: nvarchar(MAX)`),
    TechnicalDescription: z.string().nullish().describe(`
        * * Field Name: TechnicalDescription
        * * Display Name: Technical Description
        * * SQL Data Type: nvarchar(MAX)`),
    OriginalSQL: z.string().nullish().describe(`
        * * Field Name: OriginalSQL
        * * Display Name: Original SQL
        * * SQL Data Type: nvarchar(MAX)`),
    Feedback: z.string().nullish().describe(`
        * * Field Name: Feedback
        * * Display Name: Feedback
        * * SQL Data Type: nvarchar(MAX)`),
    Status: z.union([z.literal('Pending'), z.literal('Approved'), z.literal('Rejected'), z.literal('Expired')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(15)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Approved
    *   * Rejected
    *   * Expired`),
    QualityRank: z.number().nullish().describe(`
        * * Field Name: QualityRank
        * * Display Name: Quality Rank
        * * SQL Data Type: int
        * * Default Value: 0
    * * Description: Value indicating the quality of the query, higher values mean a better quality`),
    ExecutionCostRank: z.number().nullish().describe(`
        * * Field Name: ExecutionCostRank
        * * Display Name: Execution Cost Rank
        * * SQL Data Type: int
    * * Description: Higher numbers indicate more execution overhead/time required. Useful for planning which queries to use in various scenarios.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Category: z.string().nullish().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(50)`),
});

export type QueryEntityType = z.infer<typeof QuerySchema>;
       
/**
 * zod schema definition for the entity Query Categories
 */
export const QueryCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)`),
    ParentID: z.string().nullish().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Query Categories (vwQueryCategories.ID)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Parent: z.string().nullish().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(50)`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
});

export type QueryCategoryEntityType = z.infer<typeof QueryCategorySchema>;
       
/**
 * zod schema definition for the entity Query Fields
 */
export const QueryFieldSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    QueryID: z.string().describe(`
        * * Field Name: QueryID
        * * Display Name: Query ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Queries (vwQueries.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int`),
    SQLBaseType: z.string().describe(`
        * * Field Name: SQLBaseType
        * * Display Name: SQLBase Type
        * * SQL Data Type: nvarchar(50)
    * * Description: The base type, not including parameters, in SQL. For example this field would be nvarchar or decimal, and wouldn't include type parameters. The SQLFullType field provides that information.`),
    SQLFullType: z.string().describe(`
        * * Field Name: SQLFullType
        * * Display Name: SQLFull Type
        * * SQL Data Type: nvarchar(100)
    * * Description: The full SQL type for the field, for example datetime or nvarchar(10) etc.`),
    SourceEntityID: z.string().nullish().describe(`
        * * Field Name: SourceEntityID
        * * Display Name: Source Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    SourceFieldName: z.string().nullish().describe(`
        * * Field Name: SourceFieldName
        * * Display Name: Source Field Name
        * * SQL Data Type: nvarchar(255)`),
    IsComputed: z.boolean().describe(`
        * * Field Name: IsComputed
        * * Display Name: Is Computed
        * * SQL Data Type: bit
        * * Default Value: 0`),
    ComputationDescription: z.string().nullish().describe(`
        * * Field Name: ComputationDescription
        * * Display Name: Computation Description
        * * SQL Data Type: nvarchar(MAX)`),
    IsSummary: z.boolean().describe(`
        * * Field Name: IsSummary
        * * Display Name: Is Summary
        * * SQL Data Type: bit
        * * Default Value: 0`),
    SummaryDescription: z.string().nullish().describe(`
        * * Field Name: SummaryDescription
        * * Display Name: Summary Description
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Query: z.string().describe(`
        * * Field Name: Query
        * * Display Name: Query
        * * SQL Data Type: nvarchar(255)`),
    SourceEntity: z.string().nullish().describe(`
        * * Field Name: SourceEntity
        * * Display Name: Source Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type QueryFieldEntityType = z.infer<typeof QueryFieldSchema>;
       
/**
 * zod schema definition for the entity Query Permissions
 */
export const QueryPermissionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    QueryID: z.string().describe(`
        * * Field Name: QueryID
        * * Display Name: Query ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Queries (vwQueries.ID)`),
    RoleID: z.string().describe(`
        * * Field Name: RoleID
        * * Display Name: Role ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Roles (vwRoles.ID)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Query: z.string().describe(`
        * * Field Name: Query
        * * Display Name: Query
        * * SQL Data Type: nvarchar(255)`),
    Role: z.string().describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(50)`),
});

export type QueryPermissionEntityType = z.infer<typeof QueryPermissionSchema>;
       
/**
 * zod schema definition for the entity Queue Tasks
 */
export const QueueTaskSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    QueueID: z.string().describe(`
        * * Field Name: QueueID
        * * Display Name: Queue ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Queues (vwQueues.ID)`),
    Status: z.union([z.literal('In Progress'), z.literal('Completed'), z.literal('Failed')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nchar(10)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * In Progress
    *   * Completed
    *   * Failed`),
    StartedAt: z.date().nullish().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime`),
    EndedAt: z.date().nullish().describe(`
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime`),
    Data: z.string().nullish().describe(`
        * * Field Name: Data
        * * Display Name: Data
        * * SQL Data Type: nvarchar(MAX)`),
    Options: z.string().nullish().describe(`
        * * Field Name: Options
        * * Display Name: Options
        * * SQL Data Type: nvarchar(MAX)`),
    Output: z.string().nullish().describe(`
        * * Field Name: Output
        * * Display Name: Output
        * * SQL Data Type: nvarchar(MAX)`),
    ErrorMessage: z.string().nullish().describe(`
        * * Field Name: ErrorMessage
        * * Display Name: Error Message
        * * SQL Data Type: nvarchar(MAX)`),
    Comments: z.string().nullish().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
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
    Queue: z.string().describe(`
        * * Field Name: Queue
        * * Display Name: Queue
        * * SQL Data Type: nvarchar(50)`),
});

export type QueueTaskEntityType = z.infer<typeof QueueTaskSchema>;
       
/**
 * zod schema definition for the entity Queue Types
 */
export const QueueTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    DriverClass: z.string().describe(`
        * * Field Name: DriverClass
        * * Display Name: Driver Class
        * * SQL Data Type: nvarchar(100)`),
    DriverImportPath: z.string().nullish().describe(`
        * * Field Name: DriverImportPath
        * * Display Name: Driver Import Path
        * * SQL Data Type: nvarchar(200)`),
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

export type QueueTypeEntityType = z.infer<typeof QueueTypeSchema>;
       
/**
 * zod schema definition for the entity Queues
 */
export const QueueSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(50)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    QueueTypeID: z.string().describe(`
        * * Field Name: QueueTypeID
        * * Display Name: Queue Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Queue Types (vwQueueTypes.ID)`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 0`),
    ProcessPID: z.number().nullish().describe(`
        * * Field Name: ProcessPID
        * * Display Name: Process PID
        * * SQL Data Type: int`),
    ProcessPlatform: z.string().nullish().describe(`
        * * Field Name: ProcessPlatform
        * * Display Name: Process Platform
        * * SQL Data Type: nvarchar(30)`),
    ProcessVersion: z.string().nullish().describe(`
        * * Field Name: ProcessVersion
        * * Display Name: Process Version
        * * SQL Data Type: nvarchar(15)`),
    ProcessCwd: z.string().nullish().describe(`
        * * Field Name: ProcessCwd
        * * Display Name: Process Cwd
        * * SQL Data Type: nvarchar(100)`),
    ProcessIPAddress: z.string().nullish().describe(`
        * * Field Name: ProcessIPAddress
        * * Display Name: Process IPAddress
        * * SQL Data Type: nvarchar(50)`),
    ProcessMacAddress: z.string().nullish().describe(`
        * * Field Name: ProcessMacAddress
        * * Display Name: Process Mac Address
        * * SQL Data Type: nvarchar(50)`),
    ProcessOSName: z.string().nullish().describe(`
        * * Field Name: ProcessOSName
        * * Display Name: Process OSName
        * * SQL Data Type: nvarchar(25)`),
    ProcessOSVersion: z.string().nullish().describe(`
        * * Field Name: ProcessOSVersion
        * * Display Name: Process OSVersion
        * * SQL Data Type: nvarchar(10)`),
    ProcessHostName: z.string().nullish().describe(`
        * * Field Name: ProcessHostName
        * * Display Name: Process Host Name
        * * SQL Data Type: nvarchar(50)`),
    ProcessUserID: z.string().nullish().describe(`
        * * Field Name: ProcessUserID
        * * Display Name: Process User ID
        * * SQL Data Type: nvarchar(25)`),
    ProcessUserName: z.string().nullish().describe(`
        * * Field Name: ProcessUserName
        * * Display Name: Process User Name
        * * SQL Data Type: nvarchar(50)`),
    LastHeartbeat: z.date().describe(`
        * * Field Name: LastHeartbeat
        * * Display Name: Last Heartbeat
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
    QueueType: z.string().describe(`
        * * Field Name: QueueType
        * * Display Name: Queue Type
        * * SQL Data Type: nvarchar(50)`),
});

export type QueueEntityType = z.infer<typeof QueueSchema>;
       
/**
 * zod schema definition for the entity Recommendation Items
 */
export const RecommendationItemSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    RecommendationID: z.string().describe(`
        * * Field Name: RecommendationID
        * * Display Name: Recommendation ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Recommendations (vwRecommendations.ID)`),
    DestinationEntityID: z.string().describe(`
        * * Field Name: DestinationEntityID
        * * Display Name: Destination Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    DestinationEntityRecordID: z.string().describe(`
        * * Field Name: DestinationEntityRecordID
        * * Display Name: Destination Entity Record ID
        * * SQL Data Type: nvarchar(450)
    * * Description: The record ID of the destination entity`),
    MatchProbability: z.number().nullish().describe(`
        * * Field Name: MatchProbability
        * * Display Name: Match Probability
        * * SQL Data Type: decimal(18, 15)
    * * Description: A value between 0 and 1 indicating the probability of the match, higher numbers indicating a more certain match/recommendation.`),
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
    DestinationEntity: z.string().describe(`
        * * Field Name: DestinationEntity
        * * Display Name: Destination Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type RecommendationItemEntityType = z.infer<typeof RecommendationItemSchema>;
       
/**
 * zod schema definition for the entity Recommendation Providers
 */
export const RecommendationProviderSchema = z.object({
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

export type RecommendationProviderEntityType = z.infer<typeof RecommendationProviderSchema>;
       
/**
 * zod schema definition for the entity Recommendation Runs
 */
export const RecommendationRunSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    RecommendationProviderID: z.string().describe(`
        * * Field Name: RecommendationProviderID
        * * Display Name: Recommendation Provider ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Recommendation Providers (vwRecommendationProviders.ID)`),
    StartDate: z.date().describe(`
        * * Field Name: StartDate
        * * Display Name: Start Date
        * * SQL Data Type: datetime
    * * Description: The start date of the recommendation run`),
    EndDate: z.date().nullish().describe(`
        * * Field Name: EndDate
        * * Display Name: End Date
        * * SQL Data Type: datetime
    * * Description: The end date of the recommendation run`),
    Status: z.union([z.literal('Pending'), z.literal('In Progress'), z.literal('Completed'), z.literal('Canceled'), z.literal('Error')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * In Progress
    *   * Completed
    *   * Canceled
    *   * Error
    * * Description: The status of the recommendation run`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    RunByUserID: z.string().describe(`
        * * Field Name: RunByUserID
        * * Display Name: Run By User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
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
    RecommendationProvider: z.string().describe(`
        * * Field Name: RecommendationProvider
        * * Display Name: Recommendation Provider
        * * SQL Data Type: nvarchar(255)`),
    RunByUser: z.string().describe(`
        * * Field Name: RunByUser
        * * Display Name: Run By User
        * * SQL Data Type: nvarchar(100)`),
});

export type RecommendationRunEntityType = z.infer<typeof RecommendationRunSchema>;
       
/**
 * zod schema definition for the entity Recommendations
 */
export const RecommendationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    RecommendationRunID: z.string().describe(`
        * * Field Name: RecommendationRunID
        * * Display Name: Recommendation Run ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Recommendation Runs (vwRecommendationRuns.ID)`),
    SourceEntityID: z.string().describe(`
        * * Field Name: SourceEntityID
        * * Display Name: Source Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    SourceEntityRecordID: z.string().describe(`
        * * Field Name: SourceEntityRecordID
        * * Display Name: Source Entity Record ID
        * * SQL Data Type: nvarchar(MAX)
    * * Description: The record ID of the source entity`),
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
    SourceEntity: z.string().describe(`
        * * Field Name: SourceEntity
        * * Display Name: Source Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type RecommendationEntityType = z.infer<typeof RecommendationSchema>;
       
/**
 * zod schema definition for the entity Record Change Replay Runs
 */
export const RecordChangeReplayRunSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    StartedAt: z.date().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime
    * * Description: Timestamp when the replay run started`),
    EndedAt: z.date().nullish().describe(`
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime
    * * Description: Timestamp when the replay run ended`),
    Status: z.union([z.literal('Pending'), z.literal('In Progress'), z.literal('Complete'), z.literal('Error')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * In Progress
    *   * Complete
    *   * Error
    * * Description: Status of the replay run (Pending, In Progress, Complete, Error)`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
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
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
});

export type RecordChangeReplayRunEntityType = z.infer<typeof RecordChangeReplayRunSchema>;
       
/**
 * zod schema definition for the entity Record Changes
 */
export const RecordChangeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    RecordID: z.string().describe(`
        * * Field Name: RecordID
        * * Display Name: Record
        * * SQL Data Type: nvarchar(750)`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    Type: z.union([z.literal('Create'), z.literal('Update'), z.literal('Delete')]).describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Create
    * * Value List Type: List
    * * Possible Values 
    *   * Create
    *   * Update
    *   * Delete
    * * Description: Create, Update, or Delete`),
    Source: z.union([z.literal('Internal'), z.literal('External')]).describe(`
        * * Field Name: Source
        * * Display Name: Source
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Internal
    * * Value List Type: List
    * * Possible Values 
    *   * Internal
    *   * External
    * * Description: Internal or External`),
    ChangedAt: z.date().describe(`
        * * Field Name: ChangedAt
        * * Display Name: Changed At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()
    * * Description: The date/time that the change occured.`),
    ChangesJSON: z.string().describe(`
        * * Field Name: ChangesJSON
        * * Display Name: Changes JSON
        * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON structure that describes what was changed in a structured format.`),
    ChangesDescription: z.string().describe(`
        * * Field Name: ChangesDescription
        * * Display Name: Changes Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: A generated, human-readable description of what was changed.`),
    FullRecordJSON: z.string().describe(`
        * * Field Name: FullRecordJSON
        * * Display Name: Full Record JSON
        * * SQL Data Type: nvarchar(MAX)
    * * Description: A complete snapshot of the record AFTER the change was applied in a JSON format that can be parsed.`),
    Status: z.union([z.literal('Pending'), z.literal('Complete'), z.literal('Error')]).describe(`
        * * Field Name: Status
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Complete
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Complete
    *   * Error
    * * Description: For internal record changes generated within MJ, the status is immediately Complete. For external changes that are detected, the workflow starts off as Pending, then In Progress and finally either Complete or Error`),
    ErrorLog: z.string().nullish().describe(`
        * * Field Name: ErrorLog
        * * Display Name: Error Log
        * * SQL Data Type: nvarchar(MAX)`),
    ReplayRunID: z.string().nullish().describe(`
        * * Field Name: ReplayRunID
        * * Display Name: Replay Run ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Record Change Replay Runs (vwRecordChangeReplayRuns.ID)`),
    IntegrationID: z.string().nullish().describe(`
        * * Field Name: IntegrationID
        * * Display Name: Integration ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Integrations (vwIntegrations.ID)`),
    Comments: z.string().nullish().describe(`
        * * Field Name: Comments
        * * SQL Data Type: nvarchar(MAX)`),
    CreatedAt: z.date().describe(`
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    UpdatedAt: z.date().describe(`
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
    Integration: z.string().nullish().describe(`
        * * Field Name: Integration
        * * Display Name: Integration
        * * SQL Data Type: nvarchar(100)`),
});

export type RecordChangeEntityType = z.infer<typeof RecordChangeSchema>;
       
/**
 * zod schema definition for the entity Record Merge Deletion Logs
 */
export const RecordMergeDeletionLogSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    RecordMergeLogID: z.string().describe(`
        * * Field Name: RecordMergeLogID
        * * Display Name: Record Merge Log ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Record Merge Logs (vwRecordMergeLogs.ID)`),
    DeletedRecordID: z.string().describe(`
        * * Field Name: DeletedRecordID
        * * Display Name: Deleted Record ID
        * * SQL Data Type: nvarchar(750)`),
    Status: z.union([z.literal('Pending'), z.literal('Complete'), z.literal('Error')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Complete
    *   * Error`),
    ProcessingLog: z.string().nullish().describe(`
        * * Field Name: ProcessingLog
        * * Display Name: Processing Log
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

export type RecordMergeDeletionLogEntityType = z.infer<typeof RecordMergeDeletionLogSchema>;
       
/**
 * zod schema definition for the entity Record Merge Logs
 */
export const RecordMergeLogSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    SurvivingRecordID: z.string().describe(`
        * * Field Name: SurvivingRecordID
        * * Display Name: Surviving Record ID
        * * SQL Data Type: nvarchar(450)`),
    InitiatedByUserID: z.string().describe(`
        * * Field Name: InitiatedByUserID
        * * Display Name: Initiated By User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    ApprovalStatus: z.union([z.literal('Pending'), z.literal('Approved'), z.literal('Rejected')]).describe(`
        * * Field Name: ApprovalStatus
        * * Display Name: Approval Status
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Approved
    *   * Rejected`),
    ApprovedByUserID: z.string().nullish().describe(`
        * * Field Name: ApprovedByUserID
        * * Display Name: Approved By User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    ProcessingStatus: z.union([z.literal('Started'), z.literal('Complete'), z.literal('Error')]).describe(`
        * * Field Name: ProcessingStatus
        * * Display Name: Processing Status
        * * SQL Data Type: nvarchar(10)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Started
    *   * Complete
    *   * Error`),
    ProcessingStartedAt: z.date().describe(`
        * * Field Name: ProcessingStartedAt
        * * Display Name: Processing Started At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    ProcessingEndedAt: z.date().nullish().describe(`
        * * Field Name: ProcessingEndedAt
        * * Display Name: Processing Ended At
        * * SQL Data Type: datetime`),
    ProcessingLog: z.string().nullish().describe(`
        * * Field Name: ProcessingLog
        * * Display Name: Processing Log
        * * SQL Data Type: nvarchar(MAX)`),
    Comments: z.string().nullish().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
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
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    InitiatedByUser: z.string().describe(`
        * * Field Name: InitiatedByUser
        * * Display Name: Initiated By User
        * * SQL Data Type: nvarchar(100)`),
    ApprovedByUser: z.string().nullish().describe(`
        * * Field Name: ApprovedByUser
        * * Display Name: Approved By User
        * * SQL Data Type: nvarchar(100)`),
});

export type RecordMergeLogEntityType = z.infer<typeof RecordMergeLogSchema>;
       
/**
 * zod schema definition for the entity Report Categories
 */
export const ReportCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    ParentID: z.string().nullish().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Report Categories (vwReportCategories.ID)`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
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
    Parent: z.string().nullish().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(100)`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
});

export type ReportCategoryEntityType = z.infer<typeof ReportCategorySchema>;
       
/**
 * zod schema definition for the entity Report Snapshots
 */
export const ReportSnapshotSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ReportID: z.string().describe(`
        * * Field Name: ReportID
        * * Display Name: Report ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Reports (vwReports.ID)`),
    ResultSet: z.string().describe(`
        * * Field Name: ResultSet
        * * Display Name: Result Set
        * * SQL Data Type: nvarchar(MAX)`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
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
    Report: z.string().describe(`
        * * Field Name: Report
        * * Display Name: Report
        * * SQL Data Type: nvarchar(255)`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
});

export type ReportSnapshotEntityType = z.infer<typeof ReportSnapshotSchema>;
       
/**
 * zod schema definition for the entity Reports
 */
export const ReportSchema = z.object({
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
    CategoryID: z.string().nullish().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Report Categories (vwReportCategories.ID)`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    SharingScope: z.union([z.literal('None'), z.literal('Specific'), z.literal('Everyone')]).describe(`
        * * Field Name: SharingScope
        * * Display Name: Sharing Scope
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Personal
    * * Value List Type: List
    * * Possible Values 
    *   * None
    *   * Specific
    *   * Everyone`),
    ConversationID: z.string().nullish().describe(`
        * * Field Name: ConversationID
        * * Display Name: Conversation ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Conversations (vwConversations.ID)`),
    ConversationDetailID: z.string().nullish().describe(`
        * * Field Name: ConversationDetailID
        * * Display Name: Conversation Detail ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Conversation Details (vwConversationDetails.ID)`),
    DataContextID: z.string().nullish().describe(`
        * * Field Name: DataContextID
        * * Display Name: Data Context ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Data Contexts (vwDataContexts.ID)`),
    Configuration: z.string().nullish().describe(`
        * * Field Name: Configuration
        * * Display Name: Configuration
        * * SQL Data Type: nvarchar(MAX)`),
    OutputTriggerTypeID: z.string().nullish().describe(`
        * * Field Name: OutputTriggerTypeID
        * * Display Name: Output Trigger Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Output Trigger Types (vwOutputTriggerTypes.ID)`),
    OutputFormatTypeID: z.string().nullish().describe(`
        * * Field Name: OutputFormatTypeID
        * * Display Name: Output Format Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Output Format Types (vwOutputFormatTypes.ID)`),
    OutputDeliveryTypeID: z.string().nullish().describe(`
        * * Field Name: OutputDeliveryTypeID
        * * Display Name: Output Delivery Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Output Delivery Types (vwOutputDeliveryTypes.ID)`),
    OutputFrequency: z.string().nullish().describe(`
        * * Field Name: OutputFrequency
        * * Display Name: Output Frequency
        * * SQL Data Type: nvarchar(50)`),
    OutputTargetEmail: z.string().nullish().describe(`
        * * Field Name: OutputTargetEmail
        * * Display Name: Output Target Email
        * * SQL Data Type: nvarchar(255)`),
    OutputWorkflowID: z.string().nullish().describe(`
        * * Field Name: OutputWorkflowID
        * * Display Name: Output Workflow ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Workflows (vwWorkflows.ID)`),
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
    Category: z.string().nullish().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(100)`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
    Conversation: z.string().nullish().describe(`
        * * Field Name: Conversation
        * * Display Name: Conversation
        * * SQL Data Type: nvarchar(255)`),
    DataContext: z.string().nullish().describe(`
        * * Field Name: DataContext
        * * Display Name: Data Context
        * * SQL Data Type: nvarchar(255)`),
    OutputTriggerType: z.string().nullish().describe(`
        * * Field Name: OutputTriggerType
        * * Display Name: Output Trigger Type
        * * SQL Data Type: nvarchar(255)`),
    OutputFormatType: z.string().nullish().describe(`
        * * Field Name: OutputFormatType
        * * Display Name: Output Format Type
        * * SQL Data Type: nvarchar(255)`),
    OutputDeliveryType: z.string().nullish().describe(`
        * * Field Name: OutputDeliveryType
        * * Display Name: Output Delivery Type
        * * SQL Data Type: nvarchar(255)`),
    OutputWorkflow: z.string().nullish().describe(`
        * * Field Name: OutputWorkflow
        * * Display Name: Output Workflow
        * * SQL Data Type: nvarchar(100)`),
});

export type ReportEntityType = z.infer<typeof ReportSchema>;
       
/**
 * zod schema definition for the entity Resource Types
 */
export const ResourceTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    DisplayName: z.string().describe(`
        * * Field Name: DisplayName
        * * Display Name: Display Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    Icon: z.string().nullish().describe(`
        * * Field Name: Icon
        * * Display Name: Icon
        * * SQL Data Type: nvarchar(100)`),
    EntityID: z.string().nullish().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Entity: z.string().nullish().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type ResourceTypeEntityType = z.infer<typeof ResourceTypeSchema>;
       
/**
 * zod schema definition for the entity Roles
 */
export const RoleSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * SQL Data Type: nvarchar(50)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the role`),
    DirectoryID: z.string().nullish().describe(`
        * * Field Name: DirectoryID
        * * Display Name: Directory ID
        * * SQL Data Type: nvarchar(250)
    * * Description: The unique ID of the role in the directory being used for authentication, for example an ID in Azure.`),
    SQLName: z.string().nullish().describe(`
        * * Field Name: SQLName
        * * SQL Data Type: nvarchar(250)
    * * Description: The name of the role in the database, this is used for auto-generating permission statements by CodeGen`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type RoleEntityType = z.infer<typeof RoleSchema>;
       
/**
 * zod schema definition for the entity Row Level Security Filters
 */
export const RowLevelSecurityFilterSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    FilterText: z.string().nullish().describe(`
        * * Field Name: FilterText
        * * Display Name: Filter Text
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type RowLevelSecurityFilterEntityType = z.infer<typeof RowLevelSecurityFilterSchema>;
       
/**
 * zod schema definition for the entity Scheduled Action Params
 */
export const ScheduledActionParamSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ScheduledActionID: z.string().describe(`
        * * Field Name: ScheduledActionID
        * * Display Name: Scheduled Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Scheduled Actions (vwScheduledActions.ID)`),
    ActionParamID: z.string().describe(`
        * * Field Name: ActionParamID
        * * Display Name: Action Param ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Action Params (vwActionParams.ID)`),
    ValueType: z.union([z.literal('Static'), z.literal('SQL Statement')]).describe(`
        * * Field Name: ValueType
        * * Display Name: Value Type
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Static
    *   * SQL Statement`),
    Value: z.string().nullish().describe(`
        * * Field Name: Value
        * * Display Name: Value
        * * SQL Data Type: nvarchar(MAX)`),
    Comments: z.string().nullish().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
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
    ScheduledAction: z.string().describe(`
        * * Field Name: ScheduledAction
        * * Display Name: Scheduled Action
        * * SQL Data Type: nvarchar(255)`),
    ActionParam: z.string().describe(`
        * * Field Name: ActionParam
        * * Display Name: Action Param
        * * SQL Data Type: nvarchar(255)`),
});

export type ScheduledActionParamEntityType = z.infer<typeof ScheduledActionParamSchema>;
       
/**
 * zod schema definition for the entity Scheduled Actions
 */
export const ScheduledActionSchema = z.object({
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
    CreatedByUserID: z.string().describe(`
        * * Field Name: CreatedByUserID
        * * Display Name: Created By User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    ActionID: z.string().describe(`
        * * Field Name: ActionID
        * * Display Name: Action ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Actions (vwActions.ID)`),
    Type: z.union([z.literal('Daily'), z.literal('Weekly'), z.literal('Monthly'), z.literal('Yearly'), z.literal('Custom')]).describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Daily
    *   * Weekly
    *   * Monthly
    *   * Yearly
    *   * Custom
    * * Description: Type of the scheduled action (Daily, Weekly, Monthly, Yearly, Custom)`),
    CronExpression: z.string().nullish().describe(`
        * * Field Name: CronExpression
        * * Display Name: Cron Expression
        * * SQL Data Type: nvarchar(100)
    * * Description: Cron expression defining the schedule, automatically maintained by the system unless Type is Custom, in which case the user directly sets this`),
    Timezone: z.string().describe(`
        * * Field Name: Timezone
        * * Display Name: Timezone
        * * SQL Data Type: nvarchar(100)
    * * Description: Timezone for the scheduled action, if not specified defaults to UTC/Z`),
    Status: z.union([z.literal('Pending'), z.literal('Active'), z.literal('Disabled'), z.literal('Expired')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Active
    *   * Disabled
    *   * Expired
    * * Description: Status of the scheduled action (Pending, Active, Disabled, Expired)`),
    IntervalDays: z.number().nullish().describe(`
        * * Field Name: IntervalDays
        * * Display Name: Interval Days
        * * SQL Data Type: int
    * * Description: Interval in days for the scheduled action`),
    DayOfWeek: z.string().nullish().describe(`
        * * Field Name: DayOfWeek
        * * Display Name: Day Of Week
        * * SQL Data Type: nvarchar(20)
    * * Description: Day of the week for the scheduled action`),
    DayOfMonth: z.number().nullish().describe(`
        * * Field Name: DayOfMonth
        * * Display Name: Day Of Month
        * * SQL Data Type: int
    * * Description: Day of the month for the scheduled action`),
    Month: z.string().nullish().describe(`
        * * Field Name: Month
        * * Display Name: Month
        * * SQL Data Type: nvarchar(20)
    * * Description: Month for the scheduled action`),
    CustomCronExpression: z.string().nullish().describe(`
        * * Field Name: CustomCronExpression
        * * Display Name: Custom Cron Expression
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
    CreatedByUser: z.string().describe(`
        * * Field Name: CreatedByUser
        * * Display Name: Created By User
        * * SQL Data Type: nvarchar(100)`),
    Action: z.string().describe(`
        * * Field Name: Action
        * * Display Name: Action
        * * SQL Data Type: nvarchar(425)`),
});

export type ScheduledActionEntityType = z.infer<typeof ScheduledActionSchema>;
       
/**
 * zod schema definition for the entity Schema Info
 */
export const SchemaInfoSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    SchemaName: z.string().describe(`
        * * Field Name: SchemaName
        * * Display Name: Schema Name
        * * SQL Data Type: nvarchar(50)`),
    EntityIDMin: z.number().describe(`
        * * Field Name: EntityIDMin
        * * Display Name: Entity IDMin
        * * SQL Data Type: int`),
    EntityIDMax: z.number().describe(`
        * * Field Name: EntityIDMax
        * * Display Name: Entity IDMax
        * * SQL Data Type: int`),
    Comments: z.string().nullish().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
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

export type SchemaInfoEntityType = z.infer<typeof SchemaInfoSchema>;
       
/**
 * zod schema definition for the entity Skills
 */
export const SkillSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * SQL Data Type: nvarchar(50)`),
    ParentID: z.string().nullish().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Skills (vwSkills.ID)`),
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
    Parent: z.string().nullish().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(50)`),
});

export type SkillEntityType = z.infer<typeof SkillSchema>;
       
/**
 * zod schema definition for the entity Tagged Items
 */
export const TaggedItemSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TagID: z.string().describe(`
        * * Field Name: TagID
        * * Display Name: Tag ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Tags (vwTags.ID)`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    RecordID: z.string().describe(`
        * * Field Name: RecordID
        * * Display Name: Record ID
        * * SQL Data Type: nvarchar(450)`),
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
        * * SQL Data Type: nvarchar(255)`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type TaggedItemEntityType = z.infer<typeof TaggedItemSchema>;
       
/**
 * zod schema definition for the entity Tags
 */
export const TagSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    ParentID: z.string().nullish().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Tags (vwTags.ID)`),
    DisplayName: z.string().describe(`
        * * Field Name: DisplayName
        * * Display Name: Display Name
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
    Parent: z.string().nullish().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(255)`),
});

export type TagEntityType = z.infer<typeof TagSchema>;
       
/**
 * zod schema definition for the entity Template Categories
 */
export const TemplateCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
    * * Description: Name of the template category`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the template category`),
    ParentID: z.string().nullish().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Template Categories (vwTemplateCategories.ID)`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
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
    Parent: z.string().nullish().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(255)`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
});

export type TemplateCategoryEntityType = z.infer<typeof TemplateCategorySchema>;
       
/**
 * zod schema definition for the entity Template Content Types
 */
export const TemplateContentTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
    * * Description: Name of the template content type`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the template content type`),
    CodeType: z.union([z.literal('TypeScript'), z.literal('SQL'), z.literal('HTML'), z.literal('CSS'), z.literal('JavaScript'), z.literal('JSON'), z.literal('Other')]).describe(`
        * * Field Name: CodeType
        * * Display Name: Code Type
        * * SQL Data Type: nvarchar(25)
        * * Default Value: Other
    * * Value List Type: List
    * * Possible Values 
    *   * TypeScript
    *   * SQL
    *   * HTML
    *   * CSS
    *   * JavaScript
    *   * JSON
    *   * Other
    * * Description: Refers to the primary language or codetype of the templates of this type, HTML, JSON, JavaScript, etc`),
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

export type TemplateContentTypeEntityType = z.infer<typeof TemplateContentTypeSchema>;
       
/**
 * zod schema definition for the entity Template Contents
 */
export const TemplateContentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TemplateID: z.string().describe(`
        * * Field Name: TemplateID
        * * Display Name: Template ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Templates (vwTemplates.ID)`),
    TypeID: z.string().describe(`
        * * Field Name: TypeID
        * * Display Name: Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Template Content Types (vwTemplateContentTypes.ID)`),
    TemplateText: z.string().nullish().describe(`
        * * Field Name: TemplateText
        * * Display Name: Template Text
        * * SQL Data Type: nvarchar(MAX)
    * * Description: The actual text content for the template`),
    Priority: z.number().describe(`
        * * Field Name: Priority
        * * Display Name: Priority
        * * SQL Data Type: int
    * * Description: Priority of the content version, higher priority versions will be used ahead of lower priority versions for a given Type`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: Indicates whether the content is active or not. Use this to disable a particular Template Content item without having to remove it`),
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
    Template: z.string().describe(`
        * * Field Name: Template
        * * Display Name: Template
        * * SQL Data Type: nvarchar(255)`),
    Type: z.string().describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(255)`),
});

export type TemplateContentEntityType = z.infer<typeof TemplateContentSchema>;
       
/**
 * zod schema definition for the entity Template Params
 */
export const TemplateParamSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    TemplateID: z.string().describe(`
        * * Field Name: TemplateID
        * * Display Name: Template ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Templates (vwTemplates.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
    * * Description: Name of the parameter`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the parameter`),
    Type: z.union([z.literal('Scalar'), z.literal('Array'), z.literal('Object'), z.literal('Record'), z.literal('Entity')]).describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Scalar
    * * Value List Type: List
    * * Possible Values 
    *   * Scalar
    *   * Array
    *   * Object
    *   * Record
    *   * Entity
    * * Description: Type of the parameter - Record is an individual record within the entity specified by EntityID. Entity means an entire Entity or an entity filtered by the LinkedParameterName/Field attributes and/or ExtraFilter. Object is any valid JSON object. Array and Scalar have their common meanings.`),
    DefaultValue: z.string().nullish().describe(`
        * * Field Name: DefaultValue
        * * Display Name: Default Value
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Default value of the parameter`),
    IsRequired: z.boolean().describe(`
        * * Field Name: IsRequired
        * * Display Name: Is Required
        * * SQL Data Type: bit
        * * Default Value: 0`),
    LinkedParameterName: z.string().nullish().describe(`
        * * Field Name: LinkedParameterName
        * * Display Name: Linked Parameter Name
        * * SQL Data Type: nvarchar(255)
    * * Description: Only used when Type=Entity, this is used to link an Entity parameter with another parameter so that the rows in the Entity parameter can be filtered automatically based on the FKEY relationship between the Record and this Entity parameter. For example, if the Entity-based parameter is for an entity like Activities and there is another parameter of type Record for an entity like Contacts, in that situation the Activities Parameter would point to the Contacts parameter as the LinkedParameterName because we would filter down the Activities in each template render to only those linked to the Contact.`),
    LinkedParameterField: z.string().nullish().describe(`
        * * Field Name: LinkedParameterField
        * * Display Name: Linked Parameter Field
        * * SQL Data Type: nvarchar(500)
    * * Description: If the LinkedParameterName is specified, this is an optional setting to specify the field within the LinkedParameter that will be used for filtering. This is only needed if there is more than one foreign key relationship between the Entity parameter and the Linked parameter, or if there is no defined foreign key in the database between the two entities.`),
    ExtraFilter: z.string().nullish().describe(`
        * * Field Name: ExtraFilter
        * * Display Name: Extra Filter
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Only used when Type = Entity, used to specify an optional filter to reduce the set of rows that are returned for each of the templates being rendered.`),
    EntityID: z.string().nullish().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    RecordID: z.string().nullish().describe(`
        * * Field Name: RecordID
        * * Display Name: Record ID
        * * SQL Data Type: nvarchar(2000)
    * * Description: Record ID, used only when Type is Record and a specific hardcoded record ID is desired, this is an uncommon use case, helpful for pulling in static types and metadata in some cases.`),
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
    Template: z.string().describe(`
        * * Field Name: Template
        * * Display Name: Template
        * * SQL Data Type: nvarchar(255)`),
    Entity: z.string().nullish().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type TemplateParamEntityType = z.infer<typeof TemplateParamSchema>;
       
/**
 * zod schema definition for the entity Templates
 */
export const TemplateSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
    * * Description: Name of the template`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the template`),
    CategoryID: z.string().nullish().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Template Categories (vwTemplateCategories.ID)`),
    UserPrompt: z.string().nullish().describe(`
        * * Field Name: UserPrompt
        * * Display Name: User Prompt
        * * SQL Data Type: nvarchar(MAX)
    * * Description: This prompt will be used by the AI to generate template content as requested by the user.`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    ActiveAt: z.date().nullish().describe(`
        * * Field Name: ActiveAt
        * * Display Name: Active At
        * * SQL Data Type: datetime
    * * Description: Optional, if provided, this template will not be available for use until the specified date. Requires IsActive to be set to 1`),
    DisabledAt: z.date().nullish().describe(`
        * * Field Name: DisabledAt
        * * Display Name: Disabled At
        * * SQL Data Type: datetime
    * * Description: Optional, if provided, this template will not be available for use after the specified date. If IsActive=0, this has no effect.`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 1
    * * Description: If set to 0, the template will be disabled regardless of the values in ActiveAt/DisabledAt. `),
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
    Category: z.string().nullish().describe(`
        * * Field Name: Category
        * * Display Name: Category
        * * SQL Data Type: nvarchar(255)`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
});

export type TemplateEntityType = z.infer<typeof TemplateSchema>;
       
/**
 * zod schema definition for the entity User Application Entities
 */
export const UserApplicationEntitySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    UserApplicationID: z.string().describe(`
        * * Field Name: UserApplicationID
        * * Display Name: UserApplication ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: User Applications (vwUserApplications.ID)`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * SQL Data Type: int
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
    Application: z.string().describe(`
        * * Field Name: Application
        * * Display Name: Application
        * * SQL Data Type: nvarchar(100)`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type UserApplicationEntityEntityType = z.infer<typeof UserApplicationEntitySchema>;
       
/**
 * zod schema definition for the entity User Applications
 */
export const UserApplicationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    ApplicationID: z.string().describe(`
        * * Field Name: ApplicationID
        * * Display Name: Application ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Applications (vwApplications.ID)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0`),
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
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
    Application: z.string().describe(`
        * * Field Name: Application
        * * Display Name: Application
        * * SQL Data Type: nvarchar(100)`),
});

export type UserApplicationEntityType = z.infer<typeof UserApplicationSchema>;
       
/**
 * zod schema definition for the entity User Favorites
 */
export const UserFavoriteSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    RecordID: z.string().describe(`
        * * Field Name: RecordID
        * * Display Name: Record
        * * SQL Data Type: nvarchar(450)`),
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
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    EntityBaseTable: z.string().describe(`
        * * Field Name: EntityBaseTable
        * * Display Name: Entity Base Table
        * * SQL Data Type: nvarchar(255)`),
    EntityBaseView: z.string().describe(`
        * * Field Name: EntityBaseView
        * * Display Name: Entity Base View
        * * SQL Data Type: nvarchar(255)`),
});

export type UserFavoriteEntityType = z.infer<typeof UserFavoriteSchema>;
       
/**
 * zod schema definition for the entity User Notifications
 */
export const UserNotificationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    Title: z.string().nullish().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(255)`),
    Message: z.string().nullish().describe(`
        * * Field Name: Message
        * * Display Name: Message
        * * SQL Data Type: nvarchar(MAX)`),
    ResourceTypeID: z.string().nullish().describe(`
        * * Field Name: ResourceTypeID
        * * Display Name: Resource Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Resource Types (vwResourceTypes.ID)`),
    ResourceConfiguration: z.string().nullish().describe(`
        * * Field Name: ResourceConfiguration
        * * Display Name: Resource Configuration
        * * SQL Data Type: nvarchar(MAX)`),
    Unread: z.boolean().describe(`
        * * Field Name: Unread
        * * Display Name: Unread
        * * SQL Data Type: bit
        * * Default Value: 1`),
    ReadAt: z.date().nullish().describe(`
        * * Field Name: ReadAt
        * * Display Name: Read At
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
    ResourceRecordID: z.string().nullish().describe(`
        * * Field Name: ResourceRecordID
        * * Display Name: Resource Record ID
        * * SQL Data Type: uniqueidentifier`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
    ResourceType: z.string().nullish().describe(`
        * * Field Name: ResourceType
        * * Display Name: Resource Type
        * * SQL Data Type: nvarchar(255)`),
});

export type UserNotificationEntityType = z.infer<typeof UserNotificationSchema>;
       
/**
 * zod schema definition for the entity User Record Logs
 */
export const UserRecordLogSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    RecordID: z.string().describe(`
        * * Field Name: RecordID
        * * Display Name: Record
        * * SQL Data Type: nvarchar(450)`),
    EarliestAt: z.date().describe(`
        * * Field Name: EarliestAt
        * * Display Name: Earliest At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    LatestAt: z.date().describe(`
        * * Field Name: LatestAt
        * * Display Name: Latest At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    TotalCount: z.number().describe(`
        * * Field Name: TotalCount
        * * Display Name: Total Count
        * * SQL Data Type: int
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
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    UserName: z.string().describe(`
        * * Field Name: UserName
        * * Display Name: User Name
        * * SQL Data Type: nvarchar(100)`),
    UserFirstLast: z.string().nullish().describe(`
        * * Field Name: UserFirstLast
        * * Display Name: User First Last
        * * SQL Data Type: nvarchar(101)`),
    UserEmail: z.string().describe(`
        * * Field Name: UserEmail
        * * Display Name: User Email
        * * SQL Data Type: nvarchar(100)`),
    UserSupervisor: z.string().nullish().describe(`
        * * Field Name: UserSupervisor
        * * Display Name: User Supervisor
        * * SQL Data Type: nvarchar(81)`),
    UserSupervisorEmail: z.string().nullish().describe(`
        * * Field Name: UserSupervisorEmail
        * * Display Name: User Supervisor Email
        * * SQL Data Type: nvarchar(100)`),
});

export type UserRecordLogEntityType = z.infer<typeof UserRecordLogSchema>;
       
/**
 * zod schema definition for the entity User Roles
 */
export const UserRoleSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    RoleID: z.string().describe(`
        * * Field Name: RoleID
        * * Display Name: Role ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Roles (vwRoles.ID)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
    Role: z.string().describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(50)`),
});

export type UserRoleEntityType = z.infer<typeof UserRoleSchema>;
       
/**
 * zod schema definition for the entity User View Categories
 */
export const UserViewCategorySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    ParentID: z.string().nullish().describe(`
        * * Field Name: ParentID
        * * Display Name: Parent ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: User View Categories (vwUserViewCategories.ID)`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
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
    Parent: z.string().nullish().describe(`
        * * Field Name: Parent
        * * Display Name: Parent
        * * SQL Data Type: nvarchar(100)`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
});

export type UserViewCategoryEntityType = z.infer<typeof UserViewCategorySchema>;
       
/**
 * zod schema definition for the entity User View Run Details
 */
export const UserViewRunDetailSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    UserViewRunID: z.string().describe(`
        * * Field Name: UserViewRunID
        * * Display Name: User View Run ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: User View Runs (vwUserViewRuns.ID)`),
    RecordID: z.string().describe(`
        * * Field Name: RecordID
        * * Display Name: Record
        * * SQL Data Type: nvarchar(450)`),
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
    UserViewID: z.string().describe(`
        * * Field Name: UserViewID
        * * Display Name: User View
        * * SQL Data Type: uniqueidentifier`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity
        * * SQL Data Type: uniqueidentifier`),
});

export type UserViewRunDetailEntityType = z.infer<typeof UserViewRunDetailSchema>;
       
/**
 * zod schema definition for the entity User View Runs
 */
export const UserViewRunSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    UserViewID: z.string().describe(`
        * * Field Name: UserViewID
        * * Display Name: User View ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: User Views (vwUserViews.ID)`),
    RunAt: z.date().describe(`
        * * Field Name: RunAt
        * * Display Name: Run At
        * * SQL Data Type: datetime`),
    RunByUserID: z.string().describe(`
        * * Field Name: RunByUserID
        * * Display Name: Run By User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
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
    UserView: z.string().describe(`
        * * Field Name: UserView
        * * Display Name: User View
        * * SQL Data Type: nvarchar(100)`),
    RunByUser: z.string().describe(`
        * * Field Name: RunByUser
        * * Display Name: Run By User
        * * SQL Data Type: nvarchar(100)`),
});

export type UserViewRunEntityType = z.infer<typeof UserViewRunSchema>;
       
/**
 * zod schema definition for the entity User Views
 */
export const UserViewSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    CategoryID: z.string().nullish().describe(`
        * * Field Name: CategoryID
        * * Display Name: Category ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: User View Categories (vwUserViewCategories.ID)`),
    IsShared: z.boolean().describe(`
        * * Field Name: IsShared
        * * Display Name: Is Shared
        * * SQL Data Type: bit
        * * Default Value: 0`),
    IsDefault: z.boolean().describe(`
        * * Field Name: IsDefault
        * * Display Name: Is Default
        * * SQL Data Type: bit
        * * Default Value: 0`),
    GridState: z.string().nullish().describe(`
        * * Field Name: GridState
        * * Display Name: Grid State
        * * SQL Data Type: nvarchar(MAX)`),
    FilterState: z.string().nullish().describe(`
        * * Field Name: FilterState
        * * Display Name: Filter State
        * * SQL Data Type: nvarchar(MAX)`),
    CustomFilterState: z.boolean().describe(`
        * * Field Name: CustomFilterState
        * * Display Name: Custom Filter State
        * * SQL Data Type: bit
        * * Default Value: 0`),
    SmartFilterEnabled: z.boolean().describe(`
        * * Field Name: SmartFilterEnabled
        * * Display Name: Smart Filter Enabled
        * * SQL Data Type: bit
        * * Default Value: 0`),
    SmartFilterPrompt: z.string().nullish().describe(`
        * * Field Name: SmartFilterPrompt
        * * Display Name: Smart Filter Prompt
        * * SQL Data Type: nvarchar(MAX)`),
    SmartFilterWhereClause: z.string().nullish().describe(`
        * * Field Name: SmartFilterWhereClause
        * * Display Name: Smart Filter Where Clause
        * * SQL Data Type: nvarchar(MAX)`),
    SmartFilterExplanation: z.string().nullish().describe(`
        * * Field Name: SmartFilterExplanation
        * * Display Name: Smart Filter Explanation
        * * SQL Data Type: nvarchar(MAX)`),
    WhereClause: z.string().nullish().describe(`
        * * Field Name: WhereClause
        * * Display Name: Where Clause
        * * SQL Data Type: nvarchar(MAX)`),
    CustomWhereClause: z.boolean().describe(`
        * * Field Name: CustomWhereClause
        * * Display Name: Custom Where Clause
        * * SQL Data Type: bit
        * * Default Value: 0`),
    SortState: z.string().nullish().describe(`
        * * Field Name: SortState
        * * Display Name: Sort State
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    UserName: z.string().describe(`
        * * Field Name: UserName
        * * Display Name: User Name
        * * SQL Data Type: nvarchar(100)`),
    UserFirstLast: z.string().nullish().describe(`
        * * Field Name: UserFirstLast
        * * Display Name: User First Last
        * * SQL Data Type: nvarchar(101)`),
    UserEmail: z.string().describe(`
        * * Field Name: UserEmail
        * * Display Name: User Email
        * * SQL Data Type: nvarchar(100)`),
    UserType: z.string().describe(`
        * * Field Name: UserType
        * * Display Name: User Type
        * * SQL Data Type: nchar(15)`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity
        * * SQL Data Type: nvarchar(255)`),
    EntityBaseView: z.string().describe(`
        * * Field Name: EntityBaseView
        * * Display Name: Entity Base View
        * * SQL Data Type: nvarchar(255)`),
});

export type UserViewEntityType = z.infer<typeof UserViewSchema>;
       
/**
 * zod schema definition for the entity Users
 */
export const UserSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * SQL Data Type: nvarchar(100)`),
    FirstName: z.string().nullish().describe(`
        * * Field Name: FirstName
        * * Display Name: First Name
        * * SQL Data Type: nvarchar(50)`),
    LastName: z.string().nullish().describe(`
        * * Field Name: LastName
        * * Display Name: Last Name
        * * SQL Data Type: nvarchar(50)`),
    Title: z.string().nullish().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(50)`),
    Email: z.string().describe(`
        * * Field Name: Email
        * * SQL Data Type: nvarchar(100)`),
    Type: z.union([z.literal('User'), z.literal('Owner')]).describe(`
        * * Field Name: Type
        * * SQL Data Type: nchar(15)
    * * Value List Type: List
    * * Possible Values 
    *   * User
    *   * Owner`),
    IsActive: z.boolean().describe(`
        * * Field Name: IsActive
        * * Display Name: Is Active
        * * SQL Data Type: bit
        * * Default Value: 0`),
    LinkedRecordType: z.string().describe(`
        * * Field Name: LinkedRecordType
        * * Display Name: Linked Record Type
        * * SQL Data Type: nchar(10)
        * * Default Value: None`),
    LinkedEntityID: z.string().nullish().describe(`
        * * Field Name: LinkedEntityID
        * * Display Name: Linked Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Entities (vwEntities.ID)`),
    LinkedEntityRecordID: z.string().nullish().describe(`
        * * Field Name: LinkedEntityRecordID
        * * Display Name: Linked Entity Record ID
        * * SQL Data Type: nvarchar(450)`),
    EmployeeID: z.string().nullish().describe(`
        * * Field Name: EmployeeID
        * * Display Name: Employee
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Employees (vwEmployees.ID)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: __mj _Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: __mj _Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    FirstLast: z.string().nullish().describe(`
        * * Field Name: FirstLast
        * * Display Name: First Last
        * * SQL Data Type: nvarchar(101)`),
    EmployeeFirstLast: z.string().nullish().describe(`
        * * Field Name: EmployeeFirstLast
        * * Display Name: Employee First Last
        * * SQL Data Type: nvarchar(81)`),
    EmployeeEmail: z.string().nullish().describe(`
        * * Field Name: EmployeeEmail
        * * Display Name: Employee Email
        * * SQL Data Type: nvarchar(100)`),
    EmployeeTitle: z.string().nullish().describe(`
        * * Field Name: EmployeeTitle
        * * Display Name: Employee Title
        * * SQL Data Type: nvarchar(50)`),
    EmployeeSupervisor: z.string().nullish().describe(`
        * * Field Name: EmployeeSupervisor
        * * Display Name: Employee Supervisor
        * * SQL Data Type: nvarchar(81)`),
    EmployeeSupervisorEmail: z.string().nullish().describe(`
        * * Field Name: EmployeeSupervisorEmail
        * * Display Name: Employee Supervisor Email
        * * SQL Data Type: nvarchar(100)`),
});

export type UserEntityType = z.infer<typeof UserSchema>;
       
/**
 * zod schema definition for the entity Vector Databases
 */
export const VectorDatabaseSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    DefaultURL: z.string().nullish().describe(`
        * * Field Name: DefaultURL
        * * Display Name: Default URL
        * * SQL Data Type: nvarchar(255)`),
    ClassKey: z.string().nullish().describe(`
        * * Field Name: ClassKey
        * * Display Name: Class Key
        * * SQL Data Type: nvarchar(100)`),
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

export type VectorDatabaseEntityType = z.infer<typeof VectorDatabaseSchema>;
       
/**
 * zod schema definition for the entity Vector Indexes
 */
export const VectorIndexSchema = z.object({
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
    VectorDatabaseID: z.string().describe(`
        * * Field Name: VectorDatabaseID
        * * Display Name: Vector Database ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Vector Databases (vwVectorDatabases.ID)`),
    EmbeddingModelID: z.string().describe(`
        * * Field Name: EmbeddingModelID
        * * Display Name: Embedding Model ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)`),
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
    VectorDatabase: z.string().describe(`
        * * Field Name: VectorDatabase
        * * Display Name: Vector Database
        * * SQL Data Type: nvarchar(100)`),
    EmbeddingModel: z.string().describe(`
        * * Field Name: EmbeddingModel
        * * Display Name: Embedding Model
        * * SQL Data Type: nvarchar(50)`),
});

export type VectorIndexEntityType = z.infer<typeof VectorIndexSchema>;
       
/**
 * zod schema definition for the entity Version Installations
 */
export const VersionInstallationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    MajorVersion: z.number().describe(`
        * * Field Name: MajorVersion
        * * Display Name: Major Version
        * * SQL Data Type: int`),
    MinorVersion: z.number().describe(`
        * * Field Name: MinorVersion
        * * Display Name: Minor Version
        * * SQL Data Type: int`),
    PatchVersion: z.number().describe(`
        * * Field Name: PatchVersion
        * * Display Name: Patch Version
        * * SQL Data Type: int`),
    Type: z.union([z.literal('New'), z.literal('Upgrade')]).nullish().describe(`
        * * Field Name: Type
        * * Display Name: Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: System
    * * Value List Type: List
    * * Possible Values 
    *   * New
    *   * Upgrade
    * * Description: What type of installation was applied`),
    InstalledAt: z.date().describe(`
        * * Field Name: InstalledAt
        * * Display Name: Installed At
        * * SQL Data Type: datetime`),
    Status: z.union([z.literal('Pending'), z.literal('In Progress'), z.literal('Complete'), z.literal('Failed')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * In Progress
    *   * Complete
    *   * Failed
    * * Description: Pending, Complete, Failed`),
    InstallLog: z.string().nullish().describe(`
        * * Field Name: InstallLog
        * * Display Name: Install Log
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Any logging that was saved from the installation process`),
    Comments: z.string().nullish().describe(`
        * * Field Name: Comments
        * * Display Name: Comments
        * * SQL Data Type: nvarchar(MAX)
    * * Description: Optional, comments the administrator wants to save for each installed version`),
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
    CompleteVersion: z.string().nullish().describe(`
        * * Field Name: CompleteVersion
        * * Display Name: Complete Version
        * * SQL Data Type: nvarchar(302)`),
});

export type VersionInstallationEntityType = z.infer<typeof VersionInstallationSchema>;
       
/**
 * zod schema definition for the entity Workflow Engines
 */
export const WorkflowEngineSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    DriverPath: z.string().describe(`
        * * Field Name: DriverPath
        * * Display Name: Driver Path
        * * SQL Data Type: nvarchar(500)`),
    DriverClass: z.string().describe(`
        * * Field Name: DriverClass
        * * Display Name: Driver Class
        * * SQL Data Type: nvarchar(100)`),
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

export type WorkflowEngineEntityType = z.infer<typeof WorkflowEngineSchema>;
       
/**
 * zod schema definition for the entity Workflow Runs
 */
export const WorkflowRunSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    WorkflowID: z.string().describe(`
        * * Field Name: WorkflowID
        * * Display Name: Workflow ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Workflows (vwWorkflows.ID)`),
    ExternalSystemRecordID: z.string().describe(`
        * * Field Name: ExternalSystemRecordID
        * * Display Name: External System Record
        * * SQL Data Type: nvarchar(500)`),
    StartedAt: z.date().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime`),
    EndedAt: z.date().nullish().describe(`
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime`),
    Status: z.union([z.literal('Pending'), z.literal('In Progress'), z.literal('Complete'), z.literal('Failed')]).describe(`
        * * Field Name: Status
        * * SQL Data Type: nchar(10)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * In Progress
    *   * Complete
    *   * Failed`),
    Results: z.string().nullish().describe(`
        * * Field Name: Results
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
    Workflow: z.string().describe(`
        * * Field Name: Workflow
        * * Display Name: Workflow
        * * SQL Data Type: nvarchar(100)`),
    WorkflowEngineName: z.string().describe(`
        * * Field Name: WorkflowEngineName
        * * Display Name: Workflow Engine Name
        * * SQL Data Type: nvarchar(100)`),
});

export type WorkflowRunEntityType = z.infer<typeof WorkflowRunSchema>;
       
/**
 * zod schema definition for the entity Workflows
 */
export const WorkflowSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * SQL Data Type: nvarchar(100)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    WorkflowEngineID: z.string().describe(`
        * * Field Name: WorkflowEngineID
        * * Display Name: Workflow Engine ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Workflow Engines (vwWorkflowEngines.ID)`),
    ExternalSystemRecordID: z.string().describe(`
        * * Field Name: ExternalSystemRecordID
        * * Display Name: External System Record
        * * SQL Data Type: nvarchar(100)`),
    AutoRunEnabled: z.boolean().describe(`
        * * Field Name: AutoRunEnabled
        * * Display Name: Auto Run Enabled
        * * SQL Data Type: bit
        * * Default Value: 0
    * * Description: If set to 1, the workflow will be run automatically on the interval specified by the AutoRunIntervalType and AutoRunInterval fields`),
    AutoRunIntervalUnits: z.union([z.literal('Years'), z.literal('Months'), z.literal('Weeks'), z.literal('Days'), z.literal('Hours'), z.literal('Minutes')]).nullish().describe(`
        * * Field Name: AutoRunIntervalUnits
        * * Display Name: Auto Run Interval Units
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Years
    *   * Months
    *   * Weeks
    *   * Days
    *   * Hours
    *   * Minutes
    * * Description: Minutes, Hours, Days, Weeks, Months, Years`),
    AutoRunInterval: z.number().nullish().describe(`
        * * Field Name: AutoRunInterval
        * * Display Name: Auto Run Interval
        * * SQL Data Type: int
    * * Description: The interval, denominated in the units specified in the AutoRunIntervalUnits column, between auto runs of this workflow.`),
    SubclassName: z.string().nullish().describe(`
        * * Field Name: SubclassName
        * * Display Name: Subclass Name
        * * SQL Data Type: nvarchar(200)
    * * Description: If specified, this subclass key, via the ClassFactory, will be instantiated, to execute this workflow. If not specified the WorkflowBase class will be used by default.`),
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
    AutoRunIntervalMinutes: z.number().nullish().describe(`
        * * Field Name: AutoRunIntervalMinutes
        * * Display Name: Auto Run Interval Minutes
        * * SQL Data Type: int`),
});

export type WorkflowEntityType = z.infer<typeof WorkflowSchema>;
       
/**
 * zod schema definition for the entity Workspace Items
 */
export const WorkspaceItemSchema = z.object({
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
    WorkspaceID: z.string().describe(`
        * * Field Name: WorkspaceID
        * * Display Name: Workspace ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Workspaces (vwWorkspaces.ID)`),
    ResourceTypeID: z.string().describe(`
        * * Field Name: ResourceTypeID
        * * Display Name: Resource Type ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Resource Types (vwResourceTypes.ID)`),
    ResourceRecordID: z.string().nullish().describe(`
        * * Field Name: ResourceRecordID
        * * Display Name: Resource Record ID
        * * SQL Data Type: nvarchar(2000)`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int`),
    Configuration: z.string().nullish().describe(`
        * * Field Name: Configuration
        * * Display Name: Configuration
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
    Workspace: z.string().describe(`
        * * Field Name: Workspace
        * * Display Name: Workspace
        * * SQL Data Type: nvarchar(255)`),
    ResourceType: z.string().describe(`
        * * Field Name: ResourceType
        * * Display Name: Resource Type
        * * SQL Data Type: nvarchar(255)`),
});

export type WorkspaceItemEntityType = z.infer<typeof WorkspaceItemSchema>;
       
/**
 * zod schema definition for the entity Workspaces
 */
export const WorkspaceSchema = z.object({
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
    UserID: z.string().describe(`
        * * Field Name: UserID
        * * Display Name: User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: Users (vwUsers.ID)`),
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
    User: z.string().describe(`
        * * Field Name: User
        * * Display Name: User
        * * SQL Data Type: nvarchar(100)`),
});

export type WorkspaceEntityType = z.infer<typeof WorkspaceSchema>;
 
 
            
/**
 * Action Authorizations - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ActionAuthorization
 * * Base View: vwActionAuthorizations
 * * @description Links actions to authorizations, one or more of these must be possessed by a user in order to execute the action.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Action Authorizations')
export class ActionAuthorizationEntity extends BaseEntity<ActionAuthorizationEntityType> {
    /**
    * Loads the Action Authorizations record from the database
    * @param ID: string - primary key value to load the Action Authorizations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActionAuthorizationEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: ActionID
    * * Display Name: Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Actions (vwActions.ID)
    */
    get ActionID(): string {  
        return this.Get('ActionID');
    }
    set ActionID(value: string) {
        this.Set('ActionID', value);
    }

    /**
    * * Field Name: AuthorizationID
    * * Display Name: Authorization ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Authorizations (vwAuthorizations.ID)
    */
    get AuthorizationID(): string {  
        return this.Get('AuthorizationID');
    }
    set AuthorizationID(value: string) {
        this.Set('AuthorizationID', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get Comments(): string | null {  
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
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
    * * Field Name: Action
    * * Display Name: Action
    * * SQL Data Type: nvarchar(425)
    */
    get Action(): string {  
        return this.Get('Action');
    }

    /**
    * * Field Name: Authorization
    * * Display Name: Authorization
    * * SQL Data Type: nvarchar(100)
    */
    get Authorization(): string {  
        return this.Get('Authorization');
    }
}

            
/**
 * Action Categories - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ActionCategory
 * * Base View: vwActionCategories
 * * @description Organizes actions into categories, including name, description, and optional parent category for hierarchy.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Action Categories')
export class ActionCategoryEntity extends BaseEntity<ActionCategoryEntityType> {
    /**
    * Loads the Action Categories record from the database
    * @param ID: string - primary key value to load the Action Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActionCategoryEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Description: Name of the action category.
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
    * * Description: Description of the action category.
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Action Categories (vwActionCategories.ID)
    */
    get ParentID(): string | null {  
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Disabled
    *   * Active
    *   * Pending
    * * Description: Status of the action category (Pending, Active, Disabled).
    */
    get Status(): 'Disabled' | 'Active' | 'Pending' {  
        return this.Get('Status');
    }
    set Status(value: 'Disabled' | 'Active' | 'Pending') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Parent
    * * Display Name: Parent
    * * SQL Data Type: nvarchar(255)
    */
    get Parent(): string | null {  
        return this.Get('Parent');
    }
}

            
/**
 * Action Context Types - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ActionContextType
 * * Base View: vwActionContextTypes
 * * @description Lists possible contexts for action execution with optional descriptions.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Action Context Types')
export class ActionContextTypeEntity extends BaseEntity<ActionContextTypeEntityType> {
    /**
    * Loads the Action Context Types record from the database
    * @param ID: string - primary key value to load the Action Context Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActionContextTypeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Description: Name of the context type.
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
    * * Description: Description of the context type.
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
 * Action Contexts - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ActionContext
 * * Base View: vwActionContexts
 * * @description Links actions to their supported context types enabling a given action to be executable in more than one context.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Action Contexts')
export class ActionContextEntity extends BaseEntity<ActionContextEntityType> {
    /**
    * Loads the Action Contexts record from the database
    * @param ID: string - primary key value to load the Action Contexts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActionContextEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: ActionID
    * * Display Name: Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Actions (vwActions.ID)
    */
    get ActionID(): string {  
        return this.Get('ActionID');
    }
    set ActionID(value: string) {
        this.Set('ActionID', value);
    }

    /**
    * * Field Name: ContextTypeID
    * * Display Name: Context Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Action Context Types (vwActionContextTypes.ID)
    */
    get ContextTypeID(): string | null {  
        return this.Get('ContextTypeID');
    }
    set ContextTypeID(value: string | null) {
        this.Set('ContextTypeID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Disabled
    *   * Active
    *   * Pending
    * * Description: Status of the action context (Pending, Active, Disabled).
    */
    get Status(): 'Disabled' | 'Active' | 'Pending' {  
        return this.Get('Status');
    }
    set Status(value: 'Disabled' | 'Active' | 'Pending') {
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
    * * Field Name: Action
    * * Display Name: Action
    * * SQL Data Type: nvarchar(425)
    */
    get Action(): string {  
        return this.Get('Action');
    }

    /**
    * * Field Name: ContextType
    * * Display Name: Context Type
    * * SQL Data Type: nvarchar(255)
    */
    get ContextType(): string | null {  
        return this.Get('ContextType');
    }
}

            
/**
 * Action Execution Logs - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ActionExecutionLog
 * * Base View: vwActionExecutionLogs
 * * @description Tracks every execution of an action, including start and end times, inputs, outputs, and result codes.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Action Execution Logs')
export class ActionExecutionLogEntity extends BaseEntity<ActionExecutionLogEntityType> {
    /**
    * Loads the Action Execution Logs record from the database
    * @param ID: string - primary key value to load the Action Execution Logs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActionExecutionLogEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: ActionID
    * * Display Name: Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Actions (vwActions.ID)
    */
    get ActionID(): string {  
        return this.Get('ActionID');
    }
    set ActionID(value: string) {
        this.Set('ActionID', value);
    }

    /**
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    * * Description: Timestamp of when the action started execution.
    */
    get StartedAt(): Date {  
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: EndedAt
    * * Display Name: Ended At
    * * SQL Data Type: datetime
    * * Description: Timestamp of when the action ended execution.
    */
    get EndedAt(): Date | null {  
        return this.Get('EndedAt');
    }
    set EndedAt(value: Date | null) {
        this.Set('EndedAt', value);
    }

    /**
    * * Field Name: Params
    * * Display Name: Params
    * * SQL Data Type: nvarchar(MAX)
    */
    get Params(): string | null {  
        return this.Get('Params');
    }
    set Params(value: string | null) {
        this.Set('Params', value);
    }

    /**
    * * Field Name: ResultCode
    * * Display Name: Result Code
    * * SQL Data Type: nvarchar(255)
    */
    get ResultCode(): string | null {  
        return this.Get('ResultCode');
    }
    set ResultCode(value: string | null) {
        this.Set('ResultCode', value);
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: RetentionPeriod
    * * Display Name: Retention Period
    * * SQL Data Type: int
    * * Description: Number of days to retain the log; NULL for indefinite retention.
    */
    get RetentionPeriod(): number | null {  
        return this.Get('RetentionPeriod');
    }
    set RetentionPeriod(value: number | null) {
        this.Set('RetentionPeriod', value);
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
    * * Field Name: Action
    * * Display Name: Action
    * * SQL Data Type: nvarchar(425)
    */
    get Action(): string {  
        return this.Get('Action');
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }
}

            
/**
 * Action Filters - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ActionFilter
 * * Base View: vwActionFilters
 * * @description Defines filters that can be evaluated ahead of executing an action. Action Filters are usable in any code pipeline you can execute them with the same context as the action itself and use the outcome to determine if the action should execute or not.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Action Filters')
export class ActionFilterEntity extends BaseEntity<ActionFilterEntityType> {
    /**
    * Loads the Action Filters record from the database
    * @param ID: string - primary key value to load the Action Filters record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActionFilterEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: UserDescription
    * * Display Name: User Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get UserDescription(): string {  
        return this.Get('UserDescription');
    }
    set UserDescription(value: string) {
        this.Set('UserDescription', value);
    }

    /**
    * * Field Name: UserComments
    * * Display Name: User Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get UserComments(): string | null {  
        return this.Get('UserComments');
    }
    set UserComments(value: string | null) {
        this.Set('UserComments', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get Code(): string {  
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: CodeExplanation
    * * Display Name: Code Explanation
    * * SQL Data Type: nvarchar(MAX)
    */
    get CodeExplanation(): string | null {  
        return this.Get('CodeExplanation');
    }
    set CodeExplanation(value: string | null) {
        this.Set('CodeExplanation', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }
}

            
/**
 * Action Libraries - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ActionLibrary
 * * Base View: vwActionLibraries
 * * @description Tracks the list of libraries that a given Action uses, including a list of classes/functions for each library.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Action Libraries')
export class ActionLibraryEntity extends BaseEntity<ActionLibraryEntityType> {
    /**
    * Loads the Action Libraries record from the database
    * @param ID: string - primary key value to load the Action Libraries record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActionLibraryEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: ActionID
    * * Display Name: Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Actions (vwActions.ID)
    */
    get ActionID(): string {  
        return this.Get('ActionID');
    }
    set ActionID(value: string) {
        this.Set('ActionID', value);
    }

    /**
    * * Field Name: LibraryID
    * * Display Name: Library ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Libraries (vwLibraries.ID)
    */
    get LibraryID(): string {  
        return this.Get('LibraryID');
    }
    set LibraryID(value: string) {
        this.Set('LibraryID', value);
    }

    /**
    * * Field Name: ItemsUsed
    * * Display Name: Items Used
    * * SQL Data Type: nvarchar(MAX)
    * * Description: List of classes and functions used by the action from the library.
    */
    get ItemsUsed(): string | null {  
        return this.Get('ItemsUsed');
    }
    set ItemsUsed(value: string | null) {
        this.Set('ItemsUsed', value);
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
    * * Field Name: Action
    * * Display Name: Action
    * * SQL Data Type: nvarchar(425)
    */
    get Action(): string {  
        return this.Get('Action');
    }

    /**
    * * Field Name: Library
    * * Display Name: Library
    * * SQL Data Type: nvarchar(255)
    */
    get Library(): string {  
        return this.Get('Library');
    }
}

            
/**
 * Action Params - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ActionParam
 * * Base View: vwActionParams
 * * @description Tracks the input and output parameters for Actions.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Action Params')
export class ActionParamEntity extends BaseEntity<ActionParamEntityType> {
    /**
    * Loads the Action Params record from the database
    * @param ID: string - primary key value to load the Action Params record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActionParamEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: ActionID
    * * Display Name: Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Actions (vwActions.ID)
    */
    get ActionID(): string {  
        return this.Get('ActionID');
    }
    set ActionID(value: string) {
        this.Set('ActionID', value);
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
    * * Field Name: DefaultValue
    * * Display Name: Default Value
    * * SQL Data Type: nvarchar(MAX)
    */
    get DefaultValue(): string | null {  
        return this.Get('DefaultValue');
    }
    set DefaultValue(value: string | null) {
        this.Set('DefaultValue', value);
    }

    /**
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nchar(10)
    * * Value List Type: List
    * * Possible Values 
    *   * Input
    *   * Output
    *   * Both
    */
    get Type(): 'Input' | 'Output' | 'Both' {  
        return this.Get('Type');
    }
    set Type(value: 'Input' | 'Output' | 'Both') {
        this.Set('Type', value);
    }

    /**
    * * Field Name: ValueType
    * * Display Name: Value Type
    * * SQL Data Type: nvarchar(30)
    * * Value List Type: List
    * * Possible Values 
    *   * Scalar
    *   * Simple Object
    *   * BaseEntity Sub-Class
    *   * Other
    * * Description: Tracks the basic value type of the parameter, additional information can be provided in the Description field
    */
    get ValueType(): 'Scalar' | 'Simple Object' | 'BaseEntity Sub-Class' | 'Other' {  
        return this.Get('ValueType');
    }
    set ValueType(value: 'Scalar' | 'Simple Object' | 'BaseEntity Sub-Class' | 'Other') {
        this.Set('ValueType', value);
    }

    /**
    * * Field Name: IsArray
    * * Display Name: Is Array
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsArray(): boolean {  
        return this.Get('IsArray');
    }
    set IsArray(value: boolean) {
        this.Set('IsArray', value);
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
    * * Field Name: IsRequired
    * * Display Name: Is Required
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsRequired(): boolean {  
        return this.Get('IsRequired');
    }
    set IsRequired(value: boolean) {
        this.Set('IsRequired', value);
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
    * * Field Name: Action
    * * Display Name: Action
    * * SQL Data Type: nvarchar(425)
    */
    get Action(): string {  
        return this.Get('Action');
    }
}

            
/**
 * Action Result Codes - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ActionResultCode
 * * Base View: vwActionResultCodes
 * * @description Defines the possible result codes for each action.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Action Result Codes')
export class ActionResultCodeEntity extends BaseEntity<ActionResultCodeEntityType> {
    /**
    * Loads the Action Result Codes record from the database
    * @param ID: string - primary key value to load the Action Result Codes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActionResultCodeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: ActionID
    * * Display Name: Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Actions (vwActions.ID)
    */
    get ActionID(): string {  
        return this.Get('ActionID');
    }
    set ActionID(value: string) {
        this.Set('ActionID', value);
    }

    /**
    * * Field Name: ResultCode
    * * Display Name: Result Code
    * * SQL Data Type: nvarchar(255)
    */
    get ResultCode(): string {  
        return this.Get('ResultCode');
    }
    set ResultCode(value: string) {
        this.Set('ResultCode', value);
    }

    /**
    * * Field Name: IsSuccess
    * * Display Name: Is Success
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Indicates if the result code is a success or not. It is possible an action might have more than one failure condition/result code and same for success conditions.
    */
    get IsSuccess(): boolean {  
        return this.Get('IsSuccess');
    }
    set IsSuccess(value: boolean) {
        this.Set('IsSuccess', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the result code.
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
    * * Field Name: Action
    * * Display Name: Action
    * * SQL Data Type: nvarchar(425)
    */
    get Action(): string {  
        return this.Get('Action');
    }
}

            
/**
 * Actions - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Action
 * * Base View: vwActions
 * * @description Stores action definitions, including prompts, generated code, user comments, and status.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Actions')
export class ActionEntity extends BaseEntity<ActionEntityType> {
    /**
    * Loads the Actions record from the database
    * @param ID: string - primary key value to load the Actions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ActionEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: CategoryID
    * * Display Name: Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Action Categories (vwActionCategories.ID)
    */
    get CategoryID(): string | null {  
        return this.Get('CategoryID');
    }
    set CategoryID(value: string | null) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(425)
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
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Generated
    * * Value List Type: List
    * * Possible Values 
    *   * Generated
    *   * Custom
    * * Description: Generated or Custom. Generated means the UserPrompt is used to prompt an AI model to automatically create the code for the Action. Custom means that a custom class has been implemented that subclasses the BaseAction class. The custom class needs to use the @RegisterClass decorator and be included in the MJAPI (or other runtime environment) to be available for execution.
    */
    get Type(): 'Generated' | 'Custom' {  
        return this.Get('Type');
    }
    set Type(value: 'Generated' | 'Custom') {
        this.Set('Type', value);
    }

    /**
    * * Field Name: UserPrompt
    * * Display Name: User Prompt
    * * SQL Data Type: nvarchar(MAX)
    */
    get UserPrompt(): string | null {  
        return this.Get('UserPrompt');
    }
    set UserPrompt(value: string | null) {
        this.Set('UserPrompt', value);
    }

    /**
    * * Field Name: UserComments
    * * Display Name: User Comments
    * * SQL Data Type: nvarchar(MAX)
    * * Description: User's comments not shared with the LLM.
    */
    get UserComments(): string | null {  
        return this.Get('UserComments');
    }
    set UserComments(value: string | null) {
        this.Set('UserComments', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get Code(): string | null {  
        return this.Get('Code');
    }
    set Code(value: string | null) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: CodeComments
    * * Display Name: Code Comments
    * * SQL Data Type: nvarchar(MAX)
    * * Description: AI's explanation of the code.
    */
    get CodeComments(): string | null {  
        return this.Get('CodeComments');
    }
    set CodeComments(value: string | null) {
        this.Set('CodeComments', value);
    }

    /**
    * * Field Name: CodeApprovalStatus
    * * Display Name: Code Approval Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Rejected
    *   * Approved
    *   * Pending
    * * Description: An action won't be usable until the code is approved.
    */
    get CodeApprovalStatus(): 'Rejected' | 'Approved' | 'Pending' {  
        return this.Get('CodeApprovalStatus');
    }
    set CodeApprovalStatus(value: 'Rejected' | 'Approved' | 'Pending') {
        this.Set('CodeApprovalStatus', value);
    }

    /**
    * * Field Name: CodeApprovalComments
    * * Display Name: Code Approval Comments
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Optional comments when an individual (or an AI) reviews and approves the code.
    */
    get CodeApprovalComments(): string | null {  
        return this.Get('CodeApprovalComments');
    }
    set CodeApprovalComments(value: string | null) {
        this.Set('CodeApprovalComments', value);
    }

    /**
    * * Field Name: CodeApprovedByUserID
    * * Display Name: Code Approved By User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get CodeApprovedByUserID(): string | null {  
        return this.Get('CodeApprovedByUserID');
    }
    set CodeApprovedByUserID(value: string | null) {
        this.Set('CodeApprovedByUserID', value);
    }

    /**
    * * Field Name: CodeApprovedAt
    * * Display Name: Code Approved At
    * * SQL Data Type: datetime
    * * Description: When the code was approved.
    */
    get CodeApprovedAt(): Date | null {  
        return this.Get('CodeApprovedAt');
    }
    set CodeApprovedAt(value: Date | null) {
        this.Set('CodeApprovedAt', value);
    }

    /**
    * * Field Name: CodeLocked
    * * Display Name: Code Locked
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: If set to 1, Code will never be generated by the AI system. This overrides all other settings including the ForceCodeGeneration bit
    */
    get CodeLocked(): boolean {  
        return this.Get('CodeLocked');
    }
    set CodeLocked(value: boolean) {
        this.Set('CodeLocked', value);
    }

    /**
    * * Field Name: ForceCodeGeneration
    * * Display Name: Force Code Generation
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: If set to 1, the Action will generate code for the provided UserPrompt on the next Save even if the UserPrompt hasn't changed. This is useful to force regeneration when other candidates (such as a change in Action Inputs/Outputs) occurs or on demand by a user.
    */
    get ForceCodeGeneration(): boolean {  
        return this.Get('ForceCodeGeneration');
    }
    set ForceCodeGeneration(value: boolean) {
        this.Set('ForceCodeGeneration', value);
    }

    /**
    * * Field Name: RetentionPeriod
    * * Display Name: Retention Period
    * * SQL Data Type: int
    * * Description: Number of days to retain execution logs; NULL for indefinite.
    */
    get RetentionPeriod(): number | null {  
        return this.Get('RetentionPeriod');
    }
    set RetentionPeriod(value: number | null) {
        this.Set('RetentionPeriod', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Disabled
    *   * Active
    *   * Pending
    * * Description: Status of the action (Pending, Active, Disabled).
    */
    get Status(): 'Disabled' | 'Active' | 'Pending' {  
        return this.Get('Status');
    }
    set Status(value: 'Disabled' | 'Active' | 'Pending') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(255)
    */
    get Category(): string | null {  
        return this.Get('Category');
    }

    /**
    * * Field Name: CodeApprovedByUser
    * * Display Name: Code Approved By User
    * * SQL Data Type: nvarchar(100)
    */
    get CodeApprovedByUser(): string | null {  
        return this.Get('CodeApprovedByUser');
    }
}

            
/**
 * AI Actions - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: AIAction
 * * Base View: vwAIActions
 * * @description List of all actions that are possible across all AI Models
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'AI Actions')
export class AIActionEntity extends BaseEntity<AIActionEntityType> {
    /**
    * Loads the AI Actions record from the database
    * @param ID: string - primary key value to load the AI Actions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AIActionEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: DefaultPrompt
    * * Display Name: Default Prompt
    * * SQL Data Type: nvarchar(MAX)
    */
    get DefaultPrompt(): string | null {  
        return this.Get('DefaultPrompt');
    }
    set DefaultPrompt(value: string | null) {
        this.Set('DefaultPrompt', value);
    }

    /**
    * * Field Name: DefaultModelID
    * * Display Name: Default Model ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)
    */
    get DefaultModelID(): string | null {  
        return this.Get('DefaultModelID');
    }
    set DefaultModelID(value: string | null) {
        this.Set('DefaultModelID', value);
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
    * * Field Name: DefaultModel
    * * Display Name: Default Model
    * * SQL Data Type: nvarchar(50)
    */
    get DefaultModel(): string | null {  
        return this.Get('DefaultModel');
    }
}

            
/**
 * AI Model Actions - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: AIModelAction
 * * Base View: vwAIModelActions
 * * @description Tracks the actions supported by each AI Model
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'AI Model Actions')
export class AIModelActionEntity extends BaseEntity<AIModelActionEntityType> {
    /**
    * Loads the AI Model Actions record from the database
    * @param ID: string - primary key value to load the AI Model Actions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AIModelActionEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: AIModelID
    * * Display Name: AI Model ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)
    */
    get AIModelID(): string {  
        return this.Get('AIModelID');
    }
    set AIModelID(value: string) {
        this.Set('AIModelID', value);
    }

    /**
    * * Field Name: AIActionID
    * * Display Name: AI Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: AI Actions (vwAIActions.ID)
    */
    get AIActionID(): string {  
        return this.Get('AIActionID');
    }
    set AIActionID(value: string) {
        this.Set('AIActionID', value);
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
    * * Field Name: AIModel
    * * Display Name: AIModel
    * * SQL Data Type: nvarchar(50)
    */
    get AIModel(): string {  
        return this.Get('AIModel');
    }

    /**
    * * Field Name: AIAction
    * * Display Name: AIAction
    * * SQL Data Type: nvarchar(50)
    */
    get AIAction(): string {  
        return this.Get('AIAction');
    }
}

            
/**
 * AI Model Types - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: AIModelType
 * * Base View: vwAIModelTypes
 * * @description Types of AI Models
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'AI Model Types')
export class AIModelTypeEntity extends BaseEntity<AIModelTypeEntityType> {
    /**
    * Loads the AI Model Types record from the database
    * @param ID: string - primary key value to load the AI Model Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AIModelTypeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
 * AI Models - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: AIModel
 * * Base View: vwAIModels
 * * @description Catalog of all AI Models configured in the system
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'AI Models')
export class AIModelEntity extends BaseEntity<AIModelEntityType> {
    /**
    * Loads the AI Models record from the database
    * @param ID: string - primary key value to load the AI Models record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AIModelEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: Vendor
    * * Display Name: Vendor
    * * SQL Data Type: nvarchar(50)
    */
    get Vendor(): string | null {  
        return this.Get('Vendor');
    }
    set Vendor(value: string | null) {
        this.Set('Vendor', value);
    }

    /**
    * * Field Name: AIModelTypeID
    * * Display Name: AI Model Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: AI Model Types (vwAIModelTypes.ID)
    */
    get AIModelTypeID(): string {  
        return this.Get('AIModelTypeID');
    }
    set AIModelTypeID(value: string) {
        this.Set('AIModelTypeID', value);
    }

    /**
    * * Field Name: PowerRank
    * * Display Name: Power Rank
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Optional column that ranks the power of the AI model. Default is 0 and should be non-negative.
    */
    get PowerRank(): number | null {  
        return this.Get('PowerRank');
    }
    set PowerRank(value: number | null) {
        this.Set('PowerRank', value);
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
    * * Field Name: DriverClass
    * * Display Name: Driver Class
    * * SQL Data Type: nvarchar(100)
    */
    get DriverClass(): string | null {  
        return this.Get('DriverClass');
    }
    set DriverClass(value: string | null) {
        this.Set('DriverClass', value);
    }

    /**
    * * Field Name: DriverImportPath
    * * Display Name: Driver Import Path
    * * SQL Data Type: nvarchar(255)
    */
    get DriverImportPath(): string | null {  
        return this.Get('DriverImportPath');
    }
    set DriverImportPath(value: string | null) {
        this.Set('DriverImportPath', value);
    }

    /**
    * * Field Name: APIName
    * * Display Name: APIName
    * * SQL Data Type: nvarchar(100)
    * * Description: The name of the model to use with API calls which might differ from the Name, if APIName is not provided, Name will be used for API calls
    */
    get APIName(): string | null {  
        return this.Get('APIName');
    }
    set APIName(value: string | null) {
        this.Set('APIName', value);
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
    * * Field Name: SpeedRank
    * * Display Name: Speed Rank
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Optional column that ranks the speed of the AI model. Default is 0 and should be non-negative.
    */
    get SpeedRank(): number | null {  
        return this.Get('SpeedRank');
    }
    set SpeedRank(value: number | null) {
        this.Set('SpeedRank', value);
    }

    /**
    * * Field Name: CostRank
    * * Display Name: Cost Rank
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Optional column that ranks the cost of the AI model. Default is 0 and should be non-negative.
    */
    get CostRank(): number | null {  
        return this.Get('CostRank');
    }
    set CostRank(value: number | null) {
        this.Set('CostRank', value);
    }

    /**
    * * Field Name: AIModelType
    * * Display Name: AIModel Type
    * * SQL Data Type: nvarchar(50)
    */
    get AIModelType(): string {  
        return this.Get('AIModelType');
    }
}

            
/**
 * Application Entities - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ApplicationEntity
 * * Base View: vwApplicationEntities
 * * @description List of entities within each application. An application can have any number of entities and an entity can be part of any number of applications.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Application Entities')
export class ApplicationEntityEntity extends BaseEntity<ApplicationEntityEntityType> {
    /**
    * Loads the Application Entities record from the database
    * @param ID: string - primary key value to load the Application Entities record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ApplicationEntityEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: ApplicationID
    * * Display Name: Application ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Applications (vwApplications.ID)
    */
    get ApplicationID(): string {  
        return this.Get('ApplicationID');
    }
    set ApplicationID(value: string) {
        this.Set('ApplicationID', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: Sequence
    * * SQL Data Type: int
    */
    get Sequence(): number {  
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: DefaultForNewUser
    * * Display Name: Default For New User
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When set to 1, the entity will be included by default for a new user when they first access the application in question
    */
    get DefaultForNewUser(): boolean {  
        return this.Get('DefaultForNewUser');
    }
    set DefaultForNewUser(value: boolean) {
        this.Set('DefaultForNewUser', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Application
    * * SQL Data Type: nvarchar(100)
    */
    get Application(): string {  
        return this.Get('Application');
    }

    /**
    * * Field Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: EntityBaseTable
    * * Display Name: Entity Base Table
    * * SQL Data Type: nvarchar(255)
    */
    get EntityBaseTable(): string {  
        return this.Get('EntityBaseTable');
    }

    /**
    * * Field Name: EntityCodeName
    * * Display Name: Entity Code Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get EntityCodeName(): string | null {  
        return this.Get('EntityCodeName');
    }

    /**
    * * Field Name: EntityClassName
    * * Display Name: Entity Class Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get EntityClassName(): string | null {  
        return this.Get('EntityClassName');
    }

    /**
    * * Field Name: EntityBaseTableCodeName
    * * Display Name: Entity Base Table Code Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get EntityBaseTableCodeName(): string | null {  
        return this.Get('EntityBaseTableCodeName');
    }
}

            
/**
 * Application Settings - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ApplicationSetting
 * * Base View: vwApplicationSettings
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Application Settings')
export class ApplicationSettingEntity extends BaseEntity<ApplicationSettingEntityType> {
    /**
    * Loads the Application Settings record from the database
    * @param ID: string - primary key value to load the Application Settings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ApplicationSettingEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: ApplicationID
    * * Display Name: Application ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Applications (vwApplications.ID)
    */
    get ApplicationID(): string {  
        return this.Get('ApplicationID');
    }
    set ApplicationID(value: string) {
        this.Set('ApplicationID', value);
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
    * * Field Name: Value
    * * Display Name: Value
    * * SQL Data Type: nvarchar(MAX)
    */
    get Value(): string {  
        return this.Get('Value');
    }
    set Value(value: string) {
        this.Set('Value', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get Comments(): string | null {  
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Application
    * * Display Name: Application
    * * SQL Data Type: nvarchar(100)
    */
    get Application(): string {  
        return this.Get('Application');
    }
}

            
/**
 * Applications - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Application
 * * Base View: vwApplications
 * * @description Applications are used to group entities in the user interface for ease of user access
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Applications')
export class ApplicationEntity extends BaseEntity<ApplicationEntityType> {
    /**
    * Loads the Applications record from the database
    * @param ID: string - primary key value to load the Applications record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ApplicationEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: Name
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
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Icon
    * * Display Name: Icon
    * * SQL Data Type: nvarchar(500)
    * * Description: Specify the CSS class information for the display icon for each application.
    */
    get Icon(): string | null {  
        return this.Get('Icon');
    }
    set Icon(value: string | null) {
        this.Set('Icon', value);
    }

    /**
    * * Field Name: DefaultForNewUser
    * * Display Name: Default For New User
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: If turned on, when a new user first uses the MJ Explorer app, the application records with this turned on will have this application included in their selected application list.
    */
    get DefaultForNewUser(): boolean {  
        return this.Get('DefaultForNewUser');
    }
    set DefaultForNewUser(value: boolean) {
        this.Set('DefaultForNewUser', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }
}

            
/**
 * Audit Log Types - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: AuditLogType
 * * Base View: vwAuditLogTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Audit Log Types')
export class AuditLogTypeEntity extends BaseEntity<AuditLogTypeEntityType> {
    /**
    * Loads the Audit Log Types record from the database
    * @param ID: string - primary key value to load the Audit Log Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AuditLogTypeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Audit Log Types - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof AuditLogTypeEntity
    * @throws {Error} - Save is not allowed for Audit Log Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for Audit Log Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }

    /**
    * Audit Log Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof AuditLogTypeEntity
    * @throws {Error} - Delete is not allowed for Audit Log Types, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Audit Log Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Audit Log Types (vwAuditLogTypes.ID)
    */
    get ParentID(): string | null {  
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: AuthorizationID
    * * Display Name: Authorization ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Authorizations (vwAuthorizations.ID)
    */
    get AuthorizationID(): string | null {  
        return this.Get('AuthorizationID');
    }
    set AuthorizationID(value: string | null) {
        this.Set('AuthorizationID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Parent
    * * Display Name: Parent
    * * SQL Data Type: nvarchar(50)
    */
    get Parent(): string | null {  
        return this.Get('Parent');
    }

    /**
    * * Field Name: Authorization
    * * Display Name: Authorization
    * * SQL Data Type: nvarchar(100)
    */
    get Authorization(): string | null {  
        return this.Get('Authorization');
    }
}

            
/**
 * Audit Logs - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: AuditLog
 * * Base View: vwAuditLogs
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Audit Logs')
export class AuditLogEntity extends BaseEntity<AuditLogEntityType> {
    /**
    * Loads the Audit Logs record from the database
    * @param ID: string - primary key value to load the Audit Logs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AuditLogEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Audit Logs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof AuditLogEntity
    * @throws {Error} - Delete is not allowed for Audit Logs, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Audit Logs, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: AuditLogTypeID
    * * Display Name: Audit Log Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Audit Log Types (vwAuditLogTypes.ID)
    */
    get AuditLogTypeID(): string {  
        return this.Get('AuditLogTypeID');
    }
    set AuditLogTypeID(value: string) {
        this.Set('AuditLogTypeID', value);
    }

    /**
    * * Field Name: AuthorizationID
    * * Display Name: Authorization ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Authorizations (vwAuthorizations.ID)
    */
    get AuthorizationID(): string | null {  
        return this.Get('AuthorizationID');
    }
    set AuthorizationID(value: string | null) {
        this.Set('AuthorizationID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Allow
    * * Value List Type: List
    * * Possible Values 
    *   * Success
    *   * Failed
    */
    get Status(): 'Success' | 'Failed' {  
        return this.Get('Status');
    }
    set Status(value: 'Success' | 'Failed') {
        this.Set('Status', value);
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
    * * Field Name: Details
    * * Display Name: Details
    * * SQL Data Type: nvarchar(MAX)
    */
    get Details(): string | null {  
        return this.Get('Details');
    }
    set Details(value: string | null) {
        this.Set('Details', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string | null {  
        return this.Get('EntityID');
    }
    set EntityID(value: string | null) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: RecordID
    * * Display Name: Record
    * * SQL Data Type: nvarchar(450)
    */
    get RecordID(): string | null {  
        return this.Get('RecordID');
    }
    set RecordID(value: string | null) {
        this.Set('RecordID', value);
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
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }

    /**
    * * Field Name: AuditLogType
    * * Display Name: Audit Log Type
    * * SQL Data Type: nvarchar(50)
    */
    get AuditLogType(): string {  
        return this.Get('AuditLogType');
    }

    /**
    * * Field Name: Authorization
    * * Display Name: Authorization
    * * SQL Data Type: nvarchar(100)
    */
    get Authorization(): string | null {  
        return this.Get('Authorization');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string | null {  
        return this.Get('Entity');
    }
}

            
/**
 * Authorization Roles - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: AuthorizationRole
 * * Base View: vwAuthorizationRoles
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Authorization Roles')
export class AuthorizationRoleEntity extends BaseEntity<AuthorizationRoleEntityType> {
    /**
    * Loads the Authorization Roles record from the database
    * @param ID: string - primary key value to load the Authorization Roles record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AuthorizationRoleEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Authorization Roles - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof AuthorizationRoleEntity
    * @throws {Error} - Save is not allowed for Authorization Roles, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for Authorization Roles, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }

    /**
    * Authorization Roles - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof AuthorizationRoleEntity
    * @throws {Error} - Delete is not allowed for Authorization Roles, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Authorization Roles, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: AuthorizationID
    * * Display Name: Authorization ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Authorizations (vwAuthorizations.ID)
    */
    get AuthorizationID(): string {  
        return this.Get('AuthorizationID');
    }
    set AuthorizationID(value: string) {
        this.Set('AuthorizationID', value);
    }

    /**
    * * Field Name: RoleID
    * * Display Name: Role ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Roles (vwRoles.ID)
    */
    get RoleID(): string {  
        return this.Get('RoleID');
    }
    set RoleID(value: string) {
        this.Set('RoleID', value);
    }

    /**
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nchar(10)
    * * Default Value: grant
    * * Value List Type: List
    * * Possible Values 
    *   * Allow - User allowed to execute tasks linked to this authorization
    *   * Deny - User NOT allowed to execute tasks linked to this authorization - deny overrides Allow from all other roles a user may be part of
    */
    get Type(): 'Allow' | 'Deny' {  
        return this.Get('Type');
    }
    set Type(value: 'Allow' | 'Deny') {
        this.Set('Type', value);
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
    * * Field Name: Authorization
    * * Display Name: Authorization
    * * SQL Data Type: nvarchar(100)
    */
    get Authorization(): string {  
        return this.Get('Authorization');
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(50)
    */
    get Role(): string {  
        return this.Get('Role');
    }
}

            
/**
 * Authorizations - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Authorization
 * * Base View: vwAuthorizations
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Authorizations')
export class AuthorizationEntity extends BaseEntity<AuthorizationEntityType> {
    /**
    * Loads the Authorizations record from the database
    * @param ID: string - primary key value to load the Authorizations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof AuthorizationEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Authorizations - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof AuthorizationEntity
    * @throws {Error} - Save is not allowed for Authorizations, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for Authorizations, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }

    /**
    * Authorizations - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof AuthorizationEntity
    * @throws {Error} - Delete is not allowed for Authorizations, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Authorizations, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Authorizations (vwAuthorizations.ID)
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
    * * SQL Data Type: nvarchar(100)
    */
    get Name(): string {  
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
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
    * * Field Name: UseAuditLog
    * * Display Name: Use Audit Log
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When set to 1, Audit Log records are created whenever this authorization is invoked for a user
    */
    get UseAuditLog(): boolean {  
        return this.Get('UseAuditLog');
    }
    set UseAuditLog(value: boolean) {
        this.Set('UseAuditLog', value);
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
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Parent
    * * Display Name: Parent
    * * SQL Data Type: nvarchar(100)
    */
    get Parent(): string | null {  
        return this.Get('Parent');
    }
}

            
/**
 * Communication Base Message Types - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: CommunicationBaseMessageType
 * * Base View: vwCommunicationBaseMessageTypes
 * * @description Base message types and their supported functionalities.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Communication Base Message Types')
export class CommunicationBaseMessageTypeEntity extends BaseEntity<CommunicationBaseMessageTypeEntityType> {
    /**
    * Loads the Communication Base Message Types record from the database
    * @param ID: string - primary key value to load the Communication Base Message Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CommunicationBaseMessageTypeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Communication Base Message Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof CommunicationBaseMessageTypeEntity
    * @throws {Error} - Delete is not allowed for Communication Base Message Types, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Communication Base Message Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(100)
    */
    get Type(): string {  
        return this.Get('Type');
    }
    set Type(value: string) {
        this.Set('Type', value);
    }

    /**
    * * Field Name: SupportsAttachments
    * * Display Name: Supports Attachments
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Indicates if attachments are supported.
    */
    get SupportsAttachments(): boolean {  
        return this.Get('SupportsAttachments');
    }
    set SupportsAttachments(value: boolean) {
        this.Set('SupportsAttachments', value);
    }

    /**
    * * Field Name: SupportsSubjectLine
    * * Display Name: Supports Subject Line
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Indicates if a subject line is supported.
    */
    get SupportsSubjectLine(): boolean {  
        return this.Get('SupportsSubjectLine');
    }
    set SupportsSubjectLine(value: boolean) {
        this.Set('SupportsSubjectLine', value);
    }

    /**
    * * Field Name: SupportsHtml
    * * Display Name: Supports Html
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Indicates if HTML content is supported.
    */
    get SupportsHtml(): boolean {  
        return this.Get('SupportsHtml');
    }
    set SupportsHtml(value: boolean) {
        this.Set('SupportsHtml', value);
    }

    /**
    * * Field Name: MaxBytes
    * * Display Name: Max Bytes
    * * SQL Data Type: int
    * * Description: The maximum size in bytes for the message.
    */
    get MaxBytes(): number | null {  
        return this.Get('MaxBytes');
    }
    set MaxBytes(value: number | null) {
        this.Set('MaxBytes', value);
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
 * Communication Logs - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: CommunicationLog
 * * Base View: vwCommunicationLogs
 * * @description Logs of sent and received messages.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Communication Logs')
export class CommunicationLogEntity extends BaseEntity<CommunicationLogEntityType> {
    /**
    * Loads the Communication Logs record from the database
    * @param ID: string - primary key value to load the Communication Logs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CommunicationLogEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Communication Logs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof CommunicationLogEntity
    * @throws {Error} - Delete is not allowed for Communication Logs, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Communication Logs, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: CommunicationProviderID
    * * Display Name: Communication Provider ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Communication Providers (vwCommunicationProviders.ID)
    */
    get CommunicationProviderID(): string {  
        return this.Get('CommunicationProviderID');
    }
    set CommunicationProviderID(value: string) {
        this.Set('CommunicationProviderID', value);
    }

    /**
    * * Field Name: CommunicationProviderMessageTypeID
    * * Display Name: Communication Provider Message Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Communication Provider Message Types (vwCommunicationProviderMessageTypes.ID)
    */
    get CommunicationProviderMessageTypeID(): string {  
        return this.Get('CommunicationProviderMessageTypeID');
    }
    set CommunicationProviderMessageTypeID(value: string) {
        this.Set('CommunicationProviderMessageTypeID', value);
    }

    /**
    * * Field Name: CommunicationRunID
    * * Display Name: Communication Run ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Communication Runs (vwCommunicationRuns.ID)
    */
    get CommunicationRunID(): string | null {  
        return this.Get('CommunicationRunID');
    }
    set CommunicationRunID(value: string | null) {
        this.Set('CommunicationRunID', value);
    }

    /**
    * * Field Name: Direction
    * * Display Name: Direction
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Sending
    *   * Receiving
    * * Description: The direction of the communication log (Sending or Receiving).
    */
    get Direction(): 'Sending' | 'Receiving' {  
        return this.Get('Direction');
    }
    set Direction(value: 'Sending' | 'Receiving') {
        this.Set('Direction', value);
    }

    /**
    * * Field Name: MessageDate
    * * Display Name: Message Date
    * * SQL Data Type: datetime
    * * Description: The date and time when the message was logged.
    */
    get MessageDate(): Date {  
        return this.Get('MessageDate');
    }
    set MessageDate(value: Date) {
        this.Set('MessageDate', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * In-Progress
    *   * Complete
    *   * Failed
    * * Description: The status of the logged message (Pending, In-Progress, Complete, Failed).
    */
    get Status(): 'Pending' | 'In-Progress' | 'Complete' | 'Failed' {  
        return this.Get('Status');
    }
    set Status(value: 'Pending' | 'In-Progress' | 'Complete' | 'Failed') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: MessageContent
    * * Display Name: Message Content
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The content of the logged message.
    */
    get MessageContent(): string | null {  
        return this.Get('MessageContent');
    }
    set MessageContent(value: string | null) {
        this.Set('MessageContent', value);
    }

    /**
    * * Field Name: ErrorMessage
    * * Display Name: Error Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The error message if the message sending failed.
    */
    get ErrorMessage(): string | null {  
        return this.Get('ErrorMessage');
    }
    set ErrorMessage(value: string | null) {
        this.Set('ErrorMessage', value);
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

    /**
    * * Field Name: CommunicationProviderMessageType
    * * Display Name: Communication Provider Message Type
    * * SQL Data Type: nvarchar(255)
    */
    get CommunicationProviderMessageType(): string {  
        return this.Get('CommunicationProviderMessageType');
    }
}

            
/**
 * Communication Provider Message Types - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: CommunicationProviderMessageType
 * * Base View: vwCommunicationProviderMessageTypes
 * * @description Providers and their supported message types with additional attributes.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Communication Provider Message Types')
export class CommunicationProviderMessageTypeEntity extends BaseEntity<CommunicationProviderMessageTypeEntityType> {
    /**
    * Loads the Communication Provider Message Types record from the database
    * @param ID: string - primary key value to load the Communication Provider Message Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CommunicationProviderMessageTypeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: CommunicationProviderID
    * * Display Name: Communication Provider ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Communication Providers (vwCommunicationProviders.ID)
    */
    get CommunicationProviderID(): string {  
        return this.Get('CommunicationProviderID');
    }
    set CommunicationProviderID(value: string) {
        this.Set('CommunicationProviderID', value);
    }

    /**
    * * Field Name: CommunicationBaseMessageTypeID
    * * Display Name: Communication Base Message Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Communication Base Message Types (vwCommunicationBaseMessageTypes.ID)
    */
    get CommunicationBaseMessageTypeID(): string {  
        return this.Get('CommunicationBaseMessageTypeID');
    }
    set CommunicationBaseMessageTypeID(value: string) {
        this.Set('CommunicationBaseMessageTypeID', value);
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
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Disabled
    * * Value List Type: List
    * * Possible Values 
    *   * Disabled
    *   * Active
    * * Description: The status of the provider message type (Disabled or Active).
    */
    get Status(): 'Disabled' | 'Active' {  
        return this.Get('Status');
    }
    set Status(value: 'Disabled' | 'Active') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: AdditionalAttributes
    * * Display Name: Additional Attributes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Additional attributes specific to the provider message type.
    */
    get AdditionalAttributes(): string | null {  
        return this.Get('AdditionalAttributes');
    }
    set AdditionalAttributes(value: string | null) {
        this.Set('AdditionalAttributes', value);
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

    /**
    * * Field Name: CommunicationBaseMessageType
    * * Display Name: Communication Base Message Type
    * * SQL Data Type: nvarchar(100)
    */
    get CommunicationBaseMessageType(): string {  
        return this.Get('CommunicationBaseMessageType');
    }
}

            
/**
 * Communication Providers - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: CommunicationProvider
 * * Base View: vwCommunicationProviders
 * * @description All supported communication providers.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Communication Providers')
export class CommunicationProviderEntity extends BaseEntity<CommunicationProviderEntityType> {
    /**
    * Loads the Communication Providers record from the database
    * @param ID: string - primary key value to load the Communication Providers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CommunicationProviderEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Communication Providers - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof CommunicationProviderEntity
    * @throws {Error} - Delete is not allowed for Communication Providers, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Communication Providers, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Disabled
    * * Value List Type: List
    * * Possible Values 
    *   * Disabled
    *   * Active
    * * Description: The status of the communication provider (Disabled or Active).
    */
    get Status(): 'Disabled' | 'Active' {  
        return this.Get('Status');
    }
    set Status(value: 'Disabled' | 'Active') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: SupportsSending
    * * Display Name: Supports Sending
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Indicates if the provider supports sending messages.
    */
    get SupportsSending(): boolean {  
        return this.Get('SupportsSending');
    }
    set SupportsSending(value: boolean) {
        this.Set('SupportsSending', value);
    }

    /**
    * * Field Name: SupportsReceiving
    * * Display Name: Supports Receiving
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Indicates if the provider supports receiving messages.
    */
    get SupportsReceiving(): boolean {  
        return this.Get('SupportsReceiving');
    }
    set SupportsReceiving(value: boolean) {
        this.Set('SupportsReceiving', value);
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
 * Communication Runs - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: CommunicationRun
 * * Base View: vwCommunicationRuns
 * * @description Runs of bulk message sends and receives.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Communication Runs')
export class CommunicationRunEntity extends BaseEntity<CommunicationRunEntityType> {
    /**
    * Loads the Communication Runs record from the database
    * @param ID: string - primary key value to load the Communication Runs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CommunicationRunEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Communication Runs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof CommunicationRunEntity
    * @throws {Error} - Delete is not allowed for Communication Runs, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Communication Runs, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: Direction
    * * Display Name: Direction
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Sending
    *   * Receiving
    * * Description: The direction of the communication run (Sending or Receiving).
    */
    get Direction(): 'Sending' | 'Receiving' {  
        return this.Get('Direction');
    }
    set Direction(value: 'Sending' | 'Receiving') {
        this.Set('Direction', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * In-Progress
    *   * Complete
    *   * Failed
    * * Description: The status of the communication run (Pending, In-Progress, Complete, Failed).
    */
    get Status(): 'Pending' | 'In-Progress' | 'Complete' | 'Failed' {  
        return this.Get('Status');
    }
    set Status(value: 'Pending' | 'In-Progress' | 'Complete' | 'Failed') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetime
    */
    get StartedAt(): Date | null {  
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date | null) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: EndedAt
    * * Display Name: Ended At
    * * SQL Data Type: datetime
    */
    get EndedAt(): Date | null {  
        return this.Get('EndedAt');
    }
    set EndedAt(value: Date | null) {
        this.Set('EndedAt', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get Comments(): string | null {  
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
    }

    /**
    * * Field Name: ErrorMessage
    * * Display Name: Error Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The error message if the communication run failed.
    */
    get ErrorMessage(): string | null {  
        return this.Get('ErrorMessage');
    }
    set ErrorMessage(value: string | null) {
        this.Set('ErrorMessage', value);
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
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }
}

            
/**
 * Companies - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Company
 * * Base View: vwCompanies
 * * @description A list of organizational units within your business. These can be subsidiaries or divisions or other units. Companies are used to organizae employee records and also for separating integrations if you have multiple integrations of the same type of system.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Companies')
export class CompanyEntity extends BaseEntity<CompanyEntityType> {
    /**
    * Loads the Companies record from the database
    * @param ID: string - primary key value to load the Companies record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CompanyEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: Name
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
    * * SQL Data Type: nvarchar(200)
    */
    get Description(): string {  
        return this.Get('Description');
    }
    set Description(value: string) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Website
    * * SQL Data Type: nvarchar(100)
    */
    get Website(): string | null {  
        return this.Get('Website');
    }
    set Website(value: string | null) {
        this.Set('Website', value);
    }

    /**
    * * Field Name: LogoURL
    * * Display Name: Logo URL
    * * SQL Data Type: nvarchar(500)
    */
    get LogoURL(): string | null {  
        return this.Get('LogoURL');
    }
    set LogoURL(value: string | null) {
        this.Set('LogoURL', value);
    }

    /**
    * * Field Name: Domain
    * * Display Name: Domain
    * * SQL Data Type: nvarchar(255)
    */
    get Domain(): string | null {  
        return this.Get('Domain');
    }
    set Domain(value: string | null) {
        this.Set('Domain', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }
}

            
/**
 * Company Integration Record Maps - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: CompanyIntegrationRecordMap
 * * Base View: vwCompanyIntegrationRecordMaps
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Company Integration Record Maps')
export class CompanyIntegrationRecordMapEntity extends BaseEntity<CompanyIntegrationRecordMapEntityType> {
    /**
    * Loads the Company Integration Record Maps record from the database
    * @param ID: string - primary key value to load the Company Integration Record Maps record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CompanyIntegrationRecordMapEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Company Integration Record Maps - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof CompanyIntegrationRecordMapEntity
    * @throws {Error} - Delete is not allowed for Company Integration Record Maps, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Company Integration Record Maps, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: CompanyIntegrationID
    * * Display Name: Company Integration ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Company Integrations (vwCompanyIntegrations.ID)
    */
    get CompanyIntegrationID(): string {  
        return this.Get('CompanyIntegrationID');
    }
    set CompanyIntegrationID(value: string) {
        this.Set('CompanyIntegrationID', value);
    }

    /**
    * * Field Name: ExternalSystemRecordID
    * * Display Name: External System Record ID
    * * SQL Data Type: nvarchar(750)
    */
    get ExternalSystemRecordID(): string {  
        return this.Get('ExternalSystemRecordID');
    }
    set ExternalSystemRecordID(value: string) {
        this.Set('ExternalSystemRecordID', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: EntityRecordID
    * * Display Name: Entity Record ID
    * * SQL Data Type: nvarchar(750)
    */
    get EntityRecordID(): string {  
        return this.Get('EntityRecordID');
    }
    set EntityRecordID(value: string) {
        this.Set('EntityRecordID', value);
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
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }
}

            
/**
 * Company Integration Run API Logs - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: CompanyIntegrationRunAPILog
 * * Base View: vwCompanyIntegrationRunAPILogs
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Company Integration Run API Logs')
export class CompanyIntegrationRunAPILogEntity extends BaseEntity<CompanyIntegrationRunAPILogEntityType> {
    /**
    * Loads the Company Integration Run API Logs record from the database
    * @param ID: string - primary key value to load the Company Integration Run API Logs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CompanyIntegrationRunAPILogEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Company Integration Run API Logs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof CompanyIntegrationRunAPILogEntity
    * @throws {Error} - Delete is not allowed for Company Integration Run API Logs, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Company Integration Run API Logs, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: CompanyIntegrationRunID
    * * Display Name: Company Integration Run ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Company Integration Runs (vwCompanyIntegrationRuns.ID)
    */
    get CompanyIntegrationRunID(): string {  
        return this.Get('CompanyIntegrationRunID');
    }
    set CompanyIntegrationRunID(value: string) {
        this.Set('CompanyIntegrationRunID', value);
    }

    /**
    * * Field Name: ExecutedAt
    * * Display Name: Executed At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get ExecutedAt(): Date {  
        return this.Get('ExecutedAt');
    }
    set ExecutedAt(value: Date) {
        this.Set('ExecutedAt', value);
    }

    /**
    * * Field Name: IsSuccess
    * * Display Name: Is Success
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsSuccess(): boolean {  
        return this.Get('IsSuccess');
    }
    set IsSuccess(value: boolean) {
        this.Set('IsSuccess', value);
    }

    /**
    * * Field Name: RequestMethod
    * * Display Name: Request Method
    * * SQL Data Type: nvarchar(12)
    * * Value List Type: List
    * * Possible Values 
    *   * GET
    *   * POST
    *   * PUT
    *   * DELETE
    *   * PATCH
    *   * HEAD
    *   * OPTIONS
    */
    get RequestMethod(): 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | null {  
        return this.Get('RequestMethod');
    }
    set RequestMethod(value: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | null) {
        this.Set('RequestMethod', value);
    }

    /**
    * * Field Name: URL
    * * SQL Data Type: nvarchar(MAX)
    */
    get URL(): string | null {  
        return this.Get('URL');
    }
    set URL(value: string | null) {
        this.Set('URL', value);
    }

    /**
    * * Field Name: Parameters
    * * SQL Data Type: nvarchar(MAX)
    */
    get Parameters(): string | null {  
        return this.Get('Parameters');
    }
    set Parameters(value: string | null) {
        this.Set('Parameters', value);
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
 * Company Integration Run Details - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: CompanyIntegrationRunDetail
 * * Base View: vwCompanyIntegrationRunDetails
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Company Integration Run Details')
export class CompanyIntegrationRunDetailEntity extends BaseEntity<CompanyIntegrationRunDetailEntityType> {
    /**
    * Loads the Company Integration Run Details record from the database
    * @param ID: string - primary key value to load the Company Integration Run Details record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CompanyIntegrationRunDetailEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Company Integration Run Details - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof CompanyIntegrationRunDetailEntity
    * @throws {Error} - Delete is not allowed for Company Integration Run Details, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Company Integration Run Details, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: CompanyIntegrationRunID
    * * Display Name: CompanyIntegrationRun ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Company Integration Runs (vwCompanyIntegrationRuns.ID)
    */
    get CompanyIntegrationRunID(): string {  
        return this.Get('CompanyIntegrationRunID');
    }
    set CompanyIntegrationRunID(value: string) {
        this.Set('CompanyIntegrationRunID', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: RecordID
    * * Display Name: Record
    * * SQL Data Type: nvarchar(450)
    */
    get RecordID(): string {  
        return this.Get('RecordID');
    }
    set RecordID(value: string) {
        this.Set('RecordID', value);
    }

    /**
    * * Field Name: Action
    * * SQL Data Type: nchar(20)
    */
    get Action(): string {  
        return this.Get('Action');
    }
    set Action(value: string) {
        this.Set('Action', value);
    }

    /**
    * * Field Name: ExecutedAt
    * * Display Name: Executed At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get ExecutedAt(): Date {  
        return this.Get('ExecutedAt');
    }
    set ExecutedAt(value: Date) {
        this.Set('ExecutedAt', value);
    }

    /**
    * * Field Name: IsSuccess
    * * Display Name: Is Success
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsSuccess(): boolean {  
        return this.Get('IsSuccess');
    }
    set IsSuccess(value: boolean) {
        this.Set('IsSuccess', value);
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
    * * Field Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: RunStartedAt
    * * Display Name: Run Started At
    * * SQL Data Type: datetime
    */
    get RunStartedAt(): Date | null {  
        return this.Get('RunStartedAt');
    }

    /**
    * * Field Name: RunEndedAt
    * * Display Name: Run Ended At
    * * SQL Data Type: datetime
    */
    get RunEndedAt(): Date | null {  
        return this.Get('RunEndedAt');
    }
}

            
/**
 * Company Integration Runs - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: CompanyIntegrationRun
 * * Base View: vwCompanyIntegrationRuns
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Company Integration Runs')
export class CompanyIntegrationRunEntity extends BaseEntity<CompanyIntegrationRunEntityType> {
    /**
    * Loads the Company Integration Runs record from the database
    * @param ID: string - primary key value to load the Company Integration Runs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CompanyIntegrationRunEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Company Integration Runs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof CompanyIntegrationRunEntity
    * @throws {Error} - Delete is not allowed for Company Integration Runs, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Company Integration Runs, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: CompanyIntegrationID
    * * Display Name: CompanyIntegration ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Company Integrations (vwCompanyIntegrations.ID)
    */
    get CompanyIntegrationID(): string {  
        return this.Get('CompanyIntegrationID');
    }
    set CompanyIntegrationID(value: string) {
        this.Set('CompanyIntegrationID', value);
    }

    /**
    * * Field Name: RunByUserID
    * * Display Name: RunByUser ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get RunByUserID(): string {  
        return this.Get('RunByUserID');
    }
    set RunByUserID(value: string) {
        this.Set('RunByUserID', value);
    }

    /**
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetime
    */
    get StartedAt(): Date | null {  
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date | null) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: EndedAt
    * * Display Name: Ended At
    * * SQL Data Type: datetime
    */
    get EndedAt(): Date | null {  
        return this.Get('EndedAt');
    }
    set EndedAt(value: Date | null) {
        this.Set('EndedAt', value);
    }

    /**
    * * Field Name: TotalRecords
    * * Display Name: Total Records
    * * SQL Data Type: int
    */
    get TotalRecords(): number {  
        return this.Get('TotalRecords');
    }
    set TotalRecords(value: number) {
        this.Set('TotalRecords', value);
    }

    /**
    * * Field Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get Comments(): string | null {  
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
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
    * * Field Name: RunByUser
    * * Display Name: Run By User
    * * SQL Data Type: nvarchar(100)
    */
    get RunByUser(): string {  
        return this.Get('RunByUser');
    }
}

            
/**
 * Company Integrations - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: CompanyIntegration
 * * Base View: vwCompanyIntegrations
 * * @description Links individual company records to specific integrations
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Company Integrations')
export class CompanyIntegrationEntity extends BaseEntity<CompanyIntegrationEntityType> {
    /**
    * Loads the Company Integrations record from the database
    * @param ID: string - primary key value to load the Company Integrations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CompanyIntegrationEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Company Integrations - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof CompanyIntegrationEntity
    * @throws {Error} - Delete is not allowed for Company Integrations, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Company Integrations, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: CompanyID
    * * Display Name: Company ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Companies (vwCompanies.ID)
    */
    get CompanyID(): string {  
        return this.Get('CompanyID');
    }
    set CompanyID(value: string) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: IntegrationID
    * * Display Name: Integration ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Integrations (vwIntegrations.ID)
    */
    get IntegrationID(): string {  
        return this.Get('IntegrationID');
    }
    set IntegrationID(value: string) {
        this.Set('IntegrationID', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    */
    get IsActive(): boolean | null {  
        return this.Get('IsActive');
    }
    set IsActive(value: boolean | null) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: AccessToken
    * * Display Name: Access Token
    * * SQL Data Type: nvarchar(255)
    */
    get AccessToken(): string | null {  
        return this.Get('AccessToken');
    }
    set AccessToken(value: string | null) {
        this.Set('AccessToken', value);
    }

    /**
    * * Field Name: RefreshToken
    * * Display Name: Refresh Token
    * * SQL Data Type: nvarchar(255)
    */
    get RefreshToken(): string | null {  
        return this.Get('RefreshToken');
    }
    set RefreshToken(value: string | null) {
        this.Set('RefreshToken', value);
    }

    /**
    * * Field Name: TokenExpirationDate
    * * Display Name: Token Expiration Date
    * * SQL Data Type: datetime
    */
    get TokenExpirationDate(): Date | null {  
        return this.Get('TokenExpirationDate');
    }
    set TokenExpirationDate(value: Date | null) {
        this.Set('TokenExpirationDate', value);
    }

    /**
    * * Field Name: APIKey
    * * SQL Data Type: nvarchar(255)
    */
    get APIKey(): string | null {  
        return this.Get('APIKey');
    }
    set APIKey(value: string | null) {
        this.Set('APIKey', value);
    }

    /**
    * * Field Name: ExternalSystemID
    * * Display Name: ExternalSystem
    * * SQL Data Type: nvarchar(100)
    */
    get ExternalSystemID(): string | null {  
        return this.Get('ExternalSystemID');
    }
    set ExternalSystemID(value: string | null) {
        this.Set('ExternalSystemID', value);
    }

    /**
    * * Field Name: IsExternalSystemReadOnly
    * * Display Name: Is External System Read Only
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsExternalSystemReadOnly(): boolean {  
        return this.Get('IsExternalSystemReadOnly');
    }
    set IsExternalSystemReadOnly(value: boolean) {
        this.Set('IsExternalSystemReadOnly', value);
    }

    /**
    * * Field Name: ClientID
    * * Display Name: Client
    * * SQL Data Type: nvarchar(255)
    */
    get ClientID(): string | null {  
        return this.Get('ClientID');
    }
    set ClientID(value: string | null) {
        this.Set('ClientID', value);
    }

    /**
    * * Field Name: ClientSecret
    * * Display Name: Client Secret
    * * SQL Data Type: nvarchar(255)
    */
    get ClientSecret(): string | null {  
        return this.Get('ClientSecret');
    }
    set ClientSecret(value: string | null) {
        this.Set('ClientSecret', value);
    }

    /**
    * * Field Name: CustomAttribute1
    * * Display Name: Custom Attribute 1
    * * SQL Data Type: nvarchar(255)
    */
    get CustomAttribute1(): string | null {  
        return this.Get('CustomAttribute1');
    }
    set CustomAttribute1(value: string | null) {
        this.Set('CustomAttribute1', value);
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
    * * SQL Data Type: nvarchar(50)
    */
    get Company(): string {  
        return this.Get('Company');
    }

    /**
    * * Field Name: Integration
    * * SQL Data Type: nvarchar(100)
    */
    get Integration(): string {  
        return this.Get('Integration');
    }

    /**
    * * Field Name: DriverClassName
    * * Display Name: Driver Class Name
    * * SQL Data Type: nvarchar(100)
    */
    get DriverClassName(): string | null {  
        return this.Get('DriverClassName');
    }

    /**
    * * Field Name: DriverImportPath
    * * Display Name: Driver Import Path
    * * SQL Data Type: nvarchar(100)
    */
    get DriverImportPath(): string | null {  
        return this.Get('DriverImportPath');
    }

    /**
    * * Field Name: LastRunID
    * * Display Name: LastRun
    * * SQL Data Type: uniqueidentifier
    */
    get LastRunID(): string | null {  
        return this.Get('LastRunID');
    }

    /**
    * * Field Name: LastRunStartedAt
    * * Display Name: Last Run Started At
    * * SQL Data Type: datetime
    */
    get LastRunStartedAt(): Date | null {  
        return this.Get('LastRunStartedAt');
    }

    /**
    * * Field Name: LastRunEndedAt
    * * Display Name: Last Run Ended At
    * * SQL Data Type: datetime
    */
    get LastRunEndedAt(): Date | null {  
        return this.Get('LastRunEndedAt');
    }
}

            
/**
 * Conversation Details - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ConversationDetail
 * * Base View: vwConversationDetails
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Conversation Details')
export class ConversationDetailEntity extends BaseEntity<ConversationDetailEntityType> {
    /**
    * Loads the Conversation Details record from the database
    * @param ID: string - primary key value to load the Conversation Details record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ConversationDetailEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: ConversationID
    * * Display Name: Conversation ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Conversations (vwConversations.ID)
    */
    get ConversationID(): string {  
        return this.Get('ConversationID');
    }
    set ConversationID(value: string) {
        this.Set('ConversationID', value);
    }

    /**
    * * Field Name: ExternalID
    * * Display Name: External ID
    * * SQL Data Type: nvarchar(100)
    */
    get ExternalID(): string | null {  
        return this.Get('ExternalID');
    }
    set ExternalID(value: string | null) {
        this.Set('ExternalID', value);
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(20)
    * * Default Value: user_name()
    * * Value List Type: List
    * * Possible Values 
    *   * User
    *   * AI
    *   * Error
    */
    get Role(): 'User' | 'AI' | 'Error' {  
        return this.Get('Role');
    }
    set Role(value: 'User' | 'AI' | 'Error') {
        this.Set('Role', value);
    }

    /**
    * * Field Name: Message
    * * Display Name: Message
    * * SQL Data Type: nvarchar(MAX)
    */
    get Message(): string {  
        return this.Get('Message');
    }
    set Message(value: string) {
        this.Set('Message', value);
    }

    /**
    * * Field Name: Error
    * * Display Name: Error
    * * SQL Data Type: nvarchar(MAX)
    */
    get Error(): string | null {  
        return this.Get('Error');
    }
    set Error(value: string | null) {
        this.Set('Error', value);
    }

    /**
    * * Field Name: HiddenToUser
    * * Display Name: Hidden To User
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get HiddenToUser(): boolean {  
        return this.Get('HiddenToUser');
    }
    set HiddenToUser(value: boolean) {
        this.Set('HiddenToUser', value);
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
    * * Field Name: Conversation
    * * Display Name: Conversation
    * * SQL Data Type: nvarchar(255)
    */
    get Conversation(): string | null {  
        return this.Get('Conversation');
    }
}

            
/**
 * Conversations - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Conversation
 * * Base View: vwConversations
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Conversations')
export class ConversationEntity extends BaseEntity<ConversationEntityType> {
    /**
    * Loads the Conversations record from the database
    * @param ID: string - primary key value to load the Conversations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ConversationEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: ExternalID
    * * Display Name: External ID
    * * SQL Data Type: nvarchar(500)
    */
    get ExternalID(): string | null {  
        return this.Get('ExternalID');
    }
    set ExternalID(value: string | null) {
        this.Set('ExternalID', value);
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
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Skip
    */
    get Type(): string {  
        return this.Get('Type');
    }
    set Type(value: string) {
        this.Set('Type', value);
    }

    /**
    * * Field Name: IsArchived
    * * Display Name: Is Archived
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsArchived(): boolean {  
        return this.Get('IsArchived');
    }
    set IsArchived(value: boolean) {
        this.Set('IsArchived', value);
    }

    /**
    * * Field Name: LinkedEntityID
    * * Display Name: Linked Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get LinkedEntityID(): string | null {  
        return this.Get('LinkedEntityID');
    }
    set LinkedEntityID(value: string | null) {
        this.Set('LinkedEntityID', value);
    }

    /**
    * * Field Name: LinkedRecordID
    * * Display Name: Linked Record ID
    * * SQL Data Type: nvarchar(500)
    */
    get LinkedRecordID(): string | null {  
        return this.Get('LinkedRecordID');
    }
    set LinkedRecordID(value: string | null) {
        this.Set('LinkedRecordID', value);
    }

    /**
    * * Field Name: DataContextID
    * * Display Name: Data Context ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Data Contexts (vwDataContexts.ID)
    */
    get DataContextID(): string | null {  
        return this.Get('DataContextID');
    }
    set DataContextID(value: string | null) {
        this.Set('DataContextID', value);
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
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }

    /**
    * * Field Name: LinkedEntity
    * * Display Name: Linked Entity
    * * SQL Data Type: nvarchar(255)
    */
    get LinkedEntity(): string | null {  
        return this.Get('LinkedEntity');
    }

    /**
    * * Field Name: DataContext
    * * Display Name: Data Context
    * * SQL Data Type: nvarchar(255)
    */
    get DataContext(): string | null {  
        return this.Get('DataContext');
    }
}

            
/**
 * Dashboard Categories - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: DashboardCategory
 * * Base View: vwDashboardCategories
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Dashboard Categories')
export class DashboardCategoryEntity extends BaseEntity<DashboardCategoryEntityType> {
    /**
    * Loads the Dashboard Categories record from the database
    * @param ID: string - primary key value to load the Dashboard Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DashboardCategoryEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Dashboard Categories (vwDashboardCategories.ID)
    */
    get ParentID(): string | null {  
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
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
    * * SQL Data Type: nvarchar(100)
    */
    get Parent(): string | null {  
        return this.Get('Parent');
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }
}

            
/**
 * Dashboards - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Dashboard
 * * Base View: vwDashboards
 * * @description Dashboards are used to group resources into a single display pane for an end-user
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Dashboards')
export class DashboardEntity extends BaseEntity<DashboardEntityType> {
    /**
    * Loads the Dashboards record from the database
    * @param ID: string - primary key value to load the Dashboards record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DashboardEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: CategoryID
    * * Display Name: Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Dashboard Categories (vwDashboardCategories.ID)
    */
    get CategoryID(): string | null {  
        return this.Get('CategoryID');
    }
    set CategoryID(value: string | null) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: UIConfigDetails
    * * Display Name: UIConfig Details
    * * SQL Data Type: nvarchar(MAX)
    */
    get UIConfigDetails(): string {  
        return this.Get('UIConfigDetails');
    }
    set UIConfigDetails(value: string) {
        this.Set('UIConfigDetails', value);
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
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(100)
    */
    get Category(): string | null {  
        return this.Get('Category');
    }
}

            
/**
 * Data Context Items - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: DataContextItem
 * * Base View: vwDataContextItems
 * * @description Data Context Items store information about each item within a Data Context. Each item stores a link to a view, query, or raw sql statement and can optionally cache the JSON representing the last run of that data object as well.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Data Context Items')
export class DataContextItemEntity extends BaseEntity<DataContextItemEntityType> {
    /**
    * Loads the Data Context Items record from the database
    * @param ID: string - primary key value to load the Data Context Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DataContextItemEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: DataContextID
    * * Display Name: Data Context ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Data Contexts (vwDataContexts.ID)
    */
    get DataContextID(): string {  
        return this.Get('DataContextID');
    }
    set DataContextID(value: string) {
        this.Set('DataContextID', value);
    }

    /**
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * view
    *   * sql
    *   * query
    *   * single_record
    *   * full_entity
    * * Description: The type of the item, either "view", "query", "full_entity", "single_record", or "sql"
    */
    get Type(): 'view' | 'sql' | 'query' | 'single_record' | 'full_entity' {  
        return this.Get('Type');
    }
    set Type(value: 'view' | 'sql' | 'query' | 'single_record' | 'full_entity') {
        this.Set('Type', value);
    }

    /**
    * * Field Name: ViewID
    * * Display Name: View ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: User Views (vwUserViews.ID)
    */
    get ViewID(): string | null {  
        return this.Get('ViewID');
    }
    set ViewID(value: string | null) {
        this.Set('ViewID', value);
    }

    /**
    * * Field Name: QueryID
    * * Display Name: Query ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Queries (vwQueries.ID)
    */
    get QueryID(): string | null {  
        return this.Get('QueryID');
    }
    set QueryID(value: string | null) {
        this.Set('QueryID', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string | null {  
        return this.Get('EntityID');
    }
    set EntityID(value: string | null) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: RecordID
    * * Display Name: Record ID
    * * SQL Data Type: nvarchar(450)
    * * Description: The Primary Key value for the record, only used when Type='single_record'
    */
    get RecordID(): string | null {  
        return this.Get('RecordID');
    }
    set RecordID(value: string | null) {
        this.Set('RecordID', value);
    }

    /**
    * * Field Name: SQL
    * * Display Name: SQL
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Only used when Type=sql
    */
    get SQL(): string | null {  
        return this.Get('SQL');
    }
    set SQL(value: string | null) {
        this.Set('SQL', value);
    }

    /**
    * * Field Name: DataJSON
    * * Display Name: Data JSON
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Optionally used to cache results of an item. This can be used for performance optimization, and also for having snapshots of data for historical comparisons.
    */
    get DataJSON(): string | null {  
        return this.Get('DataJSON');
    }
    set DataJSON(value: string | null) {
        this.Set('DataJSON', value);
    }

    /**
    * * Field Name: LastRefreshedAt
    * * Display Name: Last Refreshed At
    * * SQL Data Type: datetime
    * * Description: If DataJSON is populated, this field will show the date the the data was captured
    */
    get LastRefreshedAt(): Date | null {  
        return this.Get('LastRefreshedAt');
    }
    set LastRefreshedAt(value: Date | null) {
        this.Set('LastRefreshedAt', value);
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
    * * Field Name: DataContext
    * * Display Name: Data Context
    * * SQL Data Type: nvarchar(255)
    */
    get DataContext(): string {  
        return this.Get('DataContext');
    }

    /**
    * * Field Name: View
    * * Display Name: View
    * * SQL Data Type: nvarchar(100)
    */
    get View(): string | null {  
        return this.Get('View');
    }

    /**
    * * Field Name: Query
    * * Display Name: Query
    * * SQL Data Type: nvarchar(255)
    */
    get Query(): string | null {  
        return this.Get('Query');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string | null {  
        return this.Get('Entity');
    }
}

            
/**
 * Data Contexts - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: DataContext
 * * Base View: vwDataContexts
 * * @description Data Contexts are a primitive within the MemberJunction architecture. They store information about data contexts which are groups of data including views, queries, or raw SQL statements. Data contexts can be used in conversations, reports and more.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Data Contexts')
export class DataContextEntity extends BaseEntity<DataContextEntityType> {
    /**
    * Loads the Data Contexts record from the database
    * @param ID: string - primary key value to load the Data Contexts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DataContextEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: LastRefreshedAt
    * * Display Name: Last Refreshed At
    * * SQL Data Type: datetime
    */
    get LastRefreshedAt(): Date | null {  
        return this.Get('LastRefreshedAt');
    }
    set LastRefreshedAt(value: Date | null) {
        this.Set('LastRefreshedAt', value);
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
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }
}

            
/**
 * Dataset Items - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: DatasetItem
 * * Base View: vwDatasetItems
 * * @description A single item in a Dataset and can be sourced from multiple methods.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Dataset Items')
export class DatasetItemEntity extends BaseEntity<DatasetItemEntityType> {
    /**
    * Loads the Dataset Items record from the database
    * @param ID: string - primary key value to load the Dataset Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DatasetItemEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Dataset Items - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof DatasetItemEntity
    * @throws {Error} - Save is not allowed for Dataset Items, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for Dataset Items, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }

    /**
    * Dataset Items - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof DatasetItemEntity
    * @throws {Error} - Delete is not allowed for Dataset Items, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Dataset Items, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(50)
    */
    get Code(): string {  
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: DatasetID
    * * Display Name: Dataset ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Datasets (vwDatasets.ID)
    */
    get DatasetID(): string {  
        return this.Get('DatasetID');
    }
    set DatasetID(value: string) {
        this.Set('DatasetID', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get Sequence(): number {  
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: WhereClause
    * * Display Name: Where Clause
    * * SQL Data Type: nvarchar(MAX)
    */
    get WhereClause(): string | null {  
        return this.Get('WhereClause');
    }
    set WhereClause(value: string | null) {
        this.Set('WhereClause', value);
    }

    /**
    * * Field Name: DateFieldToCheck
    * * Display Name: Date Field To Check
    * * SQL Data Type: nvarchar(100)
    */
    get DateFieldToCheck(): string {  
        return this.Get('DateFieldToCheck');
    }
    set DateFieldToCheck(value: string) {
        this.Set('DateFieldToCheck', value);
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
    * * Field Name: Dataset
    * * Display Name: Dataset
    * * SQL Data Type: nvarchar(100)
    */
    get Dataset(): string {  
        return this.Get('Dataset');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }
}

            
/**
 * Datasets - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Dataset
 * * Base View: vwDatasets
 * * @description Cacheable sets of data that can span one or more items
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Datasets')
export class DatasetEntity extends BaseEntity<DatasetEntityType> {
    /**
    * Loads the Datasets record from the database
    * @param ID: string - primary key value to load the Datasets record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DatasetEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Datasets - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof DatasetEntity
    * @throws {Error} - Save is not allowed for Datasets, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for Datasets, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }

    /**
    * Datasets - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof DatasetEntity
    * @throws {Error} - Delete is not allowed for Datasets, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Datasets, to enable it set AllowDeleteAPI to 1 in the database.');
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
 * Duplicate Run Detail Matches - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: DuplicateRunDetailMatch
 * * Base View: vwDuplicateRunDetailMatches
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Duplicate Run Detail Matches')
export class DuplicateRunDetailMatchEntity extends BaseEntity<DuplicateRunDetailMatchEntityType> {
    /**
    * Loads the Duplicate Run Detail Matches record from the database
    * @param ID: string - primary key value to load the Duplicate Run Detail Matches record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DuplicateRunDetailMatchEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Duplicate Run Detail Matches - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof DuplicateRunDetailMatchEntity
    * @throws {Error} - Delete is not allowed for Duplicate Run Detail Matches, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Duplicate Run Detail Matches, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: DuplicateRunDetailID
    * * Display Name: Duplicate Run Detail ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Duplicate Run Details (vwDuplicateRunDetails.ID)
    */
    get DuplicateRunDetailID(): string {  
        return this.Get('DuplicateRunDetailID');
    }
    set DuplicateRunDetailID(value: string) {
        this.Set('DuplicateRunDetailID', value);
    }

    /**
    * * Field Name: MatchSource
    * * Display Name: Match Source
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Vector
    * * Value List Type: List
    * * Possible Values 
    *   * SP
    *   * Vector
    * * Description: Either Vector or SP
    */
    get MatchSource(): 'SP' | 'Vector' {  
        return this.Get('MatchSource');
    }
    set MatchSource(value: 'SP' | 'Vector') {
        this.Set('MatchSource', value);
    }

    /**
    * * Field Name: MatchRecordID
    * * Display Name: Match Record ID
    * * SQL Data Type: nvarchar(500)
    */
    get MatchRecordID(): string {  
        return this.Get('MatchRecordID');
    }
    set MatchRecordID(value: string) {
        this.Set('MatchRecordID', value);
    }

    /**
    * * Field Name: MatchProbability
    * * Display Name: Match Probability
    * * SQL Data Type: numeric(12, 11)
    * * Default Value: 0
    * * Description: Value between 0 and 1 designating the computed probability of a match
    */
    get MatchProbability(): number {  
        return this.Get('MatchProbability');
    }
    set MatchProbability(value: number) {
        this.Set('MatchProbability', value);
    }

    /**
    * * Field Name: MatchedAt
    * * Display Name: Matched At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get MatchedAt(): Date {  
        return this.Get('MatchedAt');
    }
    set MatchedAt(value: Date) {
        this.Set('MatchedAt', value);
    }

    /**
    * * Field Name: Action
    * * Display Name: Action
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Ignore
    */
    get Action(): string {  
        return this.Get('Action');
    }
    set Action(value: string) {
        this.Set('Action', value);
    }

    /**
    * * Field Name: ApprovalStatus
    * * Display Name: Approval Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Rejected
    *   * Approved
    *   * Pending
    */
    get ApprovalStatus(): 'Rejected' | 'Approved' | 'Pending' {  
        return this.Get('ApprovalStatus');
    }
    set ApprovalStatus(value: 'Rejected' | 'Approved' | 'Pending') {
        this.Set('ApprovalStatus', value);
    }

    /**
    * * Field Name: RecordMergeLogID
    * * Display Name: Record Merge Log ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Record Merge Logs (vwRecordMergeLogs.ID)
    */
    get RecordMergeLogID(): string | null {  
        return this.Get('RecordMergeLogID');
    }
    set RecordMergeLogID(value: string | null) {
        this.Set('RecordMergeLogID', value);
    }

    /**
    * * Field Name: MergeStatus
    * * Display Name: Merge Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Error
    *   * Complete
    *   * Pending
    */
    get MergeStatus(): 'Error' | 'Complete' | 'Pending' {  
        return this.Get('MergeStatus');
    }
    set MergeStatus(value: 'Error' | 'Complete' | 'Pending') {
        this.Set('MergeStatus', value);
    }

    /**
    * * Field Name: MergedAt
    * * Display Name: Merged At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get MergedAt(): Date {  
        return this.Get('MergedAt');
    }
    set MergedAt(value: Date) {
        this.Set('MergedAt', value);
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
 * Duplicate Run Details - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: DuplicateRunDetail
 * * Base View: vwDuplicateRunDetails
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Duplicate Run Details')
export class DuplicateRunDetailEntity extends BaseEntity<DuplicateRunDetailEntityType> {
    /**
    * Loads the Duplicate Run Details record from the database
    * @param ID: string - primary key value to load the Duplicate Run Details record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DuplicateRunDetailEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Duplicate Run Details - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof DuplicateRunDetailEntity
    * @throws {Error} - Delete is not allowed for Duplicate Run Details, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Duplicate Run Details, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: DuplicateRunID
    * * Display Name: Duplicate Run ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Duplicate Runs (vwDuplicateRuns.ID)
    */
    get DuplicateRunID(): string {  
        return this.Get('DuplicateRunID');
    }
    set DuplicateRunID(value: string) {
        this.Set('DuplicateRunID', value);
    }

    /**
    * * Field Name: RecordID
    * * Display Name: Record ID
    * * SQL Data Type: nvarchar(500)
    */
    get RecordID(): string {  
        return this.Get('RecordID');
    }
    set RecordID(value: string) {
        this.Set('RecordID', value);
    }

    /**
    * * Field Name: MatchStatus
    * * Display Name: Match Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Error
    *   * Skipped
    *   * Complete
    *   * Pending
    */
    get MatchStatus(): 'Error' | 'Skipped' | 'Complete' | 'Pending' {  
        return this.Get('MatchStatus');
    }
    set MatchStatus(value: 'Error' | 'Skipped' | 'Complete' | 'Pending') {
        this.Set('MatchStatus', value);
    }

    /**
    * * Field Name: SkippedReason
    * * Display Name: Skipped Reason
    * * SQL Data Type: nvarchar(MAX)
    * * Description: If MatchStatus=Skipped, this field can be used to store the reason why the record was skipped
    */
    get SkippedReason(): string | null {  
        return this.Get('SkippedReason');
    }
    set SkippedReason(value: string | null) {
        this.Set('SkippedReason', value);
    }

    /**
    * * Field Name: MatchErrorMessage
    * * Display Name: Match Error Message
    * * SQL Data Type: nvarchar(MAX)
    * * Description: If MatchStatus='Error' this field can be used to track the error from that phase of the process for logging/diagnostics.
    */
    get MatchErrorMessage(): string | null {  
        return this.Get('MatchErrorMessage');
    }
    set MatchErrorMessage(value: string | null) {
        this.Set('MatchErrorMessage', value);
    }

    /**
    * * Field Name: MergeStatus
    * * Display Name: Merge Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Not Applicable
    * * Value List Type: List
    * * Possible Values 
    *   * Error
    *   * Complete
    *   * Pending
    *   * Not Applicable
    */
    get MergeStatus(): 'Error' | 'Complete' | 'Pending' | 'Not Applicable' {  
        return this.Get('MergeStatus');
    }
    set MergeStatus(value: 'Error' | 'Complete' | 'Pending' | 'Not Applicable') {
        this.Set('MergeStatus', value);
    }

    /**
    * * Field Name: MergeErrorMessage
    * * Display Name: Merge Error Message
    * * SQL Data Type: nvarchar(MAX)
    */
    get MergeErrorMessage(): string | null {  
        return this.Get('MergeErrorMessage');
    }
    set MergeErrorMessage(value: string | null) {
        this.Set('MergeErrorMessage', value);
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
 * Duplicate Runs - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: DuplicateRun
 * * Base View: vwDuplicateRuns
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Duplicate Runs')
export class DuplicateRunEntity extends BaseEntity<DuplicateRunEntityType> {
    /**
    * Loads the Duplicate Runs record from the database
    * @param ID: string - primary key value to load the Duplicate Runs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof DuplicateRunEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Duplicate Runs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof DuplicateRunEntity
    * @throws {Error} - Delete is not allowed for Duplicate Runs, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Duplicate Runs, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: StartedByUserID
    * * Display Name: Started By User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get StartedByUserID(): string {  
        return this.Get('StartedByUserID');
    }
    set StartedByUserID(value: string) {
        this.Set('StartedByUserID', value);
    }

    /**
    * * Field Name: SourceListID
    * * Display Name: Source List ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Lists (vwLists.ID)
    */
    get SourceListID(): string {  
        return this.Get('SourceListID');
    }
    set SourceListID(value: string) {
        this.Set('SourceListID', value);
    }

    /**
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get StartedAt(): Date {  
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: EndedAt
    * * Display Name: Ended At
    * * SQL Data Type: datetime
    */
    get EndedAt(): Date | null {  
        return this.Get('EndedAt');
    }
    set EndedAt(value: Date | null) {
        this.Set('EndedAt', value);
    }

    /**
    * * Field Name: ApprovalStatus
    * * Display Name: Approval Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Rejected
    *   * Approved
    *   * Pending
    */
    get ApprovalStatus(): 'Rejected' | 'Approved' | 'Pending' {  
        return this.Get('ApprovalStatus');
    }
    set ApprovalStatus(value: 'Rejected' | 'Approved' | 'Pending') {
        this.Set('ApprovalStatus', value);
    }

    /**
    * * Field Name: ApprovalComments
    * * Display Name: Approval Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get ApprovalComments(): string | null {  
        return this.Get('ApprovalComments');
    }
    set ApprovalComments(value: string | null) {
        this.Set('ApprovalComments', value);
    }

    /**
    * * Field Name: ApprovedByUserID
    * * Display Name: Approved By User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get ApprovedByUserID(): string | null {  
        return this.Get('ApprovedByUserID');
    }
    set ApprovedByUserID(value: string | null) {
        this.Set('ApprovedByUserID', value);
    }

    /**
    * * Field Name: ProcessingStatus
    * * Display Name: Processing Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Failed
    *   * Complete
    *   * In Progress
    *   * Pending
    */
    get ProcessingStatus(): 'Failed' | 'Complete' | 'In Progress' | 'Pending' {  
        return this.Get('ProcessingStatus');
    }
    set ProcessingStatus(value: 'Failed' | 'Complete' | 'In Progress' | 'Pending') {
        this.Set('ProcessingStatus', value);
    }

    /**
    * * Field Name: ProcessingErrorMessage
    * * Display Name: Processing Error Message
    * * SQL Data Type: nvarchar(MAX)
    */
    get ProcessingErrorMessage(): string | null {  
        return this.Get('ProcessingErrorMessage');
    }
    set ProcessingErrorMessage(value: string | null) {
        this.Set('ProcessingErrorMessage', value);
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
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: StartedByUser
    * * Display Name: Started By User
    * * SQL Data Type: nvarchar(100)
    */
    get StartedByUser(): string {  
        return this.Get('StartedByUser');
    }

    /**
    * * Field Name: SourceList
    * * Display Name: Source List
    * * SQL Data Type: nvarchar(100)
    */
    get SourceList(): string {  
        return this.Get('SourceList');
    }

    /**
    * * Field Name: ApprovedByUser
    * * Display Name: Approved By User
    * * SQL Data Type: nvarchar(100)
    */
    get ApprovedByUser(): string | null {  
        return this.Get('ApprovedByUser');
    }
}

            
/**
 * Employee Company Integrations - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EmployeeCompanyIntegration
 * * Base View: vwEmployeeCompanyIntegrations
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Employee Company Integrations')
export class EmployeeCompanyIntegrationEntity extends BaseEntity<EmployeeCompanyIntegrationEntityType> {
    /**
    * Loads the Employee Company Integrations record from the database
    * @param ID: string - primary key value to load the Employee Company Integrations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EmployeeCompanyIntegrationEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Employee Company Integrations - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof EmployeeCompanyIntegrationEntity
    * @throws {Error} - Delete is not allowed for Employee Company Integrations, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Employee Company Integrations, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: EmployeeID
    * * Display Name: Employee ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Employees (vwEmployees.ID)
    */
    get EmployeeID(): string {  
        return this.Get('EmployeeID');
    }
    set EmployeeID(value: string) {
        this.Set('EmployeeID', value);
    }

    /**
    * * Field Name: CompanyIntegrationID
    * * Display Name: Company Integration ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Company Integrations (vwCompanyIntegrations.ID)
    */
    get CompanyIntegrationID(): string {  
        return this.Get('CompanyIntegrationID');
    }
    set CompanyIntegrationID(value: string) {
        this.Set('CompanyIntegrationID', value);
    }

    /**
    * * Field Name: ExternalSystemRecordID
    * * Display Name: External System Record
    * * SQL Data Type: nvarchar(750)
    */
    get ExternalSystemRecordID(): string {  
        return this.Get('ExternalSystemRecordID');
    }
    set ExternalSystemRecordID(value: string) {
        this.Set('ExternalSystemRecordID', value);
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
 * Employee Roles - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EmployeeRole
 * * Base View: vwEmployeeRoles
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Employee Roles')
export class EmployeeRoleEntity extends BaseEntity<EmployeeRoleEntityType> {
    /**
    * Loads the Employee Roles record from the database
    * @param ID: string - primary key value to load the Employee Roles record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EmployeeRoleEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Employee Roles - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof EmployeeRoleEntity
    * @throws {Error} - Delete is not allowed for Employee Roles, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Employee Roles, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: EmployeeID
    * * Display Name: Employee ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Employees (vwEmployees.ID)
    */
    get EmployeeID(): string {  
        return this.Get('EmployeeID');
    }
    set EmployeeID(value: string) {
        this.Set('EmployeeID', value);
    }

    /**
    * * Field Name: RoleID
    * * Display Name: Role ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Roles (vwRoles.ID)
    */
    get RoleID(): string {  
        return this.Get('RoleID');
    }
    set RoleID(value: string) {
        this.Set('RoleID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(50)
    */
    get Role(): string {  
        return this.Get('Role');
    }
}

            
/**
 * Employee Skills - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EmployeeSkill
 * * Base View: vwEmployeeSkills
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Employee Skills')
export class EmployeeSkillEntity extends BaseEntity<EmployeeSkillEntityType> {
    /**
    * Loads the Employee Skills record from the database
    * @param ID: string - primary key value to load the Employee Skills record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EmployeeSkillEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Employee Skills - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof EmployeeSkillEntity
    * @throws {Error} - Delete is not allowed for Employee Skills, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Employee Skills, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: EmployeeID
    * * Display Name: Employee ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Employees (vwEmployees.ID)
    */
    get EmployeeID(): string {  
        return this.Get('EmployeeID');
    }
    set EmployeeID(value: string) {
        this.Set('EmployeeID', value);
    }

    /**
    * * Field Name: SkillID
    * * Display Name: Skill ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Skills (vwSkills.ID)
    */
    get SkillID(): string {  
        return this.Get('SkillID');
    }
    set SkillID(value: string) {
        this.Set('SkillID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Skill
    * * Display Name: Skill
    * * SQL Data Type: nvarchar(50)
    */
    get Skill(): string {  
        return this.Get('Skill');
    }
}

            
/**
 * Employees - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Employee
 * * Base View: vwEmployees
 * * @description A list of employees across all units of your organization
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Employees')
export class EmployeeEntity extends BaseEntity<EmployeeEntityType> {
    /**
    * Loads the Employees record from the database
    * @param ID: string - primary key value to load the Employees record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EmployeeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: BCMID
    * * Display Name: BCMID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newid()
    */
    get BCMID(): string {  
        return this.Get('BCMID');
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(30)
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
    * * Field Name: CompanyID
    * * Display Name: Company ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Companies (vwCompanies.ID)
    */
    get CompanyID(): string {  
        return this.Get('CompanyID');
    }
    set CompanyID(value: string) {
        this.Set('CompanyID', value);
    }

    /**
    * * Field Name: SupervisorID
    * * Display Name: Supervisor ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Employees (vwEmployees.ID)
    */
    get SupervisorID(): string | null {  
        return this.Get('SupervisorID');
    }
    set SupervisorID(value: string | null) {
        this.Set('SupervisorID', value);
    }

    /**
    * * Field Name: Title
    * * SQL Data Type: nvarchar(50)
    */
    get Title(): string | null {  
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Email
    * * SQL Data Type: nvarchar(100)
    */
    get Email(): string {  
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Phone
    * * SQL Data Type: nvarchar(20)
    */
    get Phone(): string | null {  
        return this.Get('Phone');
    }
    set Phone(value: string | null) {
        this.Set('Phone', value);
    }

    /**
    * * Field Name: Active
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get Active(): boolean {  
        return this.Get('Active');
    }
    set Active(value: boolean) {
        this.Set('Active', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: FirstLast
    * * Display Name: First Last
    * * SQL Data Type: nvarchar(81)
    */
    get FirstLast(): string | null {  
        return this.Get('FirstLast');
    }

    /**
    * * Field Name: Supervisor
    * * Display Name: Supervisor
    * * SQL Data Type: nvarchar(81)
    */
    get Supervisor(): string | null {  
        return this.Get('Supervisor');
    }

    /**
    * * Field Name: SupervisorFirstName
    * * Display Name: Supervisor First Name
    * * SQL Data Type: nvarchar(30)
    */
    get SupervisorFirstName(): string | null {  
        return this.Get('SupervisorFirstName');
    }

    /**
    * * Field Name: SupervisorLastName
    * * Display Name: Supervisor Last Name
    * * SQL Data Type: nvarchar(50)
    */
    get SupervisorLastName(): string | null {  
        return this.Get('SupervisorLastName');
    }

    /**
    * * Field Name: SupervisorEmail
    * * Display Name: Supervisor Email
    * * SQL Data Type: nvarchar(100)
    */
    get SupervisorEmail(): string | null {  
        return this.Get('SupervisorEmail');
    }
}

            
/**
 * Entities - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Entity
 * * Base View: vwEntities
 * * @description Catalog of all entities across all schemas
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entities')
export class EntityEntity extends BaseEntity<EntityEntityType> {
    /**
    * Loads the Entities record from the database
    * @param ID: string - primary key value to load the Entities record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get ParentID(): string | null {  
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: Name
    * * SQL Data Type: nvarchar(255)
    */
    get Name(): string {  
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: NameSuffix
    * * Display Name: Name Suffix
    * * SQL Data Type: nvarchar(255)
    */
    get NameSuffix(): string | null {  
        return this.Get('NameSuffix');
    }
    set NameSuffix(value: string | null) {
        this.Set('NameSuffix', value);
    }

    /**
    * * Field Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: AutoUpdateDescription
    * * Display Name: Auto Update Description
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When set to 1 (default), whenever a description is modified in the underlying view (first choice) or table (second choice), the Description column in the entity definition will be automatically updated. If you never set metadata in the database directly, you can leave this alone. However, if you have metadata set in the database level for description, and you want to provide a DIFFERENT description in this entity definition, turn this bit off and then set the Description field and future CodeGen runs will NOT override the Description field here.
    */
    get AutoUpdateDescription(): boolean {  
        return this.Get('AutoUpdateDescription');
    }
    set AutoUpdateDescription(value: boolean) {
        this.Set('AutoUpdateDescription', value);
    }

    /**
    * * Field Name: BaseTable
    * * Display Name: Base Table
    * * SQL Data Type: nvarchar(255)
    */
    get BaseTable(): string {  
        return this.Get('BaseTable');
    }

    /**
    * * Field Name: BaseView
    * * Display Name: Base View
    * * SQL Data Type: nvarchar(255)
    */
    get BaseView(): string {  
        return this.Get('BaseView');
    }
    set BaseView(value: string) {
        this.Set('BaseView', value);
    }

    /**
    * * Field Name: BaseViewGenerated
    * * Display Name: Base View Generated
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When set to 0, CodeGen no longer generates a base view for the entity.
    */
    get BaseViewGenerated(): boolean {  
        return this.Get('BaseViewGenerated');
    }
    set BaseViewGenerated(value: boolean) {
        this.Set('BaseViewGenerated', value);
    }

    /**
    * * Field Name: SchemaName
    * * Display Name: Schema Name
    * * SQL Data Type: nvarchar(255)
    * * Default Value: dbo
    */
    get SchemaName(): string {  
        return this.Get('SchemaName');
    }

    /**
    * * Field Name: VirtualEntity
    * * Display Name: Virtual Entity
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get VirtualEntity(): boolean {  
        return this.Get('VirtualEntity');
    }
    set VirtualEntity(value: boolean) {
        this.Set('VirtualEntity', value);
    }

    /**
    * * Field Name: TrackRecordChanges
    * * Display Name: Track Record Changes
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When set to 1, changes made via the MemberJunction architecture will result in tracking records being created in the RecordChange table. In addition, when turned on CodeGen will ensure that your table has two fields: __mj_CreatedAt and __mj_UpdatedAt which are special fields used in conjunction with the RecordChange table to track changes to rows in your entity.
    */
    get TrackRecordChanges(): boolean {  
        return this.Get('TrackRecordChanges');
    }
    set TrackRecordChanges(value: boolean) {
        this.Set('TrackRecordChanges', value);
    }

    /**
    * * Field Name: AuditRecordAccess
    * * Display Name: Audit Record Access
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When set to 1, accessing a record by an end-user will result in an Audit Log record being created
    */
    get AuditRecordAccess(): boolean {  
        return this.Get('AuditRecordAccess');
    }
    set AuditRecordAccess(value: boolean) {
        this.Set('AuditRecordAccess', value);
    }

    /**
    * * Field Name: AuditViewRuns
    * * Display Name: Audit View Runs
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When set to 1, users running a view against this entity will result in an Audit Log record being created.
    */
    get AuditViewRuns(): boolean {  
        return this.Get('AuditViewRuns');
    }
    set AuditViewRuns(value: boolean) {
        this.Set('AuditViewRuns', value);
    }

    /**
    * * Field Name: IncludeInAPI
    * * Display Name: Include In API
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: If set to 0, the entity will not be available at all in the GraphQL API or the object model.
    */
    get IncludeInAPI(): boolean {  
        return this.Get('IncludeInAPI');
    }
    set IncludeInAPI(value: boolean) {
        this.Set('IncludeInAPI', value);
    }

    /**
    * * Field Name: AllowAllRowsAPI
    * * Display Name: Allow All Rows API
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: If set to 1, a GraphQL query will be enabled that allows access to all rows in the entity.
    */
    get AllowAllRowsAPI(): boolean {  
        return this.Get('AllowAllRowsAPI');
    }
    set AllowAllRowsAPI(value: boolean) {
        this.Set('AllowAllRowsAPI', value);
    }

    /**
    * * Field Name: AllowUpdateAPI
    * * Display Name: Allow Update API
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Global flag controlling if updates are allowed for any user, or not. If set to 1, a GraqhQL mutation and stored procedure are created. Permissions are still required to perform the action but if this flag is set to 0, no user will be able to perform the action.
    */
    get AllowUpdateAPI(): boolean {  
        return this.Get('AllowUpdateAPI');
    }
    set AllowUpdateAPI(value: boolean) {
        this.Set('AllowUpdateAPI', value);
    }

    /**
    * * Field Name: AllowCreateAPI
    * * Display Name: Allow Create API
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Global flag controlling if creates are allowed for any user, or not. If set to 1, a GraqhQL mutation and stored procedure are created. Permissions are still required to perform the action but if this flag is set to 0, no user will be able to perform the action.
    */
    get AllowCreateAPI(): boolean {  
        return this.Get('AllowCreateAPI');
    }
    set AllowCreateAPI(value: boolean) {
        this.Set('AllowCreateAPI', value);
    }

    /**
    * * Field Name: AllowDeleteAPI
    * * Display Name: Allow Delete API
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Global flag controlling if deletes are allowed for any user, or not. If set to 1, a GraqhQL mutation and stored procedure are created. Permissions are still required to perform the action but if this flag is set to 0, no user will be able to perform the action.
    */
    get AllowDeleteAPI(): boolean {  
        return this.Get('AllowDeleteAPI');
    }
    set AllowDeleteAPI(value: boolean) {
        this.Set('AllowDeleteAPI', value);
    }

    /**
    * * Field Name: CustomResolverAPI
    * * Display Name: Custom Resolver API
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Set to 1 if a custom resolver has been created for the entity.
    */
    get CustomResolverAPI(): boolean {  
        return this.Get('CustomResolverAPI');
    }
    set CustomResolverAPI(value: boolean) {
        this.Set('CustomResolverAPI', value);
    }

    /**
    * * Field Name: AllowUserSearchAPI
    * * Display Name: Allow User Search API
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Enabling this bit will result in search being possible at the API and UI layers
    */
    get AllowUserSearchAPI(): boolean {  
        return this.Get('AllowUserSearchAPI');
    }
    set AllowUserSearchAPI(value: boolean) {
        this.Set('AllowUserSearchAPI', value);
    }

    /**
    * * Field Name: FullTextSearchEnabled
    * * Display Name: Full Text Search Enabled
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get FullTextSearchEnabled(): boolean {  
        return this.Get('FullTextSearchEnabled');
    }
    set FullTextSearchEnabled(value: boolean) {
        this.Set('FullTextSearchEnabled', value);
    }

    /**
    * * Field Name: FullTextCatalog
    * * Display Name: Full Text Catalog
    * * SQL Data Type: nvarchar(255)
    */
    get FullTextCatalog(): string | null {  
        return this.Get('FullTextCatalog');
    }
    set FullTextCatalog(value: string | null) {
        this.Set('FullTextCatalog', value);
    }

    /**
    * * Field Name: FullTextCatalogGenerated
    * * Display Name: Full Text Catalog Generated
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get FullTextCatalogGenerated(): boolean {  
        return this.Get('FullTextCatalogGenerated');
    }
    set FullTextCatalogGenerated(value: boolean) {
        this.Set('FullTextCatalogGenerated', value);
    }

    /**
    * * Field Name: FullTextIndex
    * * Display Name: Full Text Index
    * * SQL Data Type: nvarchar(255)
    */
    get FullTextIndex(): string | null {  
        return this.Get('FullTextIndex');
    }
    set FullTextIndex(value: string | null) {
        this.Set('FullTextIndex', value);
    }

    /**
    * * Field Name: FullTextIndexGenerated
    * * Display Name: Full Text Index Generated
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get FullTextIndexGenerated(): boolean {  
        return this.Get('FullTextIndexGenerated');
    }
    set FullTextIndexGenerated(value: boolean) {
        this.Set('FullTextIndexGenerated', value);
    }

    /**
    * * Field Name: FullTextSearchFunction
    * * Display Name: Full Text Search Function
    * * SQL Data Type: nvarchar(255)
    */
    get FullTextSearchFunction(): string | null {  
        return this.Get('FullTextSearchFunction');
    }
    set FullTextSearchFunction(value: string | null) {
        this.Set('FullTextSearchFunction', value);
    }

    /**
    * * Field Name: FullTextSearchFunctionGenerated
    * * Display Name: Full Text Search Function Generated
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get FullTextSearchFunctionGenerated(): boolean {  
        return this.Get('FullTextSearchFunctionGenerated');
    }
    set FullTextSearchFunctionGenerated(value: boolean) {
        this.Set('FullTextSearchFunctionGenerated', value);
    }

    /**
    * * Field Name: UserViewMaxRows
    * * Display Name: User View Max Rows
    * * SQL Data Type: int
    * * Default Value: 1000
    */
    get UserViewMaxRows(): number | null {  
        return this.Get('UserViewMaxRows');
    }
    set UserViewMaxRows(value: number | null) {
        this.Set('UserViewMaxRows', value);
    }

    /**
    * * Field Name: spCreate
    * * Display Name: spCreate
    * * SQL Data Type: nvarchar(255)
    */
    get spCreate(): string | null {  
        return this.Get('spCreate');
    }
    set spCreate(value: string | null) {
        this.Set('spCreate', value);
    }

    /**
    * * Field Name: spUpdate
    * * Display Name: spUpdate
    * * SQL Data Type: nvarchar(255)
    */
    get spUpdate(): string | null {  
        return this.Get('spUpdate');
    }
    set spUpdate(value: string | null) {
        this.Set('spUpdate', value);
    }

    /**
    * * Field Name: spDelete
    * * Display Name: spDelete
    * * SQL Data Type: nvarchar(255)
    */
    get spDelete(): string | null {  
        return this.Get('spDelete');
    }
    set spDelete(value: string | null) {
        this.Set('spDelete', value);
    }

    /**
    * * Field Name: spCreateGenerated
    * * Display Name: sp CreateGenerated
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get spCreateGenerated(): boolean {  
        return this.Get('spCreateGenerated');
    }
    set spCreateGenerated(value: boolean) {
        this.Set('spCreateGenerated', value);
    }

    /**
    * * Field Name: spUpdateGenerated
    * * Display Name: sp Update Generated
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get spUpdateGenerated(): boolean {  
        return this.Get('spUpdateGenerated');
    }
    set spUpdateGenerated(value: boolean) {
        this.Set('spUpdateGenerated', value);
    }

    /**
    * * Field Name: spDeleteGenerated
    * * Display Name: sp Delete Generated
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get spDeleteGenerated(): boolean {  
        return this.Get('spDeleteGenerated');
    }
    set spDeleteGenerated(value: boolean) {
        this.Set('spDeleteGenerated', value);
    }

    /**
    * * Field Name: CascadeDeletes
    * * Display Name: Cascade Deletes
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: When set to 1, the deleted spDelete will pre-process deletion to related entities that have 1:M cardinality with this entity. This does not have effect if spDeleteGenerated = 0
    */
    get CascadeDeletes(): boolean {  
        return this.Get('CascadeDeletes');
    }
    set CascadeDeletes(value: boolean) {
        this.Set('CascadeDeletes', value);
    }

    /**
    * * Field Name: DeleteType
    * * Display Name: Delete Type
    * * SQL Data Type: nvarchar(10)
    * * Default Value: Hard
    * * Value List Type: List
    * * Possible Values 
    *   * Hard
    *   * Soft
    * * Description: Hard deletes physically remove rows from the underlying BaseTable. Soft deletes do not remove rows but instead mark the row as deleted by using the special field __mj_DeletedAt which will automatically be added to the entity's basetable by the CodeGen tool.
    */
    get DeleteType(): 'Hard' | 'Soft' {  
        return this.Get('DeleteType');
    }
    set DeleteType(value: 'Hard' | 'Soft') {
        this.Set('DeleteType', value);
    }

    /**
    * * Field Name: AllowRecordMerge
    * * Display Name: Allow Record Merge
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: This field must be turned on in order to enable merging of records for the entity. For AllowRecordMerge to be turned on, AllowDeleteAPI must be set to 1, and DeleteType must be set to Soft
    */
    get AllowRecordMerge(): boolean {  
        return this.Get('AllowRecordMerge');
    }
    set AllowRecordMerge(value: boolean) {
        this.Set('AllowRecordMerge', value);
    }

    /**
    * * Field Name: spMatch
    * * Display Name: sp Match
    * * SQL Data Type: nvarchar(255)
    * * Description: When specified, this stored procedure is used to find matching records in this particular entity. The convention is to pass in the primary key(s) columns for the given entity to the procedure and the return will be zero to many rows where there is a column for each primary key field(s) and a ProbabilityScore (numeric(1,12)) column that has a 0 to 1 value of the probability of a match.
    */
    get spMatch(): string | null {  
        return this.Get('spMatch');
    }
    set spMatch(value: string | null) {
        this.Set('spMatch', value);
    }

    /**
    * * Field Name: RelationshipDefaultDisplayType
    * * Display Name: Relationship Default Display Type
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Search
    * * Value List Type: List
    * * Possible Values 
    *   * Search
    *   * Dropdown
    * * Description: When another entity links to this entity with a foreign key, this is the default component type that will be used in the UI. CodeGen will populate the RelatedEntityDisplayType column in the Entity Fields entity with whatever is provided here whenever a new foreign key is detected by CodeGen. The selection can be overridden on a per-foreign-key basis in each row of the Entity Fields entity.
    */
    get RelationshipDefaultDisplayType(): 'Search' | 'Dropdown' {  
        return this.Get('RelationshipDefaultDisplayType');
    }
    set RelationshipDefaultDisplayType(value: 'Search' | 'Dropdown') {
        this.Set('RelationshipDefaultDisplayType', value);
    }

    /**
    * * Field Name: UserFormGenerated
    * * Display Name: User Form Generated
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get UserFormGenerated(): boolean {  
        return this.Get('UserFormGenerated');
    }
    set UserFormGenerated(value: boolean) {
        this.Set('UserFormGenerated', value);
    }

    /**
    * * Field Name: EntityObjectSubclassName
    * * Display Name: Entity Object Subclass Name
    * * SQL Data Type: nvarchar(255)
    */
    get EntityObjectSubclassName(): string | null {  
        return this.Get('EntityObjectSubclassName');
    }
    set EntityObjectSubclassName(value: string | null) {
        this.Set('EntityObjectSubclassName', value);
    }

    /**
    * * Field Name: EntityObjectSubclassImport
    * * Display Name: Entity Object Subclass Import
    * * SQL Data Type: nvarchar(255)
    */
    get EntityObjectSubclassImport(): string | null {  
        return this.Get('EntityObjectSubclassImport');
    }
    set EntityObjectSubclassImport(value: string | null) {
        this.Set('EntityObjectSubclassImport', value);
    }

    /**
    * * Field Name: PreferredCommunicationField
    * * Display Name: Preferred Communication Field
    * * SQL Data Type: nvarchar(255)
    * * Description: Used to specify a field within the entity that in turn contains the field name that will be used for record-level communication preferences. For example in a hypothetical entity called Contacts, say there is a field called PreferredComm and that field had possible values of Email1, SMS, and Phone, and those value in turn corresponded to field names in the entity. Each record in the Contacts entity could have a specific preference for which field would be used for communication. The MJ Communication Framework will use this information when available, as a priority ahead of the data in the Entity Communication Fields entity which is entity-level and not record-level.
    */
    get PreferredCommunicationField(): string | null {  
        return this.Get('PreferredCommunicationField');
    }
    set PreferredCommunicationField(value: string | null) {
        this.Set('PreferredCommunicationField', value);
    }

    /**
    * * Field Name: Icon
    * * Display Name: Icon
    * * SQL Data Type: nvarchar(500)
    * * Description: Optional, specify an icon (CSS Class) for each entity for display in the UI
    */
    get Icon(): string | null {  
        return this.Get('Icon');
    }
    set Icon(value: string | null) {
        this.Set('Icon', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: CodeName
    * * Display Name: Code Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get CodeName(): string | null {  
        return this.Get('CodeName');
    }

    /**
    * * Field Name: ClassName
    * * Display Name: Class Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get ClassName(): string | null {  
        return this.Get('ClassName');
    }

    /**
    * * Field Name: BaseTableCodeName
    * * Display Name: Base Table Code Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get BaseTableCodeName(): string | null {  
        return this.Get('BaseTableCodeName');
    }

    /**
    * * Field Name: ParentEntity
    * * Display Name: Parent Entity
    * * SQL Data Type: nvarchar(255)
    */
    get ParentEntity(): string | null {  
        return this.Get('ParentEntity');
    }

    /**
    * * Field Name: ParentBaseTable
    * * Display Name: Parent Base Table
    * * SQL Data Type: nvarchar(255)
    */
    get ParentBaseTable(): string | null {  
        return this.Get('ParentBaseTable');
    }

    /**
    * * Field Name: ParentBaseView
    * * Display Name: Parent Base View
    * * SQL Data Type: nvarchar(255)
    */
    get ParentBaseView(): string | null {  
        return this.Get('ParentBaseView');
    }
}

            
/**
 * Entity Action Filters - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityActionFilter
 * * Base View: vwEntityActionFilters
 * * @description Optional use. Maps Action Filters to specific EntityAction instances, specifying execution order and status. This allows for “pre-processing” before an Action actually is fired off, to check for various state/dirty/value conditions.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Action Filters')
export class EntityActionFilterEntity extends BaseEntity<EntityActionFilterEntityType> {
    /**
    * Loads the Entity Action Filters record from the database
    * @param ID: string - primary key value to load the Entity Action Filters record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityActionFilterEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: EntityActionID
    * * Display Name: Entity Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entity Actions (vwEntityActions.ID)
    */
    get EntityActionID(): string {  
        return this.Get('EntityActionID');
    }
    set EntityActionID(value: string) {
        this.Set('EntityActionID', value);
    }

    /**
    * * Field Name: ActionFilterID
    * * Display Name: Action Filter ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Action Filters (vwActionFilters.ID)
    */
    get ActionFilterID(): string {  
        return this.Get('ActionFilterID');
    }
    set ActionFilterID(value: string) {
        this.Set('ActionFilterID', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Description: Order of filter execution.
    */
    get Sequence(): number {  
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Disabled
    *   * Active
    *   * Pending
    * * Description: Status of the entity action filter (Pending, Active, Disabled).
    */
    get Status(): 'Disabled' | 'Active' | 'Pending' {  
        return this.Get('Status');
    }
    set Status(value: 'Disabled' | 'Active' | 'Pending') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }
}

            
/**
 * Entity Action Invocation Types - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityActionInvocationType
 * * Base View: vwEntityActionInvocationTypes
 * * @description Stores the possible invocation types of an action within the context of an entity. Examples would be: Record Created/Updated/Deleted/Accessed as well as things like “View” or “List” where you could run an EntityAction against an entire set of records in a view or list – either by user click or programmatically.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Action Invocation Types')
export class EntityActionInvocationTypeEntity extends BaseEntity<EntityActionInvocationTypeEntityType> {
    /**
    * Loads the Entity Action Invocation Types record from the database
    * @param ID: string - primary key value to load the Entity Action Invocation Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityActionInvocationTypeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Description: Name of the invocation type such as Record Created/Updated/etc.
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
    * * Description: Description of the invocation type.
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: DisplaySequence
    * * Display Name: Display Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get DisplaySequence(): number {  
        return this.Get('DisplaySequence');
    }
    set DisplaySequence(value: number) {
        this.Set('DisplaySequence', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }
}

            
/**
 * Entity Action Invocations - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityActionInvocation
 * * Base View: vwEntityActionInvocations
 * * @description Links invocation types to entity actions – for example you might link a particular EntityAction to just “Create Record” and you might also have a second item in this table allowing the same Entity Action to be invoked from a User View or List, on demand.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Action Invocations')
export class EntityActionInvocationEntity extends BaseEntity<EntityActionInvocationEntityType> {
    /**
    * Loads the Entity Action Invocations record from the database
    * @param ID: string - primary key value to load the Entity Action Invocations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityActionInvocationEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: EntityActionID
    * * Display Name: Entity Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entity Actions (vwEntityActions.ID)
    */
    get EntityActionID(): string {  
        return this.Get('EntityActionID');
    }
    set EntityActionID(value: string) {
        this.Set('EntityActionID', value);
    }

    /**
    * * Field Name: InvocationTypeID
    * * Display Name: Invocation Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entity Action Invocation Types (vwEntityActionInvocationTypes.ID)
    */
    get InvocationTypeID(): string {  
        return this.Get('InvocationTypeID');
    }
    set InvocationTypeID(value: string) {
        this.Set('InvocationTypeID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Disabled
    *   * Active
    *   * Pending
    * * Description: Status of the entity action invocation (Pending, Active, Disabled).
    */
    get Status(): 'Disabled' | 'Active' | 'Pending' {  
        return this.Get('Status');
    }
    set Status(value: 'Disabled' | 'Active' | 'Pending') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: InvocationType
    * * Display Name: Invocation Type
    * * SQL Data Type: nvarchar(255)
    */
    get InvocationType(): string {  
        return this.Get('InvocationType');
    }
}

            
/**
 * Entity Action Params - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityActionParam
 * * Base View: vwEntityActionParams
 * * @description Stores paramater mappings to enable Entity Actions to automatically invoke Actions
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Action Params')
export class EntityActionParamEntity extends BaseEntity<EntityActionParamEntityType> {
    /**
    * Loads the Entity Action Params record from the database
    * @param ID: string - primary key value to load the Entity Action Params record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityActionParamEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: EntityActionID
    * * Display Name: Entity Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entity Actions (vwEntityActions.ID)
    */
    get EntityActionID(): string {  
        return this.Get('EntityActionID');
    }
    set EntityActionID(value: string) {
        this.Set('EntityActionID', value);
    }

    /**
    * * Field Name: ActionParamID
    * * Display Name: Action Param ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Action Params (vwActionParams.ID)
    */
    get ActionParamID(): string {  
        return this.Get('ActionParamID');
    }
    set ActionParamID(value: string) {
        this.Set('ActionParamID', value);
    }

    /**
    * * Field Name: ValueType
    * * Display Name: Value Type
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Static
    *   * Entity Object
    *   * Script
    *   * Entity Field
    * * Description: Type of the value, which can be Static, Entity Object, or Script.
    */
    get ValueType(): 'Static' | 'Entity Object' | 'Script' | 'Entity Field' {  
        return this.Get('ValueType');
    }
    set ValueType(value: 'Static' | 'Entity Object' | 'Script' | 'Entity Field') {
        this.Set('ValueType', value);
    }

    /**
    * * Field Name: Value
    * * Display Name: Value
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Value of the parameter, used only when ValueType is Static or Script. When value is Script, any valid JavaScript code can be provided. The script will have access to an object called EntityActionContext. This object will have a property called EntityObject on it that will contain the BaseEntity derived sub-class with the current data for the entity object this action is operating against. The script must provide the parameter value to the EntityActionContext.result property. This scripting capabilty is designed for very small and simple code, for anything of meaningful complexity, create a sub-class instead.
    */
    get Value(): string | null {  
        return this.Get('Value');
    }
    set Value(value: string | null) {
        this.Set('Value', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Additional comments regarding the parameter.
    */
    get Comments(): string | null {  
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
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
    * * Field Name: ActionParam
    * * Display Name: Action Param
    * * SQL Data Type: nvarchar(255)
    */
    get ActionParam(): string {  
        return this.Get('ActionParam');
    }
}

            
/**
 * Entity Actions - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityAction
 * * Base View: vwEntityActions
 * * @description Links entities to actions - this is the main place where you define the actions that part of, or available, for a given entity.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Actions')
export class EntityActionEntity extends BaseEntity<EntityActionEntityType> {
    /**
    * Loads the Entity Actions record from the database
    * @param ID: string - primary key value to load the Entity Actions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityActionEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: ActionID
    * * Display Name: Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Actions (vwActions.ID)
    */
    get ActionID(): string {  
        return this.Get('ActionID');
    }
    set ActionID(value: string) {
        this.Set('ActionID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Disabled
    *   * Active
    *   * Pending
    * * Description: Status of the entity action (Pending, Active, Disabled).
    */
    get Status(): 'Disabled' | 'Active' | 'Pending' {  
        return this.Get('Status');
    }
    set Status(value: 'Disabled' | 'Active' | 'Pending') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
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
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: Action
    * * Display Name: Action
    * * SQL Data Type: nvarchar(425)
    */
    get Action(): string {  
        return this.Get('Action');
    }
}

            
/**
 * Entity AI Actions - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityAIAction
 * * Base View: vwEntityAIActions
 * * @description Tracks the AI actions that should be invoked based on changes to records within a given entity.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity AI Actions')
export class EntityAIActionEntity extends BaseEntity<EntityAIActionEntityType> {
    /**
    * Loads the Entity AI Actions record from the database
    * @param ID: string - primary key value to load the Entity AI Actions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityAIActionEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: AIModelID
    * * Display Name: AI Model ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)
    */
    get AIModelID(): string {  
        return this.Get('AIModelID');
    }
    set AIModelID(value: string) {
        this.Set('AIModelID', value);
    }

    /**
    * * Field Name: AIActionID
    * * Display Name: AI Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: AI Actions (vwAIActions.ID)
    */
    get AIActionID(): string {  
        return this.Get('AIActionID');
    }
    set AIActionID(value: string) {
        this.Set('AIActionID', value);
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
    * * Field Name: Prompt
    * * Display Name: Prompt
    * * SQL Data Type: nvarchar(MAX)
    */
    get Prompt(): string | null {  
        return this.Get('Prompt');
    }
    set Prompt(value: string | null) {
        this.Set('Prompt', value);
    }

    /**
    * * Field Name: TriggerEvent
    * * Display Name: Trigger Event
    * * SQL Data Type: nchar(15)
    * * Default Value: After Save
    * * Value List Type: List
    * * Possible Values 
    *   * after save
    *   * before save
    */
    get TriggerEvent(): 'after save' | 'before save' {  
        return this.Get('TriggerEvent');
    }
    set TriggerEvent(value: 'after save' | 'before save') {
        this.Set('TriggerEvent', value);
    }

    /**
    * * Field Name: UserMessage
    * * Display Name: User Message
    * * SQL Data Type: nvarchar(MAX)
    */
    get UserMessage(): string {  
        return this.Get('UserMessage');
    }
    set UserMessage(value: string) {
        this.Set('UserMessage', value);
    }

    /**
    * * Field Name: OutputType
    * * Display Name: Output Type
    * * SQL Data Type: nchar(10)
    * * Default Value: FIeld
    * * Value List Type: List
    * * Possible Values 
    *   * entity
    *   * field
    */
    get OutputType(): 'entity' | 'field' {  
        return this.Get('OutputType');
    }
    set OutputType(value: 'entity' | 'field') {
        this.Set('OutputType', value);
    }

    /**
    * * Field Name: OutputField
    * * Display Name: Output Field
    * * SQL Data Type: nvarchar(50)
    */
    get OutputField(): string | null {  
        return this.Get('OutputField');
    }
    set OutputField(value: string | null) {
        this.Set('OutputField', value);
    }

    /**
    * * Field Name: SkipIfOutputFieldNotEmpty
    * * Display Name: Skip If Output Field Not Empty
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get SkipIfOutputFieldNotEmpty(): boolean {  
        return this.Get('SkipIfOutputFieldNotEmpty');
    }
    set SkipIfOutputFieldNotEmpty(value: boolean) {
        this.Set('SkipIfOutputFieldNotEmpty', value);
    }

    /**
    * * Field Name: OutputEntityID
    * * Display Name: Output Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get OutputEntityID(): string | null {  
        return this.Get('OutputEntityID');
    }
    set OutputEntityID(value: string | null) {
        this.Set('OutputEntityID', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get Comments(): string | null {  
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: AIModel
    * * Display Name: AIModel
    * * SQL Data Type: nvarchar(50)
    */
    get AIModel(): string {  
        return this.Get('AIModel');
    }

    /**
    * * Field Name: AIAction
    * * Display Name: AIAction
    * * SQL Data Type: nvarchar(50)
    */
    get AIAction(): string {  
        return this.Get('AIAction');
    }

    /**
    * * Field Name: OutputEntity
    * * Display Name: Output Entity
    * * SQL Data Type: nvarchar(255)
    */
    get OutputEntity(): string | null {  
        return this.Get('OutputEntity');
    }
}

            
/**
 * Entity Communication Fields - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityCommunicationField
 * * Base View: vwEntityCommunicationFields
 * * @description Mapping between entity fields and communication base message types with priority
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Communication Fields')
export class EntityCommunicationFieldEntity extends BaseEntity<EntityCommunicationFieldEntityType> {
    /**
    * Loads the Entity Communication Fields record from the database
    * @param ID: string - primary key value to load the Entity Communication Fields record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityCommunicationFieldEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Entity Communication Fields - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof EntityCommunicationFieldEntity
    * @throws {Error} - Delete is not allowed for Entity Communication Fields, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Entity Communication Fields, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: EntityCommunicationMessageTypeID
    * * Display Name: Entity Communication Message Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entity Communication Message Types (vwEntityCommunicationMessageTypes.ID)
    */
    get EntityCommunicationMessageTypeID(): string {  
        return this.Get('EntityCommunicationMessageTypeID');
    }
    set EntityCommunicationMessageTypeID(value: string) {
        this.Set('EntityCommunicationMessageTypeID', value);
    }

    /**
    * * Field Name: FieldName
    * * Display Name: Field Name
    * * SQL Data Type: nvarchar(500)
    * * Description: Name of the field in the entity that maps to the communication base message type
    */
    get FieldName(): string {  
        return this.Get('FieldName');
    }
    set FieldName(value: string) {
        this.Set('FieldName', value);
    }

    /**
    * * Field Name: Priority
    * * Display Name: Priority
    * * SQL Data Type: int
    * * Description: Priority of the field for the communication base message type
    */
    get Priority(): number {  
        return this.Get('Priority');
    }
    set Priority(value: number) {
        this.Set('Priority', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }
}

            
/**
 * Entity Communication Message Types - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityCommunicationMessageType
 * * Base View: vwEntityCommunicationMessageTypes
 * * @description Mapping between entities and communication base message types
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Communication Message Types')
export class EntityCommunicationMessageTypeEntity extends BaseEntity<EntityCommunicationMessageTypeEntityType> {
    /**
    * Loads the Entity Communication Message Types record from the database
    * @param ID: string - primary key value to load the Entity Communication Message Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityCommunicationMessageTypeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Entity Communication Message Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof EntityCommunicationMessageTypeEntity
    * @throws {Error} - Delete is not allowed for Entity Communication Message Types, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Entity Communication Message Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: BaseMessageTypeID
    * * Display Name: Base Message Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Communication Base Message Types (vwCommunicationBaseMessageTypes.ID)
    */
    get BaseMessageTypeID(): string {  
        return this.Get('BaseMessageTypeID');
    }
    set BaseMessageTypeID(value: string) {
        this.Set('BaseMessageTypeID', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Indicates whether the message type is active
    */
    get IsActive(): boolean {  
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: BaseMessageType
    * * Display Name: Base Message Type
    * * SQL Data Type: nvarchar(100)
    */
    get BaseMessageType(): string {  
        return this.Get('BaseMessageType');
    }
}

            
/**
 * Entity Document Runs - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityDocumentRun
 * * Base View: vwEntityDocumentRuns
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Document Runs')
export class EntityDocumentRunEntity extends BaseEntity<EntityDocumentRunEntityType> {
    /**
    * Loads the Entity Document Runs record from the database
    * @param ID: string - primary key value to load the Entity Document Runs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityDocumentRunEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Entity Document Runs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof EntityDocumentRunEntity
    * @throws {Error} - Delete is not allowed for Entity Document Runs, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Entity Document Runs, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: EntityDocumentID
    * * Display Name: Entity Document ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entity Documents (vwEntityDocuments.ID)
    */
    get EntityDocumentID(): string {  
        return this.Get('EntityDocumentID');
    }
    set EntityDocumentID(value: string) {
        this.Set('EntityDocumentID', value);
    }

    /**
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetime
    */
    get StartedAt(): Date | null {  
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date | null) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: EndedAt
    * * Display Name: Ended At
    * * SQL Data Type: datetime
    */
    get EndedAt(): Date | null {  
        return this.Get('EndedAt');
    }
    set EndedAt(value: Date | null) {
        this.Set('EndedAt', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(15)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Complete
    *   * Failed
    * * Description: Can be Pending, In Progress, Completed, or Failed
    */
    get Status(): 'Pending' | 'Complete' | 'Failed' {  
        return this.Get('Status');
    }
    set Status(value: 'Pending' | 'Complete' | 'Failed') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: EntityDocument
    * * Display Name: Entity Document
    * * SQL Data Type: nvarchar(250)
    */
    get EntityDocument(): string {  
        return this.Get('EntityDocument');
    }
}

            
/**
 * Entity Document Settings - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityDocumentSetting
 * * Base View: vwEntityDocumentSettings
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Document Settings')
export class EntityDocumentSettingEntity extends BaseEntity<EntityDocumentSettingEntityType> {
    /**
    * Loads the Entity Document Settings record from the database
    * @param ID: string - primary key value to load the Entity Document Settings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityDocumentSettingEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Entity Document Settings - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof EntityDocumentSettingEntity
    * @throws {Error} - Delete is not allowed for Entity Document Settings, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Entity Document Settings, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: EntityDocumentID
    * * Display Name: Entity Document ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entity Documents (vwEntityDocuments.ID)
    */
    get EntityDocumentID(): string {  
        return this.Get('EntityDocumentID');
    }
    set EntityDocumentID(value: string) {
        this.Set('EntityDocumentID', value);
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
    * * Field Name: Value
    * * Display Name: Value
    * * SQL Data Type: nvarchar(MAX)
    */
    get Value(): string {  
        return this.Get('Value');
    }
    set Value(value: string) {
        this.Set('Value', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get Comments(): string | null {  
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: EntityDocument
    * * Display Name: Entity Document
    * * SQL Data Type: nvarchar(250)
    */
    get EntityDocument(): string {  
        return this.Get('EntityDocument');
    }
}

            
/**
 * Entity Document Types - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityDocumentType
 * * Base View: vwEntityDocumentTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Document Types')
export class EntityDocumentTypeEntity extends BaseEntity<EntityDocumentTypeEntityType> {
    /**
    * Loads the Entity Document Types record from the database
    * @param ID: string - primary key value to load the Entity Document Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityDocumentTypeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Entity Document Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof EntityDocumentTypeEntity
    * @throws {Error} - Delete is not allowed for Entity Document Types, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Entity Document Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }
}

            
/**
 * Entity Documents - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityDocument
 * * Base View: vwEntityDocuments
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Documents')
export class EntityDocumentEntity extends BaseEntity<EntityDocumentEntityType> {
    /**
    * Loads the Entity Documents record from the database
    * @param ID: string - primary key value to load the Entity Documents record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityDocumentEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Entity Documents - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof EntityDocumentEntity
    * @throws {Error} - Delete is not allowed for Entity Documents, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Entity Documents, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * SQL Data Type: nvarchar(250)
    */
    get Name(): string {  
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: TypeID
    * * Display Name: Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entity Document Types (vwEntityDocumentTypes.ID)
    */
    get TypeID(): string {  
        return this.Get('TypeID');
    }
    set TypeID(value: string) {
        this.Set('TypeID', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: VectorDatabaseID
    * * Display Name: Vector Database ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Vector Databases (vwVectorDatabases.ID)
    */
    get VectorDatabaseID(): string {  
        return this.Get('VectorDatabaseID');
    }
    set VectorDatabaseID(value: string) {
        this.Set('VectorDatabaseID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(15)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Inactive
    */
    get Status(): 'Active' | 'Inactive' {  
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Inactive') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: TemplateID
    * * Display Name: Template ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Templates (vwTemplates.ID)
    */
    get TemplateID(): string {  
        return this.Get('TemplateID');
    }
    set TemplateID(value: string) {
        this.Set('TemplateID', value);
    }

    /**
    * * Field Name: AIModelID
    * * Display Name: AIModel ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)
    */
    get AIModelID(): string {  
        return this.Get('AIModelID');
    }
    set AIModelID(value: string) {
        this.Set('AIModelID', value);
    }

    /**
    * * Field Name: PotentialMatchThreshold
    * * Display Name: Potential Match Threshold
    * * SQL Data Type: numeric(12, 11)
    * * Default Value: 1
    * * Description: Value between 0 and 1 that determines what is considered a potential matching record. Value must be <= AbsoluteMatchThreshold. This is primarily used for duplicate detection but can be used for other applications as well where matching is relevant.
    */
    get PotentialMatchThreshold(): number {  
        return this.Get('PotentialMatchThreshold');
    }
    set PotentialMatchThreshold(value: number) {
        this.Set('PotentialMatchThreshold', value);
    }

    /**
    * * Field Name: AbsoluteMatchThreshold
    * * Display Name: Absolute Match Threshold
    * * SQL Data Type: numeric(12, 11)
    * * Default Value: 1
    * * Description: Value between 0 and 1 that determines what is considered an absolute matching record. Value must be >= PotentialMatchThreshold. This is primarily used for duplicate detection but can be used for other applications as well where matching is relevant.
    */
    get AbsoluteMatchThreshold(): number {  
        return this.Get('AbsoluteMatchThreshold');
    }
    set AbsoluteMatchThreshold(value: number) {
        this.Set('AbsoluteMatchThreshold', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(100)
    */
    get Type(): string {  
        return this.Get('Type');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: VectorDatabase
    * * Display Name: Vector Database
    * * SQL Data Type: nvarchar(100)
    */
    get VectorDatabase(): string {  
        return this.Get('VectorDatabase');
    }

    /**
    * * Field Name: Template
    * * Display Name: Template
    * * SQL Data Type: nvarchar(255)
    */
    get Template(): string {  
        return this.Get('Template');
    }

    /**
    * * Field Name: AIModel
    * * Display Name: AIModel
    * * SQL Data Type: nvarchar(50)
    */
    get AIModel(): string {  
        return this.Get('AIModel');
    }
}

            
/**
 * Entity Field Values - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityFieldValue
 * * Base View: vwEntityFieldValues
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Field Values')
export class EntityFieldValueEntity extends BaseEntity<EntityFieldValueEntityType> {
    /**
    * Loads the Entity Field Values record from the database
    * @param ID: string - primary key value to load the Entity Field Values record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityFieldValueEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Entity Field Values - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof EntityFieldValueEntity
    * @throws {Error} - Delete is not allowed for Entity Field Values, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Entity Field Values, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: EntityFieldID
    * * Display Name: Entity Field ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entity Fields (vwEntityFields.ID)
    */
    get EntityFieldID(): string {  
        return this.Get('EntityFieldID');
    }
    set EntityFieldID(value: string) {
        this.Set('EntityFieldID', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    */
    get Sequence(): number {  
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: Value
    * * Display Name: Value
    * * SQL Data Type: nvarchar(255)
    */
    get Value(): string {  
        return this.Get('Value');
    }
    set Value(value: string) {
        this.Set('Value', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(50)
    */
    get Code(): string | null {  
        return this.Get('Code');
    }
    set Code(value: string | null) {
        this.Set('Code', value);
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
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: EntityField
    * * Display Name: Entity Field
    * * SQL Data Type: nvarchar(255)
    */
    get EntityField(): string {  
        return this.Get('EntityField');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
}

            
/**
 * Entity Fields - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityField
 * * Base View: vwEntityFields
 * * @description List of all fields within each entity with metadata about each field
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Fields')
export class EntityFieldEntity extends BaseEntity<EntityFieldEntityType> {
    /**
    * Loads the Entity Fields record from the database
    * @param ID: string - primary key value to load the Entity Fields record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityFieldEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }

    /**
    * * Field Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Display order of the field within the entity
    */
    get Sequence(): number {  
        return this.Get('Sequence');
    }

    /**
    * * Field Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Name of the field within the database table
    */
    get Name(): string {  
        return this.Get('Name');
    }

    /**
    * * Field Name: DisplayName
    * * Display Name: Display Name
    * * SQL Data Type: nvarchar(255)
    * * Description: A user friendly alternative to the field name
    */
    get DisplayName(): string | null {  
        return this.Get('DisplayName');
    }
    set DisplayName(value: string | null) {
        this.Set('DisplayName', value);
    }

    /**
    * * Field Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Descriptive text explaining the purpose of the field
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: AutoUpdateDescription
    * * Display Name: Auto Update Description
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When set to 1 (default), whenever a description is modified in the column within the underlying view (first choice) or table (second choice), the Description column in the entity field definition will be automatically updated. If you never set metadata in the database directly, you can leave this alone. However, if you have metadata set in the database level for description, and you want to provide a DIFFERENT description in this entity field definition, turn this bit off and then set the Description field and future CodeGen runs will NOT override the Description field here.
    */
    get AutoUpdateDescription(): boolean {  
        return this.Get('AutoUpdateDescription');
    }
    set AutoUpdateDescription(value: boolean) {
        this.Set('AutoUpdateDescription', value);
    }

    /**
    * * Field Name: IsPrimaryKey
    * * Display Name: Is Primary Key
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Indicates if the field is part of the primary key for the entity (auto maintained by CodeGen)
    */
    get IsPrimaryKey(): boolean {  
        return this.Get('IsPrimaryKey');
    }
    set IsPrimaryKey(value: boolean) {
        this.Set('IsPrimaryKey', value);
    }

    /**
    * * Field Name: IsUnique
    * * Display Name: Is Unique
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Indicates if the field must have unique values within the entity.
    */
    get IsUnique(): boolean {  
        return this.Get('IsUnique');
    }
    set IsUnique(value: boolean) {
        this.Set('IsUnique', value);
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(255)
    * * Description: Used for generating custom tabs in the generated forms, only utilized if GeneratedFormSection=Category
    */
    get Category(): string | null {  
        return this.Get('Category');
    }
    set Category(value: string | null) {
        this.Set('Category', value);
    }

    /**
    * * Field Name: Type
    * * SQL Data Type: nvarchar(100)
    * * Description: SQL Data type (auto maintained by CodeGen)
    */
    get Type(): string {  
        return this.Get('Type');
    }

    /**
    * * Field Name: Length
    * * SQL Data Type: int
    * * Description: SQL data length (auto maintained by CodeGen)
    */
    get Length(): number | null {  
        return this.Get('Length');
    }

    /**
    * * Field Name: Precision
    * * SQL Data Type: int
    * * Description: SQL precision (auto maintained by CodeGen)
    */
    get Precision(): number | null {  
        return this.Get('Precision');
    }

    /**
    * * Field Name: Scale
    * * SQL Data Type: int
    * * Description: SQL scale (auto maintained by CodeGen)
    */
    get Scale(): number | null {  
        return this.Get('Scale');
    }

    /**
    * * Field Name: AllowsNull
    * * Display Name: Allows Null
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Does the column allow null or not (auto maintained by CodeGen)
    */
    get AllowsNull(): boolean {  
        return this.Get('AllowsNull');
    }

    /**
    * * Field Name: DefaultValue
    * * Display Name: Default Value
    * * SQL Data Type: nvarchar(255)
    * * Description: If a default value is defined for the field it is stored here (auto maintained by CodeGen)
    */
    get DefaultValue(): string | null {  
        return this.Get('DefaultValue');
    }

    /**
    * * Field Name: AutoIncrement
    * * Display Name: Auto Increment
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: If this field automatically increments within the table, this field is set to 1 (auto maintained by CodeGen)
    */
    get AutoIncrement(): boolean {  
        return this.Get('AutoIncrement');
    }

    /**
    * * Field Name: ValueListType
    * * Display Name: Value List Type
    * * SQL Data Type: nvarchar(20)
    * * Default Value: None
    * * Value List Type: List
    * * Possible Values 
    *   * None
    *   * List
    *   * ListOrUserEntry
    * * Description: Possible Values of None, List, ListOrUserEntry - the last option meaning that the list of possible values are options, but a user can enter anything else desired too.
    */
    get ValueListType(): 'None' | 'List' | 'ListOrUserEntry' {  
        return this.Get('ValueListType');
    }
    set ValueListType(value: 'None' | 'List' | 'ListOrUserEntry') {
        this.Set('ValueListType', value);
    }

    /**
    * * Field Name: ExtendedType
    * * Display Name: Extended Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Email
    *   * URL
    *   * Tel
    *   * SMS
    *   * Geo
    *   * WhatsApp
    *   * FaceTime
    *   * Skype
    *   * SIP
    *   * MSTeams
    *   * ZoomMtg
    *   * Other
    *   * Code
    * * Description: Defines extended behaviors for a field such as for Email, Web URLs, Code, etc.
    */
    get ExtendedType(): 'Email' | 'URL' | 'Tel' | 'SMS' | 'Geo' | 'WhatsApp' | 'FaceTime' | 'Skype' | 'SIP' | 'MSTeams' | 'ZoomMtg' | 'Other' | 'Code' | null {  
        return this.Get('ExtendedType');
    }
    set ExtendedType(value: 'Email' | 'URL' | 'Tel' | 'SMS' | 'Geo' | 'WhatsApp' | 'FaceTime' | 'Skype' | 'SIP' | 'MSTeams' | 'ZoomMtg' | 'Other' | 'Code' | null) {
        this.Set('ExtendedType', value);
    }

    /**
    * * Field Name: CodeType
    * * Display Name: Code Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * TypeScript
    *   * SQL
    *   * HTML
    *   * CSS
    *   * JavaScript
    *   * Other
    * * Description: The type of code associated with this field. Only used when the ExtendedType field is set to "Code"
    */
    get CodeType(): 'TypeScript' | 'SQL' | 'HTML' | 'CSS' | 'JavaScript' | 'Other' | null {  
        return this.Get('CodeType');
    }
    set CodeType(value: 'TypeScript' | 'SQL' | 'HTML' | 'CSS' | 'JavaScript' | 'Other' | null) {
        this.Set('CodeType', value);
    }

    /**
    * * Field Name: DefaultInView
    * * Display Name: Default In View
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: If set to 1, this field will be included by default in any new view created by a user.
    */
    get DefaultInView(): boolean {  
        return this.Get('DefaultInView');
    }
    set DefaultInView(value: boolean) {
        this.Set('DefaultInView', value);
    }

    /**
    * * Field Name: ViewCellTemplate
    * * Display Name: View Cell Template
    * * SQL Data Type: nvarchar(MAX)
    * * Description: NULL
    */
    get ViewCellTemplate(): string | null {  
        return this.Get('ViewCellTemplate');
    }
    set ViewCellTemplate(value: string | null) {
        this.Set('ViewCellTemplate', value);
    }

    /**
    * * Field Name: DefaultColumnWidth
    * * Display Name: Default Column Width
    * * SQL Data Type: int
    * * Description: Determines the default width for this field when included in a view
    */
    get DefaultColumnWidth(): number | null {  
        return this.Get('DefaultColumnWidth');
    }
    set DefaultColumnWidth(value: number | null) {
        this.Set('DefaultColumnWidth', value);
    }

    /**
    * * Field Name: AllowUpdateAPI
    * * Display Name: Allow Update API
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: If set to 1, this field will be considered updateable by the API and object model. For this field to have effect, the column type must be updateable (e.g. not part of the primary key and not auto-increment)
    */
    get AllowUpdateAPI(): boolean {  
        return this.Get('AllowUpdateAPI');
    }
    set AllowUpdateAPI(value: boolean) {
        this.Set('AllowUpdateAPI', value);
    }

    /**
    * * Field Name: AllowUpdateInView
    * * Display Name: Allow Update In View
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: If set to 1, and if AllowUpdateAPI=1, the field can be edited within a view when the view is in edit mode.
    */
    get AllowUpdateInView(): boolean {  
        return this.Get('AllowUpdateInView');
    }
    set AllowUpdateInView(value: boolean) {
        this.Set('AllowUpdateInView', value);
    }

    /**
    * * Field Name: IncludeInUserSearchAPI
    * * Display Name: Include In User Search API
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: If set to 1, this column will be included in user search queries for both traditional and full text search
    */
    get IncludeInUserSearchAPI(): boolean {  
        return this.Get('IncludeInUserSearchAPI');
    }
    set IncludeInUserSearchAPI(value: boolean) {
        this.Set('IncludeInUserSearchAPI', value);
    }

    /**
    * * Field Name: FullTextSearchEnabled
    * * Display Name: Full Text Search Enabled
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: If set to 1, CodeGen will automatically generate a Full Text Catalog/Index in the database and include this field in the search index.
    */
    get FullTextSearchEnabled(): boolean {  
        return this.Get('FullTextSearchEnabled');
    }
    set FullTextSearchEnabled(value: boolean) {
        this.Set('FullTextSearchEnabled', value);
    }

    /**
    * * Field Name: UserSearchParamFormatAPI
    * * Display Name: User Search Param Format API
    * * SQL Data Type: nvarchar(500)
    * * Description: NULL
    */
    get UserSearchParamFormatAPI(): string | null {  
        return this.Get('UserSearchParamFormatAPI');
    }
    set UserSearchParamFormatAPI(value: string | null) {
        this.Set('UserSearchParamFormatAPI', value);
    }

    /**
    * * Field Name: IncludeInGeneratedForm
    * * Display Name: Include In Generated Form
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: If set to 1, this field will be included in the generated form by CodeGen. If set to 0, this field will be excluded from the generated form. For custom forms, this field has no effect as the layout is controlled independently.
    */
    get IncludeInGeneratedForm(): boolean {  
        return this.Get('IncludeInGeneratedForm');
    }
    set IncludeInGeneratedForm(value: boolean) {
        this.Set('IncludeInGeneratedForm', value);
    }

    /**
    * * Field Name: GeneratedFormSection
    * * Display Name: Generated Form Section
    * * SQL Data Type: nvarchar(10)
    * * Default Value: Details
    * * Value List Type: List
    * * Possible Values 
    *   * Top
    *   * Category
    *   * Details
    * * Description: When set to Top, the field will be placed in a "top area" on the top of a generated form and visible regardless of which tab is displayed. When set to "category" Options: Top, Category, Details
    */
    get GeneratedFormSection(): 'Top' | 'Category' | 'Details' {  
        return this.Get('GeneratedFormSection');
    }
    set GeneratedFormSection(value: 'Top' | 'Category' | 'Details') {
        this.Set('GeneratedFormSection', value);
    }

    /**
    * * Field Name: IsVirtual
    * * Display Name: Is Virtual
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: NULL
    */
    get IsVirtual(): boolean {  
        return this.Get('IsVirtual');
    }

    /**
    * * Field Name: IsNameField
    * * Display Name: Is Name Field
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: If set to 1, this column will be used as the "Name" field for the entity and will be used to display the name of the record in various places in the UI.
    */
    get IsNameField(): boolean {  
        return this.Get('IsNameField');
    }
    set IsNameField(value: boolean) {
        this.Set('IsNameField', value);
    }

    /**
    * * Field Name: RelatedEntityID
    * * Display Name: RelatedEntity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get RelatedEntityID(): string | null {  
        return this.Get('RelatedEntityID');
    }
    set RelatedEntityID(value: string | null) {
        this.Set('RelatedEntityID', value);
    }

    /**
    * * Field Name: RelatedEntityFieldName
    * * Display Name: Related Entity Field Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Name of the field in the Related Entity that this field links to (auto maintained by CodeGen)
    */
    get RelatedEntityFieldName(): string | null {  
        return this.Get('RelatedEntityFieldName');
    }
    set RelatedEntityFieldName(value: string | null) {
        this.Set('RelatedEntityFieldName', value);
    }

    /**
    * * Field Name: IncludeRelatedEntityNameFieldInBaseView
    * * Display Name: Include Related Entity Name Field In Base View
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: If set to 1, the "Name" field of the Related Entity will be included in this entity as a virtual field
    */
    get IncludeRelatedEntityNameFieldInBaseView(): boolean {  
        return this.Get('IncludeRelatedEntityNameFieldInBaseView');
    }
    set IncludeRelatedEntityNameFieldInBaseView(value: boolean) {
        this.Set('IncludeRelatedEntityNameFieldInBaseView', value);
    }

    /**
    * * Field Name: RelatedEntityNameFieldMap
    * * Display Name: Related Entity Name Field Map
    * * SQL Data Type: nvarchar(255)
    */
    get RelatedEntityNameFieldMap(): string | null {  
        return this.Get('RelatedEntityNameFieldMap');
    }
    set RelatedEntityNameFieldMap(value: string | null) {
        this.Set('RelatedEntityNameFieldMap', value);
    }

    /**
    * * Field Name: RelatedEntityDisplayType
    * * Display Name: Related Entity Display Type
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Search
    * * Description: Controls the generated form in the MJ Explorer UI - defaults to a search box, other option is a drop down. Possible values are Search and Dropdown
    */
    get RelatedEntityDisplayType(): string {  
        return this.Get('RelatedEntityDisplayType');
    }
    set RelatedEntityDisplayType(value: string) {
        this.Set('RelatedEntityDisplayType', value);
    }

    /**
    * * Field Name: EntityIDFieldName
    * * Display Name: Entity IDField Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Optional, used for "Soft Keys" to link records to different entity/record combinations on a per-record basis (for example the FileEntityRecordLink table has an EntityID/RecordID field pair. For that entity, the RecordID specifies "EntityID" for this field. This information allows MJ to detect soft keys/links for dependency detection, merging and for preventing orphaned soft-linked records during delete operations.
    */
    get EntityIDFieldName(): string | null {  
        return this.Get('EntityIDFieldName');
    }
    set EntityIDFieldName(value: string | null) {
        this.Set('EntityIDFieldName', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: SchemaName
    * * Display Name: Schema Name
    * * SQL Data Type: nvarchar(255)
    */
    get SchemaName(): string {  
        return this.Get('SchemaName');
    }

    /**
    * * Field Name: BaseTable
    * * Display Name: Base Table
    * * SQL Data Type: nvarchar(255)
    */
    get BaseTable(): string {  
        return this.Get('BaseTable');
    }

    /**
    * * Field Name: BaseView
    * * Display Name: Base View
    * * SQL Data Type: nvarchar(255)
    */
    get BaseView(): string {  
        return this.Get('BaseView');
    }

    /**
    * * Field Name: EntityCodeName
    * * Display Name: Entity Code Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get EntityCodeName(): string | null {  
        return this.Get('EntityCodeName');
    }

    /**
    * * Field Name: EntityClassName
    * * Display Name: Entity Class Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get EntityClassName(): string | null {  
        return this.Get('EntityClassName');
    }

    /**
    * * Field Name: RelatedEntity
    * * Display Name: Related Entity
    * * SQL Data Type: nvarchar(255)
    */
    get RelatedEntity(): string | null {  
        return this.Get('RelatedEntity');
    }

    /**
    * * Field Name: RelatedEntitySchemaName
    * * Display Name: Related Entity Schema Name
    * * SQL Data Type: nvarchar(255)
    */
    get RelatedEntitySchemaName(): string | null {  
        return this.Get('RelatedEntitySchemaName');
    }

    /**
    * * Field Name: RelatedEntityBaseTable
    * * Display Name: Related Entity Base Table
    * * SQL Data Type: nvarchar(255)
    */
    get RelatedEntityBaseTable(): string | null {  
        return this.Get('RelatedEntityBaseTable');
    }

    /**
    * * Field Name: RelatedEntityBaseView
    * * Display Name: Related Entity Base View
    * * SQL Data Type: nvarchar(255)
    */
    get RelatedEntityBaseView(): string | null {  
        return this.Get('RelatedEntityBaseView');
    }

    /**
    * * Field Name: RelatedEntityCodeName
    * * Display Name: Related Entity Code Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get RelatedEntityCodeName(): string | null {  
        return this.Get('RelatedEntityCodeName');
    }

    /**
    * * Field Name: RelatedEntityClassName
    * * Display Name: Related Entity Class Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get RelatedEntityClassName(): string | null {  
        return this.Get('RelatedEntityClassName');
    }
}

            
/**
 * Entity Permissions - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityPermission
 * * Base View: vwEntityPermissions
 * * @description Security settings for each entity
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Permissions')
export class EntityPermissionEntity extends BaseEntity<EntityPermissionEntityType> {
    /**
    * Loads the Entity Permissions record from the database
    * @param ID: string - primary key value to load the Entity Permissions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityPermissionEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: RoleID
    * * Display Name: Role ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Roles (vwRoles.ID)
    */
    get RoleID(): string {  
        return this.Get('RoleID');
    }
    set RoleID(value: string) {
        this.Set('RoleID', value);
    }

    /**
    * * Field Name: CanCreate
    * * Display Name: Can Create
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get CanCreate(): boolean {  
        return this.Get('CanCreate');
    }
    set CanCreate(value: boolean) {
        this.Set('CanCreate', value);
    }

    /**
    * * Field Name: CanRead
    * * Display Name: Can Read
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get CanRead(): boolean {  
        return this.Get('CanRead');
    }
    set CanRead(value: boolean) {
        this.Set('CanRead', value);
    }

    /**
    * * Field Name: CanUpdate
    * * Display Name: Can Update
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get CanUpdate(): boolean {  
        return this.Get('CanUpdate');
    }
    set CanUpdate(value: boolean) {
        this.Set('CanUpdate', value);
    }

    /**
    * * Field Name: CanDelete
    * * Display Name: Can Delete
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get CanDelete(): boolean {  
        return this.Get('CanDelete');
    }
    set CanDelete(value: boolean) {
        this.Set('CanDelete', value);
    }

    /**
    * * Field Name: ReadRLSFilterID
    * * Display Name: Read RLSFilter ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Row Level Security Filters (vwRowLevelSecurityFilters.ID)
    */
    get ReadRLSFilterID(): string | null {  
        return this.Get('ReadRLSFilterID');
    }
    set ReadRLSFilterID(value: string | null) {
        this.Set('ReadRLSFilterID', value);
    }

    /**
    * * Field Name: CreateRLSFilterID
    * * Display Name: Create RLSFilter ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Row Level Security Filters (vwRowLevelSecurityFilters.ID)
    */
    get CreateRLSFilterID(): string | null {  
        return this.Get('CreateRLSFilterID');
    }
    set CreateRLSFilterID(value: string | null) {
        this.Set('CreateRLSFilterID', value);
    }

    /**
    * * Field Name: UpdateRLSFilterID
    * * Display Name: Update RLSFilter ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Row Level Security Filters (vwRowLevelSecurityFilters.ID)
    */
    get UpdateRLSFilterID(): string | null {  
        return this.Get('UpdateRLSFilterID');
    }
    set UpdateRLSFilterID(value: string | null) {
        this.Set('UpdateRLSFilterID', value);
    }

    /**
    * * Field Name: DeleteRLSFilterID
    * * Display Name: Delete RLSFilter ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Row Level Security Filters (vwRowLevelSecurityFilters.ID)
    */
    get DeleteRLSFilterID(): string | null {  
        return this.Get('DeleteRLSFilterID');
    }
    set DeleteRLSFilterID(value: string | null) {
        this.Set('DeleteRLSFilterID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: RoleName
    * * Display Name: Role Name
    * * SQL Data Type: nvarchar(50)
    */
    get RoleName(): string {  
        return this.Get('RoleName');
    }

    /**
    * * Field Name: RoleSQLName
    * * Display Name: Role SQLName
    * * SQL Data Type: nvarchar(250)
    */
    get RoleSQLName(): string | null {  
        return this.Get('RoleSQLName');
    }

    /**
    * * Field Name: CreateRLSFilter
    * * Display Name: Create RLSFilter
    * * SQL Data Type: nvarchar(100)
    */
    get CreateRLSFilter(): string | null {  
        return this.Get('CreateRLSFilter');
    }

    /**
    * * Field Name: ReadRLSFilter
    * * Display Name: Read RLSFilter
    * * SQL Data Type: nvarchar(100)
    */
    get ReadRLSFilter(): string | null {  
        return this.Get('ReadRLSFilter');
    }

    /**
    * * Field Name: UpdateRLSFilter
    * * Display Name: Update RLSFilter
    * * SQL Data Type: nvarchar(100)
    */
    get UpdateRLSFilter(): string | null {  
        return this.Get('UpdateRLSFilter');
    }

    /**
    * * Field Name: DeleteRLSFilter
    * * Display Name: Delete RLSFilter
    * * SQL Data Type: nvarchar(100)
    */
    get DeleteRLSFilter(): string | null {  
        return this.Get('DeleteRLSFilter');
    }
}

            
/**
 * Entity Record Documents - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityRecordDocument
 * * Base View: vwEntityRecordDocuments
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Record Documents')
export class EntityRecordDocumentEntity extends BaseEntity<EntityRecordDocumentEntityType> {
    /**
    * Loads the Entity Record Documents record from the database
    * @param ID: string - primary key value to load the Entity Record Documents record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityRecordDocumentEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Entity Record Documents - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof EntityRecordDocumentEntity
    * @throws {Error} - Delete is not allowed for Entity Record Documents, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Entity Record Documents, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: RecordID
    * * Display Name: Record ID
    * * SQL Data Type: nvarchar(450)
    */
    get RecordID(): string {  
        return this.Get('RecordID');
    }
    set RecordID(value: string) {
        this.Set('RecordID', value);
    }

    /**
    * * Field Name: EntityDocumentID
    * * Display Name: Entity Document ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entity Documents (vwEntityDocuments.ID)
    */
    get EntityDocumentID(): string {  
        return this.Get('EntityDocumentID');
    }
    set EntityDocumentID(value: string) {
        this.Set('EntityDocumentID', value);
    }

    /**
    * * Field Name: DocumentText
    * * Display Name: Document Text
    * * SQL Data Type: nvarchar(MAX)
    */
    get DocumentText(): string | null {  
        return this.Get('DocumentText');
    }
    set DocumentText(value: string | null) {
        this.Set('DocumentText', value);
    }

    /**
    * * Field Name: VectorIndexID
    * * Display Name: Vector Index ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Vector Indexes (vwVectorIndexes.ID)
    */
    get VectorIndexID(): string {  
        return this.Get('VectorIndexID');
    }
    set VectorIndexID(value: string) {
        this.Set('VectorIndexID', value);
    }

    /**
    * * Field Name: VectorID
    * * Display Name: Vector ID
    * * SQL Data Type: nvarchar(50)
    */
    get VectorID(): string | null {  
        return this.Get('VectorID');
    }
    set VectorID(value: string | null) {
        this.Set('VectorID', value);
    }

    /**
    * * Field Name: VectorJSON
    * * Display Name: Vector JSON
    * * SQL Data Type: nvarchar(MAX)
    */
    get VectorJSON(): string | null {  
        return this.Get('VectorJSON');
    }
    set VectorJSON(value: string | null) {
        this.Set('VectorJSON', value);
    }

    /**
    * * Field Name: EntityRecordUpdatedAt
    * * Display Name: Entity Record Updated At
    * * SQL Data Type: datetime
    */
    get EntityRecordUpdatedAt(): Date {  
        return this.Get('EntityRecordUpdatedAt');
    }
    set EntityRecordUpdatedAt(value: Date) {
        this.Set('EntityRecordUpdatedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: EntityDocument
    * * Display Name: Entity Document
    * * SQL Data Type: nvarchar(250)
    */
    get EntityDocument(): string {  
        return this.Get('EntityDocument');
    }

    /**
    * * Field Name: VectorIndex
    * * Display Name: Vector Index
    * * SQL Data Type: nvarchar(255)
    */
    get VectorIndex(): string {  
        return this.Get('VectorIndex');
    }
}

            
/**
 * Entity Relationship Display Components - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityRelationshipDisplayComponent
 * * Base View: vwEntityRelationshipDisplayComponents
 * * @description This table stores a list of components that are available for displaying relationships in the MJ Explorer UI
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Relationship Display Components')
export class EntityRelationshipDisplayComponentEntity extends BaseEntity<EntityRelationshipDisplayComponentEntityType> {
    /**
    * Loads the Entity Relationship Display Components record from the database
    * @param ID: string - primary key value to load the Entity Relationship Display Components record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityRelationshipDisplayComponentEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Entity Relationship Display Components - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof EntityRelationshipDisplayComponentEntity
    * @throws {Error} - Delete is not allowed for Entity Relationship Display Components, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Entity Relationship Display Components, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: RelationshipType
    * * Display Name: Relationship Type
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * One to Many
    *   * Many to Many
    *   * Both
    * * Description: The type of relationship the component displays. Valid values are "One to Many", "Many to Many", or "Both".
    */
    get RelationshipType(): 'One to Many' | 'Many to Many' | 'Both' {  
        return this.Get('RelationshipType');
    }
    set RelationshipType(value: 'One to Many' | 'Many to Many' | 'Both') {
        this.Set('RelationshipType', value);
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
 * Entity Relationships - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntityRelationship
 * * Base View: vwEntityRelationships
 * * @description Metadata about relationships between entities including display preferences for the UI
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Relationships')
export class EntityRelationshipEntity extends BaseEntity<EntityRelationshipEntityType> {
    /**
    * Loads the Entity Relationships record from the database
    * @param ID: string - primary key value to load the Entity Relationships record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntityRelationshipEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Used for display order in generated forms and in other places in the UI where relationships for an entity are shown
    */
    get Sequence(): number {  
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: RelatedEntityID
    * * Display Name: Related Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get RelatedEntityID(): string {  
        return this.Get('RelatedEntityID');
    }
    set RelatedEntityID(value: string) {
        this.Set('RelatedEntityID', value);
    }

    /**
    * * Field Name: BundleInAPI
    * * Display Name: Bundle In API
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get BundleInAPI(): boolean {  
        return this.Get('BundleInAPI');
    }
    set BundleInAPI(value: boolean) {
        this.Set('BundleInAPI', value);
    }

    /**
    * * Field Name: IncludeInParentAllQuery
    * * Display Name: Include In Parent All Query
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IncludeInParentAllQuery(): boolean {  
        return this.Get('IncludeInParentAllQuery');
    }
    set IncludeInParentAllQuery(value: boolean) {
        this.Set('IncludeInParentAllQuery', value);
    }

    /**
    * * Field Name: Type
    * * SQL Data Type: nchar(20)
    * * Default Value: One To Many
    * * Value List Type: List
    * * Possible Values 
    *   * One To Many
    *   * Many To Many
    */
    get Type(): 'One To Many' | 'Many To Many' {  
        return this.Get('Type');
    }
    set Type(value: 'One To Many' | 'Many To Many') {
        this.Set('Type', value);
    }

    /**
    * * Field Name: EntityKeyField
    * * Display Name: Entity Key Field
    * * SQL Data Type: nvarchar(255)
    */
    get EntityKeyField(): string | null {  
        return this.Get('EntityKeyField');
    }
    set EntityKeyField(value: string | null) {
        this.Set('EntityKeyField', value);
    }

    /**
    * * Field Name: RelatedEntityJoinField
    * * Display Name: Related Entity Join Field
    * * SQL Data Type: nvarchar(255)
    */
    get RelatedEntityJoinField(): string {  
        return this.Get('RelatedEntityJoinField');
    }
    set RelatedEntityJoinField(value: string) {
        this.Set('RelatedEntityJoinField', value);
    }

    /**
    * * Field Name: JoinView
    * * Display Name: Join View
    * * SQL Data Type: nvarchar(255)
    */
    get JoinView(): string | null {  
        return this.Get('JoinView');
    }
    set JoinView(value: string | null) {
        this.Set('JoinView', value);
    }

    /**
    * * Field Name: JoinEntityJoinField
    * * Display Name: Join Entity Join Field
    * * SQL Data Type: nvarchar(255)
    */
    get JoinEntityJoinField(): string | null {  
        return this.Get('JoinEntityJoinField');
    }
    set JoinEntityJoinField(value: string | null) {
        this.Set('JoinEntityJoinField', value);
    }

    /**
    * * Field Name: JoinEntityInverseJoinField
    * * Display Name: Join Entity Inverse Join Field
    * * SQL Data Type: nvarchar(255)
    */
    get JoinEntityInverseJoinField(): string | null {  
        return this.Get('JoinEntityInverseJoinField');
    }
    set JoinEntityInverseJoinField(value: string | null) {
        this.Set('JoinEntityInverseJoinField', value);
    }

    /**
    * * Field Name: DisplayInForm
    * * Display Name: Display In Form
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: When unchecked the relationship will NOT be displayed on the generated form
    */
    get DisplayInForm(): boolean {  
        return this.Get('DisplayInForm');
    }
    set DisplayInForm(value: boolean) {
        this.Set('DisplayInForm', value);
    }

    /**
    * * Field Name: DisplayLocation
    * * Display Name: Display Location
    * * SQL Data Type: nvarchar(50)
    * * Default Value: After Field Tabs
    * * Value List Type: List
    * * Possible Values 
    *   * After Field Tabs
    *   * Before Field Tabs
    */
    get DisplayLocation(): 'After Field Tabs' | 'Before Field Tabs' {  
        return this.Get('DisplayLocation');
    }
    set DisplayLocation(value: 'After Field Tabs' | 'Before Field Tabs') {
        this.Set('DisplayLocation', value);
    }

    /**
    * * Field Name: DisplayName
    * * Display Name: Display Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Optional, when specified this value overrides the related entity name for the label on the tab
    */
    get DisplayName(): string | null {  
        return this.Get('DisplayName');
    }
    set DisplayName(value: string | null) {
        this.Set('DisplayName', value);
    }

    /**
    * * Field Name: DisplayIconType
    * * Display Name: Display Icon Type
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Related Entity Icon
    * * Value List Type: List
    * * Possible Values 
    *   * Related Entity Icon
    *   * Custom
    *   * None
    * * Description: When Related Entity Icon - uses the icon from the related entity, if one exists. When Custom, uses the value in the DisplayIcon field in this record, and when None, no icon is displayed
    */
    get DisplayIconType(): 'Related Entity Icon' | 'Custom' | 'None' {  
        return this.Get('DisplayIconType');
    }
    set DisplayIconType(value: 'Related Entity Icon' | 'Custom' | 'None') {
        this.Set('DisplayIconType', value);
    }

    /**
    * * Field Name: DisplayIcon
    * * Display Name: Display Icon
    * * SQL Data Type: nvarchar(255)
    * * Description: If specified, the icon 
    */
    get DisplayIcon(): string | null {  
        return this.Get('DisplayIcon');
    }
    set DisplayIcon(value: string | null) {
        this.Set('DisplayIcon', value);
    }

    /**
    * * Field Name: DisplayUserViewID
    * * Display Name: Display User View ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: User Views (vwUserViews.ID)
    */
    get DisplayUserViewID(): string | null {  
        return this.Get('DisplayUserViewID');
    }

    /**
    * * Field Name: DisplayComponentID
    * * Display Name: Display Component ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entity Relationship Display Components (vwEntityRelationshipDisplayComponents.ID)
    */
    get DisplayComponentID(): string | null {  
        return this.Get('DisplayComponentID');
    }
    set DisplayComponentID(value: string | null) {
        this.Set('DisplayComponentID', value);
    }

    /**
    * * Field Name: DisplayComponentConfiguration
    * * Display Name: Display Component Configuration
    * * SQL Data Type: nvarchar(MAX)
    * * Description: If DisplayComponentID is specified, this field can optionally be used to track component-specific and relationship-specific configuration details that will be used by CodeGen to provide to the display component selected.
    */
    get DisplayComponentConfiguration(): string | null {  
        return this.Get('DisplayComponentConfiguration');
    }
    set DisplayComponentConfiguration(value: string | null) {
        this.Set('DisplayComponentConfiguration', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: EntityBaseTable
    * * Display Name: Entity Base Table
    * * SQL Data Type: nvarchar(255)
    */
    get EntityBaseTable(): string {  
        return this.Get('EntityBaseTable');
    }

    /**
    * * Field Name: EntityBaseView
    * * Display Name: Entity Base View
    * * SQL Data Type: nvarchar(255)
    */
    get EntityBaseView(): string {  
        return this.Get('EntityBaseView');
    }

    /**
    * * Field Name: RelatedEntity
    * * Display Name: Related Entity
    * * SQL Data Type: nvarchar(255)
    */
    get RelatedEntity(): string {  
        return this.Get('RelatedEntity');
    }

    /**
    * * Field Name: RelatedEntityBaseTable
    * * Display Name: Related Entity Base Table
    * * SQL Data Type: nvarchar(255)
    */
    get RelatedEntityBaseTable(): string {  
        return this.Get('RelatedEntityBaseTable');
    }

    /**
    * * Field Name: RelatedEntityBaseView
    * * Display Name: Related Entity Base View
    * * SQL Data Type: nvarchar(255)
    */
    get RelatedEntityBaseView(): string {  
        return this.Get('RelatedEntityBaseView');
    }

    /**
    * * Field Name: RelatedEntityClassName
    * * Display Name: Related Entity Class Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get RelatedEntityClassName(): string | null {  
        return this.Get('RelatedEntityClassName');
    }

    /**
    * * Field Name: RelatedEntityCodeName
    * * Display Name: Related Entity Code Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get RelatedEntityCodeName(): string | null {  
        return this.Get('RelatedEntityCodeName');
    }

    /**
    * * Field Name: RelatedEntityBaseTableCodeName
    * * Display Name: Related Entity Base Table Code Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get RelatedEntityBaseTableCodeName(): string | null {  
        return this.Get('RelatedEntityBaseTableCodeName');
    }

    /**
    * * Field Name: DisplayUserViewName
    * * Display Name: Display User View Name
    * * SQL Data Type: nvarchar(100)
    */
    get DisplayUserViewName(): string | null {  
        return this.Get('DisplayUserViewName');
    }
}

            
/**
 * Entity Settings - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: EntitySetting
 * * Base View: vwEntitySettings
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Entity Settings')
export class EntitySettingEntity extends BaseEntity<EntitySettingEntityType> {
    /**
    * Loads the Entity Settings record from the database
    * @param ID: string - primary key value to load the Entity Settings record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof EntitySettingEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Entity Settings - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof EntitySettingEntity
    * @throws {Error} - Delete is not allowed for Entity Settings, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Entity Settings, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
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
    * * Field Name: Value
    * * Display Name: Value
    * * SQL Data Type: nvarchar(MAX)
    */
    get Value(): string {  
        return this.Get('Value');
    }
    set Value(value: string) {
        this.Set('Value', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get Comments(): string | null {  
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }
}

            
/**
 * Error Logs - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ErrorLog
 * * Base View: vwErrorLogs
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Error Logs')
export class ErrorLogEntity extends BaseEntity<ErrorLogEntityType> {
    /**
    * Loads the Error Logs record from the database
    * @param ID: string - primary key value to load the Error Logs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ErrorLogEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Error Logs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof ErrorLogEntity
    * @throws {Error} - Delete is not allowed for Error Logs, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Error Logs, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: CompanyIntegrationRunID
    * * Display Name: CompanyIntegrationRun ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Company Integration Runs (vwCompanyIntegrationRuns.ID)
    */
    get CompanyIntegrationRunID(): string | null {  
        return this.Get('CompanyIntegrationRunID');
    }
    set CompanyIntegrationRunID(value: string | null) {
        this.Set('CompanyIntegrationRunID', value);
    }

    /**
    * * Field Name: CompanyIntegrationRunDetailID
    * * Display Name: CompanyIntegrationRunDetail ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Company Integration Run Details (vwCompanyIntegrationRunDetails.ID)
    */
    get CompanyIntegrationRunDetailID(): string | null {  
        return this.Get('CompanyIntegrationRunDetailID');
    }
    set CompanyIntegrationRunDetailID(value: string | null) {
        this.Set('CompanyIntegrationRunDetailID', value);
    }

    /**
    * * Field Name: Code
    * * SQL Data Type: nchar(20)
    */
    get Code(): string | null {  
        return this.Get('Code');
    }
    set Code(value: string | null) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Message
    * * SQL Data Type: nvarchar(MAX)
    */
    get Message(): string | null {  
        return this.Get('Message');
    }
    set Message(value: string | null) {
        this.Set('Message', value);
    }

    /**
    * * Field Name: CreatedBy
    * * Display Name: Created By
    * * SQL Data Type: nvarchar(50)
    * * Default Value: suser_name()
    */
    get CreatedBy(): string | null {  
        return this.Get('CreatedBy');
    }
    set CreatedBy(value: string | null) {
        this.Set('CreatedBy', value);
    }

    /**
    * * Field Name: Status
    * * SQL Data Type: nvarchar(10)
    */
    get Status(): string | null {  
        return this.Get('Status');
    }
    set Status(value: string | null) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Category
    * * SQL Data Type: nvarchar(20)
    */
    get Category(): string | null {  
        return this.Get('Category');
    }
    set Category(value: string | null) {
        this.Set('Category', value);
    }

    /**
    * * Field Name: Details
    * * SQL Data Type: nvarchar(MAX)
    */
    get Details(): string | null {  
        return this.Get('Details');
    }
    set Details(value: string | null) {
        this.Set('Details', value);
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
 * Explorer Navigation Items - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ExplorerNavigationItem
 * * Base View: vwExplorerNavigationItems
 * * @description Table to store navigation items for MemberJunction Explorer
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Explorer Navigation Items')
export class ExplorerNavigationItemEntity extends BaseEntity<ExplorerNavigationItemEntityType> {
    /**
    * Loads the Explorer Navigation Items record from the database
    * @param ID: string - primary key value to load the Explorer Navigation Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ExplorerNavigationItemEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    * * Description: Unique identifier for each navigation item
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Description: Sequence number for the navigation item, must be unique and greater than 0
    */
    get Sequence(): number {  
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Unique name of the navigation item displayed to the user
    */
    get Name(): string {  
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Route
    * * Display Name: Route
    * * SQL Data Type: nvarchar(255)
    * * Description: The route for the navigation item relative to the app main URL, using Angular syntax like "entity/:entityName"
    */
    get Route(): string {  
        return this.Get('Route');
    }
    set Route(value: string) {
        this.Set('Route', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Indicates if the navigation item is active; allows turning off items in the UI without deleting them from the metadata
    */
    get IsActive(): boolean {  
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: ShowInHomeScreen
    * * Display Name: Show In Home Screen
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Controls if the navigation item is shown on the Home screen for MJ Explorer
    */
    get ShowInHomeScreen(): boolean {  
        return this.Get('ShowInHomeScreen');
    }
    set ShowInHomeScreen(value: boolean) {
        this.Set('ShowInHomeScreen', value);
    }

    /**
    * * Field Name: ShowInNavigationDrawer
    * * Display Name: Show In Navigation Drawer
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Controls if the item is shown in the left navigation drawer in the MJ Explorer app or not.
    */
    get ShowInNavigationDrawer(): boolean {  
        return this.Get('ShowInNavigationDrawer');
    }
    set ShowInNavigationDrawer(value: boolean) {
        this.Set('ShowInNavigationDrawer', value);
    }

    /**
    * * Field Name: IconCSSClass
    * * Display Name: Icon CSSClass
    * * SQL Data Type: nvarchar(100)
    * * Description: Optional, CSS class for an icon to be displayed with the navigation item
    */
    get IconCSSClass(): string | null {  
        return this.Get('IconCSSClass');
    }
    set IconCSSClass(value: string | null) {
        this.Set('IconCSSClass', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the navigation item, shown to the user on hover or in larger displays
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Administrator comments, not shown to the end user in MJ Explorer app
    */
    get Comments(): string | null {  
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
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
 * File Categories - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: FileCategory
 * * Base View: vwFileCategories
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'File Categories')
export class FileCategoryEntity extends BaseEntity<FileCategoryEntityType> {
    /**
    * Loads the File Categories record from the database
    * @param ID: string - primary key value to load the File Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof FileCategoryEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: File Categories (vwFileCategories.ID)
    */
    get ParentID(): string | null {  
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
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
    * * Field Name: Parent
    * * Display Name: Parent
    * * SQL Data Type: nvarchar(255)
    */
    get Parent(): string | null {  
        return this.Get('Parent');
    }
}

            
/**
 * File Entity Record Links - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: FileEntityRecordLink
 * * Base View: vwFileEntityRecordLinks
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'File Entity Record Links')
export class FileEntityRecordLinkEntity extends BaseEntity<FileEntityRecordLinkEntityType> {
    /**
    * Loads the File Entity Record Links record from the database
    * @param ID: string - primary key value to load the File Entity Record Links record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof FileEntityRecordLinkEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * File Entity Record Links - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof FileEntityRecordLinkEntity
    * @throws {Error} - Delete is not allowed for File Entity Record Links, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for File Entity Record Links, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: FileID
    * * Display Name: File ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Files (vwFiles.ID)
    */
    get FileID(): string {  
        return this.Get('FileID');
    }
    set FileID(value: string) {
        this.Set('FileID', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: RecordID
    * * Display Name: Record ID
    * * SQL Data Type: nvarchar(750)
    */
    get RecordID(): string {  
        return this.Get('RecordID');
    }
    set RecordID(value: string) {
        this.Set('RecordID', value);
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
    * * Field Name: File
    * * Display Name: File
    * * SQL Data Type: nvarchar(500)
    */
    get File(): string {  
        return this.Get('File');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }
}

            
/**
 * File Storage Providers - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: FileStorageProvider
 * * Base View: vwFileStorageProviders
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'File Storage Providers')
export class FileStorageProviderEntity extends BaseEntity<FileStorageProviderEntityType> {
    /**
    * Loads the File Storage Providers record from the database
    * @param ID: string - primary key value to load the File Storage Providers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof FileStorageProviderEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * File Storage Providers - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof FileStorageProviderEntity
    * @throws {Error} - Delete is not allowed for File Storage Providers, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for File Storage Providers, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: ServerDriverKey
    * * Display Name: Server Driver Key
    * * SQL Data Type: nvarchar(100)
    */
    get ServerDriverKey(): string {  
        return this.Get('ServerDriverKey');
    }
    set ServerDriverKey(value: string) {
        this.Set('ServerDriverKey', value);
    }

    /**
    * * Field Name: ClientDriverKey
    * * Display Name: Client Driver Key
    * * SQL Data Type: nvarchar(100)
    */
    get ClientDriverKey(): string {  
        return this.Get('ClientDriverKey');
    }
    set ClientDriverKey(value: string) {
        this.Set('ClientDriverKey', value);
    }

    /**
    * * Field Name: Priority
    * * Display Name: Priority
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get Priority(): number {  
        return this.Get('Priority');
    }
    set Priority(value: number) {
        this.Set('Priority', value);
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
 * Files - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: File
 * * Base View: vwFiles
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Files')
export class FileEntity extends BaseEntity<FileEntityType> {
    /**
    * Loads the Files record from the database
    * @param ID: string - primary key value to load the Files record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof FileEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * SQL Data Type: nvarchar(500)
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
    * * Related Entity/Foreign Key: File Categories (vwFileCategories.ID)
    */
    get CategoryID(): string | null {  
        return this.Get('CategoryID');
    }
    set CategoryID(value: string | null) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: ProviderID
    * * Display Name: Provider ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: File Storage Providers (vwFileStorageProviders.ID)
    */
    get ProviderID(): string {  
        return this.Get('ProviderID');
    }
    set ProviderID(value: string) {
        this.Set('ProviderID', value);
    }

    /**
    * * Field Name: ContentType
    * * Display Name: Content Type
    * * SQL Data Type: nvarchar(50)
    */
    get ContentType(): string | null {  
        return this.Get('ContentType');
    }
    set ContentType(value: string | null) {
        this.Set('ContentType', value);
    }

    /**
    * * Field Name: ProviderKey
    * * Display Name: Provider Key
    * * SQL Data Type: nvarchar(500)
    */
    get ProviderKey(): string | null {  
        return this.Get('ProviderKey');
    }
    set ProviderKey(value: string | null) {
        this.Set('ProviderKey', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Description: Pending, Uploading, Uploaded, Deleting, Deleted
    */
    get Status(): string {  
        return this.Get('Status');
    }
    set Status(value: string) {
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
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(255)
    */
    get Category(): string | null {  
        return this.Get('Category');
    }

    /**
    * * Field Name: Provider
    * * Display Name: Provider
    * * SQL Data Type: nvarchar(50)
    */
    get Provider(): string {  
        return this.Get('Provider');
    }
}

            
/**
 * flyway _schema _histories - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: flyway_schema_history
 * * Base View: vwflyway_schema_histories
 * * Primary Key: installed_rank
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'flyway _schema _histories')
export class flyway_schema_historyEntity extends BaseEntity<flyway_schema_historyEntityType> {
    /**
    * Loads the flyway _schema _histories record from the database
    * @param installed_rank: number - primary key value to load the flyway _schema _histories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof flyway_schema_historyEntity
    * @method
    * @override
    */      
    public async Load(installed_rank: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'installed_rank', Value: installed_rank });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: installed_rank
    * * Display Name: installed _rank
    * * SQL Data Type: int
    */
    get installed_rank(): number {  
        return this.Get('installed_rank');
    }

    /**
    * * Field Name: version
    * * Display Name: version
    * * SQL Data Type: nvarchar(50)
    */
    get version(): string | null {  
        return this.Get('version');
    }
    set version(value: string | null) {
        this.Set('version', value);
    }

    /**
    * * Field Name: description
    * * Display Name: description
    * * SQL Data Type: nvarchar(200)
    */
    get description(): string | null {  
        return this.Get('description');
    }
    set description(value: string | null) {
        this.Set('description', value);
    }

    /**
    * * Field Name: type
    * * Display Name: type
    * * SQL Data Type: nvarchar(20)
    */
    get type(): string {  
        return this.Get('type');
    }
    set type(value: string) {
        this.Set('type', value);
    }

    /**
    * * Field Name: script
    * * Display Name: script
    * * SQL Data Type: nvarchar(1000)
    */
    get script(): string {  
        return this.Get('script');
    }
    set script(value: string) {
        this.Set('script', value);
    }

    /**
    * * Field Name: checksum
    * * Display Name: checksum
    * * SQL Data Type: int
    */
    get checksum(): number | null {  
        return this.Get('checksum');
    }
    set checksum(value: number | null) {
        this.Set('checksum', value);
    }

    /**
    * * Field Name: installed_by
    * * Display Name: installed _by
    * * SQL Data Type: nvarchar(100)
    */
    get installed_by(): string {  
        return this.Get('installed_by');
    }
    set installed_by(value: string) {
        this.Set('installed_by', value);
    }

    /**
    * * Field Name: installed_on
    * * Display Name: installed _on
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get installed_on(): Date {  
        return this.Get('installed_on');
    }
    set installed_on(value: Date) {
        this.Set('installed_on', value);
    }

    /**
    * * Field Name: execution_time
    * * Display Name: execution _time
    * * SQL Data Type: int
    */
    get execution_time(): number {  
        return this.Get('execution_time');
    }
    set execution_time(value: number) {
        this.Set('execution_time', value);
    }

    /**
    * * Field Name: success
    * * Display Name: success
    * * SQL Data Type: bit
    */
    get success(): boolean {  
        return this.Get('success');
    }
    set success(value: boolean) {
        this.Set('success', value);
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
 * Integration URL Formats - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: IntegrationURLFormat
 * * Base View: vwIntegrationURLFormats
 * * @description Used to generate web links for end users to easily access resources in a source system. URL Formats support templating to inject various field values at run-time to take a user directly to a resource in a source system.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Integration URL Formats')
export class IntegrationURLFormatEntity extends BaseEntity<IntegrationURLFormatEntityType> {
    /**
    * Loads the Integration URL Formats record from the database
    * @param ID: string - primary key value to load the Integration URL Formats record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof IntegrationURLFormatEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Integration URL Formats - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof IntegrationURLFormatEntity
    * @throws {Error} - Delete is not allowed for Integration URL Formats, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Integration URL Formats, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: IntegrationID
    * * Display Name: Integration ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Integrations (vwIntegrations.ID)
    */
    get IntegrationID(): string {  
        return this.Get('IntegrationID');
    }
    set IntegrationID(value: string) {
        this.Set('IntegrationID', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: URLFormat
    * * SQL Data Type: nvarchar(500)
    * * Description: The URL Format for the given integration including the ability to include markup with fields from the integration
    */
    get URLFormat(): string {  
        return this.Get('URLFormat');
    }
    set URLFormat(value: string) {
        this.Set('URLFormat', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get Comments(): string | null {  
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
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
    * * Field Name: Integration
    * * Display Name: Integration
    * * SQL Data Type: nvarchar(100)
    */
    get Integration(): string {  
        return this.Get('Integration');
    }

    /**
    * * Field Name: NavigationBaseURL
    * * Display Name: Navigation Base URL
    * * SQL Data Type: nvarchar(500)
    */
    get NavigationBaseURL(): string | null {  
        return this.Get('NavigationBaseURL');
    }

    /**
    * * Field Name: FullURLFormat
    * * Display Name: Full URLFormat
    * * SQL Data Type: nvarchar(1000)
    */
    get FullURLFormat(): string | null {  
        return this.Get('FullURLFormat');
    }
}

            
/**
 * Integrations - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Integration
 * * Base View: vwIntegrations
 * * @description Catalog of all integrations that have been configured in the system.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Integrations')
export class IntegrationEntity extends BaseEntity<IntegrationEntityType> {
    /**
    * Loads the Integrations record from the database
    * @param ID: string - primary key value to load the Integrations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof IntegrationEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Integrations - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof IntegrationEntity
    * @throws {Error} - Delete is not allowed for Integrations, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Integrations, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: Name
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
    * * SQL Data Type: nvarchar(255)
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: NavigationBaseURL
    * * Display Name: Navigation Base URL
    * * SQL Data Type: nvarchar(500)
    */
    get NavigationBaseURL(): string | null {  
        return this.Get('NavigationBaseURL');
    }
    set NavigationBaseURL(value: string | null) {
        this.Set('NavigationBaseURL', value);
    }

    /**
    * * Field Name: ClassName
    * * Display Name: Class Name
    * * SQL Data Type: nvarchar(100)
    */
    get ClassName(): string | null {  
        return this.Get('ClassName');
    }
    set ClassName(value: string | null) {
        this.Set('ClassName', value);
    }

    /**
    * * Field Name: ImportPath
    * * Display Name: Import Path
    * * SQL Data Type: nvarchar(100)
    */
    get ImportPath(): string | null {  
        return this.Get('ImportPath');
    }
    set ImportPath(value: string | null) {
        this.Set('ImportPath', value);
    }

    /**
    * * Field Name: BatchMaxRequestCount
    * * Display Name: Batch Max Request Count
    * * SQL Data Type: int
    * * Default Value: -1
    */
    get BatchMaxRequestCount(): number {  
        return this.Get('BatchMaxRequestCount');
    }
    set BatchMaxRequestCount(value: number) {
        this.Set('BatchMaxRequestCount', value);
    }

    /**
    * * Field Name: BatchRequestWaitTime
    * * Display Name: Batch Request Wait Time
    * * SQL Data Type: int
    * * Default Value: -1
    */
    get BatchRequestWaitTime(): number {  
        return this.Get('BatchRequestWaitTime');
    }
    set BatchRequestWaitTime(value: number) {
        this.Set('BatchRequestWaitTime', value);
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
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }
}

            
/**
 * Libraries - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Library
 * * Base View: vwLibraries
 * * @description Stores information about the available libraries, including a list of classes/functions, type definitions, and sample code. You can add additional custom libraries here to make them avaialable to code generation features within the system.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Libraries')
export class LibraryEntity extends BaseEntity<LibraryEntityType> {
    /**
    * Loads the Libraries record from the database
    * @param ID: string - primary key value to load the Libraries record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof LibraryEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Libraries - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof LibraryEntity
    * @throws {Error} - Delete is not allowed for Libraries, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Libraries, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Active
    *   * Disabled
    * * Description: Status of the library, only libraries marked as Active will be available for use by generated code. If a library was once active but no longer is, existing code that used the library will not be affected.
    */
    get Status(): 'Pending' | 'Active' | 'Disabled' {  
        return this.Get('Status');
    }
    set Status(value: 'Pending' | 'Active' | 'Disabled') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: TypeDefinitions
    * * Display Name: Type Definitions
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Code showing the types and functions defined in the library to be used for reference by humans and AI
    */
    get TypeDefinitions(): string | null {  
        return this.Get('TypeDefinitions');
    }
    set TypeDefinitions(value: string | null) {
        this.Set('TypeDefinitions', value);
    }

    /**
    * * Field Name: SampleCode
    * * Display Name: Sample Code
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Examples of code use of the classes and/or functions from within the library
    */
    get SampleCode(): string | null {  
        return this.Get('SampleCode');
    }
    set SampleCode(value: string | null) {
        this.Set('SampleCode', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }
}

            
/**
 * Library Items - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: LibraryItem
 * * Base View: vwLibraryItems
 * * @description Table to store individual library items
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Library Items')
export class LibraryItemEntity extends BaseEntity<LibraryItemEntityType> {
    /**
    * Loads the Library Items record from the database
    * @param ID: string - primary key value to load the Library Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof LibraryItemEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Library Items - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof LibraryItemEntity
    * @throws {Error} - Delete is not allowed for Library Items, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Library Items, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: LibraryID
    * * Display Name: Library ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Libraries (vwLibraries.ID)
    */
    get LibraryID(): string {  
        return this.Get('LibraryID');
    }
    set LibraryID(value: string) {
        this.Set('LibraryID', value);
    }

    /**
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Class
    *   * Interface
    *   * Variable
    *   * Type
    *   * Module
    *   * Function
    * * Description: Type of the library item for example Class, Interface, etc.
    */
    get Type(): 'Class' | 'Interface' | 'Variable' | 'Type' | 'Module' | 'Function' {  
        return this.Get('Type');
    }
    set Type(value: 'Class' | 'Interface' | 'Variable' | 'Type' | 'Module' | 'Function') {
        this.Set('Type', value);
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
    * * Field Name: Library
    * * Display Name: Library
    * * SQL Data Type: nvarchar(255)
    */
    get Library(): string {  
        return this.Get('Library');
    }
}

            
/**
 * List Categories - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ListCategory
 * * Base View: vwListCategories
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'List Categories')
export class ListCategoryEntity extends BaseEntity<ListCategoryEntityType> {
    /**
    * Loads the List Categories record from the database
    * @param ID: string - primary key value to load the List Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ListCategoryEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * List Categories - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof ListCategoryEntity
    * @throws {Error} - Delete is not allowed for List Categories, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for List Categories, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: List Categories (vwListCategories.ID)
    */
    get ParentID(): string | null {  
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
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
    * * SQL Data Type: nvarchar(100)
    */
    get Parent(): string | null {  
        return this.Get('Parent');
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }
}

            
/**
 * List Details - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ListDetail
 * * Base View: vwListDetails
 * * @description Tracks the records within each list.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'List Details')
export class ListDetailEntity extends BaseEntity<ListDetailEntityType> {
    /**
    * Loads the List Details record from the database
    * @param ID: string - primary key value to load the List Details record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ListDetailEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: ListID
    * * Display Name: List ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Lists (vwLists.ID)
    */
    get ListID(): string {  
        return this.Get('ListID');
    }
    set ListID(value: string) {
        this.Set('ListID', value);
    }

    /**
    * * Field Name: RecordID
    * * Display Name: Record
    * * SQL Data Type: nvarchar(445)
    */
    get RecordID(): string {  
        return this.Get('RecordID');
    }
    set RecordID(value: string) {
        this.Set('RecordID', value);
    }

    /**
    * * Field Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get Sequence(): number {  
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
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
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(30)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Active
    *   * Disabled
    *   * Rejected
    *   * Complete
    *   * Error
    *   * Other
    * * Description: Tracks the status of each individual list detail row to enable processing of various types and the use of the status column for filtering list detail rows within a list that are in a particular state.
    */
    get Status(): 'Pending' | 'Active' | 'Disabled' | 'Rejected' | 'Complete' | 'Error' | 'Other' {  
        return this.Get('Status');
    }
    set Status(value: 'Pending' | 'Active' | 'Disabled' | 'Rejected' | 'Complete' | 'Error' | 'Other') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: AdditionalData
    * * Display Name: Additional Data
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Optional column that allows for tracking any additional data for each ListDetail row
    */
    get AdditionalData(): string | null {  
        return this.Get('AdditionalData');
    }
    set AdditionalData(value: string | null) {
        this.Set('AdditionalData', value);
    }

    /**
    * * Field Name: List
    * * Display Name: List
    * * SQL Data Type: nvarchar(100)
    */
    get List(): string {  
        return this.Get('List');
    }
}

            
/**
 * Lists - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: List
 * * Base View: vwLists
 * * @description Static lists are useful for controlling a set of data for a given entity. These can be used programatically for applications like logging and tracking long-running tasks and also by end users for tracking any particular list of records they want to directly control the set.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Lists')
export class ListEntity extends BaseEntity<ListEntityType> {
    /**
    * Loads the Lists record from the database
    * @param ID: string - primary key value to load the Lists record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ListEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: Name
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
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: CategoryID
    * * Display Name: Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: List Categories (vwListCategories.ID)
    */
    get CategoryID(): string | null {  
        return this.Get('CategoryID');
    }
    set CategoryID(value: string | null) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: ExternalSystemRecordID
    * * Display Name: External System Record ID
    * * SQL Data Type: nvarchar(100)
    */
    get ExternalSystemRecordID(): string | null {  
        return this.Get('ExternalSystemRecordID');
    }
    set ExternalSystemRecordID(value: string | null) {
        this.Set('ExternalSystemRecordID', value);
    }

    /**
    * * Field Name: CompanyIntegrationID
    * * Display Name: Company Integration ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Company Integrations (vwCompanyIntegrations.ID)
    */
    get CompanyIntegrationID(): string | null {  
        return this.Get('CompanyIntegrationID');
    }
    set CompanyIntegrationID(value: string | null) {
        this.Set('CompanyIntegrationID', value);
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
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(100)
    */
    get Category(): string | null {  
        return this.Get('Category');
    }
}

            
/**
 * Output Delivery Types - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: OutputDeliveryType
 * * Base View: vwOutputDeliveryTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Output Delivery Types')
export class OutputDeliveryTypeEntity extends BaseEntity<OutputDeliveryTypeEntityType> {
    /**
    * Loads the Output Delivery Types record from the database
    * @param ID: string - primary key value to load the Output Delivery Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof OutputDeliveryTypeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Output Delivery Types - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof OutputDeliveryTypeEntity
    * @throws {Error} - Save is not allowed for Output Delivery Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for Output Delivery Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }

    /**
    * Output Delivery Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof OutputDeliveryTypeEntity
    * @throws {Error} - Delete is not allowed for Output Delivery Types, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Output Delivery Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
 * Output Format Types - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: OutputFormatType
 * * Base View: vwOutputFormatTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Output Format Types')
export class OutputFormatTypeEntity extends BaseEntity<OutputFormatTypeEntityType> {
    /**
    * Loads the Output Format Types record from the database
    * @param ID: string - primary key value to load the Output Format Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof OutputFormatTypeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Output Format Types - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof OutputFormatTypeEntity
    * @throws {Error} - Save is not allowed for Output Format Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for Output Format Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }

    /**
    * Output Format Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof OutputFormatTypeEntity
    * @throws {Error} - Delete is not allowed for Output Format Types, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Output Format Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: DisplayFormat
    * * Display Name: Display Format
    * * SQL Data Type: nvarchar(MAX)
    */
    get DisplayFormat(): string | null {  
        return this.Get('DisplayFormat');
    }
    set DisplayFormat(value: string | null) {
        this.Set('DisplayFormat', value);
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
 * Output Trigger Types - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: OutputTriggerType
 * * Base View: vwOutputTriggerTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Output Trigger Types')
export class OutputTriggerTypeEntity extends BaseEntity<OutputTriggerTypeEntityType> {
    /**
    * Loads the Output Trigger Types record from the database
    * @param ID: string - primary key value to load the Output Trigger Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof OutputTriggerTypeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Output Trigger Types - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof OutputTriggerTypeEntity
    * @throws {Error} - Save is not allowed for Output Trigger Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for Output Trigger Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }

    /**
    * Output Trigger Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof OutputTriggerTypeEntity
    * @throws {Error} - Delete is not allowed for Output Trigger Types, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Output Trigger Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
 * Queries - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Query
 * * Base View: vwQueries
 * * @description Catalog of stored queries. This is useful for any arbitrary query that is known to be performant and correct and can be reused. Queries can be viewed/run by a user, used programatically via RunQuery, and also used by AI systems for improved reliability instead of dynamically generated SQL. Queries can also improve security since they store the SQL instead of using dynamic SQL.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Queries')
export class QueryEntity extends BaseEntity<QueryEntityType> {
    /**
    * Loads the Queries record from the database
    * @param ID: string - primary key value to load the Queries record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof QueryEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Queries - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof QueryEntity
    * @throws {Error} - Delete is not allowed for Queries, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Queries, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: CategoryID
    * * Display Name: Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Query Categories (vwQueryCategories.ID)
    */
    get CategoryID(): string | null {  
        return this.Get('CategoryID');
    }
    set CategoryID(value: string | null) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: UserQuestion
    * * Display Name: User Question
    * * SQL Data Type: nvarchar(MAX)
    */
    get UserQuestion(): string | null {  
        return this.Get('UserQuestion');
    }
    set UserQuestion(value: string | null) {
        this.Set('UserQuestion', value);
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
    * * Field Name: SQL
    * * Display Name: SQL
    * * SQL Data Type: nvarchar(MAX)
    */
    get SQL(): string | null {  
        return this.Get('SQL');
    }
    set SQL(value: string | null) {
        this.Set('SQL', value);
    }

    /**
    * * Field Name: TechnicalDescription
    * * Display Name: Technical Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get TechnicalDescription(): string | null {  
        return this.Get('TechnicalDescription');
    }
    set TechnicalDescription(value: string | null) {
        this.Set('TechnicalDescription', value);
    }

    /**
    * * Field Name: OriginalSQL
    * * Display Name: Original SQL
    * * SQL Data Type: nvarchar(MAX)
    */
    get OriginalSQL(): string | null {  
        return this.Get('OriginalSQL');
    }
    set OriginalSQL(value: string | null) {
        this.Set('OriginalSQL', value);
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
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(15)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Approved
    *   * Rejected
    *   * Expired
    */
    get Status(): 'Pending' | 'Approved' | 'Rejected' | 'Expired' {  
        return this.Get('Status');
    }
    set Status(value: 'Pending' | 'Approved' | 'Rejected' | 'Expired') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: QualityRank
    * * Display Name: Quality Rank
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Value indicating the quality of the query, higher values mean a better quality
    */
    get QualityRank(): number | null {  
        return this.Get('QualityRank');
    }
    set QualityRank(value: number | null) {
        this.Set('QualityRank', value);
    }

    /**
    * * Field Name: ExecutionCostRank
    * * Display Name: Execution Cost Rank
    * * SQL Data Type: int
    * * Description: Higher numbers indicate more execution overhead/time required. Useful for planning which queries to use in various scenarios.
    */
    get ExecutionCostRank(): number | null {  
        return this.Get('ExecutionCostRank');
    }
    set ExecutionCostRank(value: number | null) {
        this.Set('ExecutionCostRank', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(50)
    */
    get Category(): string | null {  
        return this.Get('Category');
    }
}

            
/**
 * Query Categories - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: QueryCategory
 * * Base View: vwQueryCategories
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Query Categories')
export class QueryCategoryEntity extends BaseEntity<QueryCategoryEntityType> {
    /**
    * Loads the Query Categories record from the database
    * @param ID: string - primary key value to load the Query Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof QueryCategoryEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * SQL Data Type: nvarchar(50)
    */
    get Name(): string {  
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Query Categories (vwQueryCategories.ID)
    */
    get ParentID(): string | null {  
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
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
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Parent
    * * Display Name: Parent
    * * SQL Data Type: nvarchar(50)
    */
    get Parent(): string | null {  
        return this.Get('Parent');
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }
}

            
/**
 * Query Fields - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: QueryField
 * * Base View: vwQueryFields
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Query Fields')
export class QueryFieldEntity extends BaseEntity<QueryFieldEntityType> {
    /**
    * Loads the Query Fields record from the database
    * @param ID: string - primary key value to load the Query Fields record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof QueryFieldEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Query Fields - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof QueryFieldEntity
    * @throws {Error} - Delete is not allowed for Query Fields, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Query Fields, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: QueryID
    * * Display Name: Query ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Queries (vwQueries.ID)
    */
    get QueryID(): string {  
        return this.Get('QueryID');
    }
    set QueryID(value: string) {
        this.Set('QueryID', value);
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
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    */
    get Sequence(): number {  
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: SQLBaseType
    * * Display Name: SQLBase Type
    * * SQL Data Type: nvarchar(50)
    * * Description: The base type, not including parameters, in SQL. For example this field would be nvarchar or decimal, and wouldn't include type parameters. The SQLFullType field provides that information.
    */
    get SQLBaseType(): string {  
        return this.Get('SQLBaseType');
    }
    set SQLBaseType(value: string) {
        this.Set('SQLBaseType', value);
    }

    /**
    * * Field Name: SQLFullType
    * * Display Name: SQLFull Type
    * * SQL Data Type: nvarchar(100)
    * * Description: The full SQL type for the field, for example datetime or nvarchar(10) etc.
    */
    get SQLFullType(): string {  
        return this.Get('SQLFullType');
    }
    set SQLFullType(value: string) {
        this.Set('SQLFullType', value);
    }

    /**
    * * Field Name: SourceEntityID
    * * Display Name: Source Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get SourceEntityID(): string | null {  
        return this.Get('SourceEntityID');
    }
    set SourceEntityID(value: string | null) {
        this.Set('SourceEntityID', value);
    }

    /**
    * * Field Name: SourceFieldName
    * * Display Name: Source Field Name
    * * SQL Data Type: nvarchar(255)
    */
    get SourceFieldName(): string | null {  
        return this.Get('SourceFieldName');
    }
    set SourceFieldName(value: string | null) {
        this.Set('SourceFieldName', value);
    }

    /**
    * * Field Name: IsComputed
    * * Display Name: Is Computed
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsComputed(): boolean {  
        return this.Get('IsComputed');
    }
    set IsComputed(value: boolean) {
        this.Set('IsComputed', value);
    }

    /**
    * * Field Name: ComputationDescription
    * * Display Name: Computation Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get ComputationDescription(): string | null {  
        return this.Get('ComputationDescription');
    }
    set ComputationDescription(value: string | null) {
        this.Set('ComputationDescription', value);
    }

    /**
    * * Field Name: IsSummary
    * * Display Name: Is Summary
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsSummary(): boolean {  
        return this.Get('IsSummary');
    }
    set IsSummary(value: boolean) {
        this.Set('IsSummary', value);
    }

    /**
    * * Field Name: SummaryDescription
    * * Display Name: Summary Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get SummaryDescription(): string | null {  
        return this.Get('SummaryDescription');
    }
    set SummaryDescription(value: string | null) {
        this.Set('SummaryDescription', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Query
    * * Display Name: Query
    * * SQL Data Type: nvarchar(255)
    */
    get Query(): string {  
        return this.Get('Query');
    }

    /**
    * * Field Name: SourceEntity
    * * Display Name: Source Entity
    * * SQL Data Type: nvarchar(255)
    */
    get SourceEntity(): string | null {  
        return this.Get('SourceEntity');
    }
}

            
/**
 * Query Permissions - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: QueryPermission
 * * Base View: vwQueryPermissions
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Query Permissions')
export class QueryPermissionEntity extends BaseEntity<QueryPermissionEntityType> {
    /**
    * Loads the Query Permissions record from the database
    * @param ID: string - primary key value to load the Query Permissions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof QueryPermissionEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Query Permissions - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof QueryPermissionEntity
    * @throws {Error} - Delete is not allowed for Query Permissions, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Query Permissions, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: QueryID
    * * Display Name: Query ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Queries (vwQueries.ID)
    */
    get QueryID(): string {  
        return this.Get('QueryID');
    }
    set QueryID(value: string) {
        this.Set('QueryID', value);
    }

    /**
    * * Field Name: RoleID
    * * Display Name: Role ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Roles (vwRoles.ID)
    */
    get RoleID(): string {  
        return this.Get('RoleID');
    }
    set RoleID(value: string) {
        this.Set('RoleID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Query
    * * Display Name: Query
    * * SQL Data Type: nvarchar(255)
    */
    get Query(): string {  
        return this.Get('Query');
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(50)
    */
    get Role(): string {  
        return this.Get('Role');
    }
}

            
/**
 * Queue Tasks - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: QueueTask
 * * Base View: vwQueueTasks
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Queue Tasks')
export class QueueTaskEntity extends BaseEntity<QueueTaskEntityType> {
    /**
    * Loads the Queue Tasks record from the database
    * @param ID: string - primary key value to load the Queue Tasks record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof QueueTaskEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Queue Tasks - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof QueueTaskEntity
    * @throws {Error} - Delete is not allowed for Queue Tasks, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Queue Tasks, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: QueueID
    * * Display Name: Queue ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Queues (vwQueues.ID)
    */
    get QueueID(): string {  
        return this.Get('QueueID');
    }
    set QueueID(value: string) {
        this.Set('QueueID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nchar(10)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * In Progress
    *   * Completed
    *   * Failed
    */
    get Status(): 'In Progress' | 'Completed' | 'Failed' {  
        return this.Get('Status');
    }
    set Status(value: 'In Progress' | 'Completed' | 'Failed') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetime
    */
    get StartedAt(): Date | null {  
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date | null) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: EndedAt
    * * Display Name: Ended At
    * * SQL Data Type: datetime
    */
    get EndedAt(): Date | null {  
        return this.Get('EndedAt');
    }
    set EndedAt(value: Date | null) {
        this.Set('EndedAt', value);
    }

    /**
    * * Field Name: Data
    * * Display Name: Data
    * * SQL Data Type: nvarchar(MAX)
    */
    get Data(): string | null {  
        return this.Get('Data');
    }
    set Data(value: string | null) {
        this.Set('Data', value);
    }

    /**
    * * Field Name: Options
    * * Display Name: Options
    * * SQL Data Type: nvarchar(MAX)
    */
    get Options(): string | null {  
        return this.Get('Options');
    }
    set Options(value: string | null) {
        this.Set('Options', value);
    }

    /**
    * * Field Name: Output
    * * Display Name: Output
    * * SQL Data Type: nvarchar(MAX)
    */
    get Output(): string | null {  
        return this.Get('Output');
    }
    set Output(value: string | null) {
        this.Set('Output', value);
    }

    /**
    * * Field Name: ErrorMessage
    * * Display Name: Error Message
    * * SQL Data Type: nvarchar(MAX)
    */
    get ErrorMessage(): string | null {  
        return this.Get('ErrorMessage');
    }
    set ErrorMessage(value: string | null) {
        this.Set('ErrorMessage', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get Comments(): string | null {  
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
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
    * * Field Name: Queue
    * * Display Name: Queue
    * * SQL Data Type: nvarchar(50)
    */
    get Queue(): string {  
        return this.Get('Queue');
    }
}

            
/**
 * Queue Types - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: QueueType
 * * Base View: vwQueueTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Queue Types')
export class QueueTypeEntity extends BaseEntity<QueueTypeEntityType> {
    /**
    * Loads the Queue Types record from the database
    * @param ID: string - primary key value to load the Queue Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof QueueTypeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Queue Types - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof QueueTypeEntity
    * @throws {Error} - Save is not allowed for Queue Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for Queue Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }

    /**
    * Queue Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof QueueTypeEntity
    * @throws {Error} - Delete is not allowed for Queue Types, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Queue Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: DriverClass
    * * Display Name: Driver Class
    * * SQL Data Type: nvarchar(100)
    */
    get DriverClass(): string {  
        return this.Get('DriverClass');
    }
    set DriverClass(value: string) {
        this.Set('DriverClass', value);
    }

    /**
    * * Field Name: DriverImportPath
    * * Display Name: Driver Import Path
    * * SQL Data Type: nvarchar(200)
    */
    get DriverImportPath(): string | null {  
        return this.Get('DriverImportPath');
    }
    set DriverImportPath(value: string | null) {
        this.Set('DriverImportPath', value);
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
 * Queues - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Queue
 * * Base View: vwQueues
 * * @description Queues can be used to async execute long running tasks
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Queues')
export class QueueEntity extends BaseEntity<QueueEntityType> {
    /**
    * Loads the Queues record from the database
    * @param ID: string - primary key value to load the Queues record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof QueueEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Queues - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof QueueEntity
    * @throws {Error} - Delete is not allowed for Queues, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Queues, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: QueueTypeID
    * * Display Name: Queue Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Queue Types (vwQueueTypes.ID)
    */
    get QueueTypeID(): string {  
        return this.Get('QueueTypeID');
    }
    set QueueTypeID(value: string) {
        this.Set('QueueTypeID', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsActive(): boolean {  
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: ProcessPID
    * * Display Name: Process PID
    * * SQL Data Type: int
    */
    get ProcessPID(): number | null {  
        return this.Get('ProcessPID');
    }
    set ProcessPID(value: number | null) {
        this.Set('ProcessPID', value);
    }

    /**
    * * Field Name: ProcessPlatform
    * * Display Name: Process Platform
    * * SQL Data Type: nvarchar(30)
    */
    get ProcessPlatform(): string | null {  
        return this.Get('ProcessPlatform');
    }
    set ProcessPlatform(value: string | null) {
        this.Set('ProcessPlatform', value);
    }

    /**
    * * Field Name: ProcessVersion
    * * Display Name: Process Version
    * * SQL Data Type: nvarchar(15)
    */
    get ProcessVersion(): string | null {  
        return this.Get('ProcessVersion');
    }
    set ProcessVersion(value: string | null) {
        this.Set('ProcessVersion', value);
    }

    /**
    * * Field Name: ProcessCwd
    * * Display Name: Process Cwd
    * * SQL Data Type: nvarchar(100)
    */
    get ProcessCwd(): string | null {  
        return this.Get('ProcessCwd');
    }
    set ProcessCwd(value: string | null) {
        this.Set('ProcessCwd', value);
    }

    /**
    * * Field Name: ProcessIPAddress
    * * Display Name: Process IPAddress
    * * SQL Data Type: nvarchar(50)
    */
    get ProcessIPAddress(): string | null {  
        return this.Get('ProcessIPAddress');
    }
    set ProcessIPAddress(value: string | null) {
        this.Set('ProcessIPAddress', value);
    }

    /**
    * * Field Name: ProcessMacAddress
    * * Display Name: Process Mac Address
    * * SQL Data Type: nvarchar(50)
    */
    get ProcessMacAddress(): string | null {  
        return this.Get('ProcessMacAddress');
    }
    set ProcessMacAddress(value: string | null) {
        this.Set('ProcessMacAddress', value);
    }

    /**
    * * Field Name: ProcessOSName
    * * Display Name: Process OSName
    * * SQL Data Type: nvarchar(25)
    */
    get ProcessOSName(): string | null {  
        return this.Get('ProcessOSName');
    }
    set ProcessOSName(value: string | null) {
        this.Set('ProcessOSName', value);
    }

    /**
    * * Field Name: ProcessOSVersion
    * * Display Name: Process OSVersion
    * * SQL Data Type: nvarchar(10)
    */
    get ProcessOSVersion(): string | null {  
        return this.Get('ProcessOSVersion');
    }
    set ProcessOSVersion(value: string | null) {
        this.Set('ProcessOSVersion', value);
    }

    /**
    * * Field Name: ProcessHostName
    * * Display Name: Process Host Name
    * * SQL Data Type: nvarchar(50)
    */
    get ProcessHostName(): string | null {  
        return this.Get('ProcessHostName');
    }
    set ProcessHostName(value: string | null) {
        this.Set('ProcessHostName', value);
    }

    /**
    * * Field Name: ProcessUserID
    * * Display Name: Process User ID
    * * SQL Data Type: nvarchar(25)
    */
    get ProcessUserID(): string | null {  
        return this.Get('ProcessUserID');
    }
    set ProcessUserID(value: string | null) {
        this.Set('ProcessUserID', value);
    }

    /**
    * * Field Name: ProcessUserName
    * * Display Name: Process User Name
    * * SQL Data Type: nvarchar(50)
    */
    get ProcessUserName(): string | null {  
        return this.Get('ProcessUserName');
    }
    set ProcessUserName(value: string | null) {
        this.Set('ProcessUserName', value);
    }

    /**
    * * Field Name: LastHeartbeat
    * * Display Name: Last Heartbeat
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get LastHeartbeat(): Date {  
        return this.Get('LastHeartbeat');
    }
    set LastHeartbeat(value: Date) {
        this.Set('LastHeartbeat', value);
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
    * * Field Name: QueueType
    * * Display Name: Queue Type
    * * SQL Data Type: nvarchar(50)
    */
    get QueueType(): string {  
        return this.Get('QueueType');
    }
}

            
/**
 * Recommendation Items - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: RecommendationItem
 * * Base View: vwRecommendationItems
 * * @description Table to store individual recommendation items that are the right side of the recommendation which we track in the DestinationEntityID/DestinationEntityRecordID
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Recommendation Items')
export class RecommendationItemEntity extends BaseEntity<RecommendationItemEntityType> {
    /**
    * Loads the Recommendation Items record from the database
    * @param ID: string - primary key value to load the Recommendation Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof RecommendationItemEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Recommendation Items - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof RecommendationItemEntity
    * @throws {Error} - Delete is not allowed for Recommendation Items, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Recommendation Items, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: RecommendationID
    * * Display Name: Recommendation ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Recommendations (vwRecommendations.ID)
    */
    get RecommendationID(): string {  
        return this.Get('RecommendationID');
    }
    set RecommendationID(value: string) {
        this.Set('RecommendationID', value);
    }

    /**
    * * Field Name: DestinationEntityID
    * * Display Name: Destination Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get DestinationEntityID(): string {  
        return this.Get('DestinationEntityID');
    }
    set DestinationEntityID(value: string) {
        this.Set('DestinationEntityID', value);
    }

    /**
    * * Field Name: DestinationEntityRecordID
    * * Display Name: Destination Entity Record ID
    * * SQL Data Type: nvarchar(450)
    * * Description: The record ID of the destination entity
    */
    get DestinationEntityRecordID(): string {  
        return this.Get('DestinationEntityRecordID');
    }
    set DestinationEntityRecordID(value: string) {
        this.Set('DestinationEntityRecordID', value);
    }

    /**
    * * Field Name: MatchProbability
    * * Display Name: Match Probability
    * * SQL Data Type: decimal(18, 15)
    * * Description: A value between 0 and 1 indicating the probability of the match, higher numbers indicating a more certain match/recommendation.
    */
    get MatchProbability(): number | null {  
        return this.Get('MatchProbability');
    }
    set MatchProbability(value: number | null) {
        this.Set('MatchProbability', value);
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
    * * Field Name: DestinationEntity
    * * Display Name: Destination Entity
    * * SQL Data Type: nvarchar(255)
    */
    get DestinationEntity(): string {  
        return this.Get('DestinationEntity');
    }
}

            
/**
 * Recommendation Providers - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: RecommendationProvider
 * * Base View: vwRecommendationProviders
 * * @description Recommendation providers details
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Recommendation Providers')
export class RecommendationProviderEntity extends BaseEntity<RecommendationProviderEntityType> {
    /**
    * Loads the Recommendation Providers record from the database
    * @param ID: string - primary key value to load the Recommendation Providers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof RecommendationProviderEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Recommendation Providers - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof RecommendationProviderEntity
    * @throws {Error} - Delete is not allowed for Recommendation Providers, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Recommendation Providers, to enable it set AllowDeleteAPI to 1 in the database.');
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
 * Recommendation Runs - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: RecommendationRun
 * * Base View: vwRecommendationRuns
 * * @description Recommendation runs log each time a provider is requested to provide recommendations
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Recommendation Runs')
export class RecommendationRunEntity extends BaseEntity<RecommendationRunEntityType> {
    /**
    * Loads the Recommendation Runs record from the database
    * @param ID: string - primary key value to load the Recommendation Runs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof RecommendationRunEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Recommendation Runs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof RecommendationRunEntity
    * @throws {Error} - Delete is not allowed for Recommendation Runs, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Recommendation Runs, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: RecommendationProviderID
    * * Display Name: Recommendation Provider ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Recommendation Providers (vwRecommendationProviders.ID)
    */
    get RecommendationProviderID(): string {  
        return this.Get('RecommendationProviderID');
    }
    set RecommendationProviderID(value: string) {
        this.Set('RecommendationProviderID', value);
    }

    /**
    * * Field Name: StartDate
    * * Display Name: Start Date
    * * SQL Data Type: datetime
    * * Description: The start date of the recommendation run
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
    * * Description: The end date of the recommendation run
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
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * In Progress
    *   * Completed
    *   * Canceled
    *   * Error
    * * Description: The status of the recommendation run
    */
    get Status(): 'Pending' | 'In Progress' | 'Completed' | 'Canceled' | 'Error' {  
        return this.Get('Status');
    }
    set Status(value: 'Pending' | 'In Progress' | 'Completed' | 'Canceled' | 'Error') {
        this.Set('Status', value);
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
    * * Field Name: RunByUserID
    * * Display Name: Run By User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get RunByUserID(): string {  
        return this.Get('RunByUserID');
    }
    set RunByUserID(value: string) {
        this.Set('RunByUserID', value);
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
    * * Field Name: RecommendationProvider
    * * Display Name: Recommendation Provider
    * * SQL Data Type: nvarchar(255)
    */
    get RecommendationProvider(): string {  
        return this.Get('RecommendationProvider');
    }

    /**
    * * Field Name: RunByUser
    * * Display Name: Run By User
    * * SQL Data Type: nvarchar(100)
    */
    get RunByUser(): string {  
        return this.Get('RunByUser');
    }
}

            
/**
 * Recommendations - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Recommendation
 * * Base View: vwRecommendations
 * * @description Recommendation headers that store the left side of the recommendation which we track in the SourceEntityID/SourceEntityRecordID
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Recommendations')
export class RecommendationEntity extends BaseEntity<RecommendationEntityType> {
    /**
    * Loads the Recommendations record from the database
    * @param ID: string - primary key value to load the Recommendations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof RecommendationEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Recommendations - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof RecommendationEntity
    * @throws {Error} - Delete is not allowed for Recommendations, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Recommendations, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: RecommendationRunID
    * * Display Name: Recommendation Run ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Recommendation Runs (vwRecommendationRuns.ID)
    */
    get RecommendationRunID(): string {  
        return this.Get('RecommendationRunID');
    }
    set RecommendationRunID(value: string) {
        this.Set('RecommendationRunID', value);
    }

    /**
    * * Field Name: SourceEntityID
    * * Display Name: Source Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get SourceEntityID(): string {  
        return this.Get('SourceEntityID');
    }
    set SourceEntityID(value: string) {
        this.Set('SourceEntityID', value);
    }

    /**
    * * Field Name: SourceEntityRecordID
    * * Display Name: Source Entity Record ID
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The record ID of the source entity
    */
    get SourceEntityRecordID(): string {  
        return this.Get('SourceEntityRecordID');
    }
    set SourceEntityRecordID(value: string) {
        this.Set('SourceEntityRecordID', value);
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
    * * Field Name: SourceEntity
    * * Display Name: Source Entity
    * * SQL Data Type: nvarchar(255)
    */
    get SourceEntity(): string {  
        return this.Get('SourceEntity');
    }
}

            
/**
 * Record Change Replay Runs - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: RecordChangeReplayRun
 * * Base View: vwRecordChangeReplayRuns
 * * @description Table to track the runs of replaying external record changes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Record Change Replay Runs')
export class RecordChangeReplayRunEntity extends BaseEntity<RecordChangeReplayRunEntityType> {
    /**
    * Loads the Record Change Replay Runs record from the database
    * @param ID: string - primary key value to load the Record Change Replay Runs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof RecordChangeReplayRunEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Record Change Replay Runs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof RecordChangeReplayRunEntity
    * @throws {Error} - Delete is not allowed for Record Change Replay Runs, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Record Change Replay Runs, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetime
    * * Description: Timestamp when the replay run started
    */
    get StartedAt(): Date {  
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: EndedAt
    * * Display Name: Ended At
    * * SQL Data Type: datetime
    * * Description: Timestamp when the replay run ended
    */
    get EndedAt(): Date | null {  
        return this.Get('EndedAt');
    }
    set EndedAt(value: Date | null) {
        this.Set('EndedAt', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * In Progress
    *   * Complete
    *   * Error
    * * Description: Status of the replay run (Pending, In Progress, Complete, Error)
    */
    get Status(): 'Pending' | 'In Progress' | 'Complete' | 'Error' {  
        return this.Get('Status');
    }
    set Status(value: 'Pending' | 'In Progress' | 'Complete' | 'Error') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
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
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }
}

            
/**
 * Record Changes - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: RecordChange
 * * Base View: vwRecordChanges
 * * @description For entities that have TrackRecordChanges=1, Record Changes will store the history of all changes made within the system. For integrations you can directly add values here if you have inbound signals indicating records were changed in a source system. This entity only automatically captures Record Changes if they were made within the system.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Record Changes')
export class RecordChangeEntity extends BaseEntity<RecordChangeEntityType> {
    /**
    * Loads the Record Changes record from the database
    * @param ID: string - primary key value to load the Record Changes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof RecordChangeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Record Changes - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof RecordChangeEntity
    * @throws {Error} - Delete is not allowed for Record Changes, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Record Changes, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: RecordID
    * * Display Name: Record
    * * SQL Data Type: nvarchar(750)
    */
    get RecordID(): string {  
        return this.Get('RecordID');
    }
    set RecordID(value: string) {
        this.Set('RecordID', value);
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Create
    * * Value List Type: List
    * * Possible Values 
    *   * Create
    *   * Update
    *   * Delete
    * * Description: Create, Update, or Delete
    */
    get Type(): 'Create' | 'Update' | 'Delete' {  
        return this.Get('Type');
    }
    set Type(value: 'Create' | 'Update' | 'Delete') {
        this.Set('Type', value);
    }

    /**
    * * Field Name: Source
    * * Display Name: Source
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Internal
    * * Value List Type: List
    * * Possible Values 
    *   * Internal
    *   * External
    * * Description: Internal or External
    */
    get Source(): 'Internal' | 'External' {  
        return this.Get('Source');
    }
    set Source(value: 'Internal' | 'External') {
        this.Set('Source', value);
    }

    /**
    * * Field Name: ChangedAt
    * * Display Name: Changed At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    * * Description: The date/time that the change occured.
    */
    get ChangedAt(): Date {  
        return this.Get('ChangedAt');
    }
    set ChangedAt(value: Date) {
        this.Set('ChangedAt', value);
    }

    /**
    * * Field Name: ChangesJSON
    * * Display Name: Changes JSON
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON structure that describes what was changed in a structured format.
    */
    get ChangesJSON(): string {  
        return this.Get('ChangesJSON');
    }
    set ChangesJSON(value: string) {
        this.Set('ChangesJSON', value);
    }

    /**
    * * Field Name: ChangesDescription
    * * Display Name: Changes Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: A generated, human-readable description of what was changed.
    */
    get ChangesDescription(): string {  
        return this.Get('ChangesDescription');
    }
    set ChangesDescription(value: string) {
        this.Set('ChangesDescription', value);
    }

    /**
    * * Field Name: FullRecordJSON
    * * Display Name: Full Record JSON
    * * SQL Data Type: nvarchar(MAX)
    * * Description: A complete snapshot of the record AFTER the change was applied in a JSON format that can be parsed.
    */
    get FullRecordJSON(): string {  
        return this.Get('FullRecordJSON');
    }
    set FullRecordJSON(value: string) {
        this.Set('FullRecordJSON', value);
    }

    /**
    * * Field Name: Status
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Complete
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Complete
    *   * Error
    * * Description: For internal record changes generated within MJ, the status is immediately Complete. For external changes that are detected, the workflow starts off as Pending, then In Progress and finally either Complete or Error
    */
    get Status(): 'Pending' | 'Complete' | 'Error' {  
        return this.Get('Status');
    }
    set Status(value: 'Pending' | 'Complete' | 'Error') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ErrorLog
    * * Display Name: Error Log
    * * SQL Data Type: nvarchar(MAX)
    */
    get ErrorLog(): string | null {  
        return this.Get('ErrorLog');
    }
    set ErrorLog(value: string | null) {
        this.Set('ErrorLog', value);
    }

    /**
    * * Field Name: ReplayRunID
    * * Display Name: Replay Run ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Record Change Replay Runs (vwRecordChangeReplayRuns.ID)
    */
    get ReplayRunID(): string | null {  
        return this.Get('ReplayRunID');
    }
    set ReplayRunID(value: string | null) {
        this.Set('ReplayRunID', value);
    }

    /**
    * * Field Name: IntegrationID
    * * Display Name: Integration ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Integrations (vwIntegrations.ID)
    */
    get IntegrationID(): string | null {  
        return this.Get('IntegrationID');
    }
    set IntegrationID(value: string | null) {
        this.Set('IntegrationID', value);
    }

    /**
    * * Field Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get Comments(): string | null {  
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
    }

    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get CreatedAt(): Date {  
        return this.Get('CreatedAt');
    }

    /**
    * * Field Name: UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get UpdatedAt(): Date {  
        return this.Get('UpdatedAt');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }

    /**
    * * Field Name: Integration
    * * Display Name: Integration
    * * SQL Data Type: nvarchar(100)
    */
    get Integration(): string | null {  
        return this.Get('Integration');
    }
}

            
/**
 * Record Merge Deletion Logs - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: RecordMergeDeletionLog
 * * Base View: vwRecordMergeDeletionLogs
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Record Merge Deletion Logs')
export class RecordMergeDeletionLogEntity extends BaseEntity<RecordMergeDeletionLogEntityType> {
    /**
    * Loads the Record Merge Deletion Logs record from the database
    * @param ID: string - primary key value to load the Record Merge Deletion Logs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof RecordMergeDeletionLogEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Record Merge Deletion Logs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof RecordMergeDeletionLogEntity
    * @throws {Error} - Delete is not allowed for Record Merge Deletion Logs, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Record Merge Deletion Logs, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: RecordMergeLogID
    * * Display Name: Record Merge Log ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Record Merge Logs (vwRecordMergeLogs.ID)
    */
    get RecordMergeLogID(): string {  
        return this.Get('RecordMergeLogID');
    }
    set RecordMergeLogID(value: string) {
        this.Set('RecordMergeLogID', value);
    }

    /**
    * * Field Name: DeletedRecordID
    * * Display Name: Deleted Record ID
    * * SQL Data Type: nvarchar(750)
    */
    get DeletedRecordID(): string {  
        return this.Get('DeletedRecordID');
    }
    set DeletedRecordID(value: string) {
        this.Set('DeletedRecordID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(10)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Complete
    *   * Error
    */
    get Status(): 'Pending' | 'Complete' | 'Error' {  
        return this.Get('Status');
    }
    set Status(value: 'Pending' | 'Complete' | 'Error') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ProcessingLog
    * * Display Name: Processing Log
    * * SQL Data Type: nvarchar(MAX)
    */
    get ProcessingLog(): string | null {  
        return this.Get('ProcessingLog');
    }
    set ProcessingLog(value: string | null) {
        this.Set('ProcessingLog', value);
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
 * Record Merge Logs - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: RecordMergeLog
 * * Base View: vwRecordMergeLogs
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Record Merge Logs')
export class RecordMergeLogEntity extends BaseEntity<RecordMergeLogEntityType> {
    /**
    * Loads the Record Merge Logs record from the database
    * @param ID: string - primary key value to load the Record Merge Logs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof RecordMergeLogEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Record Merge Logs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof RecordMergeLogEntity
    * @throws {Error} - Delete is not allowed for Record Merge Logs, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Record Merge Logs, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: SurvivingRecordID
    * * Display Name: Surviving Record ID
    * * SQL Data Type: nvarchar(450)
    */
    get SurvivingRecordID(): string {  
        return this.Get('SurvivingRecordID');
    }
    set SurvivingRecordID(value: string) {
        this.Set('SurvivingRecordID', value);
    }

    /**
    * * Field Name: InitiatedByUserID
    * * Display Name: Initiated By User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get InitiatedByUserID(): string {  
        return this.Get('InitiatedByUserID');
    }
    set InitiatedByUserID(value: string) {
        this.Set('InitiatedByUserID', value);
    }

    /**
    * * Field Name: ApprovalStatus
    * * Display Name: Approval Status
    * * SQL Data Type: nvarchar(10)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Approved
    *   * Rejected
    */
    get ApprovalStatus(): 'Pending' | 'Approved' | 'Rejected' {  
        return this.Get('ApprovalStatus');
    }
    set ApprovalStatus(value: 'Pending' | 'Approved' | 'Rejected') {
        this.Set('ApprovalStatus', value);
    }

    /**
    * * Field Name: ApprovedByUserID
    * * Display Name: Approved By User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get ApprovedByUserID(): string | null {  
        return this.Get('ApprovedByUserID');
    }
    set ApprovedByUserID(value: string | null) {
        this.Set('ApprovedByUserID', value);
    }

    /**
    * * Field Name: ProcessingStatus
    * * Display Name: Processing Status
    * * SQL Data Type: nvarchar(10)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Started
    *   * Complete
    *   * Error
    */
    get ProcessingStatus(): 'Started' | 'Complete' | 'Error' {  
        return this.Get('ProcessingStatus');
    }
    set ProcessingStatus(value: 'Started' | 'Complete' | 'Error') {
        this.Set('ProcessingStatus', value);
    }

    /**
    * * Field Name: ProcessingStartedAt
    * * Display Name: Processing Started At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get ProcessingStartedAt(): Date {  
        return this.Get('ProcessingStartedAt');
    }
    set ProcessingStartedAt(value: Date) {
        this.Set('ProcessingStartedAt', value);
    }

    /**
    * * Field Name: ProcessingEndedAt
    * * Display Name: Processing Ended At
    * * SQL Data Type: datetime
    */
    get ProcessingEndedAt(): Date | null {  
        return this.Get('ProcessingEndedAt');
    }
    set ProcessingEndedAt(value: Date | null) {
        this.Set('ProcessingEndedAt', value);
    }

    /**
    * * Field Name: ProcessingLog
    * * Display Name: Processing Log
    * * SQL Data Type: nvarchar(MAX)
    */
    get ProcessingLog(): string | null {  
        return this.Get('ProcessingLog');
    }
    set ProcessingLog(value: string | null) {
        this.Set('ProcessingLog', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get Comments(): string | null {  
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
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
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: InitiatedByUser
    * * Display Name: Initiated By User
    * * SQL Data Type: nvarchar(100)
    */
    get InitiatedByUser(): string {  
        return this.Get('InitiatedByUser');
    }

    /**
    * * Field Name: ApprovedByUser
    * * Display Name: Approved By User
    * * SQL Data Type: nvarchar(100)
    */
    get ApprovedByUser(): string | null {  
        return this.Get('ApprovedByUser');
    }
}

            
/**
 * Report Categories - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ReportCategory
 * * Base View: vwReportCategories
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Report Categories')
export class ReportCategoryEntity extends BaseEntity<ReportCategoryEntityType> {
    /**
    * Loads the Report Categories record from the database
    * @param ID: string - primary key value to load the Report Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ReportCategoryEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Report Categories (vwReportCategories.ID)
    */
    get ParentID(): string | null {  
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
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
    * * SQL Data Type: nvarchar(100)
    */
    get Parent(): string | null {  
        return this.Get('Parent');
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }
}

            
/**
 * Report Snapshots - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ReportSnapshot
 * * Base View: vwReportSnapshots
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Report Snapshots')
export class ReportSnapshotEntity extends BaseEntity<ReportSnapshotEntityType> {
    /**
    * Loads the Report Snapshots record from the database
    * @param ID: string - primary key value to load the Report Snapshots record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ReportSnapshotEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: ReportID
    * * Display Name: Report ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Reports (vwReports.ID)
    */
    get ReportID(): string {  
        return this.Get('ReportID');
    }
    set ReportID(value: string) {
        this.Set('ReportID', value);
    }

    /**
    * * Field Name: ResultSet
    * * Display Name: Result Set
    * * SQL Data Type: nvarchar(MAX)
    */
    get ResultSet(): string {  
        return this.Get('ResultSet');
    }
    set ResultSet(value: string) {
        this.Set('ResultSet', value);
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
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
    * * Field Name: Report
    * * Display Name: Report
    * * SQL Data Type: nvarchar(255)
    */
    get Report(): string {  
        return this.Get('Report');
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }
}

            
/**
 * Reports - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Report
 * * Base View: vwReports
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Reports')
export class ReportEntity extends BaseEntity<ReportEntityType> {
    /**
    * Loads the Reports record from the database
    * @param ID: string - primary key value to load the Reports record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ReportEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: CategoryID
    * * Display Name: Category ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Report Categories (vwReportCategories.ID)
    */
    get CategoryID(): string | null {  
        return this.Get('CategoryID');
    }
    set CategoryID(value: string | null) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: SharingScope
    * * Display Name: Sharing Scope
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Personal
    * * Value List Type: List
    * * Possible Values 
    *   * None
    *   * Specific
    *   * Everyone
    */
    get SharingScope(): 'None' | 'Specific' | 'Everyone' {  
        return this.Get('SharingScope');
    }
    set SharingScope(value: 'None' | 'Specific' | 'Everyone') {
        this.Set('SharingScope', value);
    }

    /**
    * * Field Name: ConversationID
    * * Display Name: Conversation ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Conversations (vwConversations.ID)
    */
    get ConversationID(): string | null {  
        return this.Get('ConversationID');
    }
    set ConversationID(value: string | null) {
        this.Set('ConversationID', value);
    }

    /**
    * * Field Name: ConversationDetailID
    * * Display Name: Conversation Detail ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Conversation Details (vwConversationDetails.ID)
    */
    get ConversationDetailID(): string | null {  
        return this.Get('ConversationDetailID');
    }
    set ConversationDetailID(value: string | null) {
        this.Set('ConversationDetailID', value);
    }

    /**
    * * Field Name: DataContextID
    * * Display Name: Data Context ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Data Contexts (vwDataContexts.ID)
    */
    get DataContextID(): string | null {  
        return this.Get('DataContextID');
    }
    set DataContextID(value: string | null) {
        this.Set('DataContextID', value);
    }

    /**
    * * Field Name: Configuration
    * * Display Name: Configuration
    * * SQL Data Type: nvarchar(MAX)
    */
    get Configuration(): string | null {  
        return this.Get('Configuration');
    }
    set Configuration(value: string | null) {
        this.Set('Configuration', value);
    }

    /**
    * * Field Name: OutputTriggerTypeID
    * * Display Name: Output Trigger Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Output Trigger Types (vwOutputTriggerTypes.ID)
    */
    get OutputTriggerTypeID(): string | null {  
        return this.Get('OutputTriggerTypeID');
    }
    set OutputTriggerTypeID(value: string | null) {
        this.Set('OutputTriggerTypeID', value);
    }

    /**
    * * Field Name: OutputFormatTypeID
    * * Display Name: Output Format Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Output Format Types (vwOutputFormatTypes.ID)
    */
    get OutputFormatTypeID(): string | null {  
        return this.Get('OutputFormatTypeID');
    }
    set OutputFormatTypeID(value: string | null) {
        this.Set('OutputFormatTypeID', value);
    }

    /**
    * * Field Name: OutputDeliveryTypeID
    * * Display Name: Output Delivery Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Output Delivery Types (vwOutputDeliveryTypes.ID)
    */
    get OutputDeliveryTypeID(): string | null {  
        return this.Get('OutputDeliveryTypeID');
    }
    set OutputDeliveryTypeID(value: string | null) {
        this.Set('OutputDeliveryTypeID', value);
    }

    /**
    * * Field Name: OutputFrequency
    * * Display Name: Output Frequency
    * * SQL Data Type: nvarchar(50)
    */
    get OutputFrequency(): string | null {  
        return this.Get('OutputFrequency');
    }
    set OutputFrequency(value: string | null) {
        this.Set('OutputFrequency', value);
    }

    /**
    * * Field Name: OutputTargetEmail
    * * Display Name: Output Target Email
    * * SQL Data Type: nvarchar(255)
    */
    get OutputTargetEmail(): string | null {  
        return this.Get('OutputTargetEmail');
    }
    set OutputTargetEmail(value: string | null) {
        this.Set('OutputTargetEmail', value);
    }

    /**
    * * Field Name: OutputWorkflowID
    * * Display Name: Output Workflow ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Workflows (vwWorkflows.ID)
    */
    get OutputWorkflowID(): string | null {  
        return this.Get('OutputWorkflowID');
    }
    set OutputWorkflowID(value: string | null) {
        this.Set('OutputWorkflowID', value);
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
    get Category(): string | null {  
        return this.Get('Category');
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }

    /**
    * * Field Name: Conversation
    * * Display Name: Conversation
    * * SQL Data Type: nvarchar(255)
    */
    get Conversation(): string | null {  
        return this.Get('Conversation');
    }

    /**
    * * Field Name: DataContext
    * * Display Name: Data Context
    * * SQL Data Type: nvarchar(255)
    */
    get DataContext(): string | null {  
        return this.Get('DataContext');
    }

    /**
    * * Field Name: OutputTriggerType
    * * Display Name: Output Trigger Type
    * * SQL Data Type: nvarchar(255)
    */
    get OutputTriggerType(): string | null {  
        return this.Get('OutputTriggerType');
    }

    /**
    * * Field Name: OutputFormatType
    * * Display Name: Output Format Type
    * * SQL Data Type: nvarchar(255)
    */
    get OutputFormatType(): string | null {  
        return this.Get('OutputFormatType');
    }

    /**
    * * Field Name: OutputDeliveryType
    * * Display Name: Output Delivery Type
    * * SQL Data Type: nvarchar(255)
    */
    get OutputDeliveryType(): string | null {  
        return this.Get('OutputDeliveryType');
    }

    /**
    * * Field Name: OutputWorkflow
    * * Display Name: Output Workflow
    * * SQL Data Type: nvarchar(100)
    */
    get OutputWorkflow(): string | null {  
        return this.Get('OutputWorkflow');
    }
}

            
/**
 * Resource Types - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ResourceType
 * * Base View: vwResourceTypes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Resource Types')
export class ResourceTypeEntity extends BaseEntity<ResourceTypeEntityType> {
    /**
    * Loads the Resource Types record from the database
    * @param ID: string - primary key value to load the Resource Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ResourceTypeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Resource Types - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof ResourceTypeEntity
    * @throws {Error} - Save is not allowed for Resource Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for Resource Types, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }

    /**
    * Resource Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof ResourceTypeEntity
    * @throws {Error} - Delete is not allowed for Resource Types, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Resource Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: DisplayName
    * * Display Name: Display Name
    * * SQL Data Type: nvarchar(255)
    */
    get DisplayName(): string {  
        return this.Get('DisplayName');
    }
    set DisplayName(value: string) {
        this.Set('DisplayName', value);
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
    * * Field Name: Icon
    * * Display Name: Icon
    * * SQL Data Type: nvarchar(100)
    */
    get Icon(): string | null {  
        return this.Get('Icon');
    }
    set Icon(value: string | null) {
        this.Set('Icon', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string | null {  
        return this.Get('EntityID');
    }
    set EntityID(value: string | null) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string | null {  
        return this.Get('Entity');
    }
}

            
/**
 * Roles - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Role
 * * Base View: vwRoles
 * * @description Roles are used for security administration and can have zero to many Users as members
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Roles')
export class RoleEntity extends BaseEntity<RoleEntityType> {
    /**
    * Loads the Roles record from the database
    * @param ID: string - primary key value to load the Roles record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof RoleEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: Name
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
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Description of the role
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: DirectoryID
    * * Display Name: Directory ID
    * * SQL Data Type: nvarchar(250)
    * * Description: The unique ID of the role in the directory being used for authentication, for example an ID in Azure.
    */
    get DirectoryID(): string | null {  
        return this.Get('DirectoryID');
    }
    set DirectoryID(value: string | null) {
        this.Set('DirectoryID', value);
    }

    /**
    * * Field Name: SQLName
    * * SQL Data Type: nvarchar(250)
    * * Description: The name of the role in the database, this is used for auto-generating permission statements by CodeGen
    */
    get SQLName(): string | null {  
        return this.Get('SQLName');
    }
    set SQLName(value: string | null) {
        this.Set('SQLName', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }
}

            
/**
 * Row Level Security Filters - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: RowLevelSecurityFilter
 * * Base View: vwRowLevelSecurityFilters
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Row Level Security Filters')
export class RowLevelSecurityFilterEntity extends BaseEntity<RowLevelSecurityFilterEntityType> {
    /**
    * Loads the Row Level Security Filters record from the database
    * @param ID: string - primary key value to load the Row Level Security Filters record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof RowLevelSecurityFilterEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Row Level Security Filters - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof RowLevelSecurityFilterEntity
    * @throws {Error} - Save is not allowed for Row Level Security Filters, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for Row Level Security Filters, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }

    /**
    * Row Level Security Filters - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof RowLevelSecurityFilterEntity
    * @throws {Error} - Delete is not allowed for Row Level Security Filters, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Row Level Security Filters, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: FilterText
    * * Display Name: Filter Text
    * * SQL Data Type: nvarchar(MAX)
    */
    get FilterText(): string | null {  
        return this.Get('FilterText');
    }
    set FilterText(value: string | null) {
        this.Set('FilterText', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }
}

            
/**
 * Scheduled Action Params - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ScheduledActionParam
 * * Base View: vwScheduledActionParams
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Scheduled Action Params')
export class ScheduledActionParamEntity extends BaseEntity<ScheduledActionParamEntityType> {
    /**
    * Loads the Scheduled Action Params record from the database
    * @param ID: string - primary key value to load the Scheduled Action Params record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ScheduledActionParamEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: ScheduledActionID
    * * Display Name: Scheduled Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Scheduled Actions (vwScheduledActions.ID)
    */
    get ScheduledActionID(): string {  
        return this.Get('ScheduledActionID');
    }
    set ScheduledActionID(value: string) {
        this.Set('ScheduledActionID', value);
    }

    /**
    * * Field Name: ActionParamID
    * * Display Name: Action Param ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Action Params (vwActionParams.ID)
    */
    get ActionParamID(): string {  
        return this.Get('ActionParamID');
    }
    set ActionParamID(value: string) {
        this.Set('ActionParamID', value);
    }

    /**
    * * Field Name: ValueType
    * * Display Name: Value Type
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Static
    *   * SQL Statement
    */
    get ValueType(): 'Static' | 'SQL Statement' {  
        return this.Get('ValueType');
    }
    set ValueType(value: 'Static' | 'SQL Statement') {
        this.Set('ValueType', value);
    }

    /**
    * * Field Name: Value
    * * Display Name: Value
    * * SQL Data Type: nvarchar(MAX)
    */
    get Value(): string | null {  
        return this.Get('Value');
    }
    set Value(value: string | null) {
        this.Set('Value', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get Comments(): string | null {  
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
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
    * * Field Name: ScheduledAction
    * * Display Name: Scheduled Action
    * * SQL Data Type: nvarchar(255)
    */
    get ScheduledAction(): string {  
        return this.Get('ScheduledAction');
    }

    /**
    * * Field Name: ActionParam
    * * Display Name: Action Param
    * * SQL Data Type: nvarchar(255)
    */
    get ActionParam(): string {  
        return this.Get('ActionParam');
    }
}

            
/**
 * Scheduled Actions - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: ScheduledAction
 * * Base View: vwScheduledActions
 * * @description Track scheduled actions and their details
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Scheduled Actions')
export class ScheduledActionEntity extends BaseEntity<ScheduledActionEntityType> {
    /**
    * Loads the Scheduled Actions record from the database
    * @param ID: string - primary key value to load the Scheduled Actions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ScheduledActionEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: CreatedByUserID
    * * Display Name: Created By User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get CreatedByUserID(): string {  
        return this.Get('CreatedByUserID');
    }
    set CreatedByUserID(value: string) {
        this.Set('CreatedByUserID', value);
    }

    /**
    * * Field Name: ActionID
    * * Display Name: Action ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Actions (vwActions.ID)
    */
    get ActionID(): string {  
        return this.Get('ActionID');
    }
    set ActionID(value: string) {
        this.Set('ActionID', value);
    }

    /**
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Daily
    *   * Weekly
    *   * Monthly
    *   * Yearly
    *   * Custom
    * * Description: Type of the scheduled action (Daily, Weekly, Monthly, Yearly, Custom)
    */
    get Type(): 'Daily' | 'Weekly' | 'Monthly' | 'Yearly' | 'Custom' {  
        return this.Get('Type');
    }
    set Type(value: 'Daily' | 'Weekly' | 'Monthly' | 'Yearly' | 'Custom') {
        this.Set('Type', value);
    }

    /**
    * * Field Name: CronExpression
    * * Display Name: Cron Expression
    * * SQL Data Type: nvarchar(100)
    * * Description: Cron expression defining the schedule, automatically maintained by the system unless Type is Custom, in which case the user directly sets this
    */
    get CronExpression(): string | null {  
        return this.Get('CronExpression');
    }
    set CronExpression(value: string | null) {
        this.Set('CronExpression', value);
    }

    /**
    * * Field Name: Timezone
    * * Display Name: Timezone
    * * SQL Data Type: nvarchar(100)
    * * Description: Timezone for the scheduled action, if not specified defaults to UTC/Z
    */
    get Timezone(): string {  
        return this.Get('Timezone');
    }
    set Timezone(value: string) {
        this.Set('Timezone', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * Active
    *   * Disabled
    *   * Expired
    * * Description: Status of the scheduled action (Pending, Active, Disabled, Expired)
    */
    get Status(): 'Pending' | 'Active' | 'Disabled' | 'Expired' {  
        return this.Get('Status');
    }
    set Status(value: 'Pending' | 'Active' | 'Disabled' | 'Expired') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: IntervalDays
    * * Display Name: Interval Days
    * * SQL Data Type: int
    * * Description: Interval in days for the scheduled action
    */
    get IntervalDays(): number | null {  
        return this.Get('IntervalDays');
    }
    set IntervalDays(value: number | null) {
        this.Set('IntervalDays', value);
    }

    /**
    * * Field Name: DayOfWeek
    * * Display Name: Day Of Week
    * * SQL Data Type: nvarchar(20)
    * * Description: Day of the week for the scheduled action
    */
    get DayOfWeek(): string | null {  
        return this.Get('DayOfWeek');
    }
    set DayOfWeek(value: string | null) {
        this.Set('DayOfWeek', value);
    }

    /**
    * * Field Name: DayOfMonth
    * * Display Name: Day Of Month
    * * SQL Data Type: int
    * * Description: Day of the month for the scheduled action
    */
    get DayOfMonth(): number | null {  
        return this.Get('DayOfMonth');
    }
    set DayOfMonth(value: number | null) {
        this.Set('DayOfMonth', value);
    }

    /**
    * * Field Name: Month
    * * Display Name: Month
    * * SQL Data Type: nvarchar(20)
    * * Description: Month for the scheduled action
    */
    get Month(): string | null {  
        return this.Get('Month');
    }
    set Month(value: string | null) {
        this.Set('Month', value);
    }

    /**
    * * Field Name: CustomCronExpression
    * * Display Name: Custom Cron Expression
    * * SQL Data Type: nvarchar(255)
    */
    get CustomCronExpression(): string | null {  
        return this.Get('CustomCronExpression');
    }
    set CustomCronExpression(value: string | null) {
        this.Set('CustomCronExpression', value);
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
    get CreatedByUser(): string {  
        return this.Get('CreatedByUser');
    }

    /**
    * * Field Name: Action
    * * Display Name: Action
    * * SQL Data Type: nvarchar(425)
    */
    get Action(): string {  
        return this.Get('Action');
    }
}

            
/**
 * Schema Info - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: SchemaInfo
 * * Base View: vwSchemaInfos
 * * @description Tracks the schemas in the system and the ID ranges that are valid for entities within each schema.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Schema Info')
export class SchemaInfoEntity extends BaseEntity<SchemaInfoEntityType> {
    /**
    * Loads the Schema Info record from the database
    * @param ID: string - primary key value to load the Schema Info record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof SchemaInfoEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Schema Info - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof SchemaInfoEntity
    * @throws {Error} - Delete is not allowed for Schema Info, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Schema Info, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: SchemaName
    * * Display Name: Schema Name
    * * SQL Data Type: nvarchar(50)
    */
    get SchemaName(): string {  
        return this.Get('SchemaName');
    }
    set SchemaName(value: string) {
        this.Set('SchemaName', value);
    }

    /**
    * * Field Name: EntityIDMin
    * * Display Name: Entity IDMin
    * * SQL Data Type: int
    */
    get EntityIDMin(): number {  
        return this.Get('EntityIDMin');
    }
    set EntityIDMin(value: number) {
        this.Set('EntityIDMin', value);
    }

    /**
    * * Field Name: EntityIDMax
    * * Display Name: Entity IDMax
    * * SQL Data Type: int
    */
    get EntityIDMax(): number {  
        return this.Get('EntityIDMax');
    }
    set EntityIDMax(value: number) {
        this.Set('EntityIDMax', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    */
    get Comments(): string | null {  
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
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
 * Skills - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Skill
 * * Base View: vwSkills
 * * @description A hierarchical list of possible skills that are linked to Employees and can also be linked to any other entity
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Skills')
export class SkillEntity extends BaseEntity<SkillEntityType> {
    /**
    * Loads the Skills record from the database
    * @param ID: string - primary key value to load the Skills record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof SkillEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Skills - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof SkillEntity
    * @throws {Error} - Save is not allowed for Skills, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for Skills, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }

    /**
    * Skills - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof SkillEntity
    * @throws {Error} - Delete is not allowed for Skills, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Skills, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: Name
    * * SQL Data Type: nvarchar(50)
    */
    get Name(): string {  
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Skills (vwSkills.ID)
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
    * * Field Name: Parent
    * * Display Name: Parent
    * * SQL Data Type: nvarchar(50)
    */
    get Parent(): string | null {  
        return this.Get('Parent');
    }
}

            
/**
 * Tagged Items - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: TaggedItem
 * * Base View: vwTaggedItems
 * * @description Tracks the links between any record in any entity with Tags
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Tagged Items')
export class TaggedItemEntity extends BaseEntity<TaggedItemEntityType> {
    /**
    * Loads the Tagged Items record from the database
    * @param ID: string - primary key value to load the Tagged Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TaggedItemEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Tagged Items - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof TaggedItemEntity
    * @throws {Error} - Save is not allowed for Tagged Items, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for Tagged Items, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
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
    * * Field Name: TagID
    * * Display Name: Tag ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Tags (vwTags.ID)
    */
    get TagID(): string {  
        return this.Get('TagID');
    }
    set TagID(value: string) {
        this.Set('TagID', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: RecordID
    * * Display Name: Record ID
    * * SQL Data Type: nvarchar(450)
    */
    get RecordID(): string {  
        return this.Get('RecordID');
    }
    set RecordID(value: string) {
        this.Set('RecordID', value);
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
    * * SQL Data Type: nvarchar(255)
    */
    get Tag(): string {  
        return this.Get('Tag');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }
}

            
/**
 * Tags - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Tag
 * * Base View: vwTags
 * * @description Tags are used to arbitrarily associate any record in any entity with addtional information.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Tags')
export class TagEntity extends BaseEntity<TagEntityType> {
    /**
    * Loads the Tags record from the database
    * @param ID: string - primary key value to load the Tags record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TagEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Tags - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof TagEntity
    * @throws {Error} - Save is not allowed for Tags, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for Tags, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }

    /**
    * Tags - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof TagEntity
    * @throws {Error} - Delete is not allowed for Tags, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Tags, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Tags (vwTags.ID)
    */
    get ParentID(): string | null {  
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: DisplayName
    * * Display Name: Display Name
    * * SQL Data Type: nvarchar(255)
    */
    get DisplayName(): string {  
        return this.Get('DisplayName');
    }
    set DisplayName(value: string) {
        this.Set('DisplayName', value);
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
    * * Field Name: Parent
    * * Display Name: Parent
    * * SQL Data Type: nvarchar(255)
    */
    get Parent(): string | null {  
        return this.Get('Parent');
    }
}

            
/**
 * Template Categories - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: TemplateCategory
 * * Base View: vwTemplateCategories
 * * @description Template categories for organizing templates
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Template Categories')
export class TemplateCategoryEntity extends BaseEntity<TemplateCategoryEntityType> {
    /**
    * Loads the Template Categories record from the database
    * @param ID: string - primary key value to load the Template Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TemplateCategoryEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Template Categories - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof TemplateCategoryEntity
    * @throws {Error} - Delete is not allowed for Template Categories, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Template Categories, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Description: Name of the template category
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
    * * Description: Description of the template category
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Template Categories (vwTemplateCategories.ID)
    */
    get ParentID(): string | null {  
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
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
    * * SQL Data Type: nvarchar(255)
    */
    get Parent(): string | null {  
        return this.Get('Parent');
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }
}

            
/**
 * Template Content Types - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: TemplateContentType
 * * Base View: vwTemplateContentTypes
 * * @description Template content types for categorizing content within templates
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Template Content Types')
export class TemplateContentTypeEntity extends BaseEntity<TemplateContentTypeEntityType> {
    /**
    * Loads the Template Content Types record from the database
    * @param ID: string - primary key value to load the Template Content Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TemplateContentTypeEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Template Content Types - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof TemplateContentTypeEntity
    * @throws {Error} - Delete is not allowed for Template Content Types, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Template Content Types, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Description: Name of the template content type
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
    * * Description: Description of the template content type
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: CodeType
    * * Display Name: Code Type
    * * SQL Data Type: nvarchar(25)
    * * Default Value: Other
    * * Value List Type: List
    * * Possible Values 
    *   * TypeScript
    *   * SQL
    *   * HTML
    *   * CSS
    *   * JavaScript
    *   * JSON
    *   * Other
    * * Description: Refers to the primary language or codetype of the templates of this type, HTML, JSON, JavaScript, etc
    */
    get CodeType(): 'TypeScript' | 'SQL' | 'HTML' | 'CSS' | 'JavaScript' | 'JSON' | 'Other' {  
        return this.Get('CodeType');
    }
    set CodeType(value: 'TypeScript' | 'SQL' | 'HTML' | 'CSS' | 'JavaScript' | 'JSON' | 'Other') {
        this.Set('CodeType', value);
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
 * Template Contents - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: TemplateContent
 * * Base View: vwTemplateContents
 * * @description Template content for different versions of a template for purposes like HTML/Text/etc
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Template Contents')
export class TemplateContentEntity extends BaseEntity<TemplateContentEntityType> {
    /**
    * Loads the Template Contents record from the database
    * @param ID: string - primary key value to load the Template Contents record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TemplateContentEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Template Contents - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof TemplateContentEntity
    * @throws {Error} - Delete is not allowed for Template Contents, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Template Contents, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: TemplateID
    * * Display Name: Template ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Templates (vwTemplates.ID)
    */
    get TemplateID(): string {  
        return this.Get('TemplateID');
    }
    set TemplateID(value: string) {
        this.Set('TemplateID', value);
    }

    /**
    * * Field Name: TypeID
    * * Display Name: Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Template Content Types (vwTemplateContentTypes.ID)
    */
    get TypeID(): string {  
        return this.Get('TypeID');
    }
    set TypeID(value: string) {
        this.Set('TypeID', value);
    }

    /**
    * * Field Name: TemplateText
    * * Display Name: Template Text
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The actual text content for the template
    */
    get TemplateText(): string | null {  
        return this.Get('TemplateText');
    }
    set TemplateText(value: string | null) {
        this.Set('TemplateText', value);
    }

    /**
    * * Field Name: Priority
    * * Display Name: Priority
    * * SQL Data Type: int
    * * Description: Priority of the content version, higher priority versions will be used ahead of lower priority versions for a given Type
    */
    get Priority(): number {  
        return this.Get('Priority');
    }
    set Priority(value: number) {
        this.Set('Priority', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: Indicates whether the content is active or not. Use this to disable a particular Template Content item without having to remove it
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
    * * Field Name: Template
    * * Display Name: Template
    * * SQL Data Type: nvarchar(255)
    */
    get Template(): string {  
        return this.Get('Template');
    }

    /**
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(255)
    */
    get Type(): string {  
        return this.Get('Type');
    }
}

            
/**
 * Template Params - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: TemplateParam
 * * Base View: vwTemplateParams
 * * @description Parameters allowed for use inside the template
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Template Params')
export class TemplateParamEntity extends BaseEntity<TemplateParamEntityType> {
    /**
    * Loads the Template Params record from the database
    * @param ID: string - primary key value to load the Template Params record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TemplateParamEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Template Params - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof TemplateParamEntity
    * @throws {Error} - Delete is not allowed for Template Params, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Template Params, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: TemplateID
    * * Display Name: Template ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Templates (vwTemplates.ID)
    */
    get TemplateID(): string {  
        return this.Get('TemplateID');
    }
    set TemplateID(value: string) {
        this.Set('TemplateID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Name of the parameter
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
    * * Description: Description of the parameter
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Scalar
    * * Value List Type: List
    * * Possible Values 
    *   * Scalar
    *   * Array
    *   * Object
    *   * Record
    *   * Entity
    * * Description: Type of the parameter - Record is an individual record within the entity specified by EntityID. Entity means an entire Entity or an entity filtered by the LinkedParameterName/Field attributes and/or ExtraFilter. Object is any valid JSON object. Array and Scalar have their common meanings.
    */
    get Type(): 'Scalar' | 'Array' | 'Object' | 'Record' | 'Entity' {  
        return this.Get('Type');
    }
    set Type(value: 'Scalar' | 'Array' | 'Object' | 'Record' | 'Entity') {
        this.Set('Type', value);
    }

    /**
    * * Field Name: DefaultValue
    * * Display Name: Default Value
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Default value of the parameter
    */
    get DefaultValue(): string | null {  
        return this.Get('DefaultValue');
    }
    set DefaultValue(value: string | null) {
        this.Set('DefaultValue', value);
    }

    /**
    * * Field Name: IsRequired
    * * Display Name: Is Required
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsRequired(): boolean {  
        return this.Get('IsRequired');
    }
    set IsRequired(value: boolean) {
        this.Set('IsRequired', value);
    }

    /**
    * * Field Name: LinkedParameterName
    * * Display Name: Linked Parameter Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Only used when Type=Entity, this is used to link an Entity parameter with another parameter so that the rows in the Entity parameter can be filtered automatically based on the FKEY relationship between the Record and this Entity parameter. For example, if the Entity-based parameter is for an entity like Activities and there is another parameter of type Record for an entity like Contacts, in that situation the Activities Parameter would point to the Contacts parameter as the LinkedParameterName because we would filter down the Activities in each template render to only those linked to the Contact.
    */
    get LinkedParameterName(): string | null {  
        return this.Get('LinkedParameterName');
    }
    set LinkedParameterName(value: string | null) {
        this.Set('LinkedParameterName', value);
    }

    /**
    * * Field Name: LinkedParameterField
    * * Display Name: Linked Parameter Field
    * * SQL Data Type: nvarchar(500)
    * * Description: If the LinkedParameterName is specified, this is an optional setting to specify the field within the LinkedParameter that will be used for filtering. This is only needed if there is more than one foreign key relationship between the Entity parameter and the Linked parameter, or if there is no defined foreign key in the database between the two entities.
    */
    get LinkedParameterField(): string | null {  
        return this.Get('LinkedParameterField');
    }
    set LinkedParameterField(value: string | null) {
        this.Set('LinkedParameterField', value);
    }

    /**
    * * Field Name: ExtraFilter
    * * Display Name: Extra Filter
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Only used when Type = Entity, used to specify an optional filter to reduce the set of rows that are returned for each of the templates being rendered.
    */
    get ExtraFilter(): string | null {  
        return this.Get('ExtraFilter');
    }
    set ExtraFilter(value: string | null) {
        this.Set('ExtraFilter', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string | null {  
        return this.Get('EntityID');
    }
    set EntityID(value: string | null) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: RecordID
    * * Display Name: Record ID
    * * SQL Data Type: nvarchar(2000)
    * * Description: Record ID, used only when Type is Record and a specific hardcoded record ID is desired, this is an uncommon use case, helpful for pulling in static types and metadata in some cases.
    */
    get RecordID(): string | null {  
        return this.Get('RecordID');
    }
    set RecordID(value: string | null) {
        this.Set('RecordID', value);
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
    * * Field Name: Template
    * * Display Name: Template
    * * SQL Data Type: nvarchar(255)
    */
    get Template(): string {  
        return this.Get('Template');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string | null {  
        return this.Get('Entity');
    }
}

            
/**
 * Templates - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Template
 * * Base View: vwTemplates
 * * @description Templates are used for dynamic expansion of a static template with data from a given context. Templates can be used to create documents, messages and anything else that requires dynamic document creation merging together static text, data and lightweight logic
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Templates')
export class TemplateEntity extends BaseEntity<TemplateEntityType> {
    /**
    * Loads the Templates record from the database
    * @param ID: string - primary key value to load the Templates record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof TemplateEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Templates - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof TemplateEntity
    * @throws {Error} - Delete is not allowed for Templates, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Templates, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Description: Name of the template
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
    * * Description: Description of the template
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
    * * Related Entity/Foreign Key: Template Categories (vwTemplateCategories.ID)
    */
    get CategoryID(): string | null {  
        return this.Get('CategoryID');
    }
    set CategoryID(value: string | null) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: UserPrompt
    * * Display Name: User Prompt
    * * SQL Data Type: nvarchar(MAX)
    * * Description: This prompt will be used by the AI to generate template content as requested by the user.
    */
    get UserPrompt(): string | null {  
        return this.Get('UserPrompt');
    }
    set UserPrompt(value: string | null) {
        this.Set('UserPrompt', value);
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: ActiveAt
    * * Display Name: Active At
    * * SQL Data Type: datetime
    * * Description: Optional, if provided, this template will not be available for use until the specified date. Requires IsActive to be set to 1
    */
    get ActiveAt(): Date | null {  
        return this.Get('ActiveAt');
    }
    set ActiveAt(value: Date | null) {
        this.Set('ActiveAt', value);
    }

    /**
    * * Field Name: DisabledAt
    * * Display Name: Disabled At
    * * SQL Data Type: datetime
    * * Description: Optional, if provided, this template will not be available for use after the specified date. If IsActive=0, this has no effect.
    */
    get DisabledAt(): Date | null {  
        return this.Get('DisabledAt');
    }
    set DisabledAt(value: Date | null) {
        this.Set('DisabledAt', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: If set to 0, the template will be disabled regardless of the values in ActiveAt/DisabledAt. 
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
    * * Field Name: Category
    * * Display Name: Category
    * * SQL Data Type: nvarchar(255)
    */
    get Category(): string | null {  
        return this.Get('Category');
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }
}

            
/**
 * User Application Entities - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: UserApplicationEntity
 * * Base View: vwUserApplicationEntities
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'User Application Entities')
export class UserApplicationEntityEntity extends BaseEntity<UserApplicationEntityEntityType> {
    /**
    * Loads the User Application Entities record from the database
    * @param ID: string - primary key value to load the User Application Entities record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof UserApplicationEntityEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: UserApplicationID
    * * Display Name: UserApplication ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: User Applications (vwUserApplications.ID)
    */
    get UserApplicationID(): string {  
        return this.Get('UserApplicationID');
    }
    set UserApplicationID(value: string) {
        this.Set('UserApplicationID', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get Sequence(): number {  
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
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
    * * Field Name: Application
    * * Display Name: Application
    * * SQL Data Type: nvarchar(100)
    */
    get Application(): string {  
        return this.Get('Application');
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }
}

            
/**
 * User Applications - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: UserApplication
 * * Base View: vwUserApplications
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'User Applications')
export class UserApplicationEntity extends BaseEntity<UserApplicationEntityType> {
    /**
    * Loads the User Applications record from the database
    * @param ID: string - primary key value to load the User Applications record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof UserApplicationEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: ApplicationID
    * * Display Name: Application ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Applications (vwApplications.ID)
    */
    get ApplicationID(): string {  
        return this.Get('ApplicationID');
    }
    set ApplicationID(value: string) {
        this.Set('ApplicationID', value);
    }

    /**
    * * Field Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get Sequence(): number {  
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
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
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }

    /**
    * * Field Name: Application
    * * Display Name: Application
    * * SQL Data Type: nvarchar(100)
    */
    get Application(): string {  
        return this.Get('Application');
    }
}

            
/**
 * User Favorites - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: UserFavorite
 * * Base View: vwUserFavorites
 * * @description Records that each user can mark as a favorite for easy access
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'User Favorites')
export class UserFavoriteEntity extends BaseEntity<UserFavoriteEntityType> {
    /**
    * Loads the User Favorites record from the database
    * @param ID: string - primary key value to load the User Favorites record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof UserFavoriteEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: RecordID
    * * Display Name: Record
    * * SQL Data Type: nvarchar(450)
    */
    get RecordID(): string {  
        return this.Get('RecordID');
    }
    set RecordID(value: string) {
        this.Set('RecordID', value);
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
    * * Field Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: EntityBaseTable
    * * Display Name: Entity Base Table
    * * SQL Data Type: nvarchar(255)
    */
    get EntityBaseTable(): string {  
        return this.Get('EntityBaseTable');
    }

    /**
    * * Field Name: EntityBaseView
    * * Display Name: Entity Base View
    * * SQL Data Type: nvarchar(255)
    */
    get EntityBaseView(): string {  
        return this.Get('EntityBaseView');
    }
}

            
/**
 * User Notifications - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: UserNotification
 * * Base View: vwUserNotifications
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'User Notifications')
export class UserNotificationEntity extends BaseEntity<UserNotificationEntityType> {
    /**
    * Loads the User Notifications record from the database
    * @param ID: string - primary key value to load the User Notifications record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof UserNotificationEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(255)
    */
    get Title(): string | null {  
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Message
    * * Display Name: Message
    * * SQL Data Type: nvarchar(MAX)
    */
    get Message(): string | null {  
        return this.Get('Message');
    }
    set Message(value: string | null) {
        this.Set('Message', value);
    }

    /**
    * * Field Name: ResourceTypeID
    * * Display Name: Resource Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Resource Types (vwResourceTypes.ID)
    */
    get ResourceTypeID(): string | null {  
        return this.Get('ResourceTypeID');
    }
    set ResourceTypeID(value: string | null) {
        this.Set('ResourceTypeID', value);
    }

    /**
    * * Field Name: ResourceConfiguration
    * * Display Name: Resource Configuration
    * * SQL Data Type: nvarchar(MAX)
    */
    get ResourceConfiguration(): string | null {  
        return this.Get('ResourceConfiguration');
    }
    set ResourceConfiguration(value: string | null) {
        this.Set('ResourceConfiguration', value);
    }

    /**
    * * Field Name: Unread
    * * Display Name: Unread
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get Unread(): boolean {  
        return this.Get('Unread');
    }
    set Unread(value: boolean) {
        this.Set('Unread', value);
    }

    /**
    * * Field Name: ReadAt
    * * Display Name: Read At
    * * SQL Data Type: datetime
    */
    get ReadAt(): Date | null {  
        return this.Get('ReadAt');
    }
    set ReadAt(value: Date | null) {
        this.Set('ReadAt', value);
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
    * * Field Name: ResourceRecordID
    * * Display Name: Resource Record ID
    * * SQL Data Type: uniqueidentifier
    */
    get ResourceRecordID(): string | null {  
        return this.Get('ResourceRecordID');
    }
    set ResourceRecordID(value: string | null) {
        this.Set('ResourceRecordID', value);
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }

    /**
    * * Field Name: ResourceType
    * * Display Name: Resource Type
    * * SQL Data Type: nvarchar(255)
    */
    get ResourceType(): string | null {  
        return this.Get('ResourceType');
    }
}

            
/**
 * User Record Logs - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: UserRecordLog
 * * Base View: vwUserRecordLogs
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'User Record Logs')
export class UserRecordLogEntity extends BaseEntity<UserRecordLogEntityType> {
    /**
    * Loads the User Record Logs record from the database
    * @param ID: string - primary key value to load the User Record Logs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof UserRecordLogEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * User Record Logs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof UserRecordLogEntity
    * @throws {Error} - Delete is not allowed for User Record Logs, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for User Record Logs, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: RecordID
    * * Display Name: Record
    * * SQL Data Type: nvarchar(450)
    */
    get RecordID(): string {  
        return this.Get('RecordID');
    }
    set RecordID(value: string) {
        this.Set('RecordID', value);
    }

    /**
    * * Field Name: EarliestAt
    * * Display Name: Earliest At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get EarliestAt(): Date {  
        return this.Get('EarliestAt');
    }
    set EarliestAt(value: Date) {
        this.Set('EarliestAt', value);
    }

    /**
    * * Field Name: LatestAt
    * * Display Name: Latest At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get LatestAt(): Date {  
        return this.Get('LatestAt');
    }
    set LatestAt(value: Date) {
        this.Set('LatestAt', value);
    }

    /**
    * * Field Name: TotalCount
    * * Display Name: Total Count
    * * SQL Data Type: int
    * * Default Value: 0
    */
    get TotalCount(): number {  
        return this.Get('TotalCount');
    }
    set TotalCount(value: number) {
        this.Set('TotalCount', value);
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
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: UserName
    * * Display Name: User Name
    * * SQL Data Type: nvarchar(100)
    */
    get UserName(): string {  
        return this.Get('UserName');
    }

    /**
    * * Field Name: UserFirstLast
    * * Display Name: User First Last
    * * SQL Data Type: nvarchar(101)
    */
    get UserFirstLast(): string | null {  
        return this.Get('UserFirstLast');
    }

    /**
    * * Field Name: UserEmail
    * * Display Name: User Email
    * * SQL Data Type: nvarchar(100)
    */
    get UserEmail(): string {  
        return this.Get('UserEmail');
    }

    /**
    * * Field Name: UserSupervisor
    * * Display Name: User Supervisor
    * * SQL Data Type: nvarchar(81)
    */
    get UserSupervisor(): string | null {  
        return this.Get('UserSupervisor');
    }

    /**
    * * Field Name: UserSupervisorEmail
    * * Display Name: User Supervisor Email
    * * SQL Data Type: nvarchar(100)
    */
    get UserSupervisorEmail(): string | null {  
        return this.Get('UserSupervisorEmail');
    }
}

            
/**
 * User Roles - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: UserRole
 * * Base View: vwUserRoles
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'User Roles')
export class UserRoleEntity extends BaseEntity<UserRoleEntityType> {
    /**
    * Loads the User Roles record from the database
    * @param ID: string - primary key value to load the User Roles record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof UserRoleEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: RoleID
    * * Display Name: Role ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Roles (vwRoles.ID)
    */
    get RoleID(): string {  
        return this.Get('RoleID');
    }
    set RoleID(value: string) {
        this.Set('RoleID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(50)
    */
    get Role(): string {  
        return this.Get('Role');
    }
}

            
/**
 * User View Categories - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: UserViewCategory
 * * Base View: vwUserViewCategories
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'User View Categories')
export class UserViewCategoryEntity extends BaseEntity<UserViewCategoryEntityType> {
    /**
    * Loads the User View Categories record from the database
    * @param ID: string - primary key value to load the User View Categories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof UserViewCategoryEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ParentID
    * * Display Name: Parent ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: User View Categories (vwUserViewCategories.ID)
    */
    get ParentID(): string | null {  
        return this.Get('ParentID');
    }
    set ParentID(value: string | null) {
        this.Set('ParentID', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
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
    * * SQL Data Type: nvarchar(100)
    */
    get Parent(): string | null {  
        return this.Get('Parent');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }
}

            
/**
 * User View Run Details - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: UserViewRunDetail
 * * Base View: vwUserViewRunDetails
 * * @description Tracks the set of records that were included in each run of a given user view.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'User View Run Details')
export class UserViewRunDetailEntity extends BaseEntity<UserViewRunDetailEntityType> {
    /**
    * Loads the User View Run Details record from the database
    * @param ID: string - primary key value to load the User View Run Details record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof UserViewRunDetailEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * User View Run Details - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof UserViewRunDetailEntity
    * @throws {Error} - Delete is not allowed for User View Run Details, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for User View Run Details, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: UserViewRunID
    * * Display Name: User View Run ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: User View Runs (vwUserViewRuns.ID)
    */
    get UserViewRunID(): string {  
        return this.Get('UserViewRunID');
    }
    set UserViewRunID(value: string) {
        this.Set('UserViewRunID', value);
    }

    /**
    * * Field Name: RecordID
    * * Display Name: Record
    * * SQL Data Type: nvarchar(450)
    */
    get RecordID(): string {  
        return this.Get('RecordID');
    }
    set RecordID(value: string) {
        this.Set('RecordID', value);
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
    * * Field Name: UserViewID
    * * Display Name: User View
    * * SQL Data Type: uniqueidentifier
    */
    get UserViewID(): string {  
        return this.Get('UserViewID');
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity
    * * SQL Data Type: uniqueidentifier
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
}

            
/**
 * User View Runs - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: UserViewRun
 * * Base View: vwUserViewRuns
 * * @description User Views can be logged when run to capture the date and user that ran the view as well as the output results.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'User View Runs')
export class UserViewRunEntity extends BaseEntity<UserViewRunEntityType> {
    /**
    * Loads the User View Runs record from the database
    * @param ID: string - primary key value to load the User View Runs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof UserViewRunEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * User View Runs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof UserViewRunEntity
    * @throws {Error} - Delete is not allowed for User View Runs, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for User View Runs, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: UserViewID
    * * Display Name: User View ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: User Views (vwUserViews.ID)
    */
    get UserViewID(): string {  
        return this.Get('UserViewID');
    }
    set UserViewID(value: string) {
        this.Set('UserViewID', value);
    }

    /**
    * * Field Name: RunAt
    * * Display Name: Run At
    * * SQL Data Type: datetime
    */
    get RunAt(): Date {  
        return this.Get('RunAt');
    }
    set RunAt(value: Date) {
        this.Set('RunAt', value);
    }

    /**
    * * Field Name: RunByUserID
    * * Display Name: Run By User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get RunByUserID(): string {  
        return this.Get('RunByUserID');
    }
    set RunByUserID(value: string) {
        this.Set('RunByUserID', value);
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
    * * Field Name: UserView
    * * Display Name: User View
    * * SQL Data Type: nvarchar(100)
    */
    get UserView(): string {  
        return this.Get('UserView');
    }

    /**
    * * Field Name: RunByUser
    * * Display Name: Run By User
    * * SQL Data Type: nvarchar(100)
    */
    get RunByUser(): string {  
        return this.Get('RunByUser');
    }
}

            
/**
 * User Views - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: UserView
 * * Base View: vwUserViews
 * * @description Views are sets of records within a given entity defined by filtering rules. Views can be used programatically to retrieve dynamic sets of data and in user interfaces like MJ Explorer for end-user consumption.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'User Views')
export class UserViewEntity extends BaseEntity<UserViewEntityType> {
    /**
    * Loads the User Views record from the database
    * @param ID: string - primary key value to load the User Views record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof UserViewEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get EntityID(): string {  
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: Name
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
    * * Related Entity/Foreign Key: User View Categories (vwUserViewCategories.ID)
    */
    get CategoryID(): string | null {  
        return this.Get('CategoryID');
    }
    set CategoryID(value: string | null) {
        this.Set('CategoryID', value);
    }

    /**
    * * Field Name: IsShared
    * * Display Name: Is Shared
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsShared(): boolean {  
        return this.Get('IsShared');
    }
    set IsShared(value: boolean) {
        this.Set('IsShared', value);
    }

    /**
    * * Field Name: IsDefault
    * * Display Name: Is Default
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsDefault(): boolean {  
        return this.Get('IsDefault');
    }
    set IsDefault(value: boolean) {
        this.Set('IsDefault', value);
    }

    /**
    * * Field Name: GridState
    * * Display Name: Grid State
    * * SQL Data Type: nvarchar(MAX)
    */
    get GridState(): string | null {  
        return this.Get('GridState');
    }
    set GridState(value: string | null) {
        this.Set('GridState', value);
    }

    /**
    * * Field Name: FilterState
    * * Display Name: Filter State
    * * SQL Data Type: nvarchar(MAX)
    */
    get FilterState(): string | null {  
        return this.Get('FilterState');
    }
    set FilterState(value: string | null) {
        this.Set('FilterState', value);
    }

    /**
    * * Field Name: CustomFilterState
    * * Display Name: Custom Filter State
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get CustomFilterState(): boolean {  
        return this.Get('CustomFilterState');
    }
    set CustomFilterState(value: boolean) {
        this.Set('CustomFilterState', value);
    }

    /**
    * * Field Name: SmartFilterEnabled
    * * Display Name: Smart Filter Enabled
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get SmartFilterEnabled(): boolean {  
        return this.Get('SmartFilterEnabled');
    }
    set SmartFilterEnabled(value: boolean) {
        this.Set('SmartFilterEnabled', value);
    }

    /**
    * * Field Name: SmartFilterPrompt
    * * Display Name: Smart Filter Prompt
    * * SQL Data Type: nvarchar(MAX)
    */
    get SmartFilterPrompt(): string | null {  
        return this.Get('SmartFilterPrompt');
    }
    set SmartFilterPrompt(value: string | null) {
        this.Set('SmartFilterPrompt', value);
    }

    /**
    * * Field Name: SmartFilterWhereClause
    * * Display Name: Smart Filter Where Clause
    * * SQL Data Type: nvarchar(MAX)
    */
    get SmartFilterWhereClause(): string | null {  
        return this.Get('SmartFilterWhereClause');
    }
    set SmartFilterWhereClause(value: string | null) {
        this.Set('SmartFilterWhereClause', value);
    }

    /**
    * * Field Name: SmartFilterExplanation
    * * Display Name: Smart Filter Explanation
    * * SQL Data Type: nvarchar(MAX)
    */
    get SmartFilterExplanation(): string | null {  
        return this.Get('SmartFilterExplanation');
    }
    set SmartFilterExplanation(value: string | null) {
        this.Set('SmartFilterExplanation', value);
    }

    /**
    * * Field Name: WhereClause
    * * Display Name: Where Clause
    * * SQL Data Type: nvarchar(MAX)
    */
    get WhereClause(): string | null {  
        return this.Get('WhereClause');
    }
    set WhereClause(value: string | null) {
        this.Set('WhereClause', value);
    }

    /**
    * * Field Name: CustomWhereClause
    * * Display Name: Custom Where Clause
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get CustomWhereClause(): boolean {  
        return this.Get('CustomWhereClause');
    }
    set CustomWhereClause(value: boolean) {
        this.Set('CustomWhereClause', value);
    }

    /**
    * * Field Name: SortState
    * * Display Name: Sort State
    * * SQL Data Type: nvarchar(MAX)
    */
    get SortState(): string | null {  
        return this.Get('SortState');
    }
    set SortState(value: string | null) {
        this.Set('SortState', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: UserName
    * * Display Name: User Name
    * * SQL Data Type: nvarchar(100)
    */
    get UserName(): string {  
        return this.Get('UserName');
    }

    /**
    * * Field Name: UserFirstLast
    * * Display Name: User First Last
    * * SQL Data Type: nvarchar(101)
    */
    get UserFirstLast(): string | null {  
        return this.Get('UserFirstLast');
    }

    /**
    * * Field Name: UserEmail
    * * Display Name: User Email
    * * SQL Data Type: nvarchar(100)
    */
    get UserEmail(): string {  
        return this.Get('UserEmail');
    }

    /**
    * * Field Name: UserType
    * * Display Name: User Type
    * * SQL Data Type: nchar(15)
    */
    get UserType(): string {  
        return this.Get('UserType');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {  
        return this.Get('Entity');
    }

    /**
    * * Field Name: EntityBaseView
    * * Display Name: Entity Base View
    * * SQL Data Type: nvarchar(255)
    */
    get EntityBaseView(): string {  
        return this.Get('EntityBaseView');
    }
}

            
/**
 * Users - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: User
 * * Base View: vwUsers
 * * @description A list of all users who have or had access to the system
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Users')
export class UserEntity extends BaseEntity<UserEntityType> {
    /**
    * Loads the Users record from the database
    * @param ID: string - primary key value to load the Users record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof UserEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: Name
    * * SQL Data Type: nvarchar(100)
    */
    get Name(): string {  
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: FirstName
    * * Display Name: First Name
    * * SQL Data Type: nvarchar(50)
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
    * * SQL Data Type: nvarchar(50)
    */
    get LastName(): string | null {  
        return this.Get('LastName');
    }
    set LastName(value: string | null) {
        this.Set('LastName', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(50)
    */
    get Title(): string | null {  
        return this.Get('Title');
    }
    set Title(value: string | null) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Email
    * * SQL Data Type: nvarchar(100)
    */
    get Email(): string {  
        return this.Get('Email');
    }
    set Email(value: string) {
        this.Set('Email', value);
    }

    /**
    * * Field Name: Type
    * * SQL Data Type: nchar(15)
    * * Value List Type: List
    * * Possible Values 
    *   * User
    *   * Owner
    */
    get Type(): 'User' | 'Owner' {  
        return this.Get('Type');
    }
    set Type(value: 'User' | 'Owner') {
        this.Set('Type', value);
    }

    /**
    * * Field Name: IsActive
    * * Display Name: Is Active
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsActive(): boolean {  
        return this.Get('IsActive');
    }
    set IsActive(value: boolean) {
        this.Set('IsActive', value);
    }

    /**
    * * Field Name: LinkedRecordType
    * * Display Name: Linked Record Type
    * * SQL Data Type: nchar(10)
    * * Default Value: None
    */
    get LinkedRecordType(): string {  
        return this.Get('LinkedRecordType');
    }
    set LinkedRecordType(value: string) {
        this.Set('LinkedRecordType', value);
    }

    /**
    * * Field Name: LinkedEntityID
    * * Display Name: Linked Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Entities (vwEntities.ID)
    */
    get LinkedEntityID(): string | null {  
        return this.Get('LinkedEntityID');
    }
    set LinkedEntityID(value: string | null) {
        this.Set('LinkedEntityID', value);
    }

    /**
    * * Field Name: LinkedEntityRecordID
    * * Display Name: Linked Entity Record ID
    * * SQL Data Type: nvarchar(450)
    */
    get LinkedEntityRecordID(): string | null {  
        return this.Get('LinkedEntityRecordID');
    }
    set LinkedEntityRecordID(value: string | null) {
        this.Set('LinkedEntityRecordID', value);
    }

    /**
    * * Field Name: EmployeeID
    * * Display Name: Employee
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Employees (vwEmployees.ID)
    */
    get EmployeeID(): string | null {  
        return this.Get('EmployeeID');
    }
    set EmployeeID(value: string | null) {
        this.Set('EmployeeID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: __mj _Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {  
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: __mj _Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {  
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: FirstLast
    * * Display Name: First Last
    * * SQL Data Type: nvarchar(101)
    */
    get FirstLast(): string | null {  
        return this.Get('FirstLast');
    }

    /**
    * * Field Name: EmployeeFirstLast
    * * Display Name: Employee First Last
    * * SQL Data Type: nvarchar(81)
    */
    get EmployeeFirstLast(): string | null {  
        return this.Get('EmployeeFirstLast');
    }

    /**
    * * Field Name: EmployeeEmail
    * * Display Name: Employee Email
    * * SQL Data Type: nvarchar(100)
    */
    get EmployeeEmail(): string | null {  
        return this.Get('EmployeeEmail');
    }

    /**
    * * Field Name: EmployeeTitle
    * * Display Name: Employee Title
    * * SQL Data Type: nvarchar(50)
    */
    get EmployeeTitle(): string | null {  
        return this.Get('EmployeeTitle');
    }

    /**
    * * Field Name: EmployeeSupervisor
    * * Display Name: Employee Supervisor
    * * SQL Data Type: nvarchar(81)
    */
    get EmployeeSupervisor(): string | null {  
        return this.Get('EmployeeSupervisor');
    }

    /**
    * * Field Name: EmployeeSupervisorEmail
    * * Display Name: Employee Supervisor Email
    * * SQL Data Type: nvarchar(100)
    */
    get EmployeeSupervisorEmail(): string | null {  
        return this.Get('EmployeeSupervisorEmail');
    }
}

            
/**
 * Vector Databases - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: VectorDatabase
 * * Base View: vwVectorDatabases
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Vector Databases')
export class VectorDatabaseEntity extends BaseEntity<VectorDatabaseEntityType> {
    /**
    * Loads the Vector Databases record from the database
    * @param ID: string - primary key value to load the Vector Databases record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof VectorDatabaseEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Vector Databases - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof VectorDatabaseEntity
    * @throws {Error} - Delete is not allowed for Vector Databases, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Vector Databases, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: DefaultURL
    * * Display Name: Default URL
    * * SQL Data Type: nvarchar(255)
    */
    get DefaultURL(): string | null {  
        return this.Get('DefaultURL');
    }
    set DefaultURL(value: string | null) {
        this.Set('DefaultURL', value);
    }

    /**
    * * Field Name: ClassKey
    * * Display Name: Class Key
    * * SQL Data Type: nvarchar(100)
    */
    get ClassKey(): string | null {  
        return this.Get('ClassKey');
    }
    set ClassKey(value: string | null) {
        this.Set('ClassKey', value);
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
 * Vector Indexes - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: VectorIndex
 * * Base View: vwVectorIndexes
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Vector Indexes')
export class VectorIndexEntity extends BaseEntity<VectorIndexEntityType> {
    /**
    * Loads the Vector Indexes record from the database
    * @param ID: string - primary key value to load the Vector Indexes record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof VectorIndexEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Vector Indexes - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof VectorIndexEntity
    * @throws {Error} - Delete is not allowed for Vector Indexes, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Vector Indexes, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: VectorDatabaseID
    * * Display Name: Vector Database ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Vector Databases (vwVectorDatabases.ID)
    */
    get VectorDatabaseID(): string {  
        return this.Get('VectorDatabaseID');
    }
    set VectorDatabaseID(value: string) {
        this.Set('VectorDatabaseID', value);
    }

    /**
    * * Field Name: EmbeddingModelID
    * * Display Name: Embedding Model ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: AI Models (vwAIModels.ID)
    */
    get EmbeddingModelID(): string {  
        return this.Get('EmbeddingModelID');
    }
    set EmbeddingModelID(value: string) {
        this.Set('EmbeddingModelID', value);
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
    * * Field Name: VectorDatabase
    * * Display Name: Vector Database
    * * SQL Data Type: nvarchar(100)
    */
    get VectorDatabase(): string {  
        return this.Get('VectorDatabase');
    }

    /**
    * * Field Name: EmbeddingModel
    * * Display Name: Embedding Model
    * * SQL Data Type: nvarchar(50)
    */
    get EmbeddingModel(): string {  
        return this.Get('EmbeddingModel');
    }
}

            
/**
 * Version Installations - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: VersionInstallation
 * * Base View: vwVersionInstallations
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Version Installations')
export class VersionInstallationEntity extends BaseEntity<VersionInstallationEntityType> {
    /**
    * Loads the Version Installations record from the database
    * @param ID: string - primary key value to load the Version Installations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof VersionInstallationEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Version Installations - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof VersionInstallationEntity
    * @throws {Error} - Delete is not allowed for Version Installations, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Version Installations, to enable it set AllowDeleteAPI to 1 in the database.');
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
    * * Field Name: MajorVersion
    * * Display Name: Major Version
    * * SQL Data Type: int
    */
    get MajorVersion(): number {  
        return this.Get('MajorVersion');
    }
    set MajorVersion(value: number) {
        this.Set('MajorVersion', value);
    }

    /**
    * * Field Name: MinorVersion
    * * Display Name: Minor Version
    * * SQL Data Type: int
    */
    get MinorVersion(): number {  
        return this.Get('MinorVersion');
    }
    set MinorVersion(value: number) {
        this.Set('MinorVersion', value);
    }

    /**
    * * Field Name: PatchVersion
    * * Display Name: Patch Version
    * * SQL Data Type: int
    */
    get PatchVersion(): number {  
        return this.Get('PatchVersion');
    }
    set PatchVersion(value: number) {
        this.Set('PatchVersion', value);
    }

    /**
    * * Field Name: Type
    * * Display Name: Type
    * * SQL Data Type: nvarchar(20)
    * * Default Value: System
    * * Value List Type: List
    * * Possible Values 
    *   * New
    *   * Upgrade
    * * Description: What type of installation was applied
    */
    get Type(): 'New' | 'Upgrade' | null {  
        return this.Get('Type');
    }
    set Type(value: 'New' | 'Upgrade' | null) {
        this.Set('Type', value);
    }

    /**
    * * Field Name: InstalledAt
    * * Display Name: Installed At
    * * SQL Data Type: datetime
    */
    get InstalledAt(): Date {  
        return this.Get('InstalledAt');
    }
    set InstalledAt(value: Date) {
        this.Set('InstalledAt', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * In Progress
    *   * Complete
    *   * Failed
    * * Description: Pending, Complete, Failed
    */
    get Status(): 'Pending' | 'In Progress' | 'Complete' | 'Failed' {  
        return this.Get('Status');
    }
    set Status(value: 'Pending' | 'In Progress' | 'Complete' | 'Failed') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: InstallLog
    * * Display Name: Install Log
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Any logging that was saved from the installation process
    */
    get InstallLog(): string | null {  
        return this.Get('InstallLog');
    }
    set InstallLog(value: string | null) {
        this.Set('InstallLog', value);
    }

    /**
    * * Field Name: Comments
    * * Display Name: Comments
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Optional, comments the administrator wants to save for each installed version
    */
    get Comments(): string | null {  
        return this.Get('Comments');
    }
    set Comments(value: string | null) {
        this.Set('Comments', value);
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
    * * Field Name: CompleteVersion
    * * Display Name: Complete Version
    * * SQL Data Type: nvarchar(302)
    */
    get CompleteVersion(): string | null {  
        return this.Get('CompleteVersion');
    }
}

            
/**
 * Workflow Engines - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: WorkflowEngine
 * * Base View: vwWorkflowEngines
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Workflow Engines')
export class WorkflowEngineEntity extends BaseEntity<WorkflowEngineEntityType> {
    /**
    * Loads the Workflow Engines record from the database
    * @param ID: string - primary key value to load the Workflow Engines record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof WorkflowEngineEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Workflow Engines - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof WorkflowEngineEntity
    * @throws {Error} - Delete is not allowed for Workflow Engines, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Workflow Engines, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: Name
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
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: DriverPath
    * * Display Name: Driver Path
    * * SQL Data Type: nvarchar(500)
    */
    get DriverPath(): string {  
        return this.Get('DriverPath');
    }
    set DriverPath(value: string) {
        this.Set('DriverPath', value);
    }

    /**
    * * Field Name: DriverClass
    * * Display Name: Driver Class
    * * SQL Data Type: nvarchar(100)
    */
    get DriverClass(): string {  
        return this.Get('DriverClass');
    }
    set DriverClass(value: string) {
        this.Set('DriverClass', value);
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
 * Workflow Runs - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: WorkflowRun
 * * Base View: vwWorkflowRuns
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Workflow Runs')
export class WorkflowRunEntity extends BaseEntity<WorkflowRunEntityType> {
    /**
    * Loads the Workflow Runs record from the database
    * @param ID: string - primary key value to load the Workflow Runs record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof WorkflowRunEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Workflow Runs - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof WorkflowRunEntity
    * @throws {Error} - Delete is not allowed for Workflow Runs, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Workflow Runs, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: WorkflowID
    * * Display Name: Workflow ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Workflows (vwWorkflows.ID)
    */
    get WorkflowID(): string {  
        return this.Get('WorkflowID');
    }
    set WorkflowID(value: string) {
        this.Set('WorkflowID', value);
    }

    /**
    * * Field Name: ExternalSystemRecordID
    * * Display Name: External System Record
    * * SQL Data Type: nvarchar(500)
    */
    get ExternalSystemRecordID(): string {  
        return this.Get('ExternalSystemRecordID');
    }
    set ExternalSystemRecordID(value: string) {
        this.Set('ExternalSystemRecordID', value);
    }

    /**
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetime
    */
    get StartedAt(): Date {  
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: EndedAt
    * * Display Name: Ended At
    * * SQL Data Type: datetime
    */
    get EndedAt(): Date | null {  
        return this.Get('EndedAt');
    }
    set EndedAt(value: Date | null) {
        this.Set('EndedAt', value);
    }

    /**
    * * Field Name: Status
    * * SQL Data Type: nchar(10)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Pending
    *   * In Progress
    *   * Complete
    *   * Failed
    */
    get Status(): 'Pending' | 'In Progress' | 'Complete' | 'Failed' {  
        return this.Get('Status');
    }
    set Status(value: 'Pending' | 'In Progress' | 'Complete' | 'Failed') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Results
    * * SQL Data Type: nvarchar(MAX)
    */
    get Results(): string | null {  
        return this.Get('Results');
    }
    set Results(value: string | null) {
        this.Set('Results', value);
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
    * * Field Name: Workflow
    * * Display Name: Workflow
    * * SQL Data Type: nvarchar(100)
    */
    get Workflow(): string {  
        return this.Get('Workflow');
    }

    /**
    * * Field Name: WorkflowEngineName
    * * Display Name: Workflow Engine Name
    * * SQL Data Type: nvarchar(100)
    */
    get WorkflowEngineName(): string {  
        return this.Get('WorkflowEngineName');
    }
}

            
/**
 * Workflows - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Workflow
 * * Base View: vwWorkflows
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Workflows')
export class WorkflowEntity extends BaseEntity<WorkflowEntityType> {
    /**
    * Loads the Workflows record from the database
    * @param ID: string - primary key value to load the Workflows record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof WorkflowEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Workflows - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof WorkflowEntity
    * @throws {Error} - Delete is not allowed for Workflows, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for Workflows, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {  
        return this.Get('ID');
    }

    /**
    * * Field Name: Name
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
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {  
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: WorkflowEngineID
    * * Display Name: Workflow Engine ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Workflow Engines (vwWorkflowEngines.ID)
    */
    get WorkflowEngineID(): string {  
        return this.Get('WorkflowEngineID');
    }
    set WorkflowEngineID(value: string) {
        this.Set('WorkflowEngineID', value);
    }

    /**
    * * Field Name: ExternalSystemRecordID
    * * Display Name: External System Record
    * * SQL Data Type: nvarchar(100)
    */
    get ExternalSystemRecordID(): string {  
        return this.Get('ExternalSystemRecordID');
    }
    set ExternalSystemRecordID(value: string) {
        this.Set('ExternalSystemRecordID', value);
    }

    /**
    * * Field Name: AutoRunEnabled
    * * Display Name: Auto Run Enabled
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: If set to 1, the workflow will be run automatically on the interval specified by the AutoRunIntervalType and AutoRunInterval fields
    */
    get AutoRunEnabled(): boolean {  
        return this.Get('AutoRunEnabled');
    }
    set AutoRunEnabled(value: boolean) {
        this.Set('AutoRunEnabled', value);
    }

    /**
    * * Field Name: AutoRunIntervalUnits
    * * Display Name: Auto Run Interval Units
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Years
    *   * Months
    *   * Weeks
    *   * Days
    *   * Hours
    *   * Minutes
    * * Description: Minutes, Hours, Days, Weeks, Months, Years
    */
    get AutoRunIntervalUnits(): 'Years' | 'Months' | 'Weeks' | 'Days' | 'Hours' | 'Minutes' | null {  
        return this.Get('AutoRunIntervalUnits');
    }
    set AutoRunIntervalUnits(value: 'Years' | 'Months' | 'Weeks' | 'Days' | 'Hours' | 'Minutes' | null) {
        this.Set('AutoRunIntervalUnits', value);
    }

    /**
    * * Field Name: AutoRunInterval
    * * Display Name: Auto Run Interval
    * * SQL Data Type: int
    * * Description: The interval, denominated in the units specified in the AutoRunIntervalUnits column, between auto runs of this workflow.
    */
    get AutoRunInterval(): number | null {  
        return this.Get('AutoRunInterval');
    }
    set AutoRunInterval(value: number | null) {
        this.Set('AutoRunInterval', value);
    }

    /**
    * * Field Name: SubclassName
    * * Display Name: Subclass Name
    * * SQL Data Type: nvarchar(200)
    * * Description: If specified, this subclass key, via the ClassFactory, will be instantiated, to execute this workflow. If not specified the WorkflowBase class will be used by default.
    */
    get SubclassName(): string | null {  
        return this.Get('SubclassName');
    }
    set SubclassName(value: string | null) {
        this.Set('SubclassName', value);
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
    * * Field Name: AutoRunIntervalMinutes
    * * Display Name: Auto Run Interval Minutes
    * * SQL Data Type: int
    */
    get AutoRunIntervalMinutes(): number | null {  
        return this.Get('AutoRunIntervalMinutes');
    }
}

            
/**
 * Workspace Items - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: WorkspaceItem
 * * Base View: vwWorkspaceItems
 * * @description Tracks the resources that are active within a given worksapce
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Workspace Items')
export class WorkspaceItemEntity extends BaseEntity<WorkspaceItemEntityType> {
    /**
    * Loads the Workspace Items record from the database
    * @param ID: string - primary key value to load the Workspace Items record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof WorkspaceItemEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: WorkspaceID
    * * Display Name: Workspace ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Workspaces (vwWorkspaces.ID)
    */
    get WorkspaceID(): string {  
        return this.Get('WorkspaceID');
    }
    set WorkspaceID(value: string) {
        this.Set('WorkspaceID', value);
    }

    /**
    * * Field Name: ResourceTypeID
    * * Display Name: Resource Type ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Resource Types (vwResourceTypes.ID)
    */
    get ResourceTypeID(): string {  
        return this.Get('ResourceTypeID');
    }
    set ResourceTypeID(value: string) {
        this.Set('ResourceTypeID', value);
    }

    /**
    * * Field Name: ResourceRecordID
    * * Display Name: Resource Record ID
    * * SQL Data Type: nvarchar(2000)
    */
    get ResourceRecordID(): string | null {  
        return this.Get('ResourceRecordID');
    }
    set ResourceRecordID(value: string | null) {
        this.Set('ResourceRecordID', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    */
    get Sequence(): number {  
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: Configuration
    * * Display Name: Configuration
    * * SQL Data Type: nvarchar(MAX)
    */
    get Configuration(): string | null {  
        return this.Get('Configuration');
    }
    set Configuration(value: string | null) {
        this.Set('Configuration', value);
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
    * * Field Name: Workspace
    * * Display Name: Workspace
    * * SQL Data Type: nvarchar(255)
    */
    get Workspace(): string {  
        return this.Get('Workspace');
    }

    /**
    * * Field Name: ResourceType
    * * Display Name: Resource Type
    * * SQL Data Type: nvarchar(255)
    */
    get ResourceType(): string {  
        return this.Get('ResourceType');
    }
}

            
/**
 * Workspaces - strongly typed entity sub-class
 * * Schema: __mj
 * * Base Table: Workspace
 * * Base View: vwWorkspaces
 * * @description A user can have one or more workspaces
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Workspaces')
export class WorkspaceEntity extends BaseEntity<WorkspaceEntityType> {
    /**
    * Loads the Workspaces record from the database
    * @param ID: string - primary key value to load the Workspaces record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof WorkspaceEntity
    * @method
    * @override
    */      
    public async Load(ID: string, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
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
    * * Field Name: UserID
    * * Display Name: User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: Users (vwUsers.ID)
    */
    get UserID(): string {  
        return this.Get('UserID');
    }
    set UserID(value: string) {
        this.Set('UserID', value);
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
    * * Field Name: User
    * * Display Name: User
    * * SQL Data Type: nvarchar(100)
    */
    get User(): string {  
        return this.Get('User');
    }
}
