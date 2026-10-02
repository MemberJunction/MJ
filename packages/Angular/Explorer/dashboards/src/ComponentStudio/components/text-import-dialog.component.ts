import { Component, EventEmitter, Output } from '@angular/core';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

@Component({
  standalone: false,
  selector: 'app-text-import-dialog',
  template: `
    <div class="text-import-dialog-content">
      <div class="dialog-header">
        <h3>Import Component from Text</h3>
        <p>Paste or type your component specification JSON below:</p>
      </div>
      
      <div class="editor-container">
        <mj-code-editor
          [(ngModel)]="componentJson"
          [language]="'json'"
          [autoFocus]="true"
          [indentWithTab]="true"
          [readonly]="false"
          [placeholder]="'Paste your component specification JSON here...'"
          style="height: 400px;">
        </mj-code-editor>
      </div>
      
      @if (errorMessage) {
        <div class="error-message">
          <i class="fa-solid fa-exclamation-triangle"></i>
          {{ errorMessage }}
        </div>
      }
      
      <div class="dialog-actions">
        <button mjButton (click)="import()" variant="primary" [disabled]="!componentJson">
          <i class="fa-solid fa-file-import"></i> Import
        </button>
        <button mjButton (click)="cancel()">
          Cancel
        </button>
      </div>
    </div>
  `,
  styles: [`
    .text-import-dialog-content {
      padding: 20px;
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .dialog-header {
      margin-bottom: 15px;
    }

    .dialog-header h3 {
      margin: 0 0 10px 0;
      color: var(--mj-text-primary);
    }

    .dialog-header p {
      margin: 0;
      color: var(--mj-text-secondary);
      font-size: 14px;
    }

    .editor-container {
      flex: 1;
      border: 1px solid var(--mj-border-default);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 15px;
    }

    .error-message {
      background-color: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      border: 1px solid var(--mj-status-error);
      color: var(--mj-status-error);
      padding: 10px;
      border-radius: 4px;
      margin-bottom: 15px;
      font-size: 14px;
    }

    .error-message i {
      margin-right: 8px;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding-top: 15px;
      border-top: 1px solid var(--mj-border-default);
    }
  `]
})
export class TextImportDialogComponent {
  @Output() ImportSpec = new EventEmitter<ComponentSpec>();

  /**
   * @deprecated Use {@link ImportSpec}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (importSpec) keeps working. Must stay AFTER ImportSpec: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() importSpec = this.ImportSpec;
  @Output() CancelDialog = new EventEmitter<void>();

  /**
   * @deprecated Use {@link CancelDialog}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (cancelDialog) keeps working. Must stay AFTER CancelDialog: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() cancelDialog = this.CancelDialog;
  
  public ComponentJson = '';

  /** @deprecated Use {@link ComponentJson}. */
  public get componentJson() {
    return this.ComponentJson;
  }
  /** @deprecated Use {@link ComponentJson}. */
  public set componentJson(value) {
    this.ComponentJson = value;
  }
  public ErrorMessage = '';

  /** @deprecated Use {@link ErrorMessage}. */
  public get errorMessage() {
    return this.ErrorMessage;
  }
  /** @deprecated Use {@link ErrorMessage}. */
  public set errorMessage(value) {
    this.ErrorMessage = value;
  }
  
  public Import(): void {
    this.ErrorMessage = '';
    
    if (!this.ComponentJson.trim()) {
      this.ErrorMessage = 'Please enter a component specification';
      return;
    }
    
    try {
      const spec = JSON.parse(this.ComponentJson) as ComponentSpec;
      
      // Validate required fields
      if (!spec.name || !spec.code) {
        this.ErrorMessage = 'Invalid specification: missing required fields (name and code)';
        return;
      }
      
      // Emit the parsed spec
      this.ImportSpec.emit(spec);
    } catch (error) {
      this.ErrorMessage = 'Invalid JSON format. Please check your syntax.';
    }
  }

  /** @deprecated Use {@link Import}. */
  public import(): void {
    return this.Import();
  }
  
  public Cancel(): void {
    this.CancelDialog.emit();
  }

  /** @deprecated Use {@link Cancel}. */
  public cancel(): void {
    return this.Cancel();
  }
}