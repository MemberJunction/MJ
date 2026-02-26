/**
 * Main orchestrator for the MemberJunction code generation process.
 * Coordinates all aspects of code generation including database schema analysis,
 * metadata management, SQL generation, TypeScript entities, Angular components,
 * GraphQL resolvers, and more.
 * 
 * Supports both SQL Server and PostgreSQL database platforms via the dbType configuration.
 */

import { GraphQLServerGeneratorBase } from './Misc/graphql_server_codegen';
import { SQLCodeGenBase } from './Database/sql_codegen';
import { EntitySubClassGeneratorBase } from './Misc/entity_subclasses_codegen';
import { SQLServerDataProvider, UserCache, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import { MSSQLConnection, sqlConfig } from './Config/db-connection';
import { ManageMetadataBase } from './Database/manage-metadata';
import { outputDir, commands, mj_core_schema, configInfo, getSettingValue, dbType } from './Config/config';
import { logError, logStatus, logWarning, startSpinner, updateSpinner, succeedSpinner, failSpinner, warnSpinner } from './Misc/status_logging';
import * as MJ from '@memberjunction/core';
import { RunCommandsBase } from './Misc/runCommand';
import { DBSchemaGeneratorBase } from './Database/dbSchema';
import { AngularClientGeneratorBase } from './Angular/angular-codegen';
import { SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { CreateNewUserBase } from './Misc/createNewUser';
import { MJGlobal } from '@memberjunction/global';
import { ActionSubClassGeneratorBase } from './Misc/action_subclasses_codegen';
import { SQLLogging } from './Misc/sql_logging';
import { SQLServerCodeGenConnection } from './Database/providers/sqlserver/SQLServerCodeGenConnection';
import { PostgreSQLCodeGenConnection } from './Database/providers/postgresql/PostgreSQLCodeGenConnection';
import { CodeGenConnection } from './Database/codeGenDatabaseProvider';
import { PostgreSQLDataProvider, PostgreSQLProviderConfigData } from '@memberjunction/postgresql-dataprovider';
import pg from 'pg';
import { SystemIntegrityBase } from './Misc/system_integrity';
import { ActionEngineBase } from '@memberjunction/actions-base';
import { AIEngine } from '@memberjunction/aiengine';
import { IMetadataProvider, SetProvider, UserInfo } from '@memberjunction/core';

// Import pre-built MJ class registrations manifest (covers all @memberjunction/* packages)
import '@memberjunction/server-bootstrap-lite/mj-class-registrations';

/** Extract core schema name from configuration */
const { mjCoreSchema } = configInfo;

/**
 * Result from setupDataSource() providing both the data provider
 * and a CodeGenConnection for database operations.
 */
interface DataSourceResult {
  /** The configured data provider (SQL Server or PostgreSQL) */
  provider: IMetadataProvider;
  /** Database-agnostic connection for CodeGen operations */
  connection: CodeGenConnection;
  /** The current user loaded from the user cache */
  currentUser: UserInfo;
  /** Connection info string for display */
  connectionInfo: string;
}

/**
 * Main orchestrator class for the MemberJunction code generation process.
 */
export class RunCodeGenBase {
  /**
   * Sets up the data source based on the configured database type (SQL Server or PostgreSQL).
   * Initializes the appropriate data provider, connection, and user cache.
   */
  public async setupDataSource(): Promise<DataSourceResult> {
    startSpinner('Initializing database connection...');
    const platform = dbType();

    if (platform === 'postgresql') {
      return this.setupPostgreSQLDataSource();
    }
    return this.setupSQLServerDataSource();
  }

  /**
   * Sets up SQL Server data source (original behavior).
   */
  protected async setupSQLServerDataSource(): Promise<DataSourceResult> {
    const pool = await MSSQLConnection();
    const config = new SQLServerProviderConfigData(pool, mj_core_schema());
    const provider: SQLServerDataProvider = await setupSQLServerClient(config);
    const conn: CodeGenConnection = new SQLServerCodeGenConnection(pool);

    let connectionInfo = sqlConfig.server;
    if (sqlConfig.port) connectionInfo += ':' + sqlConfig.port;
    if (sqlConfig.options?.instanceName) connectionInfo += '\\' + sqlConfig.options.instanceName;
    connectionInfo += '/' + sqlConfig.database;

    await UserCache.Instance.Refresh(pool);
    const userMatch = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner');
    const currentUser = userMatch ? userMatch : UserCache.Users[0];

    succeedSpinner('SQL Server connection initialized: ' + connectionInfo);
    return { provider, connection: conn, currentUser, connectionInfo };
  }

  /**
   * Sets up PostgreSQL data source.
   */
  protected async setupPostgreSQLDataSource(): Promise<DataSourceResult> {
    const pgHost = process.env.PG_HOST ?? configInfo.dbHost;
    const pgPort = parseInt(process.env.PG_PORT ?? String(configInfo.dbPort), 10) || 5432;
    const pgDatabase = process.env.PG_DATABASE ?? configInfo.dbDatabase;
    const pgUser = process.env.PG_USERNAME ?? configInfo.codeGenLogin;
    const pgPassword = process.env.PG_PASSWORD ?? configInfo.codeGenPassword;
    const coreSchema = mj_core_schema();

    const pool = new pg.Pool({
      host: pgHost,
      port: pgPort,
      database: pgDatabase,
      user: pgUser,
      password: pgPassword,
      max: 20,
    });

    // Test connection
    const client = await pool.connect();
    client.release();
    
    // Configure the PostgreSQL data provider
    const pgConfig = new PostgreSQLProviderConfigData(
      { Host: pgHost, Port: pgPort, Database: pgDatabase, User: pgUser, Password: pgPassword },
      coreSchema,
      1  // checkRefreshIntervalSeconds: must be > 0 to trigger initial metadata load
    );
    const provider = new PostgreSQLDataProvider();
    await provider.Config(pgConfig);
    SetProvider(provider);

    const conn = new PostgreSQLCodeGenConnection(pool);

    // Load users (PostgreSQL version - query views directly)
    const usersResult = await conn.query('SELECT * FROM "' + coreSchema + '"."vwUsers"');
    const rolesResult = await conn.query('SELECT * FROM "' + coreSchema + '"."vwUserRoles"');

    const userInfos: UserInfo[] = usersResult.recordset.map((user: Record<string, unknown>) => {
      (user as Record<string, unknown>).UserRoles = rolesResult.recordset.filter(
        (role: Record<string, unknown>) => role.UserID === user.ID
      );
      return new UserInfo(provider, user);
    });

    const userMatch = userInfos.find((u) => u?.Type?.trim().toLowerCase() === 'owner');
    const currentUser = userMatch ?? userInfos[0];
    if (!currentUser) {
      throw new Error('No users found in PostgreSQL. Ensure vwUsers has at least one user.');
    }

    const connectionInfo = pgHost + ':' + pgPort + '/' + pgDatabase;
    succeedSpinner('PostgreSQL connection initialized: ' + connectionInfo);
    return { provider, connection: conn, currentUser, connectionInfo };
  }

  /**
   * Main entry point for the complete code generation process.
   */
  public async Run(skipDatabaseGeneration: boolean = false) {
    try {
      const startTime = new Date();
      const platform = dbType();
      startSpinner('Starting MemberJunction CodeGen (' + platform + ') @ ' + startTime.toLocaleString());

      const { provider, connection: conn, currentUser } = await this.setupDataSource();

      const md = new MJ.Metadata();
      if (md.Entities.length === 0) {
        failSpinner('No entities found in metadata');
        process.exit(1);
      }
      succeedSpinner('Loaded ' + md.Entities.length + ' entities from metadata');

      if (configInfo.advancedGeneration?.enableAdvancedGeneration) {
        startSpinner('Initializing AI Engine for advanced generation...');
        await AIEngine.Instance.Config(false, currentUser);
        succeedSpinner('AI Engine initialized');
      }

      const runCommandsObject = MJGlobal.Instance.ClassFactory.CreateInstance<RunCommandsBase>(RunCommandsBase)!;
      const sqlCodeGenObject = MJGlobal.Instance.ClassFactory.CreateInstance<SQLCodeGenBase>(SQLCodeGenBase)!;

      const skipDB = skipDatabaseGeneration || getSettingValue('skip_database_generation', false);
      if (!skipDB) {
        startSpinner('Handling SQL Script Execution, Metadata Maintenance, and SQL Object Generation...');
        SQLLogging.initSQLLogging();

        const beforeCommands = commands('BEFORE');
        if (beforeCommands && beforeCommands.length > 0) {
          updateSpinner('Executing BEFORE commands...');
          const results = await runCommandsObject.runCommands(beforeCommands);
          if (results.some((r) => !r.success)) logError('ERROR running one or more BEFORE commands');
        }

        updateSpinner('Executing before-all SQL Scripts...');
        if (!(await sqlCodeGenObject.runCustomSQLScripts(conn, 'before-all'))) logError('ERROR running before-all SQL Scripts');

        const newUserSetup = configInfo.newUserSetup;
        if (newUserSetup) {
          updateSpinner('Setting up new user...');
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

        const manageMD = MJGlobal.Instance.ClassFactory.CreateInstance<ManageMetadataBase>(ManageMetadataBase)!;
        updateSpinner('Managing Metadata...');
        const metadataSuccess = await manageMD.manageMetadata(conn, currentUser);
        if (!metadataSuccess) {
          failSpinner('ERROR managing metadata');
        } else {
          await provider.Refresh();
          succeedSpinner('Metadata management completed');
        }

        const sqlOutputDir = outputDir('SQL', true);
        if (sqlOutputDir) {
          startSpinner('Managing SQL Scripts and Execution...');
          const sqlSuccess = await sqlCodeGenObject.manageSQLScriptsAndExecution(conn, md.Entities, sqlOutputDir, currentUser);
          if (!sqlSuccess) {
            failSpinner('Error managing SQL scripts and execution');
          } else {
            succeedSpinner('SQL scripts and execution completed');
          }
        } else {
          warnSpinner('SQL output directory NOT found in config file, skipping...');
        }
      } else {
        warnSpinner('Skipping database generation (skip_database_generation = true)');

        const manageMD = MJGlobal.Instance.ClassFactory.CreateInstance<ManageMetadataBase>(ManageMetadataBase)!;
        startSpinner('Checking/Loading AI Generated Code from Metadata...');
        const metadataSuccess = await manageMD.loadGeneratedCode(conn, currentUser);
        if (!metadataSuccess) {
          failSpinner('ERROR checking/loading AI Generated Code from Metadata');
          return;
        } else {
          succeedSpinner('AI Generated Code loaded from Metadata');
        }
      }

      const apiEntities = md.Entities.filter((e) => e.IncludeInAPI);
      const excludedSchemaNames = configInfo.excludeSchemas.map(s => s.toLowerCase());
      const includedEntities = apiEntities.filter(
        (e) => !excludedSchemaNames.includes(e.SchemaName.trim().toLowerCase())
      );

      const excludedCount = apiEntities.length - includedEntities.length;
      if (excludedCount > 0) {
        const excludedBySchema = apiEntities
          .filter((e) => excludedSchemaNames.includes(e.SchemaName.trim().toLowerCase()))
          .reduce((acc, e) => {
            const schema = e.SchemaName.trim();
            acc[schema] = (acc[schema] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
        const schemaDetails = Object.entries(excludedBySchema)
          .map(([schema, count]) => schema + ': ' + count)
          .join(', ');
        logStatus('Excluded ' + excludedCount + ' entities from code generation by schema: ' + schemaDetails);
      }

      const coreEntities = includedEntities.filter(
        (e) => e.SchemaName.trim().toLowerCase() === mjCoreSchema.trim().toLowerCase()
      );
      const nonCoreEntities = includedEntities.filter(
        (e) => e.SchemaName.trim().toLowerCase() !== mjCoreSchema.trim().toLowerCase()
      );

      const isVerbose = configInfo?.verboseOutput ?? false;
      if (!isVerbose) startSpinner('Generating TypeScript code...');

      const graphQLCoreResolversOutputDir = outputDir('GraphQLCoreEntityResolvers', false);
      if (graphQLCoreResolversOutputDir) {
        if (isVerbose) startSpinner('Generating CORE Entity GraphQL Resolver Code...');
        const graphQLGenerator = MJGlobal.Instance.ClassFactory.CreateInstance<GraphQLServerGeneratorBase>(GraphQLServerGeneratorBase)!;
        if (!graphQLGenerator.generateGraphQLServerCode(coreEntities, graphQLCoreResolversOutputDir, '@memberjunction/core-entities', true)) {
          failSpinner('Error generating GraphQL server code');
          return;
        } else if (isVerbose) succeedSpinner('CORE Entity GraphQL Resolver Code generated');
      }

      const graphqlOutputDir = outputDir('GraphQLServer', true);
      if (graphqlOutputDir) {
        if (isVerbose) startSpinner('Generating GraphQL Resolver Code...');
        const graphQLGenerator = MJGlobal.Instance.ClassFactory.CreateInstance<GraphQLServerGeneratorBase>(GraphQLServerGeneratorBase)!;
        const entityPackageName = configInfo.entityPackageName || 'mj_generatedentities';
        if (!graphQLGenerator.generateGraphQLServerCode(nonCoreEntities, graphqlOutputDir, entityPackageName, false)) {
          failSpinner('Error generating GraphQL Resolver code');
          return;
        } else if (isVerbose) succeedSpinner('GraphQL Resolver Code generated');
      } else if (isVerbose) warnSpinner('GraphQL server output directory NOT found in config file, skipping...');

      const coreEntitySubClassOutputDir = outputDir('CoreEntitySubClasses', false)!;
      if (coreEntitySubClassOutputDir && coreEntitySubClassOutputDir.length > 0) {
        if (isVerbose) startSpinner('Generating CORE Entity Subclass Code...');
        const entitySubClassGeneratorObject = MJGlobal.Instance.ClassFactory.CreateInstance<EntitySubClassGeneratorBase>(EntitySubClassGeneratorBase)!;
        if (!await entitySubClassGeneratorObject.generateAllEntitySubClasses(conn, coreEntities, coreEntitySubClassOutputDir, skipDB)) {
          failSpinner('Error generating entity subclass code');
          return;
        } else if (isVerbose) succeedSpinner('CORE Entity Subclass Code generated');
      }

      const entitySubClassOutputDir = outputDir('EntitySubClasses', true)!;
      if (entitySubClassOutputDir) {
        if (isVerbose) startSpinner('Generating Entity Subclass Code...');
        const entitySubClassGeneratorObject = MJGlobal.Instance.ClassFactory.CreateInstance<EntitySubClassGeneratorBase>(EntitySubClassGeneratorBase)!;
        if (!await entitySubClassGeneratorObject.generateAllEntitySubClasses(conn, nonCoreEntities, entitySubClassOutputDir, skipDB)) {
          failSpinner('Error generating entity subclass code');
          return;
        } else if (isVerbose) succeedSpinner('Entity Subclass Code generated');
      } else if (isVerbose) warnSpinner('Entity subclass output directory NOT found in config file, skipping...');

      const angularCoreEntitiesOutputDir = outputDir('AngularCoreEntities', false);
      if (angularCoreEntitiesOutputDir) {
        if (isVerbose) startSpinner('Generating Angular CORE Entities Code...');
        const angularGenerator = MJGlobal.Instance.ClassFactory.CreateInstance<AngularClientGeneratorBase>(AngularClientGeneratorBase)!;
        if (!(await angularGenerator.generateAngularCode(coreEntities, angularCoreEntitiesOutputDir, 'Core', currentUser))) {
          failSpinner('Error generating Angular CORE Entities code');
          return;
        } else if (isVerbose) succeedSpinner('Angular CORE Entities Code generated');
      }

      const angularOutputDir = outputDir('Angular', false);
      if (angularOutputDir) {
        if (isVerbose) startSpinner('Generating Angular Code...');
        const angularGenerator = MJGlobal.Instance.ClassFactory.CreateInstance<AngularClientGeneratorBase>(AngularClientGeneratorBase)!;
        if (!(await angularGenerator.generateAngularCode(nonCoreEntities, angularOutputDir, '', currentUser))) {
          failSpinner('Error generating Angular code');
          return;
        } else if (isVerbose) succeedSpinner('Angular Code generated');
      } else if (isVerbose) warnSpinner('Angular output directory NOT found in config file, skipping...');

      const dbSchemaOutputDir = outputDir('DBSchemaJSON', false);
      if (dbSchemaOutputDir) {
        if (isVerbose) startSpinner('Generating Database Schema JSON Output...');
        const schemaGeneratorObject = MJGlobal.Instance.ClassFactory.CreateInstance<DBSchemaGeneratorBase>(DBSchemaGeneratorBase)!;
        if (!schemaGeneratorObject.generateDBSchemaJSONOutput(md.Entities, dbSchemaOutputDir)) {
          failSpinner('Error generating Database Schema JSON Output, non-fatal, continuing...');
        } else if (isVerbose) succeedSpinner('Database Schema JSON Output generated');
      } else if (isVerbose) warnSpinner('DB Schema output directory NOT found in config file, skipping...');

      const coreActionsOutputDir = outputDir('CoreActionSubclasses', false);
      await ActionEngineBase.Instance.Config(false, currentUser);
      if (coreActionsOutputDir) {
        if (isVerbose) startSpinner('Generating CORE Actions Code...');
        const actionsGenerator = MJGlobal.Instance.ClassFactory.CreateInstance<ActionSubClassGeneratorBase>(ActionSubClassGeneratorBase)!;
        if (!(await actionsGenerator.generateActions(ActionEngineBase.Instance.CoreActions, coreActionsOutputDir))) {
          failSpinner('Error generating CORE Actions code');
          return;
        } else if (isVerbose) succeedSpinner('CORE Actions Code generated');
      }

      const actionsOutputDir = outputDir('ActionSubclasses', false);
      if (actionsOutputDir) {
        if (isVerbose) startSpinner('Generating Actions Code...');
        const actionsGenerator = MJGlobal.Instance.ClassFactory.CreateInstance<ActionSubClassGeneratorBase>(ActionSubClassGeneratorBase)!;
        if (!(await actionsGenerator.generateActions(ActionEngineBase.Instance.NonCoreActions, actionsOutputDir))) {
          failSpinner('Error generating Actions code');
          return;
        } else if (isVerbose) succeedSpinner('Actions Code generated');
      } else if (isVerbose) warnSpinner('Actions output directory NOT found in config file, skipping...');

      SQLLogging.finishSQLLogging();
      if (!isVerbose) succeedSpinner('TypeScript code generation completed');

      startSpinner('Running system integrity checks...');
      await SystemIntegrityBase.RunIntegrityChecks(conn, true);
      succeedSpinner('System integrity checks completed');

      const afterCommands = commands('AFTER');
      if (afterCommands && afterCommands.length > 0) {
        startSpinner('Executing AFTER commands...');
        const results = await runCommandsObject.runCommands(afterCommands);
        if (results.some((r) => !r.success)) failSpinner('ERROR running one or more AFTER commands');
        else succeedSpinner('AFTER commands completed');
      }

      if (!skipDB) {
        startSpinner('Executing after-all SQL Scripts...');
        if (!(await sqlCodeGenObject.runCustomSQLScripts(conn, 'after-all'))) failSpinner('ERROR running after-all SQL Scripts');
        else succeedSpinner('After-all SQL Scripts completed');
      }

      const endTime = new Date();
      const totalSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
      succeedSpinner('MJ CodeGen Complete! ' + md.Entities.length + ' entities processed in ' + totalSeconds + 's @ ' + endTime.toLocaleString());
      process.exit(0);
    } catch (e) {
      failSpinner('CodeGen failed: ' + e);
      logError(e as string);
      process.exit(1);
    }
  }
}

/**
 * Convenience function to run the MemberJunction code generation process.
 */
export async function runMemberJunctionCodeGeneration(skipDatabaseGeneration: boolean = false) {
  const runObject = MJGlobal.Instance.ClassFactory.CreateInstance<RunCodeGenBase>(RunCodeGenBase)!;
  return await runObject.Run(skipDatabaseGeneration);
}
