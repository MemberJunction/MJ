import { EntityInfo, TypeScriptTypeFromSQLType } from '@memberjunction/core';
import fs from 'fs';
import path from 'path';
import { makeDir } from './util';

export function generateAllEntitySubClasses(entities: EntityInfo[], directory: string): boolean {
    try {   
        const sContent = generateEntitySubClassFileHeader() + entities.map(e => generateEntitySubClass(e, false)).join('')
        makeDir(directory);
        fs.writeFileSync(path.join(directory, 'entity_subclasses.ts'), sContent);

        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}
export function generateEntitySubClassFileHeader(): string {
    return `import { BaseEntity } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
`
}

export function generateEntitySubClass(entity: EntityInfo, includeFileHeader: boolean = false ) : string { 
    const fields: string = entity.Fields.map(e => {
        let values: string = '';
        let valueList: string = '';
        if (e.ValueListType && 
            e.ValueListType.length > 0 && 
            e.ValueListType.trim().toLowerCase() !== 'none') {
            values = e.EntityFieldValues.map(v => `\n    * ${v.Value}${v.Description && v.Description.length > 0 ? ' - ' + v.Description : ''}`).join('');
            valueList = `\n    * Value List Type: ${e.ValueListType}\n    * Possible Values `+ values  
        }
        let sRet: string = `    /**
    * * Field Name: ${e.Name}${e.DisplayName && e.DisplayName.length > 0 ? '\n    * * Display Name: ' + e.DisplayName : ''}
    * * SQL Data Type: ${e.SQLFullType}${e.RelatedEntity ? '\n    * * Related Entity: ' +  e.RelatedEntity : ''}${e.DefaultValue && e.DefaultValue.length > 0 ? '\n    * * Default Value: ' + e.DefaultValue : ''}${valueList}${e.Description && e.Description.length > 0 ? '\n    * * Description: ' + e.Description : ''}
    */
    get ${e.CodeName}(): ${TypeScriptTypeFromSQLType(e.Type)} {  
        return this.Get('${e.Name}');
    }
`
        if (!e.ReadOnly) {
            sRet += `    set ${e.CodeName}(value: ${TypeScriptTypeFromSQLType(e.Type)}) {
        this.Set('${e.Name}', value);
    }`
        }
        return sRet + '\n';
    }).join('')

    const sClassName: string = `${entity.ClassName}Entity`
    const subClass: string = entity.EntityObjectSubclassName ? entity.EntityObjectSubclassName : '';
    const subClassImport: string = entity.EntityObjectSubclassImport ? entity.EntityObjectSubclassImport : '';
    const sBaseClass: string = subClass.length > 0 && subClassImport.length > 0 ? `${subClass}` : 'BaseEntity';
    const subClassImportStatement: string = subClass.length > 0 && subClassImport.length > 0 ? `import { ${subClass} } from '${subClassImport}';\n` : '';
    let sRet: string = `
/**
 * ${entity.Name} - strongly typed entity sub-class
 * * Schema: ${entity.SchemaName}
 * * Base Table: ${entity.BaseTable}
 * * Base View: ${entity.BaseView}${entity.Description && entity.Description.length > 0 ? '\n * @description ' + entity.Description : ''}
 * * Primary Key: ${entity.PrimaryKey.Name}
 * * Description: ${entity.Description}
 * @extends {BaseEntity}
 * @class
 * @public
 */
${subClassImportStatement}@RegisterClass(BaseEntity, '${entity.Name}')
export class ${sClassName} extends ${sBaseClass} {
${fields}
}
`
    if (includeFileHeader)
        sRet = generateEntitySubClassFileHeader() + sRet;
    
    return sRet
}