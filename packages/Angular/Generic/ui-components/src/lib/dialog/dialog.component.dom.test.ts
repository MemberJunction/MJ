import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { renderComponentFixture, renderTemplate, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { MJDialogComponent, MJDialogActionsComponent, MJDialogTitlebarComponent } from './dialog.component';

/**
 * DOM coverage for the mj-dialog family (dialog.component.ts) — the native-<dialog>-based modal that
 * replaced kendo-dialog (~54× across the app via its projected footer). Covers the main
 * MJDialogComponent behavior (Visible gating, title, close button / backdrop / escape → Close, the
 * Closeable gate, the Role aria attribute, size→width resolution, focus entry / trap / return, and
 * AriaLabel when there is no Title) plus the two projection wrappers (mj-dialog-actions footer,
 * mj-dialog-titlebar).
 */

/**
 * Inputs, not plain fields: the harness is zoneless, so a later `detectChanges()` only refreshes a
 * view that `setInput` marked dirty. The opener sits outside the dialog so focus can return to it.
 */
@Component({
  standalone: true,
  imports: [MJDialogComponent, MJDialogActionsComponent],
  template: `
    <button type="button" class="opener">Open</button>
    <mj-dialog
      [Visible]="Visible"
      [Title]="Title"
      [Closeable]="Closeable"
      [AutoFocus]="AutoFocus"
      [TrapFocus]="TrapFocus"
      [RestoreFocus]="RestoreFocus"
      [AriaLabel]="AriaLabel"
      (Close)="onClose()">
      <button type="button" class="dead-btn" disabled>Nope</button>
      @if (ShowBodyButton) {
        <button type="button" class="body-btn" [disabled]="Disabled">Body</button>
      }
      @if (ShowFields) {
        <input class="dead" disabled />
        <input class="name" [disabled]="Disabled" />
        <input class="later" [disabled]="Disabled" [attr.data-autofocus]="PreferAutofocus ? '' : null" />
      }
      @if (ShowActions) {
        <mj-dialog-actions>
          <button type="button" class="ok" [disabled]="Disabled">OK</button>
        </mj-dialog-actions>
      }
    </mj-dialog>
  `,
})
class DialogFocusHostComponent {
  @Input() Visible = false;
  @Input() Title = 'Edit';
  @Input() Closeable = true;
  @Input() AutoFocus = true;
  @Input() TrapFocus = true;
  @Input() RestoreFocus = true;
  @Input() AriaLabel: string | null = null;
  @Input() Disabled = false;
  @Input() ShowFields = true;
  @Input() ShowBodyButton = true;
  @Input() ShowActions = true;
  @Input() PreferAutofocus = false;

  onClose(): void {
    this.Visible = false;
  }
}

/** Inner dialog is nested in the outer one. Closeable is off so its stops are exactly the two buttons. */
@Component({
  standalone: true,
  imports: [MJDialogComponent],
  template: `
    <mj-dialog [Visible]="true" [AutoFocus]="false" Title="Outer">
      <button type="button" class="outer-btn">Outer</button>
      <mj-dialog [Visible]="true" [Closeable]="false" [AutoFocus]="false">
        <button type="button" class="inner-first">First</button>
        <button type="button" class="inner-last">Last</button>
      </mj-dialog>
    </mj-dialog>
  `,
})
class NestedDialogHostComponent {}

/** Hidden controls must not be tab stops. One visible button is then both the first and the last. */
@Component({
  standalone: true,
  imports: [MJDialogComponent],
  template: `
    <mj-dialog [Visible]="true" [Closeable]="false" [AutoFocus]="false">
      <button type="button" class="shown">Shown</button>
      <button type="button" class="display-none" style="display: none">Display</button>
      <button type="button" class="attr-hidden" hidden>Hidden</button>
      <span style="visibility: hidden"><button type="button" class="visibility-hidden">Visibility</button></span>
      <div style="display: none"><button type="button" class="parent-none">Parent</button></div>
      <input type="hidden" class="input-hidden" />
      <button type="button" class="tabindex-none" tabindex="-1">Skip</button>
    </mj-dialog>
  `,
})
class HiddenStopHostComponent {}

/** A contenteditable region is a stop. contenteditable="false" is not. */
@Component({
  standalone: true,
  imports: [MJDialogComponent],
  template: `
    <mj-dialog [Visible]="true" [Closeable]="false" [AutoFocus]="false">
      <div class="frozen" contenteditable="false">Frozen</div>
      <div class="editor" contenteditable="true">Edit</div>
      <button type="button" class="after">After</button>
    </mj-dialog>
  `,
})
class EditableStopHostComponent {}

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJDialogComponent, { imports: [MJDialogComponent], inputs: { Visible: true, ...inputs } });
type Fx = ReturnType<typeof render>;

