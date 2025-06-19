import { BaseEntity, CodeNameFromString, EntityInfo, EntitySaveOptions, LogError, Metadata, RunView } from "@memberjunction/core";
import { ActionLibraryEntity, ActionParamEntity, ActionResultCodeEntity, AIPromptEntity } from "@memberjunction/core-entities";
import { CleanJSON, MJEventType, MJGlobal, RegisterClass } from "@memberjunction/global";
import { AIEngine } from "@memberjunction/aiengine";

import { BaseLLM, ChatMessage, ChatParams, GetAIAPIKey } from "@memberjunction/ai";
import { AIPromptRunner, AIPromptParams } from "@memberjunction/ai-prompts";
import { DocumentationEngine, LibraryEntityExtended, LibraryItemEntityExtended } from "@memberjunction/doc-utils";
import { ActionEngineBase, ActionEntityExtended, ActionLibrary, GeneratedCode } from "@memberjunction/actions-base";

/**
 * Server-Only custom sub-class for Actions entity. This sub-class handles the process of auto-generation code for the Actions entity.
 */
@RegisterClass(BaseEntity, 'Actions') // high priority make sure this class is used ahead of other things
export class ActionEntityServerEntity extends ActionEntityExtended {
    constructor(Entity: EntityInfo) {
        super(Entity); // call super

        const md = new Metadata();
        if (md.ProviderType !== 'Database')
            throw new Error('This class is only supported for server-side/database providers. Remove this package from your application.');
    }
    /**
     * Default implementation simply returns 'OpenAI' - override this in your subclass if you are using a different AI vendor.
     * @returns
     */
    protected get AIVendorName(): string {
        return 'OpenAI';
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

        let newCodeGenerated: boolean = false;
        let codeLibraries: ActionLibrary[] = [];
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
            }
            else
                throw new Error(`Failed to generate code for Action ${this.Name}.`);
        }

        this.ForceCodeGeneration = false; // make sure to reset this flag every time we save, it should never live past one run of the Save method, of course if Save fails, below, then it will not be reset
        const wasNewRecord = !this.IsSaved;
        if (await super.Save(options)) {
            if (newCodeGenerated)
                return this.manageLibraries(codeLibraries, wasNewRecord);
            else
                return true;
        }
        else
            return false;
    }

    protected async manageLibraries(codeLibraries: ActionLibrary[], wasNewRecord: boolean): Promise<boolean> {
        // new code was generated, we need to sync up the ActionLibraries table with the libraries used in the code for this Action
        // get a list of existing ActionLibrary records that match this Action
        const existingLibraries: ActionLibraryEntity[] = [];
        if (!wasNewRecord) {
            const rv = new RunView();
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
        const md = new Metadata();
        const tg = await md.CreateTransactionGroup();
        for (const lib of librariesToAdd) {
            const libMetadata = md.Libraries.find(l => l.Name.trim().toLowerCase() === lib.LibraryName.trim().toLowerCase());
            if (libMetadata) {
                const newLib = await md.GetEntityObject<ActionLibraryEntity>('Action Libraries', this.ContextCurrentUser);
                newLib.ActionID = this.ID;
                newLib.LibraryID = libMetadata.ID;
                newLib.ItemsUsed = lib.ItemsUsed.join(',');
                newLib.TransactionGroup = tg;
                await newLib.Save(); 
            }
        }

        // now update the libraries that were already in place to ensure the ItemsUsed are up to date
        for (const lib of librariesToUpdate) {
            const newCode = codeLibraries.find(l => l.LibraryName.trim().toLowerCase() === lib.Library.trim().toLowerCase());
            lib.ItemsUsed = newCode.ItemsUsed.join(',');
            lib.TransactionGroup = tg;
            await lib.Save();  
        }

        // now remove the libraries that are no longer used
        for (const lib of librariesToRemove) {
            // each lib in this array iteration is already a BaseEntity derived object
            lib.TransactionGroup = tg;
            await lib.Delete();  
        }

        // now commit the transaction
        if (await tg.Submit())
            return true;
        else
            return false;
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
    public async GenerateCode(maxAttempts: number = 3): Promise<GeneratedCode> {
        try {
            this.SendMessage('Generating code... ');

            // Load the appropriate prompt template
            const promptName = this.ParentID ? 'action_generation_child' : 'action_generation_base';
            const rv = new RunView();
            const promptResult = await rv.RunView<AIPromptEntity>({
                EntityName: 'AI Prompts',
                ExtraFilter: `Name='${promptName}'`,
                ResultType: 'entity_object'
            }, this.ContextCurrentUser);

            if (!promptResult.Success || !promptResult.Results || promptResult.Results.length === 0) {
                throw new Error(`Failed to load AI prompt template: ${promptName}`);
            }

            const aiPrompt = promptResult.Results[0];

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
            }>(params);

            if (result.success && result.result) {
                // Process parameters if provided
                if (result.result.parameters && result.result.parameters.length > 0) {
                    await this.ProcessGeneratedParameters(result.result.parameters);
                }

                const generatedCode: GeneratedCode = {
                    Success: true,
                    Code: result.result.code.trim(),
                    Comments: result.result.explanation,
                    LibrariesUsed: result.result.libraries
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

    protected async InternalGenerateCode(llm: BaseLLM, chatParams: ChatParams, attemptsRemaining: number): Promise<GeneratedCode> {
        try {
            const result = await llm.ChatCompletion(chatParams);
            if (result && result.data) {
                const llmResponse = result.data.choices[0].message.content;
                if (llmResponse) {
                    // try to parse it as JSON
                    const cleansed: string = CleanJSON(llmResponse);
                    if (!cleansed)
                        throw new Error('Invalid JSON response from AI: ' + llmResponse);

                    const parsed = JSON.parse(cleansed);
                    if (parsed.code && parsed.code.length > 0) {
                        const trimmed = parsed.code.trim();
                        let comments: string = parsed.explanation;
                        if(parsed.reflection){
                            comments = comments + `\n ${parsed.reflection}`;
                        }
                        const result: GeneratedCode = {
                            Success: true,
                            Code: trimmed,
                            Comments: parsed.explanation,
                            LibrariesUsed: parsed.libraries
                        };

                        return result;
                    }
                    else {
                        throw new Error('Invalid JSON response from AI: ' + llmResponse);
                    }
                }
                else
                    throw new Error('No response from AI');
            }
            else
                throw new Error('No response from AI');
        }
        catch (e) {
            LogError(e);
            if (attemptsRemaining > 1) {
                // try again
                return await this.InternalGenerateCode(llm, chatParams, attemptsRemaining - 1);
            }
            else
                return {
                    Success: false,
                    Code: '',
                    Comments: `Error communicating with AI: ${e.message}`,
                    LibrariesUsed: []
                }
        }
    }

    /**
     * Prepares the data context for the prompt template
     */
    protected async PreparePromptData(): Promise<Record<string, any>> {
        const data: Record<string, any> = {
            userPrompt: this.UserPrompt,
            actionParams: JSON.stringify(this.Params, null, 2),
            resultCodes: this.ResultCodes && this.ResultCodes.length > 0 ? 
                this.ResultCodes.map(rc => `'${rc.ResultCode}'`).join(' | ') : "'Success' | 'Failed'",
            availableLibraries: this.GenerateLibrariesContext(),
            entities: JSON.stringify(Metadata.Provider.Entities.map(e => ({
                Entity: e.Name,
                SchemaName: e.SchemaName,
                Description: e.Description,
                BaseView: e.BaseView
            })), null, 2)
        };

        // If this is a child action, load parent context
        if (this.ParentID) {
            const parentAction = await this.LoadParentAction();
            if (parentAction) {
                data.parentAction = {
                    Name: parentAction.Name,
                    Description: parentAction.Description
                };
                data.parentActionParams = JSON.stringify(parentAction.Params, null, 2);
            }
        }

        return data;
    }

    /**
     * Loads the parent action entity if this is a child action
     */
    protected async LoadParentAction(): Promise<ActionEntityExtended | null> {
        if (!this.ParentID) return null;

        const md = new Metadata();
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
        const md = new Metadata();
        const tg = await md.CreateTransactionGroup();

        try {
            // First, get existing parameters
            const rv = new RunView();
            const existingParams = await rv.RunView<ActionParamEntity>({
                EntityName: 'Action Params',
                ExtraFilter: `ActionID='${this.ID}'`,
                ResultType: 'entity_object'
            }, this.ContextCurrentUser);

            const existingParamNames = existingParams.Success && existingParams.Results ? 
                existingParams.Results.map(p => p.Name.toLowerCase()) : [];

            // Add new parameters that don't exist
            for (const param of parameters) {
                if (!existingParamNames.includes(param.Name.toLowerCase())) {
                    const newParam = await md.GetEntityObject<ActionParamEntity>('Action Params', this.ContextCurrentUser);
                    newParam.ActionID = this.ID;
                    newParam.Name = param.Name;
                    newParam.Type = param.Type;
                    newParam.ValueType = param.ValueType;
                    newParam.IsArray = param.IsArray;
                    newParam.IsRequired = param.IsRequired;
                    newParam.DefaultValue = param.DefaultValue;
                    newParam.Description = param.Description;
                    newParam.TransactionGroup = tg;
                    await newParam.Save();
                }
            }

            await tg.Submit();
        } catch (e) {
            LogError('Failed to save generated parameters:', e);
            // Don't throw - parameter generation is a nice-to-have
        }
    }

    /**
     * Validates the generated code
     */
    protected async ValidateGeneratedCode(generatedCode: GeneratedCode, attemptsRemaining: number): Promise<GeneratedCode> {
        // For now, return the code as-is
        // TODO: Implement validation logic using a separate prompt
        return generatedCode;
    }

    /**
     * Generates the libraries context for the prompt
     */
    protected GenerateLibrariesContext(): string {
        return DocumentationEngine.Instance.Libraries.map((library: LibraryEntityExtended) => {
            return library.Items.map((item: LibraryItemEntityExtended) => {
                return JSON.stringify({
                    LibraryName: library.Name,
                    ItemName: item.Name,
                    Content: item.HTMLContent
                });
            }).join('\n');
        }).join('\n');
    }


}

export function LoadActionEntityServer() {
    // this function is used to force the class to load and register itself with the system
    // this is necessary because the class is not explicitly referenced in the code, it is only registered with the system
    // and the system will only load it when it is needed, this function forces the class to load
}

