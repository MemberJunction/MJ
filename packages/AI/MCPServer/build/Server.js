import { Metadata } from "@memberjunction/core";
import { setupSQLServerClient, SQLServerProviderConfigData } from "@memberjunction/sqlserver-dataprovider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DataSource } from "typeorm";
import { z } from "zod";
import { configInfo, dbDatabase, dbHost, dbPassword, dbPort, dbUsername, dbInstanceName, dbTrustServerCertificate } from './config.js';
// Create server instance
const _server = new McpServer({
    name: "MemberJunction",
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {},
    },
});
const ormConfig = {
    type: 'mssql',
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
// Add an addition tool
_server.tool("add", {
    a: z.number(),
    b: z.number()
}, async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b) }]
}));
_server.tool("get-all-entities", {}, async () => {
    const md = new Metadata();
    return {
        content: [
            { type: "text", text: JSON.stringify(md.Entities) }
        ]
    };
});
export async function runServer() {
    try {
        // Start receiving messages on stdin and sending messages on stdout
        const transport = new StdioServerTransport();
        const dataSource = new DataSource(ormConfig);
        await dataSource.initialize();
        console.log(ormConfig.database);
        const config = new SQLServerProviderConfigData(dataSource, 'amith@bluecypress.io', '__mj');
        await setupSQLServerClient(config);
        await _server.connect(transport);
    }
    catch (e) {
        // Log the error but convert it to JSON and then dump to console
        console.log(JSON.stringify(e));
    }
}
runServer();
