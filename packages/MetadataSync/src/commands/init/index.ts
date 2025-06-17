import { Command } from '@oclif/core';
import fs from 'fs-extra';
import path from 'path';
import { input, select } from '@inquirer/prompts';
import ora from 'ora-classic';

export default class Init extends Command {
  static description = 'Initialize a directory for metadata synchronization';
  
  static examples = [
    `<%= config.bin %> <%= command.id %>`,
  ];
  
  async run(): Promise<void> {
    const spinner = ora();
    
    try {
      // Check if already initialized
      if (await fs.pathExists('.mj-sync.json')) {
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
      }
      
      // Create root configuration
      const rootConfig = {
        version: '1.0.0',
        push: {
          validateBeforePush: true,
          requireConfirmation: true
        },
        watch: {
          debounceMs: 1000,
          ignorePatterns: ['*.tmp', '*.bak', '.DS_Store']
        }
      };
      
      spinner.start('Creating root configuration');
      await fs.writeJson('.mj-sync.json', rootConfig, { spaces: 2 });
      spinner.succeed('Created .mj-sync.json');
      
      // Ask if they want to set up an entity directory
      const setupEntity = await select({
        message: 'Would you like to set up an entity directory now?',
        choices: [
          { name: 'Yes - AI Prompts', value: 'ai-prompts' },
          { name: 'Yes - Other entity', value: 'other' },
          { name: 'No - I\'ll set up later', value: 'no' }
        ]
      });
      
      if (setupEntity !== 'no') {
        const entityName = setupEntity === 'ai-prompts' 
          ? 'AI Prompts'
          : await input({
              message: 'Enter the entity name (e.g., "Templates", "AI Models"):',
            });
            
        const dirName = setupEntity === 'ai-prompts'
          ? 'ai-prompts'
          : await input({
              message: 'Enter the directory name:',
              default: entityName.toLowerCase().replace(/\s+/g, '-')
            });
            
        // Create entity directory
        spinner.start(`Creating ${dirName} directory`);
        await fs.ensureDir(dirName);
        
        // Create entity configuration
        const entityConfig = {
          entity: entityName,
          filePattern: '*.json',
          defaults: {}
        };
        
        await fs.writeJson(path.join(dirName, '.mj-sync.json'), entityConfig, { spaces: 2 });
        spinner.succeed(`Created ${dirName} directory with entity configuration`);
        
        // Create example structure
        if (setupEntity === 'ai-prompts') {
          await this.createAIPromptsExample(dirName);
        }
      }
      
      this.log('\n✅ Initialization complete!');
      this.log('\nNext steps:');
      this.log('1. Run "mj-sync pull --entity=\'AI Prompts\'" to pull existing data');
      this.log('2. Edit files locally');
      this.log('3. Run "mj-sync push" to sync changes back to the database');
      
    } catch (error) {
      spinner.fail('Initialization failed');
      
      // Enhanced error logging for debugging
      this.log('\n=== Initialization Error Details ===');
      this.log(`Error type: ${error?.constructor?.name || 'Unknown'}`);
      this.log(`Error message: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error instanceof Error && error.stack) {
        this.log(`\nStack trace:`);
        this.log(error.stack);
      }
      
      // Log context information
      this.log(`\nContext:`);
      this.log(`- Working directory: ${process.cwd()}`);
      
      // Check if error is related to common issues
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('permission') || errorMessage.includes('EACCES')) {
        this.log(`\nHint: This appears to be a file permission issue.`);
        this.log(`Make sure you have write permissions in the current directory.`);
      } else if (errorMessage.includes('ENOENT') || errorMessage.includes('no such file')) {
        this.log(`\nHint: This appears to be a file or directory access issue.`);
        this.log(`Make sure the current directory exists and is accessible.`);
      } else if (errorMessage.includes('already exists') || errorMessage.includes('EEXIST')) {
        this.log(`\nHint: Files or directories already exist.`);
        this.log(`Try using the overwrite option or manually remove existing files.`);
      }
      
      this.error(error as Error);
    }
  }
  
  private async createAIPromptsExample(dirName: string): Promise<void> {
    const exampleDir = path.join(dirName, 'examples');
    await fs.ensureDir(exampleDir);
    
    // Create folder config
    const folderConfig = {
      defaults: {
        CategoryID: '@lookup:AI Prompt Categories.Name=Examples',
        Temperature: 0.7
      }
    };
    
    await fs.writeJson(path.join(exampleDir, '.mj-folder.json'), folderConfig, { spaces: 2 });
    
    // Create example prompt
    const examplePrompt = {
      _primaryKey: {
        ID: 'example-001'
      },
      _fields: {
        Name: 'Example Greeting Prompt',
        Description: 'A simple example prompt to demonstrate the sync tool',
        PromptTypeID: '@lookup:AI Prompt Types.Name=Chat',
        Temperature: 0.8,
        MaxTokens: 150,
        Prompt: '@file:greeting.prompt.md'
      }
    };
    
    await fs.writeJson(
      path.join(exampleDir, 'greeting.json'), 
      examplePrompt, 
      { spaces: 2 }
    );
    
    // Create the markdown file
    const promptContent = `You are a friendly assistant. Please greet the user warmly and ask how you can help them today.

Be conversational and welcoming in your tone.`;
    
    await fs.writeFile(
      path.join(exampleDir, 'greeting.prompt.md'),
      promptContent
    );
  }
}