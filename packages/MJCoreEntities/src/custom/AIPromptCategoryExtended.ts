import { AIPromptCategoryEntity, AIPromptEntity } from "../generated/entity_subclasses";
import { RegisterClass } from "@memberjunction/global";
import { BaseEntity } from "typeorm";

@RegisterClass(BaseEntity, "AI Prompt Categories")
export class AIPromptCategoryEntityExtended extends AIPromptCategoryEntity {
    private _prompts: AIPromptEntity[] = [];
    public get Prompts(): AIPromptEntity[] {
        return this._prompts;
    }
}