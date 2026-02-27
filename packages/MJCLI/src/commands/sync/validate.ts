import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import chalk from 'chalk';
import * as path from 'path';
import fs from 'fs-extra';

export default class Validate extends Command {
  static description = 'Validate metadata files';
  
  static examples = [
    `<%= config.bin %> <%= command.id %>`,
    `<%= config.bin %> <%= command.id %> --dir="ai-prompts"`,
    `<%= config.bin %> <%= command.id %> --save-report`,
    `<%= config.bin %> <%= command.id %> --verbose`,
  ];
  
  static flags = {
    dir: Flags.string({ description: 'Specific entity directory to validate' }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed validation output' }),
    'save-report': Flags.boolean({ description: 'Save validation report as markdown file' }),
    'output': Flags.string({ description: 'Output file path for validation report (default: validation-report.md)' }),
  };
  
  async run(): Promise<void> {
    const {
      ValidationService, FormattingService, loadMJConfig, initializeProvider,
      getSyncEngine, getSystemUser, resetSyncEngine, configManager,
    } = await import('@memberjunction/metadata-sync');

    const { flags } = await this.parse(Validate);
    const spinner = ora();
    
    try {
      // Load configuration
      spinner.start('Loading configuration');
      const mjConfig = loadMJConfig();
      if (!mjConfig) {
        this.error('No mj.config.cjs found in current directory or parent directories');
      }
      
      // Stop spinner before provider initialization
      spinner.stop();
      
      // Initialize data provider
      await initializeProvider(mjConfig);
      
      // Initialize sync engine (needed for metadata access)
      await getSyncEngine(getSystemUser());
      
      // Show success after initialization
      if (flags.verbose) {
        spinner.succeed('Configuration and metadata loaded');
      } else {
        spinner.stop();
      }
      
      // Create validation service
      const validator = new ValidationService({ verbose: flags.verbose });
      const formatter = new FormattingService();
      
      // Determine directory to validate
      const targetDir = flags.dir 
        ? path.resolve(configManager.getOriginalCwd(), flags.dir) 
        : configManager.getOriginalCwd();
      
      spinner.start(`Validating metadata in ${path.relative(process.cwd(), targetDir)}...`);
      
      // Run validation
      const validationResult = await validator.validateDirectory(targetDir);
      
      spinner.stop();
      
      // Format and display results
      const formattedResult = formatter.formatValidationResult(validationResult, flags.verbose);
      this.log('\n' + formattedResult);
      
      // Save report if requested
      if (flags['save-report']) {
        const reportPath = flags.output || 'validation-report.md';
        const fullReportPath = path.resolve(reportPath);
        
        // Generate markdown report
        const report = formatter.formatValidationResultAsMarkdown(validationResult);
        await fs.writeFile(fullReportPath, report, 'utf8');
        
        this.log(chalk.green(`\n✅ Validation report saved to: ${path.relative(process.cwd(), fullReportPath)}`));
      }
      
      // Show summary
      const totalIssues = validationResult.errors.length + validationResult.warnings.length;
      
      if (validationResult.isValid && validationResult.warnings.length === 0) {
        this.log(chalk.green('\n✅ All metadata files are valid!'));
      } else if (validationResult.isValid && validationResult.warnings.length > 0) {
        this.log(chalk.yellow(`\n⚠️  Validation passed with ${validationResult.warnings.length} warning(s)`));
      } else {
        this.log(chalk.red(`\n❌ Validation failed with ${validationResult.errors.length} error(s) and ${validationResult.warnings.length} warning(s)`));
      }

      // Exit with error code if validation failed
      if (!validationResult.isValid) {
        this.error('Validation failed');
      }
      
    } catch (error) {
      spinner.fail('Validation failed');
      
      // Enhanced error logging
      this.log('\n=== Validation Error Details ===');
      this.log(`Error type: ${error?.constructor?.name || 'Unknown'}`);
      this.log(`Error message: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error instanceof Error && error.stack) {
        this.log(`\nStack trace:`);
        this.log(error.stack);
      }
      
      this.error(error as Error);
    } finally {
      // Reset singletons
      resetSyncEngine();
    }
  }
}