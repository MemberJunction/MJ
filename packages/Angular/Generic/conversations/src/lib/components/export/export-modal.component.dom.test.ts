import { describe, it, expect, vi } from 'vitest';
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJDialogComponent, MJDialogActionsComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { UserInfo } from '@memberjunction/core';
import type { MJConversationEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { ExportModalComponent } from './export-modal.component';
import { ExportService } from '../../services/export.service';
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
});
