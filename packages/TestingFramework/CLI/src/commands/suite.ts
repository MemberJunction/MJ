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
     * @param contextUser - User context
     */
    async execute(suiteId: string | undefined, flags: SuiteFlags, contextUser: UserInfo): Promise<void> {
        try {
            const config = loadCLIConfig();
            const format = flags.format || config.defaultFormat;

            // Get engine instance
            const engine = TestEngine.Instance;
            await engine.Config(false, contextUser);

            let suite;

            if (suiteId) {
                // Run specific suite by ID
                suite = engine.GetTestSuiteByID(suiteId);
                if (!suite) {
                    console.error(OutputFormatter.formatError(`Test suite not found: ${suiteId}`));
                    process.exit(1);
                }
            } else if (flags.name) {
                // Run suite by name
                suite = engine.GetTestSuiteByName(flags.name);
                if (!suite) {
                    console.error(OutputFormatter.formatError(`Test suite not found: ${flags.name}`));
                    process.exit(1);
                }
            } else {
                console.error(OutputFormatter.formatError('Must specify suite ID or --name'));
                process.exit(1);
            }

            // Execute suite
            this.spinner.start(`Running test suite: ${suite.Name}...`);

            // Note: parallel and failFast are handled by RunSuite internally
            // We only pass the standard TestRunOptions
            const result = await engine.RunSuite(suite.ID, {
                verbose: flags.verbose
            }, contextUser);

            this.spinner.stop();

            // Format and display result
            const output = OutputFormatter.formatSuiteResult(result, format);
            console.log(output);

            // Write to file if requested
            OutputFormatter.writeToFile(output, flags.output);

            // Exit with appropriate code (non-zero if any test failed)
            process.exit(result.failedTests === 0 ? 0 : 1);

        } catch (error) {
            this.spinner.fail();
            console.error(OutputFormatter.formatError('Failed to run test suite', error as Error));
            process.exit(1);
        }
    }
}
