import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { logStatus } from '../Misc/status_logging';
import fs from 'fs';
import path from 'path';
import { configInfo } from '../Config/config';
import { RegisterClass } from '@memberjunction/global';


/**
 * Base class for generating a database schema JSON output, you can sub-class this class to create your own schema generator logic
 */
export class DBSchemaGeneratorBase { 
    public generateDBSchemaJSONOutput(entities: EntityInfo[], outputDir: string): boolean {
        if (!fs.existsSync(outputDir))
            fs.mkdirSync(outputDir, { recursive: true }); // create the directory if it doesn't exist
    
        const excludeSchemas: string[] = configInfo.dbSchemaJSONOutput.excludeSchemas;
        const excludeEntities: string[] = configInfo.dbSchemaJSONOutput.excludeEntities;
        
        // first, get a list of all of the distinct schemas within the entities array
        const schemas: string[] = [];
        entities.forEach(e => {
            if (!schemas.includes(e.SchemaName) && (excludeSchemas === null || !excludeSchemas.includes(e.SchemaName)))
                schemas.push(e.SchemaName);
        });
    
        // now, generate a separate JSON file for each schema
        const allSchemas = {
            fullJSON: '[', 
            simpleJSON: '[',
            count: 0
        }
    
        const outputCache = [];
        schemas.forEach(s => {
            const schemaEntities = entities.filter(e => e.SchemaName === s);
            const schemaJSON = this.generateDBSchemaJSON(schemaEntities, excludeEntities, s, false);
            allSchemas.fullJSON += (allSchemas.count === 0 ? '' : ',') + schemaJSON;
            fs.writeFileSync(path.join(outputDir, `${s}.full.json`), schemaJSON);
            const schemaJSONMin = JSON.stringify(JSON.parse(schemaJSON));
            fs.writeFileSync(path.join(outputDir, `${s}.full.min.json`), schemaJSONMin);
    
            const simpleSchemaJSON = this.generateDBSchemaJSON(schemaEntities, excludeEntities, s, true);
            allSchemas.simpleJSON += (allSchemas.count === 0 ? '' : ',') + simpleSchemaJSON;
            fs.writeFileSync(path.join(outputDir, `${s}.simple.json`), simpleSchemaJSON);
            const simpleSchemaJSONMin = JSON.stringify(JSON.parse(simpleSchemaJSON));
            fs.writeFileSync(path.join(outputDir, `${s}.simple.min.json`), simpleSchemaJSONMin);
    
            logStatus(`     Generated schema JSON file for schema ${s}`);
    
            outputCache.push({ schemaName: s, schemaJSON: schemaJSON, simpleSchemaJSON: simpleSchemaJSON });
            allSchemas.count++;
        });
    
        // output the full JSON for all schemas
        allSchemas.fullJSON += ']';
        allSchemas.simpleJSON += ']';
    
        fs.writeFileSync(path.join(outputDir, `__ALL.full.json`), allSchemas.fullJSON);
        fs.writeFileSync(path.join(outputDir, `__ALL.simple.json`), allSchemas.simpleJSON);
    
        // now output the minified versions
        const allSchemasFullMin = JSON.stringify(JSON.parse(allSchemas.fullJSON));
        fs.writeFileSync(path.join(outputDir, `__ALL.full.min.json`), allSchemasFullMin);
        const allSchemasSimpleMin = JSON.stringify(JSON.parse(allSchemas.simpleJSON));
        fs.writeFileSync(path.join(outputDir, `__ALL.simple.min.json`), allSchemasSimpleMin);
    
        // finally, process bundles
        configInfo.dbSchemaJSONOutput.bundles.forEach(b => {
            if (!b.schemas || b.schemas.length === 0) {
                // use the EXCLUDE list and create the schema list
                b.schemas = schemas.filter(s => !b.excludeSchemas.includes(s));
            }
            // now we have the schemas we want to process in the b.schemas property
            let json: string = '[';
            let simpleJson: string = '[';
            for (let x:number = 0; x < b.schemas.length; ++x) {
                // grab the JSON for the schema in question and incorporate it into an output string
                const schemaName = b.schemas[x];
                const schemaEntities = entities.filter(e => e.SchemaName === schemaName);
                json += (x > 0 ? ',' : '') + this.generateDBSchemaJSON(schemaEntities, b.excludeEntities, schemaName, false)
                simpleJson += (x > 0 ? ',' : '') + this.generateDBSchemaJSON(schemaEntities, b.excludeEntities, schemaName, true);
            }
            json += ']';
            simpleJson += ']';
            fs.writeFileSync(path.join(outputDir, `${b.name}.full.json`), json);
            fs.writeFileSync(path.join(outputDir, `${b.name}.simple.json`), simpleJson);
            const jsonMin = JSON.stringify(JSON.parse(json));
            fs.writeFileSync(path.join(outputDir, `${b.name}.full.min.json`), jsonMin);
            const simpleJsonMin = JSON.stringify(JSON.parse(simpleJson));
            fs.writeFileSync(path.join(outputDir, `${b.name}.simple.min.json`), simpleJsonMin);
        });
    
        return true;
    }
    
