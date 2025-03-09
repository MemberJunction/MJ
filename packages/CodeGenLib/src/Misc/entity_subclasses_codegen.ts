import { EntityFieldInfo, EntityFieldValueListType, EntityInfo, TypeScriptTypeFromSQLType } from '@memberjunction/core';
import fs from 'fs';
import path from 'path';
import { makeDir } from '../Misc/util';
import { RegisterClass } from '@memberjunction/global';
import { logStatus } from './status_logging';
import { ManageMetadataBase } from '../Database/manage-metadata';

/**
 * Base class for generating entity sub-classes, you can sub-class this class to modify/extend your own entity sub-class generator logic
 */
@RegisterClass(EntitySubClassGeneratorBase)
export class EntitySubClassGeneratorBase {
  public generateAllEntitySubClasses(entities: EntityInfo[], directory: string): boolean {
    try {
      const sortedEntities = entities.sort((a, b) => a.Name.localeCompare(b.Name));

      const zodContent: string = sortedEntities.map((entity: EntityInfo) => this.GenerateSchemaAndType(entity)).join('');
      const sContent = sortedEntities.map((e) => this.generateEntitySubClass(e, false)).join('');
      const allContent = `${this.generateEntitySubClassFileHeader()} \n ${zodContent} \n ${sContent}`;

      makeDir(directory);
      fs.writeFileSync(path.join(directory, 'entity_subclasses.ts'), allContent);

      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  public generateEntitySubClassFileHeader(): string {
    return `import { BaseEntity, EntitySaveOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

    `;
  }

  /**
   *
   * @param entity
   * @param includeFileHeader
   */
  public generateEntitySubClass(entity: EntityInfo, includeFileHeader: boolean = false): string {
    if (entity.PrimaryKeys.length === 0) {
      console.warn(`Entity ${entity.Name} has no primary keys.  Skipping.`);
      return '';
    } else {
      const fields: string = entity.Fields.map((e) => {
        let values: string = '';
        let valueList: string = '';
        if (e.ValueListType && e.ValueListType.length > 0 && e.ValueListType.trim().toLowerCase() !== 'none') {
          values = e.EntityFieldValues.map(
            (v) => `\n    *   * ${v.Value}${v.Description && v.Description.length > 0 ? ' - ' + v.Description : ''}`
          ).join('');
          valueList = `\n    * * Value List Type: ${e.ValueListType}\n    * * Possible Values ` + values;
        }
        let typeString: string = TypeScriptTypeFromSQLType(e.Type) + (e.AllowsNull ? ' | null' : '');
        if (e.ValueListTypeEnum !== EntityFieldValueListType.None && e.EntityFieldValues && e.EntityFieldValues.length > 0) {
          // construct a typeString that is a union of the possible values
          const quotes = e.NeedsQuotes ? "'" : '';
          typeString = e.EntityFieldValues.map((v) => `${quotes}${v.Value}${quotes}`).join(' | ');
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
    * * SQL Data Type: ${e.SQLFullType}${e.RelatedEntity ? '\n    * * Related Entity/Foreign Key: ' + e.RelatedEntity + ' (' + e.RelatedEntityBaseView + '.' + e.RelatedEntityFieldName + ')' : ''}${e.DefaultValue && e.DefaultValue.length > 0 ? '\n    * * Default Value: ' + e.DefaultValue : ''}${valueList}${e.Description && e.Description.length > 0 ? '\n    * * Description: ' + e.Description : ''}
    */
    get ${e.CodeName}(): ${typeString} {
        return this.Get('${e.Name}');
    }`;
        if (!e.ReadOnly) {
          sRet += `
    set ${e.CodeName}(value: ${typeString}) {
        this.Set('${e.Name}', value);
    }`;
        }
        return sRet;
      }).join('\n\n');

      const sClassName: string = `${entity.ClassName}Entity`;
      const subClass: string = entity.EntityObjectSubclassName ? entity.EntityObjectSubclassName : '';
      const subClassImport: string = entity.EntityObjectSubclassImport ? entity.EntityObjectSubclassImport : '';
      const sBaseClass: string = subClass.length > 0 && subClassImport.length > 0 ? `${subClass}` : 'BaseEntity';
      const subClassImportStatement: string =
        subClass.length > 0 && subClassImport.length > 0 ? `import { ${subClass} } from '${subClassImport}';\n` : '';
      const loadFieldString: string = entity.PrimaryKeys.map((f) => `${f.CodeName}: ${f.TSType}`).join(', ');
      const loadFunction: string = `    /**
    * Loads the ${entity.Name} record from the database
    ${entity.PrimaryKeys.map((f) => `* @param ${f.CodeName}: ${f.TSType} - primary key value to load the ${entity.Name} record.`).join('\n    ')}
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof ${sClassName}
    * @method
    * @override
    */
    public async Load(${loadFieldString}, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        ${entity.PrimaryKeys.map((f) => `compositeKey.KeyValuePairs.push({ FieldName: '${f.Name}', Value: ${f.CodeName} });`).join('\n        ')}
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }`;
      const deleteFunction: string = entity.AllowDeleteAPI
        ? ''
        : `    /**
    * ${entity.Name} - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof ${sClassName}
    * @throws {Error} - Delete is not allowed for ${entity.Name}, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for ${entity.Name}, to enable it set AllowDeleteAPI to 1 in the database.');
    }`;

      const saveFunction: string =
        entity.AllowCreateAPI || entity.AllowUpdateAPI
          ? ''
          : `    /**
    * ${entity.Name} - AllowCreateAPI and AllowUpdateAPI are both set to 0 in the database.  Save is not allowed, so this method is generated to override the base class method and throw an error. To enable save for this entity, set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof ${sClassName}
    * @throws {Error} - Save is not allowed for ${entity.Name}, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.
    */
    public async Save(options?: EntitySaveOptions) : Promise<boolean> {
        throw new Error('Save is not allowed for ${entity.Name}, to enable it set AllowCreateAPI and/or AllowUpdateAPI to 1 in the database.');
    }`;

    const validateFunction: string | null = this.GenerateValidateFunction(sClassName, entity);

      let sRet: string = `

/**
 * ${entity.Name} - strongly typed entity sub-class
 * * Schema: ${entity.SchemaName}
 * * Base Table: ${entity.BaseTable}
 * * Base View: ${entity.BaseView}${entity.Description && entity.Description.length > 0 ? '\n * * @description ' + entity.Description : ''}
 * * Primary Key${entity.PrimaryKeys.length > 1 ? 's' : ''}: ${entity.PrimaryKeys.map((f) => f.Name).join(', ')}
 * @extends {BaseEntity}
 * @class
 * @public
 */
${subClassImportStatement}@RegisterClass(BaseEntity, '${entity.Name}')
export class ${sClassName} extends ${sBaseClass}<${sClassName}Type> {${loadFunction ? '\n' + loadFunction : ''}${saveFunction ? '\n\n' + saveFunction : ''}${deleteFunction ? '\n\n' + deleteFunction : ''}${validateFunction ? '\n\n' + validateFunction : ''}

${fields}
}
`;
      if (includeFileHeader) sRet = this.generateEntitySubClassFileHeader() + sRet;

      return sRet;
    }
  }

  public GenerateValidateFunction(className: string, entity: EntityInfo): string | null{
    // go through the ManageMetadataBase.generatedFieldValidators to see if we have anything to generate
    const fieldValidators = ManageMetadataBase.generatedFieldValidators.filter((f) => f.entityName.trim().toLowerCase() === entity.Name.trim().toLowerCase());
    if (fieldValidators.length === 0) {
      return null;
    }
    else {
      const validationFunctions = fieldValidators.map((f) => {
        // output the function text and the function description in a JSDoc block

        // first format the function text to ensure that escaped \n and \t are removed and replaced with actual newlines and tabs
        const cleansedText = f.functionText.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        // next up, format the function text to have proper indentation with 4 spaces preceding the start of each line
        const formattedText = cleansedText.split('\n').map((l) => `    ${l}`).join('\n');

        return `    /**
    * ${f.functionDescription}
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
${formattedText}`  
      }).join('\n\n')

      const ret = `    /**
    * Validate() method override for ${entity.Name} entity. This is an auto-generated method that invokes the generated field validators for this entity for the following fields: 
${fieldValidators.map((f) => `    * * ${f.fieldName}: ${f.functionDescription}`).join('\n')}  
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
${fieldValidators.map((f) => `        this.${f.functionName}(result);`).join('\n')}

        return result;
    }

${validationFunctions}`
      return ret;
  }
}

  public GenerateSchemaAndType(entity: EntityInfo): string {
    let content: string = '';
    if (entity.PrimaryKeys.length === 0) {
      logStatus(`Entity ${entity.Name} has no primary keys.  Skipping.`);
    } else {
      const fields: string = entity.Fields.map((e) => {
        let values: string = '';
        let valueList: string = '';
        if (e.ValueListType && e.ValueListType.length > 0 && e.ValueListType.trim().toLowerCase() !== 'none') {
          values = e.EntityFieldValues.map(
            (v) => `\n    *   * ${v.Value}${v.Description && v.Description.length > 0 ? ' - ' + v.Description : ''}`
          ).join('');
          valueList = `\n    * * Value List Type: ${e.ValueListType}\n    * * Possible Values ` + values;
        }
        let typeString: string = `${TypeScriptTypeFromSQLType(e.Type).toLowerCase()}()` + (e.AllowsNull ? '.nullish()' : '');
        if (e.ValueListTypeEnum !== EntityFieldValueListType.None && e.EntityFieldValues && e.EntityFieldValues.length > 0) {
          // construct a typeString that is a union of the possible values
          const quotes = e.NeedsQuotes ? "'" : '';
          typeString = `union([${e.EntityFieldValues.map((v) => `z.literal(${quotes}${v.Value}${quotes})`).join(', ')}])`;
          if (e.ValueListTypeEnum === EntityFieldValueListType.ListOrUserEntry) {
            // special case becuase a user can enter whatever they want
            typeString += `.or(z.${TypeScriptTypeFromSQLType(e.Type)}()) `;
          }

          // finally, add the null type if it allows null
          if (e.AllowsNull) {
            typeString += '.nullish()';
          }
        }
        let sRet: string = `    ${e.CodeName}: z.${typeString}.describe(\`\n${this.GenetateZodDescription(e)}\`),`;
        return sRet;
      }).join('\n');

      const schemaName: string = `${entity.ClassName}Schema`;
      content = `
/**
 * zod schema definition for the entity ${entity.Name}
 */
export const ${schemaName} = z.object({
${fields}
});

export type ${entity.ClassName}EntityType = z.infer<typeof ${schemaName}>;
`;
    }

    return content;
  }

  public GenetateZodDescription(entityField: EntityFieldInfo): string {
    let result: string = '';

    let valueList: string = '';
    if (entityField.ValueListType && entityField.ValueListType.length > 0 && entityField.ValueListType.trim().toLowerCase() !== 'none') {
      let values = entityField.EntityFieldValues.map(
        (v) => `\n    *   * ${v.Value}${v.Description && v.Description.length > 0 ? ' - ' + v.Description : ''}`
      ).join('');
      valueList = `\n    * * Value List Type: ${entityField.ValueListType}\n    * * Possible Values ` + values;
    }

    result += `        * * Field Name: ${entityField.Name}${entityField.DisplayName && entityField.DisplayName.length > 0 ? '\n        * * Display Name: ' + entityField.DisplayName : ''}\n`;
    result += `        * * SQL Data Type: ${entityField.SQLFullType}${entityField.RelatedEntity ? '\n        * * Related Entity/Foreign Key: ' + entityField.RelatedEntity + ' (' + entityField.RelatedEntityBaseView + '.' + entityField.RelatedEntityFieldName + ')' : ''}${entityField.DefaultValue && entityField.DefaultValue.length > 0 ? '\n        * * Default Value: ' + entityField.DefaultValue : ''}${valueList}${entityField.Description && entityField.Description.length > 0 ? '\n    * * Description: ' + entityField.Description : ''}`;
    return result;
  }
}
