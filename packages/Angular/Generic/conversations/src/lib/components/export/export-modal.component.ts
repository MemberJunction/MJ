import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MJConversationEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { ExportService, ExportFormat, ExportOptions, ExportBranding } from '../../services/export.service';
import { DialogService } from '../../services/dialog.service';
import { ToastService } from '../../services/toast.service';

@Component({
  standalone: false,
  selector: 'mj-export-modal',
  template: `
    @if (isVisible) {
      <mj-dialog
        [Title]="exportTitle"
        [Width]="600"
        [Height]="600"
        [Visible]="true"
        (Close)="onCancel()">
        <div class="export-modal-content">
          <section class="format-section">
            <h3 class="section-title">
              <i class="fa-solid fa-file-export"></i>
              Export Format
            </h3>
            <p class="section-description">
              Choose a format to export this conversation:
            </p>
            <div class="format-options">
              @for (format of formats; track format.value) {
                <div
                  class="format-option"
                  [class.selected]="selectedFormat === format.value"
                  (click)="selectFormat(format.value)">
                  <i [class]="format.icon"></i>
                  <div class="format-details">
                    <div class="format-name">{{ format.name }}</div>
                    <div class="format-description">{{ format.description }}</div>
                  </div>
                  @if (selectedFormat === format.value) {
                    <i class="fa-solid fa-check-circle check-icon"></i>
                  }
                </div>
              }
            </div>
          </section>
          <section class="options-section">
            <h3 class="section-title">
              <i class="fa-solid fa-sliders"></i>
              Export Options
            </h3>
            <div class="option-checkboxes">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  [(ngModel)]="exportOptions.includeMessages"
                  [disabled]="isExporting">
                <span>Include messages</span>
                <small>Export all conversation messages</small>
              </label>
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  [(ngModel)]="exportOptions.includeMetadata"
                  [disabled]="isExporting">
                <span>Include metadata</span>
                <small>Add creation date, IDs, and other metadata</small>
              </label>
              <!-- Branding applies to EVERY format (HTML gets theme colors + logo +
                   footer; markdown/text/JSON get the title and attribution), so it
                   belongs here rather than under HTML Options. Shown for HTML even with
                   no host branding, because it still snapshots the app's theme. -->
              @if (selectedFormat === 'html' || branding) {
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    [(ngModel)]="exportOptions.includeTheme"
                    [disabled]="isExporting || (selectedFormat === 'html' && !exportOptions.includeCSS)">
                  <span>Include branding</span>
                  <small>{{ brandingHint }}</small>
                </label>
              }
            </div>
            @if (selectedFormat === 'json') {
              <div class="format-specific-options">
                <h4 class="subsection-title">JSON Options</h4>
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    [(ngModel)]="exportOptions.prettyPrint"
                    [disabled]="isExporting">
                  <span>Pretty print</span>
                  <small>Format JSON with indentation</small>
                </label>
              </div>
            }
            @if (selectedFormat === 'html') {
              <div class="format-specific-options">
                <h4 class="subsection-title">HTML Options</h4>
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    [(ngModel)]="exportOptions.includeCSS"
                    [disabled]="isExporting">
                  <span>Include CSS styling</span>
                  <small>Embed styles for better presentation</small>
                </label>
                <!-- Which palette gets baked in — NOT the mode the app happens to be in.
                     Exporting from a dark session would otherwise put dark text on the
                     export's white page. -->
                @if (exportOptions.includeTheme && exportOptions.includeCSS) {
                  <label class="checkbox-label">
                    <span>Theme</span>
                    <select
                      class="mj-input theme-mode-select"
                      [(ngModel)]="exportOptions.themeMode"
                      [disabled]="isExporting">
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                    <small>Palette baked into the exported file</small>
                  </label>
                }
              </div>
            }
          </section>
          @if (errorMessage) {
            <div class="error-message">
              <i class="fa-solid fa-exclamation-triangle"></i>
              {{ errorMessage }}
            </div>
          }
          @if (isExporting) {
            <div class="loading-indicator">
              <mj-loading text="Exporting conversation..." size="small"></mj-loading>
            </div>
          }
        </div>
        <mj-dialog-actions>
          <button mjButton [disabled]="isExporting" (click)="onCancel()">
            <i class="fa-solid fa-times"></i>
            Cancel
          </button>
          <button mjButton variant="primary" [disabled]="!canExport" (click)="onExport()">
            <i class="fa-solid fa-download"></i>
            Export
          </button>
        </mj-dialog-actions>
      </mj-dialog>
    }
    `,
  styles: [`
    .export-modal-content {
      padding: 20px;
      max-height: calc(600px - 120px);
      overflow-y: auto;
    }

    section {
      margin-bottom: 24px;
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .section-title i {
      color: var(--mj-brand-primary);
    }

    .section-description {
      margin: 0 0 16px 0;
      color: var(--mj-text-muted);
      font-size: 14px;
    }

    .format-options {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .format-option {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border: 2px solid var(--mj-border-strong);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      background: var(--mj-bg-surface-card);
    }

    .format-option:hover {
      border-color: var(--mj-brand-primary);
      background: var(--mj-bg-surface-sunken);
    }

    .format-option.selected {
      border-color: var(--mj-brand-primary);
      background: color-mix(in srgb, var(--mj-brand-primary) 20%, var(--mj-bg-surface-card));
    }

    .format-option > i.fa-solid,
    .format-option > i.fas {
      font-size: 24px;
      color: var(--mj-text-muted);
      width: 32px;
      text-align: center;
    }

    .format-option.selected > i.fa-solid,
    .format-option.selected > i.fas {
      color: var(--mj-brand-primary);
    }

    .format-details {
      flex: 1;
    }

    .format-name {
      font-weight: 500;
      font-size: 14px;
      margin-bottom: 2px;
    }

    .format-description {
      font-size: 12px;
      color: var(--mj-text-muted);
    }

    .check-icon {
      font-size: 20px;
      color: var(--mj-status-success);
    }

    .option-checkboxes {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .checkbox-label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      cursor: pointer;
      padding: 8px;
      border-radius: 4px;
      transition: background 0.2s;
    }

    .checkbox-label:hover {
      background: var(--mj-bg-surface-sunken);
    }

    .checkbox-label input[type="checkbox"] {
      margin-right: 8px;
      cursor: pointer;
    }

    .checkbox-label > span {
      display: inline-flex;
      align-items: center;
      font-size: 14px;
      font-weight: 500;
    }

    .checkbox-label input[type="checkbox"]:disabled {
      cursor: not-allowed;
    }

    .theme-mode-select {
      margin-left: 8px;
      padding: 2px 6px;
      font-size: 13px;
    }

    .checkbox-label small {
      margin-left: 28px;
      font-size: 12px;
      color: var(--mj-text-muted);
    }

    .format-specific-options {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--mj-border-default);
    }

    .subsection-title {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--mj-text-secondary);
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mj-status-error);
      font-size: 13px;
      margin-top: 15px;
      padding: 10px 12px;
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      border-left: 3px solid var(--mj-status-error);
      border-radius: 4px;
    }

    .loading-indicator {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 15px;
      padding: 12px;
      background: var(--mj-bg-surface-sunken);
      border-radius: 4px;
      color: var(--mj-text-muted);
    }

    mj-dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 15px 20px;
      border-top: 1px solid var(--mj-border-default);
    }

    mj-dialog-actions button i {
      margin-right: 6px;
    }
  `]
})
export class ExportModalComponent {
  private _isVisible = false;
  @Input()
  set IsVisible(value: boolean) {
    const opening = value && !this._isVisible;
    this._isVisible = value;
    if (opening) {
      // Fresh open: "Include branding" defaults ON only when the host explicitly
      // configured export branding — plain MJ Explorer keeps today's unthemed file.
      // NOTE this reads `branding`, so a host binding both in one change-detection
      // pass must bind [branding] FIRST (Angular sets inputs in template order).
      // chat-area's template does; a host mounting with isVisible already true and
      // branding bound after would get the checkbox defaulted off.
      this.ExportOptions.includeTheme = !!this.Branding;
    }
  }
  get IsVisible(): boolean {
    return this._isVisible;
  }

