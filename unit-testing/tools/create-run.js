#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Creates a new timestamped test run directory
 * Returns the run directory path
 */
export function createTestRun() {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '')
    .replace(/\..+/, '')
    .replace(/-/g, '_')
    .substring(0, 15); // YYYY_MM_DD_HHMM

  const runsDir = join(__dirname, '..', 'runs');
  const runDir = join(runsDir, timestamp);
  const byPackageDir = join(runDir, 'by-package');

  // Create directories
  mkdirSync(runDir, { recursive: true });
  mkdirSync(byPackageDir, { recursive: true });

  // Get git metadata
  let gitHash = 'unknown';
  let gitBranch = 'unknown';
  try {
    gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch (err) {
    // Not a git repo or git not available
  }

  // Create metadata.json
  const metadata = {
    timestamp: now.toISOString(),
    runId: timestamp,
    git: {
      hash: gitHash,
      branch: gitBranch
    },
    startTime: now.toISOString(),
    endTime: null,
    duration: null
  };

  writeFileSync(
    join(runDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  console.log(`✅ Created test run: ${timestamp}`);
  console.log(`   Directory: ${runDir}`);
  console.log(`   Git: ${gitBranch} (${gitHash})`);

  return runDir;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createTestRun();
}
