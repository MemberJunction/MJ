import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { Step } from '../../models/step.model';

@Component({
  selector: 'app-step',
  standalone: true,
  imports: [CommonModule, FormsModule, DropDownsModule],
  template: `
    <div class="step" [class.selected]="selected" [class.executing]="executing" (click)="onStepClick($event)">
      <div class="step-header">
        <div class="step-title">
          <i class="fas" [ngClass]="step.config.icon" [style.color]="step.config.color"></i>
          <span>{{ step.name }}</span>
        </div>
        <div class="step-actions">
          <button 
            class="icon-button small" 
            (click)="onDelete($event)" 
            title="Delete Step">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      
      <div class="step-content">
        <kendo-combobox
          [data]="step.config.options"
          [value]="selectedOption"
          [placeholder]="'Select ' + step.config.name + '...'"
          textField="name"
          valueField="value"
          [valuePrimitive]="false"
          (valueChange)="onOptionChange($event)"
          class="step-dropdown">
        </kendo-combobox>
      </div>
      
      <div class="socket input" 
           (mousedown)="onSocketMouseDown($event, 'input')"
           (mouseenter)="onSocketMouseEnter($event, 'input')"
           (mouseleave)="onSocketMouseLeave($event)">
      </div>
      <div class="socket output" 
           (mousedown)="onSocketMouseDown($event, 'output')"
           (mouseenter)="onSocketMouseEnter($event, 'output')"
           (mouseleave)="onSocketMouseLeave($event)">
      </div>
    </div>
  `,
  styles: [`
    .step {
      min-width: 240px;
      position: relative;
      background: var(--white-color);
      border: 1px solid var(--gray-700);
      border-radius: var(--border-radius);
      transition: all var(--transition-time);
      box-shadow: var(--shadow);
    }

    .step:hover {
      box-shadow: 0 6px 16px rgba(0,0,0,0.2);
      transform: translateY(-2px);
    }

    .step.selected {
      border-color: var(--mj-blue);
      box-shadow: 0 0 0 3px rgba(0, 118, 182, 0.25);
    }

    .step.executing {
      animation: pulse-border 1.5s infinite;
      border-color: #28a745;
      box-shadow: 0 0 0 3px rgba(40, 167, 69, 0.3);
    }

    @keyframes pulse-border {
      0% {
        box-shadow: 0 0 0 3px rgba(40, 167, 69, 0.3);
      }
      50% {
        box-shadow: 0 0 0 6px rgba(40, 167, 69, 0.1);
      }
      100% {
        box-shadow: 0 0 0 3px rgba(40, 167, 69, 0.3);
      }
    }

    .step-header {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--gray-700);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--gray-600);
      border-radius: calc(var(--border-radius) - 2px) calc(var(--border-radius) - 2px) 0 0;
    }

    .step-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 600;
      font-size: 0.875rem;
    }

    .step-actions {
      display: flex;
      gap: 0.25rem;
    }

    .step-content {
      padding: 0.75rem;
    }

    .step-dropdown {
      width: 100%;
    }
    
    :host ::ng-deep .k-combobox {
      width: 100%;
      border-radius: 0.5rem;
      border-color: var(--gray-700);
      transition: all var(--transition-time);
    }
    
    :host ::ng-deep .k-combobox:hover {
      border-color: var(--mj-blue);
    }
    
    :host ::ng-deep .k-combobox.k-focus {
      border-color: var(--mj-blue);
      box-shadow: 0 0 0 3px rgba(0, 118, 182, 0.25);
    }

    .socket {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      border: 2px solid var(--white-color);
      border-radius: 50%;
      background: var(--gray-800);
      z-index: 10;
      box-shadow: var(--shadow);
      cursor: crosshair;
      transition: all var(--transition-time);
    }

    .socket.input {
      left: -8px;
    }

    .socket.output {
      right: -8px;
    }

    .socket:hover {
      background: var(--mj-blue);
      transform: translateY(-50%) scale(1.2);
      box-shadow: 0 3px 6px rgba(0,0,0,0.3);
    }
    
    .socket.connecting {
      background: #28a745;
      animation: pulse 1s infinite;
    }
    
    @keyframes pulse {
      0% { transform: translateY(-50%) scale(1); }
      50% { transform: translateY(-50%) scale(1.3); }
      100% { transform: translateY(-50%) scale(1); }
    }

    .icon-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--gray-800);
      cursor: pointer;
      transition: all var(--transition-time);
      font-size: 0.75rem;
    }

    .icon-button:hover {
      background: var(--gray-700);
      color: var(--gray-900);
    }

    .icon-button.small {
      width: 20px;
      height: 20px;
      font-size: 0.625rem;
    }
  `]
})
export class StepComponent {
  @Input() step!: Step;
  @Input() selected: boolean = false;
  @Input() executing: boolean = false;
  @Output() stepSelected = new EventEmitter<Step>();
  @Output() stepDeleted = new EventEmitter<Step>();
  @Output() stepUpdated = new EventEmitter<Step>();
  @Output() socketMouseDown = new EventEmitter<{event: MouseEvent, step: Step, type: string}>();
  @Output() socketMouseEnter = new EventEmitter<{event: MouseEvent, step: Step, type: string}>();
  @Output() socketMouseLeave = new EventEmitter<MouseEvent>();

  get selectedOption() {
    if (!this.step.selectedOption) return null;
    return this.step.config.options.find(opt => opt.value === this.step.selectedOption) || null;
  }

  onDelete(event: Event) {
    event.stopPropagation();
    this.stepDeleted.emit(this.step);
  }

  onOptionChange(option: any) {
    if (option) {
      this.step.selectedOption = option.value;
      this.stepUpdated.emit(this.step);
    }
  }

  onSocketMouseDown(event: MouseEvent, type: string) {
    event.stopPropagation();
    event.preventDefault();
    this.socketMouseDown.emit({ event, step: this.step, type });
  }

  onSocketMouseEnter(event: MouseEvent, type: string) {
    this.socketMouseEnter.emit({ event, step: this.step, type });
  }

  onSocketMouseLeave(event: MouseEvent) {
    this.socketMouseLeave.emit(event);
  }

  onStepClick(event: MouseEvent) {
    event.stopPropagation();
    this.stepSelected.emit(this.step);
  }
}