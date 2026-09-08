import { describe, it, expect } from 'vitest';
import { renderComponentFixture, renderTemplate, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { MJDialogComponent, MJDialogActionsComponent, MJDialogTitlebarComponent } from './dialog.component';

/**
 * DOM coverage for the mj-dialog family (dialog.component.ts) — the native-<dialog>-based modal that
 * replaced kendo-dialog (~54× across the app via its projected footer). Covers the main
 * MJDialogComponent behavior (Visible gating, title, close button / backdrop / escape → Close, the
 * Closeable gate, the Role aria attribute, size→width resolution) plus the two projection wrappers
 * (mj-dialog-actions footer, mj-dialog-titlebar).
 */

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJDialogComponent, { imports: [MJDialogComponent], inputs: { Visible: true, ...inputs } });
type Fx = ReturnType<typeof render>;

describe('MJDialogComponent (DOM)', () => {
  it('renders nothing when not visible', () => {
    expect(query(render({ Visible: false }), '.mj-dialog-backdrop')).toBeNull();
  });

  it('renders the backdrop + container with the title when visible', () => {
    const f = render({ Title: 'Confirm delete' });
    expect(query(f, '.mj-dialog-backdrop')).not.toBeNull();
    expect(query(f, '.mj-dialog-container')).not.toBeNull();
    expect(text(f, '.mj-dialog-title')).toBe('Confirm delete');
  });

  it('emits Close when the close button is clicked', () => {
    const f = render({ Title: 'X' });
    const out = capture(f.componentInstance.Close);
    (query(f, '.mj-dialog-close') as HTMLElement).click();
    expect(out.length).toBe(1);
  });

  it('emits Close on a backdrop click when Closeable', () => {
    const f = render();
    const out = capture(f.componentInstance.Close);
    (query(f, '.mj-dialog-backdrop') as HTMLElement).click();
    expect(out.length).toBe(1);
  });

  it('does not render the close button and ignores the backdrop when not Closeable', () => {
    const f = render({ Closeable: false });
    const out = capture(f.componentInstance.Close);
    expect(query(f, '.mj-dialog-close')).toBeNull();
    (query(f, '.mj-dialog-backdrop') as HTMLElement).click();
    expect(out.length).toBe(0);
  });

  it('emits Close on the Escape key when Closeable', () => {
    const f = render();
    const out = capture(f.componentInstance.Close);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(out.length).toBe(1);
  });

  it('ignores the Escape key when not Closeable', () => {
    const f = render({ Closeable: false });
    const out = capture(f.componentInstance.Close);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(out.length).toBe(0);
  });

  it('uses the dialog aria role by default', () => {
    expect(query(render(), '.mj-dialog-container')?.getAttribute('role')).toBe('dialog');
  });

  it('uses the alertdialog aria role when requested', () => {
    expect(query(render({ Role: 'alertdialog' }), '.mj-dialog-container')?.getAttribute('role')).toBe('alertdialog');
  });

  it('resolves the container width from an explicit Width', () => {
    expect((query(render({ Width: 720 }), '.mj-dialog-container') as HTMLElement).style.width).toBe('720px');
  });

  it('resolves the container width from a Size preset', () => {
    expect((query(render({ Size: 'sm' }), '.mj-dialog-container') as HTMLElement).style.width).toBe('400px');
  });

  it('projects body content and the actions footer', async () => {
    const f = await renderTemplate(
      `<mj-dialog [Visible]="true" Title="T"><p class="body-text">Body</p><mj-dialog-actions><button class="ok">OK</button></mj-dialog-actions></mj-dialog>`,
      { imports: [MJDialogComponent, MJDialogActionsComponent] },
    );
    expect(text(f, '.body-text')).toBe('Body');
    expect(query(f, '.mj-dialog-actions .ok')).not.toBeNull();
  });
});

describe('MJDialogActionsComponent (DOM)', () => {
  it('wraps and projects its action buttons', async () => {
    const f = await renderTemplate(
      `<mj-dialog-actions><button class="save">Save</button><button class="cancel">Cancel</button></mj-dialog-actions>`,
      { imports: [MJDialogActionsComponent] },
    );
    expect(query(f, '.mj-dialog-actions')).not.toBeNull();
    expect(queryAll(f, '.mj-dialog-actions button').map((b) => b.textContent?.trim())).toEqual(['Save', 'Cancel']);
  });
});

describe('MJDialogTitlebarComponent (DOM)', () => {
  it('projects custom titlebar content', async () => {
    const f = await renderTemplate(`<mj-dialog-titlebar><span class="ct">Custom</span></mj-dialog-titlebar>`, { imports: [MJDialogTitlebarComponent] });
    expect(text(f, '.ct')).toBe('Custom');
  });
});
