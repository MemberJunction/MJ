import { cosmiconfig } from 'cosmiconfig';
import dotenv from 'dotenv';

import { LoadGroqLLM } from '@memberjunction/ai-groq';
import { LoadOpenAILLM } from '@memberjunction/ai-openai';
import { LoadAnthropicLLM } from '@memberjunction/ai-anthropic';
import { LoadMistralLLM } from '@memberjunction/ai-mistral';
import { LoadCerebrasLLM } from '@memberjunction/ai-cerebras';
import { LoadBettyBotLLM } from '@memberjunction/ai-betty-bot';
LoadGroqLLM(); // tree shaking prevention
LoadOpenAILLM(); // tree shaking prevention
LoadAnthropicLLM(); // tree shaking prevention
LoadMistralLLM(); // tree shaking prevention
LoadCerebrasLLM(); // tree shaking prevention
LoadBettyBotLLM(); // tree shaking prevention

// Load environment variables
dotenv.config({ quiet: true });

export interface AICliConfig {
  // Database settings from mj.config.cjs
  dbHost?: string;
  dbDatabase?: string;
  dbPort?: number;
  dbUsername?: string;
  dbPassword?: string;
  coreSchema?: string;
  
  // AI CLI specific settings
  aiSettings?: {
    defaultTimeout?: number;
    outputFormat?: 'compact' | 'json' | 'table';
    logLevel?: 'info' | 'debug' | 'verbose';
    enableChat?: boolean;
    chatHistoryLimit?: number;
  };
}

export async function loadAIConfig(): Promise<AICliConfig> {
  const explorer = cosmiconfig('mj');
  const result = await explorer.search();
  
  if (!result) {
    throw new Error(`❌ No mj.config.cjs configuration found

Problem: MJ configuration file is missing
Likely cause: You may not be in a MemberJunction workspace directory

Next steps:
1. Ensure you're running from the MJ repository root
2. Verify mj.config.cjs exists in the current directory
3. Check that the config file exports database connection settings

For help configuring MJ, see: https://docs.memberjunction.org`);
  }
  
  return result.config;
}