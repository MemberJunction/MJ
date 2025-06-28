import { BaseEntity, CompositeKey, LogErrorEx, Metadata, RunView } from "@memberjunction/core";
import { AIAgentRunEntity, AIAgentRunStepEntity } from "../generated/entity_subclasses";
import { RegisterClass, SafeJSONParse } from "@memberjunction/global";
import { AIAgentRunStepEntityExtended } from "./AIAgentRunStepExtended";

@RegisterClass(BaseEntity, "AI Agent Runs")
export class AIAgentRunEntityExtended extends AIAgentRunEntity {
    private _runSteps: AIAgentRunStepEntityExtended[] = [];
    public get Steps(): AIAgentRunStepEntityExtended[] {
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
    
    override async LoadFromData(data: any, _replaceOldValues?: boolean): Promise<boolean> {
        if (await super.LoadFromData(data, _replaceOldValues)) {
            return await this.LoadRelatedData();
        }
        else {
            return false;
        }
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
                const rv = new RunView();
                const result = await rv.RunView<AIAgentRunStepEntityExtended>({
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

