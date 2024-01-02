import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { logStatus, logError } from './logging';
import fs from 'fs';
import path from 'path';

export function generateReactCode(entities: EntityInfo[], directory: string): boolean {
  try {
      for (let i:number = 0; i < entities.length; ++i) {
          const entity = entities[i];

          if (entity._hasIdField && entity.IncludeInAPI) 
              fs.writeFileSync(path.join(directory, `${entity.ClassName}Page.tsx`), 
                               generateSingleEntityReactFile(entity));  
      }

      const entityPagesOutput = generateReactEntityPagesFile(entities);
      fs.writeFileSync(path.join(directory, 'EntityPages.ts'), entityPagesOutput);

      return true;
  } catch (err) {
      logError(err);
      return false;
  }
}

export function generateSingleEntityReactFile(entity: EntityInfo): string {
  let lCaseClassName = entity.ClassName.toLowerCase();
  let sOutput: string = `import { useSingle${entity.ClassName}Query } from '../api';
  import { SingleEntityPage } from '../components/organisms/SingleEntityPage';
  import { DateTime } from 'luxon';
  import { formatCurrency } from '../system/util';
  import { ExternalUrl, Field, useSingleEntity, Email, EntityLink, EntityFieldDisplayName, BodyText } from '../components';
  import { ${entity.ClassName} } from '../api';
  
  export const ${entity.ClassName}Page = ({ RecordID }: { RecordID: number }) => {
    return (
      <SingleEntityPage
        RecordID={RecordID}
        EntityName="${entity.Name}"
        queryHook={useSingle${entity.ClassName}Query}
        Details={<${entity.ClassName}Details />}
      />
    );
  };

  export const ${entity.ClassName}Details = () => {
    const [${lCaseClassName}] = useSingleEntity<${entity.ClassName}>();
    return (
      <div>
${generateFormFields(entity)}
      </div>
    );
  };
`;

  return sOutput;
} 

function generateFormFields(entity: EntityInfo) : string {
    let sOutput: string = '';
    try {
        for (let i: number = 0; i < entity.Fields.length; ++i) {
            sOutput += (sOutput.length == 0 ? '' : '\n') + 
                       generateSingleFieldOutput(entity, entity.Fields[i]);
        }
    } catch (err) {
        console.error(err);
    } finally {
        return sOutput;
    }
}

function generateSingleFieldOutput(entity: EntityInfo, field: EntityFieldInfo): string {
    const type: string = field.Type.toLowerCase().trim();
    const lCaseClassName: string = entity.ClassName.toLowerCase();
    const label: string = `label={<EntityFieldDisplayName Entity="${entity.Name}" EntityField="${field.Name}" />}`;
    let value: string = '';

    if ((type === 'datetime' || field.Type === 'datetimeoffset')) 
      value = `${lCaseClassName}?.${field.Name} &&
            DateTime.fromMillis(${lCaseClassName}.${field.Name}).toLocaleString(DateTime.DATETIME_SHORT)`;
    else if (field.ExtendedType !== null && field.ExtendedType.toLowerCase().trim() == 'url') {
      value = `<ExternalUrl>{${lCaseClassName}?.${field.Name}}</ExternalUrl>`
    }
    else if (field.ExtendedType !== null && field.ExtendedType.toLowerCase().trim() == 'email') {
      value = `<Email>{${lCaseClassName}?.${field.Name}}</Email>`
    }
    else if (field.RelatedEntityID != null && field.RelatedEntityFieldName != null) {
      value = `<EntityLink Entity="${entity.Name}" EntityField="${field.Name}">{${lCaseClassName}?.${field.Name}}</EntityLink>`
    }
    else if ( ((type === 'nvarchar' || type === 'varchar' ) && field.Length == -1) ||
                (type === 'text' || type === 'ntext' ) ) {
      // nvarchar max
      value = `<BodyText>{${lCaseClassName}?.${field.Name}}</BodyText>`;
    }
    else if ( type === 'money') {
      value = `${lCaseClassName}?.${field.Name} !== undefined
              ? formatCurrency(Math.floor(${lCaseClassName}.${field.Name}), {
                hideZeroCents: true,
      }) : undefined`
    }
    else
      value = `${lCaseClassName}?.${field.Name}`;

    return `        <Field ${label} value={${value}} />`;
}
 
export function generateReactEntityPagesFile(entities: EntityInfo[]): string {
  const importText = generateReactEntityPageImportText(entities);
  const mapText = generateReactEntityPageMapText(entities);
  return `import { FC } from 'react';
${importText}
export const EntityPages: Record<string, FC<{ RecordID: number }>> = {
${mapText}
};
`
}

function generateReactEntityPageImportText(entities: EntityInfo[]): string {
  let sOutput: string = '';
  try {
    for (let i: number = 0; i < entities.length; ++i) {
      if (entities[i].IncludeInAPI && entities[i]._hasIdField)
        sOutput += `import { ${entities[i].ClassName}Page } from './${entities[i].ClassName}Page';\n`;
    }
  } catch (err) {
    console.error(err);
  } finally {
    return sOutput;
  }
}

function generateReactEntityPageMapText(entities: EntityInfo[]): string {
  let sOutput: string = '';
  try {
    for (let i: number = 0; i < entities.length; ++i) {
      if (entities[i].IncludeInAPI && entities[i]._hasIdField)
        sOutput += (sOutput.length == 0 ? '' : ',\n') +  `  ${entities[i].CodeName}: ${entities[i].ClassName}Page`;
    }
  } catch (err) {
    console.error(err);
  } finally {
    return sOutput;
  }
}