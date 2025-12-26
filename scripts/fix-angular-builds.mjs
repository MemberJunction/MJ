#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import { dirname, join } from 'path';

console.log('🔧 Fixing Angular package builds...\n');

// Find all Angular packages with ngc build script
const packageFiles = glob.sync('packages/Angular/**/package.json', {
  ignore: ['**/node_modules/**', '**/dist/**']
});

let packagesFixed = 0;
let tsconfigsFixed = 0;

for (const pkgPath of packageFiles) {
  const pkgContent = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(pkgContent);

  // Check if this package uses ngc
  if (pkg.scripts?.build === 'ngc') {
    console.log(`📦 ${pkg.name}`);

    // 1. Update package.json: ngc → tsc
    pkg.scripts.build = 'tsc';
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`  ✓ Updated build script: ngc → tsc`);
    packagesFixed++;

    // 2. Update tsconfig.json: moduleResolution "node" → "bundler"
    const tsconfigPath = join(dirname(pkgPath), 'tsconfig.json');
    try {
      const tsconfigContent = readFileSync(tsconfigPath, 'utf8');
      const tsconfig = JSON.parse(tsconfigContent);

      if (tsconfig.compilerOptions?.moduleResolution === 'node') {
        tsconfig.compilerOptions.moduleResolution = 'bundler';
        writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf8');
        console.log(`  ✓ Updated moduleResolution: node → bundler`);
        tsconfigsFixed++;
      } else {
        console.log(`  ℹ moduleResolution already set to: ${tsconfig.compilerOptions?.moduleResolution || 'undefined'}`);
      }
    } catch (error) {
      console.log(`  ⚠ No tsconfig.json found`);
    }

    console.log('');
  }
}

console.log(`\n✅ Fixed ${packagesFixed} package.json files`);
console.log(`✅ Fixed ${tsconfigsFixed} tsconfig.json files`);
console.log(`\n🎉 All Angular packages updated! Run 'npm run build' to verify.`);
