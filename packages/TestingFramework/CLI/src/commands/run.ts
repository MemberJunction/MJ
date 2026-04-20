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

            // Dry run mode
            if (flags.dryRun) {
                console.log(OutputFormatter.formatInfo(`Would run test: ${test.Name}`));
                console.log(OutputFormatter.formatInfo(`Type: ${test.Type}`));
                console.log(OutputFormatter.formatInfo(`Environment: ${environment}`));
                if (variables) {
                    console.log(OutputFormatter.formatInfo(`Variables: ${JSON.stringify(variables)}`));
                }
                return;
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
}
