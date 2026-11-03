import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, createFakeProvider, query, text } from '@memberjunction/ng-test-utils';
import type { EntityInfo, IMetadataProvider, RunViewParams } from '@memberjunction/core';
import type { TagScopeContext } from '@memberjunction/tag-engine-base';
import { TagChipsComponent } from './tag-chips.component';

/**
 * DOM spec for <mj-tag-chips>' scope handling. Suggestions come from
 * `RunView.FromMetadataProvider(this.ProviderToUse)`, so a fake provider passed into `[Provider]`
 * captures the suggestion query. Creating a tag goes through `GetEntityObject`; the fake hands back
 * plain records whose `Save()` logs what was written, so the test sees the Tag, Tag Scope and
 * Tagged Item rows in order.
 */
const COMPANIES_ENTITY_ID = 'ent-companies';
const LISTS_ENTITY_ID = 'ent-lists';
const ENTITIES: Record<string, string> = { 'MJ: Lists': LISTS_ENTITY_ID, Companies: COMPANIES_ENTITY_ID };

interface SavedRow {
  Entity: string;
  Fields: Record<string, unknown>;
}

interface Harness {
  provider: IMetadataProvider;
  queries: RunViewParams[];
  saved: SavedRow[];
}

function harness(suggestionRows: Array<{ ID: string; Name: string }> = [], failEntity?: string): Harness {
  const queries: RunViewParams[] = [];
  const filterOf = (p: RunViewParams): string => (typeof p.ExtraFilter === 'string' ? p.ExtraFilter : '');
  const saved: SavedRow[] = [];
  const base = createFakeProvider({
    runViewResults: (p: RunViewParams) => {
      queries.push(p);
      return p.EntityName === 'MJ: Tags' && filterOf(p).includes('LIKE') ? suggestionRows : [];
    },
    entityByName: (name: string) => (ENTITIES[name] ? ({ ID: ENTITIES[name], Name: name } as EntityInfo) : undefined),
  });
  let seq = 0;
  const getEntityObject = async (entityName: string) => {
    const fields: Record<string, unknown> = {};
    const record = {
      NewRecord: () => true,
      LatestResult: { CompleteMessage: 'fake failure' },
      Save: async () => {
        if (entityName === failEntity) return false;
        fields['ID'] = fields['ID'] ?? `${entityName}-${++seq}`;
        saved.push({ Entity: entityName, Fields: { ...fields } });
        return true;
      },
    };
    return new Proxy(record, {
      get: (t, k: string) => (k in t ? t[k as keyof typeof t] : fields[k]),
      set: (_t, k: string, v: unknown) => {
        fields[k] = v;
        return true;
      },
    });
  };
  Object.assign(base, { GetEntityObject: getEntityObject });
  return { provider: base, queries, saved };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

function render(h: Harness, inputs: Record<string, unknown> = {}) {
  return renderComponentFixture(TagChipsComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [TagChipsComponent],
    inputs: { Provider: h.provider, EntityName: 'MJ: Lists', RecordID: 'rec-1', Editable: true, ...inputs },
  });
}

const SCOPE: TagScopeContext = { scopes: [{ entityName: 'Companies', recordId: 'co-1' }] };

function suggestionFilter(h: Harness): string {
  const q = h.queries.find((p) => p.EntityName === 'MJ: Tags' && typeof p.ExtraFilter === 'string' && p.ExtraFilter.includes('LIKE'));
  return typeof q?.ExtraFilter === 'string' ? q.ExtraFilter : '';
}

