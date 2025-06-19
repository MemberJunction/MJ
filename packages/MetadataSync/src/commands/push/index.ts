import { Command, Flags } from '@oclif/core';
import fs from 'fs-extra';
import path from 'path';
import { confirm } from '@inquirer/prompts';
import ora from 'ora-classic';
import fastGlob from 'fast-glob';
import chalk from 'chalk';
import { loadMJConfig, loadSyncConfig, loadEntityConfig } from '../../config';
import { SyncEngine, RecordData } from '../../lib/sync-engine';
import { initializeProvider, findEntityDirectories, getSystemUser } from '../../lib/provider-utils';
import { BaseEntity, LogStatus, Metadata } from '@memberjunction/core';
import { configManager } from '../../lib/config-manager';
import { getSyncEngine, resetSyncEngine } from '../../lib/singleton-manager';
import { SQLServerDataProvider, type SqlLoggingSession } from '@memberjunction/sqlserver-dataprovider';
import { uuidv4 } from '@memberjunction/global';
import { FileBackupManager } from '../../lib/file-backup-manager';

export default class Push extends Command {
  static description = 'Push local file changes to the database';
  
  private warnings: string[] = [];
  private errors: string[] = [];
  private processedRecords: Map<string, { filePath: string; arrayIndex?: number; lineNumber?: number }> = new Map();
  
  static examples = [
    `<%= config.bin %> <%= command.id %>`,
    `<%= config.bin %> <%= command.id %> --dry-run`,
    `<%= config.bin %> <%= command.id %> --dir="ai-prompts"`,
    `<%= config.bin %> <%= command.id %> --ci`,
  ];
  
