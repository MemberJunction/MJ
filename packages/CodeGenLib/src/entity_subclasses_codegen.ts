import { EntityFieldValueListType, EntityInfo, TypeScriptTypeFromSQLType } from '@memberjunction/core';
import fs from 'fs';
import path from 'path';
import { makeDir } from './Misc/util';
import { RegisterClass } from '@memberjunction/global';

/**
 * Base class for generating entity sub-classes, you can sub-class this class to modify/extend your own entity sub-class generator logic
 */
@RegisterClass(EntitySubClassGeneratorBase)
export class EntitySubClassGeneratorBase {
    public generateAllEntitySubClasses(entities: EntityInfo[], directory: string): boolean {
        try {   
            const sortedEntities = entities.sort((a, b) => a.Name.localeCompare(b.Name));
            const sContent = this.generateEntitySubClassFileHeader() + sortedEntities.map(e => this.generateEntitySubClass(e, false)).join('')
            makeDir(directory);
            fs.writeFileSync(path.join(directory, 'entity_subclasses.ts'), sContent);
    
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }
    
    public generateEntitySubClassFileHeader(): string {
        return `import { BaseEntity, EntitySaveOptions, CompositeKey } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import * as Types from "./entity_schemas_and_types";
    `
    }
    
    /**
     * 
     * @param entity 
     * @param includeFileHeader 
     */
    public generateEntitySubClass(entity: EntityInfo, includeFileHeader: boolean = false ) : string { 
        if (entity.PrimaryKeys.length === 0) {
            console.warn(`Entity ${entity.Name} has no primary keys.  Skipping.`);
            return "";
        }
        else {
            const fields: string = entity.Fields.map(e => {
                let values: string = '';
                let valueList: string = '';
                if (e.ValueListType && 
                    e.ValueListType.length > 0 && 
                    e.ValueListType.trim().toLowerCase() !== 'none') {
                    values = e.EntityFieldValues.map(v => `\n    *   * ${v.Value}${v.Description && v.Description.length > 0 ? ' - ' + v.Description : ''}`).join('');
                    valueList = `\n    * * Value List Type: ${e.ValueListType}\n    * * Possible Values `+ values  
                }
                let typeString: string = TypeScriptTypeFromSQLType(e.Type) + (e.AllowsNull ? ' | null' : '');
                if (e.ValueListTypeEnum !== EntityFieldValueListType.None && e.EntityFieldValues && e.EntityFieldValues.length > 0) {
                    // construct a typeString that is a union of the possible values
                    const quotes = e.NeedsQuotes ? "'" : '';
                    typeString = e.EntityFieldValues.map(v => `${quotes}${v.Value}${quotes}`).join(' | ');
                    if (e.ValueListTypeEnum === EntityFieldValueListType.ListOrUserEntry) {
                        // special case becuase a user can enter whatever they want
                        typeString += ' | ' + TypeScriptTypeFromSQLType(e.Type);
                    }
                    // finally, add the null type if it allows null
                    if (e.AllowsNull) {
                        typeString += ' | null';
                    }
                }
                let sRet: string = `    /**
    * * Field Name: ${e.Name}${e.DisplayName && e.DisplayName.length > 0 ? '\n    * * Display Name: ' + e.DisplayName : ''}
    * * SQL Data Type: ${e.SQLFullType}${e.RelatedEntity ? '\n    * * Related Entity/Foreign Key: ' +  e.RelatedEntity + ' (' + e.RelatedEntityBaseView + '.' + e.RelatedEntityFieldName + ')' : ''}${e.DefaultValue && e.DefaultValue.length > 0 ? '\n    * * Default Value: ' + e.DefaultValue : ''}${valueList}${e.Description && e.Description.length > 0 ? '\n    * * Description: ' + e.Description : ''}
    */
    get ${e.CodeName}(): ${typeString} {  
        return this.Get('${e.Name}');
    }`
            if (!e.ReadOnly) {
                sRet += `
    set ${e.CodeName}(value: ${typeString}) {
        this.Set('${e.Name}', value);
    }`
                }
                return sRet;
            }).join('\n\n')
    
            const sClassName: string = `${entity.ClassName}Entity`
            const subClass: string = entity.EntityObjectSubclassName ? entity.EntityObjectSubclassName : '';
            const subClassImport: string = entity.EntityObjectSubclassImport ? entity.EntityObjectSubclassImport : '';
            const sBaseClass: string = subClass.length > 0 && subClassImport.length > 0 ? `${subClass}` : 'BaseEntity';
            const subClassImportStatement: string = subClass.length > 0 && subClassImport.length > 0 ? `import { ${subClass} } from '${subClassImport}';\n` : '';
            const loadFieldString: string = entity.PrimaryKeys.map(f => `${f.CodeName}: ${f.TSType}`).join(', ');
            const loadFunction: string = `    /**
    * Loads the ${entity.Name} record from the database
    ${entity.PrimaryKeys.map(f => `* @param ${f.CodeName}: ${f.TSType} - primary key value to load the ${entity.Name} record.`).join('\n    ')}
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ${sClassName}
    * @method
    * @override
    */      
    public async Load(${loadFieldString}, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        ${entity.PrimaryKeys.map(f => `compositeKey.KeyValuePairs.push({ FieldName: '${f.Name}', Value: ${f.CodeName} });`).join('\n        ')}
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }`    
            const deleteFunction: string = entity.AllowDeleteAPI ? '' : `    /**
    * ${entity.Name} - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof ${sClassName}
    * @throws {Error} - Delete is not allowed for ${entity.Name}, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for ${entity.Name}, to enable it set AllowDeleteAPI to 1 in the database.');
    }`
    
            const saveFunction: string = entity.AllowCreateAPI || entity.AllowUpdateAPI ? '' : `    /**
    * ${entity.Name} - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof ${sClassName}
    * @throws {Error} - Save is not allowed for ${entity.Name}, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for ${entity.Name}, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }`
    
            let sRet: string = `
            
/**
 * ${entity.Name} - strongly typed entity sub-class
 * * Schema: ${entity.SchemaName}
 * * Base Table: ${entity.BaseTable}
 * * Base View: ${entity.BaseView}${entity.Description && entity.Description.length > 0 ? '\n * * @description ' + entity.Description : ''}
 * * Primary Key${entity.PrimaryKeys.length > 1 ? 's' : ''}: ${entity.PrimaryKeys.map(f => f.Name).join(', ')}
 * @extends {BaseEntity}
 * @class
 * @public
 */
${subClassImportStatement}@RegisterClass(BaseEntity, '${entity.Name}')
export class ${sClassName} extends ${sBaseClass}<Types.${sClassName}Type> {${loadFunction ? '\n' + loadFunction : ''}${saveFunction ? '\n\n' + saveFunction : ''}${deleteFunction ? '\n\n' + deleteFunction : ''}

${fields}
}
`
            if (includeFileHeader)
                sRet = this.generateEntitySubClassFileHeader() + sRet;
            
            return sRet
        }
    }
}