    public generateDBSchemaJSON(entities: EntityInfo[], excludeEntities: string[], schemaName: string, simpleVersion: boolean): string {
        let sOutput: string = `{
        "schemaName": "${schemaName}", 
        "entities": [`;
    
        // first create a copy of the entities array and sort it by name
        let outputCount: number = 0;
        const sortedEntities = [...entities];
        sortedEntities.sort((a, b) => a.Name.localeCompare(b.Name));
        for (let i:number = 0; i < sortedEntities.length; ++i) {
            const entity = sortedEntities[i];
            if (!excludeEntities || !excludeEntities.includes(entity.Name)) {
                if (outputCount > 0) sOutput += ',';
                    outputCount++;
                sOutput += this.generateEntityJSON(entity, simpleVersion);
            }
        }
        sOutput += `
        ]
    }`;
        return sOutput;
    }
    
    protected generateEntityJSON(entity: EntityInfo, simpleVersion: boolean) : string {
        const jsonEscapedDescription = entity.Description ? entity.Description.replace(/"/g, '\\"') : '';
        let sOutput: string = `
        { 
            "Name": "${entity.Name}",
            "Description": "${jsonEscapedDescription}",
            "BaseView": "${entity.BaseView}", 
            "Fields": [`;
    
        if (simpleVersion) {
            // just create a comma delim string of the field names
            sOutput += `"${entity.Fields.map(f => f.Name).join('","')}"]`;
        }
        else {
            for (let i:number = 0; i < entity.Fields.length; ++i) {
                const field = entity.Fields[i];
                if (i > 0) sOutput += ',';
                sOutput += this.generateFieldJSON(field, simpleVersion);
            }
            sOutput += `        
            ]`
        }
        sOutput += `
        }`;
        return sOutput;
    }
     
    
    protected generateFieldJSON(field: EntityFieldInfo, simpleVersion: boolean) : string {
        const relEntity = field.RelatedEntity && field.RelatedEntity.length > 0 ? `\n                "RelatedEntity": "${field.RelatedEntity}",` : ''
        const relField = relEntity && field.RelatedEntityFieldName && field.RelatedEntityFieldName.length > 0 ? `\n                "RelatedEntityFieldName": "${field.RelatedEntityFieldName}",` : ''
        const jsonEscapedDescription = field.Description ? field.Description.replace(/"/g, '\\"') : '';
        let sOutput: string = `         
                {
                    "Name": "${field.Name}", 
                    "Description": "${jsonEscapedDescription}",  
                    "Type": "${field.Type}",${relEntity}${relField}
                    "AllowsNull": ${field.AllowsNull} 
                }`
        return sOutput;
    }
}
