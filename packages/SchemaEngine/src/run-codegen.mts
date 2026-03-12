#!/usr/bin/env node
/**
 * Standalone CodeGen runner for RSU pipeline.
 *
 * Bypasses the oclif CLI framework (which has heavy dependencies that may not
 * be built in all environments) and calls CodeGenLib directly.
 *
 * Usage:
 *   node --loader ts-node/esm packages/SchemaEngine/src/run-codegen.mts
 *   -- OR (from dist) --
 *   node packages/SchemaEngine/dist/run-codegen.mjs
 *
 * Environment: Requires mj.config.cjs in the working directory (or ancestor)
 * and database connection env vars (DB_HOST, DB_DATABASE, etc.).
 */
import 'dotenv/config';

// Bootstrap class registrations so CodeGen can discover registered classes
await import('@memberjunction/server-bootstrap-lite/mj-class-registrations');

const { initializeConfig, runMemberJunctionCodeGeneration } = await import(
    '@memberjunction/codegen-lib'
);

// Initialize configuration from the current working directory
initializeConfig(process.cwd());

// Run full CodeGen pipeline (including database operations)
const skipDb = process.argv.includes('--skipdb');
await runMemberJunctionCodeGeneration(skipDb);
