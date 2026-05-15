/**
 * @fileoverview Run command implementation
 * @module @memberjunction/testing-cli
 */

import { TestEngine } from '@memberjunction/testing-engine';
import { UserInfo } from '@memberjunction/core';
import { RunFlags } from '../types';
import { OutputFormatter } from '../utils/output-formatter';
import { SpinnerManager } from '../utils/spinner-manager';
import { loadCLIConfig } from '../utils/config-loader';
import { initializeMJProvider, closeMJProvider, getContextUser } from '../lib/mj-provider';
import { parseVariableFlags, getTestVariablesSchema } from '../utils/variable-parser';
import { loadOraclesModule } from '../utils/oracle-module-loader';

/**
 * Run command - Execute a single test or filtered set of tests
 */
export class RunCommand {
    private spinner = new SpinnerManager();

    /**
     * Execute the run command
     *
     * @param testId - Optional test ID to run
     * @param flags - Command flags
     * @param contextUser - Optional user context (will be fetched if not provided)
     */
    async execute(testId: string | undefined, flags: RunFlags, contextUser?: UserInfo): Promise<void> {
        try {
            // Initialize MJ provider (database connection and metadata)
            await initializeMJProvider();

            // Get context user after initialization if not provided
            if (!contextUser) {
                contextUser = await getContextUser();
            }

            const config = loadCLIConfig();
            const format = flags.format || config.defaultFormat || 'console';
            const environment = flags.environment || config.defaultEnvironment;

            // Get engine instance
            const engine = TestEngine.Instance;
            await engine.Config(false, contextUser);

            // Plug in user-supplied oracles before resolving the test.
            if (flags.oraclesModule) {
                const summary = await loadOraclesModule(flags.oraclesModule, engine);
                console.log(
                    `Loaded oracle module ${summary.modulePath} ` +
                        `(registered: ${summary.registered.join(', ') || 'none'}` +
                        (summary.skipped.length ? `; skipped: ${summary.skipped.length}` : '') +
                        ')',
                );
            }

            let test;

            if (testId) {
                // Run specific test by ID
                test = engine.GetTestByID(testId);
                if (!test) {
                    console.error(OutputFormatter.formatError(`Test not found: ${testId}`));
                    process.exit(1);
                }
            } else if (flags.name) {
                // Run test by name
                test = engine.GetTestByName(flags.name);
                if (!test) {
                    console.error(OutputFormatter.formatError(`Test not found: ${flags.name}`));
                    process.exit(1);
                }
            } else if (flags.suite) {
                // Run test suite (delegate to suite command)
                console.error(OutputFormatter.formatError('Use "mj test suite" command to run test suites'));
                process.exit(1);
            } else if (flags.tag || flags.category || flags.difficulty) {
                // Run tests by filter
                console.error(OutputFormatter.formatError('Filtered test execution not yet implemented'));
                process.exit(1);
            } else if (flags.all) {
                // Run all tests
                console.error(OutputFormatter.formatError('Use "mj test suite" command to run all tests'));
                process.exit(1);
            } else {
                console.error(OutputFormatter.formatError('Must specify test ID, --name, or other filter'));
                process.exit(1);
            }

            // Parse variables from --var flags
            const variablesSchema = getTestVariablesSchema(engine, test.ID);
            const variables = parseVariableFlags(flags.var, variablesSchema);

            // Dry run mode — validate everything that would execute, but don't execute.
            // Catches misconfigured oracles, missing variables, and unregistered drivers
            // before burning LLM credits on a doomed run.
            if (flags.dryRun) {
                const issues = this.dryRunValidation(test, engine);
                console.log('');
                console.log(`  Test:        ${test.Name}`);
                console.log(`  ID:          ${test.ID}`);
                console.log(`  Type:        ${test.Type}`);
                console.log(`  Environment: ${environment}`);
                console.log(`  Status:      ${test.Status}`);
                if (variables && Object.keys(variables).length > 0) {
                    console.log(`  Variables:   ${JSON.stringify(variables)}`);
                }
                console.log('');

                if (issues.errors.length > 0) {
                    console.log(`  Errors (${issues.errors.length}):`);
                    for (const e of issues.errors) console.log(`    ✗ ${e}`);
                    console.log('');
                }
                if (issues.warnings.length > 0) {
                    console.log(`  Warnings (${issues.warnings.length}):`);
                    for (const w of issues.warnings) console.log(`    ⚠ ${w}`);
                    console.log('');
                }
                if (issues.info.length > 0) {
                    console.log(`  Configuration:`);
                    for (const i of issues.info) console.log(`    • ${i}`);
                    console.log('');
                }

                if (issues.errors.length === 0) {
                    console.log(OutputFormatter.formatSuccess('Dry run passed — test is ready to execute.'));
                } else {
                    console.error(OutputFormatter.formatError(`Dry run found ${issues.errors.length} error(s) — fix before executing.`));
                }

                await closeMJProvider();
                process.exit(issues.errors.length === 0 ? 0 : 1);
            }

            // Execute test
            this.spinner.start(`Running test: ${test.Name}...`);

            const result = await engine.RunTest(test.ID, {
                environment,
                verbose: flags.verbose,
                variables
            }, contextUser);

            this.spinner.stop();

            // Handle both single result and array of results (RepeatCount > 1)
            if (Array.isArray(result)) {
                // Multiple iterations - display summary and all results
                console.log(OutputFormatter.formatInfo(`Ran ${result.length} iterations`));

                let allPassed = true;
                for (const iterationResult of result) {
                    const output = OutputFormatter.formatTestResult(iterationResult, format);
                    console.log(output);

                    if (iterationResult.status !== 'Passed') {
                        allPassed = false;
                    }
                }

                // Write to file if requested (write all results as JSON array)
                if (flags.output) {
                    OutputFormatter.writeToFile(JSON.stringify(result, null, 2), flags.output);
                }

                // Clean up resources
                await closeMJProvider();

                // Exit with appropriate code (pass only if all iterations passed)
                process.exit(allPassed ? 0 : 1);
            } else {
                // Single result
                const output = OutputFormatter.formatTestResult(result, format);
                console.log(output);

                // Write to file if requested
                OutputFormatter.writeToFile(output, flags.output);

                // Clean up resources
                await closeMJProvider();

                // Exit with appropriate code
                process.exit(result.status === 'Passed' ? 0 : 1);
            }

        } catch (error) {
            this.spinner.fail();
            console.error(OutputFormatter.formatError('Failed to run test', error as Error));

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
     * Validate that a test is ready to execute without actually running it.
     * Catches misconfigured oracles, malformed JSON, and missing drivers.
     */
    private dryRunValidation(test: { Name: string; ID: string; Type: string; Status: string; TypeID: string; Configuration?: string | null; InputDefinition?: string | null; ExpectedOutcomes?: string | null }, engine: TestEngine): { errors: string[]; warnings: string[]; info: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];
        const info: string[] = [];

        if (test.Status !== 'Active') {
            warnings.push(`Test status is '${test.Status}' — only 'Active' tests run by default`);
        }

        // Verify the test type and driver exist
        const testType = engine.GetTestTypeByID(test.TypeID);
        if (!testType) {
            errors.push(`TestType not found for TypeID ${test.TypeID}`);
        } else {
            info.push(`Driver: ${testType.DriverClass}`);
        }

        // Validate Configuration JSON parses
        let config: { oracles?: Array<{ type: string; weight?: number; config?: Record<string, unknown> }>; scoringWeights?: Record<string, number> } | null = null;
        if (test.Configuration) {
            try {
                config = JSON.parse(test.Configuration);
            } catch (e) {
                errors.push(`Configuration is not valid JSON: ${(e as Error).message}`);
            }
        } else {
            warnings.push('No Configuration defined — test will use defaults');
        }

        // Validate InputDefinition JSON parses
        if (test.InputDefinition) {
            try {
                JSON.parse(test.InputDefinition);
            } catch (e) {
                errors.push(`InputDefinition is not valid JSON: ${(e as Error).message}`);
            }
        }

        // Validate ExpectedOutcomes JSON parses
        if (test.ExpectedOutcomes) {
            try {
                JSON.parse(test.ExpectedOutcomes);
            } catch (e) {
                errors.push(`ExpectedOutcomes is not valid JSON: ${(e as Error).message}`);
            }
        }

        // Verify each declared oracle exists in the registry
        if (config?.oracles && Array.isArray(config.oracles)) {
            const registeredOracles = engine.GetOracleTypes();
            const oracleSummary: string[] = [];
            for (const oracle of config.oracles) {
                if (!oracle.type) {
                    errors.push('Oracle entry missing required "type" field');
                    continue;
                }
                if (!registeredOracles.includes(oracle.type)) {
                    errors.push(
                        `Oracle type '${oracle.type}' is not registered. ` +
                        `Available: ${registeredOracles.join(', ')}`
                    );
                    continue;
                }
                const w = typeof oracle.weight === 'number' ? oracle.weight : 1;
                oracleSummary.push(`${oracle.type} (weight ${w})`);
            }
            if (oracleSummary.length > 0) {
                info.push(`Oracles: ${oracleSummary.join(', ')}`);
            }

            // Sanity-check scoringWeights matches oracles (sum should be ~1.0)
            if (config.scoringWeights) {
                const declaredOracleTypes = new Set(config.oracles.map(o => o.type));
                for (const weightedType of Object.keys(config.scoringWeights)) {
                    if (!declaredOracleTypes.has(weightedType)) {
                        warnings.push(
                            `scoringWeights references oracle '${weightedType}' that isn't in the oracles array`
                        );
                    }
                }
                const sum = Object.values(config.scoringWeights).reduce((a, b) => a + b, 0);
                if (Math.abs(sum - 1.0) > 0.001) {
                    warnings.push(`scoringWeights sum to ${sum.toFixed(3)}, expected ~1.0`);
                }
            }
        } else if (config) {
            warnings.push('No oracles defined in Configuration — test scoring will use driver defaults');
        }

        return { errors, warnings, info };
    }
}
