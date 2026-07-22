import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text, typeInto, capture } from '@memberjunction/ng-test-utils';
import { PSConfirmModalComponent } from './ps-confirm-modal.component';

/**
 * DOM coverage for <ps-confirm-modal> — a standalone (self-importing) confirm modal with an optional
 * reason textarea, variant styling, busy state, and confirmed/cancelled outputs. No DI/async; single
 * synchronous render. data-testid hooks make the OK/Cancel/reason elements easy to target.
 */
const render = (inputs: Record<string, unknown> = {}) => renderComponentFixture(PSConfirmModalComponent, { inputs });

const ok = (f: ReturnType<typeof render>) => query(f, '[data-testid="ps-confirm-ok"]') as HTMLButtonElement;
const cancel = (f: ReturnType<typeof render>) => query(f, '[data-testid="ps-confirm-cancel"]') as HTMLButtonElement;

describe('PSConfirmModalComponent (DOM)', () => {
  it('renders the title and confirm label', () => {
    const fixture = render({ title: 'Delete model?', confirmLabel: 'Delete' });
    expect(text(fixture, '.ps-modal-head h3')).toBe('Delete model?');
    expect(ok(fixture).textContent).toContain('Delete');
  });

  it('applies the danger variant styling to the head', () => {
    expect(query(render({ variant: 'danger' }), '.ps-modal-head.danger')).not.toBeNull();
  });

  it('emits confirmed when the OK button is clicked', () => {
    const fixture = render();
    const confirmed = capture(fixture.componentInstance.confirmed);
    ok(fixture).click();
    expect(confirmed.length).toBe(1);
  });

  it('emits cancelled when the Cancel button is clicked', () => {
    const fixture = render();
    const cancelled = capture(fixture.componentInstance.cancelled);
    cancel(fixture).click();
    expect(cancelled.length).toBe(1);
  });

  it('shows the reason textarea only when showReason is true', () => {
    expect(query(render({ showReason: false }), '[data-testid="ps-confirm-reason"]')).toBeNull();
    expect(query(render({ showReason: true }), '[data-testid="ps-confirm-reason"]')).not.toBeNull();
  });

  it('disables the OK button when a required reason is empty', () => {
    expect(ok(render({ showReason: true, reasonRequired: true })).disabled).toBe(true);
  });

  it('disables both buttons while busy', () => {
    const fixture = render({ busy: true });
    expect(ok(fixture).disabled).toBe(true);
    expect(cancel(fixture).disabled).toBe(true);
  });

  it('cancels on backdrop click when not busy', () => {
    const fixture = render();
    const cancelled = capture(fixture.componentInstance.cancelled);
    (query(fixture, '[data-testid="ps-confirm-modal"]') as HTMLElement).click();
    expect(cancelled.length).toBe(1);
  });

  it('emits the trimmed reason with confirmed', () => {
    const fixture = render({ showReason: true });
    const confirmed = capture(fixture.componentInstance.confirmed);
    typeInto(fixture, '[data-testid="ps-confirm-reason"]', '  needs review  ');
    ok(fixture).click();
    expect(confirmed).toEqual(['needs review']);
  });
});
