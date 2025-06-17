import { Command, Flags } from '@oclif/core';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import { ValidationService } from '../../services/ValidationService';
import { FormattingService } from '../../services/FormattingService';
import { ValidationOptions } from '../../types/validation';
import { loadMJConfig } from '../../config';
import { initializeProvider } from '../../lib/provider-utils';
import ora from 'ora-classic';

export default class Validate extends Command {
    static description = 'Validate metadata files for correctness and dependencies';

    static examples = [
        `<%= config.bin %> <%= command.id %>`,
        `<%= config.bin %> <%= command.id %> --verbose`,
        `<%= config.bin %> <%= command.id %> --format=json`,
        `<%= config.bin %> <%= command.id %> --dir=./metadata`,
        `<%= config.bin %> <%= command.id %> --no-report`,
        `<%= config.bin %> <%= command.id %> -o validation-results.md`,
    ];

    static flags = {
        dir: Flags.string({ 
            description: 'Directory to validate (defaults to current directory)',
            default: process.cwd()
        }),
        verbose: Flags.boolean({ 
            char: 'v', 
            description: 'Show detailed validation output' 
        }),
        format: Flags.string({
            description: 'Output format',
            options: ['human', 'json'],
            default: 'human'
        }),
        'max-depth': Flags.integer({
            description: 'Maximum nesting depth before warning',
            default: 10
        }),
        'no-best-practices': Flags.boolean({
            description: 'Skip best practice checks'
        }),
        'no-report': Flags.boolean({
            description: 'Skip saving validation report to markdown file'
        }),
        'output-file': Flags.string({
            char: 'o',
            description: 'Custom output filename for report'
        })
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(Validate);
        const spinner = ora();
        
        const options: ValidationOptions = {
            verbose: flags.verbose,
            outputFormat: flags.format as 'human' | 'json',
            maxNestingDepth: flags['max-depth'],
            checkBestPractices: !flags['no-best-practices']
        };
        
        try {
            // Load MJ config and initialize provider
            spinner.start('Loading configuration');
            const mjConfig = loadMJConfig();
            if (!mjConfig) {
                spinner.fail('No mj.config.cjs found');
                this.error('No mj.config.cjs found in current directory or parent directories');
            }
            
            spinner.stop();
            await initializeProvider(mjConfig);
            
            const validator = new ValidationService(options);
            const formatter = new FormattingService();
            
            const resolvedPath = path.resolve(flags.dir);
            
            if (options.outputFormat === 'human') {
                this.log(chalk.blue(`Validating metadata in: ${resolvedPath}`));
                this.log('');
            }
            
            const result = await validator.validateDirectory(resolvedPath);
            
            // Save report by default (unless --no-report is specified)
            if (!flags['no-report']) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                const defaultFilename = `validation-report-${timestamp}.md`;
                const outputFile = flags['output-file'] || defaultFilename;
                // Save to the validation directory by default
                const outputPath = path.resolve(resolvedPath, outputFile);
                
                const markdownReport = formatter.formatValidationResultAsMarkdown(result);
                fs.writeFileSync(outputPath, markdownReport, 'utf8');
                
                if (options.outputFormat === 'human') {
                    this.log(chalk.gray(`\nReport saved to: ${outputPath}`));
                }
            }
            
            if (options.outputFormat === 'json') {
                this.log(formatter.formatValidationResultAsJson(result));
            } else {
                const output = formatter.formatValidationResult(result, options.verbose);
                this.log(output);
            }
            
            // Exit with error code if validation failed
            if (!result.isValid) {
                this.exit(1);
            }
        } catch (error) {
            if (options.outputFormat === 'json') {
                this.log(JSON.stringify({ 
                    error: error instanceof Error ? error.message : String(error),
                    isValid: false
                }, null, 2));
            } else {
                this.error(chalk.red(`Validation failed: ${error instanceof Error ? error.message : String(error)}`));
            }
            this.exit(1);
        } finally {
            // Exit process to prevent background MJ tasks from throwing errors
            // We don't explicitly close the connection - let the process termination handle it
            process.exit(0);
        }
    }
}