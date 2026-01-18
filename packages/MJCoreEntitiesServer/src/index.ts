import { LoadAIProviders } from '@memberjunction/ai-provider-bundle';
import { LoadActionEntityServer } from './custom/ActionEntity.server';
import { LoadApplicationEntityServer } from './custom/ApplicationEntity.server';
import { LoadAIPromptEntityExtendedServerSubClass } from './custom/AIPromptEntityExtended.server';
import { LoadAIPromptRunEntityServerSubClass } from './custom/AIPromptRunEntity.server';
import { LoadConversationDetailEntityServerSubClass } from './custom/ConversationDetailEntity.server';
import { LoadDuplicateRunEntityServerSubClass } from './custom/DuplicateRunEntity.server';
import { LoadQueryEntityServerSubClass } from './custom/QueryEntity.server';
import { LoadReportEntityServerSubClass } from './custom/reportEntity.server';
import { LoadTemplateContentEntityServerSubClass } from './custom/TemplateContentEntity.server';
import { LoadUserViewEntityServerSubClass } from './custom/userViewEntity.server';
import { LoadArtifactVersionExtendedServerSubClass } from './custom/ArtifactVersionExtended.server';
import { LoadAIAgentNoteEntityServerSubClass } from './custom/AIAgentNoteEntity.server';
import { LoadAIAgentExampleEntityServerSubClass } from './custom/AIAgentExampleEntity.server';
import { LoadUserNotificationPreferenceEntityExtended } from '@memberjunction/core-entities';

LoadAIProviders(); // Ensure all AI providers are loaded

export * from './custom/AIPromptEntityExtended.server';
export * from './custom/AIPromptRunEntity.server';
export * from './custom/ConversationDetailEntity.server';
export * from './custom/DuplicateRunEntity.server';
export * from './custom/QueryEntity.server';
export * from './custom/reportEntity.server';
export * from './custom/TemplateContentEntity.server';
export * from './custom/userViewEntity.server';
export * from './custom/ActionEntity.server';
export * from './custom/ApplicationEntity.server';
export * from './custom/ComponentEntity.server';
export * from './custom/ArtifactVersionExtended.server';
export * from './custom/AIAgentNoteEntity.server';
export * from './custom/AIAgentExampleEntity.server';
export * from './custom/util';

// Call the stub functions to ensure that the custom subclasses are not tree shaken out.
export function LoadCoreEntitiesServerSubClasses(): void {
    LoadAIPromptEntityExtendedServerSubClass();
    LoadAIPromptRunEntityServerSubClass();
    LoadConversationDetailEntityServerSubClass();
    LoadDuplicateRunEntityServerSubClass();
    LoadQueryEntityServerSubClass();
    LoadReportEntityServerSubClass();
    LoadTemplateContentEntityServerSubClass();
    LoadUserViewEntityServerSubClass();
    LoadActionEntityServer();
    LoadApplicationEntityServer();
    LoadArtifactVersionExtendedServerSubClass();
    LoadAIAgentNoteEntityServerSubClass();
    LoadAIAgentExampleEntityServerSubClass();
    LoadUserNotificationPreferenceEntityExtended();
}
LoadCoreEntitiesServerSubClasses();