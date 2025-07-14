import * as vscode from 'vscode';
import { SQLServerDataProvider, SQLServerProviderConfigData, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import { Metadata, EntityInfo, EntityFieldInfo, EntityPermissionInfo, UserInfo, LogError, SetProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import * as sql from 'mssql';
import { ConfigurationManager } from '../services/ConfigurationManager';
import { loadConfig, createMSSQLConfig } from '../config';

export class MetadataProvider {
    private sqlDataProvider: SQLServerDataProvider | undefined;
    private metadata: Metadata | undefined;
    private initialized = false;
    private pool: sql.ConnectionPool | undefined;

    constructor(
        private configManager: ConfigurationManager
    ) {}

    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            // Get workspace folder
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('No workspace folder open');
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;

            // Load config using the same approach as MJServer
            console.log('Loading configuration from workspace:', workspaceRoot);
            const config = loadConfig(workspaceRoot);
            console.log('Loaded configuration for database:', config.dbDatabase);

            // Create connection pool
            const mssqlConfig = createMSSQLConfig(config);
            console.log('Connecting to SQL Server at:', mssqlConfig.server);
            
            this.pool = new sql.ConnectionPool(mssqlConfig);
            await this.pool.connect();
            console.log('Connected to SQL Server');

            // Use the same setup pattern as CodeGenLib
            const providerConfig = new SQLServerProviderConfigData(
                this.pool,
                config.mjCoreSchema, // MJCoreSchemaName
                0 // CheckRefreshIntervalSeconds - disable auto refresh
            );
            
            // This will create the provider, configure it, and call SetProvider
            this.sqlDataProvider = await setupSQLServerClient(providerConfig);
            console.log('SQL Server client setup complete');

            // Initialize metadata - it will now use the globally set provider
            this.metadata = new Metadata();
            console.log('Created Metadata instance');

            // The metadata should already be loaded from the setupSQLServerClient call
            console.log('Metadata should be loaded from provider');

            this.initialized = true;
            console.log('MetadataProvider initialized successfully');
        } catch (error) {
            console.error('Failed to initialize MetadataProvider:', error);
            this.initialized = false;
            throw error;
        }
    }


    async getEntityMetadata(entityName: string): Promise<EntityInfo | undefined> {
        if (!this.metadata || !this.initialized) {
            await this.initialize();
        }

        const entity = this.metadata!.Entities.find(e => 
            e.Name === entityName || 
            e.ClassName === entityName ||
            e.BaseTable === entityName
        );

        return entity;
    }

    async refreshMetadata(): Promise<void> {
        if (this.metadata) {
            await this.metadata.Refresh();
        }
    }

    getMetadata(): Metadata | undefined {
        return this.metadata;
    }

    getPossibleValues(entity: EntityInfo, field: EntityFieldInfo): string[] | undefined {
        // Check for value list
        if (field.ValueListType === 'List' && field.EntityFieldValues && field.EntityFieldValues.length > 0) {
            return field.EntityFieldValues.map(v => v.Value);
        }

        // Check for SQL-based value constraints (would need to parse check constraints)
        // This is a simplified version - in production, you'd parse the actual constraints
        if (field.Type === 'nvarchar' && field.GeneratedValidationFunctionCheckConstraint) {
            // Parse simple IN constraints like "PromptRole IN ('System', 'User', 'Assistant')"
            const match = field.GeneratedValidationFunctionCheckConstraint.match(/IN\s*\((.*?)\)/i);
            if (match) {
                return match[1]
                    .split(',')
                    .map((v: string) => v.trim().replace(/'/g, ''));
            }
        }

        return undefined;
    }

    async getRelatedEntityMetadata(entityName: string, fieldName: string): Promise<EntityInfo | undefined> {
        const entity = await this.getEntityMetadata(entityName);
        if (!entity) {
            return undefined;
        }

        const field = entity.Fields.find(f => f.Name === fieldName);
        if (!field || !field.RelatedEntity) {
            return undefined;
        }

        return this.getEntityMetadata(field.RelatedEntity);
    }

    dispose(): void {
        if (this.pool) {
            this.pool.close();
            this.pool = undefined;
        }
        if (this.sqlDataProvider) {
            this.sqlDataProvider = undefined;
        }
        this.metadata = undefined;
        this.initialized = false;
    }
}