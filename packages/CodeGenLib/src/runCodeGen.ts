/**
 * Main orchestrator for the MemberJunction code generation process.
 * Coordinates all aspects of code generation including database schema analysis,
 * metadata management, SQL generation, TypeScript entities, Angular components,
 * GraphQL resolvers, and more.
 */

import { GraphQLServerGeneratorBase } from './Misc/graphql_server_codegen';
import { SQLCodeGenBase } from './Database/sql_codegen';
import { EntitySubClassGeneratorBase } from './Misc/entity_subclasses_codegen';
import { SQLServerDataProvider, UserCache, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import { MSSQLConnection } from './Config/db-connection';
import { ManageMetadataBase } from './Database/manage-metadata';
import { outputDir, commands, mj_core_schema, configInfo, getSettingValue } from './Config/config';
import { logError, logMessage, logStatus, logWarning, startSpinner, updateSpinner, succeedSpinner, failSpinner } from './Misc/status_logging';
import * as MJ from '@memberjunction/core';
import { RunCommandsBase } from './Misc/runCommand';
import { DBSchemaGeneratorBase } from './Database/dbSchema';
import { AngularClientGeneratorBase } from './Angular/angular-codegen';
import { SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { CreateNewUserBase } from './Misc/createNewUser';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { ActionSubClassGeneratorBase } from './Misc/action_subclasses_codegen';
import { SQLLogging } from './Misc/sql_logging';
import { SystemIntegrityBase } from './Misc/system_integrity';
import { ActionEngineBase } from '@memberjunction/actions-base';

/** Extract core schema name from configuration */
const { mjCoreSchema } = configInfo;

/**
 * Main orchestrator class for the MemberJunction code generation process.
 * 
 * This class coordinates a comprehensive code generation pipeline that transforms
 * database schemas into a complete, type-safe, full-stack application. The process includes:
 * 
 * **Pipeline Steps:**
 * 1. **Database Setup** - Initialize connections and metadata
 * 2. **Metadata Management** - Analyze schema changes and update metadata
 * 3. **SQL Generation** - Create views, procedures, and indexes
 * 4. **TypeScript Entities** - Generate entity classes with validation
 * 5. **Angular Components** - Create forms and UI components
 * 6. **GraphQL Resolvers** - Generate API endpoints
 * 7. **Action Classes** - Create business logic containers
 * 8. **Documentation** - Generate schema JSON for AI/documentation
 * 9. **Post-processing** - Run commands and integrity checks
 * 
 * **Customization:**
 * You can sub-class this class and override specific methods to customize
 * the code generation process for your specific needs.
 * 
 * @example
 * ```typescript
 * const codeGen = new RunCodeGenBase();
 * await codeGen.Run(); // Full generation
 * await codeGen.Run(true); // Skip database operations
 * ```
 */
export class RunCodeGenBase {
  /**
   * Sets up the SQL Server data source and initializes the MemberJunction core metadata.
   * This method establishes the database connection pool and configures the data provider
   * that will be used throughout the code generation process.
   * 
   * Override this method to customize the data source setup process for different
   * database providers or connection configurations.
   * 
   * @returns Promise resolving to the configured SQLServerDataProvider instance
   * @throws Error if connection setup fails
   */
  public async setupDataSource(): Promise<SQLServerDataProvider> {
    /****************************************************************************************
        // First, setup the data source and make sure the metadata and related stuff for MJCore is initialized
        ****************************************************************************************/
    startSpinner('Initializing database connection...');
    const pool = await MSSQLConnection(); // get the MSSQL connection pool
    const config = new SQLServerProviderConfigData(pool, '', mj_core_schema(), 0);
    const sqlServerProvider: SQLServerDataProvider = await setupSQLServerClient(config);
    succeedSpinner('Database connection initialized');
    return sqlServerProvider;
  }

  /**
   * Main entry point for the complete code generation process.
   * 
   * Orchestrates the entire pipeline from database schema analysis to final code output.
   * The process is highly configurable through the configuration file and can be
   * partially skipped for faster iteration during development.
   * 
   * **Process Flow:**
   * 1. Initialize data sources and user context
   * 2. Execute pre-generation commands and scripts
   * 3. Manage metadata and schema changes
   * 4. Generate SQL objects (views, procedures, indexes)
   * 5. Generate TypeScript entity classes
   * 6. Generate Angular UI components
   * 7. Generate GraphQL API resolvers
   * 8. Generate Action business logic classes
   * 9. Create documentation JSON
   * 10. Run integrity checks
   * 11. Execute post-generation commands
   * 
   * @param skipDatabaseGeneration If true, skips all database-related operations
   *   (metadata management, SQL generation). Useful for faster UI-only regeneration.
   * @throws Error if any critical step fails
   * @returns Promise that resolves when generation is complete
   */
  public async Run(skipDatabaseGeneration: boolean = false) {
    try {
      const startTime = new Date();
      startSpinner(`Starting MemberJunction CodeGen @ ${startTime.toLocaleString()}`);

      const provider: SQLServerDataProvider = await this.setupDataSource();

      updateSpinner('Loading user cache and metadata...');
      const pool = await MSSQLConnection();
      await UserCache.Instance.Refresh(pool);
      const userMatch: MJ.UserInfo = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner')!;
      const currentUser = userMatch ? userMatch : UserCache.Users[0]; // if we don't find an Owner, use the first user in the cache

      // get the entity metadata
      const md = new MJ.Metadata();
      if (md.Entities.length === 0) {
        failSpinner('No entities found in metadata');
        process.exit(1);
      }
      succeedSpinner(`Loaded ${md.Entities.length} entities from metadata`);

      const runCommandsObject = MJGlobal.Instance.ClassFactory.CreateInstance<RunCommandsBase>(RunCommandsBase)!;
      const sqlCodeGenObject = MJGlobal.Instance.ClassFactory.CreateInstance<SQLCodeGenBase>(SQLCodeGenBase)!;

      // check to see if the user wants to skip database generation via the config settings
      const skipDB = skipDatabaseGeneration || getSettingValue('skip_database_generation', false);
      if (!skipDB) {
        logStatus(
          'Handling SQL Script Execution, Metadata Maintenance, and SQL Object Generation... (to skip this, set skip_database_generation to true in the config file under settings)'
        );

        SQLLogging.initSQLLogging(); // initialize the SQL Logging functionality

        /****************************************************************************************
                // STEP 0 --- Precursor Step execute any commands specified in the config file
                ****************************************************************************************/
        const beforeCommands = commands('BEFORE');
        if (beforeCommands && beforeCommands.length > 0) {
          logStatus('Executing BEFORE commands...');
          const results = await runCommandsObject.runCommands(beforeCommands);
          if (results.some((r) => !r.success)) logError('ERROR running one or more BEFORE commands');
        }
        /****************************************************************************************
                // STEP 0.1 --- Execute any before SQL Scripts specified in the config file
                ****************************************************************************************/
        if (!(await sqlCodeGenObject.runCustomSQLScripts(pool, 'before-all'))) logError('ERROR running before-all SQL Scripts');

        /****************************************************************************************
                // STEP 0.2 --- Create a new user if there is newUserSetup info in the config file
                ****************************************************************************************/
        const newUserSetup = configInfo.newUserSetup;
        if (newUserSetup) {
          const newUserObject = MJGlobal.Instance.ClassFactory.CreateInstance<CreateNewUserBase>(CreateNewUserBase)!;
          const result = await newUserObject.createNewUser(newUserSetup);
          if (!result.Success) {
            if (result.Severity === 'error') {
              logError('ERROR creating new user');
              logError('   ' + result.Message);
            } else {
              logWarning('Warning: (New User Setup) ' + result.Message);
            }
          }
        }

        /****************************************************************************************
                // STEP 1 - Manage Metadata - including generating new metadata as required
                ****************************************************************************************/
        const manageMD = MJGlobal.Instance.ClassFactory.CreateInstance<ManageMetadataBase>(ManageMetadataBase)!;
        logStatus('Managing Metadata...');
        const metadataSuccess = await manageMD.manageMetadata(pool, currentUser);
        if (!metadataSuccess) {
          logError('ERROR managing metadata');
        } else {
          // now - we need to tell our metadata object to refresh itself
          await provider.Refresh();
        }

        /****************************************************************************************
                // STEP 2 - SQL Script Generation
                ****************************************************************************************/
        const sqlOutputDir = outputDir('SQL', true);
        if (sqlOutputDir) {
          logStatus('Managing SQL Scripts and Execution...');
          const sqlSuccess = await sqlCodeGenObject.manageSQLScriptsAndExecution(pool, md.Entities, sqlOutputDir, currentUser);
          if (!sqlSuccess) {
            logError('Error managing SQL scripts and execution');
          }
        } 
        else {
          logStatus('SQL output directory NOT found in config file, skipping...');
        }
      } 
      else {
        logMessage(
          'Skipping all database related CodeGen work because skip_database_generation was set to true in the config file under settings',
          MJ.SeverityType.Warning,
          false
        );

        // we skipped the database generation but we need to load generated code for validators from the database to ensure that we have them
        // ready for later use.
        const manageMD = MJGlobal.Instance.ClassFactory.CreateInstance<ManageMetadataBase>(ManageMetadataBase)!;
        logStatus('Checking/Loading AI Generated Code from Metadata...');
        const metadataSuccess = await manageMD.loadGeneratedCode(pool, currentUser);
        if (!metadataSuccess) {
          logError('ERROR checking/loading AI Generated Code from Metadata');
          return; // FATAL ERROR - we can't continue
        } 
      }

      const coreEntities = md.Entities.filter((e) => e.IncludeInAPI).filter(
        (e) => e.SchemaName.trim().toLowerCase() === mjCoreSchema.trim().toLowerCase()
      );
      const nonCoreEntities = md.Entities.filter((e) => e.IncludeInAPI).filter(
        (e) => e.SchemaName.trim().toLowerCase() !== mjCoreSchema.trim().toLowerCase()
      );

      /****************************************************************************************
            // STEP 3(a) - GraphQL Server Code Gen
            ****************************************************************************************/
      const graphQLCoreResolversOutputDir = outputDir('GraphQLCoreEntityResolvers', false);
      if (graphQLCoreResolversOutputDir) {
        // generate the GraphQL server code
        logStatus('Generating CORE Entity GraphQL Resolver Code...');
        const graphQLGenerator = MJGlobal.Instance.ClassFactory.CreateInstance<GraphQLServerGeneratorBase>(GraphQLServerGeneratorBase)!;
        if (!graphQLGenerator.generateGraphQLServerCode(coreEntities, graphQLCoreResolversOutputDir, '@memberjunction/core-entities', true))
          logError('Error generating GraphQL server code');
      }

      const graphqlOutputDir = outputDir('GraphQLServer', true);
      if (graphqlOutputDir) {
        // generate the GraphQL server code
        logStatus('Generating GraphQL Resolver Code...');
        const graphQLGenerator = MJGlobal.Instance.ClassFactory.CreateInstance<GraphQLServerGeneratorBase>(GraphQLServerGeneratorBase)!;
        if (!graphQLGenerator.generateGraphQLServerCode(nonCoreEntities, graphqlOutputDir, 'mj_generatedentities', false))
          logError('Error generating GraphQL Resolver code');
      } else logStatus('GraphQL server output directory NOT found in config file, skipping...');

      /****************************************************************************************
            // STEP 4 - Core Entity Subclass Code Gen
            ****************************************************************************************/
      const coreEntitySubClassOutputDir = outputDir('CoreEntitySubClasses', false)!;
      if (coreEntitySubClassOutputDir && coreEntitySubClassOutputDir.length > 0) {
        // generate the entity subclass code
        logStatus('Generating CORE Entity Subclass Code...');
        const entitySubClassGeneratorObject =
          MJGlobal.Instance.ClassFactory.CreateInstance<EntitySubClassGeneratorBase>(EntitySubClassGeneratorBase)!;
        if (!await entitySubClassGeneratorObject.generateAllEntitySubClasses(pool, coreEntities, coreEntitySubClassOutputDir, skipDB)) {
          logError('Error generating entity subclass code');
        }
      }

      /****************************************************************************************
            // STEP 4.1 - Entity Subclass Code Gen
            ****************************************************************************************/
      const entitySubClassOutputDir = outputDir('EntitySubClasses', true)!;
      if (entitySubClassOutputDir) {
        // generate the entity subclass code
        logStatus('Generating Entity Subclass Code...');
        const entitySubClassGeneratorObject =
          MJGlobal.Instance.ClassFactory.CreateInstance<EntitySubClassGeneratorBase>(EntitySubClassGeneratorBase)!;
        if (!await entitySubClassGeneratorObject.generateAllEntitySubClasses(pool, nonCoreEntities, entitySubClassOutputDir, skipDB)) {
          logError('Error generating entity subclass code');
        }
      } else {
        logStatus('Entity subclass output directory NOT found in config file, skipping...');
      }

      /****************************************************************************************
            // STEP 5 - Angular Code Gen
            ****************************************************************************************/
      const angularCoreEntitiesOutputDir = outputDir('AngularCoreEntities', false);
      if (angularCoreEntitiesOutputDir) {
        // generate the Angular client code
        logStatus('Generating Angular CORE Entities Code...');
        const angularGenerator = MJGlobal.Instance.ClassFactory.CreateInstance<AngularClientGeneratorBase>(AngularClientGeneratorBase)!;
        if (!(await angularGenerator.generateAngularCode(coreEntities, angularCoreEntitiesOutputDir, 'Core', currentUser)))
          logError('Error generating Angular CORE Entities code');
      }

      const angularOutputDir = outputDir('Angular', false);
      if (angularOutputDir) {
        // generate the Angular client code
        logStatus('Generating Angular Code...');
        const angularGenerator = MJGlobal.Instance.ClassFactory.CreateInstance<AngularClientGeneratorBase>(AngularClientGeneratorBase)!;
        if (!(await angularGenerator.generateAngularCode(nonCoreEntities, angularOutputDir, '', currentUser)))
          logError('Error generating Angular code');
      } else logStatus('Angular output directory NOT found in config file, skipping...');

      /****************************************************************************************
            // STEP 6 - Database Schema Output in JSON - for documentation and can be used by AI/etc.
            ****************************************************************************************/
      const dbSchemaOutputDir = outputDir('DBSchemaJSON', false);
      if (dbSchemaOutputDir) {
        // generate the GraphQL client code
        logStatus('Generating Database Schema JSON Output...');
        const schemaGeneratorObject = MJGlobal.Instance.ClassFactory.CreateInstance<DBSchemaGeneratorBase>(DBSchemaGeneratorBase)!;
        if (!schemaGeneratorObject.generateDBSchemaJSONOutput(md.Entities, dbSchemaOutputDir))
          logError('Error generating Database Schema JSON Output');
      } else logStatus('DB Schema output directory NOT found in config file, skipping...');

      /****************************************************************************************
            // STEP 7 - Actions Code Gen
            ****************************************************************************************/
      const coreActionsOutputDir = outputDir('CoreActionSubclasses', false);
      await ActionEngineBase.Instance.Config(false, currentUser); // this is inefficient as we have the server 
      if (coreActionsOutputDir) {
        logStatus('Generating CORE Actions Code...');
        const actionsGenerator = MJGlobal.Instance.ClassFactory.CreateInstance<ActionSubClassGeneratorBase>(ActionSubClassGeneratorBase)!;
        if (!(await actionsGenerator.generateActions(ActionEngineBase.Instance.CoreActions, coreActionsOutputDir)))
          logError('Error generating CORE Actions code');
      }

      const actionsOutputDir = outputDir('ActionSubclasses', false);
      if (actionsOutputDir) {
        logStatus('Generating Actions Code...');
        const actionsGenerator = MJGlobal.Instance.ClassFactory.CreateInstance<ActionSubClassGeneratorBase>(ActionSubClassGeneratorBase)!;
        if (!(await actionsGenerator.generateActions(ActionEngineBase.Instance.NonCoreActions, actionsOutputDir)))
          logError('Error generating Actions code');
      } else logStatus('Actions output directory NOT found in config file, skipping...');

      // WRAP UP SQL LOGGING HERE
      SQLLogging.finishSQLLogging(); // finish up the SQL Logging

      // now run integrity checks
      await SystemIntegrityBase.RunIntegrityChecks(pool, true);

      /****************************************************************************************
      // STEP 8 --- Finalization Step - execute any AFTER commands specified in the config file
      ****************************************************************************************/
      const afterCommands = commands('AFTER');
      if (afterCommands && afterCommands.length > 0) {
        logStatus('Executing AFTER commands...');
        const results = await runCommandsObject.runCommands(afterCommands);
        if (results.some((r) => !r.success)) logError('ERROR running one or more AFTER commands');
      }

      /****************************************************************************************
      // STEP 9 --- Execute any AFTER SQL Scripts specified in the config file
      ****************************************************************************************/
      if (!skipDB) {
        if (!(await sqlCodeGenObject.runCustomSQLScripts(pool, 'after-all'))) logError('ERROR running after-all SQL Scripts');
      }
        
      logStatus(md.Entities.length + ' entities processed and outputed to configured directories');
      logStatus(
        'MJ CodeGen Run Complete! @ ' +
          new Date().toLocaleString() +
          ' (' +
          (new Date().getTime() - startTime.getTime()) / 1000 +
          ' seconds)'
      );

      process.exit(0); // wrap it up, 0 means success
    } catch (e) {
      logError(e as string);
      process.exit(1); // error code
    }
  }
}

/**
 * Convenience function to run the MemberJunction code generation process.
 * Creates a new instance of RunCodeGenBase and executes the full generation pipeline.
 * 
 * This is the recommended way to trigger code generation from external scripts
 * or applications.
 * 
 * @param skipDatabaseGeneration Whether to skip database-related operations
 * @returns Promise that resolves when generation is complete
 * @throws Error if generation fails
 * 
 * @example
 * ```typescript
 * // Full generation
 * await runMemberJunctionCodeGeneration();
 * 
 * // Skip database operations for faster UI generation
 * await runMemberJunctionCodeGeneration(true);
 * ```
 */
export async function runMemberJunctionCodeGeneration(skipDatabaseGeneration: boolean = false) {
  const runObject = MJGlobal.Instance.ClassFactory.CreateInstance<RunCodeGenBase>(RunCodeGenBase)!;
  return await runObject.Run(skipDatabaseGeneration);
}
