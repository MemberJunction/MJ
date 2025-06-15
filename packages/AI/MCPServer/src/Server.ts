import { BaseEntity, CompositeKey, EntityFieldInfo, EntityInfo, LogError, LogStatus, Metadata, RunView, UserInfo } from "@memberjunction/core";
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from "@memberjunction/sqlserver-dataprovider";
import { FastMCP, Resource, ResourceResult } from "fastmcp";
import * as sql from "mssql";
import { z } from "zod";
import { configInfo, dbDatabase, dbHost, dbPassword, dbPort, dbUsername, dbInstanceName, dbTrustServerCertificate, mcpServerSettings } from './config.js';
import { match } from "assert";


const mcpServerPort = mcpServerSettings?.port || 3100;

// Prepare mssql configuration
const poolConfig: sql.config = {
    server: dbHost,
    port: dbPort,
    user: dbUsername,
    password: dbPassword,
    database: dbDatabase,
    requestTimeout: configInfo.databaseSettings.requestTimeout,
    connectionTimeout: configInfo.databaseSettings.connectionTimeout,
    options: {
        encrypt: true,
        enableArithAbort: true,
        trustServerCertificate: dbTrustServerCertificate === 'Y'
    },
};

if (dbInstanceName !== null && dbInstanceName !== undefined && dbInstanceName.trim().length > 0) {
    poolConfig.options!.instanceName = dbInstanceName;
}

// Create FastMCP server instance
const server = new FastMCP({
    name: "MemberJunction",
    version: "1.0.0"
});

// Initialize database and setup tools
async function initializeServer() {
    try {
        if (!mcpServerSettings?.enableMCPServer) {
            console.log("MCP Server is disabled in the configuration.");
            throw new Error("MCP Server is disabled in the configuration.");
       }
        // Initialize database connection
        const pool = new sql.ConnectionPool(poolConfig);
        await pool.connect();
        
        // Setup SQL Server client
        const config = new SQLServerProviderConfigData(pool, configInfo.mjCoreSchema);
        await setupSQLServerClient(config);
        console.log("Database connection setup completed.");

        server.addTool({
            name: "Get_All_Entities",
            description: "Retrieves all Entities including entity fields and relationships, from the MemberJunction Metadata",
            parameters: z.object({}),
            async execute() {
                const md = new Metadata();
                const output = JSON.stringify(md.Entities, null, 2);
                return output;
            }        
        });

        const contextUser = UserCache.Instance.Users[0];
        await loadEntityTools(contextUser);
        await loadActionTools(contextUser);
        console.log("Tools loaded successfully.");
        
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

async function loadActionTools(contextUser: UserInfo) {
    // not yet supported but don't throw log error unless the config has action tools in it
    const actionTools = mcpServerSettings?.actionTools;
    if (actionTools && actionTools.length > 0) {
        console.warn("Action tools are not yet supported");
    }
}

async function loadEntityTools(contextUser: UserInfo) {
    // use the config metadata to load up the tools requested
    const entityTools = mcpServerSettings?.entityTools;

    if (entityTools && entityTools.length > 0) {
        const md = new Metadata();

        // iterate through the tools and add them to the server
        entityTools.forEach((tool) => {
            const matchingEntities = getMatchingEntitiesForTool(md.Entities, tool);
            matchingEntities.forEach((entity) => {
                if (tool.get) {
                    addEntityGetTool(entity, contextUser);
                }
                if (tool.create) {
                    addEntityCreateTool(entity, contextUser);
                }
                if (tool.update) {
                    addEntityUpdateTool(entity, contextUser);
                }
                if (tool.delete) {
                    addEntityDeleteTool(entity, contextUser);
                }
                if (tool.runView) {
                    addEntityRunViewTool(entity, contextUser);
                }
            });
        });
    }
}

function addEntityRunViewTool(entity: EntityInfo, contextUser: UserInfo) {
    const paramObject = z.object({
        extraFilter: z.string().optional(),
        orderBy: z.string().optional(),
        fields: z.array(z.string()).optional(),
    })
    const toolConfig = {
        name: `Run_${entity.ClassName}_View`,
        description: `Returns data from the ${entity.Name} entity, optionally filtered by extraFilter and ordered by orderBy`,
        parameters: paramObject,
        async execute (props: any) {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: entity.Name,
                ExtraFilter: props.extraFilter ? props.extraFilter : undefined,
                OrderBy: props.orderBy ? props.orderBy : undefined,
                Fields: props.fields ? props.fields : undefined,
            }, contextUser);
            return JSON.stringify(result);
        }
    };
    server.addTool(toolConfig);
}

