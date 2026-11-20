import { describe, it, expect } from 'vitest';
import { Component } from '@angular/core';
import { renderComponentFixture, query, text, capture, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import { MjSlidePanelComponent } from './slide-panel.component';

/**
 * DOM coverage for <mj-slide-panel> — the right-edge slide-in / centered-dialog panel (used ~17×).
 * Animation timing: when visible it flips IsVisible on a microtask after ngOnInit, and Closed emits
 * after a 300ms CSS-transition timer — the specs flush those explicitly. Covers the slide vs dialog
 * rendering, the Title header + close button, projected body, and the close/backdrop → Closed path
 * with the CanClose guard.
 *
 * The open-state class is `sp-open`, never `visible` — see the comment in slide-panel.component.css
 * for why. Assert on `sp-open` here: a negative assertion against a class the template never emits
 * passes no matter what the component does, so a wrong name here buys silence, not coverage.
 */

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MjSlidePanelComponent, { imports: [MjSlidePanelComponent], inputs });

/** Render + flush the open microtask so IsVisible has settled, then re-render. */
async function renderOpen(inputs: Record<string, unknown> = {}) {
  const f = render(inputs);
  await tick(); // let ngOnInit's Promise.resolve().then(() => IsVisible = true) run
  f.detectChanges(false);
  return f;
}

describe('MjSlidePanelComponent (DOM)', () => {
  it('renders the slide panel visible by default (slide mode)', async () => {
    const f = await renderOpen({ Title: 'Details' });
    const panel = query(f, '.sp-panel');
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains('sp-open')).toBe(true);
    expect(query(f, '.sp-dialog')).toBeNull();
  });

  it('renders the centered dialog card in dialog mode', async () => {
    const f = await renderOpen({ Mode: 'dialog', Title: 'Confirm' });
    expect(query(f, '.sp-dialog')).not.toBeNull();
    expect(query(f, '.sp-panel')).toBeNull();
  });

  it('is not visible when Visible is false', async () => {
    const f = await renderOpen({ Visible: false, Title: 'Details' });
    expect(query(f, '.sp-panel')?.classList.contains('sp-open')).toBe(false);
    expect(query(f, '.sp-backdrop')?.classList.contains('sp-open')).toBe(false);
  });

  it('renders the Title header + close button when a Title is set', async () => {
    const withTitle = await renderOpen({ Title: 'Details' });
    expect(text(withTitle, '.sp-title')).toBe('Details');
    expect(query(withTitle, '.sp-close-btn')).not.toBeNull();
  });

  it('omits the header when no Title is set', async () => {
    const noTitle = await renderOpen({});
    expect(query(noTitle, '.sp-header')).toBeNull();
  });

  it('projects its body content', async () => {
    const f = render({ Title: 'X' });
    await tick();
    f.detectChanges(false);
    // body is rendered regardless of the visible animation flag
    expect(query(f, '.sp-body')).not.toBeNull();
  });

  it('emits Closed after the transition when the close button is clicked', async () => {
    const f = await renderOpen({ Title: 'Details' });
    const closed = capture(f.componentInstance.Closed);
    (query(f, '.sp-close-btn') as HTMLElement).click();
    await tick(320); // Closed.emit() fires on a 300ms timer
    expect(closed.length).toBe(1);
  });

  it('emits Closed when the backdrop is clicked', async () => {
    const f = await renderOpen({ Title: 'Details' });
    const closed = capture(f.componentInstance.Closed);
    (query(f, '.sp-backdrop') as HTMLElement).click();
    await tick(320);
    expect(closed.length).toBe(1);
  });

  it('does not close when CanClose returns false', async () => {
    const f = await renderOpen({ Title: 'Details', CanClose: () => false });
    const closed = capture(f.componentInstance.Closed);
    (query(f, '.sp-close-btn') as HTMLElement).click();
    await tick(320);
    expect(closed.length).toBe(0);
    f.detectChanges(false);
    expect(query(f, '.sp-panel')?.classList.contains('sp-open')).toBe(true);
  });
});

/** A page with a trigger button and a panel holding two controls. */
@Component({
  standalone: true,
  imports: [MjSlidePanelComponent],
  template: `
    <button type="button" class="opener" (click)="Open = true">Open</button>
    <mj-slide-panel [Visible]="Open" Title="Details" (Closed)="Open = false">
      <input class="first" aria-label="Name" />
      <button type="button" class="last">Save</button>
    </mj-slide-panel>
  `,
})
class SlidePanelHostComponent {
  Open = false;
}

describe('MjSlidePanelComponent — dialog semantics and focus (DOM, #5863)', () => {
  const press = (el: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(event);
    return event;
  };

  it('is a modal dialog named by its title, with a labelled close button', async () => {
    const f = await renderOpen({ Title: 'Details' });
    const panel = query(f, '.sp-panel') as HTMLElement;
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    const titleId = panel.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(query(f, `#${titleId}`)?.textContent?.trim()).toBe('Details');
    expect(query(f, '.sp-close-btn')?.getAttribute('aria-label')).toBe('Close');
  });

  it('is named by AriaLabel when it has no title, in dialog mode too', async () => {
    const f = await renderOpen({ Mode: 'dialog', AriaLabel: 'Edit record' });
    const dialog = query(f, '.sp-dialog') as HTMLElement;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Edit record');
    expect(dialog.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('is inert while closed', async () => {
    const f = await renderOpen({ Visible: false, Title: 'Details' });
    expect(query(f, '.sp-panel')?.hasAttribute('inert')).toBe(true);
  });

  it('has no axe violations when open', async () => {
    const f = await renderOpen({ Title: 'Details' });
    await ExpectNoAxeViolations(f);
  });

  it('moves focus in on open, wraps Tab at both ends, and returns focus on close', async () => {
    const f = renderComponentFixture(SlidePanelHostComponent, { imports: [SlidePanelHostComponent] });
    const opener = query(f, '.opener') as HTMLButtonElement;
    opener.focus();
    opener.click();
    f.detectChanges();
    await tick();
    f.detectChanges();

    const first = query(f, '.first') as HTMLInputElement;
    const last = query(f, '.last') as HTMLButtonElement;
    const close = query(f, '.sp-close-btn') as HTMLButtonElement;
    expect(document.activeElement).toBe(first);

    last.focus();
    expect(press(last, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);

    expect(press(close, 'Tab', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    close.click();
    f.detectChanges();
    expect(document.activeElement).toBe(opener);
  });

  it('ignores Escape while closed', async () => {
    const f = await renderOpen({ Visible: false, Title: 'Details' });
    const closed = capture(f.componentInstance.Closed);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(320);
    expect(closed.length).toBe(0);
  });
});
