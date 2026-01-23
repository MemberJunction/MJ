import { BaseEntity } from "@memberjunction/core";
import { AIPromptCategoryEntity } from "@memberjunction/core-entities";
import { AIPromptEntityExtended } from "./AIPromptExtended";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseEntity, "AI Prompt Categories")
export class AIPromptCategoryEntityExtended extends AIPromptCategoryEntity {
    private _prompts: AIPromptEntityExtended[] = [];
    public get Prompts(): AIPromptEntityExtended[] {
        return this._prompts;
    }
}


//tree shaking stub
export function LoadAIPromptCategoryEntityExtended() {}