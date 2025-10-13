import { LoadTemplateEmbedExtension } from './extensions/TemplateEmbed.extension';
import { LoadAIPromptExtension } from './extensions/AIPrompt.extension';
import { LoadAIProviders } from '@memberjunction/ai-provider-bundle';
LoadTemplateEmbedExtension(); // make sure it doesnt get tree shaken out, we need template embedding
LoadAIPromptExtension(); // make sure it doesnt get tree shaken out, we need AI prompts
LoadAIProviders(); // Ensure all AI providers are loaded

export * from './TemplateEngine';
export * from './extensions/AIPrompt.extension';
export * from './extensions/TemplateEmbed.extension';
export * from './extensions/TemplateExtensionBase';