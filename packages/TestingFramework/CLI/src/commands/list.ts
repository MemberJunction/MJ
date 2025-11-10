/**
 * @fileoverview List command implementation
 * @module @memberjunction/testing-cli
 */

import { TestEngine } from '@memberjunction/testing-engine';
import { UserInfo } from '@memberjunction/core';
import { TestEntity, TestSuiteEntity, TestTypeEntity } from '@memberjunction/core-entities';
import { ListFlags } from '../types';
import { OutputFormatter } from '../utils/output-formatter';
import chalk from 'chalk';

/**
 * List command - List available tests, suites, and types
 */
export class ListCommand {
    /**
     * Execute the list command
     *
     * @param flags - Command flags
     * @param contextUser - User context
     */
    async execute(flags: ListFlags, contextUser: UserInfo): Promise<void> {
        try {
            const engine = TestEngine.Instance;
            await engine.Config(false, contextUser);

            if (flags.types) {
                this.listTestTypes(engine);
            } else if (flags.suites) {
                this.listTestSuites(engine, flags);
            } else {
                this.listTests(engine, flags);
            }

        } catch (error) {
            console.error(OutputFormatter.formatError('Failed to list tests', error as Error));
            process.exit(1);
        }
    }

    /**
     * List test types
     */
    private listTestTypes(engine: TestEngine): void {
        const types = engine.TestTypes;

        console.log(chalk.bold(`\nTest Types (${types.length}):\n`));

        for (const type of types) {
            console.log(chalk.cyan(`  ${type.Name}`));
            if (type.Description) {
                console.log(chalk.gray(`    ${type.Description}`));
            }
        }

        console.log('');
    }

    /**
     * List test suites
     */
    private listTestSuites(engine: TestEngine, flags: ListFlags): void {
        let suites = engine.TestSuites;

        // Apply filters
        if (flags.status) {
            suites = suites.filter(s => s.Status?.toLowerCase() === flags.status?.toLowerCase());
        }

        console.log(chalk.bold(`\nTest Suites (${suites.length}):\n`));

        for (const suite of suites) {
            const testCount = this.getTestCountForSuite(engine, suite);
            console.log(chalk.cyan(`  ${suite.Name}`) + chalk.gray(` (${testCount} tests)`));

            if (suite.Description) {
                console.log(chalk.gray(`    ${suite.Description}`));
            }

            if (flags.verbose && suite.Configuration) {
                console.log(chalk.gray(`    Config: ${suite.Configuration}`));
            }
        }

        console.log('');
    }

    /**
     * List tests
     */
    private listTests(engine: TestEngine, flags: ListFlags): void {
        let tests = engine.Tests;

        // Apply filters
        if (flags.type) {
            const type = engine.GetTestTypeByName(flags.type);
            if (type) {
                tests = tests.filter(t => t.TypeID === type.ID);
            }
        }

        if (flags.tag) {
            tests = tests.filter(t => {
                if (!t.Tags) return false;
                try {
                    const tags = JSON.parse(t.Tags) as string[];
                    return tags.includes(flags.tag!);
                } catch {
                    return false;
                }
            });
        }

        if (flags.status) {
            tests = tests.filter(t => t.Status?.toLowerCase() === flags.status?.toLowerCase());
        }

        // Group by type
        const typeMap = new Map<string, TestEntity[]>();
        const types = engine.TestTypes;

        for (const test of tests) {
            const type = types.find(t => t.ID === test.TypeID);
            const typeName = type?.Name || 'Unknown';

            if (!typeMap.has(typeName)) {
                typeMap.set(typeName, []);
            }

            typeMap.get(typeName)!.push(test);
        }

        console.log(chalk.bold(`\nAvailable Tests (${tests.length}):\n`));

        for (const [typeName, testsInType] of typeMap) {
            console.log(chalk.bold.cyan(`${typeName} (${testsInType.length}):`));

            for (const test of testsInType) {
                const tags = this.formatTags(test.Tags);

                console.log(`  ${chalk.white(test.Name)} ${tags}`);

                if (flags.verbose && test.Description) {
                    console.log(chalk.gray(`    ${test.Description}`));
                }
            }

            console.log('');
        }
    }

    /**
     * Get test count for a suite
     */
    private getTestCountForSuite(engine: TestEngine, suite: TestSuiteEntity): number {
        if (!suite.Configuration) return 0;

        try {
            const config = JSON.parse(suite.Configuration) as { testIds?: string[] };
            return config.testIds?.length || 0;
        } catch {
            return 0;
        }
    }

    /**
     * Format tags for display
     */
    private formatTags(tagsJson: string | null): string {
        if (!tagsJson) return '';

        try {
            const tags = JSON.parse(tagsJson) as string[];
            return chalk.gray(`Tags: ${tags.join(', ')}`);
        } catch {
            return '';
        }
    }
}
