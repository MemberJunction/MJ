import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { Connection, BooleanCondition, COMMON_CONDITIONS } from '../../models/connection.model';

@Component({
  selector: 'app-simple-condition-editor',
  template: `
    <div class="condition-editor">
      <div class="editor-header">
        <h3>Edit Condition</h3>
        <button class="close-button" (click)="onCancel()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <div class="editor-content">
        <div class="condition-section">
          <label>When:</label>
          <kendo-dropdownlist
            [data]="commonConditions"
            [(value)]="selectedCondition"
            textField="label"
            valueField="expression"
            [valuePrimitive]="false"
            [style.width.percent]="100">
          </kendo-dropdownlist>
        </div>
        
        <div class="custom-section">
          <label>Or enter custom expression:</label>
          <kendo-textbox
            [(value)]="customExpression"
            placeholder="e.g., isValid, hasData, response.ok"
            [style.width.percent]="100">
          </kendo-textbox>
        </div>
        
        <div class="preview-section">
          <label>Preview:</label>
          <div class="preview-box">
            <span class="preview-text">{{ getPreview() }}</span>
          </div>
        </div>
      </div>
      
      <div class="editor-footer">
        <button 
          kendoButton 
          [themeColor]="'primary'"
          (click)="onSave()">
          Save
        </button>
        <button 
          kendoButton 
          [look]="'outline'"
          (click)="onCancel()">
          Cancel
        </button>
      </div>
    </div>
  `,
  styles: [`
    .condition-editor {
      background: var(--white-color);
      border-radius: var(--border-radius);
      box-shadow: var(--shadow);
      width: 400px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    .editor-header {
      padding: 1.5rem;
      border-bottom: 1px solid var(--gray-700);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--gray-600);
      
      h3 {
        margin: 0;
        font-size: 1.25rem;
        color: var(--gray-900);
      }
    }
    
    .close-button {
      background: none;
      border: none;
      color: var(--gray-800);
      cursor: pointer;
      font-size: 1.25rem;
      padding: 0.5rem;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--transition-time);
      
      &:hover {
        background: var(--gray-700);
        color: var(--gray-900);
      }
    }
    
    .editor-content {
      flex: 1;
      padding: 1.5rem;
    }
    
    .condition-section,
    .custom-section,
    .preview-section {
      margin-bottom: 1.5rem;
      
      label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 600;
        color: var(--gray-900);
      }
    }
    
    .preview-section {
      margin-bottom: 0;
    }
    
    .preview-box {
      background: var(--gray-600);
      padding: 1rem;
      border-radius: 0.5rem;
      border: 1px solid var(--gray-700);
    }
    
    .preview-text {
      font-family: monospace;
      font-size: 0.875rem;
      color: var(--mj-blue);
    }
    
    .editor-footer {
      padding: 1rem 1.5rem;
      border-top: 1px solid var(--gray-700);
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      background: var(--gray-600);
    }
  `]
})
export class SimpleConditionEditorComponent implements OnInit {
  @Input() connection!: Connection;
  @Output() save = new EventEmitter<Connection>();
  @Output() cancel = new EventEmitter<void>();
  
  commonConditions = COMMON_CONDITIONS;
  selectedCondition: any = null;
  customExpression = '';
  
  ngOnInit() {
    if (this.connection.condition) {
      // Try to find in common conditions
      const found = this.commonConditions.find(c => c.expression === this.connection.condition!.expression);
      if (found) {
        this.selectedCondition = found;
      } else {
        // It's a custom expression
        this.customExpression = this.connection.condition.expression;
      }
    }
  }
  
  getPreview(): string {
    if (this.customExpression) {
      return `if (${this.customExpression})`;
    } else if (this.selectedCondition) {
      return `if (${this.selectedCondition.expression})`;
    }
    return 'Always';
  }
  
  onSave() {
    let condition: BooleanCondition | undefined;
    
    if (this.customExpression) {
      condition = {
        expression: this.customExpression,
        label: this.customExpression
      };
    } else if (this.selectedCondition) {
      condition = {
        expression: this.selectedCondition.expression,
        label: this.selectedCondition.label
      };
    }
    
    const updatedConnection = {
      ...this.connection,
      condition
    };
    
    this.save.emit(updatedConnection);
  }
  
  onCancel() {
    this.cancel.emit();
  }
}