/**
 * @fileoverview Validate command implementation
 * @module @memberjunction/testing-cli
 */

import { TestEngine } from '@memberjunction/testing-engine';
import { UserInfo } from '@memberjunction/core';
import { MJTestEntity } from '@memberjunction/core-entities';
import { ValidateFlags } from '../types';
import { UUIDsEqual } from '@memberjunction/global';
import { OutputFormatter } from '../utils/output-formatter';
import { SpinnerManager } from '../utils/spinner-manager';
import { initializeMJProvider, closeMJProvider, getContextUser } from '../lib/mj-provider';
import chalk from 'chalk';
import * as fs from 'fs';

/**
 * Validation result for a single test
 */
interface ValidationResult {
    testName: string;
    testId: string;
    valid: boolean;
    warnings: string[];
    errors: string[];
}

/**
 * Validate command - Validate test definitions without executing
 */
export class ValidateCommand {
    private spinner = new SpinnerManager();

    /**
     * Execute the validate command
     *
     * @param testId - Optional test ID to validate
     * @param flags - Command flags
     * @param contextUser - Optional user context (will be fetched if not provided)
     */
    async execute(testId: string | undefined, flags: ValidateFlags, contextUser?: UserInfo): Promise<void> {
        try {
            // Initialize MJ provider (database connection and metadata)
            await initializeMJProvider();

            // Get context user after initialization if not provided
            if (!contextUser) {
                contextUser = await getContextUser();
            }

            const engine = TestEngine.Instance;
            await engine.Config(false, contextUser);

            let testsToValidate: MJTestEntity[];

            if (testId) {
                // Validate specific test
                const test = engine.GetTestByID(testId);
                if (!test) {
                    console.error(OutputFormatter.formatError(`Test not found: ${testId}`));
                    process.exit(1);
                }
                testsToValidate = [test];
            } else if (flags.all) {
                // Validate all tests
                testsToValidate = engine.Tests;
            } else if (flags.type) {
                // Validate tests by type
                const type = engine.GetTestTypeByName(flags.type);
                if (!type) {
                    console.error(OutputFormatter.formatError(`Test type not found: ${flags.type}`));
                    process.exit(1);
                }
                testsToValidate = engine.Tests.filter(t => UUIDsEqual(t.TypeID, type.ID));
            } else {
                console.error(OutputFormatter.formatError('Must specify test ID, --all, or --type'));
                process.exit(1);
            }

            // Validate tests
            this.spinner.start(`Validating ${testsToValidate.length} test(s)...`);

            const results = testsToValidate.map(test => this.validateTest(test, engine));

            this.spinner.stop();

            // Display results
            this.displayResults(results);

            // Save report if requested
            if (flags.saveReport || flags.output) {
                const reportPath = flags.output || 'validation-report.md';
                this.saveReport(results, reportPath);
            }

            // Clean up resources
            await closeMJProvider();

            // Exit with appropriate code
            const hasErrors = results.some(r => !r.valid);
            process.exit(hasErrors ? 1 : 0);

        } catch (error) {
            this.spinner.fail();
            console.error(OutputFormatter.formatError('Failed to validate tests', error as Error));

            // Clean up resources before exit
            try {
                await closeMJProvider();
            } catch {
                // Ignore cleanup errors
            }

            process.exit(1);
        }
    }

