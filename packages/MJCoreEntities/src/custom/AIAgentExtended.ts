import { AIAgentActionEntity, AIAgentEntity, AIAgentModelEntity, AIAgentNoteEntity } from "../generated/entity_subclasses";
import { RegisterClass } from "@memberjunction/global";
import { BaseEntity } from "typeorm";

@RegisterClass(BaseEntity, "AI Agents")
export class AIAgentEntityExtended extends AIAgentEntity {
    private _actions: AIAgentActionEntity[] = [];
    public get Actions(): AIAgentActionEntity[] {
        return this._actions;
    }

    private _models: AIAgentModelEntity[] = [];
    /**
     * @deprecated - models are associated with prompts now
     */
    public get Models(): AIAgentModelEntity[] {
        return this._models;
    }

    private _notes: AIAgentNoteEntity[] = [];
    public get Notes(): AIAgentNoteEntity[] {
        return this._notes;
    }
}