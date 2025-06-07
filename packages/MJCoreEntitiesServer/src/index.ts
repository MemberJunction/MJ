import { LoadAIPromptEntityExtendedServerSubClass } from './custom/AIPromptEntityExtended.server';
import { LoadDuplicateRunEntityServerSubClass } from './custom/DuplicateRunEntity.server';
import { LoadReportEntityServerSubClass } from './custom/reportEntity.server';
import { LoadUserViewEntityServerSubClass } from './custom/userViewEntity.server';

export * from './custom/AIPromptEntityExtended.server';
export * from './custom/DuplicateRunEntity.server';
export * from './custom/reportEntity.server';
export * from './custom/userViewEntity.server';

// Call the stub functions to ensure that the custom subclasses are not tree shaken out.
export function LoadCoreEntitiesServerSubClasses(): void {
    LoadAIPromptEntityExtendedServerSubClass();
    LoadDuplicateRunEntityServerSubClass();
    LoadReportEntityServerSubClass();
    LoadUserViewEntityServerSubClass();
}
LoadCoreEntitiesServerSubClasses();