function addEntityCreateTool(entity: EntityInfo, contextUser: UserInfo) {
    // add a tool for getting records from the specified entity or wildcard
    const paramObject = getEntityParamObject(entity, true, false, false);

    const toolConfig = {
        name: `Create_${entity.ClassName}_Record`,
        description: `Creates a new record in the ${entity.Name} entity`,
        parameters: z.object(paramObject),
        async execute (props: any) {
            const md = new Metadata();
            const record = await md.GetEntityObject(entity.Name, contextUser);
            record.SetMany(props, true);
            const success = await record.Save();
            if (!success) {
                return JSON.stringify({success, record: undefined, errorMessage: record.LatestResult.Message });
            }
            else {
                return JSON.stringify({success, record: await convertEntityObjectToJSON(record), errorMessage: undefined });
            }
        }
    };
    server.addTool(toolConfig);    
}

function addEntityUpdateTool(entity: EntityInfo, contextUser: UserInfo) {
    const paramObject = getEntityParamObject(entity, true, true, true);

    const toolConfig = {
        name: `Update_${entity.ClassName}_Record`,
        description: `Updates the specified record in the ${entity.Name} entity`,
        parameters: z.object(paramObject),
        async execute (props: any) {
            const md = new Metadata();
            const record = await md.GetEntityObject(entity.Name, contextUser);
            const loaded = await record.InnerLoad(new CompositeKey(
                // use the primary keys to load the record
                entity.PrimaryKeys.map((pk) => {
                    return {
                        FieldName: pk.Name,
                        Value: props[pk.Name]
                    };
                })
            ));
            if (loaded) {
                // remove the primary keys from the props so we don't try to update them
                const newProps = { ...props };
                entity.PrimaryKeys.forEach((pk) => {
                    delete newProps[pk.Name];
                });
                record.SetMany(newProps, true);
                const success = await record.Save();
                return JSON.stringify({success, record: await convertEntityObjectToJSON(record), errorMessage: !success ? record.LatestResult.Message : undefined });
            }
            else {
                return JSON.stringify({success: false, record: undefined, errorMessage: "Record not found"});
            }
        }
    };
    server.addTool(toolConfig);    
}

function addEntityDeleteTool(entity: EntityInfo, contextUser: UserInfo) {
    const pkeyParams = getEntityPrimaryKeyParamsObject(entity);
    const toolConfig = {
        name: `Delete_${entity.ClassName}_Record`,
        description: `Deletes the specified record from the ${entity.Name} entity`,
        parameters: z.object(pkeyParams),
        async execute (props: any) {
            const md = new Metadata();
            const record = await md.GetEntityObject(entity.Name, contextUser);
            const loaded = await record.InnerLoad(new CompositeKey(
                // use the primary keys to load the record
                entity.PrimaryKeys.map((pk) => {
                    return {
                        FieldName: pk.Name,
                        Value: props[pk.Name]
                    };
                })
            ));
            if (loaded) {
                const savedRecordJSON = await convertEntityObjectToJSON(record);
                const success = await record.Delete();
                return JSON.stringify({success, record: savedRecordJSON, errorMessage: !success ? record.LatestResult.Message : undefined });    
            }
            else {
                return JSON.stringify({success: false, record: undefined, errorMessage: "Record not found"});
            }
        }
    };
    server.addTool(toolConfig);
}


async function convertEntityObjectToJSON(record: BaseEntity) {
    const output = await record.GetDataObjectJSON({
        includeRelatedEntityData: false,
        oldValues: false,
        omitEmptyStrings: false,
        omitNullValues: false,
        excludeFields: [],
        relatedEntityList: [],
    });
    return output;
}

function getEntityParamObject(entity: EntityInfo, excludeReadOnlyFields: boolean, includePrimaryKeys: boolean, nonPKeysOptional: boolean) {
    const paramObject: { [key: string]: any } = {};
    // add the updateable fields as arguments

    entity.Fields.filter(f => {
        if (f.IsPrimaryKey && includePrimaryKeys) {
            return true;
        }
        else if (f.ReadOnly && excludeReadOnlyFields) {
            return false;
        }
        else {
            return true;
        } 

    }).forEach((f) => {
        addSingleParamToObject(paramObject, f, f.IsPrimaryKey ? false : nonPKeysOptional);
    })
    return paramObject;
}

