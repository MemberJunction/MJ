#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import { dirname, join } from 'path';

console.log('🔧 Switching all Angular packages to ngc + bundler...\n');

const packageFiles = glob.sync('packages/Angular/**/package.json', {
  ignore: ['**/node_modules/**', '**/dist/**']
});

let packagesFixed = 0;
let tsconfigsFixed = 0;

for (const pkgPath of packageFiles) {
  const pkgContent = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(pkgContent);

  // Only process if build script exists
  if (pkg.scripts?.build) {
    console.log(`📦 ${pkg.name}`);

    // 1. Update package.json: ensure ngc
    if (pkg.scripts.build !== 'ngc') {
      pkg.scripts.build = 'ngc';
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      console.log(`  ✓ Updated build script to: ngc`);
      packagesFixed++;
    }

    // 2. Update tsconfig.json: moduleResolution "node" → "bundler"
    const tsconfigPath = join(dirname(pkgPath), 'tsconfig.json');
    try {
      const tsconfigContent = readFileSync(tsconfigPath, 'utf8');
      const tsconfig = JSON.parse(tsconfigContent);

      if (tsconfig.compilerOptions?.moduleResolution !== 'bundler') {
        tsconfig.compilerOptions.moduleResolution = 'bundler';
        writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf8');
        console.log(`  ✓ Updated moduleResolution to: bundler`);
        tsconfigsFixed++;
      }
    } catch (error) {
      console.log(`  ⚠ No tsconfig.json found`);
    }

    console.log('');
  }
}

console.log(`\n✅ Fixed ${packagesFixed} package.json files`);
console.log(`✅ Fixed ${tsconfigsFixed} tsconfig.json files`);
