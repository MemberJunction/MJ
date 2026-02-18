#!/usr/bin/env node
/**
 * CLI entry point for QueryGen package
 *
 * Usage: mj-querygen <command> [options]
 *
 * Commands:
 *   generate  - Generate queries for entities
 *   validate  - Validate existing query templates
 *   export    - Export queries from database to metadata files
 */

import { Command } from 'commander';
import { createRequire } from 'node:module';
import { generateCommand } from './commands/generate';
import { validateCommand } from './commands/validate';
import { exportCommand } from './commands/export';

// Use createRequire to import JSON (compatible with ESM)
const require = createRequire(import.meta.url);
const packageJson = require('../../package.json') as { version: string };

const program = new Command();

program
  .name('mj-querygen')
  .description('AI-powered SQL query template generation for MemberJunction')
  .version(packageJson.version);

program
  .command('generate')
  .description('Generate queries for entities')
  .option('-e, --entities <names...>', 'Specific entities to generate queries for')
  .option('-x, --exclude-entities <names...>', 'Entities to exclude')
  .option('-s, --exclude-schemas <names...>', 'Schemas to exclude')
  .option('-m, --max-entities <number>', 'Max entities per group', '3')
  .option('-r, --max-refinements <number>', 'Max refinement iterations', '3')
  .option('-f, --max-fixes <number>', 'Max error-fixing attempts', '5')
  .option('--model <name>', 'Preferred AI model')
  .option('--vendor <name>', 'Preferred AI vendor')
  .option('-o, --output <path>', 'Output directory')
  .option('--mode <mode>', 'Output mode: metadata|database|both')
  .option('-v, --verbose', 'Verbose output')
  .action(generateCommand);

program
  .command('validate')
  .description('Validate existing query templates')
  .option('-p, --path <path>', 'Path to queries metadata file', './metadata/queries')
  .option('-v, --verbose', 'Verbose output')
  .action(validateCommand);

program
  .command('export')
  .description('Export queries from database to metadata files')
  .option('-o, --output <path>', 'Output directory')
  .option('-v, --verbose', 'Verbose output')
  .action(exportCommand);

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
