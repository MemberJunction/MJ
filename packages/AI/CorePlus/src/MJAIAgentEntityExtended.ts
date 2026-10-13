import { BaseEntity } from "@memberjunction/core";
import { MJAIAgentEntity, MJAIAgentModelEntity, MJAIAgentNoteEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseEntity, "MJ: AI Agents")
export class MJAIAgentEntityExtended extends MJAIAgentEntity {
    /*
     * `Actions` used to live here as a private array with a getter and no setter — nothing anywhere
     * assigned it, so it returned an empty array to every caller. It is now a generated
     * related-record collection declared on the 'MJ: AI Agents → MJ: AI Agent Actions' relationship
     * (`Source: 'cache'`, `Load: 'lazy'`, read-only), which reads from the same BaseAIEngine cache
     * that already holds those rows. Callers use `agent.Actions.Items`.
     *
     * `SubAgents` is likewise now generated, from the ParentID self-relationship.
     */

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
