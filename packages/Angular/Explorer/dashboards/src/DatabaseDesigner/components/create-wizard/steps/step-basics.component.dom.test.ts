import { describe, it, expect } from 'vitest';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, typeInto, capture } from '@memberjunction/ng-test-utils';
import type { BasicsStepValue } from '../../../database-designer.types';
import { StepBasicsComponent } from './step-basics.component';

/**
 * DOM coverage for <mj-entity-step-basics> (OnPush) — the wizard "basics" form: entity name, table
 * name (auto-derived from the entity name until manually overridden), and schema. Typing fires the
 * (input) handlers which emit ValueChanged; the auto-badge tracks whether the table name is still
 * auto-derived. Native inputs + a native select + mj-alert (imported). No async data.
 */

const render = () =>
  renderComponentFixture(StepBasicsComponent, {
    imports: [MJAlertComponent],
    declarations: [StepBasicsComponent],
    inputs: { InitialValue: {}, AvailableSchemas: [] },
  });

const lastValue = (emissions: BasicsStepValue[]) => emissions[emissions.length - 1];

describe('StepBasicsComponent (DOM)', () => {
  it('renders the entity-name and table-name inputs', () => {
    const fixture = render();
    expect(query(fixture, '#entityName')).not.toBeNull();
    expect(query(fixture, '#tableName')).not.toBeNull();
  });

  it('emits ValueChanged carrying the entity name as the user types it', () => {
    const fixture = render();
    const changes = capture(fixture.componentInstance.ValueChanged);
    typeInto(fixture, '#entityName', 'Project Milestones');
    expect(changes.length).toBeGreaterThan(0);
    expect(lastValue(changes).entityName).toBe('Project Milestones');
  });

  it('auto-derives a space-free table name from the entity name', () => {
    const fixture = render();
    const changes = capture(fixture.componentInstance.ValueChanged);
    typeInto(fixture, '#entityName', 'Project Milestones');
    const tableName = lastValue(changes).tableName;
    expect(tableName).toBeTruthy();
    expect(tableName).not.toContain(' ');
  });

  it('shows the auto badge as active while the table name is auto-derived', () => {
    const fixture = render();
    typeInto(fixture, '#entityName', 'Project Milestones');
    fixture.detectChanges(false);
    expect(query(fixture, '.auto-badge')?.classList.contains('active')).toBe(true);
  });

  it('turns off auto-tracking when the table name is edited to a custom value', () => {
    const fixture = render();
    const changes = capture(fixture.componentInstance.ValueChanged);
    typeInto(fixture, '#tableName', 'MyCustomTable');
    fixture.detectChanges(false);
    expect(lastValue(changes).tableNameIsAuto).toBe(false);
    expect(query(fixture, '.auto-badge')?.classList.contains('active')).toBe(false);
  });
});
