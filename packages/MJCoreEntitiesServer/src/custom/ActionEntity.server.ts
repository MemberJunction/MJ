import { BaseEntity, DatabaseProviderBase, EntityInfo, EntitySaveOptions, LogError, Metadata, RunView, IMetadataProvider } from "@memberjunction/core";
import { ActionLibraryEntity, ActionParamEntity, ActionResultCodeEntity } from "@memberjunction/core-entities";
import { MJEventType, MJGlobal, RegisterClass } from "@memberjunction/global";
import { AIEngine } from "@memberjunction/aiengine";

import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { DocumentationEngine, LibraryEntityExtended, LibraryItemEntityExtended } from "@memberjunction/doc-utils";
import { ActionEngineBase, ActionEntityExtended, ActionLibrary, GeneratedCode } from "@memberjunction/actions-base";

/**
 * Extended GeneratedCode interface to include parameters and result codes
 */
interface GeneratedCodeExtended extends GeneratedCode {
    Parameters?: Array<{
        Name: string;
        Type: 'Input' | 'Output' | 'Both';
        ValueType: 'Scalar' | 'Simple Object' | 'BaseEntity Sub-Class' | 'Other';
        IsArray: boolean;
        IsRequired: boolean;
        DefaultValue: string | null;
        Description: string;
    }>;
    ResultCodes?: Array<{
        ResultCode: string;
        Description: string;
        IsSuccess: boolean;
    }>;
}

/**
 * Server-Only custom sub-class for Actions entity. This sub-class handles the process of auto-generation code for the Actions entity.
 */
