#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

// Find all Angular tsconfig.json files
const files = await glob('packages/Angular/**/tsconfig.json', {
  ignore: ['**/node_modules/**']
});

console.log(`Found ${files.length} tsconfig.json files in Angular packages`);

let modified = 0;
for (const file of files) {
  try {
    const content = readFileSync(file, 'utf8');
    const config = JSON.parse(content);

    // Check if skipLibCheck is already present
    if (config.compilerOptions && !config.compilerOptions.skipLibCheck) {
      // Add skipLibCheck
      config.compilerOptions.skipLibCheck = true;

      // Write back with pretty formatting
      writeFileSync(file, JSON.stringify(config, null, 2) + '\n', 'utf8');
      console.log(`✓ Updated: ${file}`);
      modified++;
    } else {
      console.log(`- Skipped: ${file} (already has skipLibCheck or no compilerOptions)`);
    }
  } catch (error) {
    console.error(`✗ Error processing ${file}:`, error.message);
  }
}

console.log(`\nModified ${modified} files`);
