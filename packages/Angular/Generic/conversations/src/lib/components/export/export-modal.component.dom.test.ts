import { describe, it, expect, vi } from 'vitest';
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJDialogComponent, MJDialogActionsComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { UserInfo } from '@memberjunction/core';
import type { MJConversationEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { ExportModalComponent } from './export-modal.component';
import { ExportService, ExportBranding } from '../../services/export.service';
import { DialogService } from '../../services/dialog.service';
import { ToastService } from '../../services/toast.service';

/**
 * DOM spec for <mj-export-modal>. The modal injects ExportService/DialogService/
 * ToastService but only touches them in the export/cancel handlers — the render is
 * pure @Input. This is the first spec to use the test-utils `providers` option to
 * supply stub services so the component can be constructed; the real <mj-dialog>
 * (standalone) is imported so its <ng-content> projection renders the body, and a
 * local stub stands in for the lazy <mj-loading>. Covers the visibility gating, the
 * four format options + default selection, the format-specific option branches, the
 * canExport gating on the Export button, the error branch, and the action outputs.
 */
@Component({ standalone: false, selector: 'mj-loading', template: '<span class="stub-loading">loading</span>' })
class StubLoadingComponent {}

describe('ExportModalComponent (DOM)', () => {
  const conversation = { ID: 'c1', Name: 'My Chat' } as unknown as MJConversationEntity;
  const currentUser = { ID: 'u1' } as unknown as UserInfo;

  const exportServiceStub = { exportConversation: vi.fn(() => Promise.resolve()) };
  const toastStub = { success: vi.fn(), error: vi.fn() };

  const render = (inputs: Record<string, unknown> = {}, setup?: (c: ExportModalComponent) => void) =>
    renderComponentFixture(ExportModalComponent, {
      imports: [CommonModule, FormsModule, MJDialogComponent, MJDialogActionsComponent, MJButtonDirective],
      declarations: [ExportModalComponent, StubLoadingComponent],
      providers: [
        { provide: ExportService, useValue: exportServiceStub },
        { provide: DialogService, useValue: {} },
        { provide: ToastService, useValue: toastStub },
      ],
      inputs: { isVisible: true, conversation, currentUser, ...inputs },
      setup,
    });

  it('renders nothing when not visible', () => {
    const f = render({ isVisible: false });
    expect(query(f, '.export-modal-content')).toBeNull();
  });

  it('renders the four export formats with markdown selected by default', () => {
    const f = render();
    const options = queryAll(f, '.format-option');
    expect(options.length).toBe(4);
    expect(text(f, '.format-options')).toContain('Markdown');
    // markdown is the first option and selected by default
    expect(options[0].classList.contains('selected')).toBe(true);
    expect(options[1].classList.contains('selected')).toBe(false);
  });

  it('does not show format-specific options for the default markdown format', () => {
    const f = render();
    expect(query(f, '.format-specific-options')).toBeNull();
  });

  it('shows JSON-specific options when the JSON format is selected', () => {
    const f = render();
    (queryAll(f, '.format-option')[1] as HTMLElement).click(); // JSON
    f.detectChanges();
    expect(queryAll(f, '.format-option')[1].classList.contains('selected')).toBe(true);
    expect(text(f, '.format-specific-options')).toContain('JSON Options');
  });

  it('shows HTML-specific options when the HTML format is selected', () => {
    const f = render();
    (queryAll(f, '.format-option')[2] as HTMLElement).click(); // HTML
    f.detectChanges();
    expect(text(f, '.format-specific-options')).toContain('HTML Options');
  });

  it('enables the Export button by default', () => {
    const f = render();
    expect((queryAll(f, 'mj-dialog-actions button')[1] as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables the Export button when messages are excluded', () => {
    const f = render({}, (c) => {
      c.exportOptions.includeMessages = false;
    });
    expect((queryAll(f, 'mj-dialog-actions button')[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders the error message when one is set', () => {
    const f = render({}, (c) => {
      c.errorMessage = 'Failed to export conversation';
    });
    expect(text(f, '.error-message')).toContain('Failed to export conversation');
  });

  it('emits cancelled when the Cancel button is clicked', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.cancelled.subscribe(spy);
    (queryAll(f, 'mj-dialog-actions button')[0] as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('invokes the export service with the chosen format and options on Export', () => {
    exportServiceStub.exportConversation.mockClear();
    const f = render();
    (queryAll(f, 'mj-dialog-actions button')[1] as HTMLButtonElement).click();
    expect(exportServiceStub.exportConversation).toHaveBeenCalledWith('c1', 'markdown', currentUser, expect.objectContaining({ includeMessages: true }));
  });

  describe('branding ("Include branding" checkbox)', () => {
    /** Mimic the runtime input order: branding is bound before visibility flips true
     *  (the isVisible setter defaults includeTheme from the branding present at open).
     *  Async because ngModel's initial model→view write is a microtask — the checkbox
     *  mounts on the HTML-format click and reflects `includeTheme` after whenStable. */
    const renderWithBranding = async (branding: ExportBranding | null) => {
      const f = render({ isVisible: false });
      f.componentRef.setInput('branding', branding);
      f.componentRef.setInput('isVisible', true);
      f.detectChanges();
      // Select the HTML format so the format-specific options render.
      (queryAll(f, '.format-option')[2] as HTMLElement).click();
      f.detectChanges();
      await f.whenStable();
      f.detectChanges();
      return f;
    };
    const themeCheckbox = (f: ReturnType<typeof render>) =>
      queryAll(f, '.format-specific-options input[type="checkbox"]')[1] as HTMLInputElement;

    it('renders unchecked for the HTML format when the host supplied no branding', async () => {
      const f = await renderWithBranding(null);
      expect(text(f, '.format-specific-options')).toContain('Include branding');
      expect(themeCheckbox(f).checked).toBe(false);
    });

    it('defaults checked when the host supplied export branding', async () => {
      const f = await renderWithBranding({ brandTokens: { '--mj-brand-primary': '#ff0000' } });
      expect(themeCheckbox(f).checked).toBe(true);
    });

    it('mentions the logo in the hint only when branding carries one', async () => {
      const withLogo = await renderWithBranding({ logoUrl: 'https://x/logo.png' });
      expect(text(withLogo, '.format-specific-options')).toContain('and logo');
    });

    it('threads branding + includeTheme through to the export service when checked', async () => {
      exportServiceStub.exportConversation.mockClear();
      const branding: ExportBranding = { brandTokens: { '--mj-brand-primary': '#ff0000' } };
      const f = await renderWithBranding(branding);
      (queryAll(f, 'mj-dialog-actions button')[1] as HTMLButtonElement).click();
      expect(exportServiceStub.exportConversation).toHaveBeenCalledWith(
        'c1',
        'html',
        currentUser,
        expect.objectContaining({ includeTheme: true, branding })
      );
    });

    it('unchecking "Include CSS styling" also turns branding off (no unstyled-logo leak)', async () => {
      exportServiceStub.exportConversation.mockClear();
      const f = await renderWithBranding({ brandTokens: { '--mj-brand-primary': '#ff0000' }, logoUrl: 'https://x/l.png' });
      const cssCheckbox = queryAll(f, '.format-specific-options input[type="checkbox"]')[0] as HTMLInputElement;
      cssCheckbox.click();
      f.detectChanges();
      expect(f.componentInstance.exportOptions.includeTheme).toBe(false);
      (queryAll(f, 'mj-dialog-actions button')[1] as HTMLButtonElement).click();
      expect(exportServiceStub.exportConversation).toHaveBeenCalledWith(
        'c1',
        'html',
        currentUser,
        expect.objectContaining({ includeCSS: false, includeTheme: false, branding: undefined })
      );
    });

    it('omits branding when the user unchecks the box', async () => {
      exportServiceStub.exportConversation.mockClear();
      const f = await renderWithBranding({ brandTokens: { '--mj-brand-primary': '#ff0000' } });
      themeCheckbox(f).click();
      f.detectChanges();
      (queryAll(f, 'mj-dialog-actions button')[1] as HTMLButtonElement).click();
      expect(exportServiceStub.exportConversation).toHaveBeenCalledWith(
        'c1',
        'html',
        currentUser,
        expect.objectContaining({ includeTheme: false, branding: undefined })
      );
    });
  });
});
