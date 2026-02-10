import { BaseEntity, CompositeKey, LogErrorEx, Metadata } from "@memberjunction/core";
import { ActionExecutionLogEntity, AIAgentRunStepEntity, AIPromptRunEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import { AIAgentRunEntityExtended } from "./AIAgentRunExtended";

@RegisterClass(BaseEntity, "MJ: AI Agent Run Steps")
export class AIAgentRunStepEntityExtended extends AIAgentRunStepEntity {
    private _actionExecutionLog?: ActionExecutionLogEntity;
    /**
     * If StepType == 'Actions', this property can be used to stash the ActionExecutionLogEntity
     * which contains the execution log of the action that was executed in this step.
     * This is useful for debugging and tracking the execution of actions within the agent run step.
     * 
     * NOTE: This property is only applicable when StepType is 'Actions'.
     * 
     */
    public get ActionExecutionLog(): ActionExecutionLogEntity | undefined {
        return this._actionExecutionLog;
    }
    public set ActionExecutionLog(value: ActionExecutionLogEntity | undefined) {
        this._actionExecutionLog = value;
    }

    private _subAgentRun?: AIAgentRunEntityExtended;
    /**
     * If StepType == 'Sub-Agent', this property can be used to stash the AIAgentRunEntityExtended
     * which contains the sub-agent run details.
     * This is useful for tracking the execution of sub-agents within the agent run step.
     * 
     * NOTE: This property is only applicable when StepType is 'Sub-Agent'.
     */
    public get SubAgentRun(): AIAgentRunEntityExtended | undefined {
        return this._subAgentRun;
    }
    public set SubAgentRun(value: AIAgentRunEntityExtended | undefined) {
        this._subAgentRun = value;
    }

    private _promptRun?: AIPromptRunEntity;
    /**
     * If StepType == 'Prompt', this property can be used to stash the AIPromptRunEntity
     * which contains the prompt run details.
     * This is useful for tracking the execution of prompts within the agent run step.
     * 
     * NOTE: This property is only applicable when StepType is 'Prompt'.
     */
    public get PromptRun(): AIPromptRunEntity | undefined {
        return this._promptRun;
    }
    public set PromptRun(value: AIPromptRunEntity | undefined) {
        this._promptRun = value;
    }

    /**
     * Override GetAll to include extended properties for serialization.
     * This enables streaming of the full object structure including related entities.
     */
    public override GetAll(): any {
        const baseData = super.GetAll();
        
        // Add related entities based on StepType with __ prefix
        const extended: any = { ...baseData };
        
        if (this.StepType === 'Prompt' && this._promptRun) {
            extended.__promptRun = this._promptRun.GetAll();
        } else if (this.StepType === 'Actions' && this._actionExecutionLog) {
            extended.__actionExecutionLog = this._actionExecutionLog.GetAll();
        } else if (this.StepType === 'Sub-Agent' && this._subAgentRun) {
            extended.__subAgentRun = this._subAgentRun.GetAll(); // Recursive!
        }
        
        return extended;
    }
    
    public override async LoadFromData(data: any, _replaceOldValues?: boolean): Promise<boolean> {
        // Extract our special properties before passing to super
        const { __promptRun, __actionExecutionLog, __subAgentRun, ...baseData } = data;
        
        // Load base properties
        const baseResult = await super.LoadFromData(baseData, _replaceOldValues);
        if (!baseResult) {
            return false;
        }
        
        // Handle extended properties based on StepType
        const md = new Metadata();
        
        if (this.StepType === 'Prompt' && __promptRun) {
            this._promptRun = await md.GetEntityObject<AIPromptRunEntity>('MJ: AI Prompt Runs', this.ContextCurrentUser);
            await this._promptRun.LoadFromData(__promptRun);
        } else if (this.StepType === 'Actions' && __actionExecutionLog) {
            this._actionExecutionLog = await md.GetEntityObject<ActionExecutionLogEntity>('Action Execution Logs', this.ContextCurrentUser);
            await this._actionExecutionLog.LoadFromData(__actionExecutionLog);
        } else if (this.StepType === 'Sub-Agent' && __subAgentRun) {
            this._subAgentRun = await md.GetEntityObject<AIAgentRunEntityExtended>('MJ: AI Agent Runs', this.ContextCurrentUser);
            await this._subAgentRun.LoadFromData(__subAgentRun);
        } else if (this.ID?.length > 0) {
            await this.LoadRelatedData();
        }
        
        return true;
    }

    public override async InnerLoad(CompositeKey: CompositeKey, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        if (await super.InnerLoad(CompositeKey, EntityRelationshipsToLoad)) {
            return await this.LoadRelatedData();
        }
        else {
            return false;
        }
    }

    /**
     * Based on the step type, for an existing record, it will load the related records automatically
     */
    protected async LoadRelatedData(): Promise<boolean> {
        try {
            if (this.ID?.length > 0 && this.TargetLogID?.length > 0) {
                // only do this for existing records
                const md = new Metadata();
                switch (this.StepType) {
                    case "Actions":
                        this._actionExecutionLog = await md.GetEntityObject<ActionExecutionLogEntity>("Action Execution Logs", this.ContextCurrentUser);
                        await this._actionExecutionLog.Load(this.TargetLogID);
                        break;
                    case "Sub-Agent":
                        this._subAgentRun = await md.GetEntityObject<AIAgentRunEntityExtended>("MJ: AI Agent Runs", this.ContextCurrentUser);
                        await this._subAgentRun.Load(this.TargetLogID);
                        break;
                    case "Prompt":
                        this._promptRun = await md.GetEntityObject<AIPromptRunEntity>("MJ: AI Prompt Runs", this.ContextCurrentUser);
                        await this._promptRun.Load(this.TargetLogID);
                        break;
                    default:
                        // no related data to load for other step types
                        break;
                }
            }
            return true;
        }
        catch (error) {
            LogErrorEx({
                error,
                message: `Error loading related data for AI Agent Run Step ID: ${this.ID}, Step Type: ${this.StepType}`,
            });
            return false;
        }
    }
} 
