import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageModule } from 'primeng/message';
import { MessagesModule } from 'primeng/messages';
import { ToastModule } from 'primeng/toast';
import { FileUploadModule } from 'primeng/fileupload';
import { ButtonModule } from 'primeng/button';
import { MessageService, Message } from 'primeng/api';

@Component({
    selector: 'app-messages',
    standalone: true,
    imports: [
        CommonModule,
        MessageModule,
        MessagesModule,
        ToastModule,
        FileUploadModule,
        ButtonModule
    ],
    providers: [MessageService],
    template: `
    <div class="messages-page">
        <!-- Toast (must be placed once in the template) -->
        <p-toast></p-toast>

        <!-- Inline Message Section -->
        <section class="token-section">
            <h2>Message (Inline)</h2>
            <p class="section-desc">Static inline messages for contextual feedback. Each severity maps to MJ status tokens for consistent semantic coloring.</p>
            <p class="token-mapping">success: --mj-status-success-* | info: --mj-status-info-* | warn: --mj-status-warning-* | error: --mj-status-error-*</p>

            <div class="mj-grid mj-flex-column mj-gap-3">
                <p-message severity="success" text="Operation completed successfully."></p-message>
                <p-message severity="info" text="This is an informational message."></p-message>
                <p-message severity="warn" text="Please review the highlighted fields before continuing."></p-message>
                <p-message severity="error" text="An error occurred while saving the record."></p-message>
            </div>
        </section>

        <!-- Messages (Closeable List) Section -->
        <section class="token-section">
            <h2>Messages (Closeable List)</h2>
            <p class="section-desc">A list of closeable messages. Users can dismiss individual items. Useful for validation summaries or batch operation results.</p>

            <p-messages [value]="Messages" [closable]="true"></p-messages>

            <div class="mj-grid mj-gap-3 mj-align-center component-row" style="margin-top: var(--mj-space-3);">
                <button pButton label="Reset Messages" icon="pi pi-refresh" class="p-button-outlined p-button-sm" (click)="ResetMessages()"></button>
            </div>
        </section>

        <!-- Toast Section -->
        <section class="token-section">
            <h2>Toast</h2>
            <p class="section-desc">Non-blocking notification popups triggered programmatically via MessageService. Toasts appear in the top-right corner and auto-dismiss after 3 seconds.</p>

            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <button pButton label="Success" icon="pi pi-check" class="p-button-success" (click)="ShowSuccess()"></button>
                <button pButton label="Info" icon="pi pi-info-circle" class="p-button-primary" (click)="ShowInfo()"></button>
                <button pButton label="Warning" icon="pi pi-exclamation-triangle" class="p-button-warning" (click)="ShowWarn()"></button>
                <button pButton label="Error" icon="pi pi-times" class="p-button-danger" (click)="ShowError()"></button>
            </div>

            <h3 class="subsection-title">Sticky Toast</h3>
            <p class="subsection-desc">Sticky toasts remain visible until manually dismissed by the user.</p>
            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <button pButton label="Sticky Toast" icon="pi pi-thumbtack" class="p-button-secondary" (click)="ShowSticky()"></button>
                <button pButton label="Clear All" icon="pi pi-times-circle" class="p-button-text" (click)="ClearToasts()"></button>
            </div>
        </section>

        <!-- FileUpload Section -->
        <section class="token-section">
            <h2>FileUpload</h2>
            <p class="section-desc">File upload component with drag-and-drop support. Demonstrated in both basic and advanced modes. No backend is configured, so uploads will not transmit.</p>

            <h3 class="subsection-title">Basic Mode</h3>
            <p class="subsection-desc">Single-file selection with a simple choose button.</p>
            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <p-fileUpload
                    mode="basic"
                    chooseLabel="Choose File"
                    chooseIcon="pi pi-upload"
                    url=""
                    [auto]="false">
                </p-fileUpload>
            </div>

            <h3 class="subsection-title">Advanced Mode</h3>
            <p class="subsection-desc">Drag-and-drop zone with file list, progress, and multi-file support.</p>
            <p-fileUpload
                url=""
                [multiple]="true"
                [maxFileSize]="5000000"
                accept="image/*,.pdf,.doc,.docx"
                chooseLabel="Browse"
                chooseIcon="pi pi-folder-open"
                [showUploadButton]="true"
                [showCancelButton]="true">
                <ng-template pTemplate="empty">
                    <div class="mj-grid mj-flex-column mj-align-center mj-justify-center mj-gap-2 upload-empty-state">
                        <i class="pi pi-cloud-upload upload-empty-icon"></i>
                        <p>Drag and drop files here to upload.</p>
                        <p class="upload-hint">Accepts images, PDFs, and Word documents up to 5 MB each.</p>
                    </div>
                </ng-template>
            </p-fileUpload>
        </section>
    </div>
  `,
    styles: [`
    .messages-page {
        max-width: 900px;
    }

    .token-section {
        margin-bottom: var(--mj-space-10);
    }

    .token-section h2 {
        font-size: var(--mj-text-2xl);
        font-weight: var(--mj-font-bold);
        color: var(--mj-text-primary);
        margin: 0 0 var(--mj-space-2) 0;
    }

    .section-desc {
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        margin: 0 0 var(--mj-space-2) 0;
        line-height: var(--mj-leading-relaxed);
    }

    .token-mapping {
        font-family: var(--mj-font-family-mono);
        font-size: 11px;
        color: var(--mj-text-muted);
        margin: 0 0 var(--mj-space-5) 0;
    }

    .subsection-title {
        font-size: var(--mj-text-base);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-primary);
        margin: var(--mj-space-5) 0 var(--mj-space-1) 0;
    }

    .subsection-desc {
        font-family: var(--mj-font-family-mono);
        font-size: var(--mj-text-xs);
        color: var(--mj-text-muted);
        margin: 0 0 var(--mj-space-3) 0;
    }

    .component-row {
        margin-bottom: var(--mj-space-4);
    }

    /* FileUpload empty state */
    .upload-empty-state {
        padding: var(--mj-space-8) var(--mj-space-4);
        color: var(--mj-text-secondary);
        text-align: center;
    }

    .upload-empty-icon {
        font-size: var(--mj-text-4xl);
        color: var(--mj-text-muted);
        margin-bottom: var(--mj-space-3);
    }

    .upload-empty-state p {
        margin: 0;
        font-size: var(--mj-text-sm);
        line-height: var(--mj-leading-relaxed);
    }

    .upload-hint {
        font-size: var(--mj-text-xs);
        color: var(--mj-text-muted);
        margin-top: var(--mj-space-1);
    }
  `]
})
export class MessagesComponent {
    Messages: Message[] = [
        { severity: 'success', summary: 'Confirmed', detail: 'Record saved successfully' },
        { severity: 'info', summary: 'Info', detail: 'New version available for deployment' },
        { severity: 'warn', summary: 'Warning', detail: '3 fields require attention before publishing' },
        { severity: 'error', summary: 'Error', detail: 'Unable to connect to the database server' }
    ];

    private defaultMessages: Message[] = [...this.Messages];

    constructor(private messageService: MessageService) {}

    ShowSuccess() {
        this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Operation completed successfully'
        });
    }

    ShowInfo() {
        this.messageService.add({
            severity: 'info',
            summary: 'Info',
            detail: 'Process is running in the background'
        });
    }

    ShowWarn() {
        this.messageService.add({
            severity: 'warn',
            summary: 'Warning',
            detail: 'Disk usage is above 85%'
        });
    }

    ShowError() {
        this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to fetch data from the server'
        });
    }

    ShowSticky() {
        this.messageService.add({
            severity: 'info',
            summary: 'Sticky',
            detail: 'This toast will remain until you dismiss it',
            sticky: true
        });
    }

    ClearToasts() {
        this.messageService.clear();
    }

    ResetMessages() {
        this.Messages = [...this.defaultMessages];
    }
}
