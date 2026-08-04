import { describe, it, expect, vi } from 'vitest';
import { of } from 'rxjs';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { ToastComponent } from './toast.component';
import { ToastService, Toast } from '../../services/toast.service';

/**
 * DOM spec for <mj-toast>. The component has no @Inputs — it renders the toast list
 * it receives from ToastService.toasts$ in ngOnInit. We provide a stub service whose
 * stream emits a fixed list (via the new test-utils `providers` option) and
 * provideNoopAnimations() to satisfy the @slideIn trigger without a real animation
 * engine. Covers per-toast rendering, the type → CSS class + icon mapping, and the
 * close button → service.dismiss wiring.
 */
describe('ToastComponent (DOM)', () => {
  const toasts: Toast[] = [
    { id: 't1', message: 'Saved!', type: 'success', duration: 3000, timestamp: 1 },
    { id: 't2', message: 'Something broke', type: 'error', duration: 3000, timestamp: 2 },
  ];

  const dismiss = vi.fn();

  const render = (list: Toast[] = toasts) =>
    renderComponentFixture(ToastComponent, {
      declarations: [ToastComponent],
      providers: [provideNoopAnimations(), { provide: ToastService, useValue: { toasts$: of(list), dismiss } }],
    });

  it('renders one toast per item in the stream', () => {
    const f = render();
    expect(queryAll(f, '.toast').length).toBe(2);
  });

  it('renders nothing when the stream is empty', () => {
    const f = render([]);
    expect(query(f, '.toast')).toBeNull();
  });

  it('renders each toast message', () => {
    const f = render();
    const messages = queryAll(f, '.toast-message').map((m) => m.textContent?.trim());
    expect(messages).toEqual(['Saved!', 'Something broke']);
  });

  it('applies the per-type CSS class', () => {
    const f = render();
    const items = queryAll(f, '.toast');
    expect(items[0].classList.contains('toast-success')).toBe(true);
    expect(items[1].classList.contains('toast-error')).toBe(true);
  });

  it('renders the success icon for a success toast', () => {
    const f = render([toasts[0]]);
    expect(query(f, '.toast-icon')?.classList.contains('fa-circle-check')).toBe(true);
  });

  it('calls the service dismiss with the toast id when the close button is clicked', () => {
    dismiss.mockClear();
    const f = render([toasts[0]]);
    (query(f, 'button.toast-close') as HTMLButtonElement).click();
    expect(dismiss).toHaveBeenCalledWith('t1');
  });
});
