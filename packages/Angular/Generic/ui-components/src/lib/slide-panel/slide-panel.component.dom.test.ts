import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text, capture } from '@memberjunction/ng-test-utils';
import { MjSlidePanelComponent } from './slide-panel.component';

/**
 * DOM coverage for <mj-slide-panel> — the right-edge slide-in / centered-dialog panel (used ~17×).
 * Animation timing: when visible it flips IsVisible on a microtask after ngOnInit, and Closed emits
 * after a 300ms CSS-transition timer — the specs flush those explicitly. Covers the slide vs dialog
 * rendering, the Title header + close button, projected body, and the close/backdrop → Closed path
 * with the CanClose guard.
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
    expect(panel?.classList.contains('visible')).toBe(true);
    expect(query(f, '.sp-dialog')).toBeNull();
  });

  it('renders the centered dialog card in dialog mode', async () => {
    const f = await renderOpen({ Mode: 'dialog', Title: 'Confirm' });
    expect(query(f, '.sp-dialog')).not.toBeNull();
    expect(query(f, '.sp-panel')).toBeNull();
  });

  it('is not visible when Visible is false', async () => {
    const f = await renderOpen({ Visible: false, Title: 'Details' });
    expect(query(f, '.sp-panel')?.classList.contains('visible')).toBe(false);
    expect(query(f, '.sp-backdrop')?.classList.contains('visible')).toBe(false);
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
    expect(query(f, '.sp-panel')?.classList.contains('visible')).toBe(true);
  });
});
