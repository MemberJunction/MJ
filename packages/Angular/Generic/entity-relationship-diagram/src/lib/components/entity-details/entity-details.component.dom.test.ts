import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { renderComponentFixture, query, queryAll, text, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { EntityDetailsComponent } from './entity-details.component';

/**
 * DOM-level spec for <mj-entity-details> — a module-declared (standalone:false) component that
 * renders the selected entity's metadata, a filterable field list, and the related-entities
 * section. The field list is driven purely off the `allEntityFields` @Input (no provider needed);
 * the related-entities section reaches into `ProviderToUse.Entities`, so those tests keep that
 * section collapsed to stay provider-free. We assert header/info binding, @if gating on
 * Description, the field list + field-filter toggling, and the open/close @Output emissions.
 */

function field(over: Partial<EntityFieldInfo>): EntityFieldInfo {
  return {
    ID: 'f-default',
    EntityID: 'e1',
    Name: 'Field',
    Type: 'nvarchar',
    IsPrimaryKey: false,
    RelatedEntityID: null,
    Description: null,
    EntityFieldValues: [],
    AllowsNull: true,
    IsVirtual: false,
    ...over,
  } as unknown as EntityFieldInfo;
}

function entityInfo(over: Partial<EntityInfo>): EntityInfo {
  return {
    ID: 'e1',
    Name: 'Accounts',
    SchemaName: 'crm',
    BaseTable: 'tbl_account',
    Description: null,
    ...over,
  } as unknown as EntityInfo;
}

const FIELDS: EntityFieldInfo[] = [
  field({ ID: 'f1', Name: 'ID', IsPrimaryKey: true }),
  field({ ID: 'f2', Name: 'OwnerID', RelatedEntityID: 'e2' }),
  field({ ID: 'f3', Name: 'AccountName' }),
];

// The related-entities <h4> count is rendered unconditionally and calls getRelatedEntities,
// which reads ProviderToUse.Entities — so supply a fake provider whose Entities is empty.
// (Entities is read-only on the provider, so seed it via the createFakeProvider option.)
function fakeProviderWithEntities(): ReturnType<typeof createFakeProvider> {
  return createFakeProvider({ entities: [] });
}

function render(inputs: Record<string, unknown> = {}): ComponentFixture<EntityDetailsComponent> {
  return renderComponentFixture(EntityDetailsComponent, {
    imports: [CommonModule],
    declarations: [EntityDetailsComponent],
    inputs: {
      Provider: fakeProviderWithEntities(),
      relationshipsSectionExpanded: false, // keep the related-entities list collapsed
      ...inputs,
    },
  });
}

describe('EntityDetailsComponent (DOM)', () => {
  it('renders the selected entity name, schema and table', () => {
    const f = render({ selectedEntity: entityInfo({ Name: 'Accounts' }), allEntityFields: FIELDS });
    expect(text(f, '.panel-header h3')).toBe('Accounts');
    const infoValues = queryAll(f, '.info-row span').map((s) => s.textContent?.trim());
    expect(infoValues).toContain('crm');
    expect(infoValues).toContain('tbl_account');
  });

  it('omits the Description row when the entity has no description', () => {
    const f = render({ selectedEntity: entityInfo({ Description: undefined }), allEntityFields: FIELDS });
    expect(queryAll(f, '.info-row').length).toBe(2); // Schema, Table only
  });

  it('shows the Description row when the entity has a description', () => {
    const f = render({ selectedEntity: entityInfo({ Description: 'The accounts table' }), allEntityFields: FIELDS });
    expect(queryAll(f, '.info-row').length).toBe(3);
    expect(text(f, '.info-row:last-child span')).toBe('The accounts table');
  });

  it('renders all matching fields in the fields list with the count in the header', () => {
    const f = render({ selectedEntity: entityInfo({}), allEntityFields: FIELDS });
    expect(queryAll(f, '.fields-list .field-item').length).toBe(3);
    expect(text(f, '.fields-section h4')).toBe('Fields (3)');
  });

  it('marks the All field-filter button active by default', () => {
    const f = render({ selectedEntity: entityInfo({}), allEntityFields: FIELDS });
    const allBtn = queryAll(f, '.filter-btn').find((b) => b.textContent?.trim() === 'All');
    expect(allBtn?.classList.contains('active')).toBe(true);
  });

  it('clicking the FKs filter narrows the list to foreign-key fields', () => {
    const f = render({ selectedEntity: entityInfo({}), allEntityFields: FIELDS });
    const fkBtn = queryAll(f, '.filter-btn').find((b) => b.textContent?.trim() === 'FKs') as HTMLButtonElement;
    fkBtn.click();
    f.detectChanges();
    expect(f.componentInstance.fieldFilter).toBe('foreign_keys');
    // only OwnerID is an FK (RelatedEntityID set, not PK)
    expect(queryAll(f, '.fields-list .field-item').length).toBe(1);
  });

  it('renders PK and FK badges for the appropriate fields', () => {
    const f = render({ selectedEntity: entityInfo({}), allEntityFields: FIELDS });
    expect(query(f, '.field-badge.primary-key')?.textContent?.trim()).toBe('PK');
    expect(query(f, '.field-badge.foreign-key')?.textContent?.trim()).toBe('FK');
  });

  it('emits openRecord for MJ: Entities with the entity ID when Open is clicked', () => {
    const f = render({ selectedEntity: entityInfo({ ID: 'e1' }), allEntityFields: FIELDS });
    const opened = capture(f.componentInstance.openRecord);
    (query(f, 'button.open-btn') as HTMLButtonElement).click();
    expect(opened).toEqual([{ EntityName: 'MJ: Entities', RecordID: 'e1' }]);
  });

  it('emits closePanel when the close button is clicked', () => {
    const f = render({ selectedEntity: entityInfo({}), allEntityFields: FIELDS });
    const closed = capture(f.componentInstance.closePanel);
    (query(f, 'button.close-btn') as HTMLButtonElement).click();
    expect(closed).toHaveLength(1);
  });

  it('emits fieldsSectionToggle when the fields section header is clicked', () => {
    const f = render({ selectedEntity: entityInfo({}), allEntityFields: FIELDS });
    const toggled = capture(f.componentInstance.fieldsSectionToggle);
    (query(f, '.fields-section .section-title-group') as HTMLElement).click();
    expect(toggled).toHaveLength(1);
  });

  it('hides the fields list when fieldsSectionExpanded is false', () => {
    const f = render({ selectedEntity: entityInfo({}), allEntityFields: FIELDS, fieldsSectionExpanded: false });
    expect(query(f, '.fields-list')).toBeNull();
  });
});
