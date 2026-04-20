#!/usr/bin/env node

/**
 * Sync Computer Use prompts from metadata to package source.
 *
 * This script:
 * 1. Reads prompt templates from metadata/prompts/templates/computer-use/
 * 2. Converts Nunjucks template syntax to simple {{placeholder}} syntax
 * 3. Escapes backticks for TypeScript string literals
 * 4. Writes to packages/AI/ComputerUse/src/prompts/
 *
 * Run this script before building to ensure package prompts match metadata.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths relative to script location
// Script is at: packages/AI/ComputerUse/scripts/
// Repo root is 4 levels up
const REPO_ROOT = join(__dirname, '../../../..');
const METADATA_DIR = join(REPO_ROOT, 'metadata/prompts/templates/computer-use');
const PACKAGE_PROMPTS_DIR = join(__dirname, '../src/prompts');

/**
 * Convert Nunjucks-style template to simple placeholder format.
 * Replaces conditional blocks with {{dynamicSections}} placeholder.
 */
function convertTemplate(content) {
    // The metadata templates have dynamic sections with Nunjucks conditionals.
    // The package uses {{dynamicSections}} placeholder instead, which is
    // filled programmatically by ComputerUseEngine.buildDynamicSections().

    // Find where the dynamic sections start (after "Available Actions")
    // and where they end (before "Response Format")
    const dynamicSectionsPattern = /\n({% if toolDefinitions[\s\S]*?{% endif %}[\s\S]*?(?=\n## Response Format))/;

    let result = content;

    // Replace the entire dynamic sections block with placeholder (with blank line after)
    result = result.replace(dynamicSectionsPattern, '\n{{dynamicSections}}\n');

    // Clean up any remaining Nunjucks artifacts
    result = result.replace(/{% if .*? %}[\s\S]*?{% endif %}/g, '');
    result = result.replace(/{% for .*? %}[\s\S]*?{% endfor %}/g, '');

    // Remove spaces from template variables to match engine expectations
    // {{ goal }} → {{goal}}
    result = result.replace(/\{\{\s+(\w+)\s+\}\}/g, '{{$1}}');

    return result;
}

/**
 * Escape backticks for TypeScript template literals.
 */
function escapeBackticks(content) {
    return content.replace(/`/g, '\\`');
}

/**
 * Generate TypeScript file content with proper header and export.
 */
function generateTsFile(content, type) {
    const isController = type === 'controller';
    const promptName = isController ? 'controller' : 'judge';
    const constantName = isController ? 'DEFAULT_CONTROLLER_PROMPT' : 'DEFAULT_JUDGE_PROMPT';
    const className = isController ? 'ComputerUseEngine' : 'LLMJudge';

    let header = `/**
 * Default ${promptName} ${isController ? 'system ' : ''}prompt for the Computer Use engine.
 *
 * This prompt is used by ${className} when no custom ${isController ? 'controller\n * prompt is provided via RunComputerUseParams.ControllerPrompt' : 'prompt is provided'}.
 * Layer 2 (${isController ? 'MJComputerUseEngine' : 'MJLLMJudge'}) typically overrides this ${isController ? 'entirely\n * by routing' : 'with an MJ prompt\n * entity rendered'} ${isController ? 'through' : 'via'} ${isController ? 'MJ prompt entities via' : ''} AIPromptRunner.`;

    if (isController) {
        header += `
 *
 * Dynamic sections (tools, credentials, feedback, step history) are
 * rendered programmatically in renderControllerPrompt() and injected
 * via the {{dynamicSections}} placeholder. This avoids the need for
 * a template engine.`;
    } else {
        header += `
 *
 * The prompt instructs the LLM to:
 * 1. Analyze the current screenshot against the stated goal
 * 2. Review the step history for progress assessment
 * 3. Return a structured JSON verdict`;
    }

    header += `
 */`;

    const escapedContent = escapeBackticks(content);

    return `${header}

export const ${constantName} = \`${escapedContent}\`;
`;
}

/**
 * Sync a single prompt file from metadata to package.
 */
function syncPrompt(type) {
    console.log(`\nSyncing ${type} prompt...`);

    const sourceFile = join(METADATA_DIR, `${type}.template.md`);
    const targetFile = join(PACKAGE_PROMPTS_DIR, `default-${type}.ts`);

    console.log(`  Reading: ${sourceFile}`);
    let content = readFileSync(sourceFile, 'utf8');

    // Convert template syntax
    content = convertTemplate(content);

    // Generate TypeScript file
    const tsContent = generateTsFile(content, type);

    console.log(`  Writing: ${targetFile}`);
    writeFileSync(targetFile, tsContent, 'utf8');

    console.log(`  ✓ ${type} prompt synced successfully`);
}

/**
 * Main execution
 */
function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Syncing Computer Use prompts from metadata to package...');
    console.log('═══════════════════════════════════════════════════════════');

    try {
        syncPrompt('controller');
        syncPrompt('judge');

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('✓ All prompts synced successfully');
        console.log('═══════════════════════════════════════════════════════════\n');
    } catch (error) {
        console.error('\n✗ Error syncing prompts:', error.message);
        process.exit(1);
    }
}

main();
