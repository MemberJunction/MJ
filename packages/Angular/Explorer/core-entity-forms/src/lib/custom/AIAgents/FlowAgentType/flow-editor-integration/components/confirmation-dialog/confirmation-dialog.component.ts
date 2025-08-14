import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonsModule } from '@progress/kendo-angular-buttons';

@Component({
  selector: 'app-confirmation-dialog',
  standalone: true,
  imports: [CommonModule, ButtonsModule],
  template: `
    <div class="dialog-backdrop" (click)="onCancel()">
      <div class="dialog-container" (click)="$event.stopPropagation()">
        <div class="dialog-header">
          <h3>{{ title }}</h3>
        </div>
        
        <div class="dialog-content">
          <i class="fas fa-exclamation-triangle warning-icon"></i>
          <p>{{ message }}</p>
        </div>
        
        <div class="dialog-footer">
          <button 
            kendoButton 
            [look]="'outline'"
            (click)="onCancel()">
            Cancel
          </button>
          <button 
            kendoButton 
            [themeColor]="'error'"
            (click)="onConfirm()">
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dialog-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    
    .dialog-container {
      background: var(--white-color);
      border-radius: var(--border-radius);
      box-shadow: var(--shadow);
      width: 400px;
      max-width: 90%;
      animation: dialogSlideIn 0.3s ease;
    }
    
    @keyframes dialogSlideIn {
      from {
        opacity: 0;
        transform: translateY(-20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    
    .dialog-header {
      padding: 1.5rem;
      border-bottom: 1px solid var(--gray-700);
      background: var(--gray-600);
      border-radius: var(--border-radius) var(--border-radius) 0 0;
      
      h3 {
        margin: 0;
        font-size: 1.25rem;
        color: var(--gray-900);
      }
    }
    
    .dialog-content {
      padding: 2rem;
      text-align: center;
      
      .warning-icon {
        font-size: 3rem;
        color: #dc3545;
        margin-bottom: 1rem;
      }
      
      p {
        margin: 0;
        font-size: 1rem;
        color: var(--gray-900);
        line-height: 1.5;
      }
    }
    
    .dialog-footer {
      padding: 1rem 1.5rem;
      border-top: 1px solid var(--gray-700);
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      background: var(--gray-600);
      border-radius: 0 0 var(--border-radius) var(--border-radius);
    }
  `]
})
export class ConfirmationDialogComponent {
  @Input() title = 'Confirm Action';
  @Input() message = 'Are you sure you want to proceed?';
  @Input() confirmText = 'Delete';
  
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  
  onConfirm() {
    this.confirm.emit();
  }
  
  onCancel() {
    this.cancel.emit();
  }
}