const renderHost = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(DialogFocusHostComponent, { imports: [DialogFocusHostComponent], inputs });

/** Initial focus is deferred one macrotask so `@if (Visible)` can insert the container. */
const flushMacrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const press = (el: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
};

const dialogOf = (f: ComponentFixture<unknown>): MJDialogComponent => {
  const match = f.debugElement.query(By.directive(MJDialogComponent));
  if (!match) throw new Error('mj-dialog was not rendered');
  return match.componentInstance as MJDialogComponent;
};

const openFrom = async (f: ReturnType<typeof renderHost>): Promise<HTMLButtonElement> => {
  const opener = query(f, '.opener') as HTMLButtonElement;
  opener.focus();
  f.componentRef.setInput('Visible', true);
  f.detectChanges();
  await flushMacrotask();
  return opener;
};

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

  it('names a title-less dialog with AriaLabel and does not set aria-labelledby', () => {
    const container = query(render({ AriaLabel: 'Edit record' }), '.mj-dialog-container');
    expect(container?.getAttribute('aria-label')).toBe('Edit record');
    expect(container?.getAttribute('aria-labelledby')).toBeNull();
    expect(container?.getAttribute('aria-modal')).toBe('true');
    expect(container?.getAttribute('role')).toBe('dialog');
  });

  it('keeps aria-labelledby and omits aria-label when Title is set', () => {
    const f = render({ Title: 'Confirm', AriaLabel: 'ignored' });
    const container = query(f, '.mj-dialog-container');
    const title = query(f, '.mj-dialog-title');
    expect(container?.getAttribute('aria-labelledby')).toBe(title?.id);
    expect(title?.id).toMatch(/^mj-dialog-title-/);
    expect(container?.getAttribute('aria-label')).toBeNull();
  });

  it('moves focus to the first field when opened from a button', async () => {
    const f = renderHost();
    await openFrom(f);
    // A disabled field and a body button both precede `.name`; neither is the initial stop.
    // The ✕ is earlier in the DOM and is not the initial stop either.
    expect(document.activeElement).toBe(query(f, '.name'));
  });

  it('prefers [data-autofocus] over the first field', async () => {
    const f = renderHost({ PreferAutofocus: true });
    await openFrom(f);
    expect(document.activeElement).toBe(query(f, '.later'));
  });

  it('focuses the first body button, not the close button, when there is no field', async () => {
    const f = renderHost({ ShowFields: false });
    await openFrom(f);
    expect(document.activeElement).toBe(query(f, '.body-btn'));
    expect(document.activeElement).not.toBe(query(f, '.mj-dialog-close'));
  });

  it('focuses the first action button when the body has no enabled button', async () => {
    const f = renderHost({ ShowFields: false, ShowBodyButton: false });
    await openFrom(f);
    expect(document.activeElement).toBe(query(f, '.ok'));
  });

  it('wraps Tab only at the ends and leaves a Tab between stops to the browser', async () => {
    const f = renderHost();
    await openFrom(f);
    const closeBtn = query(f, '.mj-dialog-close') as HTMLButtonElement;
    const bodyBtn = query(f, '.body-btn') as HTMLButtonElement;
    const ok = query(f, '.ok') as HTMLButtonElement;
    const container = query(f, '.mj-dialog-container') as HTMLElement;

    ok.focus();
    const fromLast = press(ok, 'Tab');
    expect(fromLast.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(closeBtn);

    closeBtn.focus();
    const fromFirstBack = press(closeBtn, 'Tab', { shiftKey: true });
    expect(fromFirstBack.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(ok);

    // jsdom does not move focus for an unprevented Tab, so staying put is the proof the dialog left it alone.
    bodyBtn.focus();
    const betweenBack = press(bodyBtn, 'Tab', { shiftKey: true });
    expect(betweenBack.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(bodyBtn);

    closeBtn.focus();
    const fromFirstForward = press(closeBtn, 'Tab');
    expect(fromFirstForward.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(closeBtn);

    container.focus();
    const fromContainer = press(container, 'Tab', { shiftKey: true });
    expect(fromContainer.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(ok);
  });

  it('leaves focus on the container when every control is disabled', async () => {
    const f = renderHost({ Disabled: true, Closeable: false });
    await openFrom(f);
    const container = query(f, '.mj-dialog-container') as HTMLElement;
    expect(document.activeElement).toBe(container);

    press(container, 'Tab');
    expect(document.activeElement).toBe(container);

    press(container, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(container);
  });

  it('emits Close on Escape and returns focus to the button that opened it', async () => {
    const f = renderHost();
    const opener = await openFrom(f);
    const closed = capture(dialogOf(f).Close);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toHaveLength(1);

    // The parent owns visibility; closing is what restores focus.
    f.componentRef.setInput('Visible', false);
    f.detectChanges();
    expect(document.activeElement).toBe(opener);
    expect(query(f, '.mj-dialog-backdrop')).toBeNull();
  });

  it('moves focus to the document body when the opener is no longer in the document', async () => {
    const opener = document.createElement('button');
    opener.type = 'button';
    document.body.appendChild(opener);
    try {
      const f = renderHost();
      opener.focus();
      f.componentRef.setInput('Visible', true);
      f.detectChanges();
      await flushMacrotask();
      opener.remove();

      f.componentRef.setInput('Visible', false);
      f.detectChanges();
      expect(document.activeElement).toBe(document.body);
    } finally {
      opener.remove();
    }
  });

  it('returns focus to the opener when destroyed while still open', async () => {
    const opener = document.createElement('button');
    opener.type = 'button';
    document.body.appendChild(opener);
    try {
      const f = renderHost();
      opener.focus();
      f.componentRef.setInput('Visible', true);
      f.detectChanges();
      await flushMacrotask();
      expect(document.activeElement).not.toBe(opener);

      f.destroy();
      expect(document.activeElement).toBe(opener);
    } finally {
      opener.remove();
    }
  });

  it('leaves focus on the opener when AutoFocus is off', async () => {
    const f = renderHost({ AutoFocus: false });
    const opener = await openFrom(f);
    expect(document.activeElement).toBe(opener);
  });

  it('does not cycle Tab when TrapFocus is off', async () => {
    const f = renderHost({ TrapFocus: false });
    await openFrom(f);
    const ok = query(f, '.ok') as HTMLButtonElement;
    ok.focus();
    press(ok, 'Tab');
    expect(document.activeElement).toBe(ok);
  });

  it('does not return focus when RestoreFocus is off', async () => {
    const f = renderHost({ RestoreFocus: false });
    const opener = await openFrom(f);
    f.componentRef.setInput('Visible', false);
    f.detectChanges();
    expect(document.activeElement).not.toBe(opener);
  });

  it('brings a Tab from outside the open dialog back to the first or last stop', async () => {
    const f = renderHost({ AutoFocus: false });
    const opener = await openFrom(f);
    expect(document.activeElement).toBe(opener);

    const forward = press(document.body, 'Tab');
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(query(f, '.mj-dialog-close'));

    opener.focus();
    const backward = press(document.body, 'Tab', { shiftKey: true });
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(query(f, '.ok'));
  });
});

describe('MJDialogComponent nested focus (DOM)', () => {
  it('lets the inner dialog wrap its own Tab and does not send it to the outer close button', async () => {
    const f = renderComponentFixture(NestedDialogHostComponent, { imports: [NestedDialogHostComponent] });
    await flushMacrotask();
    const outerClose = query(f, '.mj-dialog-close') as HTMLButtonElement;
    const innerFirst = query(f, '.inner-first') as HTMLButtonElement;
    const innerLast = query(f, '.inner-last') as HTMLButtonElement;

    innerFirst.focus();
    const between = press(innerFirst, 'Tab');
    expect(between.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(innerFirst);
    expect(document.activeElement).not.toBe(outerClose);

    innerLast.focus();
    const wrap = press(innerLast, 'Tab');
    expect(wrap.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(innerFirst);
    expect(document.activeElement).not.toBe(outerClose);
  });
});

describe('MJDialogComponent tab stops (DOM)', () => {
  it('does not treat hidden, disabled-looking, or tabindex=-1 controls as stops', async () => {
    const f = renderComponentFixture(HiddenStopHostComponent, { imports: [HiddenStopHostComponent] });
    await flushMacrotask();
    const shown = query(f, '.shown') as HTMLButtonElement;
    shown.focus();
    const wrap = press(shown, 'Tab');
    expect(wrap.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(shown);
  });

  it('treats contenteditable as a stop and skips contenteditable=false', async () => {
    const f = renderComponentFixture(EditableStopHostComponent, { imports: [EditableStopHostComponent] });
    await flushMacrotask();
    const editor = query(f, '.editor') as HTMLElement;
    const after = query(f, '.after') as HTMLButtonElement;
    after.focus();
    const wrap = press(after, 'Tab');
    expect(wrap.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(editor);
    expect(document.activeElement).not.toBe(query(f, '.frozen'));
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
