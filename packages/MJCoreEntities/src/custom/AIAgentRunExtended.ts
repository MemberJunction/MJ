import { BaseEntity, CompositeKey, LogErrorEx, Metadata, RunView } from "@memberjunction/core";
import { AIAgentRunEntity, AIAgentRunStepEntity } from "../generated/entity_subclasses";
import { RegisterClass } from "@memberjunction/global";
import { AIAgentRunStepEntityExtended } from "./AIAgentRunStepExtended";

@RegisterClass(BaseEntity, "AI Agent Runs")
export class AIAgentRunEntityExtended extends AIAgentRunEntity {
    private _runSteps: AIAgentRunStepEntityExtended[] = [];
    public get Steps(): AIAgentRunStepEntityExtended[] {
        return this._runSteps;
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

