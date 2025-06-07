import { Command, Flags } from '@oclif/core';
import fs from 'fs-extra';
import path from 'path';
import { confirm } from '@inquirer/prompts';
import ora from 'ora-classic';
import fastGlob from 'fast-glob';
import { loadMJConfig, loadSyncConfig, loadEntityConfig } from '../../config';
import { SyncEngine, RecordData } from '../../lib/sync-engine';
import { initializeProvider, findEntityDirectories, getSystemUser } from '../../lib/provider-utils';
import { BaseEntity } from '@memberjunction/core';
import { cleanupProvider } from '../../lib/provider-utils';

export default class Push extends Command {
  static description = 'Push local file changes to the database';
  
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
  };
  
  async run(): Promise<void> {
    const { flags } = await this.parse(Push);
    const spinner = ora();
    
    try {
      // Load configurations
      spinner.start('Loading configuration');
      const mjConfig = loadMJConfig();
      if (!mjConfig) {
        this.error('No mj.config.cjs found in current directory or parent directories');
      }
      
      const syncConfig = await loadSyncConfig(process.cwd());
      
      // Initialize data provider
      await initializeProvider(mjConfig);
      
      // Initialize sync engine
      const syncEngine = new SyncEngine(getSystemUser());
      await syncEngine.initialize();
      spinner.succeed('Configuration loaded');
      
      // Find entity directories to process
      const entityDirs = findEntityDirectories(process.cwd(), flags.dir);
      
      if (entityDirs.length === 0) {
        this.error('No entity directories found');
      }
      
      this.log(`Found ${entityDirs.length} entity ${entityDirs.length === 1 ? 'directory' : 'directories'} to process`);
      
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
        
        this.log(`\nProcessing ${entityConfig.entity} in ${entityDir}`);
        
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
      
      // Summary
      this.log('\n=== Push Summary ===');
      this.log(`Created: ${totalCreated}`);
      this.log(`Updated: ${totalUpdated}`);
      this.log(`Errors: ${totalErrors}`);
      
      if (totalErrors > 0 && flags.ci) {
        this.error('Push failed with errors in CI mode');
      }
      
    } catch (error) {
      spinner.fail('Push failed');
      this.error(error as Error);
    } finally {
      // Clean up database connection
      await cleanupProvider();
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
    
    // Find all JSON files
    const pattern = entityConfig.filePattern || '*.json';
    const jsonFiles = await fastGlob(pattern, {
      cwd: entityDir,
      ignore: ['.mj-sync.json', '.mj-folder.json']
    });
    
    this.log(`Found ${jsonFiles.length} records to process`);
    
    if (jsonFiles.length === 0) {
      return result;
    }
    
    // Confirm if needed
    if (!flags['dry-run'] && !flags.ci && syncConfig?.push?.requireConfirmation) {
      const proceed = await confirm({
        message: `Push ${jsonFiles.length} ${entityConfig.entity} records to database?`
      });
      
      if (!proceed) {
        this.log('Push cancelled');
        return result;
      }
    }
    
    // Process each file
    const spinner = ora();
    spinner.start('Processing records');
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(entityDir, file);
        const recordData: RecordData = await fs.readJson(filePath);
        
        // Build and process defaults (including lookups)
        const defaults = await syncEngine.buildDefaults(filePath, entityConfig);
        
        // Process the record
        const isNew = await this.pushRecord(
          recordData,
          entityConfig.entity,
          path.dirname(filePath),
          file,
          defaults,
          syncEngine,
          flags['dry-run'],
          flags.verbose
        );
        
        if (!flags['dry-run']) {
          if (isNew) {
            result.created++;
          } else {
            result.updated++;
          }
        }
        
        spinner.text = `Processing records (${result.created + result.updated + result.errors}/${jsonFiles.length})`;
        
      } catch (error) {
        result.errors++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.error(`Failed to process ${file}: ${errorMessage}`, { exit: false });
      }
    }
    
    spinner.succeed(`Processed ${jsonFiles.length} records`);
    return result;
  }
  
  private async pushRecord(
    recordData: RecordData,
    entityName: string,
    baseDir: string,
    fileName: string,
    defaults: Record<string, any>,
    syncEngine: SyncEngine,
    dryRun: boolean,
    verbose: boolean = false
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
      const errors = entity.LatestResult?.Errors?.join(', ') || 'Unknown error';
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
    
    // Always update sync metadata and write back to file
    // This ensures related entities are persisted with their metadata
    recordData.sync = {
      lastModified: new Date().toISOString(),
      checksum: syncEngine.calculateChecksum(recordData.fields)
    };
    
    // Write back to file
    const filePath = path.join(baseDir, fileName);
    await fs.writeJson(filePath, recordData, { spaces: 2 });
    
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
      this.log(`${indent}↳ Processing ${records.length} related ${entityName} records`);
      
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
            const errors = entity.LatestResult?.Errors?.join(', ') || 'Unknown error';
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