function addSingleParamToObject(theObject: any, field: EntityFieldInfo, optional: boolean){
    let newParam: any;
    switch (field.TSType) {
        case 'Date':
            newParam = z.date();
            break;
        case 'boolean':
            newParam = z.boolean();
            break;
        case 'number':
            newParam = z.number();
            break;
        case 'string':
            // for strings, check to see if we have a list of entity field values and if so, create an enum otherwise just a regular string
            if (field.ValueListTypeEnum === 'None' || field.EntityFieldValues.length === 0) {
                newParam = z.string();
            }
            else {
                // we have either a list only, or list + user input scenario so set that up for zod
                const enumList = field.EntityFieldValues.map((v) => {
                    return v.Value;
                });
                if (field.ValueListTypeEnum === 'List') {
                    newParam = z.enum(enumList as [string, ...string[]]);
                }
                else {
                    newParam = z.union([z.enum(enumList as [string, ...string[]]), z.string()]);
                }    
            }
            break;
    }
    if (optional) {
        theObject[field.Name] = newParam.optional();
    }
    else {
        theObject[field.Name] = newParam;
    }
}

function getEntityPrimaryKeyParamsObject(entity: EntityInfo) {
    // add a tool for getting records from the specified entity or wildcard
    const paramObject: { [key: string]: any } = {};
    // add the primary keys as arguments
    entity.PrimaryKeys.forEach((pk) => {
        addSingleParamToObject(paramObject, pk, false); 
    })
    return paramObject;
}

function addEntityGetTool(entity: EntityInfo, contextUser: UserInfo) {
    const pkeyParams = getEntityPrimaryKeyParamsObject(entity);

    const toolConfig = {
        name: `Get_${entity.ClassName}_Record`,
        description: `Retrieves the specified record from the ${entity.Name} entity`,
        parameters: z.object(pkeyParams),
        async execute (props: any) {
            const md = new Metadata();
            const record = await md.GetEntityObject(entity.Name, contextUser);
            await record.InnerLoad(new CompositeKey(
                // use the primary keys to load the record
                entity.PrimaryKeys.map((pk) => {
                    return {
                        FieldName: pk.Name,
                        Value: props[pk.Name]
                    };
                })
            ));
            return await convertEntityObjectToJSON(record);
        }
    };
    server.addTool(toolConfig);
}
function getMatchingEntitiesForTool(allEntities: EntityInfo[], tool: {
    get: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
    runView: boolean;
    entityName?: string | undefined;
    schemaName?: string | undefined;
}) {
    const matchingEntities = allEntities.filter((entity) => {
        const entityName = entity.Name;
        const schemaName = entity.SchemaName;
        const toolEntityName = tool.entityName?.trim().toLowerCase() || "*";
        const toolSchemaName = tool.schemaName?.trim().toLowerCase() || "*";

        // we support wildcards such as * which is all entities/schemas, *Partial which would be Partial is the ending of the string, or Partial* where Partial is the start of the string
        // so we need to check for the conditions as follows: exact match, wildcard at the start, wildcard at the end, and wildcard only means always match and assign to two variables, schemaMatch
        // first to scope the schema and then entityMatch if the schemaMatch is true
        let schemaMatch = false;
        let entityMatch = false;
        if (toolSchemaName === "*") {
            schemaMatch = true;
        }
        else if (toolSchemaName.startsWith("*") && toolSchemaName.endsWith("*")) {
            schemaMatch = schemaName.toLowerCase().includes(toolSchemaName.slice(1, -1));
        }
        else if (toolSchemaName.endsWith("*")) {
            schemaMatch = schemaName.toLowerCase().startsWith(toolSchemaName.slice(0, -1));
        }
        else if (toolSchemaName.startsWith("*")) {
            schemaMatch = schemaName.toLowerCase().endsWith(toolSchemaName.slice(1));
        }
        else {
            schemaMatch = schemaName.toLowerCase() === toolSchemaName;
        }

        if (schemaMatch) {
            // if the schema matches, we can check the entity name, otherwise we don't bother since we don't care about the entity name
            if (toolEntityName === "*") {
                entityMatch = true;
            }
            else if (toolEntityName.startsWith("*") && toolEntityName.endsWith("*")) {
                entityMatch = entityName.toLowerCase().includes(toolEntityName.slice(1, -1));
            }
            else if (toolEntityName.endsWith("*")) {
                entityMatch = entityName.toLowerCase().startsWith(toolEntityName.slice(0, -1));
            }
            else if (toolEntityName.startsWith("*")) {
                entityMatch = entityName.toLowerCase().endsWith(toolEntityName.slice(1));
            }
            else {
                entityMatch = entityName.toLowerCase() === toolEntityName;
            }
        }
        return schemaMatch && entityMatch;
    });
    return matchingEntities;
}

// Run the server
initializeServer();