  static flags = {
    dir: Flags.string({ description: 'Specific entity directory to push' }),
    'dry-run': Flags.boolean({ description: 'Show what would be pushed without actually pushing' }),
    ci: Flags.boolean({ description: 'CI mode - no prompts, fail on issues' }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed field-level output' }),
    'no-validate': Flags.boolean({ description: 'Skip validation before push' }),
  };
  
  // Override warn to collect warnings
  warn(input: string | Error): string | Error {
    const message = typeof input === 'string' ? input : input.message;
    this.warnings.push(message);
    return super.warn(input);
  }
  
  async run(): Promise<void> {
    const { flags } = await this.parse(Push);
    const spinner = ora();
    let sqlLogger: SqlLoggingSession | null = null;
    const fileBackupManager = new FileBackupManager();
    let hasActiveTransaction = false;
    const startTime = Date.now();
    
    // Reset the processed records tracking for this push operation
    this.processedRecords.clear();
    
    try {
      // Load configurations
      spinner.start('Loading configuration');
      const mjConfig = loadMJConfig();
      if (!mjConfig) {
        this.error('No mj.config.cjs found in current directory or parent directories');
      }
      
      // Load sync config from target directory if --dir is specified, otherwise from current directory
      const syncConfigDir = flags.dir ? path.resolve(configManager.getOriginalCwd(), flags.dir) : configManager.getOriginalCwd();
      const syncConfig = await loadSyncConfig(syncConfigDir);
      
      // Stop spinner before provider initialization (which logs to console)
      spinner.stop();
      
      // Initialize data provider
      await initializeProvider(mjConfig);
      
      // Initialize sync engine using singleton pattern
      const syncEngine = await getSyncEngine(getSystemUser());
      
      // Show success after all initialization is complete
      if (flags.verbose) {
        spinner.succeed('Configuration and metadata loaded');
      } else {
        spinner.stop();
      }
      
      // Initialize SQL logging AFTER provider setup is complete
      if (syncConfig?.sqlLogging?.enabled) {
        const outputDir = syncConfig.sqlLogging.outputDirectory || './sql_logging';
        const formatAsMigration = syncConfig.sqlLogging.formatAsMigration || false;
        
        // Ensure output directory exists
        const fullOutputDir = path.resolve(outputDir);
        await fs.ensureDir(fullOutputDir);
        
        // Generate filename with timestamp and directory name
        const now = new Date();
        const humanReadableTimestamp = now.toISOString()
          .replace('T', '_')
          .replace(/:/g, '-')
          .slice(0, -5); // Remove milliseconds and Z
        
        // Get directory name for filename
        const targetDir = flags.dir ? path.resolve(configManager.getOriginalCwd(), flags.dir) : configManager.getOriginalCwd();
        const dirName = path.basename(targetDir);
        
        const filename = formatAsMigration 
          ? `V${now.toISOString().replace(/[:.T-]/g, '').slice(0, -5)}__MetadataSync_Push.sql`
          : `metadata-sync-push_${dirName}_${humanReadableTimestamp}.sql`;
        const logFilePath = path.join(fullOutputDir, filename);
        
        // Import and access the data provider from the provider utils
        const { getDataProvider } = await import('../../lib/provider-utils');
        const dataProvider = getDataProvider();
        
        if (dataProvider && typeof dataProvider.CreateSqlLogger === 'function') {
          sqlLogger = await dataProvider.CreateSqlLogger(logFilePath, {
            formatAsMigration,
            description: 'MetadataSync Push Operation',
            statementTypes: 'mutations', // Only log mutations (data changes)
            batchSeparator: 'GO', // Add GO statements for SQL Server batch processing
            prettyPrint: true     // Enable pretty printing for readable output
          });
          
          if (flags.verbose) {
            this.log(`📝 SQL logging enabled: ${path.relative(process.cwd(), logFilePath)}`);
          }
        } else {
          this.warn('SQL logging requested but data provider does not support CreateSqlLogger');
        }
      }
      
      // Find entity directories to process
      const entityDirs = findEntityDirectories(configManager.getOriginalCwd(), flags.dir, syncConfig?.directoryOrder, syncConfig?.ignoreDirectories);
      
      if (entityDirs.length === 0) {
        this.error('No entity directories found');
      }
      
      if (flags.verbose) {
        this.log(`Found ${entityDirs.length} entity ${entityDirs.length === 1 ? 'directory' : 'directories'} to process`);
      }
      
      // Run validation unless disabled
      if (!flags['no-validate']) {
        const { ValidationService } = await import('../../services/ValidationService');
        const { FormattingService } = await import('../../services/FormattingService');
        
        spinner.start('Validating metadata...');
        const validator = new ValidationService({ verbose: flags.verbose });
        const formatter = new FormattingService();
        
        const targetDir = flags.dir ? path.resolve(configManager.getOriginalCwd(), flags.dir) : configManager.getOriginalCwd();
        const validationResult = await validator.validateDirectory(targetDir);
        spinner.stop();
        
        if (!validationResult.isValid || validationResult.warnings.length > 0) {
          // Show validation results
          this.log('\n' + formatter.formatValidationResult(validationResult, flags.verbose));
          
          if (!validationResult.isValid) {
            // In CI mode, fail immediately
            if (flags.ci) {
              this.error('Validation failed. Cannot proceed with push.');
            }
            
            // Otherwise, ask for confirmation
            const shouldContinue = await confirm({
              message: 'Validation failed with errors. Do you want to continue anyway?',
              default: false
            });
            
            if (!shouldContinue) {
              this.log(chalk.yellow('\n⚠️  Push cancelled due to validation errors.'));
              // Exit cleanly without throwing an error
              return;
            }
          }
        } else {
          this.log(chalk.green('✓ Validation passed'));
        }
      }
      
      // Initialize file backup manager (unless in dry-run mode)
      if (!flags['dry-run']) {
        await fileBackupManager.initialize();
        if (flags.verbose) {
          this.log('📁 File backup manager initialized');
        }
      }
      
      // Start a database transaction for the entire push operation (unless in dry-run mode)
      // IMPORTANT: We start the transaction AFTER metadata loading and validation to avoid
      // transaction conflicts with background refresh operations
      if (!flags['dry-run']) {
        const { getDataProvider } = await import('../../lib/provider-utils');
        const dataProvider = getDataProvider();
        
        // Ensure we have SQLServerDataProvider for transaction support
        if (!(dataProvider instanceof SQLServerDataProvider)) {
          const errorMsg = 'MetadataSync requires SQLServerDataProvider for transaction support. Current provider does not support transactions.';
          
          // Rollback file backups since we're not proceeding
          try {
            await fileBackupManager.rollback();
          } catch (rollbackError) {
            this.warn(`Failed to rollback file backup initialization: ${rollbackError}`);
          }
          
          this.error(errorMsg);
        }
        
        if (dataProvider && typeof dataProvider.BeginTransaction === 'function') {
          try {
            await dataProvider.BeginTransaction();
            hasActiveTransaction = true;
            if (flags.verbose) {
              this.log('🔄 Transaction started - all changes will be committed or rolled back as a unit');
            }
          } catch (error) {
            // Transaction start failure is critical - we should not proceed without it
            const errorMsg = `Failed to start database transaction: ${error instanceof Error ? error.message : String(error)}`;
            
            // Rollback file backups since we're not proceeding
            try {
              await fileBackupManager.rollback();
            } catch (rollbackError) {
              this.warn(`Failed to rollback file backup initialization: ${rollbackError}`);
            }
            
            this.error(errorMsg);
          }
        } else {
          // No transaction support is also critical for data integrity
          const errorMsg = 'Transaction support not available - cannot ensure data integrity';
          
          // Rollback file backups since we're not proceeding
          try {
            await fileBackupManager.rollback();
          } catch (rollbackError) {
            this.warn(`Failed to rollback file backup initialization: ${rollbackError}`);
          }
          
          this.error(errorMsg);
        }
      }
      
      // Process each entity directory
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalUnchanged = 0;
      let totalErrors = 0;
      
      for (const entityDir of entityDirs) {
        const entityConfig = await loadEntityConfig(entityDir);
        if (!entityConfig) {
          this.warn(`Skipping ${entityDir} - no valid entity configuration`);
          continue;
        }
        
        if (flags.verbose) {
          this.log(`\nProcessing ${entityConfig.entity} in ${entityDir}`);
        }
        
        const result = await this.processEntityDirectory(
          entityDir,
          entityConfig,
          syncEngine,
          flags,
          syncConfig,
          fileBackupManager
        );
        
        // Show per-directory summary
        const dirName = path.relative(process.cwd(), entityDir) || '.';
        const dirTotal = result.created + result.updated + result.unchanged;
        if (dirTotal > 0 || result.errors > 0) {
          this.log(`\n📁 ${dirName}:`);
          this.log(`   Total processed: ${dirTotal} unique records`);
          if (result.created > 0) {
            this.log(`   ✓ Created: ${result.created}`);
          }
          if (result.updated > 0) {
            this.log(`   ✓ Updated: ${result.updated}`);
          }
          if (result.unchanged > 0) {
            this.log(`   - Unchanged: ${result.unchanged}`);
          }
          if (result.errors > 0) {
            this.log(`   ✗ Errors: ${result.errors}`);
          }
        }
        
        totalCreated += result.created;
        totalUpdated += result.updated;
        totalUnchanged += result.unchanged;
        totalErrors += result.errors;
      }
      
      // Summary using FormattingService
      const endTime = Date.now();
      const { FormattingService } = await import('../../services/FormattingService');
      const formatter = new FormattingService();
      
      this.log('\n' + formatter.formatSyncSummary('push', {
        created: totalCreated,
        updated: totalUpdated,
        unchanged: totalUnchanged,
        deleted: 0,
        skipped: 0,
        errors: totalErrors,
        duration: endTime - startTime
      }));
      
      // Handle transaction commit/rollback
      if (!flags['dry-run'] && hasActiveTransaction) {
        const dataProvider = Metadata.Provider as SQLServerDataProvider;
        
        // We know we have an active transaction at this point
        if (dataProvider) {
          let shouldCommit = true;
          
          // If there are any errors, always rollback
          if (totalErrors > 0 || this.errors.length > 0) {
            shouldCommit = false;
            this.log('\n❌ Errors detected - rolling back all changes');
          }
          // If there are warnings, ask user (unless in CI mode)
          else if (this.warnings.length > 0) {
            // Filter out transaction-related warnings since we're now using transactions
            const nonTransactionWarnings = this.warnings.filter(w => 
              !w.includes('Transaction support not available') && 
              !w.includes('Failed to start transaction')
            );
            
            if (nonTransactionWarnings.length > 0) {
              if (flags.ci) {
                // In CI mode, rollback on warnings
                shouldCommit = false;
                this.log('\n⚠️  Warnings detected in CI mode - rolling back all changes');
              } else {
                // Show warnings to user
                this.log('\n⚠️  The following warnings were encountered:');
                for (const warning of nonTransactionWarnings) {
                  this.log(`   - ${warning}`);
                }
                
                // Ask user whether to commit or rollback
                shouldCommit = await confirm({
                  message: 'Do you want to commit these changes despite the warnings?',
                  default: false // Default to rollback
                });
              }
            }
          }
          
          try {
            if (shouldCommit) {
              await dataProvider.CommitTransaction();
              this.log('\n✅ All changes committed successfully');
              
              // Clean up file backups after successful commit
              await fileBackupManager.cleanup();
            } else {
              // User chose to rollback or errors/warnings in CI mode
              this.log('\n🔙 Rolling back all changes...');
              
              // Rollback database transaction
              await dataProvider.RollbackTransaction();
              
              // Rollback file changes
              this.log('🔙 Rolling back file changes...');
              await fileBackupManager.rollback();
              
              this.log('✅ Rollback completed - no changes were made to the database or files');
            }
          } catch (error) {
            // Try to rollback on any error
            this.log('\n❌ Transaction error - attempting to roll back changes');
            try {
              await dataProvider.RollbackTransaction();
              this.log('✅ Database rollback completed');
            } catch (rollbackError) {
              this.log('❌ Database rollback failed: ' + (rollbackError instanceof Error ? rollbackError.message : String(rollbackError)));
            }
            
            // Also rollback file changes
            try {
              this.log('🔙 Rolling back file changes...');
              await fileBackupManager.rollback();
              this.log('✅ File rollback completed');
            } catch (fileRollbackError) {
              this.log('❌ File rollback failed: ' + (fileRollbackError instanceof Error ? fileRollbackError.message : String(fileRollbackError)));
            }
            
            throw error;
          }
        }
      }
      
      // Exit with error if there were errors in CI mode
      if ((totalErrors > 0 || this.errors.length > 0 || (this.warnings.length > 0 && flags.ci)) && flags.ci) {
        this.error('Push failed in CI mode');
      }
      
    } catch (error) {
      spinner.fail('Push failed');
      
      // Try to rollback the transaction and files if not in dry-run mode
      if (!flags['dry-run']) {
        const { getDataProvider } = await import('../../lib/provider-utils');
        const dataProvider = getDataProvider();
        
        // Rollback database transaction if we have one
        if (hasActiveTransaction && dataProvider && typeof dataProvider.RollbackTransaction === 'function') {
          try {
            this.log('\n🔙 Rolling back database transaction due to error...');
            await dataProvider.RollbackTransaction();
            this.log('✅ Database rollback completed');
          } catch (rollbackError) {
            this.log('❌ Database rollback failed: ' + (rollbackError instanceof Error ? rollbackError.message : String(rollbackError)));
          }
        }
        
        // Rollback file changes
        try {
          this.log('🔙 Rolling back file changes...');
          await fileBackupManager.rollback();
          this.log('✅ File rollback completed - all files restored to original state');
        } catch (fileRollbackError) {
          this.log('❌ File rollback failed: ' + (fileRollbackError instanceof Error ? fileRollbackError.message : String(fileRollbackError)));
        }
      }
      
      // Enhanced error logging for debugging
      this.log('\n=== Push Error Details ===');
      this.log(`Error type: ${error?.constructor?.name || 'Unknown'}`);
      this.log(`Error message: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error instanceof Error && error.stack) {
        this.log(`\nStack trace:`);
        this.log(error.stack);
      }
      
      // Log context information
      this.log(`\nContext:`);
      this.log(`- Working directory: ${configManager.getOriginalCwd()}`);
      this.log(`- Flags: ${JSON.stringify(flags, null, 2)}`);
      
      // Check if error is related to common issues
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('entity directories')) {
        this.log(`\nHint: This appears to be an entity directory configuration issue.`);
        this.log(`Make sure each entity directory has a .mj-sync.json file.`);
      } else if (errorMessage.includes('database') || errorMessage.includes('connection')) {
        this.log(`\nHint: This appears to be a database connectivity issue.`);
        this.log(`Check your mj.config.cjs configuration and database connectivity.`);
      } else if (errorMessage.includes('config') || errorMessage.includes('mj.config.cjs')) {
        this.log(`\nHint: This appears to be a configuration file issue.`);
        this.log(`Make sure mj.config.cjs exists and is properly configured.`);
      }
      
      this.error(error as Error);
    } finally {
      // Dispose SQL logging session if active
      if (sqlLogger) {
        try {
          await sqlLogger.dispose();
          if (flags.verbose) {
            this.log('✅ SQL logging session closed');
          }
        } catch (error) {
          this.warn(`Failed to close SQL logging session: ${error}`);
        }
      }
      
      // Reset sync engine singleton
      resetSyncEngine();
      
      // Exit process to prevent background MJ tasks from throwing errors
      // We don't explicitly close the connection - let the process termination handle it
      process.exit(0);
    }
  }
  
  private async processEntityDirectory(
    entityDir: string,
    entityConfig: any,
    syncEngine: SyncEngine,
    flags: any,
    syncConfig: any,
    fileBackupManager?: FileBackupManager
  ): Promise<{ created: number; updated: number; unchanged: number; errors: number }> {
    const result = { created: 0, updated: 0, unchanged: 0, errors: 0 };
    
    // Find files matching the configured pattern
    const pattern = entityConfig.filePattern || '*.json';
    const jsonFiles = await fastGlob(pattern, {
      cwd: entityDir,
      ignore: ['.mj-sync.json', '.mj-folder.json', '**/*.backup'],
      dot: true,  // Include dotfiles (files starting with .)
      onlyFiles: true
    });
    
    // Check if no JSON files were found
    if (jsonFiles.length === 0) {
      const relativePath = path.relative(process.cwd(), entityDir) || '.';
      const parentPath = path.dirname(entityDir);
      const dirName = path.basename(entityDir);
      
      // Check if this is a subdirectory (not a top-level entity directory)
      const isSubdirectory = parentPath !== path.resolve(configManager.getOriginalCwd(), flags.dir || '.');
      
      if (isSubdirectory) {
        // For subdirectories, make it a warning instead of an error
        let warningMessage = `No JSON files found in ${relativePath} matching pattern: ${pattern}`;
        
        // Try to be more helpful by checking what files do exist
        const allFiles = await fastGlob('*', {
          cwd: entityDir,
          onlyFiles: true,
          dot: true
        });
        
        if (allFiles.length > 0) {
          warningMessage += `\n  Files found: ${allFiles.slice(0, 3).join(', ')}`;
          if (allFiles.length > 3) {
            warningMessage += ` (and ${allFiles.length - 3} more)`;
          }
        }
        
        const rootConfigPath = path.join(configManager.getOriginalCwd(), flags.dir || '.', '.mj-sync.json');
        warningMessage += `\n  💡 If this directory should be ignored, add "${dirName}" to the "ignoreDirectories" array in:\n     ${rootConfigPath}`;
        
        this.warn(warningMessage);
        return result; // Return early without processing further
      } else {
        // For top-level entity directories, this is still an error
        const configFile = path.join(entityDir, '.mj-sync.json');
        let errorMessage = `No JSON files found in ${relativePath} matching pattern: ${pattern}\n`;
        errorMessage += `\nPlease check:\n`;
        errorMessage += `  1. Files exist with the expected extension (.json)\n`;
        errorMessage += `  2. The filePattern in ${configFile} matches your files\n`;
        errorMessage += `  3. Files are not in ignored patterns: .mj-sync.json, .mj-folder.json, *.backup\n`;
        
        // Try to be more helpful by checking what files do exist
        const allFiles = await fastGlob('*', {
          cwd: entityDir,
          onlyFiles: true,
          dot: true
        });
        
        if (allFiles.length > 0) {
          errorMessage += `\nFiles found in directory: ${allFiles.slice(0, 5).join(', ')}`;
          if (allFiles.length > 5) {
            errorMessage += ` (and ${allFiles.length - 5} more)`;
          }
        }
        
        throw new Error(errorMessage);
      }
    }
    
    if (flags.verbose) {
      this.log(`Processing ${jsonFiles.length} records in ${path.relative(process.cwd(), entityDir) || '.'}`);
    }
    
    // First, process all JSON files in this directory
    await this.processJsonFiles(jsonFiles, entityDir, entityConfig, syncEngine, flags, result, fileBackupManager);
    
    // Then, recursively process subdirectories
    const entries = await fs.readdir(entityDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        // Check if this directory should be ignored
        if (syncConfig?.ignoreDirectories && syncConfig.ignoreDirectories.some((pattern: string) => {
          // Simple pattern matching: exact name or ends with pattern
          return entry.name === pattern || entry.name.endsWith(pattern);
        })) {
          continue;
        }
        
        const subDir = path.join(entityDir, entry.name);
        
        // Load subdirectory config and merge with parent config
        let subEntityConfig = { ...entityConfig };
        const subDirConfig = await loadEntityConfig(subDir);
        
        if (subDirConfig) {
          // Check if this is a new entity type (has different entity name)
          if (subDirConfig.entity && subDirConfig.entity !== entityConfig.entity) {
            // This is a different entity type, skip it (will be processed separately)
            continue;
          }
          
          // Merge defaults: parent defaults + subdirectory overrides
          subEntityConfig = {
            ...entityConfig,
            ...subDirConfig,
            defaults: {
              ...entityConfig.defaults,
              ...(subDirConfig.defaults || {})
            }
          };
        }
        
        // Process subdirectory with merged config
        const subResult = await this.processEntityDirectory(
          subDir,
          subEntityConfig,
          syncEngine,
          flags,
          syncConfig,
          fileBackupManager
        );
        
        result.created += subResult.created;
        result.updated += subResult.updated;
        result.unchanged += subResult.unchanged;
        result.errors += subResult.errors;
      }
    }
    
    return result;
  }
  
  private async processJsonFiles(
    jsonFiles: string[],
    entityDir: string,
    entityConfig: any,
    syncEngine: SyncEngine,
    flags: any,
    result: { created: number; updated: number; unchanged: number; errors: number },
    fileBackupManager?: FileBackupManager
  ): Promise<void> {
    if (jsonFiles.length === 0) {
      return;
    }
    
    const spinner = ora();
    spinner.start('Processing records');
    
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(entityDir, file);
        
        // Backup the file before any modifications (unless dry-run)
        if (!flags['dry-run'] && fileBackupManager) {
          await fileBackupManager.backupFile(filePath);
        }
        
        // Parse JSON with line number tracking
        const { content: fileContent, lineNumbers } = await this.parseJsonWithLineNumbers(filePath);
        
        // Process templates in the loaded content
        const processedContent = await syncEngine.processTemplates(fileContent, entityDir);
        
        // Check if the file contains a single record or an array of records
        const isArray = Array.isArray(processedContent);
        const records: RecordData[] = isArray ? processedContent : [processedContent];
        
        // Build and process defaults (including lookups)
        const defaults = await syncEngine.buildDefaults(filePath, entityConfig);
        
        // Process each record in the file
        for (let i = 0; i < records.length; i++) {
          const recordData = records[i];
          
          // Process the record
          const recordLineNumber = lineNumbers.get(i); // Get line number for this array index
          const pushResult = await this.pushRecord(
            recordData,
            entityConfig.entity,
            path.dirname(filePath),
            file,
            defaults,
            syncEngine,
            flags['dry-run'],
            flags.verbose,
            isArray ? i : undefined,
            fileBackupManager,
            recordLineNumber
          );
          
          if (!flags['dry-run']) {
            // Don't count duplicates in stats
            if (!pushResult.isDuplicate) {
              if (pushResult.isNew) {
                result.created++;
              } else if (pushResult.wasActuallyUpdated) {
                result.updated++;
              } else {
                result.unchanged++;
              }
            }
            
            // Add related entity stats
            if (pushResult.relatedStats) {
              result.created += pushResult.relatedStats.created;
              result.updated += pushResult.relatedStats.updated;
              result.unchanged += pushResult.relatedStats.unchanged;
              
              // Debug logging for related entities
              if (flags.verbose && pushResult.relatedStats.unchanged > 0) {
                this.log(`   Related entities: ${pushResult.relatedStats.unchanged} unchanged`);
              }
            }
          }
          
          spinner.text = `Processing records (${result.created + result.updated + result.unchanged + result.errors} processed)`;
        }
        
        // Write back the entire file if it's an array
        if (isArray && !flags['dry-run']) {
          await fs.writeJson(filePath, records, { spaces: 2 });
        }
        
      } catch (error) {
        result.errors++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const fullErrorMessage = `Failed to process ${file}: ${errorMessage}`;
        this.errors.push(fullErrorMessage);
        this.error(fullErrorMessage, { exit: false });
        this.log('   ⚠️  This error will cause all changes to be rolled back at the end of processing');
      }
    }
    
    if (flags.verbose) {
      spinner.succeed(`Processed ${result.created + result.updated + result.unchanged} records from ${jsonFiles.length} files`);
    } else {
      spinner.stop();
    }
  }
  
  private async pushRecord(
    recordData: RecordData,
    entityName: string,
    baseDir: string,
    fileName: string,
    defaults: Record<string, any>,
    syncEngine: SyncEngine,
    dryRun: boolean,
    verbose: boolean = false,
    arrayIndex?: number,
    fileBackupManager?: FileBackupManager,
    lineNumber?: number
  ): Promise<{ isNew: boolean; wasActuallyUpdated: boolean; isDuplicate: boolean; relatedStats?: { created: number; updated: number; unchanged: number } }> {
    // Load or create entity
    let entity: BaseEntity | null = null;
    let isNew = false;
    
    if (recordData.primaryKey) {
      entity = await syncEngine.loadEntity(entityName, recordData.primaryKey);
      
      // Warn if record has primaryKey but wasn't found
      if (!entity) {
        const pkDisplay = Object.entries(recordData.primaryKey)
          .map(([key, value]) => `${key}=${value}`)
          .join(', ');
        
        // Load sync config to check autoCreateMissingRecords setting
        const syncConfig = await loadSyncConfig(configManager.getOriginalCwd());
        const autoCreate = syncConfig?.push?.autoCreateMissingRecords ?? false;
        
        if (!autoCreate) {
          const fileRef = lineNumber ? `${fileName}:${lineNumber}` : fileName;
          this.warn(`⚠️  Record not found: ${entityName} with primaryKey {${pkDisplay}} at ${fileRef}`);
          this.warn(`   To auto-create missing records, set push.autoCreateMissingRecords=true in .mj-sync.json`);
          
          // Skip this record
          return { isNew: false, wasActuallyUpdated: false, isDuplicate: false };
        } else {
          if (verbose) {
            this.log(`   Auto-creating missing ${entityName} record with primaryKey {${pkDisplay}}`);
          }
        }
      }
    }
    
    if (!entity) {
      // New record
      entity = await syncEngine.createEntityObject(entityName);
      entity.NewRecord();
      isNew = true;
      
      // Handle primary keys for new records
      const entityInfo = syncEngine.getEntityInfo(entityName);
      if (entityInfo) {
        for (const pk of entityInfo.PrimaryKeys) {
          if (!pk.AutoIncrement) {
            // Check if we have a value in primaryKey object
            if (recordData.primaryKey?.[pk.Name]) {
              // User specified a primary key for new record, set it on entity directly
              // Don't add to fields as it will be in primaryKey section
              (entity as any)[pk.Name] = recordData.primaryKey[pk.Name];
              if (verbose) {
                this.log(`  Using specified primary key ${pk.Name}: ${recordData.primaryKey[pk.Name]}`);
              }
            } else if (pk.Type.toLowerCase() === 'uniqueidentifier' && !recordData.fields[pk.Name]) {
              // Generate UUID for this primary key and set it on entity directly
              const uuid = uuidv4();
              // Don't add to fields as it will be in primaryKey section after save
              if (verbose) {
                this.log(`  Generated UUID for primary key ${pk.Name}: ${uuid}`);
              }
              // Set the generated UUID on the entity
              (entity as any)[pk.Name] = uuid;
            }
          }
        }
      }
    }
    
    // Apply defaults first
    for (const [field, value] of Object.entries(defaults)) {
      if (field in entity) {
        (entity as any)[field] = value;
      }
    }
    
    // Apply record fields
    for (const [field, value] of Object.entries(recordData.fields)) {
      if (field in entity) {
        try {
          const processedValue = await syncEngine.processFieldValue(value, baseDir, null, null);
          if (verbose) {
            this.log(`  Setting ${field}: ${JSON.stringify(value)} -> ${JSON.stringify(processedValue)}`);
          }
          (entity as any)[field] = processedValue;
        } catch (error) {
          throw new Error(`Failed to process field '${field}': ${error}`);
        }
      } else {
        this.warn(`Field '${field}' does not exist on entity '${entityName}'`);
      }
    }
    
    if (dryRun) {
      this.log(`Would ${isNew ? 'create' : 'update'} ${entityName} record`);
      return { isNew, wasActuallyUpdated: true, isDuplicate: false, relatedStats: undefined };
    }
    
    // Check for duplicate processing (but only for existing records that were loaded)
    let isDuplicate = false;
    if (!isNew && entity) {
      const fullFilePath = path.join(baseDir, fileName);
      isDuplicate = this.checkAndTrackRecord(entityName, entity, fullFilePath, arrayIndex, lineNumber);
    }
    
    // Check if the record is dirty before saving
    let wasActuallyUpdated = false;
    if (!isNew && entity.Dirty) {
      // Record is dirty, get the changes
      const changes = entity.GetChangesSinceLastSave();
      const changeKeys = Object.keys(changes);
      if (changeKeys.length > 0) {
        wasActuallyUpdated = true;
        
        // Get primary key info for display
        const entityInfo = syncEngine.getEntityInfo(entityName);
        const primaryKeyDisplay: string[] = [];
        if (entityInfo) {
          for (const pk of entityInfo.PrimaryKeys) {
            primaryKeyDisplay.push(`${pk.Name}: ${entity.Get(pk.Name)}`);
          }
        }
        
        this.log(''); // Add newline before update output
        this.log(`📝 Updating ${entityName} record:`);
        if (primaryKeyDisplay.length > 0) {
          this.log(`   Primary Key: ${primaryKeyDisplay.join(', ')}`);
        }
        this.log(`   Changes:`);
        for (const fieldName of changeKeys) {
          const field = entity.GetFieldByName(fieldName);
          const oldValue = field ? field.OldValue : undefined;
          const newValue = (changes as any)[fieldName];
          this.log(`     ${fieldName}: ${oldValue} → ${newValue}`);
        }
      }
    } else if (isNew) {
      wasActuallyUpdated = true;
    }
    
    // Save the record
    const saved = await entity.Save();
    if (!saved) {
      const message = entity.LatestResult?.Message;
      if (message) {
        throw new Error(`Failed to save record: ${message}`);
      }
      
      const errors = entity.LatestResult?.Errors?.map(err => 
        typeof err === 'string' ? err : (err?.message || JSON.stringify(err))
      )?.join(', ') || 'Unknown error';
      throw new Error(`Failed to save record: ${errors}`);
    }
    
    // Process related entities after saving parent
    let relatedStats;
    if (recordData.relatedEntities && !dryRun) {
      const fullFilePath = path.join(baseDir, fileName);
      relatedStats = await this.processRelatedEntities(
        recordData.relatedEntities,
        entity,
        entity, // root is same as parent for top level
        baseDir,
        syncEngine,
        verbose,
        fileBackupManager,
        1, // indentLevel
        fullFilePath,
        arrayIndex
      );
    }
    
    // Update the local file with new primary key if created
    if (isNew) {
      const entityInfo = syncEngine.getEntityInfo(entityName);
      if (entityInfo) {
        const newPrimaryKey: Record<string, any> = {};
        for (const pk of entityInfo.PrimaryKeys) {
          newPrimaryKey[pk.Name] = entity.Get(pk.Name);
        }
        recordData.primaryKey = newPrimaryKey;
      }
      
      // Track the new record now that we have its primary key
      const fullFilePath = path.join(baseDir, fileName);
      this.checkAndTrackRecord(entityName, entity, fullFilePath, arrayIndex, lineNumber);
    }
    
    // Always update sync metadata
    // This ensures related entities are persisted with their metadata
    recordData.sync = {
      lastModified: new Date().toISOString(),
      checksum: syncEngine.calculateChecksum(recordData.fields)
    };
    
    // Write back to file only if it's a single record (not part of an array)
    // Array records are written back in bulk after all records are processed
    if (arrayIndex === undefined) {
      const filePath = path.join(baseDir, fileName);
      await fs.writeJson(filePath, recordData, { spaces: 2 });
    }
    
    return { isNew, wasActuallyUpdated, isDuplicate, relatedStats };
  }
  
  private async processRelatedEntities(
    relatedEntities: Record<string, RecordData[]>,
    parentEntity: BaseEntity,
    rootEntity: BaseEntity,
    baseDir: string,
    syncEngine: SyncEngine,
    verbose: boolean = false,
    fileBackupManager?: FileBackupManager,
    indentLevel: number = 1,
    parentFilePath?: string,
    parentArrayIndex?: number
  ): Promise<{ created: number; updated: number; unchanged: number }> {
    const indent = '  '.repeat(indentLevel);
    const stats = { created: 0, updated: 0, unchanged: 0 };
    
    for (const [entityName, records] of Object.entries(relatedEntities)) {
      if (verbose) {
        this.log(`${indent}↳ Processing ${records.length} related ${entityName} records`);
      }
      
      for (const relatedRecord of records) {
        try {
          // Load or create entity
          let entity = null;
          let isNew = false;
          
          if (relatedRecord.primaryKey) {
            entity = await syncEngine.loadEntity(entityName, relatedRecord.primaryKey);
            
            // Warn if record has primaryKey but wasn't found
            if (!entity) {
              const pkDisplay = Object.entries(relatedRecord.primaryKey)
                .map(([key, value]) => `${key}=${value}`)
                .join(', ');
              
              // Load sync config to check autoCreateMissingRecords setting
              const syncConfig = await loadSyncConfig(configManager.getOriginalCwd());
              const autoCreate = syncConfig?.push?.autoCreateMissingRecords ?? false;
              
              if (!autoCreate) {
                const fileRef = parentFilePath ? path.relative(configManager.getOriginalCwd(), parentFilePath) : 'unknown';
                this.warn(`${indent}⚠️  Related record not found: ${entityName} with primaryKey {${pkDisplay}} at ${fileRef}`);
                this.warn(`${indent}   To auto-create missing records, set push.autoCreateMissingRecords=true in .mj-sync.json`);
                
                // Skip this record
                continue;
              } else {
                if (verbose) {
                  this.log(`${indent}   Auto-creating missing related ${entityName} record with primaryKey {${pkDisplay}}`);
                }
              }
            }
          }
          
          if (!entity) {
            entity = await syncEngine.createEntityObject(entityName);
            entity.NewRecord();
            isNew = true;
            
            // Handle primary keys for new related entity records
            const entityInfo = syncEngine.getEntityInfo(entityName);
            if (entityInfo) {
              for (const pk of entityInfo.PrimaryKeys) {
                if (!pk.AutoIncrement) {
                  // Check if we have a value in primaryKey object
                  if (relatedRecord.primaryKey?.[pk.Name]) {
                    // User specified a primary key for new record, set it on entity directly
                    // Don't add to fields as it will be in primaryKey section
                    (entity as any)[pk.Name] = relatedRecord.primaryKey[pk.Name];
                    if (verbose) {
                      this.log(`${indent}  Using specified primary key ${pk.Name}: ${relatedRecord.primaryKey[pk.Name]}`);
                    }
                  } else if (pk.Type.toLowerCase() === 'uniqueidentifier' && !relatedRecord.fields[pk.Name]) {
                    // Generate UUID for this primary key and set it on entity directly
                    const uuid = uuidv4();
                    // Don't add to fields as it will be in primaryKey section after save
                    (entity as any)[pk.Name] = uuid;
                    if (verbose) {
                      this.log(`${indent}  Generated UUID for primary key ${pk.Name}: ${uuid}`);
                    }
                  }
                }
              }
            }
          }
          
          // Apply fields with parent/root context
          for (const [field, value] of Object.entries(relatedRecord.fields)) {
            if (field in entity) {
              try {
                const processedValue = await syncEngine.processFieldValue(
                  value, 
                  baseDir, 
                  parentEntity, 
                  rootEntity
                );
                if (verbose) {
                  this.log(`${indent}  Setting ${field}: ${JSON.stringify(value)} -> ${JSON.stringify(processedValue)}`);
                }
                (entity as any)[field] = processedValue;
              } catch (error) {
                throw new Error(`Failed to process field '${field}' in ${entityName}: ${error}`);
              }
            } else {
              this.warn(`${indent}  Field '${field}' does not exist on entity '${entityName}'`);
            }
          }
          
          // Check for duplicate processing (but only for existing records that were loaded)
          let isDuplicate = false;
          if (!isNew && entity) {
            // Use parent file path for related entities since they're defined in the parent's file
            const relatedFilePath = parentFilePath || path.join(baseDir, 'unknown');
            isDuplicate = this.checkAndTrackRecord(entityName, entity, relatedFilePath, parentArrayIndex);
          }
          
          // Check if the record is dirty before saving
          let wasActuallyUpdated = false;
          if (!isNew && entity.Dirty) {
            // Record is dirty, get the changes
            const changes = entity.GetChangesSinceLastSave();
            const changeKeys = Object.keys(changes);
            if (changeKeys.length > 0) {
              wasActuallyUpdated = true;
              
              // Get primary key info for display
              const entityInfo = syncEngine.getEntityInfo(entityName);
              const primaryKeyDisplay: string[] = [];
              if (entityInfo) {
                for (const pk of entityInfo.PrimaryKeys) {
                  primaryKeyDisplay.push(`${pk.Name}: ${entity.Get(pk.Name)}`);
                }
              }
              
              this.log(''); // Add newline before update output
              this.log(`${indent}📝 Updating related ${entityName} record:`);
              if (primaryKeyDisplay.length > 0) {
                this.log(`${indent}   Primary Key: ${primaryKeyDisplay.join(', ')}`);
              }
              this.log(`${indent}   Changes:`);
              for (const fieldName of changeKeys) {
                const field = entity.GetFieldByName(fieldName);
                const oldValue = field ? field.OldValue : undefined;
                const newValue = (changes as any)[fieldName];
                this.log(`${indent}     ${fieldName}: ${oldValue} → ${newValue}`);
              }
            }
          } else if (isNew) {
            wasActuallyUpdated = true;
          }
          
          // Save the related entity
          const saved = await entity.Save();
          if (!saved) {
            const message = entity.LatestResult?.Message;
            if (message) {
              throw new Error(`Failed to save related ${entityName}: ${message}`);
            }
            
            const errors = entity.LatestResult?.Errors?.map(err => 
              typeof err === 'string' ? err : (err?.message || JSON.stringify(err))
            )?.join(', ') || 'Unknown error';
            throw new Error(`Failed to save related ${entityName}: ${errors}`);
          }
          
          // Update stats - don't count duplicates
          if (!isDuplicate) {
            if (isNew) {
              stats.created++;
            } else if (wasActuallyUpdated) {
              stats.updated++;
            } else {
              stats.unchanged++;
            }
          }
          
          if (verbose && wasActuallyUpdated) {
            this.log(`${indent}  ✓ ${isNew ? 'Created' : 'Updated'} ${entityName} record`);
          } else if (verbose && !wasActuallyUpdated) {
            this.log(`${indent}  - No changes to ${entityName} record`);
          }
          
          // Update the related record with primary key and sync metadata
          const entityInfo = syncEngine.getEntityInfo(entityName);
          if (entityInfo) {
            // Update primary key if new
            if (isNew) {
              relatedRecord.primaryKey = {};
              for (const pk of entityInfo.PrimaryKeys) {
                relatedRecord.primaryKey[pk.Name] = entity.Get(pk.Name);
              }
              
              // Track the new related entity now that we have its primary key
              const relatedFilePath = parentFilePath || path.join(baseDir, 'unknown');
              this.checkAndTrackRecord(entityName, entity, relatedFilePath, parentArrayIndex);
            }
            
            // Always update sync metadata
            relatedRecord.sync = {
              lastModified: new Date().toISOString(),
              checksum: syncEngine.calculateChecksum(relatedRecord.fields)
            };
          }
          
          // Process nested related entities if any
          if (relatedRecord.relatedEntities) {
            const nestedStats = await this.processRelatedEntities(
              relatedRecord.relatedEntities,
              entity,
              rootEntity,
              baseDir,
              syncEngine,
              verbose,
              fileBackupManager,
              indentLevel + 1,
              parentFilePath,
              parentArrayIndex
            );
            
            // Accumulate nested stats
            stats.created += nestedStats.created;
            stats.updated += nestedStats.updated;
            stats.unchanged += nestedStats.unchanged;
          }
        } catch (error) {
          throw new Error(`Failed to process related ${entityName}: ${error}`);
        }
      }
    }
    
    return stats;
  }
  
  /**
   * Generate a unique tracking key for a record based on entity name and primary key values
   */
  private generateRecordKey(entityName: string, entity: BaseEntity): string {
    const entityInfo = entity.EntityInfo;
    const primaryKeyValues: string[] = [];
    
    if (entityInfo && entityInfo.PrimaryKeys.length > 0) {
      for (const pk of entityInfo.PrimaryKeys) {
        const value = entity.Get(pk.Name);
        primaryKeyValues.push(`${pk.Name}:${value}`);
      }
    }
    
    return `${entityName}|${primaryKeyValues.join('|')}`;
  }
  
  /**
   * Check if a record has already been processed and warn if duplicate
   */
  private checkAndTrackRecord(
    entityName: string, 
    entity: BaseEntity, 
    filePath?: string,
    arrayIndex?: number,
    lineNumber?: number
  ): boolean {
    const recordKey = this.generateRecordKey(entityName, entity);
    
    const existing = this.processedRecords.get(recordKey);
    if (existing) {
      const primaryKeyDisplay = entity.EntityInfo?.PrimaryKeys
        .map(pk => `${pk.Name}: ${entity.Get(pk.Name)}`)
        .join(', ') || 'unknown';
      
      // Format file location with clickable link for VSCode
      // Create maps with just the line numbers we have
      const currentLineMap = lineNumber ? new Map([[arrayIndex || 0, lineNumber]]) : undefined;
      const originalLineMap = existing.lineNumber ? new Map([[existing.arrayIndex || 0, existing.lineNumber]]) : undefined;
      
      const currentLocation = this.formatFileLocation(filePath, arrayIndex, currentLineMap);
      const originalLocation = this.formatFileLocation(existing.filePath, existing.arrayIndex, originalLineMap);
      
      this.warn(`⚠️  Duplicate record detected for ${entityName} (${primaryKeyDisplay})`);
      this.warn(`   Current location:  ${currentLocation}`);
      this.warn(`   Original location: ${originalLocation}`);
      this.warn(`   The duplicate update will proceed, but you should review your data for unintended duplicates.`);
      
      return true; // is duplicate
    }
    
    // Track the record with its source location
    this.processedRecords.set(recordKey, {
      filePath: filePath || 'unknown',
      arrayIndex,
      lineNumber
    });
    return false; // not duplicate
  }
  
  /**
   * Parse JSON file and track line numbers for array elements
   */
  private async parseJsonWithLineNumbers(filePath: string): Promise<{
    content: any;
    lineNumbers: Map<number, number>; // arrayIndex -> lineNumber
  }> {
    const fileText = await fs.readFile(filePath, 'utf-8');
    const lines = fileText.split('\n');
    const lineNumbers = new Map<number, number>();
    
    // Parse the JSON
    const content = JSON.parse(fileText);
    
    // If it's an array, try to find where each element starts
    if (Array.isArray(content)) {
      let inString = false;
      let bracketDepth = 0;
      let currentIndex = -1;
      
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        
        // Simple tracking of string boundaries and bracket depth
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const prevChar = i > 0 ? line[i - 1] : '';
          
          if (char === '"' && prevChar !== '\\') {
            inString = !inString;
          }
          
          if (!inString) {
            if (char === '{') {
              bracketDepth++;
              // If we're at depth 1 in the main array, this is a new object
              if (bracketDepth === 1 && line.trim().startsWith('{')) {
                currentIndex++;
                lineNumbers.set(currentIndex, lineNum + 1); // 1-based line numbers
              }
            } else if (char === '}') {
              bracketDepth--;
            }
          }
        }
      }
    }
    
    return { content, lineNumbers };
  }
  
  /**
   * Format file location with clickable link for VSCode
   */
  private formatFileLocation(filePath?: string, arrayIndex?: number, lineNumbers?: Map<number, number>): string {
    if (!filePath || filePath === 'unknown') {
      return 'unknown';
    }
    
    // Get absolute path for better VSCode integration
    const absolutePath = path.resolve(filePath);
    
    // Try to get actual line number from our tracking
    let lineNumber = 1;
    if (arrayIndex !== undefined && lineNumbers && lineNumbers.has(arrayIndex)) {
      lineNumber = lineNumbers.get(arrayIndex)!;
    } else if (arrayIndex !== undefined) {
      // Fallback estimation if we don't have actual line numbers
      lineNumber = 2 + (arrayIndex * 15);
    }
    
    // Create clickable file path for VSCode - format: file:line
    // VSCode will make this clickable in the terminal
    return `${absolutePath}:${lineNumber}`;
  }
}