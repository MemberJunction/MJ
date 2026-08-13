import { describe, it, expect } from 'vitest';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { ActionPinConfigDialogComponent } from './action-pin-config-dialog.component';

/**
 * DOM coverage for <mj-action-pin-config-dialog> — a Visible-gated "pin an action" config dialog.
 * ngOnChanges (on Visible->true) seeds DisplayName from ActionName; the live preview reflects it;
 * Save (guarded by CanSave) and Cancel emit Result. FormsModule for ngModel. Single sync render.
 */

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(ActionPinConfigDialogComponent, {
    imports: [FormsModule],
    declarations: [ActionPinConfigDialogComponent],
    inputs: { Visible: true, ActionID: 'a1', ActionName: 'Run Report', ActionDescription: null, ...inputs },
  });

const saveBtn = (f: ReturnType<typeof render>) => query(f, '.apc-footer .apc-btn.primary') as HTMLButtonElement;

describe('ActionPinConfigDialogComponent (DOM)', () => {
  it('renders nothing when not visible', () => {
    expect(query(render({ Visible: false }), '.apc-dialog')).toBeNull();
  });

  it('renders the Pin Action header and the action chip', () => {
    const fixture = render();
    expect(query(fixture, '.apc-header h3')?.textContent).toContain('Pin Action');
    expect(text(fixture, '.apc-action-chip')).toContain('Run Report');
  });

  it('seeds the live-preview title from the action name', () => {
    expect(text(render(), '.apc-preview-title')).toBe('Run Report');
  });

  it('enables Save when a display name is present', () => {
    expect(saveBtn(render()).disabled).toBe(false);
  });

  it('emits Result({Action:"cancel"}) on backdrop click', () => {
    const fixture = render();
    const result = capture(fixture.componentInstance.Result);
    (query(fixture, '.apc-backdrop') as HTMLElement).click();
    expect(result).toEqual([{ Action: 'cancel' }]);
  });

  it('emits a non-cancel Result carrying the display name when Save is clicked', () => {
    const fixture = render();
    const result = capture(fixture.componentInstance.Result);
    saveBtn(fixture).click();
    expect(result.length).toBe(1);
    const emitted = result[0] as { Action: string; Pin?: { DisplayName: string } };
    expect(emitted.Action).toBe('save');
    expect(emitted.Pin?.DisplayName).toBe('Run Report');
  });
});
