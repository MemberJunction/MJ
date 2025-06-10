import { LoadGroqLLM } from '@memberjunction/ai-groq';
LoadGroqLLM(); // make sure it doesnt get tree shaken out, we need Groq

import { LoadTemplateEmbedExtension } from './extensions/TemplateEmbed.extension';
import { LoadAIPromptExtension } from './extensions/AIPrompt.extension';
LoadTemplateEmbedExtension(); // make sure it doesnt get tree shaken out, we need template embedding
LoadAIPromptExtension(); // make sure it doesnt get tree shaken out, we need AI prompts

export * from './TemplateEngine';
export * from './extensions/AIPrompt.extension';
export * from './extensions/TemplateEmbed.extension';
export * from './extensions/TemplateExtensionBase';