describe('TagChipsComponent scope (DOM)', () => {
  it('suggests active tags only when there is no scope context', async () => {
    const h = harness();
    const f = render(h);
    await settle();
    await f.componentInstance.OnAddInputChange('dono');

    const filter = suggestionFilter(h);
    expect(filter).toContain(`Status='Active'`);
    expect(filter).not.toContain('vwTagScopes');
    expect(filter).toContain(`Name LIKE '%dono%'`);
    const q = h.queries.find((p) => p.ExtraFilter === filter);
    expect(q?.ResultType).toBe('simple');
    expect(q?.Fields).toEqual(['ID', 'Name']);
  });

  it('limits suggestions to global tags and the context scope when one is set', async () => {
    const h = harness();
    const f = render(h, { ScopeContext: SCOPE });
    await settle();
    await f.componentInstance.OnAddInputChange('dono');

    const filter = suggestionFilter(h);
    expect(filter).toContain(`Status='Active' AND (IsGlobal=1 OR ID IN (`);
    expect(filter).toContain(`ScopeEntityID='${COMPANIES_ENTITY_ID}' AND ScopeRecordID='co-1'`);
  });

  it('hides "Create" and does not create on Enter when AllowCreate is false', async () => {
    const h = harness();
    const f = render(h, { AllowCreate: false });
    await settle();
    await f.componentInstance.OnAddInputChange('brand new');
    f.detectChanges();

    expect(f.componentInstance.CanCreateNew).toBe(false);
    expect(query(f, '.tag-chip-add__suggestion--create')).toBeNull();
    f.componentInstance.AddInput = 'brand new';
    await f.componentInstance.OnAddInputSubmit();
    await f.componentInstance.OnCreateNew();
    expect(h.saved).toEqual([]);
  });

  it('offers "Create" by default', async () => {
    const h = harness();
    const f = render(h);
    await settle();
    await f.componentInstance.OnAddInputChange('brand new');
    f.detectChanges();
    expect(text(f, '.tag-chip-add__suggestion--create')).toContain('Create "brand new"');
  });

  it('saves a scoped new tag as non-global with one scope row per entry, then applies it', async () => {
    const h = harness();
    const ctx: TagScopeContext = {
      scopes: [
        { entityName: 'Companies', recordId: 'co-1' },
        { entityId: 'ent-regions', recordId: 'rg-9' },
      ],
    };
    const f = render(h, { ScopeContext: ctx });
    await settle();
    f.componentInstance.AddInput = 'Gala';
    await f.componentInstance.OnCreateNew();

    expect(h.saved.map((s) => s.Entity)).toEqual(['MJ: Tags', 'MJ: Tag Scopes', 'MJ: Tag Scopes', 'MJ: Tagged Items']);
    const [tag, scopeA, scopeB, tagged] = h.saved;
    expect(tag.Fields['IsGlobal']).toBe(false);
    expect(scopeA.Fields).toMatchObject({ TagID: tag.Fields['ID'], ScopeEntityID: COMPANIES_ENTITY_ID, ScopeRecordID: 'co-1' });
    expect(scopeB.Fields).toMatchObject({ TagID: tag.Fields['ID'], ScopeEntityID: 'ent-regions', ScopeRecordID: 'rg-9' });
    expect(tagged.Fields).toMatchObject({ TagID: tag.Fields['ID'], RecordID: 'rec-1', EntityID: LISTS_ENTITY_ID });
  });

  it('keeps the IsGlobal default when there is no scope context', async () => {
    const h = harness();
    const f = render(h);
    await settle();
    f.componentInstance.AddInput = 'Gala';
    await f.componentInstance.OnCreateNew();

    expect(h.saved.map((s) => s.Entity)).toEqual(['MJ: Tags', 'MJ: Tagged Items']);
    expect('IsGlobal' in h.saved[0].Fields).toBe(false);
  });

  it('does not apply a scoped tag whose scope row fails to save', async () => {
    const h = harness([], 'MJ: Tag Scopes');
    const f = render(h, { ScopeContext: SCOPE });
    await settle();
    f.componentInstance.AddInput = 'Gala';
    await f.componentInstance.OnCreateNew();

    expect(h.saved.map((s) => s.Entity)).toEqual(['MJ: Tags']);
    expect(h.saved[0].Fields['IsGlobal']).toBe(false);
    expect(f.componentInstance.tags).toEqual([]);
  });

  it('creates nothing when a scope entry cannot be resolved', async () => {
    const h = harness();
    const f = render(h, { ScopeContext: { scopes: [{ entityName: 'Unknown Entity', recordId: 'x' }] } });
    await settle();
    f.componentInstance.AddInput = 'Gala';
    await f.componentInstance.OnCreateNew();
    expect(h.saved).toEqual([]);
  });
});
