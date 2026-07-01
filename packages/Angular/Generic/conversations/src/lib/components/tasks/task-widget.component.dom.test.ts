import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { TaskWidgetComponent } from './task-widget.component';

/**
 * DOM spec for <mj-task-widget> — a presentational task card.
 * The template reads only plain scalar props off the task, so a plain stub cast
 * to MJTaskEntity is sufficient (no BaseEntity behavior is exercised). Covers the
 * title/status/type badges, the data-status indicator, the description + progress
 * gating, the meta rows, the clickable class, and the click → taskClick output.
 */
describe('TaskWidgetComponent (DOM)', () => {
  // Test seam: the card only renders scalar fields, so a plain object cast to the
  // entity type stands in for a full BaseEntity instance.
  const makeTask = (overrides: Partial<MJTaskEntity> = {}): MJTaskEntity =>
    ({ Name: 'Build report', Status: 'In Progress', Type: 'Agent', ...overrides }) as unknown as MJTaskEntity;

  const render = (task: MJTaskEntity, inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(TaskWidgetComponent, {
      imports: [CommonModule],
      declarations: [TaskWidgetComponent],
      inputs: { task, ...inputs },
    });

  it('renders the task name and status badge', () => {
    const f = render(makeTask());
    expect(text(f, '.task-title')).toContain('Build report');
    expect(text(f, '.badge-status')).toContain('In Progress');
    expect(query(f, '.badge-status')?.getAttribute('data-status')).toBe('In Progress');
  });

  it('reflects the status on the status indicator bar', () => {
    const f = render(makeTask({ Status: 'Complete' }));
    expect(query(f, '.task-status-indicator')?.getAttribute('data-status')).toBe('Complete');
  });

  it('renders the type badge when a type is present', () => {
    expect(query(render(makeTask({ Type: 'Agent' })), '.badge-type')).not.toBeNull();
  });

  it('omits the type badge when there is no type', () => {
    expect(query(render(makeTask({ Type: undefined })), '.badge-type')).toBeNull();
  });

  it('renders the description when not compact', () => {
    const f = render(makeTask({ Description: 'Aggregate Q3 numbers' }));
    expect(text(f, '.task-description')).toContain('Aggregate Q3 numbers');
  });

  it('hides the description in compact mode', () => {
    const f = render(makeTask({ Description: 'Aggregate Q3 numbers' }), { compact: true });
    expect(query(f, '.task-description')).toBeNull();
  });

  it('renders the progress bar when showProgress and a percent are set', () => {
    const f = render(makeTask({ PercentComplete: 40 }), { showProgress: true });
    expect(query(f, '.task-progress-container')).not.toBeNull();
    expect((query(f, '.progress-fill') as HTMLElement).style.width).toBe('40%');
    expect(text(f, '.progress-text')).toContain('40%');
  });

  it('omits the progress bar when showProgress is false', () => {
    const f = render(makeTask({ PercentComplete: 40 }), { showProgress: false });
    expect(query(f, '.task-progress-container')).toBeNull();
  });

  it('renders the user and agent meta rows when set', () => {
    const f = render(makeTask({ User: 'Jane', Agent: 'Sage' }));
    const meta = text(f, '.task-meta');
    expect(meta).toContain('Jane');
    expect(meta).toContain('Sage');
  });

  it('applies the clickable class and emits taskClick when clickable', () => {
    const task = makeTask();
    const f = render(task, { clickable: true });
    expect(query(f, '.task-widget')?.classList.contains('clickable')).toBe(true);
    const spy = vi.fn();
    f.componentInstance.taskClick.subscribe(spy);
    (query(f, '.task-widget') as HTMLElement).click();
    expect(spy).toHaveBeenCalledWith(task);
  });

  it('does not emit taskClick when not clickable', () => {
    const f = render(makeTask(), { clickable: false });
    const spy = vi.fn();
    f.componentInstance.taskClick.subscribe(spy);
    (query(f, '.task-widget') as HTMLElement).click();
    expect(spy).not.toHaveBeenCalled();
  });
});