@RegisterClass(BaseEntity, 'Actions') // high priority make sure this class is used ahead of other things
export class ActionEntityServerEntity extends ActionEntityExtended {
    constructor(Entity: EntityInfo) {
        super(Entity); // call super

        // In constructor we must use new Metadata() since entity isn't fully initialized yet
        // This is an acceptable exception as it only checks provider type at construction time
        const md = new Metadata();
        if (md.ProviderType !== 'Database')
            throw new Error('This class is only supported for server-side/database providers. Remove this package from your application.');
    }

    
    /**
     * Override of the base Save method to handle the pre-processing to auto generate code whenever an action's UserPrompt is modified.
     * This happens when a new record is created and also whenever the UserPrompt field is changed.
     * @param options
     * @returns
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // make sure the ActionEngine is configured
        await ActionEngineBase.Instance.Config(false, this.ContextCurrentUser);
        await DocumentationEngine.Instance.Config(false, this.ContextCurrentUser);

        const provider = Metadata.Provider as DatabaseProviderBase;
        
        // Start a database transaction
        await provider.BeginTransaction();
        
        try {
            let newCodeGenerated: boolean = false;
            let codeLibraries: ActionLibrary[] = [];
            let generatedParameters: Array<any> = [];
            let generatedResultCodes: Array<any> = [];
            
            if ( this.Type === 'Generated' && // only generate when the type is Generated
                 !this.CodeLocked && // only generate when the code is not locked
                 (this.GetFieldByName('UserPrompt').Dirty || !this.IsSaved || this.ForceCodeGeneration)  // only generate when the UserPrompt field is dirty or this is a new record or we are being asked to FORCE code generation
               ) {
                // UserPrompt field is dirty, or this is a new record, either way, this is the condition where we want to generate the Code.
                const result = await this.GenerateCode();
                if (result.Success) {
                    this.Code = result.Code;
                    this.CodeComments = result.Comments;
                    this.CodeApprovalStatus = 'Pending'; // set to pending even if previously approved since we changed the code
                    this.CodeApprovedAt = null; // reset the approved at date
                    this.CodeApprovedByUserID = null; // reset the approved by user id
                    newCodeGenerated = true; // flag for post-save processing of libraries
                    codeLibraries = result.LibrariesUsed;
                    
                    // Store the generated parameters and result codes for later processing
                    generatedParameters = result.Parameters || [];
                    generatedResultCodes = result.ResultCodes || [];
                }
                else
                    throw new Error(`Failed to generate code for Action ${this.Name}.`);
            }

            this.ForceCodeGeneration = false; // make sure to reset this flag every time we save, it should never live past one run of the Save method
            const wasNewRecord = !this.IsSaved;
            
            if (await super.Save(options)) {
                // Now handle all the child entities within the same transaction
                if (newCodeGenerated) {
                    // Process libraries
                    await this.manageLibraries(codeLibraries, wasNewRecord);
                    
                    // Process parameters 
                    if (generatedParameters.length > 0) {
                        await this.ProcessGeneratedParameters(generatedParameters);
                    }
                    
                    // Process result codes
                    if (generatedResultCodes.length > 0) {
                        await this.ProcessGeneratedResultCodes(generatedResultCodes);
                    }
                }
                
                // Commit the transaction
                await provider.CommitTransaction();
                return true;
            }
            else {
                // Rollback on save failure
                await provider.RollbackTransaction();
                return false;
            }
        }
        catch (e) {
            // Rollback on any error
            await provider.RollbackTransaction();
            throw e;
        }
    }

    protected async manageLibraries(codeLibraries: ActionLibrary[], wasNewRecord: boolean): Promise<void> {
        // new code was generated, we need to sync up the ActionLibraries table with the libraries used in the code for this Action
        // get a list of existing ActionLibrary records that match this Action
        const existingLibraries: ActionLibraryEntity[] = [];
        if (!wasNewRecord) {
            const rv = this.RunViewProviderToUse;
            const libResult = await rv.RunView(
                {
                    EntityName: 'Action Libraries',
                    ExtraFilter: `ActionID = '${this.ID}'`,
                    ResultType: 'entity_object'
                },
                this.ContextCurrentUser
            );
            if (libResult.Success && libResult.Results.length > 0) {
                existingLibraries.push(...libResult.Results);
            }
        }

        // now we need to go through the libraries we ARE currently using in the current code and make sure they are in the ActionLibraries table
        // and make sure nothing is in the table that we are not using
        const librariesToAdd = codeLibraries.filter(l => !existingLibraries.some(el => el.Library.trim().toLowerCase() === l.LibraryName.trim().toLowerCase()));
        const librariesToRemove = existingLibraries.filter(el => !codeLibraries.some(l => l.LibraryName.trim().toLowerCase() === el.Library.trim().toLowerCase()));
        const librariesToUpdate = existingLibraries.filter(el => codeLibraries.some(l => l.LibraryName.trim().toLowerCase() === el.Library.trim().toLowerCase()));
        // Use the entity's provider instead of creating new Metadata instance
        const md = this.ProviderToUse as any as IMetadataProvider;

        for (const lib of librariesToAdd) {
            const libMetadata = md.Libraries.find(l => l.Name.trim().toLowerCase() === lib.LibraryName.trim().toLowerCase());
            if (libMetadata) {
                const newLib = await md.GetEntityObject<ActionLibraryEntity>('Action Libraries', this.ContextCurrentUser);
                newLib.ActionID = this.ID;
                newLib.LibraryID = libMetadata.ID;
                newLib.ItemsUsed = lib.ItemsUsed.join(',');
                await newLib.Save(); 
            }
        }

        // now update the libraries that were already in place to ensure the ItemsUsed are up to date
        for (const lib of librariesToUpdate) {
            const newCode = codeLibraries.find(l => l.LibraryName.trim().toLowerCase() === lib.Library.trim().toLowerCase());
            lib.ItemsUsed = newCode.ItemsUsed.join(',');
            await lib.Save();  
        }

        // now remove the libraries that are no longer used
        for (const lib of librariesToRemove) {
            // each lib in this array iteration is already a BaseEntity derived object
            await lib.Delete();  
        }
    }

    protected SendMessage(message: string) {
        MJGlobal.Instance.RaiseEvent({
            args: { message },
            eventCode: 'Actions',
            event: MJEventType.ComponentEvent,
            component: this
        });
    }
    /**
     * This method will generate code using a combination of the UserPrompt field as well as the overall context of how an Action gets executed. Code from the Action is later used by CodeGen to inject into
     * the mj_actions library for each user environment. The mj_actions library will have a class for each action and that class will have certain libraries imported at the top of the file and available for use.
     * That information along with a detailed amount of system prompt steering goes into the AI model in order to generate contextually appropriate and reliable code that maps to the business logic of the user
     */
    public async GenerateCode(maxAttempts: number = 3): Promise<GeneratedCodeExtended> {
        try {
            this.SendMessage('Generating code... ');

            // Ensure AIEngine is configured
            await AIEngine.Instance.Config(false, this.ContextCurrentUser);

            // Load the consolidated prompt template from preloaded prompts
            const aiPrompt = AIEngine.Instance.Prompts.find(p => 
                p.Name === 'Generate Action Code' && 
                p.Category === 'Actions'
            );

            if (!aiPrompt) {
                throw new Error('Failed to find AI prompt template: Generate Action Code in Actions category');
            }

            // Prepare prompt data
            const promptData = await this.PreparePromptData();

            // Execute the prompt using AIPromptRunner
            const promptRunner = new AIPromptRunner();
            const params = new AIPromptParams();
            params.prompt = aiPrompt;
            params.data = promptData;
            params.contextUser = this.ContextCurrentUser;

            const result = await promptRunner.ExecutePrompt<{
                code: string;
                explanation: string;
                libraries: Array<{LibraryName: string, ItemsUsed: string[]}>;
                parameters?: Array<{
                    Name: string;
                    Type: 'Input' | 'Output' | 'Both';
                    ValueType: 'Scalar' | 'Simple Object' | 'BaseEntity Sub-Class' | 'Other';
                    IsArray: boolean;
                    IsRequired: boolean;
                    DefaultValue: string | null;
                    Description: string;
                }>;
                resultCodes?: Array<{
                    ResultCode: string;
                    Description: string;
                    IsSuccess: boolean;
                }>;
            }>(params);

            if (result.success && result.result) {
                const generatedCode: GeneratedCodeExtended = {
                    Success: true,
                    Code: result.result.code.trim(),
                    Comments: result.result.explanation,
                    LibrariesUsed: result.result.libraries,
                    Parameters: result.result.parameters,
                    ResultCodes: result.result.resultCodes
                };

                // Validate the generated code
                return await this.ValidateGeneratedCode(generatedCode, maxAttempts);
            } else {
                return {
                    Success: false,
                    Code: '',
                    Comments: result.errorMessage || 'Failed to generate code',
                    LibrariesUsed: []
                };
            }
        }
        catch (e) {
            LogError(e);
            throw e;
        }
    }


