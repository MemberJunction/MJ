#!/usr/bin/env node

/**
 * Auto-fix missing dependencies across the MemberJunction monorepo
 *
 * This script:
 * 1. Runs Knip to detect missing (unlisted) dependencies
 * 2. Parses the output to group by package
 * 3. Adds missing dependencies to each package.json
 * 4. Runs npm install to update lock file
 *
 * Usage:
 *   node scripts/fix-missing-dependencies.mjs [--dry-run] [--package=<path>]
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const targetPackage = args.find(arg => arg.startsWith('--package='))?.split('=')[1];

console.log('🔍 Analyzing missing dependencies with Knip...\n');

// Run Knip to get missing dependencies in compact format (shows full names)
let knipOutput;
try {
  knipOutput = execSync('npx knip --include unlisted --reporter compact', {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
} catch (error) {
  // Knip exits with error code when issues found, but we still get output
  knipOutput = error.stdout || '';
}

if (!knipOutput || knipOutput.trim() === '') {
  console.log('✅ No missing dependencies found!');
  process.exit(0);
}

// Parse Knip compact output
// Format: file-path: dep1, dep2, dep3
const lines = knipOutput.split('\n').filter(line => line.trim());
const missingDeps = new Map(); // Map<packagePath, Set<depName>>

for (const line of lines) {
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) continue;

  const filePath = line.substring(0, colonIndex).trim();
  const depsString = line.substring(colonIndex + 1).trim();

  if (!depsString) continue;

  // Determine which package this file belongs to
  const packagePath = findPackageForFile(filePath);
  if (!packagePath) continue;

  // Filter by target package if specified
  if (targetPackage && !packagePath.includes(targetPackage)) continue;

  if (!missingDeps.has(packagePath)) {
    missingDeps.set(packagePath, new Set());
  }

  // Split dependencies by comma and add each one
  const deps = depsString.split(',').map(d => d.trim()).filter(d => d);
  for (const dep of deps) {
    missingDeps.get(packagePath).add(dep);
  }
}

console.log(`📦 Found ${missingDeps.size} packages with missing dependencies\n`);

if (missingDeps.size === 0) {
  console.log('✅ No missing dependencies to fix!');
  process.exit(0);
}

// Get current version for @memberjunction packages from an actual MJ package
let mjVersion = '2.122.1'; // fallback
try {
  const corePackageJson = JSON.parse(readFileSync(join(ROOT_DIR, 'packages/MJCoreEntities/package.json'), 'utf8'));
  mjVersion = corePackageJson.version;
} catch (e) {
  // Use fallback version
}

// Process each package
const changes = [];
let totalDepsAdded = 0;

for (const [packagePath, deps] of missingDeps.entries()) {
  const packageJsonPath = join(ROOT_DIR, packagePath, 'package.json');

  if (!existsSync(packageJsonPath)) {
    console.warn(`⚠️  Package.json not found: ${packageJsonPath}`);
    continue;
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const packageName = packageJson.name || packagePath;

  // Initialize dependencies if not exists
  if (!packageJson.dependencies) {
    packageJson.dependencies = {};
  }

  const depsToAdd = [];

  for (const dep of deps) {
    // Skip if already in dependencies or devDependencies
    if (packageJson.dependencies[dep] || packageJson.devDependencies?.[dep]) {
      continue;
    }

    // Determine version
    let version;
    if (dep.startsWith('@memberjunction/')) {
      version = mjVersion;
    } else if (dep.startsWith('@progress/kendo-angular-')) {
      // Use fixed version for Kendo packages to match Angular 18
      version = '16.2.0';
    } else if (dep.startsWith('@angular/')) {
      // Use fixed version for Angular packages
      version = '18.0.2';
    } else {
      // Try to find version from another package that uses it
      version = findVersionInWorkspace(dep) || 'latest';
    }

    depsToAdd.push({ dep, version });
  }

  if (depsToAdd.length === 0) continue;

  // Sort and add dependencies
  depsToAdd.sort((a, b) => a.dep.localeCompare(b.dep));

  for (const { dep, version } of depsToAdd) {
    packageJson.dependencies[dep] = version;
  }

  // Sort dependencies alphabetically
  packageJson.dependencies = Object.keys(packageJson.dependencies)
    .sort()
    .reduce((acc, key) => {
      acc[key] = packageJson.dependencies[key];
      return acc;
    }, {});

  changes.push({
    packagePath,
    packageName,
    packageJsonPath,
    packageJson,
    depsAdded: depsToAdd
  });

  totalDepsAdded += depsToAdd.length;

  console.log(`📦 ${packageName}`);
  console.log(`   Path: ${relative(ROOT_DIR, packagePath)}`);
  console.log(`   Adding ${depsToAdd.length} dependencies:`);
  for (const { dep, version } of depsToAdd) {
    console.log(`   + ${dep}@${version}`);
  }
  console.log();
}

if (changes.length === 0) {
  console.log('✅ All dependencies already declared properly!');
  process.exit(0);
}

console.log(`\n📊 Summary:`);
console.log(`   Packages to update: ${changes.length}`);
console.log(`   Total dependencies to add: ${totalDepsAdded}\n`);

if (isDryRun) {
  console.log('🔍 DRY RUN - No changes written');
  console.log('   Run without --dry-run to apply changes\n');
  process.exit(0);
}

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
  console.log('\n✅ All missing dependencies fixed!');
  console.log('\n💡 Next steps:');
  console.log('   1. Review the changes with: git diff');
  console.log('   2. Test the build: npm run build');
  console.log('   3. Commit the changes');
} catch (error) {
  console.error('\n❌ npm install failed. Please fix errors and try again.');
  process.exit(1);
}

// Helper functions

function findPackageForFile(filePath) {
  // Convert file path to package directory
  // e.g., packages/Actions/CoreActions/src/action.ts -> packages/Actions/CoreActions

  const parts = filePath.split('/');

  // Find the package directory (contains package.json)
  for (let i = parts.length - 1; i >= 0; i--) {
    const testPath = parts.slice(0, i + 1).join('/');
    const packageJsonPath = join(ROOT_DIR, testPath, 'package.json');
    if (existsSync(packageJsonPath)) {
      return testPath;
    }
  }

  return null;
}

function findVersionInWorkspace(packageName) {
  // Search for package version in workspace packages
  try {
    const workspaceDirs = [
      'packages',
      'packages/Actions',
      'packages/Actions/BizApps',
      'packages/AI',
      'packages/AI/Providers',
      'packages/AI/Recommendations',
      'packages/AI/Vectors',
      'packages/AI/AgentManager',
      'packages/Communication',
      'packages/Communication/providers',
      'packages/Templates',
      'packages/Angular',
      'packages/Angular/Explorer',
      'packages/Angular/Generic',
      'packages/React',
      'packages/Scheduling',
      'packages/TestingFramework'
    ];

    for (const dir of workspaceDirs) {
      const dirPath = join(ROOT_DIR, dir);
      if (!existsSync(dirPath)) continue;

      const entries = readdirSync(dirPath);

      for (const entry of entries) {
        const packageJsonPath = join(dirPath, entry, 'package.json');
        if (!existsSync(packageJsonPath)) continue;

        try {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
          const version = packageJson.dependencies?.[packageName] ||
                         packageJson.devDependencies?.[packageName];
          if (version) return version;
        } catch (e) {
          // Skip invalid package.json
        }
      }
    }
  } catch (error) {
    // Ignore errors
  }

  return null;
}
