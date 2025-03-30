import { LogError, LogStatus, Metadata } from "@memberjunction/core";
import { setupSQLServerClient, SQLServerProviderConfigData } from "@memberjunction/sqlserver-dataprovider";
import { FastMCP } from "fastmcp";
import { DataSource } from "typeorm";
import { z } from "zod";
import { DataSourceOptions } from 'typeorm';
import { configInfo, dbDatabase, dbHost, dbPassword, dbPort, dbUsername, dbInstanceName, dbTrustServerCertificate, mcpServerPort } from './config.js';

// Prepare ORM configuration
const ormConfig = {
    type: 'mssql' as const,
    entities: [],
    logging: false,
    host: dbHost,
    port: dbPort,
    username: dbUsername,
    password: dbPassword,
    database: dbDatabase,
    synchronize: false,
    requestTimeout: configInfo.databaseSettings.requestTimeout,
    connectionTimeout: configInfo.databaseSettings.connectionTimeout,
    options: {},
};

if (dbInstanceName !== null && dbInstanceName !== undefined && dbInstanceName.trim().length > 0) {
    ormConfig.options = {
        ...ormConfig.options,
        instanceName: dbInstanceName,
    };
}

if (dbTrustServerCertificate !== null && dbTrustServerCertificate !== undefined) {
    ormConfig.options = {
        ...ormConfig.options,
        trustServerCertificate: dbTrustServerCertificate === 'Y',
    };
}

// Create FastMCP server instance
const server = new FastMCP({
    name: "MemberJunction",
    version: "1.0.0"
});

// Initialize database and setup tools
async function initializeServer() {
    try {
        // Initialize database connection
        const dataSource = new DataSource(ormConfig);
        await dataSource.initialize();
        console.log(`Connected to database: ${ormConfig.database}`);
        
        // Setup SQL Server client
        const config = new SQLServerProviderConfigData(dataSource, '', '__mj');
        await setupSQLServerClient(config);
        
        // Define tools
        server.addTool({
            name: "add",
            description: "Add two numbers together",
            parameters: z.object({
                a: z.number(),
                b: z.number()
            }),
            execute: async ({ a, b }) => {
                return String(a + b);
            }
        });

        server.addTool({
            name: "get-all-entities",
            description: "Get all entities from the metadata",
            parameters: z.object({}),
            execute: async () => {
                const md = new Metadata();
                const output = JSON.stringify(md.Entities, null, 2);
                return output;
            }
        });

        // Configure server options
        const serverOptions = {
            transportType: "sse" as const,
            sse: {
                endpoint: "/mcp" as `/${string}`,
                port: mcpServerPort
            },
            // Optional: Add auth configuration if needed
            // auth: {
            //   type: "basic",
            //   username: "user",
            //   password: "pass"
            // }
        };

        // Start server with SSE transport
        server.start(serverOptions);

        console.log(`MemberJunction MCP Server running on port ${mcpServerPort}`);
        console.log(`Server endpoint available at: http://localhost:${mcpServerPort}/mcp`);
    } catch (error) {
        console.error("Failed to initialize MCP server:", error);
    }
}

// Run the server
initializeServer();