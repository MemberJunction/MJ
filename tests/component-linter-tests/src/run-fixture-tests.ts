#!/usr/bin/env ts-node
/**
 * Fixture-Based Linter Test Suite Runner
 *
 * Runs linter validation tests against real component specs loaded from fixtures.
 * This is the primary test runner for testing against actual production components.
 *
 * Usage:
 *   npm test:fixtures                    # Run fixture tests
 *   npm test:fixtures -- --verbose       # Run with detailed output
 */

import { runTests, SuiteResult } from './infrastructure/test-runner';
import { initializeDatabase, getContextUser, initializeComponentEngine, cleanupDatabase } from './infrastructure/database-setup';
import type { UserInfo } from '@memberjunction/core';
import {
  setContextUser,
  registerBulkBrokenTests,
  registerBulkFixedTests,
  registerBulkValidTests,
  displayFixtureStats
} from './tests/fixture-tests';

// Store context user for tests
let contextUser: UserInfo;

// Main execution
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              Fixture-Based Linter Test Suite Runner                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  try {
    // Initialize database connection
    console.log('🔄 Initializing MemberJunction...');
    await initializeDatabase();

    // Load real context user from database
    contextUser = await getContextUser();

    // Initialize ComponentMetadataEngine with context user
    await initializeComponentEngine(contextUser);

    // Set context user for fixture tests
    setContextUser(contextUser);

    // Display fixture statistics
    await displayFixtureStats();

    console.log('='.repeat(80));
    console.log('Running Fixture Tests...');
    console.log('='.repeat(80));

    // Register all fixture-based tests (must await since they load fixtures)
    await registerBulkBrokenTests();
    await registerBulkFixedTests();
    await registerBulkValidTests();

    // Run all tests
    const results = await runTests();

    // Print summary
    console.log('\n' + '═'.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(80) + '\n');

    let totalPassed = 0;
    let totalFailed = 0;
    let totalDuration = 0;

    results.forEach((suite: SuiteResult) => {
      totalPassed += suite.passed;
      totalFailed += suite.failed;
      totalDuration += suite.duration;
    });

    console.log(`  Total Suites: ${results.length}`);
    console.log(`  Total Tests:  ${totalPassed + totalFailed}`);
    console.log(`  Passed:       ${totalPassed} ✅`);
    console.log(`  Failed:       ${totalFailed} ${totalFailed > 0 ? '❌' : ''}`);
    console.log(`  Duration:     ${totalDuration}ms\n`);

    if (totalFailed === 0) {
      console.log('  🎉 All fixture tests passed!\n');
      process.exit(0);
    } else {
      console.log('  ❌ Some tests failed\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ ERROR:', error);
    process.exit(1);
  } finally {
    await cleanupDatabase();
  }
}

// Run tests
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