    /**
     * Prepares the data context for the prompt template
     */
    protected async PreparePromptData(): Promise<Record<string, any>> {
        const data: Record<string, any> = {
            userPrompt: this.UserPrompt,
            entityInfo: this.PrepareEntityInfo(),
            availableLibraries: this.GenerateLibrariesContext(),
            IsChildAction: !!this.ParentID  // Template variable for conditional sections
        };

        // If this is a child action, load parent context and create ChildActionInfo
        if (this.ParentID) {
            const parentAction = await this.LoadParentAction();
            if (parentAction) {
                // Create the ChildActionInfo template variable with all parent details
                data.ChildActionInfo = `
**Parent Action ID:** ${parentAction.ID.trim().toLowerCase() /*just to make sure casing doesn't mess up the string we pass in*/}
**Parent Action Name:** ${parentAction.Name}
**Parent Description:** ${parentAction.Description || 'No description provided'}

**Parent Parameters:**
${JSON.stringify(parentAction.Params.map(p => {
    return {
        Name: p.Name,
        Type: p.Type,
        ValueType: p.ValueType,
        IsArray: p.IsArray,
        IsRequired: p.IsRequired,
        DefaultValue: p.DefaultValue,
        Description: p.Description
    }
}), null, 2)}
`;
                // Also include the parent action object for template access
                data.parentAction = {
                    Name: parentAction.Name,
                    Description: parentAction.Description,
                    Category: parentAction.Category
                };
                data.actionParams = parentAction.Params.map(p => {
                    return {
                        Name: p.Name,
                        Type: p.Type,
                        ValueType: p.ValueType,
                        IsArray: p.IsArray,
                        IsRequired: p.IsRequired,
                        DefaultValue: p.DefaultValue,
                        Description: p.Description
                    };
                });
            }
        }

        return data;
    }

    /**
     * Returns a simplified object with basic entity info: Name, Description and field list.
     */
    protected PrepareEntityInfo(): any {
        // Use the entity's provider instead of creating new Metadata instance
        const md = this.ProviderToUse as any as IMetadataProvider;
        const entities = md.Entities.map(entity => ({
            Name: entity.Name,
            Description: entity.Description,
            Fields: entity.Fields.map(field => ({
                Name: field.Name,
                NeedsQuotes: field.NeedsQuotes,
                ReadOnly: field.ReadOnly,
                AllowsNull: field.AllowsNull
            }))
        }));

        return entities;
    }

