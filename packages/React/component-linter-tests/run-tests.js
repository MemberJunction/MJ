#!/usr/bin/env ts-node
"use strict";
/**
 * Linter Test Suite Runner
 *
 * Runs all linter validation tests with database connection
 *
 * Usage:
 *   npx ts-node run-linter-tests.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
const react_test_harness_1 = require("@memberjunction/react-test-harness");
const test_runner_1 = require("./src/infrastructure/test-runner");
const database_setup_1 = require("./src/infrastructure/database-setup");
// Store context user for tests
let contextUser;
// Base spec for query-based components
const baseQuerySpec = {
    name: 'TestComponent',
    type: 'chart',
    title: 'Test Component',
    description: 'Test component for linter validation',
    code: '',
    location: 'embedded',
    functionalRequirements: 'Test requirements',
    technicalDesign: 'Test design',
    dataRequirements: {
        mode: 'queries',
        queries: [{
                name: 'TestQuery',
                categoryPath: 'Test',
                fields: [],
                entityNames: []
            }]
    }
};
// Define tests
(0, test_runner_1.describe)('OptionalMemberExpression - Basic Invalid Properties', () => {
    (0, test_runner_1.it)('should detect result?.records (lowercase) - invalid property', async () => {
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
        const lintResult = await react_test_harness_1.ComponentLinter.lintComponent(code, 'TestComponent', baseQuerySpec, true, contextUser);
        const recordsViolation = lintResult.violations.find((v) => v.message.includes('records') &&
            v.message.includes('Results'));
        (0, test_runner_1.expect)(recordsViolation).toBeDefined();
        (0, test_runner_1.expect)(recordsViolation?.severity).toBe('critical');
    });
    (0, test_runner_1.it)('should detect result?.Rows (capitalized) - invalid property', async () => {
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
        const lintResult = await react_test_harness_1.ComponentLinter.lintComponent(code, 'TestComponent', baseQuerySpec, true, contextUser);
        const rowsViolation = lintResult.violations.find((v) => v.message.includes('Rows') &&
            v.message.includes('Results'));
        (0, test_runner_1.expect)(rowsViolation).toBeDefined();
        (0, test_runner_1.expect)(rowsViolation?.severity).toBe('critical');
    });
    (0, test_runner_1.it)('should NOT flag result?.Results - correct property', async () => {
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
        const lintResult = await react_test_harness_1.ComponentLinter.lintComponent(code, 'TestComponent', baseQuerySpec, true, contextUser);
        const invalidViolations = lintResult.violations.filter((v) => v.message.includes('.Results') &&
            v.message.includes("don't have"));
        (0, test_runner_1.expect)(invalidViolations).toHaveLength(0);
    });
});
(0, test_runner_1.describe)('Weak Fallback Chain Detection', () => {
    (0, test_runner_1.it)('should detect result?.records ?? result?.Rows ?? [] - EXACT BUG PATTERN', async () => {
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
        const lintResult = await react_test_harness_1.ComponentLinter.lintComponent(code, 'TestComponent', baseQuerySpec, true, contextUser);
        // Should detect either individual invalid properties OR weak fallback pattern
        const relevantViolations = lintResult.violations.filter((v) => (v.message.includes('records') || v.message.includes('Rows')) &&
            (v.message.includes('Results') || v.message.toLowerCase().includes('fallback')));
        (0, test_runner_1.expect)(relevantViolations.length).toBeGreaterThan(0);
    });
});
(0, test_runner_1.describe)('Regression Tests - Existing Patterns Should Still Work', () => {
    (0, test_runner_1.it)('should still catch regular member access (no optional chaining)', async () => {
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
        const lintResult = await react_test_harness_1.ComponentLinter.lintComponent(code, 'TestComponent', baseQuerySpec, true, contextUser);
        const recordsViolation = lintResult.violations.find((v) => v.message.includes('records') &&
            v.message.includes('Results'));
        (0, test_runner_1.expect)(recordsViolation).toBeDefined();
        (0, test_runner_1.expect)(recordsViolation?.severity).toBe('critical');
    });
});
// Main execution
async function main() {
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    Linter Test Suite Runner                                  ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
    try {
        // Initialize database connection
        console.log('🔄 Initializing database connection...');
        await (0, database_setup_1.initializeDatabase)();
        // Load context user
        console.log('🔄 Loading context user...');
        contextUser = await (0, database_setup_1.getContextUser)();
        console.log('\n' + '='.repeat(80));
        console.log('Running Tests...');
        console.log('='.repeat(80));
        // Run all tests
        const results = await (0, test_runner_1.runTests)();
        // Print summary
        console.log('\n' + '═'.repeat(80));
        console.log('📊 TEST SUMMARY');
        console.log('═'.repeat(80) + '\n');
        let totalPassed = 0;
        let totalFailed = 0;
        let totalDuration = 0;
        results.forEach((suite) => {
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
        }
        else {
            console.log('  ❌ Some tests failed\n');
            process.exit(1);
        }
    }
    catch (error) {
        console.error('\n❌ ERROR:', error);
        process.exit(1);
    }
    finally {
        await (0, database_setup_1.cleanupDatabase)();
    }
}
// Run tests
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=run-tests.js.map