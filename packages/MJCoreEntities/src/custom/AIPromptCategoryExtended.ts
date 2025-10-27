import { BaseEntity } from '@memberjunction/global';
import { AIPromptCategoryEntity } from '../generated/entity_subclasses';
import { AIPromptEntityExtended } from './AIPromptExtended';
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(BaseEntity, 'AI Prompt Categories')
export class AIPromptCategoryEntityExtended extends AIPromptCategoryEntity {
  private _prompts: AIPromptEntityExtended[] = [];
  public get Prompts(): AIPromptEntityExtended[] {
    return this._prompts;
  }
}
