import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import chalk from 'chalk';
import * as path from 'path';

export default class Watch extends Command {
  static description = 'Watch for file changes and sync automatically';
  
  static examples = [
    `<%= config.bin %> <%= command.id %>`,
    `<%= config.bin %> <%= command.id %> --dir="ai-prompts"`,
    `<%= config.bin %> <%= command.id %> --debounce=1000`,
    `<%= config.bin %> <%= command.id %> --no-validate`,
  ];
  
  static flags = {
    dir: Flags.string({ description: 'Specific entity directory to watch' }),
    debounce: Flags.integer({ description: 'Debounce delay in milliseconds (default: 500)' }),
    'no-validate': Flags.boolean({ description: 'Skip validation before sync' }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed output' }),
  };
  
  private watchController?: any;
  
  async run(): Promise<void> {
    const {
      WatchService, loadMJConfig, loadSyncConfig, initializeProvider,
      getSyncEngine, getSystemUser, resetSyncEngine, configManager,
    } = await import('@memberjunction/metadata-sync');
    const { BaseEntity } = await import('@memberjunction/core');

    const { flags } = await this.parse(Watch);
    const spinner = ora();
    
    try {
      // Load configuration
      spinner.start('Loading configuration');
      const mjConfig = loadMJConfig();
      if (!mjConfig) {
        this.error('No mj.config.cjs found in current directory or parent directories');
      }
      
      // Load sync config
      const syncConfigDir = flags.dir ? path.resolve(configManager.getOriginalCwd(), flags.dir) : configManager.getOriginalCwd();
      const syncConfig = await loadSyncConfig(syncConfigDir);
      
      // Stop spinner before provider initialization
      spinner.stop();
      
      // Initialize data provider
      await initializeProvider(mjConfig);
      
      // Initialize sync engine
      const syncEngine = await getSyncEngine(getSystemUser());
      
      // Show success after initialization
      spinner.succeed('Configuration and metadata loaded');
      
      // Determine watch directory
      const watchDir = flags.dir 
        ? path.resolve(configManager.getOriginalCwd(), flags.dir) 
        : configManager.getOriginalCwd();
      
      // Create watch service
      const watchService = new WatchService(syncEngine);
      
      // Setup graceful shutdown
      process.on('SIGINT', async () => {
        this.log(chalk.yellow('\n\n⏹️  Stopping file watcher...'));
        if (this.watchController) {
          await this.watchController.stop();
        }
        resetSyncEngine();
        process.exit(0);
      });
      
      process.on('SIGTERM', async () => {
        if (this.watchController) {
          await this.watchController.stop();
        }
        resetSyncEngine();
        process.exit(0);
      });
      
      // Start watching
      this.log(chalk.bold(`\n👀 Watching for changes in: ${path.relative(process.cwd(), watchDir)}`));
      this.log(chalk.gray('Press Ctrl+C to stop watching\n'));
      
      this.watchController = await watchService.watch({
        dir: flags.dir,
        debounceMs: flags.debounce || 500
      }, {
        onFileAdd: (filePath: string, entityDir: string, entityConfig: any) => {
          const relativePath = path.relative(process.cwd(), filePath);
          this.log(chalk.gray(`➕ added: ${relativePath}`));
        },
        onFileChange: (filePath: string, entityDir: string, entityConfig: any) => {
          const relativePath = path.relative(process.cwd(), filePath);
          this.log(chalk.gray(`📝 changed: ${relativePath}`));
        },
        onFileDelete: (filePath: string, entityDir: string, entityConfig: any) => {
          const relativePath = path.relative(process.cwd(), filePath);
          this.log(chalk.gray(`❌ deleted: ${relativePath}`));
        },
        onRecordSaved: (entity: InstanceType<typeof BaseEntity>, isNew: boolean, entityConfig: Record<string, unknown>) => {
          const action = isNew ? 'created' : 'updated';
          this.log(chalk.green(`✅ Record ${action} for ${entityConfig.entity}`));
        },
        onError: (error: Error) => {
          spinner.fail('Watch error');
          this.error(error);
        },
        onWarn: (message: string) => {
          this.warn(message);
        },
        onLog: (message: string) => {
          if (flags.verbose) {
            this.log(message);
          }
        }
      });
      
      // Keep process alive
      await new Promise(() => {
        // This promise never resolves, keeping the process running
        // until interrupted by SIGINT/SIGTERM
      });
      
    } catch (error) {
      spinner.fail('Watch failed');
      
      // Enhanced error logging
      this.log('\n=== Watch Error Details ===');
      this.log(`Error type: ${error?.constructor?.name || 'Unknown'}`);
      this.log(`Error message: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error instanceof Error && error.stack) {
        this.log(`\nStack trace:`);
        this.log(error.stack);
      }
      
      this.error(error as Error);
    }
  }
}