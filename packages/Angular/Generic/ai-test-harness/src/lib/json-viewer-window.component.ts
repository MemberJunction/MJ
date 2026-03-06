import { Component, Input } from '@angular/core';

@Component({
  standalone: false,
    selector: 'mj-json-viewer-window',
    template: `
        <div class="json-dialog-content">
            <div class="json-dialog-header">
                <button class="custom-button icon-only" (click)="copyJsonContent()" title="Copy JSON">
                    <i class="fa-solid fa-copy"></i>
                </button>
            </div>
            <div class="json-dialog-body">
                <mj-code-editor 
                    [(ngModel)]="jsonContent"
                    [readonly]="true"
                    [language]="'json'"
                    [lineWrapping]="true"
                    style="height: 100%; width: 100%;">
                </mj-code-editor>
            </div>
        </div>
    `,
    styles: [`
        .json-dialog-content {
            display: flex;
            flex-direction: column;
            height: 100%;
            background: white;
            overflow: hidden;
        }

        .json-dialog-header {
            padding: 12px 16px;
            background: #f8f9fa;
            border-bottom: 1px solid #dee2e6;
            display: flex;
            justify-content: flex-end;
            align-items: center;
            flex-shrink: 0;
        }

        .json-dialog-body {
            flex: 1;
            overflow: auto;
            padding: 0;
            position: relative;
            min-height: 0;
        }

        .custom-button {
            background: white;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            padding: 6px 12px;
            font-size: 13px;
            color: #495057;
            cursor: pointer;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-family: inherit;
        }

        .custom-button:hover:not(:disabled) {
            background: #f8f9fa;
            border-color: #adb5bd;
            color: #212529;
        }

        .custom-button.icon-only {
            padding: 6px 8px;
        }

        .custom-button i {
            font-size: 14px;
        }
    `]
})
export class JsonViewerWindowComponent {
    @Input() jsonContent: string = '';

    copyJsonContent() {
        if (this.jsonContent) {
            navigator.clipboard.writeText(this.jsonContent).then(() => {
                // Success - JSON copied
            }).catch((err) => {
                // Error copying
            });
        }
    }
}