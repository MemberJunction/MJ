import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import fs from 'fs';
import path from 'path';


export function generateGraphQLClientCode(entities: EntityInfo[], directory: string): boolean {
    let graphQLOutput: string = '';
    try {
        for (let i:number = 0; i < entities.length; ++i) {
            const entity = entities[i];

            if (entity._hasIdField && entity.IncludeInAPI) {
                graphQLOutput += generateClientGraphQLFragmentString(entity) + '\n\n';
                graphQLOutput += generateClientGraphQLDocumentString(entity) + '\n\n';
            }
        }
        fs.writeFileSync(path.join(directory, 'generated.graphql'), graphQLOutput);
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }  
}

export function generateClientGraphQLFragmentString(entity: EntityInfo): string {
    let sOutput: string = '';
    try {
        sOutput = internalGenerateFragment(entity, '', true);
    } catch (err) {
        console.error(err);
    } finally {
        return sOutput;
    }
}

function internalGenerateFragment(entity: EntityInfo, prefix: string, includeIdField: boolean): string {
    let sOutput: string = '';
    try {
        const fields: EntityFieldInfo[] = entity.Fields;

        sOutput = generateFragmentHeader(prefix, entity);
    
        // now generate the fields by looping through the fields collection from the database
        for (let j:number = 0; j < fields.length; ++j) {
            const f: EntityFieldInfo = fields[j];
            if (f.Name.trim().toUpperCase() !== 'ID' || (f.Name.trim().toUpperCase() === 'ID' && includeIdField)) {
                sOutput += generateFragmentField(f.Name);
            }
        }
    
        // This doesn't do anything yet, but keeping it in case we need to add relationship info to the fragments in the future
        // for (let j:number = 0; j < entity.RelatedEntities.length; ++j) {
        //     const r: EntityRelationship = entity.RelatedEntities[j];
        //     // only include SCALARS in fragments so commenting this out.... sOutput += generateFragmentRelatedEntity(r.RelatedEntity)
        // }
    
        // finally, close it up with the footer
        sOutput += generateFragmentFooter();
    }
    catch (err) {
        console.error(err);
    }
    finally {
        return sOutput
    }
}

function generateFragmentHeader(prefix: string, entity: EntityInfo): string {
    return `fragment ${prefix}${entity.ClassName}Scalars on ${entity.ClassName} {`;
}

function generateFragmentField(fieldName: string): string {
    return `\n  ${fieldName}`;
}

// not needed now as we're only generating scalars for the GraphQL fragments 
// function generateFragmentRelatedEntity(entityName: string): string {
//     return `\n  ${entityName}`;
// }

function generateFragmentFooter(): string {
    return `
}`;
}


export function generateClientGraphQLDocumentString(entity: EntityInfo): string {
    let sOutput: string = '';
    let relatedEntities: string = '';
    let relatedEntitiesToPackWithAll: string = '';
    try {
        //////////////// BUILD UP RELATED ENTITIES STRING ///////////////////////
        for (let j:number = 0; j < entity.RelatedEntities.length; ++j) {
            const r = entity.RelatedEntities[j];
            relatedEntities += `
    ${r.RelatedEntityCodeName} {
      ...${r.RelatedEntityBaseTableCodeName}Scalars
    }`;
            if (r.IncludeInParentAllQuery) {
                relatedEntitiesToPackWithAll += `   
    ${r.RelatedEntityCodeName} {
        ...${r.RelatedEntityBaseTableCodeName}Scalars
        }`;
            }
        }


        ///////////// All Entities have a Single Query //////////////////////////
        sOutput += `
query Single${entity.BaseTableCodeName}($ID: Int!) {
  ${entity.BaseTableCodeName}(ID: $ID) {
    ...${entity.BaseTableCodeName}Scalars   
  }
}`;

        ///////////// All Entities have a Single FULL Query that includes Related Entities //////////////////////////
        sOutput += `
query Single${entity.BaseTableCodeName}Full($ID: Int!) {
  ${entity.BaseTableCodeName}(ID: $ID) {
    ...${entity.BaseTableCodeName}Scalars${relatedEntities}   
  }
}`;

        ///////////// Some Entities have an AllRows query ///////////////////////
        if (entity.AllowAllRowsAPI) {
        sOutput += `
query All${entity.CodeName} {
  All${entity.CodeName} {
    ...${entity.BaseTableCodeName}Scalars${relatedEntitiesToPackWithAll}
  }
}`
        }

        ///////////// Some Entities have a Create Mutation //////////////////////////
        if (entity.AllowCreateAPI) {
            sOutput += `
mutation Create${entity.ClassName}($input: Create${entity.ClassName}Input!) {
    Create${entity.ClassName}(input: $input) {
        ...${entity.ClassName}Scalars
    }
}
`
        }

        ///////////// Some Entities have an Update Mutation //////////////////////////
        if (entity.AllowUpdateAPI) {
            sOutput += `
mutation Update${entity.ClassName}($input: Update${entity.ClassName}Input!) {
    Update${entity.ClassName}(input: $input) {
        ...${entity.ClassName}Scalars
    }
}
`
        }

        ///////////// Some Entities have a Delete Mutation //////////////////////////
        if (entity.AllowDeleteAPI) {
            sOutput += `
mutation Delete${entity.ClassName}($ID: Int!) {
    Delete${entity.ClassName}(ID: $ID)
}
`
        }

    } catch (err) {
        console.error(err);
    } finally {
        return sOutput;
    }
}