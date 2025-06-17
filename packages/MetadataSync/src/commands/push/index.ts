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

export default class Push extends Command {
  static description = 'Push local file changes to the database';
  
  private warnings: string[] = [];
  private errors: string[] = [];
  
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
    const startTime = Date.now();
    
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
      const entityDirs = findEntityDirectories(configManager.getOriginalCwd(), flags.dir, syncConfig?.directoryOrder);
      
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
              this.error('Push cancelled due to validation errors.');
            }
          }
        } else {
          this.log(chalk.green('✓ Validation passed'));
        }
      }
      
      // Start a database transaction for the entire push operation (unless in dry-run mode)
      // IMPORTANT: We start the transaction AFTER metadata loading and validation to avoid
      // transaction conflicts with background refresh operations
      if (!flags['dry-run']) {
        const { getDataProvider } = await import('../../lib/provider-utils');
        const dataProvider = getDataProvider();
        if (dataProvider && typeof dataProvider.BeginTransaction === 'function') {
          try {
            await dataProvider.BeginTransaction();
            if (flags.verbose) {
              this.log('🔄 Transaction started - all changes will be committed or rolled back as a unit');
            }
          } catch (error) {
            this.warn('Failed to start transaction - changes will be committed individually');
            this.warn(`Transaction error: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else {
          this.warn('Transaction support not available - changes will be committed individually');
        }
      }
      
      // Process each entity directory
      let totalCreated = 0;
      let totalUpdated = 0;
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
          syncConfig
        );
        
        totalCreated += result.created;
        totalUpdated += result.updated;
        totalErrors += result.errors;
      }
      
      // Summary using FormattingService
      const endTime = Date.now();
      const { FormattingService } = await import('../../services/FormattingService');
      const formatter = new FormattingService();
      
      this.log('\n' + formatter.formatSyncSummary('push', {
        created: totalCreated,
        updated: totalUpdated,
        deleted: 0,
        skipped: 0,
        errors: totalErrors,
        duration: endTime - startTime
      }));
      
      // Handle transaction commit/rollback
      if (!flags['dry-run']) {
        const dataProvider = Metadata.Provider as SQLServerDataProvider;
        
        // Check if we have an active transaction
        if (dataProvider ) {
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
            } else {
              // User chose to rollback or errors/warnings in CI mode
              this.log('\n🔙 Rolling back all changes...');
              await dataProvider.RollbackTransaction();
              this.log('✅ Rollback completed - no changes were made to the database');
            }
          } catch (error) {
            // Try to rollback on any error
            this.log('\n❌ Transaction error - attempting to roll back changes');
            try {
              await dataProvider.RollbackTransaction();
              this.log('✅ Rollback completed');
            } catch (rollbackError) {
              this.log('❌ Rollback failed: ' + (rollbackError instanceof Error ? rollbackError.message : String(rollbackError)));
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
      
      // Try to rollback the transaction if one is active
      if (!flags['dry-run']) {
        const { getDataProvider } = await import('../../lib/provider-utils');
        const dataProvider = getDataProvider();
        
        if (dataProvider && typeof dataProvider.RollbackTransaction === 'function') {
          try {
            this.log('\n🔙 Rolling back transaction due to error...');
            await dataProvider.RollbackTransaction();
            this.log('✅ Rollback completed - no changes were made to the database');
          } catch (rollbackError) {
            this.log('❌ Rollback failed: ' + (rollbackError instanceof Error ? rollbackError.message : String(rollbackError)));
          }
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
    syncConfig: any
  ): Promise<{ created: number; updated: number; errors: number }> {
    const result = { created: 0, updated: 0, errors: 0 };
    
    // Find files matching the configured pattern
    const pattern = entityConfig.filePattern || '*.json';
    const jsonFiles = await fastGlob(pattern, {
      cwd: entityDir,
      ignore: ['.mj-sync.json', '.mj-folder.json', '**/*.backup'],
      dot: true,  // Include dotfiles (files starting with .)
      onlyFiles: true
    });
    
    if (flags.verbose) {
      this.log(`Processing ${jsonFiles.length} records in ${path.relative(process.cwd(), entityDir) || '.'}`);
    }
    
    // First, process all JSON files in this directory
    await this.processJsonFiles(jsonFiles, entityDir, entityConfig, syncEngine, flags, result);
    
    // Then, recursively process subdirectories
    const entries = await fs.readdir(entityDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
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
          syncConfig
        );
        
        result.created += subResult.created;
        result.updated += subResult.updated;
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
    result: { created: number; updated: number; errors: number }
  ): Promise<void> {
    if (jsonFiles.length === 0) {
      return;
    }
    
    const spinner = ora();
    spinner.start('Processing records');
    
    let totalRecords = 0;
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(entityDir, file);
        const fileContent = await fs.readJson(filePath);
        
        // Process templates in the loaded content
        const processedContent = await syncEngine.processTemplates(fileContent, entityDir);
        
        // Check if the file contains a single record or an array of records
        const isArray = Array.isArray(processedContent);
        const records: RecordData[] = isArray ? processedContent : [processedContent];
        totalRecords += records.length;
        
        // Build and process defaults (including lookups)
        const defaults = await syncEngine.buildDefaults(filePath, entityConfig);
        
        // Process each record in the file
        for (let i = 0; i < records.length; i++) {
          const recordData = records[i];
          
          // Process the record
          const isNew = await this.pushRecord(
            recordData,
            entityConfig.entity,
            path.dirname(filePath),
            file,
            defaults,
            syncEngine,
            flags['dry-run'],
            flags.verbose,
            isArray ? i : undefined
          );
          
          if (!flags['dry-run']) {
            if (isNew) {
              result.created++;
            } else {
              result.updated++;
            }
          }
          
          spinner.text = `Processing records (${result.created + result.updated + result.errors}/${totalRecords})`;
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
      }
    }
    
    if (flags.verbose) {
      spinner.succeed(`Processed ${totalRecords} records from ${jsonFiles.length} files`);
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
    arrayIndex?: number
  ): Promise<boolean> {
    // Load or create entity
    let entity: BaseEntity | null = null;
    let isNew = false;
    
    if (recordData.primaryKey) {
      entity = await syncEngine.loadEntity(entityName, recordData.primaryKey);
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
      return isNew;
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
    if (recordData.relatedEntities && !dryRun) {
      await this.processRelatedEntities(
        recordData.relatedEntities,
        entity,
        entity, // root is same as parent for top level
        baseDir,
        syncEngine,
        verbose
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
    
    return isNew;
  }
  
  private async processRelatedEntities(
    relatedEntities: Record<string, RecordData[]>,
    parentEntity: BaseEntity,
    rootEntity: BaseEntity,
    baseDir: string,
    syncEngine: SyncEngine,
    verbose: boolean = false,
    indentLevel: number = 1
  ): Promise<void> {
    const indent = '  '.repeat(indentLevel);
    
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
          
          if (verbose) {
            this.log(`${indent}  ✓ ${isNew ? 'Created' : 'Updated'} ${entityName} record`);
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
            }
            
            // Always update sync metadata
            relatedRecord.sync = {
              lastModified: new Date().toISOString(),
              checksum: syncEngine.calculateChecksum(relatedRecord.fields)
            };
          }
          
          // Process nested related entities if any
          if (relatedRecord.relatedEntities) {
            await this.processRelatedEntities(
              relatedRecord.relatedEntities,
              entity,
              rootEntity,
              baseDir,
              syncEngine,
              verbose,
              indentLevel + 1
            );
          }
        } catch (error) {
          throw new Error(`Failed to process related ${entityName}: ${error}`);
        }
      }
    }
  }
}