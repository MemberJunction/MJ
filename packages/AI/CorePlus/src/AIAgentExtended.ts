import { BaseEntity } from "@memberjunction/core";
import { AIAgentActionEntity, AIAgentEntity, AIAgentModelEntity, AIAgentNoteEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";

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

// tree shaking load stub
export function LoadAIAgentEntityExtended() {}
