import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ConversationEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { ExportService, ExportFormat, ExportOptions } from '../../services/export.service';
import { DialogService } from '../../services/dialog.service';
import { ToastService } from '../../services/toast.service';

@Component({
  standalone: false,
  selector: 'mj-export-modal',
  template: `
    @if (isVisible) {
      <kendo-dialog
        [title]="exportTitle"
        [width]="600"
        [height]="600"
        (close)="onCancel()">
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
        <kendo-dialog-actions>
          <button kendoButton [disabled]="isExporting" (click)="onCancel()">
            <i class="fa-solid fa-times"></i>
            Cancel
          </button>
          <button kendoButton [primary]="true" [disabled]="!canExport" (click)="onExport()">
            <i class="fa-solid fa-download"></i>
            Export
          </button>
        </kendo-dialog-actions>
      </kendo-dialog>
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
      color: #333;
    }

    .section-title i {
      color: #007bff;
    }

    .section-description {
      margin: 0 0 16px 0;
      color: #666;
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
      border: 2px solid #e0e0e0;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .format-option:hover {
      border-color: #007bff;
      background: #f8f9fa;
    }

    .format-option.selected {
      border-color: #007bff;
      background: #e3f2fd;
    }

    .format-option > i.fa-solid,
    .format-option > i.fas {
      font-size: 24px;
      color: #666;
      width: 32px;
      text-align: center;
    }

    .format-option.selected > i.fa-solid,
    .format-option.selected > i.fas {
      color: #007bff;
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
      color: #666;
    }

    .check-icon {
      font-size: 20px;
      color: #28a745;
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
      background: #f8f9fa;
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

    .checkbox-label small {
      margin-left: 28px;
      font-size: 12px;
      color: #666;
    }

    .format-specific-options {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #e0e0e0;
    }

    .subsection-title {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
      color: #555;
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #d32f2f;
      font-size: 13px;
      margin-top: 15px;
      padding: 10px 12px;
      background: #ffebee;
      border-left: 3px solid #d32f2f;
      border-radius: 4px;
    }

    .loading-indicator {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 15px;
      padding: 12px;
      background: #f8f9fa;
      border-radius: 4px;
      color: #666;
    }

    kendo-dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 15px 20px;
      border-top: 1px solid #e0e0e0;
    }

    kendo-dialog-actions button i {
      margin-right: 6px;
    }
  `]
})
export class ExportModalComponent {
  @Input() isVisible = false;
  @Input() conversation?: ConversationEntity;
  @Input() currentUser!: UserInfo;
  @Output() cancelled = new EventEmitter<void>();
  @Output() exported = new EventEmitter<void>();

  selectedFormat: ExportFormat | null = 'markdown';
  isExporting = false;
  errorMessage = '';

  exportOptions: ExportOptions = {
    includeMessages: true,
    includeMetadata: true,
    prettyPrint: true,
    includeCSS: true
  };

  get exportTitle(): string {
    return `Export: ${this.conversation?.Name || 'Conversation'}`;
  }

  get canExport(): boolean {
    return !this.isExporting &&
           !!this.selectedFormat &&
           (this.exportOptions.includeMessages === true);
  }

  formats = [
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

  constructor(
    private exportService: ExportService,
    private dialogService: DialogService,
    private toastService: ToastService
  ) {}

  selectFormat(format: ExportFormat): void {
    if (!this.isExporting) {
      this.selectedFormat = format;
    }
  }

  async onExport(): Promise<void> {
    if (!this.canExport || !this.conversation) {
      return;
    }

    if (!this.exportOptions.includeMessages) {
      this.errorMessage = 'At least "Include messages" must be selected';
      return;
    }

    this.isExporting = true;
    this.errorMessage = '';

    try {
      await this.exportService.exportConversation(
        this.conversation.ID,
        this.selectedFormat!,
        this.currentUser,
        this.exportOptions
      );

      this.toastService.success('Conversation exported successfully');
      this.exported.emit();
      this.resetForm();
    } catch (error) {
      console.error('Error exporting conversation:', error);
      this.errorMessage = error instanceof Error ? error.message : 'Failed to export conversation';
      this.toastService.error(this.errorMessage);
    } finally {
      this.isExporting = false;
    }
  }

  onCancel(): void {
    this.cancelled.emit();
    this.resetForm();
  }

  private resetForm(): void {
    this.selectedFormat = 'markdown';
    this.errorMessage = '';
    this.exportOptions = {
      includeMessages: true,
      includeMetadata: true,
      prettyPrint: true,
      includeCSS: true
    };
    this.isVisible = false;
  }
}
