import { LoadAIProviders } from '@memberjunction/ai-provider-bundle';
import { LoadActionEntityServer } from './custom/ActionEntity.server';
import { LoadAIPromptEntityExtendedServerSubClass } from './custom/AIPromptEntityExtended.server';
import { LoadAIPromptRunEntityServerSubClass } from './custom/AIPromptRunEntity.server';
import { LoadDuplicateRunEntityServerSubClass } from './custom/DuplicateRunEntity.server';
import { LoadQueryEntityServerSubClass } from './custom/QueryEntity.server';
import { LoadReportEntityServerSubClass } from './custom/reportEntity.server';
import { LoadTemplateContentEntityServerSubClass } from './custom/TemplateContentEntity.server';
import { LoadUserViewEntityServerSubClass } from './custom/userViewEntity.server';
import { LoadArtifactVersionExtendedServerSubClass } from './custom/ArtifactVersionExtended.server';

LoadAIProviders(); // Ensure all AI providers are loaded

export * from './custom/AIPromptEntityExtended.server';
export * from './custom/AIPromptRunEntity.server';
export * from './custom/DuplicateRunEntity.server';
export * from './custom/QueryEntity.server';
export * from './custom/reportEntity.server';
export * from './custom/TemplateContentEntity.server';
export * from './custom/userViewEntity.server';
export * from './custom/ActionEntity.server';
export * from './custom/ComponentEntity.server';
export * from './custom/ArtifactVersionExtended.server';
export * from './custom/util';

// Call the stub functions to ensure that the custom subclasses are not tree shaken out.
export function LoadCoreEntitiesServerSubClasses(): void {
    LoadAIPromptEntityExtendedServerSubClass();
    LoadAIPromptRunEntityServerSubClass();
    LoadDuplicateRunEntityServerSubClass();
    LoadQueryEntityServerSubClass();
    LoadReportEntityServerSubClass();
    LoadTemplateContentEntityServerSubClass();
    LoadUserViewEntityServerSubClass();
    LoadActionEntityServer();
    LoadArtifactVersionExtendedServerSubClass();
}
LoadCoreEntitiesServerSubClasses();