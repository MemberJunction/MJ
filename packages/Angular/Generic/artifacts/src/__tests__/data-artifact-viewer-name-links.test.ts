// The node preset has no Angular linker; the JIT compiler lets partially compiled Angular libraries load.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import type { DataTable, EntityFieldInfo, EntityInfo, IMetadataProvider, MJColumnDescriptor } from '@memberjunction/core';
import type { QueryGridColumnConfig } from '@memberjunction/ng-query-viewer';
import { DataArtifactViewerComponent } from '../lib/components/plugins/data-artifact-viewer.component';

/**
 * A Data artifact's record links read as names: a column the agent marks with `linkKeyField`
 * opens its record by that field, and a column holding its entity's name field links by the
 * table's key column without the agent saying so.
 */

type BuildSeam = { buildColumnConfigsForTable(table: DataTable): QueryGridColumnConfig[] | null };
type FieldShape = Pick<EntityFieldInfo, 'Name' | 'IsPrimaryKey' | 'IsNameField' | 'RelatedEntity'>;
type EntityShape = Pick<EntityInfo, 'ID' | 'Name' | 'Icon' | 'Fields' | 'PrimaryKeys' | 'FirstPrimaryKey'>;

const FIELDS = [
    { Name: 'ID', IsPrimaryKey: true, IsNameField: false, RelatedEntity: '' },
    { Name: 'FullName', IsPrimaryKey: false, IsNameField: true, RelatedEntity: '' },
    { Name: 'Nickname', IsPrimaryKey: false, IsNameField: false, RelatedEntity: '' }
] as FieldShape[] as EntityFieldInfo[];
const CONTACTS: EntityShape = { ID: 'e-contacts', Name: 'Contacts', Icon: 'fa-solid fa-user', Fields: FIELDS, PrimaryKeys: FIELDS.filter(f => f.IsPrimaryKey), FirstPrimaryKey: FIELDS[0] };
const provider = {
    EntityByName: (name: string) => (name === 'Contacts' ? (CONTACTS as EntityInfo) : undefined)
} as Pick<IMetadataProvider, 'EntityByName'> as IMetadataProvider;

function viewer(): BuildSeam {
    const cdr = { detectChanges: () => undefined, markForCheck: () => undefined } as Pick<ChangeDetectorRef, 'detectChanges' | 'markForCheck'> as ChangeDetectorRef;
    const component = new DataArtifactViewerComponent(cdr);
    component.Provider = provider;
    return component as unknown as BuildSeam;
}

function column(field: string, sourceFieldName: string, linkKeyField?: string): MJColumnDescriptor {
    return { field, sourceEntity: 'Contacts', sourceFieldName, linkKeyField } as MJColumnDescriptor;
}

describe('DataArtifactViewerComponent name links', () => {
    it('links a column by the key field the descriptor names', () => {
        const table = { columns: [column('ContactID', 'ID'), column('Nick', 'Nickname', 'ContactID')], rows: [] } as Pick<DataTable, 'columns' | 'rows'> as DataTable;
        const configs = viewer().buildColumnConfigsForTable(table)!;
        expect(configs[1]).toMatchObject({ isEntityLink: true, targetEntityName: 'Contacts', linkKeyField: 'ContactID' });
    });

    it('links the name field by the key column without a descriptor hint', () => {
        const table = { columns: [column('ContactID', 'ID'), column('ContactName', 'FullName')], rows: [] } as Pick<DataTable, 'columns' | 'rows'> as DataTable;
        const configs = viewer().buildColumnConfigsForTable(table)!;
        expect(configs[0]).toMatchObject({ isEntityLink: true, isPrimaryKey: true, linkKeyField: undefined });
        expect(configs[1]).toMatchObject({ isEntityLink: true, targetEntityName: 'Contacts', linkKeyField: 'ContactID' });
    });
});
