#!/usr/bin/env node
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createTestRun } from './create-run.js';
import { aggregateResults } from './aggregate-results.js';
import { generateMarkdown } from './generate-markdown.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..', '..');

/**
 * Finds all packages with vitest.config.ts
 */
function findPackagesWithTests() {
  const packages = [];
  const searchPaths = [
    'packages',
    'packages/Actions',
    'packages/Actions/BizApps',
    'packages/AI',
    'packages/AI/Providers',
    'packages/Angular',
    'packages/Angular/Explorer',
    'packages/Angular/Generic',
    'packages/Communication',
    'packages/Communication/providers',
    'packages/React',
    'packages/TestingFramework'
  ];

  for (const searchPath of searchPaths) {
    const fullPath = join(repoRoot, searchPath);
    if (!existsSync(fullPath)) continue;

    const dirs = readdirSync(fullPath);
    for (const dir of dirs) {
      const packagePath = join(fullPath, dir);
      try {
        if (statSync(packagePath).isDirectory()) {
          const vitestConfig = join(packagePath, 'vitest.config.ts');
          const packageJson = join(packagePath, 'package.json');
          if (existsSync(vitestConfig) && existsSync(packageJson)) {
            const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'));
            packages.push({
              path: packagePath,
              name: pkg.name || dir,
              relPath: join(searchPath, dir)
            });
          }
        }
      } catch (err) {
        // Skip
      }
    }
  }

  return packages;
}

/**
 * Runs tests for a single package and collects results
 */
function runPackageTests(pkg, runDir) {
  const packageResultDir = join(runDir, 'by-package', pkg.name.replace('@memberjunction/', ''));
  mkdirSync(packageResultDir, { recursive: true });

  const resultsFile = join(packageResultDir, 'results.json');

  console.log(`\n📦 Testing ${pkg.name}...`);

  try {
    // Run vitest with JSON reporter
    execSync(`npm test -- --reporter=json --outputFile=${resultsFile}`, {
      cwd: pkg.path,
      stdio: 'pipe',
      encoding: 'utf-8'
    });

    console.log(`   ✅ Passed`);
    return { success: true, pkg };
  } catch (err) {
    // Tests failed, but JSON output should still be written
    console.log(`   ❌ Failed`);
    return { success: false, pkg, error: err.message };
  }
}

/**
 * Orchestrates a complete test run
 */
async function runAllTests() {
  console.log('🧪 MemberJunction Unit Testing Suite\n');
  console.log('═'.repeat(80));

  // Step 1: Create run directory
  console.log('\n📁 Step 1: Creating test run directory...');
  const runDir = createTestRun();

  // Step 2: Discover packages
  console.log('\n🔍 Step 2: Discovering packages with tests...');
  const packages = findPackagesWithTests();
  console.log(`   Found ${packages.length} packages`);

  // Step 3: Run tests
  console.log('\n🚀 Step 3: Running tests...');
  const startTime = Date.now();
  const results = [];

  for (const pkg of packages) {
    const result = runPackageTests(pkg, runDir);
    results.push(result);
  }

  const endTime = Date.now();
  const duration = endTime - startTime;

  // Update metadata
  const metadataFile = join(runDir, 'metadata.json');
  const metadata = JSON.parse(readFileSync(metadataFile, 'utf-8'));
  metadata.endTime = new Date(endTime).toISOString();
  metadata.duration = duration;
  metadata.packagesRun = packages.length;
  writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

  // Step 4: Aggregate
  console.log('\n📊 Step 4: Aggregating results...');
  const summary = aggregateResults(runDir);

  // Step 5: Generate markdown
  console.log('\n📝 Step 5: Generating Markdown report...');
  generateMarkdown(runDir);

  // Final summary
  console.log('\n' + '═'.repeat(80));
  console.log('✅ Test Run Complete!\n');
  console.log(`📁 Run: unit-testing/runs/${runDir.split('/').pop()}`);
  console.log(`📊 JSON: summary.json`);
  console.log(`📝 Report: summary.md`);
  console.log('');
  console.log(`Packages: ${summary.totalPackages}`);
  console.log(`Tests: ${summary.totalTests}`);
  console.log(`✅ Passed: ${summary.totalPassed}`);
  console.log(`❌ Failed: ${summary.totalFailed}`);
  console.log(`⏭️  Skipped: ${summary.totalSkipped}`);
  console.log(`⏱️  Duration: ${formatDuration(duration)}`);

  if (summary.totalFailed > 0) {
    console.log(`\n⚠️  ${summary.totalFailed} test(s) failed. See summary.md for details.`);
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  }
}

function formatDuration(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(0);
  return `${minutes}m ${remainingSeconds}s`;
}

// Run
runAllTests().catch(err => {
  console.error('❌ Fatal error:', err);
  console.error(err.stack);
  process.exit(1);
});
