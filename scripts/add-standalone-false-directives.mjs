#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

console.log('🔍 Finding Angular directive files...\n');

// Find all directive files in Angular packages
const files = await glob('packages/Angular/**/*.directive.ts', {
  ignore: ['**/node_modules/**', '**/dist/**']
});

console.log(`Found ${files.length} directive files\n`);

let modified = 0;
let alreadyStandalone = 0;
let errors = 0;

for (const file of files) {
  try {
    const content = readFileSync(file, 'utf8');

    // Check if file has @Directive decorator
    if (!content.includes('@Directive')) {
      console.log(`⚠️  Skipped: ${file} (no @Directive decorator)`);
      continue;
    }

    // Check if already has standalone property
    if (content.match(/@Directive\s*\(\s*\{[^}]*standalone\s*:/s)) {
      alreadyStandalone++;
      console.log(`-  Skipped: ${file} (already has standalone property)`);
      continue;
    }

    // Add standalone: false to @Directive decorator
    const updatedContent = content.replace(
      /@Directive\s*\(\s*\{/,
      '@Directive({\n  standalone: false,'
    );

    if (updatedContent !== content) {
      writeFileSync(file, updatedContent, 'utf8');
      modified++;
      console.log(`✓  Updated: ${file}`);
    } else {
      console.log(`⚠️  Warning: ${file} (could not modify)`);
    }
  } catch (error) {
    errors++;
    console.error(`✗  Error processing ${file}:`, error.message);
  }
}

console.log('\n' + '='.repeat(80));
console.log('📊 Summary:');
console.log(`   Modified: ${modified} files`);
console.log(`   Already had standalone: ${alreadyStandalone} files`);
console.log(`   Errors: ${errors} files`);
console.log(`   Total processed: ${files.length} files`);
console.log('='.repeat(80));

if (errors > 0) {
  process.exit(1);
}
