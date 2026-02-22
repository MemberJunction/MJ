import { BaseEntity } from "@memberjunction/core";
import { MJAIAgentActionEntity, MJAIAgentEntity, MJAIAgentModelEntity, MJAIAgentNoteEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseEntity, "MJ: AI Agents")
export class MJAIAgentEntityExtended extends MJAIAgentEntity {
    private _actions: MJAIAgentActionEntity[] = [];
    public get Actions(): MJAIAgentActionEntity[] {
        return this._actions;
    }

    private _models: MJAIAgentModelEntity[] = [];
    /**
     * @deprecated - models are associated with prompts now
     */
    public get Models(): MJAIAgentModelEntity[] {
        return this._models;
    }

    private _notes: MJAIAgentNoteEntity[] = [];
    public get Notes(): MJAIAgentNoteEntity[] {
        return this._notes;
    }
}
