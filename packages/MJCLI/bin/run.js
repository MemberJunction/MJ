#!/usr/bin/env node
import 'dotenv/config';

// Import pre-built MJ class registrations manifest (covers all @memberjunction/* packages)
import '@memberjunction/server-bootstrap-lite/mj-class-registrations';

import { execute } from '@oclif/core';

// Skip TypeScript source path lookup in production mode.
// Without this, oclif rewrites dist/ → src/ and tries to import() .ts files,
// which fails under Node ESM without a loader (tsx/ts-node).
// Mutate the existing global (don't replace it — oclif already has a reference).
globalThis.oclif.enableAutoTranspile = false;

await execute({ dir: import.meta.url });
