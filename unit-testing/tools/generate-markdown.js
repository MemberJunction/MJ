#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generates a beautiful Markdown report with Mermaid charts
 * @param {string} runDir - Path to the run directory
 */
export function generateMarkdown(runDir) {
  const summaryFile = join(runDir, 'summary.json');
  const metadataFile = join(runDir, 'metadata.json');

  if (!existsSync(summaryFile)) {
    console.error(`❌ Summary file not found: ${summaryFile}`);
    console.error('   Run aggregate-results.js first');
    process.exit(1);
  }

  const summary = JSON.parse(readFileSync(summaryFile, 'utf-8'));
  const metadata = existsSync(metadataFile)
    ? JSON.parse(readFileSync(metadataFile, 'utf-8'))
    : {};

  const md = [];

  // Header
  md.push('# 🧪 Test Run Report\n');
  md.push(`**Run ID:** \`${metadata.runId || 'unknown'}\`  `);
  md.push(`**Timestamp:** ${metadata.timestamp || 'unknown'}  `);
  md.push(`**Duration:** ${formatDuration(summary.totalDuration)}  `);
  if (metadata.git) {
    md.push(`**Git Branch:** \`${metadata.git.branch}\`  `);
    md.push(`**Git Hash:** \`${metadata.git.hash}\`  `);
  }
  md.push('');

  // Overall results
  const passRate = summary.totalTests > 0
    ? ((summary.totalPassed / summary.totalTests) * 100).toFixed(1)
    : 0;

  md.push('## 📊 Overall Results\n');
  md.push('```mermaid');
  md.push('%%{init: {\'theme\':\'base\', \'themeVariables\': {\'pie1\':\'#4ade80\',\'pie2\':\'#f87171\',\'pie3\':\'#fbbf24\'}}}%%');
  md.push('pie title Test Results');
  md.push(`    "Passed (${passRate}%)" : ${summary.totalPassed}`);
  if (summary.totalFailed > 0) {
    md.push(`    "Failed" : ${summary.totalFailed}`);
  }
  if (summary.totalSkipped > 0) {
    md.push(`    "Skipped" : ${summary.totalSkipped}`);
  }
  md.push('```\n');

  // Summary stats
  md.push('### Summary Statistics\n');
  md.push('| Metric | Value |');
  md.push('|--------|-------|');
  md.push(`| Total Packages | ${summary.totalPackages} |`);
  md.push(`| Total Tests | ${summary.totalTests} |`);
  md.push(`| ✅ Passed | ${summary.totalPassed} |`);
  md.push(`| ❌ Failed | ${summary.totalFailed} |`);
  md.push(`| ⏭️ Skipped | ${summary.totalSkipped} |`);
  md.push(`| ⏱️ Duration | ${formatDuration(summary.totalDuration)} |`);
  md.push(`| 📈 Pass Rate | ${passRate}% |`);
  md.push('');

  // Performance - Top 10 slowest packages
  if (summary.packages.length > 0) {
    md.push('## ⏱️ Performance\n');
    md.push('### Top 10 Slowest Packages\n');

    const top10 = summary.packages.slice(0, 10);
    md.push('```mermaid');
    md.push('%%{init: {\'theme\':\'base\', \'themeVariables\': {\'xyChart\': {\'backgroundColor\': \'transparent\'}}}}%%');
    md.push('xychart-beta horizontal');
    md.push('    title "Package Execution Time (seconds)"');
    md.push('    x-axis [' + top10.map(p => `"${shortenPackageName(p.packageName)}"`).join(', ') + ']');
    md.push('    y-axis "Duration (s)" 0 --> ' + Math.ceil(top10[0].duration / 1000));
    md.push('    bar [' + top10.map(p => (p.duration / 1000).toFixed(2)).join(', ') + ']');
    md.push('```\n');
  }

  // Package results table
  md.push('## 📦 Package Results\n');
  md.push('| Package | Tests | ✅ Pass | ❌ Fail | ⏭️ Skip | ⏱️ Duration |');
  md.push('|---------|-------|---------|---------|---------|-----------|');

  for (const pkg of summary.packages) {
    const status = pkg.numFailedTests > 0 ? '❌' : '✅';
    md.push(`| ${status} ${shortenPackageName(pkg.packageName)} | ${pkg.numTotalTests} | ${pkg.numPassedTests} | ${pkg.numFailedTests} | ${pkg.numSkippedTests} | ${formatDuration(pkg.duration)} |`);
  }
  md.push('');

  // Failed tests details
  if (summary.failures.length > 0) {
    md.push(`## ❌ Failed Tests (${summary.failures.length})\n`);
    md.push('<details>');
    md.push('<summary>Click to expand failure details</summary>\n');

    for (const failure of summary.failures) {
      md.push(`### ${shortenPackageName(failure.package)}\n`);
      md.push(`**Test:** \`${failure.test}\`  `);
      md.push(`**File:** \`${failure.file}\`\n`);
      md.push('```');
      md.push(failure.message);
      md.push('```\n');
    }

    md.push('</details>\n');
  } else {
    md.push('## ✅ All Tests Passed!\n');
    md.push('🎉 No failures detected in this test run.\n');
  }

  // Footer
  md.push('---\n');
  md.push(`*Report generated at ${new Date().toISOString()}*  `);
  md.push('*Powered by MemberJunction Unit Testing Framework*');

  // Write summary.md
  const markdownFile = join(runDir, 'summary.md');
  writeFileSync(markdownFile, md.join('\n'));

  console.log(`✅ Generated Markdown report: ${markdownFile}`);

  return markdownFile;
}

/**
 * Formats duration in milliseconds to human-readable string
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(0);
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Shortens package name by removing @memberjunction/ prefix
 */
function shortenPackageName(name) {
  return name.replace('@memberjunction/', '');
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
  generateMarkdown(runDir);
}
