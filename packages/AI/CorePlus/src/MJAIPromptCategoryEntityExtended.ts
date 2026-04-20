import { BaseEntity } from "@memberjunction/core";
import { MJAIPromptCategoryEntity } from "@memberjunction/core-entities";
import { MJAIPromptEntityExtended } from "./MJAIPromptEntityExtended";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseEntity, "MJ: AI Prompt Categories")
export class MJAIPromptCategoryEntityExtended extends MJAIPromptCategoryEntity {
    private _prompts: MJAIPromptEntityExtended[] = [];
    public get Prompts(): MJAIPromptEntityExtended[] {
        return this._prompts;
    }
}