import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { STEP_CONFIGS, StepType } from '../../models/step.model';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.scss']
})
export class ToolbarComponent {
  @Output() runFlow = new EventEmitter<void>();
  
  stepTypes = Object.entries(STEP_CONFIGS).map(([key, config]) => ({
    key: key as StepType,
    config
  }));

  constructor() { }

  onDragStart(event: DragEvent, type: StepType) {
    const element = event.target as HTMLElement;
    element.classList.add('dragging');
    
    event.dataTransfer!.effectAllowed = 'copy';
    event.dataTransfer!.setData('text/plain', `step:${type}`);
    event.dataTransfer!.setData('stepType', type);
  }

  onDragEnd(event: DragEvent) {
    const element = event.target as HTMLElement;
    element.classList.remove('dragging');
  }

  onRunFlow() {
    this.runFlow.emit();
  }
}