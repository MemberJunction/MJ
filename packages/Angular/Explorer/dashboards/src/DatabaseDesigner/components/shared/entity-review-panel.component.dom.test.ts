import { describe, it, expect } from 'vitest';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import type { EntityTableSpec } from '../../database-designer.types';
import { EntityReviewPanelComponent } from './entity-review-panel.component';

/**
 * DOM coverage for <mj-database-review-panel> (OnPush) — a pure-display review of an entity table
 * spec: header (name + schema.table + NEW/ALTER mode tag + description) and the column table (which
 * always injects the auto-managed ID/PK row). Per-column rows go through a SQL-type resolver, so
 * these specs cover the header + the always-present auto-managed row with an empty Columns list.
 * No DI/async; setter-inputs on an OnPush component → single render.
 */

const spec = (over: Partial<EntityTableSpec> = {}): EntityTableSpec =>
  ({ EntityName: 'Members', SchemaName: 'crm', TableName: 'Member', Description: '', Columns: [], ...over }) as EntityTableSpec;

const render = (TableDefinition: EntityTableSpec | null, ModificationType: 'create' | 'alter' = 'create') =>
  renderComponentFixture(EntityReviewPanelComponent, {
    imports: [MJEmptyStateComponent],
    declarations: [EntityReviewPanelComponent],
    inputs: { TableDefinition, ModificationType },
  });

describe('EntityReviewPanelComponent (DOM)', () => {
  it('shows an empty-state (not the review panel) when there is no table definition', () => {
    const fixture = render(null);
    expect(query(fixture, '.review-panel')).toBeNull();
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
  });

  it('renders the entity name and schema-qualified table path', () => {
    const fixture = render(spec());
    expect(text(fixture, '.entity-name')).toBe('Members');
    expect(query(fixture, '.schema-path')?.textContent?.replace(/\s+/g, '')).toBe('crm.Member');
  });

  it('shows the NEW tag in create mode', () => {
    expect(text(render(spec(), 'create'), '.mode-tag')).toContain('NEW');
  });

  it('shows the ALTER tag in alter mode', () => {
    expect(text(render(spec(), 'alter'), '.mode-tag')).toContain('ALTER');
  });

  it('shows the description when present', () => {
    expect(text(render(spec({ Description: 'Core member records' })), '.entity-description')).toContain('Core member records');
  });

  it('always injects the auto-managed ID/PK column row', () => {
    const fixture = render(spec());
    expect(query(fixture, '.auto-col-row')).not.toBeNull();
    expect(query(fixture, '.auto-col-row')?.textContent).toContain('ID');
  });
});
