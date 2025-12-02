#!/usr/bin/env node

/**
 * Remove unused dependencies across the MemberJunction monorepo
 *
 * This script:
 * 1. Runs Knip to detect unused dependencies
 * 2. Parses the output to group by package
 * 3. Removes unused dependencies from each package.json
 * 4. Runs npm install to update lock file
 *
 * Usage:
 *   node scripts/remove-unused-dependencies.mjs [--dry-run] [--package=<path>]
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const targetPackage = args.find(arg => arg.startsWith('--package='))?.split('=')[1];

console.log('🔍 Analyzing unused dependencies with Knip...\n');

// Run Knip to get unused dependencies
let knipOutput;
try {
  knipOutput = execSync('npm run deps:unused --silent', {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
} catch (error) {
  // Knip exits with error code when issues found, but we still get output
  knipOutput = error.stdout || '';
}

if (!knipOutput || knipOutput.trim() === '') {
  console.log('✅ No unused dependencies found!');
  process.exit(0);
}

// Parse Knip output
// Format: package-name  package.json:line:column
const lines = knipOutput.split('\n').filter(line => line.trim());
const unusedDeps = new Map(); // Map<packageJsonPath, Set<depName>>

for (const line of lines) {
  const match = line.match(/^(@?[^\s]+)\s+(.+package\.json):\d+:\d+/);
  if (!match) continue;

  const [, depName, packageJsonPath] = match;

  // Filter by target package if specified
  if (targetPackage && !packageJsonPath.includes(targetPackage)) continue;

  if (!unusedDeps.has(packageJsonPath)) {
    unusedDeps.set(packageJsonPath, new Set());
  }
  unusedDeps.get(packageJsonPath).add(depName);
}

console.log(`📦 Found ${unusedDeps.size} packages with unused dependencies\n`);

if (unusedDeps.size === 0) {
  console.log('✅ No unused dependencies to remove!');
  process.exit(0);
}

// Process each package
const changes = [];
let totalDepsRemoved = 0;

for (const [packageJsonPathRelative, deps] of unusedDeps.entries()) {
  const packageJsonPath = join(ROOT_DIR, packageJsonPathRelative);

  if (!existsSync(packageJsonPath)) {
    console.warn(`⚠️  Package.json not found: ${packageJsonPath}`);
    continue;
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const packageName = packageJson.name || packageJsonPathRelative;

  const depsToRemove = [];

  for (const dep of deps) {
    // Check if it exists in dependencies or devDependencies
    if (packageJson.dependencies?.[dep]) {
      depsToRemove.push({ dep, type: 'dependencies' });
    } else if (packageJson.devDependencies?.[dep]) {
      depsToRemove.push({ dep, type: 'devDependencies' });
    }
  }

  if (depsToRemove.length === 0) continue;

  // Remove dependencies
  for (const { dep, type } of depsToRemove) {
    delete packageJson[type][dep];
  }

  changes.push({
    packageName,
    packageJsonPath,
    packageJson,
    depsRemoved: depsToRemove
  });

  totalDepsRemoved += depsToRemove.length;

  console.log(`📦 ${packageName}`);
  console.log(`   Path: ${relative(ROOT_DIR, packageJsonPath)}`);
  console.log(`   Removing ${depsToRemove.length} dependencies:`);
  for (const { dep, type } of depsToRemove) {
    console.log(`   - ${dep} (from ${type})`);
  }
  console.log();
}

if (changes.length === 0) {
  console.log('✅ No unused dependencies to remove!');
  process.exit(0);
}

console.log(`\n📊 Summary:`);
console.log(`   Packages to update: ${changes.length}`);
console.log(`   Total dependencies to remove: ${totalDepsRemoved}\n`);

if (isDryRun) {
  console.log('🔍 DRY RUN - No changes written');
  console.log('   Run without --dry-run to apply changes\n');
  process.exit(0);
}

// Confirm before removing
console.log('⚠️  WARNING: This will remove dependencies from package.json files.');
console.log('   Make sure you have committed your work before proceeding.\n');
console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

await new Promise(resolve => setTimeout(resolve, 5000));

// Write changes
console.log('✍️  Writing changes...\n');
for (const { packageJsonPath, packageJson, packageName } of changes) {
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
  console.log(`✅ Updated ${packageName}`);
}

console.log('\n📦 Running npm install to update lock file...');
try {
  execSync('npm install', {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });
  console.log('\n✅ All unused dependencies removed!');
  console.log('\n💡 Next steps:');
  console.log('   1. Review the changes with: git diff');
  console.log('   2. Test the build: npm run build');
  console.log('   3. If builds succeed, commit the changes');
  console.log('   4. If builds fail, restore with: git restore package.json packages/*/package.json');
} catch (error) {
  console.error('\n❌ npm install failed. Please fix errors and try again.');
  process.exit(1);
}
