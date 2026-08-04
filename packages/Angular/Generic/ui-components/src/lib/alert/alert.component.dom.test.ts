import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJAlertComponent } from './alert.component';

/**
 * DOM-level spec for `<mj-alert>`. Covers what only exists in the rendered
 * template/host: variant host classes (additive, don't clobber consumer
 * classes), the ARIA live role, the per-variant default icon + override,
 * and the dismiss behavior.
 *
 * Zoneless note: programmatic input state is set via `setInput` before
 * `detectChanges()` so the view is marked dirty the zoneless-correct way.
 */
describe('MJAlertComponent (DOM)', () => {
  function render(inputs: Record<string, unknown> = {}): ComponentFixture<MJAlertComponent> {
    const fixture = TestBed.createComponent(MJAlertComponent);
    for (const [k, v] of Object.entries(inputs)) {
      fixture.componentRef.setInput(k, v);
    }
    fixture.detectChanges();
    return fixture;
  }
  const host = (f: ComponentFixture<MJAlertComponent>) => f.nativeElement as HTMLElement;

  it('renders the message and the per-variant default icon', () => {
    const f = render({ Variant: 'error', Message: 'Boom' });
    expect(host(f).querySelector('.mj-alert__message')?.textContent?.trim()).toBe('Boom');
    expect(host(f).querySelector('.mj-alert__icon')?.className).toContain('fa-circle-exclamation');
  });

  it('applies the variant host class additively (does not clobber consumer classes)', () => {
    const f = render({ Variant: 'success' });
    host(f).classList.add('consumer-added'); // simulate a class set by the consumer
    f.detectChanges();
    expect(host(f).classList.contains('mj-alert--success')).toBe(true);
    expect(host(f).classList.contains('consumer-added')).toBe(true); // still there
  });

  it('sets role=alert for error/warning and role=status for info/success', () => {
    expect(host(render({ Variant: 'error' })).getAttribute('role')).toBe('alert');
    expect(host(render({ Variant: 'warning' })).getAttribute('role')).toBe('alert');
    expect(host(render({ Variant: 'info' })).getAttribute('role')).toBe('status');
    expect(host(render({ Variant: 'success' })).getAttribute('role')).toBe('status');
  });

  it('honors an explicit Role, and "" opts out of the live region', () => {
    expect(host(render({ Variant: 'error', Role: 'status' })).getAttribute('role')).toBe('status');
    expect(host(render({ Variant: 'error', Role: '' })).getAttribute('role')).toBeNull();
  });

  it('suppresses the icon when Icon=""', () => {
    expect(host(render({ Icon: '' })).querySelector('.mj-alert__icon')).toBeNull();
  });

  it('renders the dismiss button only when Dismissible, and dismissing emits + hides', () => {
    expect(host(render()).querySelector('.mj-alert__dismiss')).toBeNull();

    const f = render({ Dismissible: true, Message: 'x' });
    let emitted = false;
    f.componentInstance.Dismissed.subscribe(() => (emitted = true));

    const btn = host(f).querySelector('.mj-alert__dismiss') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    f.detectChanges();

    expect(emitted).toBe(true);
    expect(host(f).classList.contains('mj-alert--dismissed')).toBe(true); // host hidden via class
    expect(host(f).querySelector('.mj-alert__message')).toBeNull(); // content removed
  });

  it('applies the sm density class', () => {
    expect(host(render({ Size: 'sm' })).classList.contains('mj-alert--sm')).toBe(true);
  });
});

/**
 * Content projection (default body + [actions] slot) needs a host component.
 */
describe('MJAlertComponent projection (DOM)', () => {
  it('projects default content and [actions] into their slots', () => {
    @Component({
      standalone: true,
      imports: [MJAlertComponent],
      template: `
        <mj-alert Variant="info">
          <span class="host-body">read-only</span>
          <button class="host-action" actions>Request access</button>
        </mj-alert>
      `,
    })
    class HostComponent {}

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const body = el.querySelector('.host-body');
    const action = el.querySelector('.host-action');
    expect(body).not.toBeNull();
    expect(el.querySelector('.mj-alert__content')!.contains(body)).toBe(true);
    expect(el.querySelector('.mj-alert__actions')!.contains(action)).toBe(true);
  });
});
