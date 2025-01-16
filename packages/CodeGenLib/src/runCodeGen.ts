import { GraphQLServerGeneratorBase } from './Misc/graphql_server_codegen';
import { SQLCodeGenBase } from './Database/sql_codegen';
import { EntitySubClassGeneratorBase } from './Misc/entity_subclasses_codegen';
import { SQLServerDataProvider, UserCache, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import AppDataSource, { MSSQLConnection } from './Config/db-connection';
import { ManageMetadataBase } from './Database/manage-metadata';
import { outputDir, commands, mj_core_schema, configInfo, getSettingValue } from './Config/config';
import { logError, logMessage, logStatus, logWarning } from './Misc/status_logging';
import * as MJ from '@memberjunction/core';
import { RunCommandsBase } from './Misc/runCommand';
import { DBSchemaGeneratorBase } from './Database/dbSchema';
import { AngularClientGeneratorBase } from './Angular/angular-codegen';
import { SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { CreateNewUserBase } from './Misc/createNewUser';
import { convertCamelCaseToHaveSpaces, generatePluralName, MJGlobal, RegisterClass } from '@memberjunction/global';
import { ActionSubClassGeneratorBase } from './Misc/action_subclasses_codegen';
import { ActionEngineServer } from '@memberjunction/actions';
import { SQLLogging } from './Misc/sql_logging';

const { mjCoreSchema } = configInfo;

/**
 * This class is the main entry point for running the code generation process. It will handle all the steps required to generate the code for the MemberJunction system. You can sub-class this class
 * and override specific methods as desired to customize the code generation process.
 */
@RegisterClass(RunCodeGenBase)
export class RunCodeGenBase {
  /**
   * This method is called to setup the data source for the code generation process. You can override this method to customize the data source setup process.
   */
  public async setupDataSource(): Promise<SQLServerDataProvider> {
    /****************************************************************************************
        // First, setup the data source and make sure the metadata and related stuff for MJCore is initialized
        ****************************************************************************************/
    logStatus('Initializing Data Source...');
    await AppDataSource.initialize()
      .then(() => {
        logStatus('Data Source has been initialized!');
      })
      .catch((err) => {
        logError('Error during Data Source initialization', err);
      });

    const pool = await MSSQLConnection(); // get the MSSQL connection pool

    const config = new SQLServerProviderConfigData(AppDataSource, '', mj_core_schema(), 0);
    const sqlServerProvider: SQLServerDataProvider = await setupSQLServerClient(config);
    return sqlServerProvider;
  }

  /**
   * Main entry point to run the code generation process. This method will handle all the steps required to generate the code for the MemberJunction system. You can sub-class this class and
   * override this method to customize the code generation process.
   * @param skipDatabaseGeneration
   */
  public async Run(skipDatabaseGeneration: boolean = false) {
    try {
      const startTime = new Date();
      logStatus('\n\nSTARTING MJ CodeGen Run... @ ' + startTime.toLocaleString());

      const provider: SQLServerDataProvider = await this.setupDataSource();

      await UserCache.Instance.Refresh(AppDataSource);
      const userMatch: MJ.UserInfo = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner')!;
      const currentUser = userMatch ? userMatch : UserCache.Users[0]; // if we don't find an Owner, use the first user in the cache

      // get the entity metadata
      const md = new MJ.Metadata();
      if (md.Entities.length === 0) {
        logError('No entities found in metadata, exiting...'); // TODO: add a way to generate the metadata if it doesn't exist
        process.exit(1);
      }

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
        if (!(await sqlCodeGenObject.runCustomSQLScripts(AppDataSource, 'before-all'))) logError('ERROR running before-all SQL Scripts');

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
        const metadataSuccess = await manageMD.manageMetadata(AppDataSource);
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
          const sqlSuccess = await sqlCodeGenObject.manageSQLScriptsAndExecution(AppDataSource, md.Entities, sqlOutputDir);
          if (!sqlSuccess) {
            logError('Error managing SQL scripts and execution');
          }
        } else logStatus('SQL output directory NOT found in config file, skipping...');

        SQLLogging.finishSQLLogging(); // finish up the SQL Logging
      } else {
        logMessage(
          'Skipping all database related CodeGen work because skip_database_generation was set to true in the config file under settings',
          MJ.SeverityType.Warning,
          false
        );
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
        if (!entitySubClassGeneratorObject.generateAllEntitySubClasses(coreEntities, coreEntitySubClassOutputDir)) {
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
        if (!entitySubClassGeneratorObject.generateAllEntitySubClasses(nonCoreEntities, entitySubClassOutputDir)) {
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
      await ActionEngineServer.Instance.Config(false, currentUser);
      if (coreActionsOutputDir) {
        logStatus('Generating CORE Actions Code...');
        const actionsGenerator = MJGlobal.Instance.ClassFactory.CreateInstance<ActionSubClassGeneratorBase>(ActionSubClassGeneratorBase)!;
        if (!(await actionsGenerator.generateActions(ActionEngineServer.Instance.CoreActions, coreActionsOutputDir)))
          logError('Error generating CORE Actions code');
      }

      const actionsOutputDir = outputDir('ActionSubclasses', false);
      if (actionsOutputDir) {
        logStatus('Generating Actions Code...');
        const actionsGenerator = MJGlobal.Instance.ClassFactory.CreateInstance<ActionSubClassGeneratorBase>(ActionSubClassGeneratorBase)!;
        if (!(await actionsGenerator.generateActions(ActionEngineServer.Instance.NonCoreActions, actionsOutputDir)))
          logError('Error generating Actions code');
      } else logStatus('Actions output directory NOT found in config file, skipping...');

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
        if (!(await sqlCodeGenObject.runCustomSQLScripts(AppDataSource, 'after-all'))) logError('ERROR running after-all SQL Scripts');
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

export async function runMemberJunctionCodeGeneration(skipDatabaseGeneration: boolean = false) {
  const runObject = MJGlobal.Instance.ClassFactory.CreateInstance<RunCodeGenBase>(RunCodeGenBase)!;
  return await runObject.Run(skipDatabaseGeneration);
}
