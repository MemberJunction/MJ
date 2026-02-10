#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Aggregates test results from all packages in a run directory
 * @param {string} runDir - Path to the run directory
 * @returns {object} Aggregated results
 */
export function aggregateResults(runDir) {
  const byPackageDir = join(runDir, 'by-package');

  if (!existsSync(byPackageDir)) {
    console.error(`❌ Directory not found: ${byPackageDir}`);
    process.exit(1);
  }

  const summary = {
    totalPackages: 0,
    totalTests: 0,
    totalPassed: 0,
    totalFailed: 0,
    totalSkipped: 0,
    totalDuration: 0,
    packages: [],
    failures: []
  };

  // Read all package result directories
  const packageDirs = readdirSync(byPackageDir).filter(name => {
    const path = join(byPackageDir, name);
    return statSync(path).isDirectory();
  });

  for (const packageName of packageDirs) {
    const resultsFile = join(byPackageDir, packageName, 'results.json');

    if (!existsSync(resultsFile)) {
      console.warn(`⚠️  No results.json found for ${packageName}`);
      continue;
    }

    try {
      const results = JSON.parse(readFileSync(resultsFile, 'utf-8'));

      // Extract stats from Vitest JSON reporter format
      const stats = {
        packageName,
        numTotalTests: results.numTotalTests || 0,
        numPassedTests: results.numPassedTests || 0,
        numFailedTests: results.numFailedTests || 0,
        numSkippedTests: results.numPendingTests || 0,
        duration: results.testResults?.reduce((sum, file) => sum + (file.perfStats?.runtime || 0), 0) || 0
      };

      summary.totalPackages++;
      summary.totalTests += stats.numTotalTests;
      summary.totalPassed += stats.numPassedTests;
      summary.totalFailed += stats.numFailedTests;
      summary.totalSkipped += stats.numSkippedTests;
      summary.totalDuration += stats.duration;
      summary.packages.push(stats);

      // Collect failures
      if (results.testResults) {
        for (const fileResult of results.testResults) {
          if (fileResult.status === 'failed' && fileResult.assertionResults) {
            for (const assertion of fileResult.assertionResults) {
              if (assertion.status === 'failed') {
                summary.failures.push({
                  package: packageName,
                  file: fileResult.name,
                  test: assertion.fullName || assertion.title,
                  message: assertion.failureMessages?.join('\n') || 'No error message'
                });
              }
            }
          }
        }
      }

    } catch (err) {
      console.error(`❌ Error parsing results for ${packageName}:`, err.message);
    }
  }

  // Sort packages by duration (slowest first)
  summary.packages.sort((a, b) => b.duration - a.duration);

  // Write summary.json
  const summaryFile = join(runDir, 'summary.json');
  writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

  console.log(`✅ Aggregated results from ${summary.totalPackages} packages`);
  console.log(`   Total tests: ${summary.totalTests}`);
  console.log(`   Passed: ${summary.totalPassed}`);
  console.log(`   Failed: ${summary.totalFailed}`);
  console.log(`   Skipped: ${summary.totalSkipped}`);
  console.log(`   Duration: ${(summary.totalDuration / 1000).toFixed(2)}s`);
  console.log(`   Summary: ${summaryFile}`);

  return summary;
}

/**
 * Find the most recent run directory (sorted by timestamp name)
 */
function findMostRecentRun() {
  const runsDir = join(__dirname, '..', 'runs');
  if (!existsSync(runsDir)) {
    console.error('❌ No runs directory found');
    process.exit(1);
  }

  const runs = readdirSync(runsDir)
    .filter(name => statSync(join(runsDir, name)).isDirectory())
    .sort()
    .reverse();

  if (runs.length === 0) {
    console.error('❌ No test runs found in runs/');
    process.exit(1);
  }

  return join(runsDir, runs[0]);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runDir = process.argv[2] || findMostRecentRun();
  aggregateResults(runDir);
}