  /** @deprecated Use {@link IsVisible}. */
  get isVisible(): boolean {
    return this.IsVisible;
  }
  /** @deprecated Use {@link IsVisible}. */
  @Input() set isVisible(value: boolean) {
    this.IsVisible = value;
  }

  @Input() Conversation?: MJConversationEntity;

  /** @deprecated Use {@link Conversation}. */
  @Input() set conversation(value: MJConversationEntity | undefined) {
    this.Conversation = value;
  }
  /** @deprecated Use {@link Conversation}. */
  get conversation(): MJConversationEntity | undefined {
    return this.Conversation;
  }
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }
  /**
   * Host-supplied export branding (theme tokens / logo / title). When set, the
   * HTML format's "Include branding" checkbox defaults on and the branding is
   * passed to {@link ExportService} on export. See `ExportBranding`.
   */
  @Input() Branding: ExportBranding | null = null;

  /** @deprecated Use {@link Branding}. */
  @Input() set branding(value: ExportBranding | null) {
    this.Branding = value;
  }
  /** @deprecated Use {@link Branding}. */
  get branding(): ExportBranding | null {
    return this.Branding;
  }
  @Output() Cancelled = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Cancelled}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (cancelled) keeps working. Must stay AFTER Cancelled: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() cancelled = this.Cancelled;
  @Output() Exported = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Exported}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (exported) keeps working. Must stay AFTER Exported: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() exported = this.Exported;

  SelectedFormat: ExportFormat | null = 'markdown';

  /** @deprecated Use {@link SelectedFormat}. */
  get selectedFormat(): ExportFormat | null {
    return this.SelectedFormat;
  }
  /** @deprecated Use {@link SelectedFormat}. */
  set selectedFormat(value: ExportFormat | null) {
    this.SelectedFormat = value;
  }
  IsExporting = false;

  /** @deprecated Use {@link IsExporting}. */
  get isExporting() {
    return this.IsExporting;
  }
  /** @deprecated Use {@link IsExporting}. */
  set isExporting(value) {
    this.IsExporting = value;
  }
  ErrorMessage = '';

  /** @deprecated Use {@link ErrorMessage}. */
  get errorMessage() {
    return this.ErrorMessage;
  }
  /** @deprecated Use {@link ErrorMessage}. */
  set errorMessage(value) {
    this.ErrorMessage = value;
  }

  ExportOptions: ExportOptions = {
    includeMessages: true,
    includeMetadata: true,
    prettyPrint: true,
    includeCSS: true,
    includeTheme: false,
    themeMode: 'light'
  };

  /** @deprecated Use {@link ExportOptions}. */
  get exportOptions(): ExportOptions {
    return this.ExportOptions;
  }
  /** @deprecated Use {@link ExportOptions}. */
  set exportOptions(value: ExportOptions) {
    this.ExportOptions = value;
  }

  /** Format-aware hint under the "Include branding" checkbox. */
  get BrandingHint(): string {
    if (this.SelectedFormat === 'html') {
      if (!this.ExportOptions.includeCSS) {
        return 'Requires "Include CSS styling"';
      }
      return `Embed the app's theme colors${this.Branding?.logoUrl ? ', logo,' : ''} and attribution line`;
    }
    const logo = this.Branding?.logoUrl && this.SelectedFormat === 'markdown' ? ', logo,' : '';
    return `Add the title${logo} and attribution line`;
  }

  /** @deprecated Use {@link BrandingHint}. */
  get brandingHint(): string {
    return this.BrandingHint;
  }

  /**
   * The options actually handed to the service. `includeTheme` is the user's INTENT;
   * this resolves it against the selected format:
   *
   * - HTML with the stylesheet off cannot carry branding (a full-size unstyled logo and
   *   an unstyled footer would leak), so it drops.
   * - `includeCSS` is an HTML-only concern and must NOT decide anything for
   *   markdown / text / JSON — resolving here rather than mutating `includeTheme` is
   *   what keeps an HTML-format toggle from silently following the user into another
   *   format.
   */
  private resolveExportOptions(): ExportOptions {
    const unstyledHtml = this.SelectedFormat === 'html' && !this.ExportOptions.includeCSS;
    const brandingOn = !!this.ExportOptions.includeTheme && !unstyledHtml;
    return {
      ...this.ExportOptions,
      includeTheme: brandingOn,
      branding: brandingOn ? (this.Branding ?? undefined) : undefined
    };
  }

  get ExportTitle(): string {
    return `Export: ${this.Conversation?.Name || 'Conversation'}`;
  }

  /** @deprecated Use {@link ExportTitle}. */
  get exportTitle(): string {
    return this.ExportTitle;
  }

  get CanExport(): boolean {
    return !this.IsExporting &&
           !!this.SelectedFormat &&
           (this.ExportOptions.includeMessages === true);
  }

  /** @deprecated Use {@link CanExport}. */
  get canExport(): boolean {
    return this.CanExport;
  }

  Formats = [
    {
      value: 'markdown' as ExportFormat,
      name: 'Markdown',
      description: 'Formatted text with markdown syntax',
      icon: 'fa-solid fa-file-alt'
    },
    {
      value: 'json' as ExportFormat,
      name: 'JSON',
      description: 'Structured data format',
      icon: 'fa-solid fa-code'
    },
    {
      value: 'html' as ExportFormat,
      name: 'HTML',
      description: 'Web page format',
      icon: 'fa-solid fa-file-code'
    },
    {
      value: 'text' as ExportFormat,
      name: 'Plain Text',
      description: 'Simple text file',
      icon: 'fa-solid fa-file'
    }
  ];

  /** @deprecated Use {@link Formats}. */
  get formats() {
    return this.Formats;
  }
  /** @deprecated Use {@link Formats}. */
  set formats(value) {
    this.Formats = value;
  }

  constructor(
    private exportService: ExportService,
    private dialogService: DialogService,
    private toastService: ToastService
  ) {}

  SelectFormat(format: ExportFormat): void {
    if (!this.IsExporting) {
      this.SelectedFormat = format;
    }
  }

  /** @deprecated Use {@link SelectFormat}. */
  selectFormat(format: ExportFormat): void {
    return this.SelectFormat(format);
  }

  async OnExport(): Promise<void> {
    if (!this.CanExport || !this.Conversation) {
      return;
    }

    if (!this.ExportOptions.includeMessages) {
      this.ErrorMessage = 'At least "Include messages" must be selected';
      return;
    }

    this.IsExporting = true;
    this.ErrorMessage = '';

    try {
      await this.exportService.exportConversation(
        this.Conversation.ID,
        this.SelectedFormat!,
        this.CurrentUser,
        this.resolveExportOptions()
      );

      this.toastService.success('Conversation exported successfully');
      this.Exported.emit();
      this.resetForm();
    } catch (error) {
      console.error('Error exporting conversation:', error);
      this.ErrorMessage = error instanceof Error ? error.message : 'Failed to export conversation';
      this.toastService.error(this.ErrorMessage);
    } finally {
      this.IsExporting = false;
    }
  }

  /** @deprecated Use {@link OnExport}. */
  async onExport(): Promise<void> {
    return this.OnExport();
  }

  OnCancel(): void {
    this.Cancelled.emit();
    this.resetForm();
  }

  /** @deprecated Use {@link OnCancel}. */
  onCancel(): void {
    return this.OnCancel();
  }

  private resetForm(): void {
    this.SelectedFormat = 'markdown';
    this.ErrorMessage = '';
    this.ExportOptions = {
      includeMessages: true,
      includeMetadata: true,
      prettyPrint: true,
      includeCSS: true,
      includeTheme: !!this.Branding,
      themeMode: 'light'
    };
    this.IsVisible = false;
  }
}