    /**
     * Validate a single test
     */
    private validateTest(test: MJTestEntity, engine: TestEngine): ValidationResult {
        const result: ValidationResult = {
            testName: test.Name,
            testId: test.ID,
            valid: true,
            warnings: [],
            errors: []
        };

        // Check test type exists
        const testType = engine.GetTestTypeByID(test.TypeID);
        if (!testType) {
            result.errors.push(`Test type not found: ${test.TypeID}`);
            result.valid = false;
        }

        // Check status
        if (test.Status !== 'Active') {
            result.warnings.push(`Test is not active (status: ${test.Status})`);
        }

        // Validate InputDefinition
        if (test.InputDefinition) {
            try {
                JSON.parse(test.InputDefinition);
            } catch {
                result.errors.push('InputDefinition is not valid JSON');
                result.valid = false;
            }
        } else {
            result.warnings.push('No InputDefinition provided');
        }

        // Validate ExpectedOutcomes
        if (test.ExpectedOutcomes) {
            try {
                JSON.parse(test.ExpectedOutcomes);
            } catch {
                result.errors.push('ExpectedOutcomes is not valid JSON');
                result.valid = false;
            }
        } else {
            result.warnings.push('No ExpectedOutcomes defined');
        }

        // Validate Configuration (OracleConfiguration and TestConfiguration combined)
        if (test.Configuration) {
            try {
                JSON.parse(test.Configuration);
            } catch {
                result.errors.push('Configuration is not valid JSON');
                result.valid = false;
            }
        } else {
            result.warnings.push('No Configuration defined');
        }

        return result;
    }

    /**
     * Display validation results
     */
    private displayResults(results: ValidationResult[]): void {
        console.log(chalk.bold('\nValidating Tests...\n'));

        for (const result of results) {
            const symbol = result.valid ? chalk.green('✓') : chalk.red('✗');
            console.log(`${symbol} ${result.testName}`);

            if (result.valid && result.warnings.length === 0) {
                console.log(chalk.gray('  - No issues found'));
            }

            for (const error of result.errors) {
                console.log(chalk.red(`  ✗ Error: ${error}`));
            }

            for (const warning of result.warnings) {
                console.log(chalk.yellow(`  ⚠ Warning: ${warning}`));
            }

            console.log('');
        }

        // Summary
        const validCount = results.filter(r => r.valid).length;
        const warningCount = results.filter(r => r.warnings.length > 0).length;

        console.log(chalk.bold('[SUMMARY]'));

        if (validCount === results.length && warningCount === 0) {
            console.log(chalk.green(`All ${results.length} test(s) are valid with no warnings`));
        } else if (validCount === results.length) {
            console.log(chalk.yellow(`${validCount}/${results.length} test(s) valid, ${warningCount} with warnings`));
        } else {
            console.log(chalk.red(`${validCount}/${results.length} test(s) valid, ${results.length - validCount} with errors`));
        }

        console.log('');
    }

    /**
     * Save validation report to file
     */
    private saveReport(results: ValidationResult[], filePath: string): void {
        const lines: string[] = [];

        lines.push('# Test Validation Report');
        lines.push(`Generated: ${new Date().toISOString()}\n`);

        lines.push('## Summary\n');
        const validCount = results.filter(r => r.valid).length;
        const warningCount = results.filter(r => r.warnings.length > 0).length;

        lines.push(`- **Total Tests:** ${results.length}`);
        lines.push(`- **Valid:** ${validCount}`);
        lines.push(`- **Invalid:** ${results.length - validCount}`);
        lines.push(`- **With Warnings:** ${warningCount}\n`);

        lines.push('## Test Results\n');

        for (const result of results) {
            const status = result.valid ? '✓ Valid' : '✗ Invalid';
            lines.push(`### ${result.testName}`);
            lines.push(`**Status:** ${status}`);
            lines.push(`**ID:** ${result.testId}\n`);

            if (result.errors.length > 0) {
                lines.push('**Errors:**');
                for (const error of result.errors) {
                    lines.push(`- ${error}`);
                }
                lines.push('');
            }

            if (result.warnings.length > 0) {
                lines.push('**Warnings:**');
                for (const warning of result.warnings) {
                    lines.push(`- ${warning}`);
                }
                lines.push('');
            }

            if (result.valid && result.warnings.length === 0) {
                lines.push('No issues found.\n');
            }
        }

        const report = lines.join('\n');

        try {
            fs.writeFileSync(filePath, report, 'utf-8');
            console.log(OutputFormatter.formatSuccess(`Validation report saved to ${filePath}`));
        } catch (error) {
            console.error(OutputFormatter.formatError(`Failed to save report to ${filePath}`, error as Error));
        }
    }
}
