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
        <button kendoButton (click)="cancel()" [themeColor]="'base'">
          Cancel
        </button>
        <button kendoButton (click)="import()" [themeColor]="'primary'" [disabled]="!componentJson">
          <i class="fa-solid fa-file-import"></i> Import
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
      color: #333;
    }
    
    .dialog-header p {
      margin: 0;
      color: #666;
      font-size: 14px;
    }
    
    .editor-container {
      flex: 1;
      border: 1px solid #ddd;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 15px;
    }
    
    .error-message {
      background-color: #fff5f5;
      border: 1px solid #feb2b2;
      color: #c53030;
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
      border-top: 1px solid #e0e0e0;
    }
  `]
})
export class TextImportDialogComponent {
  @Output() importSpec = new EventEmitter<ComponentSpec>();
  @Output() cancelDialog = new EventEmitter<void>();
  
  public componentJson = '';
  public errorMessage = '';
  
  public import(): void {
    this.errorMessage = '';
    
    if (!this.componentJson.trim()) {
      this.errorMessage = 'Please enter a component specification';
      return;
    }
    
    try {
      const spec = JSON.parse(this.componentJson) as ComponentSpec;
      
      // Validate required fields
      if (!spec.name || !spec.code) {
        this.errorMessage = 'Invalid specification: missing required fields (name and code)';
        return;
      }
      
      // Emit the parsed spec
      this.importSpec.emit(spec);
    } catch (error) {
      this.errorMessage = 'Invalid JSON format. Please check your syntax.';
    }
  }
  
  public cancel(): void {
    this.cancelDialog.emit();
  }
}