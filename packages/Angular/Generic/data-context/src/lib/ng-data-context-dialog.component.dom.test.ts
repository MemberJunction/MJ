import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, text, click, capture, hasClass, createFakeProvider } from '@memberjunction/ng-test-utils';
import { DataContextModule } from './module';
import { DataContextDialogComponent } from './ng-data-context-dialog.component';

/**
 * DOM-level spec for <mj-data-context-dialog> — the presentational window wrapper.
 *
 * It renders a <mj-window> + titlebar and projects the data-bound <mj-data-context> child.
 * We import the whole DataContextModule so both the dialog and its child (plus the MJ UI
 * window/button components) are declared, and supply a fake Provider that returns no rows
 * (the child renders, but no backend is touched).
 */
describe('DataContextDialogComponent (DOM)', () => {
  function render(inputs: Record<string, unknown> = {}): ComponentFixture<DataContextDialogComponent> {
    return renderComponentFixture(DataContextDialogComponent, {
      imports: [DataContextModule],
      inputs: { dataContextId: 'dc-1', Provider: createFakeProvider({ runViewResults: [] }), ...inputs },
    });
  }

  it('renders the titlebar with just "Data Context" when no name is given', () => {
    const f = render();
    expect(text(f, '.window-title span')).toBe('Data Context');
  });

  it('appends the data context name to the title when provided', () => {
    const f = render({ dataContextName: 'Sales' });
    expect(text(f, '.window-title span')).toBe('Data Context: Sales');
  });

  it('emits dialogClosed when the close button is clicked', () => {
    const f = render();
    const closed = capture(f.componentInstance.dialogClosed);
    // the second window-action-btn is the close (xmark) button
    const buttons = Array.from(f.nativeElement.querySelectorAll('.window-action-btn')) as HTMLButtonElement[];
    expect(buttons.length).toBe(2);
    buttons[1].click();
    expect(closed).toHaveLength(1);
  });

  it('toggles the maximized class when the maximize button is clicked', () => {
    const f = render();
    expect(hasClass(f, '.data-context-window', 'maximized')).toBe(false);
    expect(f.componentInstance.isMaximized).toBe(false);

    // first window-action-btn is the maximize button
    click(f, '.window-action-btn');
    f.detectChanges();

    expect(f.componentInstance.isMaximized).toBe(true);
    expect(hasClass(f, '.data-context-window', 'maximized')).toBe(true);
  });

  it('renders the data-context child inside the dialog content', () => {
    const f = render();
    expect(query(f, '.dialog-content mj-data-context')).not.toBeNull();
  });
});
