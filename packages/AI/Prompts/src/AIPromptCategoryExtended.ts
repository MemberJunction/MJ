import { BaseEntity } from '@memberjunction/core';
import { AIPromptCategoryEntity, AIPromptEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(BaseEntity, 'AI Prompt Categories')
export class AIPromptCategoryEntityExtended extends AIPromptCategoryEntity {
  private _prompts: AIPromptEntity[] = [];
  public get Prompts(): AIPromptEntity[] {
    return this._prompts;
  }
}
