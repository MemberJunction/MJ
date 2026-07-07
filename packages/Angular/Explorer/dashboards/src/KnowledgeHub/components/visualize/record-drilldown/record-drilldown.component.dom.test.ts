import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { MJEmptyStateComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import type { DrilldownRecord } from '../../../knowledge-hub.types';
import { RecordDrilldownComponent } from './record-drilldown.component';

/**
 * DOM coverage for <app-kh-record-drilldown> — a Visible-gated drilldown panel that lists records
 * and emits Closed / OpenRecord intents (it never touches NavigationService). Loading and empty
 * states are gated by IsLoading / Records.length. mjButton + mj-empty-state imported; mj-loading
 * stubbed. Single synchronous render.
 */

@Component({ standalone: true, selector: 'mj-loading', template: '' })
class LoadingStub {
  @Input() text = '';
}

const RECORDS = [
  { Title: 'Alpha doc', Subtitle: 'a', Weight: 0.9, EntityName: 'Documents', RecordID: 'd1' },
  { Title: 'Beta doc', Subtitle: 'b', Weight: 0.5, EntityName: 'Documents', RecordID: 'd2' },
] as unknown as DrilldownRecord[];

const render = (inputs: Record<string, unknown>) =>
  renderComponentFixture(RecordDrilldownComponent, {
    imports: [MJEmptyStateComponent, MJButtonDirective, LoadingStub],
    declarations: [RecordDrilldownComponent],
    inputs: { Title: 'Related Records', Visible: true, IsLoading: false, Records: [], ...inputs },
  });

describe('RecordDrilldownComponent (DOM)', () => {
  it('renders nothing when not visible', () => {
    expect(query(render({ Visible: false }), '.drilldown-panel')).toBeNull();
  });

  it('renders the title and subtitle in the header', () => {
    const fixture = render({ Title: 'Related Records', Subtitle: '3 matches' });
    expect(text(fixture, '.drilldown-title-main')).toBe('Related Records');
    expect(text(fixture, '.drilldown-title-sub')).toBe('3 matches');
  });

  it('shows the loading indicator while IsLoading', () => {
    expect(query(render({ IsLoading: true }), 'mj-loading')).not.toBeNull();
  });

  it('shows the empty state when there are no records', () => {
    const empty = query(render({ Records: [] }), 'mj-empty-state');
    expect(empty).not.toBeNull();
    expect(empty?.getAttribute('title')).toContain('No records found');
  });

  it('renders one item per record with its title', () => {
    const items = queryAll(render({ Records: RECORDS }), '.drilldown-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Alpha doc');
  });

  it('emits OpenRecord with the entity/record when an item is clicked', () => {
    const fixture = render({ Records: RECORDS });
    const opened = capture(fixture.componentInstance.OpenRecord);
    (queryAll(fixture, '.drilldown-item')[1] as HTMLElement).click();
    expect(opened).toEqual([{ EntityName: 'Documents', RecordID: 'd2' }]);
  });

  it('emits Closed when the close button is clicked', () => {
    const fixture = render({ Records: RECORDS });
    const closed = capture(fixture.componentInstance.Closed);
    (query(fixture, 'button.mj-btn') as HTMLElement).click();
    expect(closed.length).toBe(1);
  });
});
