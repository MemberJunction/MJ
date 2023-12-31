import { generateReactCode } from './react_client_codegen';
import { generateGraphQLServerCode } from './graphql_server_codegen';
import { generateGraphQLClientCode } from './graphql_client_codegen';
import { manageSQLScriptsAndExecution, runCustomSQLScripts } from './sql_codegen';
import { generateAllEntitySubClasses } from './entity_subclasses_codegen';
import { setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider'
import AppDataSource from "./db"
import { manageMetadata } from './manageMetadata';
import { outputDir, commands, mj_core_schema, mjCoreSchema, configInfo, getSettingValue } from './config';
import { logError, logStatus } from './logging';
import * as MJ from '@memberjunction/core'
import { runCommands } from './runCommand';
import { generateDBSchemaJSONOutput } from './dbSchema';
import { generateAngularCode } from './angular_client_codegen';
import { SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { createNewUser } from './createNewUser';
import path from 'path';

export async function runMemberJunctionCodeGeneration() {
    try {
        const startTime = new Date();
        logStatus("\n\nSTARTING MJ CodeGen Run... @ " + startTime.toLocaleString())

        /****************************************************************************************
        // First, setup the data source and make sure the metadata and related stuff for MJCore is initialized
        ****************************************************************************************/
        logStatus("Initializing Data Source...")
        await AppDataSource.initialize()
        .then(() => {
            logStatus("Data Source has been initialized!")
        })
        .catch((err) => {
            logError("Error during Data Source initialization", err)
        })
        const config = new SQLServerProviderConfigData(AppDataSource,'', mj_core_schema(), 0 )
        await setupSQLServerClient(config);
        

        // get the entity metadata
        const md = new MJ.Metadata();
        if (md.Entities.length === 0) {
            logError('No entities found in metadata, exiting...'); // TODO: add a way to generate the metadata if it doesn't exist
            process.exit(1);
        }

        // check to see if the user wants to skip database generation via the config settings
        const skipDatabaseGeneration = getSettingValue('skip_database_generation', false);
        if (!skipDatabaseGeneration) {
            logStatus("Handling SQL Script Execution, Metadata Maintenance, and SQL Object Generation... (to skip this, set skip_database_generation to true in the config file under settings)")
            /****************************************************************************************
            // STEP 0 --- Precursor Step execute any commands specified in the config file
            ****************************************************************************************/
            const beforeCommands = commands('BEFORE')
            if (beforeCommands && beforeCommands.length > 0) {
                logStatus('Executing BEFORE commands...')
                const results = await runCommands(beforeCommands)
                if (results.some(r => !r.success))
                    logError('ERROR running one or more BEFORE commands');
            }
            /****************************************************************************************
            // STEP 0.1 --- Execute any before SQL Scripts specified in the config file
            ****************************************************************************************/
            if (! await runCustomSQLScripts(AppDataSource, 'before-all'))
                logError('ERROR running before-all SQL Scripts');

            /****************************************************************************************
            // STEP 0.2 --- Create a new user if there is newUserSetup info in the config file
            ****************************************************************************************/
            const newUserSetup = configInfo.newUserSetup;
            if (newUserSetup) {
                if (!await createNewUser(newUserSetup))
                    logError('ERROR creating new user');
            }


            /****************************************************************************************
            // STEP 1 - Manage Metadata - including generating new metadata as required
            ****************************************************************************************/
            logStatus('Managing Metadata...')
            if (! await manageMetadata(AppDataSource))
                logError('ERROR managing metadata');

            /****************************************************************************************
            // STEP 2 - SQL Script Generation
            ****************************************************************************************/
            const sqlOutputDir = outputDir('SQL', true);
            if (sqlOutputDir) {
                logStatus('Managing SQL Scripts and Execution...')
                if (! await manageSQLScriptsAndExecution(AppDataSource, md.Entities, sqlOutputDir))
                    logError('Error managing SQL scripts and execution');
            }
            else
                logStatus('SQL output directory NOT found in config file, skipping...');
        }
        else {
            logStatus("Skipping all database related CodeGen work because skip_database_generation was set to true in the config file under settings")
        }


        /****************************************************************************************
        // STEP 3 - GraphQL Server Code Gen
        ****************************************************************************************/
        const graphqlOutputDir = outputDir('GraphQLServer', true);
        if (graphqlOutputDir) {
            // generate the GraphQL server code
            logStatus('Generating GraphQL Server Code...')
            if (! generateGraphQLServerCode(md.Entities, graphqlOutputDir))
                logError('Error generating GraphQL server code');
        }
        else
            logStatus('GraphQL server output directory NOT found in config file, skipping...');

        /****************************************************************************************
        // STEP 4 - Core Entity Subclass Code Gen
        ****************************************************************************************/
        const coreEntitySubClassOutputDir = outputDir('CoreEntitySubClasses', false);
        if (coreEntitySubClassOutputDir && coreEntitySubClassOutputDir.length > 0) {
            // generate the entity subclass code
            logStatus('Generating CORE Entity Subclass Code...')
            const coreEntities = md.Entities.filter(e => e.SchemaName.trim().toLowerCase() === mjCoreSchema.trim().toLowerCase());
            if (! generateAllEntitySubClasses(coreEntities, coreEntitySubClassOutputDir))
                logError('Error generating entity subclass code');
        }
        else
            logStatus('CORE Entity subclass output directory NOT found in config file, skipping...');

        /****************************************************************************************
        // STEP 4.1 - Entity Subclass Code Gen
        ****************************************************************************************/
        const entitySubClassOutputDir = outputDir('EntitySubClasses', true);
        if (entitySubClassOutputDir) {
            // generate the entity subclass code
            logStatus('Generating Entity Subclass Code...')
            const nonCoreEntities = md.Entities.filter(e => e.SchemaName.trim().toLowerCase() !== mjCoreSchema.trim().toLowerCase());
            if (! generateAllEntitySubClasses(nonCoreEntities, entitySubClassOutputDir))
                logError('Error generating entity subclass code');
        }
        else
            logStatus('Entity subclass output directory NOT found in config file, skipping...');


        /****************************************************************************************
        // STEP 5 - GraphQL Client Code Gen
        ****************************************************************************************/
        const graphqlClientOutputDir = outputDir('GraphQLClient', false);
        if (graphqlClientOutputDir) {
            // generate the GraphQL client code
            logStatus('Generating GraphQL Client Code...')
            if (! generateGraphQLClientCode(md.Entities, graphqlClientOutputDir))
                logError('Error generating GraphQL client code');
        }
        else
            logStatus('GraphQL client output directory NOT found in config file, skipping...');

        /****************************************************************************************
        // STEP 6 - React Code Gen
        ****************************************************************************************/
        const reactOutputDir = outputDir('React', false);
        if (reactOutputDir) {
            // generate the React
            logStatus('Generating React Code...')
            if (! generateReactCode(md.Entities, reactOutputDir))
                logError('Error generating React code');
        }
        else
            logStatus('React output directory NOT found in config file, skipping...');

        /****************************************************************************************
        // STEP 7 - Angular Code Gen
        ****************************************************************************************/
        const angularOutputDir = outputDir('Angular', false);
        if (angularOutputDir) {
            // generate the Angular client code
            logStatus('Generating Angular Code...')
            if (! generateAngularCode(md.Entities, angularOutputDir))
                logError('Error generating Angular code');
        }
        else
            logStatus('Angular output directory NOT found in config file, skipping...');


        /****************************************************************************************
        // STEP 8 - Database Schema Output in JSON - for documentation and can be used by AI/etc.
        ****************************************************************************************/
        const dbSchemaOutputDir = outputDir('DBSchemaJSON', false);
        if (dbSchemaOutputDir) {
            // generate the GraphQL client code
            logStatus('Generating Database Schema JSON Output...')
            if (! generateDBSchemaJSONOutput(md.Entities, dbSchemaOutputDir))
                logError('Error generating Database Schema JSON Output');
        }
        else
            logStatus('DB Schema output directory NOT found in config file, skipping...');


        /****************************************************************************************
        // STEP X --- Finalization Step - execute any AFTER commands specified in the config file
        ****************************************************************************************/
        const afterCommands = commands('AFTER')
        if (afterCommands && afterCommands.length > 0) {
            logStatus('Executing AFTER commands...')
            const results = await runCommands(afterCommands)
            if (results.some(r => !r.success))
                logError('ERROR running one or more AFTER commands');
        }
        /****************************************************************************************
        // STEP X.1 --- Execute any AFTER SQL Scripts specified in the config file
        ****************************************************************************************/
        if (! await runCustomSQLScripts(AppDataSource, 'after-all'))
            logError('ERROR running after-all SQL Scripts');


        logStatus(md.Entities.length + ' entities processed and outputed to configured directories');
        logStatus("MJ CodeGen Run Complete! @ " + new Date().toLocaleString() + " (" + (new Date().getTime() - startTime.getTime()) / 1000 + " seconds)");

        process.exit(0); // wrap it up, 0 means success 
    }
    catch (e) {
        logError(e);
        process.exit(1); // error code
    }  
}