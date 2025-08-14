import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { FlowEditorService } from '../../services/flow-editor.service';
import { Step, StepOption, StepProperty, STEP_CONFIGS } from '../../models/step.model';

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './properties-panel.component.html',
  styles: [`
    :host {
      display: block;
      height: 100%;
      background: white;
    }
    
    .properties-panel {
      height: 100%;
      background: white;
      border-left: 1px solid #D9D9D9;
      display: flex;
      flex-direction: column;
      box-shadow: -1px 0 3px rgba(0, 0, 0, 0.05);
    }
    
    .properties-header {
      padding: 1.5rem;
      border-bottom: 1px solid #D9D9D9;
      background: #F4F4F4;
    }
    
    .properties-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
      color: #333;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .properties-title i {
      color: #0076B6;
    }
    
    .properties-content {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
    }
    
    .empty-state {
      text-align: center;
      color: #AAA;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }
    
    .empty-state .fa-info-circle {
      font-size: 2rem;
      color: #0076B6;
    }
    
    .empty-state p {
      margin: 0;
      font-size: 0.875rem;
    }
    
    .property-field {
      margin-bottom: 1.5rem;
    }
    
    .property-field label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 600;
      color: #333;
      font-size: 0.875rem;
    }
    
    .form-input {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #D9D9D9;
      border-radius: 4px;
      font-size: 0.875rem;
    }
    
    .form-input:focus {
      outline: none;
      border-color: #0076B6;
    }
    
    .form-input[readonly] {
      background-color: #F4F4F4;
      cursor: not-allowed;
    }
  `]
})
export class PropertiesPanelComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  selectedStep: Step | null = null;
  availableOptions: StepOption[] = [];

  constructor(
    private flowEditor: FlowEditorService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    // Subscribe to selected step
    this.flowEditor.selectedNode
      .pipe(takeUntil(this.destroy$))
      .subscribe(step => {
        this.selectedStep = step as Step;
        
        // Update available options
        this.availableOptions = this.getAvailableOptions();
        
        // Initialize property values with defaults if they don't exist
        if (this.selectedStep && this.selectedStep.selectedOption) {
          const option = this.getSelectedOption();
          if (option?.properties && !this.selectedStep.propertyValues) {
            this.selectedStep.propertyValues = {};
            option.properties.forEach(prop => {
              if (this.selectedStep && this.selectedStep.propertyValues) {
                this.selectedStep.propertyValues[prop.key] = prop.defaultValue;
              }
            });
          }
        }
        // Force change detection
        this.cdr.detectChanges();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onStepNameChange(newName: string) {
    if (this.selectedStep) {
      this.selectedStep.name = newName;
      this.flowEditor.updateNode(this.selectedStep);
    }
  }

  onStepOptionChange(value: string) {
    if (this.selectedStep) {
      // Handle creating a new custom prompt
      if (value === 'new_custom_prompt') {
        // Generate a unique ID for this custom prompt
        const customId = `custom_${this.selectedStep.id}_${Date.now()}`;
        this.selectedStep.selectedOption = customId;
        
        // Give it a unique name
        const customNumber = this.getStepCustomPrompts().length + 1;
        this.selectedStep.name = `Custom Prompt ${customNumber}`;
      } else {
        this.selectedStep.selectedOption = value;
        
        // If selecting a predefined prompt, reset the name to match
        const option = this.getSelectedOption();
        if (option && !value.startsWith('custom_')) {
          this.selectedStep.name = option.name;
        }
      }
      
      // Initialize property values with defaults when option changes
      const option = this.getSelectedOption();
      if (option?.properties) {
        if (!this.selectedStep.propertyValues) {
          this.selectedStep.propertyValues = {};
        }
        option.properties.forEach(prop => {
          if (this.selectedStep && this.selectedStep.propertyValues && !(prop.key in this.selectedStep.propertyValues)) {
            this.selectedStep.propertyValues[prop.key] = prop.defaultValue;
          }
        });
      }
      
      this.flowEditor.updateNode(this.selectedStep);
      
      // Update available options after changing selection
      this.availableOptions = this.getAvailableOptions();
      
      // Force change detection
      this.cdr.detectChanges();
    }
  }

  getSelectedOption(): StepOption | undefined {
    if (!this.selectedStep || !this.selectedStep.selectedOption) {
      return undefined;
    }
    return this.selectedStep.config.options.find(opt => opt.value === this.selectedStep!.selectedOption);
  }

  getOptionProperties(): StepProperty[] {
    const option = this.getSelectedOption();
    return option?.properties || [];
  }

  getPropertyValue(key: string): any {
    if (!this.selectedStep?.propertyValues) {
      return '';
    }
    return this.selectedStep.propertyValues[key] || '';
  }

  onPropertyChange(key: string, value: any) {
    if (this.selectedStep) {
      if (!this.selectedStep.propertyValues) {
        this.selectedStep.propertyValues = {};
      }
      this.selectedStep.propertyValues[key] = value;
      this.flowEditor.updateNode(this.selectedStep);
    }
  }

  // Get available options
  getAvailableOptions(): StepOption[] {
    if (!this.selectedStep) return [];
    
    if (this.selectedStep.type === 'prompt') {
      // Create the "New Custom Prompt" option at the top
      const newPromptOption: StepOption = {
        id: 'new',
        name: 'Create New Custom Prompt',
        value: 'new_custom_prompt',
        properties: [
          { key: 'promptText', label: 'Prompt Text', type: 'textarea', rows: 6, placeholder: 'Enter your custom prompt here...' },
          { key: 'temperature', label: 'Temperature', type: 'number', min: 0, max: 2, step: 0.1, defaultValue: 0.7 },
          { key: 'maxTokens', label: 'Max Tokens', type: 'number', min: 1, max: 4096, defaultValue: 1024 },
          { key: 'responseFormat', label: 'Response Format', type: 'select', options: [
            { value: 'text', label: 'Plain Text' },
            { value: 'json', label: 'JSON' },
            { value: 'markdown', label: 'Markdown' },
            { value: 'code', label: 'Code' }
          ], defaultValue: 'text' },
          { key: 'includeContext', label: 'Include Context', type: 'checkbox', defaultValue: true }
        ]
      };
      
      // Get the predefined options
      const predefinedOptions = this.selectedStep.config.options.filter(opt => opt.value !== 'custom');
      
      // Check if this step has any custom prompts stored
      const customPrompts = this.getStepCustomPrompts();
      
      // Return new option at top, then custom prompts, then predefined
      const allOptions = [newPromptOption, ...customPrompts, ...predefinedOptions];
      return allOptions;
    }
    
    return this.selectedStep.config.options;
  }
  
  // Get custom prompts for this flow
  private getStepCustomPrompts(): StepOption[] {
    const customPrompts: StepOption[] = [];
    
    // Get all steps from the flow editor service
    const allSteps = this.flowEditor.getAllSteps();
    
    // Find all unique custom prompts across all prompt steps
    const customPromptMap = new Map<string, StepOption>();
    
    allSteps.forEach(step => {
      if (step.type === 'prompt' && step.selectedOption?.startsWith('custom_')) {
        if (!customPromptMap.has(step.selectedOption)) {
          const customOption: StepOption = {
            id: step.selectedOption,
            name: step.name || 'Custom Prompt',
            value: step.selectedOption,
            properties: [
              { key: 'promptText', label: 'Prompt Text', type: 'textarea', rows: 6, placeholder: 'Enter your custom prompt here...' },
              { key: 'temperature', label: 'Temperature', type: 'number', min: 0, max: 2, step: 0.1, defaultValue: 0.7 },
              { key: 'maxTokens', label: 'Max Tokens', type: 'number', min: 1, max: 4096, defaultValue: 1024 },
              { key: 'responseFormat', label: 'Response Format', type: 'select', options: [
                { value: 'text', label: 'Plain Text' },
                { value: 'json', label: 'JSON' },
                { value: 'markdown', label: 'Markdown' },
                { value: 'code', label: 'Code' }
              ], defaultValue: 'text' },
              { key: 'includeContext', label: 'Include Context', type: 'checkbox', defaultValue: true }
            ]
          };
          customPromptMap.set(step.selectedOption, customOption);
        }
      }
    });
    
    // Convert map to array
    customPrompts.push(...customPromptMap.values());
    
    return customPrompts;
  }
}