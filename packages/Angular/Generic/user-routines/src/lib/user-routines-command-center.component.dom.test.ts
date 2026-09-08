import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { renderComponentFixture, query, text, capture } from '@memberjunction/ng-test-utils';
import { UserRoutinesCommandCenterComponent } from './user-routines-command-center.component';

/**
 * DOM coverage for <mj-user-routines-command-center> — the composite shell that combines the routines
 * list / new-routine editor / history behind a tab switcher (~4×). The three heavy child surfaces and
 * the two toolbar ui-components are stubbed; these verify the header (title + count), the tab-driven
 * view switching (list ↔ editor), which child renders per ActiveView, the ViewChanged output, and the
 * close affordance.
 */

@Component({ standalone: true, selector: 'mj-my-routines-list', template: '<div class="stub-list"></div>' })
class ListStub { @Input() Provider: unknown; @Input() SearchText = ''; @Input() StatusFilter: unknown; }
@Component({ standalone: true, selector: 'mj-new-routine', template: '<div class="stub-new"></div>' })
class NewStub { @Input() Provider: unknown; @Input() RoutineID: string | null = null; }
@Component({ standalone: true, selector: 'mj-user-routine-history', template: '<div class="stub-history"></div>' })
class HistoryStub { @Input() Provider: unknown; @Input() RoutineID: string | null = null; @Input() RoutineName: string | null = null; }
@Component({ standalone: true, selector: 'mj-page-search', template: '' })
class PageSearchStub { @Input() Placeholder = ''; @Input() Value = ''; }
@Component({ standalone: true, selector: 'mj-refresh-button', template: '' })
class RefreshStub { @Input() ShowLabel = true; }

const CHILDREN = [ListStub, NewStub, HistoryStub, PageSearchStub, RefreshStub];

const render = (inputs: Record<string, unknown> = {}, setup?: (c: UserRoutinesCommandCenterComponent) => void) =>
  renderComponentFixture(UserRoutinesCommandCenterComponent, {
    imports: CHILDREN,
    declarations: [UserRoutinesCommandCenterComponent],
    inputs,
    setup,
  });
type Fx = ReturnType<typeof render>;
const tabs = (f: Fx) => Array.from(f.nativeElement.querySelectorAll('.urcc-tab')) as HTMLElement[];

describe('UserRoutinesCommandCenterComponent (DOM)', () => {
  it('renders the header title and the total-count badge', () => {
    const f = render({}, (c) => { c.TotalCount = 7; });
    expect(text(f, '.urcc-title')).toContain('Routines');
    expect(text(f, '.urcc-count')).toBe('7');
  });

  it('shows the routines list by default', () => {
    const f = render();
    expect(query(f, '.stub-list')).not.toBeNull();
    expect(query(f, '.stub-new')).toBeNull();
  });

  it('switches to the new-routine editor when the New tab is clicked', () => {
    const f = render();
    const out = capture(f.componentInstance.ViewChanged);
    tabs(f)[1].click(); // "New Routine" tab → ShowNewRoutine()
    f.detectChanges(false);
    expect(f.componentInstance.ActiveView).toBe('editor');
    expect(query(f, '.stub-new')).not.toBeNull();
    expect(query(f, '.stub-list')).toBeNull();
    expect(out).toContain('editor');
  });

  it('switches back to the list view', () => {
    const f = render();
    f.componentInstance.ShowNewRoutine();
    f.detectChanges(false);
    f.componentInstance.ShowList();
    f.detectChanges(false);
    expect(f.componentInstance.ActiveView).toBe('list');
    expect(query(f, '.stub-list')).not.toBeNull();
  });

  it('renders the history child when the view is history', () => {
    const f = render({}, (c) => { c.ActiveView = 'history'; });
    expect(query(f, '.stub-history')).not.toBeNull();
    expect(query(f, '.stub-list')).toBeNull();
  });

  it('shows a close button and emits CloseRequested when ShowClose is set', () => {
    const f = render({ ShowClose: true });
    const out = capture(f.componentInstance.CloseRequested);
    (query(f, 'button[title="Close"]') as HTMLElement).click();
    expect(out.length).toBe(1);
  });

  it('hides the header entirely when ShowHeader is false', () => {
    expect(query(render({ ShowHeader: false }), '.urcc-header')).toBeNull();
  });
});
