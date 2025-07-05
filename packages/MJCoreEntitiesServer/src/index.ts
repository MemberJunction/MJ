import { LoadActionEntityServer } from './custom/ActionEntity.server';
import { LoadAIPromptEntityExtendedServerSubClass } from './custom/AIPromptEntityExtended.server';
import { LoadAIPromptRunEntityServerSubClass } from './custom/AIPromptRunEntity.server';
import { LoadDuplicateRunEntityServerSubClass } from './custom/DuplicateRunEntity.server';
import { LoadReportEntityServerSubClass } from './custom/reportEntity.server';
import { LoadTemplateContentEntityServerSubClass } from './custom/TemplateContentEntity.server';
import { LoadUserViewEntityServerSubClass } from './custom/userViewEntity.server';

export * from './custom/AIPromptEntityExtended.server';
export * from './custom/AIPromptRunEntity.server';
export * from './custom/DuplicateRunEntity.server';
export * from './custom/reportEntity.server';
export * from './custom/TemplateContentEntity.server';
export * from './custom/userViewEntity.server';
export * from './custom/ActionEntity.server';

// Call the stub functions to ensure that the custom subclasses are not tree shaken out.
export function LoadCoreEntitiesServerSubClasses(): void {
    LoadAIPromptEntityExtendedServerSubClass();
    LoadAIPromptRunEntityServerSubClass();
    LoadDuplicateRunEntityServerSubClass();
    LoadReportEntityServerSubClass();
    LoadTemplateContentEntityServerSubClass();
    LoadUserViewEntityServerSubClass();
    LoadActionEntityServer();
}
LoadCoreEntitiesServerSubClasses();