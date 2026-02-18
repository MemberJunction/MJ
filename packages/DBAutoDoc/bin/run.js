#!/usr/bin/env node
import 'dotenv/config';
import { LoadAIProviders } from '@memberjunction/ai-provider-bundle';
import { execute } from '@oclif/core';

// Load AI providers to prevent tree shaking
LoadAIProviders();

await execute({ dir: import.meta.url });
