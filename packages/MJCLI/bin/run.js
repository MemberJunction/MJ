#!/usr/bin/env node
import 'dotenv/config';

// Bootstrap loading is handled conditionally in the prerun hook.
// Only non-light commands load @memberjunction/server-bootstrap-lite.
// See src/light-commands.ts for the list of light commands.

import { execute } from '@oclif/core';

// Skip TypeScript source path lookup in production mode.
// Without this, oclif rewrites dist/ → src/ and tries to import() .ts files,
// which fails under Node ESM without a loader (tsx/ts-node).
// Mutate the existing global (don't replace it — oclif already has a reference).
globalThis.oclif.enableAutoTranspile = false;

await execute({ dir: import.meta.url });
