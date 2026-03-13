#!/usr/bin/env ts-node
/**
 * Linter Test Suite Runner
 *
 * Runs all linter validation tests with database connection
 *
 * Usage:
 *   npx ts-node run-linter-tests.ts
 */

import { ComponentLinter } from '@memberjunction/react-test-harness';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { describe, it, expect, runTests, SuiteResult } from './infrastructure/test-runner';
import { initializeDatabase, getContextUser, cleanupDatabase } from './infrastructure/database-setup';
import type { UserInfo } from '@memberjunction/core';

// Store context user for tests
let contextUser: UserInfo;

// Base spec for query-based components (cast to any to avoid strict type checking for test spec)
const baseQuerySpec = {
  name: 'TestComponent',
  type: 'chart' as const,
  title: 'Test Component',
  description: 'Test component for linter validation',
  code: '',
  location: 'embedded' as const,
  functionalRequirements: 'Test requirements',
  technicalDesign: 'Test design',
  exampleUsage: '<TestComponent />',
  dataRequirements: {
    mode: 'queries' as const,
    queries: [{
      name: 'TestQuery',
      categoryPath: 'Test',
      fields: [],
      entityNames: []
    }],
    entities: []
  }
} as ComponentSpec;

// Define tests
describe('OptionalMemberExpression - Basic Invalid Properties', () => {
  it('should detect result?.records (lowercase) - invalid property', async () => {
    const code = `
      function TestComponent({ utilities }) {
        const [data, setData] = React.useState([]);

        const loadData = async () => {
          const result = await utilities.rq.RunQuery({
            QueryName: 'TestQuery'
          });

          // ❌ WRONG - using result?.records
          const rows = result?.records ?? [];
          setData(rows);
        };

        return React.createElement('div', null, data.length + ' items');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(
      code,
      'TestComponent',
      baseQuerySpec,
      true,
      contextUser
    );

    const recordsViolation = lintResult.violations.find((v: any) =>
      v.message.includes('records') &&
      v.message.includes('Results')
    );

    expect(recordsViolation).toBeDefined();
    expect(recordsViolation?.severity).toBe('critical');
  });

  it('should detect result?.Rows (capitalized) - invalid property', async () => {
    const code = `
      function TestComponent({ utilities }) {
        const loadData = async () => {
          const result = await utilities.rq.RunQuery({
            QueryName: 'TestQuery'
          });

          // ❌ WRONG - using result?.Rows
          return result?.Rows ?? [];
        };

        return React.createElement('div', null, 'Test');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(
      code,
      'TestComponent',
      baseQuerySpec,
      true,
      contextUser
    );

    const rowsViolation = lintResult.violations.find((v: any) =>
      v.message.includes('Rows') &&
      v.message.includes('Results')
    );

    expect(rowsViolation).toBeDefined();
    expect(rowsViolation?.severity).toBe('critical');
  });

  it('should NOT flag result?.Results - correct property', async () => {
    const code = `
      function TestComponent({ utilities }) {
        const loadData = async () => {
          const result = await utilities.rq.RunQuery({
            QueryName: 'TestQuery'
          });

          // ✅ CORRECT - using result?.Results
          const data = result?.Results ?? [];
          return data;
        };

        return React.createElement('div', null, 'Test');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(
      code,
      'TestComponent',
      baseQuerySpec,
      true,
      contextUser
    );

    const invalidViolations = lintResult.violations.filter((v: any) =>
      v.message.includes('.Results') &&
      v.message.includes("don't have")
    );

    expect(invalidViolations).toHaveLength(0);
  });
});

describe('Weak Fallback Chain Detection', () => {
  it('should detect result?.records ?? result?.Rows ?? [] - EXACT BUG PATTERN', async () => {
    const code = `
      function TestComponent({ utilities }) {
        const loadData = async () => {
          const result = await utilities.rq.RunQuery({
            QueryName: 'TestQuery'
          });

          // ❌ WRONG - This is the EXACT bug pattern
          const rows = result?.records ?? result?.Rows ?? [];
          return rows;
        };

        return React.createElement('div', null, 'Test');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(
      code,
      'TestComponent',
      baseQuerySpec,
      true,
      contextUser
    );

    // Should detect either individual invalid properties OR weak fallback pattern
    const relevantViolations = lintResult.violations.filter((v: any) =>
      (v.message.includes('records') || v.message.includes('Rows')) &&
      (v.message.includes('Results') || v.message.toLowerCase().includes('fallback'))
    );

    expect(relevantViolations.length).toBeGreaterThan(0);
  });
});

describe('Regression Tests - Existing Patterns Should Still Work', () => {
  it('should still catch regular member access (no optional chaining)', async () => {
    const code = `
      function TestComponent({ utilities }) {
        const loadData = async () => {
          const result = await utilities.rq.RunQuery({
            QueryName: 'TestQuery'
          });

          // ❌ WRONG - regular member access (existing test case)
          const data = result.records || [];
          return data;
        };

        return React.createElement('div', null, 'Test');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(
      code,
      'TestComponent',
      baseQuerySpec,
      true,
      contextUser
    );

    const recordsViolation = lintResult.violations.find((v: any) =>
      v.message.includes('records') &&
      v.message.includes('Results')
    );

    expect(recordsViolation).toBeDefined();
    expect(recordsViolation?.severity).toBe('critical');
  });
});

// Main execution
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Linter Test Suite Runner                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  try {
    // Initialize database connection
    console.log('🔄 Initializing MemberJunction...');
    await initializeDatabase();

    // Context user is optional - only needed for library-dependent components
    // For basic property validation tests, we can skip it
    console.log('ℹ️  Running without context user (tests use simple specs without libraries)');
    contextUser = null as any; // Tests will pass undefined to lintComponent

    console.log('\n' + '='.repeat(80));
    console.log('Running Tests...');
    console.log('='.repeat(80));

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
      console.log('  🎉 All tests passed!\n');
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
