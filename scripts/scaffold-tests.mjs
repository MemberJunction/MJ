#!/usr/bin/env node

/**
 * Scaffold Vitest configuration for a MemberJunction package.
 *
 * Usage:
 *   node scripts/scaffold-tests.mjs packages/MJGlobal
 *   node scripts/scaffold-tests.mjs packages/AI/Engine
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';

const packageDir = process.argv[2];
if (!packageDir) {
  console.error('Usage: node scripts/scaffold-tests.mjs <package-directory>');
  process.exit(1);
}

const repoRoot = dirname(new URL(import.meta.url).pathname).replace('/scripts', '');
const fullPath = join(repoRoot, packageDir);

if (!existsSync(fullPath)) {
  console.error(`Package directory not found: ${fullPath}`);
  process.exit(1);
}

// Calculate relative path to repo root for shared config import
const relPath = relative(fullPath, repoRoot).replace(/\\/g, '/');

// 1. Create vitest.config.ts
const vitestConfig = `import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '${relPath}/vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      environment: 'node',
    },
  })
);
`;

const vitestConfigPath = join(fullPath, 'vitest.config.ts');
if (!existsSync(vitestConfigPath)) {
  writeFileSync(vitestConfigPath, vitestConfig, 'utf-8');
  console.log(`  Created ${vitestConfigPath}`);
} else {
  console.log(`  Skipped ${vitestConfigPath} (already exists)`);
}

// 2. Create src/__tests__/ directory
const testDir = join(fullPath, 'src', '__tests__');
mkdirSync(testDir, { recursive: true });
console.log(`  Created ${testDir}/`);

// 3. Read package.json to get package name
const pkgJsonPath = join(fullPath, 'package.json');
const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
const pkgName = pkgJson.name || 'unknown';

// 4. Create starter test file
const starterTest = `import { describe, it, expect } from 'vitest';

describe('${pkgName}', () => {
  it('should have a passing test', () => {
    expect(true).toBe(true);
  });
});
`;

const starterTestPath = join(testDir, 'index.test.ts');
if (!existsSync(starterTestPath)) {
  writeFileSync(starterTestPath, starterTest, 'utf-8');
  console.log(`  Created ${starterTestPath}`);
}

// 5. Update package.json scripts
let modified = false;
if (!pkgJson.scripts) pkgJson.scripts = {};

if (!pkgJson.scripts.test || pkgJson.scripts.test.includes('echo "Error')) {
  pkgJson.scripts.test = 'vitest run';
  modified = true;
}
if (!pkgJson.scripts['test:watch']) {
  pkgJson.scripts['test:watch'] = 'vitest';
  modified = true;
}

// Add vitest to devDependencies if not present
if (!pkgJson.devDependencies) pkgJson.devDependencies = {};
if (!pkgJson.devDependencies.vitest) {
  pkgJson.devDependencies.vitest = '^4.0.18';
  modified = true;
}

if (modified) {
  writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');
  console.log(`  Updated ${pkgJsonPath}`);
}

console.log(`\nDone! Package ${pkgName} is ready for testing.`);
console.log(`Run tests with: cd ${packageDir} && npm run test`);
