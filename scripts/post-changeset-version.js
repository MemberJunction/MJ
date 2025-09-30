#!/usr/bin/env node

/**
 * Post-changeset-version hook
 *
 * This script runs after `changeset version` to ensure @memberjunction/core
 * and @memberjunction/global remain pinned at 2.100.3.
 *
 * Why needed: Changesets may modify these packages despite being in the ignore list,
 * due to fixed groups and internal dependency resolution.
 *
 * This is a temporary measure while core@2.101.0+ has npm registry 403 issues.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PINNED_VERSION = '2.100.3';
const CORE_PACKAGE_PATH = path.join(__dirname, '../packages/MJCore/package.json');
const GLOBAL_PACKAGE_PATH = path.join(__dirname, '../packages/MJGlobal/package.json');

console.log('\n🔒 Post-changeset-version: Ensuring core and global remain pinned...\n');

let needsNpmInstall = false;

/**
 * Check and fix a package's version
 */
function checkAndFixPackageVersion(packagePath, packageName) {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  if (pkg.version !== PINNED_VERSION) {
    console.log(`  ⚠️  ${packageName} version changed to ${pkg.version}, restoring to ${PINNED_VERSION}`);
    pkg.version = PINNED_VERSION;
    fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
    needsNpmInstall = true;
    return true;
  }

  console.log(`  ✅ ${packageName} version is correct: ${PINNED_VERSION}`);
  return false;
}

/**
 * Check and fix core's dependency on global
 */
function checkAndFixCoreDependency() {
  const corePkg = JSON.parse(fs.readFileSync(CORE_PACKAGE_PATH, 'utf8'));

  if (corePkg.dependencies?.['@memberjunction/global'] !== PINNED_VERSION) {
    console.log(`  ⚠️  Core's global dependency changed, restoring to ${PINNED_VERSION}`);
    corePkg.dependencies['@memberjunction/global'] = PINNED_VERSION;
    fs.writeFileSync(CORE_PACKAGE_PATH, JSON.stringify(corePkg, null, 2) + '\n');
    needsNpmInstall = true;
    return true;
  }

  console.log(`  ✅ Core's global dependency is correct: ${PINNED_VERSION}`);
  return false;
}

/**
 * Recursively find all package.json files
 */
function findPackageJsonFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip node_modules and hidden directories
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      findPackageJsonFiles(fullPath, files);
    } else if (entry.name === 'package.json') {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Scan all package.json files and fix core/global dependencies
 */
function fixAllDependencies() {
  console.log('  🔍 Scanning all packages for core/global dependencies...');

  const packagesDir = path.join(__dirname, '../packages');
  const packageFiles = findPackageJsonFiles(packagesDir);

  let fixedCount = 0;

  for (const pkgPath of packageFiles) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    let modified = false;

    // Check dependencies
    if (pkg.dependencies?.['@memberjunction/core'] && pkg.dependencies['@memberjunction/core'] !== PINNED_VERSION) {
      pkg.dependencies['@memberjunction/core'] = PINNED_VERSION;
      modified = true;
    }

    if (pkg.dependencies?.['@memberjunction/global'] && pkg.dependencies['@memberjunction/global'] !== PINNED_VERSION) {
      pkg.dependencies['@memberjunction/global'] = PINNED_VERSION;
      modified = true;
    }

    // Check devDependencies
    if (pkg.devDependencies?.['@memberjunction/core'] && pkg.devDependencies['@memberjunction/core'] !== PINNED_VERSION) {
      pkg.devDependencies['@memberjunction/core'] = PINNED_VERSION;
      modified = true;
    }

    if (pkg.devDependencies?.['@memberjunction/global'] && pkg.devDependencies['@memberjunction/global'] !== PINNED_VERSION) {
      pkg.devDependencies['@memberjunction/global'] = PINNED_VERSION;
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      fixedCount++;
      needsNpmInstall = true;
    }
  }

  if (fixedCount > 0) {
    console.log(`  ⚠️  Fixed ${fixedCount} package(s) with incorrect core/global dependencies`);
  } else {
    console.log(`  ✅ All core/global dependencies are correct`);
  }
}

// Run checks
console.log('Step 1: Checking pinned package versions...');
checkAndFixPackageVersion(CORE_PACKAGE_PATH, '@memberjunction/core');
checkAndFixPackageVersion(GLOBAL_PACKAGE_PATH, '@memberjunction/global');

console.log('\nStep 2: Checking core\'s dependency on global...');
checkAndFixCoreDependency();

console.log('\nStep 3: Scanning all packages...');
fixAllDependencies();

// Run npm install if changes were made
if (needsNpmInstall) {
  console.log('\nStep 4: Running npm install to update lockfile...');
  try {
    execSync('npm install', {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    console.log('  ✅ Lockfile updated');
  } catch (error) {
    console.error('  ✗ Failed to update lockfile:', error.message);
    process.exit(1);
  }
} else {
  console.log('\nStep 4: No changes needed, skipping npm install');
}

console.log('\n✅ Post-changeset-version complete: core and global remain at 2.100.3\n');
