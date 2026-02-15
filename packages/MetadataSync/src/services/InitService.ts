import fs from 'fs-extra';
import path from 'path';

export interface InitOptions {
  overwrite?: boolean;
  setupEntity?: 'ai-prompts' | 'other' | 'no';
  entityName?: string;
  dirName?: string;
}

export interface InitCallbacks {
  onProgress?: (message: string) => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export class InitService {
  async initialize(options: InitOptions = {}, callbacks?: InitCallbacks): Promise<void> {
    try {
      // Check if already initialized
      if (await fs.pathExists('.mj-sync.json')) {
        if (!options.overwrite) {
          throw new Error('Directory already initialized. Use overwrite option to proceed.');
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
      
      callbacks?.onProgress?.('Creating root configuration');
      await fs.writeJson('.mj-sync.json', rootConfig, { spaces: 2 });
      callbacks?.onSuccess?.('Created .mj-sync.json');
      
      // Set up entity directory if requested
      if (options.setupEntity && options.setupEntity !== 'no') {
        const entityName = options.setupEntity === 'ai-prompts' 
          ? 'MJ: AI Prompts'
          : options.entityName || '';
          
        const dirName = options.setupEntity === 'ai-prompts'
          ? 'ai-prompts'
          : options.dirName || entityName.toLowerCase().replace(/\s+/g, '-');
          
        // Create entity directory
        callbacks?.onProgress?.(`Creating ${dirName} directory`);
        await fs.ensureDir(dirName);
        
        // Create entity configuration
        const entityConfig = {
          entity: entityName,
          filePattern: '*.json',
          defaults: {}
        };
        
        await fs.writeJson(path.join(dirName, '.mj-sync.json'), entityConfig, { spaces: 2 });
        callbacks?.onSuccess?.(`Created ${dirName} directory with entity configuration`);
        
        // Create example structure
        if (options.setupEntity === 'ai-prompts') {
          await this.createAIPromptsExample(dirName);
        }
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      callbacks?.onError?.(errorMessage);
      throw error;
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
  
  getNextSteps(): string[] {
    return [
      'Run "mj sync pull --entity=\'AI Prompts\'" to pull existing data',
      'Edit files locally',
      'Run "mj sync push" to sync changes back to the database'
    ];
  }
  
  getErrorHint(error: Error | string): string | null {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('permission') || errorMessage.includes('EACCES')) {
      return 'This appears to be a file permission issue. Make sure you have write permissions in the current directory.';
    } else if (errorMessage.includes('ENOENT') || errorMessage.includes('no such file')) {
      return 'This appears to be a file or directory access issue. Make sure the current directory exists and is accessible.';
    } else if (errorMessage.includes('already exists') || errorMessage.includes('EEXIST')) {
      return 'Files or directories already exist. Try using the overwrite option or manually remove existing files.';
    }
    
    return null;
  }
}