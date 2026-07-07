import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { ClassifyNoContentTypeWarningComponent } from './no-content-type-warning.dialog.component';

/**
 * DOM coverage for <classify-no-content-type-warning> — a pure presentational warning overlay gated
 * on `Show`, emitting `GoToTypes` / `Dismissed`. No DI/async: single synchronous render.
 * Note: the "Go to Content Types" button fires on (mousedown), not click.
 */
const render = (Show: boolean) =>
  renderComponentFixture(ClassifyNoContentTypeWarningComponent, {
    declarations: [ClassifyNoContentTypeWarningComponent],
    inputs: { Show },
  });

const btnByText = (fixture: ReturnType<typeof render>, label: string) =>
  queryAll(fixture, 'button').find((b) => b.textContent?.includes(label)) as HTMLElement;

describe('ClassifyNoContentTypeWarningComponent (DOM)', () => {
  it('renders nothing when Show is false', () => {
    expect(query(render(false), '.at-schedule-dialog-overlay')).toBeNull();
  });

  it('renders the warning dialog with its heading when Show is true', () => {
    const fixture = render(true);
    expect(query(fixture, '.at-schedule-dialog')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Content Type Required');
  });

  it('emits GoToTypes on the primary button mousedown', () => {
    const fixture = render(true);
    const goto = capture(fixture.componentInstance.GoToTypes);
    btnByText(fixture, 'Go to Content Types').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(goto.length).toBe(1);
  });

  it('emits Dismissed when the Close button is clicked', () => {
    const fixture = render(true);
    const dismissed = capture(fixture.componentInstance.Dismissed);
    btnByText(fixture, 'Close').click();
    expect(dismissed.length).toBe(1);
  });

  it('emits Dismissed when the overlay backdrop is clicked', () => {
    const fixture = render(true);
    const dismissed = capture(fixture.componentInstance.Dismissed);
    (query(fixture, '.at-schedule-dialog-overlay') as HTMLElement).click();
    expect(dismissed.length).toBe(1);
  });
});
