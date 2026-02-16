/**
 * @fileoverview List command implementation
 * @module @memberjunction/testing-cli
 */

import { TestEngine, VariableResolver } from '@memberjunction/testing-engine';
import { TestVariableDefinition } from '@memberjunction/testing-engine-base';
import { UserInfo } from '@memberjunction/core';
import { MJTestEntity, MJTestSuiteEntity, MJTestTypeEntity } from '@memberjunction/core-entities';
import { ListFlags } from '../types';
import { OutputFormatter } from '../utils/output-formatter';
import { initializeMJProvider, closeMJProvider, getContextUser } from '../lib/mj-provider';
import chalk from 'chalk';

/**
 * List command - List available tests, suites, and types
 */
export class ListCommand {
    /**
     * Execute the list command
     *
     * @param flags - Command flags
     * @param contextUser - Optional user context (will be fetched if not provided)
     */
    async execute(flags: ListFlags, contextUser?: UserInfo): Promise<void> {
        try {
            // Initialize MJ provider (database connection and metadata)
            await initializeMJProvider();

            // Get context user after initialization if not provided
            if (!contextUser) {
                contextUser = await getContextUser();
            }

            const engine = TestEngine.Instance;
            await engine.Config(false, contextUser);

            if (flags.types) {
                this.listTestTypes(engine, flags);
            } else if (flags.suites) {
                this.listTestSuites(engine, flags);
            } else {
                this.listTests(engine, flags);
            }

            // Clean up resources
            await closeMJProvider();

        } catch (error) {
            console.error(OutputFormatter.formatError('Failed to list tests', error as Error));

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
     * List test types
     */
    private listTestTypes(engine: TestEngine, flags?: ListFlags): void {
        const types = engine.TestTypes;

        console.log(chalk.bold(`\nTest Types (${types.length}):\n`));

        for (const type of types) {
            console.log(chalk.cyan(`  ${type.Name}`));
            if (type.Description) {
                console.log(chalk.gray(`    ${type.Description}`));
            }

            // Show variables if flag is set
            if (flags?.showVariables && type.VariablesSchema) {
                const variables = this.parseVariablesSchema(type.VariablesSchema);
                if (variables.length > 0) {
                    console.log(chalk.yellow(`    Variables:`));
                    for (const variable of variables) {
                        this.displayVariable(variable, 6);
                    }
                }
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
        const typeMap = new Map<string, MJTestEntity[]>();
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

        const resolver = new VariableResolver();

        for (const [typeName, testsInType] of typeMap) {
            console.log(chalk.bold.cyan(`${typeName} (${testsInType.length}):`));

            for (const test of testsInType) {
                const tags = this.formatTags(test.Tags);

                console.log(`  ${chalk.white(test.Name)} ${tags}`);

                if (flags.verbose && test.Description) {
                    console.log(chalk.gray(`    ${test.Description}`));
                }

                // Show variables if flag is set
                if (flags.showVariables) {
                    const testType = types.find(t => t.ID === test.TypeID);
                    if (testType?.VariablesSchema) {
                        const variables = resolver.getAvailableVariables(
                            testType.VariablesSchema,
                            test.Variables
                        );
                        if (variables.length > 0) {
                            console.log(chalk.yellow(`    Variables:`));
                            for (const variable of variables) {
                                this.displayVariable(variable, 6);
                            }
                        }
                    }
                }
            }

            console.log('');
        }
    }

    /**
     * Get test count for a suite
     */
    private getTestCountForSuite(engine: TestEngine, suite: MJTestSuiteEntity): number {
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

    /**
     * Parse variables schema JSON
     */
    private parseVariablesSchema(schemaJson: string): TestVariableDefinition[] {
        try {
            const resolver = new VariableResolver();
            const schema = resolver.parseTypeSchema(schemaJson);
            return schema?.variables || [];
        } catch {
            return [];
        }
    }

    /**
     * Display a single variable definition
     */
    private displayVariable(variable: TestVariableDefinition, indent: number): void {
        const prefix = ' '.repeat(indent);
        const required = variable.required ? chalk.red('*') : '';
        const defaultVal = variable.defaultValue !== undefined
            ? chalk.gray(` (default: ${variable.defaultValue})`)
            : '';

        console.log(`${prefix}${chalk.white(variable.name)}${required}: ${chalk.cyan(variable.dataType)}${defaultVal}`);

        if (variable.description) {
            console.log(`${prefix}  ${chalk.gray(variable.description)}`);
        }

        if (variable.possibleValues && variable.possibleValues.length > 0) {
            const values = variable.possibleValues.map(pv => pv.value).join(', ');
            console.log(`${prefix}  ${chalk.gray(`Values: [${values}]`)}`);
        }
    }
}
