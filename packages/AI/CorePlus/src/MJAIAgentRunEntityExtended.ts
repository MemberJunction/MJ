import { BaseEntity, CompositeKey, LogErrorEx, Metadata } from "@memberjunction/core";
import { MJAIAgentRunEntity } from "@memberjunction/core-entities";
import { RegisterClass, SafeJSONParse } from "@memberjunction/global";
import { MJAIAgentRunStepEntityExtended } from "./MJAIAgentRunStepEntityExtended";

@RegisterClass(BaseEntity, "MJ: AI Agent Runs")
export class MJAIAgentRunEntityExtended extends MJAIAgentRunEntity {
    private _runSteps: MJAIAgentRunStepEntityExtended[] = [];

    /**
     * Steps is the array of steps that are excuted within this run.
     */
    public get Steps(): MJAIAgentRunStepEntityExtended[] {
        return this._runSteps;
    }

    override get FinalPayload(): string {
        return super.FinalPayload;
    }
    override set FinalPayload(value: string) {
        const changed = this.FinalPayload !== value;
        super.FinalPayload = value;
        if (changed) {
            this._finalPayloadObject = SafeJSONParse(value);
        }    
    }

    private _finalPayloadObject: any = null;
    /**
     * FinalPayloadObject is the object representation of the FinalPayload JSON string.
     * You can set the value here as an object and it will automatically convert it to a JSON string.
     * Also, when the FinalPayload string property is set, it will automatically parse the JSON string and set this property.
     */
    public set FinalPayloadObject(value: any) {
        const changed = this._finalPayloadObject !== value;
        this._finalPayloadObject = value;
        if (changed) {
            // If the value is null, set FinalPayload to null too
            // call super.FinalPayload instead of this.FinalPayload to avoid recursion
            // because this.FinalPayload setter will call this FinalPayloadObject setter again
            // and we will end up in an infinite recursion scenario.
            super.FinalPayload = value ? JSON.stringify(value) : null;
        }
    }
    public get FinalPayloadObject(): any {
        return this._finalPayloadObject;
    }
    
    /**
     * Override GetAll to include extended properties for serialization.
     * This enables streaming of the full object structure including related entities.
     */
    public GetAll(): any {
        const baseData = super.GetAll();
        
        // Add extended properties with __ prefix to avoid conflicts
        return {
            ...baseData,
            __finalPayloadObject: this._finalPayloadObject,
            __runSteps: this._runSteps.map(step => step.GetAll())
        };
    }
    
    override async LoadFromData(data: any, _replaceOldValues?: boolean): Promise<boolean> {
        // Extract our special properties before passing to super
        const { __runSteps, __finalPayloadObject, ...baseData } = data;
        
        // Load base properties
        const baseResult = await super.LoadFromData(baseData, _replaceOldValues);
        if (!baseResult) {
            return false;
        }
        
        // Handle extended properties
        if (__finalPayloadObject !== undefined) {
            this._finalPayloadObject = __finalPayloadObject;
        }
        
        // Handle steps array if provided
        if (__runSteps && Array.isArray(__runSteps)) {
            this._runSteps = [];
            const md = new Metadata();
            for (const stepData of __runSteps) {
                const step = await md.GetEntityObject<MJAIAgentRunStepEntityExtended>('MJ: AI Agent Run Steps', this.ContextCurrentUser);
                await step.LoadFromData(stepData);
                this._runSteps.push(step);
            }
        }
        // If no steps provided in data, try to load from database
        else if (this.ID?.length > 0) {
            await this.LoadRelatedData();
        }
        
        return true;
    }

    override async InnerLoad(CompositeKey: CompositeKey, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        if (await super.InnerLoad(CompositeKey, EntityRelationshipsToLoad)) {
            return await this.LoadRelatedData();
        }
        else {
            return false;
        }
    }

    /**
     * Load all the steps related to this AI Agent Run.
     */
    protected async LoadRelatedData(): Promise<boolean> {
        try {
            if (this.ID?.length > 0) {
                // only do this for existing records
                const rv = this.RunViewProviderToUse;
                const result = await rv.RunView<MJAIAgentRunStepEntityExtended>({
                    EntityName: "MJ: AI Agent Run Steps",
                    ExtraFilter: "AgentRunID='" + this.ID + "'",
                    OrderBy: "StepNumber",
                    ResultType: "entity_object"
                }, this.ContextCurrentUser);
                if (result?.Success) {
                    this._runSteps = result.Results;
                }
            }
            return true;
        }
        catch (error) {
            LogErrorEx({
                error,
                message: `Error loading related data for AI Agent Run ID: ${this.ID}`,
            });
            return false;
        }
    }    
}

