/**
 * @fileoverview Suite command implementation
 * @module @memberjunction/testing-cli
 */

import { TestEngine } from '@memberjunction/testing-engine';
import { UserInfo } from '@memberjunction/core';
import { SuiteFlags } from '../types';
import { OutputFormatter } from '../utils/output-formatter';
import { SpinnerManager } from '../utils/spinner-manager';
import { loadCLIConfig } from '../utils/config-loader';
import { initializeMJProvider, closeMJProvider, getContextUser } from '../lib/mj-provider';
import { parseVariableFlags } from '../utils/variable-parser';

/**
 * Suite command - Execute a test suite
 */
export class SuiteCommand {
    private spinner = new SpinnerManager();

    /**
     * Execute the suite command
     *
     * @param suiteId - Test suite ID to run
     * @param flags - Command flags
     * @param contextUser - Optional user context (will be fetched if not provided)
     */
    async execute(suiteId: string | undefined, flags: SuiteFlags, contextUser?: UserInfo): Promise<void> {
        try {
            // Initialize MJ provider (database connection and metadata)
            console.log('Initializing MJ provider...');
            await initializeMJProvider();
            console.log('MJ provider initialized successfully');

            // Get context user after initialization if not provided
            if (!contextUser) {
                contextUser = await getContextUser();
            }

            const config = loadCLIConfig();
            const format = flags.format || config.defaultFormat;

            // Get engine instance
            console.log('Getting TestEngine instance...');
            const engine = TestEngine.Instance;
            console.log('Configuring TestEngine...');
            await engine.Config(false, contextUser);
            console.log(`TestEngine configured. Test Types loaded: ${engine.TestTypes?.length || 0}`);
            console.log(`Test Suites loaded: ${engine.TestSuites?.length || 0}`);
            console.log(`Tests loaded: ${engine.Tests?.length || 0}`);

            let suite;

            if (suiteId) {
                // Run specific suite by ID
                console.log(`Looking for suite by ID: ${suiteId}`);
                suite = engine.GetTestSuiteByID(suiteId);
                if (!suite) {
                    console.error(OutputFormatter.formatError(`Test suite not found: ${suiteId}`));
                    console.error(`Available suites: ${engine.TestSuites?.map(s => s.Name).join(', ') || 'none'}`);
                    process.exit(1);
                }
            } else if (flags.name) {
                // Run suite by name
                console.log(`Looking for suite by name: ${flags.name}`);
                suite = engine.GetTestSuiteByName(flags.name);
                if (!suite) {
                    console.error(OutputFormatter.formatError(`Test suite not found: ${flags.name}`));
                    console.error(`Available suites: ${engine.TestSuites?.map(s => s.Name).join(', ') || 'none'}`);
                    process.exit(1);
                }
            } else {
                console.error(OutputFormatter.formatError('Must specify suite ID or --name'));
                process.exit(1);
            }

            // Parse variables from --var flags
            // Note: Suite variables apply to all tests - type conversion happens per-test
            const variables = parseVariableFlags(flags.var);

            // Execute suite
            this.spinner.start(`Running test suite: ${suite.Name}...`);

            // Note: parallel and failFast are handled by RunSuite internally
            // We only pass the standard TestRunOptions
            const result = await engine.RunSuite(suite.ID, {
                verbose: flags.verbose,
                variables
            }, contextUser);

            this.spinner.stop();

            // Format and display result
            const output = OutputFormatter.formatSuiteResult(result, format);
            console.log(output);

            // Write to file if requested
            OutputFormatter.writeToFile(output, flags.output);

            // Clean up resources
            await closeMJProvider();

            // Exit with appropriate code (non-zero if any test failed)
            process.exit(result.failedTests === 0 ? 0 : 1);

        } catch (error) {
            this.spinner.fail();
            console.error(OutputFormatter.formatError('Failed to run test suite', error as Error));

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
