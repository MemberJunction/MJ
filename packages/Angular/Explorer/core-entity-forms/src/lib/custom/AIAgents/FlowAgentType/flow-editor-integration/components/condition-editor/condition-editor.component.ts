import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { Connection, BooleanCondition } from '../../models/connection.model';

@Component({
  selector: 'app-condition-editor',
  template: `
    <div class="condition-editor">
      <div class="editor-header">
        <h3>Edit Path Condition</h3>
        <button class="close-button" (click)="onCancel()">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
      
      <div class="editor-content">
        <div class="form-group">
          <label>Condition Expression</label>
          <kendo-textbox
            [(value)]="conditionExpression"
            placeholder="e.g., success, error, result > 0"
            [style.width.%]="100">
          </kendo-textbox>
          <small class="help-text">
            Enter a boolean expression that will determine when this path is taken
          </small>
        </div>
        
        <div class="form-group">
          <label>Display Label (Optional)</label>
          <kendo-textbox
            [(value)]="conditionLabel"
            placeholder="Label to display on the connection"
            [style.width.%]="100">
          </kendo-textbox>
        </div>
        
        <div class="quick-conditions">
          <label>Quick Conditions:</label>
          <div class="condition-buttons">
            <button 
              kendoButton
              *ngFor="let cond of quickConditions"
              (click)="applyQuickCondition(cond)"
              [themeColor]="conditionExpression === cond.expression ? 'primary' : 'base'">
              {{ cond.label }}
            </button>
          </div>
        </div>
        
        <div class="connection-label-section">
          <label>Connection Name (Optional)</label>
          <kendo-textbox
            [(value)]="connectionLabel"
            placeholder="Name for this connection"
            [style.width.%]="100">
          </kendo-textbox>
        </div>
      </div>
      
      <div class="editor-footer">
        <button kendoButton (click)="onCancel()">Cancel</button>
        <button kendoButton themeColor="primary" (click)="onSave()">Save</button>
      </div>
    </div>
  `,
  styles: [`
    .condition-editor {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    
    .editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
    }
    
    .editor-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }
    
    .close-button {
      background: none;
      border: none;
      font-size: 18px;
      color: #666;
      cursor: pointer;
      padding: 5px;
    }
    
    .close-button:hover {
      color: #333;
    }
    
    .editor-content {
      padding: 20px;
    }
    
    .form-group {
      margin-bottom: 20px;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 5px;
      font-size: 13px;
      font-weight: 600;
      color: #666;
    }
    
    .help-text {
      display: block;
      margin-top: 5px;
      font-size: 12px;
      color: #999;
    }
    
    .quick-conditions {
      margin: 25px 0;
      padding: 15px;
      background: #f9f9f9;
      border-radius: 4px;
    }
    
    .quick-conditions label {
      display: block;
      margin-bottom: 10px;
      font-size: 13px;
      font-weight: 600;
      color: #666;
    }
    
    .condition-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    
    .connection-label-section {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
    }
    
    .connection-label-section label {
      display: block;
      margin-bottom: 5px;
      font-size: 13px;
      font-weight: 600;
      color: #666;
    }
    
    .editor-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 15px 20px;
      background: #f5f5f5;
      border-top: 1px solid #e0e0e0;
    }
  `]
})
export class ConditionEditorComponent implements OnInit {
  @Input() connection: Connection | null = null;
  @Output() save = new EventEmitter<{ condition: BooleanCondition, label?: string }>();
  @Output() cancel = new EventEmitter<void>();
  
  conditionExpression = '';
  conditionLabel = '';
  connectionLabel = '';
  
  quickConditions = [
    { expression: 'success', label: 'Success' },
    { expression: 'error', label: 'Error' },
    { expression: 'completed', label: 'Completed' },
    { expression: 'failed', label: 'Failed' },
    { expression: 'timeout', label: 'Timeout' },
    { expression: 'true', label: 'Always' },
    { expression: 'false', label: 'Never' }
  ];
  
  ngOnInit() {
    this.loadConnectionData();
  }
  
  private loadConnectionData() {
    if (this.connection?.condition) {
      this.conditionExpression = this.connection.condition.expression;
      this.conditionLabel = this.connection.condition.label || '';
    }
    
    // If the connection has a label property (from extended model), use it
    this.connectionLabel = (this.connection as any)?.label || '';
  }
  
  applyQuickCondition(condition: { expression: string, label: string }) {
    this.conditionExpression = condition.expression;
    this.conditionLabel = condition.label;
  }
  
  onSave() {
    const condition: BooleanCondition = {
      expression: this.conditionExpression || 'true',
      label: this.conditionLabel || undefined
    };
    
    this.save.emit({ 
      condition, 
      label: this.connectionLabel || undefined 
    });
  }
  
  onCancel() {
    this.cancel.emit();
  }
}