    /**
     * Loads the parent action entity if this is a child action
     */
    protected async LoadParentAction(): Promise<ActionEntityExtended | null> {
        if (!this.ParentID) return null;

        // Use the entity's provider instead of creating new Metadata instance
        const md = this.ProviderToUse as any as IMetadataProvider;
        const parent = await md.GetEntityObject<ActionEntityExtended>('Actions', this.ContextCurrentUser);
        if (await parent.Load(this.ParentID)) {
            return parent;
        }
        return null;
    }

    /**
     * Processes generated parameters and saves them to the database
     */
    protected async ProcessGeneratedParameters(parameters: Array<any>): Promise<void> {
        // Use the entity's provider instead of creating new Metadata instance
        const md = this.ProviderToUse as any as IMetadataProvider;

        try {
            // First, get existing parameters
            const rv = this.RunViewProviderToUse;
            const existingParams = await rv.RunView<ActionParamEntity>({
                EntityName: 'Action Params',
                ExtraFilter: `ActionID='${this.ID}'`,
                ResultType: 'entity_object'
            }, this.ContextCurrentUser);

            if (!existingParams.Success) {
                throw new Error(`Failed to load existing parameters: ${existingParams.ErrorMessage}`);
            }

            const existingParamsList = existingParams.Results || [];
            const generatedParamNames = parameters.map(p => p.Name.toLowerCase());

            // Find parameters to add, update, or remove
            const paramsToAdd = parameters.filter(p => 
                !existingParamsList.some(ep => ep.Name.toLowerCase() === p.Name.toLowerCase())
            );
            
            const paramsToUpdate = existingParamsList.filter(ep =>
                parameters.some(p => p.Name.toLowerCase() === ep.Name.toLowerCase())
            );
            
            const paramsToRemove = existingParamsList.filter(ep =>
                !generatedParamNames.includes(ep.Name.toLowerCase())
            );

            // Add new parameters
            for (const param of paramsToAdd) {
                const newParam = await md.GetEntityObject<ActionParamEntity>('Action Params', this.ContextCurrentUser);
                newParam.ActionID = this.ID;
                newParam.Name = param.Name;
                const t = param.Type;
                if (t === 'Input' || t === 'Output' || t === 'Both') {
                    newParam.Type = t;
                } else {
                    newParam.Type = 'Input'; // Default to Input if type is not recognized and emit a warning
                    console.warn(`Action Generator: Unrecognized parameter type "${t}" for parameter "${param.Name}". Defaulting to "Input".`);
                }
                newParam.ValueType = param.ValueType;
                newParam.IsArray = param.IsArray;
                newParam.IsRequired = param.IsRequired;
                newParam.DefaultValue = param.DefaultValue;
                newParam.Description = param.Description;
                await newParam.Save();
            }

            // Update existing parameters if properties changed
            for (const existingParam of paramsToUpdate) {
                const generatedParam = parameters.find(p => p.Name.toLowerCase() === existingParam.Name.toLowerCase());
                if (generatedParam) {
                    let hasChanges = false;
                    
                    // Check each property for changes
                    if (existingParam.Type !== generatedParam.Type) {
                        existingParam.Type = generatedParam.Type;
                        hasChanges = true;
                    }
                    if (existingParam.ValueType !== generatedParam.ValueType) {
                        existingParam.ValueType = generatedParam.ValueType;
                        hasChanges = true;
                    }
                    if (existingParam.IsArray !== generatedParam.IsArray) {
                        existingParam.IsArray = generatedParam.IsArray;
                        hasChanges = true;
                    }
                    if (existingParam.IsRequired !== generatedParam.IsRequired) {
                        existingParam.IsRequired = generatedParam.IsRequired;
                        hasChanges = true;
                    }
                    if (existingParam.DefaultValue !== generatedParam.DefaultValue) {
                        existingParam.DefaultValue = generatedParam.DefaultValue;
                        hasChanges = true;
                    }
                    if (existingParam.Description !== generatedParam.Description) {
                        existingParam.Description = generatedParam.Description;
                        hasChanges = true;
                    }
                    
                    if (hasChanges) {
                        await existingParam.Save();
                    }
                }
            }

            // Remove parameters that are no longer in the generated list
            for (const paramToRemove of paramsToRemove) {
                await paramToRemove.Delete();
            }

        } catch (e) {
            LogError('Failed to save generated parameters:', e);
            throw e; // Re-throw since we're in a transaction
        }
    }

