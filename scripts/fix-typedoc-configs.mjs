#!/usr/bin/env node

/**
 * Script to find and fix typedoc.json files across all packages.
 *
 * Usage:
 *   node scripts/fix-typedoc-configs.mjs          # Dry run - shows what would change
 *   node scripts/fix-typedoc-configs.mjs --fix    # Actually apply fixes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');
const BASE_CONFIG_FILE = 'typedoc.base.json';

/**
 * Strip single-line comments from JSON (handles // comments)
 */
function stripJsonComments(jsonString) {
  return jsonString.replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Load and parse root typedoc.json to get excluded packages
 */
function loadRootConfig() {
  const rootConfigPath = path.join(REPO_ROOT, 'typedoc.json');
  const content = fs.readFileSync(rootConfigPath, 'utf8');
  const cleanedContent = stripJsonComments(content);
  return JSON.parse(cleanedContent);
}

/**
 * Extract package paths from the exclude array
 */
function getExcludedPackagePaths(rootConfig) {
  const excludes = rootConfig.exclude || [];
  const packageExcludes = [];

  for (const exclude of excludes) {
    // Match patterns like "packages/SomeName/" or "packages/Nested/SomeName/"
    const match = exclude.match(/^packages\/(.+?)\/$/);
    if (match) {
      packageExcludes.push(match[1]); // e.g., "DocUtils" or "AngularElements/mj-angular-elements-demo"
    }
  }

  return packageExcludes;
}

const dryRun = !process.argv.includes('--fix');

if (dryRun) {
  console.log('🔍 DRY RUN MODE - No changes will be made. Use --fix to apply changes.\n');
} else {
  console.log('🔧 FIX MODE - Changes will be applied.\n');
}

// Load excluded packages from root config
const rootConfig = loadRootConfig();
const excludedPackagePaths = getExcludedPackagePaths(rootConfig);
console.log(`Loaded ${excludedPackagePaths.length} excluded package paths from root typedoc.json\n`);

/**
 * Find all package directories by looking for package.json files
 */
function findPackageDirectories(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Check if this directory has a package.json
      const packageJsonPath = path.join(fullPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        results.push(fullPath);
      }
      // Continue searching subdirectories
      findPackageDirectories(fullPath, results);
    }
  }

  return results;
}

/**
 * Calculate the relative path from a package directory to the repo root
 */
function getRelativePathToRoot(packageDir) {
  const relativePath = path.relative(packageDir, REPO_ROOT);
  return relativePath;
}

/**
 * Calculate the correct extends path for a package
 */
function getCorrectExtendsPath(packageDir) {
  const relativeToRoot = getRelativePathToRoot(packageDir);
  return path.posix.join(relativeToRoot.split(path.sep).join('/'), BASE_CONFIG_FILE);
}

/**
 * The correct entry points array - TypeDoc will use whichever files exist
 */
const CORRECT_ENTRY_POINTS = ['src/index.ts', 'src/public-api.ts'];

/**
 * Generate the correct typedoc.json content for a package
 */
function generateTypedocConfig(packageDir) {
  const extendsPath = getCorrectExtendsPath(packageDir);

  return {
    extends: [extendsPath],
    entryPoints: CORRECT_ENTRY_POINTS
  };
}

/**
 * Check if the config is fully correct (extends path and entry points)
 */
function isConfigCorrect(existingConfig, packageDir) {
  const correctPath = getCorrectExtendsPath(packageDir);
  const existingExtends = existingConfig.extends;
  const existingEntryPoints = existingConfig.entryPoints;

  // Check extends - handle both array and string formats
  let extendsCorrect = false;
  if (Array.isArray(existingExtends)) {
    extendsCorrect = existingExtends.length === 1 && existingExtends[0] === correctPath;
  } else {
    extendsCorrect = existingExtends === correctPath;
  }

  // Check entry points
  const entryPointsCorrect =
    Array.isArray(existingEntryPoints) &&
    existingEntryPoints.length === CORRECT_ENTRY_POINTS.length &&
    CORRECT_ENTRY_POINTS.every((ep) => existingEntryPoints.includes(ep));

  return extendsCorrect && entryPointsCorrect;
}

/**
 * Check if a package should be excluded from documentation
 */
function isExcludedPackage(packageDir) {
  const packageRelativePath = path.relative(PACKAGES_DIR, packageDir);
  // Check if this package path matches any excluded path
  return excludedPackagePaths.some(
    (excludePath) => packageRelativePath === excludePath || packageRelativePath.replace(/\\/g, '/') === excludePath
  );
}

/**
 * Main processing function
 */
function processPackages() {
  const packageDirs = findPackageDirectories(PACKAGES_DIR);

  const stats = {
    total: 0,
    excluded: 0,
    correct: 0,
    created: 0,
    fixed: 0,
    errors: []
  };

  console.log(`Found ${packageDirs.length} packages to check.\n`);

  for (const packageDir of packageDirs) {
    stats.total++;
    const packageName = path.relative(PACKAGES_DIR, packageDir);
    const typedocPath = path.join(packageDir, 'typedoc.json');

    // Skip excluded packages
    if (isExcludedPackage(packageDir)) {
      stats.excluded++;
      console.log(`⏭️  SKIP (excluded): ${packageName}`);
      continue;
    }

    const expectedConfig = generateTypedocConfig(packageDir);

    if (fs.existsSync(typedocPath)) {
      // Check existing config
      try {
        const existingContent = fs.readFileSync(typedocPath, 'utf8');
        const existingConfig = JSON.parse(existingContent);

        if (isConfigCorrect(existingConfig, packageDir)) {
          stats.correct++;
          console.log(`✅ OK: ${packageName}`);
        } else {
          // Need to fix
          if (dryRun) {
            console.log(`⚠️  NEEDS FIX: ${packageName}`);
            console.log(`   Current:  ${JSON.stringify(existingConfig)}`);
            console.log(`   Expected: ${JSON.stringify(expectedConfig)}`);
          } else {
            fs.writeFileSync(typedocPath, JSON.stringify(expectedConfig, null, 2) + '\n');
            console.log(`🔧 FIXED: ${packageName}`);
          }
          stats.fixed++;
        }
      } catch (err) {
        stats.errors.push({ package: packageName, error: err.message });
        console.log(`❌ ERROR reading ${packageName}: ${err.message}`);
      }
    } else {
      // Need to create
      if (dryRun) {
        console.log(`📝 NEEDS CREATE: ${packageName}`);
        console.log(`   Config: ${JSON.stringify(expectedConfig)}`);
      } else {
        fs.writeFileSync(typedocPath, JSON.stringify(expectedConfig, null, 2) + '\n');
        console.log(`📝 CREATED: ${packageName}`);
      }
      stats.created++;
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total packages:     ${stats.total}`);
  console.log(`Excluded:           ${stats.excluded}`);
  console.log(`Already correct:    ${stats.correct}`);
  console.log(`${dryRun ? 'Would create' : 'Created'}:        ${stats.created}`);
  console.log(`${dryRun ? 'Would fix' : 'Fixed'}:           ${stats.fixed}`);

  if (stats.errors.length > 0) {
    console.log(`Errors:             ${stats.errors.length}`);
    for (const err of stats.errors) {
      console.log(`  - ${err.package}: ${err.error}`);
    }
  }

  if (dryRun && (stats.created > 0 || stats.fixed > 0)) {
    console.log('\n💡 Run with --fix to apply these changes.');
  }
}

// Run the script
processPackages();
