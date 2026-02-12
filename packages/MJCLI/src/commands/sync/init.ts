import { Command } from '@oclif/core';
import { input, select } from '@inquirer/prompts';
import ora from 'ora-classic';

export default class Init extends Command {
  static description = 'Initialize a directory for metadata synchronization';
  
  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];
  
  async run(): Promise<void> {
    const { InitService } = await import('@memberjunction/metadata-sync');

    const spinner = ora();

    try {
      // Check if already initialized
      const initService = new InitService();

      // Build options from user input
      const options: Parameters<typeof initService.initialize>[0] = {};
      
      // Check for existing configuration
      try {
        // If .mj-sync.json exists, ask about overwrite
        const overwrite = await select({
          message: 'Directory already initialized. Overwrite configuration?',
          choices: [
            { name: 'Yes', value: true },
            { name: 'No', value: false }
          ]
        });
        
        if (!overwrite) {
          this.log('Initialization cancelled');
          return;
        }
        
        options.overwrite = true;
      } catch {
        // File doesn't exist, proceed normally
      }
      
      // Ask if they want to set up an entity directory
      const setupEntity = await select({
        message: 'Would you like to set up an entity directory now?',
        choices: [
          { name: 'Yes - AI Prompts', value: 'ai-prompts' },
          { name: 'Yes - Other entity', value: 'other' },
          { name: 'No - I\'ll set up later', value: 'no' }
        ]
      });
      
      options.setupEntity = setupEntity as 'ai-prompts' | 'other' | 'no';
      
      if (setupEntity === 'other') {
        options.entityName = await input({
          message: 'Enter the entity name (e.g., "Templates", "AI Models"):'
        });
        
        options.dirName = await input({
          message: 'Enter the directory name:',
          default: options.entityName.toLowerCase().replace(/\s+/g, '-')
        });
      }
      
      // Initialize with callbacks
      await initService.initialize(options, {
        onProgress: (message) => {
          spinner.start(message);
        },
        onSuccess: (message) => {
          spinner.succeed(message);
        },
        onError: (message) => {
          spinner.fail(message);
        }
      });
      
      this.log('\n✅ Initialization complete!');
      
      // Show next steps
      const nextSteps = initService.getNextSteps();
      this.log('\nNext steps:');
      nextSteps.forEach((step, index) => {
        this.log(`${index + 1}. ${step.replace('mj-sync', 'mj sync')}`);
      });
      
    } catch (error) {
      spinner.fail('Initialization failed');
      
      // Enhanced error logging
      this.log('\n=== Initialization Error Details ===');
      this.log(`Error type: ${error?.constructor?.name || 'Unknown'}`);
      this.log(`Error message: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error instanceof Error && error.stack) {
        this.log(`\nStack trace:`);
        this.log(error.stack);
      }
      
      // Check for error hints
      if (error instanceof Error) {
        const hint = new InitService().getErrorHint(error);
        if (hint) {
          this.log(`\nHint: ${hint}`);
        }
      }
      
      this.error(error as Error);
    }
  }
}