    /**
     * Processes generated result codes and saves them to the database
     */
    protected async ProcessGeneratedResultCodes(resultCodes: Array<{ResultCode: string; Description: string; IsSuccess: boolean}>): Promise<void> {
        // Use the entity's provider instead of creating new Metadata instance
        const md = this.ProviderToUse as any as IMetadataProvider;

        try {
            // First, get existing result codes
            const rv = this.RunViewProviderToUse;
            const existingCodes = await rv.RunView<ActionResultCodeEntity>({
                EntityName: 'Action Result Codes',
                ExtraFilter: `ActionID='${this.ID}'`,
                ResultType: 'entity_object'
            }, this.ContextCurrentUser);

            if (!existingCodes.Success) {
                throw new Error(`Failed to load existing result codes: ${existingCodes.ErrorMessage}`);
            }

            const existingCodesList = existingCodes.Results || [];
            const generatedCodeNames = resultCodes.map(rc => rc.ResultCode.toLowerCase());

            // Find result codes to add, update, or remove
            const codesToAdd = resultCodes.filter(rc => 
                !existingCodesList.some(ec => ec.ResultCode.toLowerCase() === rc.ResultCode.toLowerCase())
            );
            
            const codesToUpdate = existingCodesList.filter(ec =>
                resultCodes.some(rc => rc.ResultCode.toLowerCase() === ec.ResultCode.toLowerCase())
            );
            
            const codesToRemove = existingCodesList.filter(ec =>
                !generatedCodeNames.includes(ec.ResultCode.toLowerCase())
            );

            // Add new result codes
            for (const resultCode of codesToAdd) {
                const newCode = await md.GetEntityObject<ActionResultCodeEntity>('Action Result Codes', this.ContextCurrentUser);
                newCode.ActionID = this.ID;
                newCode.ResultCode = resultCode.ResultCode;
                newCode.Description = resultCode.Description;
                newCode.IsSuccess = resultCode.IsSuccess;
                await newCode.Save();
            }

            // Update existing result codes if properties changed
            for (const existingCode of codesToUpdate) {
                const generatedCode = resultCodes.find(rc => rc.ResultCode.toLowerCase() === existingCode.ResultCode.toLowerCase());
                if (generatedCode) {
                    let hasChanges = false;
                    
                    // Check each property for changes
                    if (existingCode.Description !== generatedCode.Description) {
                        existingCode.Description = generatedCode.Description;
                        hasChanges = true;
                    }
                    if (existingCode.IsSuccess !== generatedCode.IsSuccess) {
                        existingCode.IsSuccess = generatedCode.IsSuccess;
                        hasChanges = true;
                    }
                    
                    if (hasChanges) {
                        await existingCode.Save();
                    }
                }
            }

            // Remove result codes that are no longer in the generated list
            for (const codeToRemove of codesToRemove) {
                await codeToRemove.Delete();
            }

        } catch (e) {
            LogError('Failed to save generated result codes:', e);
            throw e; // Re-throw since we're in a transaction
        }
    }

    /**
     * Validates the generated code
     */
    protected async ValidateGeneratedCode(generatedCode: GeneratedCodeExtended, attemptsRemaining: number): Promise<GeneratedCodeExtended> {
        // For now, return the code as-is
        // TODO: Implement validation logic using a separate prompt
        return generatedCode;
    }

    /**
     * Generates the libraries context for the prompt
     */
    protected GenerateLibrariesContext(): 
        {
            Name: string;
            Description: string;
            Items: {
                Name: string;
                Content: string;
            }[];
        }[] 
    {
        return DocumentationEngine.Instance.Libraries.map((library: LibraryEntityExtended) => {
            return {
                Name: library.Name,
                Description: library.Description,
                Items: library.Items.map((item: LibraryItemEntityExtended) => {
                    return {
                        Name: item.Name,
                        Content: item.HTMLContent
                    };
                })
            };
        });
    }
}