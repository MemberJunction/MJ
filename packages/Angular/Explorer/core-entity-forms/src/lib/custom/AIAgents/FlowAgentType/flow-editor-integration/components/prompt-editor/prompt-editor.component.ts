import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StepProperty } from '../../models/step.model';
import { PromptManagerService, CustomPrompt } from '../../services/prompt-manager.service';

@Component({
  selector: 'app-prompt-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './prompt-editor.component.html',
  styleUrls: ['./prompt-editor.component.scss']
})
export class PromptEditorComponent implements OnInit {
  @Input() promptId?: string;
  @Input() isNew: boolean = false;
  @Output() save = new EventEmitter<CustomPrompt>();
  @Output() cancel = new EventEmitter<void>();

  promptName: string = '';
  properties: StepProperty[] = [];
  
  // Available property types
  propertyTypes = [
    { value: 'text', label: 'Text Input' },
    { value: 'textarea', label: 'Text Area' },
    { value: 'number', label: 'Number' },
    { value: 'select', label: 'Dropdown' },
    { value: 'checkbox', label: 'Checkbox' },
    { value: 'json', label: 'JSON' }
  ];

  constructor(private promptManager: PromptManagerService) {}

  ngOnInit() {
    if (this.promptId && !this.isNew) {
      // Load existing prompt
      const prompt = this.promptManager.getPrompt(this.promptId);
      if (prompt) {
        this.promptName = prompt.name;
        this.properties = JSON.parse(JSON.stringify(prompt.properties || [])); // Deep clone
      }
    } else {
      // Initialize with default property
      this.properties = [{
        key: 'message',
        label: 'Message',
        type: 'textarea',
        rows: 4,
        placeholder: 'Enter your prompt...',
        defaultValue: ''
      }];
    }
  }

  addProperty() {
    const newProperty: StepProperty = {
      key: `property_${Date.now()}`,
      label: 'New Property',
      type: 'text',
      placeholder: '',
      defaultValue: ''
    };
    this.properties.push(newProperty);
  }

  removeProperty(index: number) {
    this.properties.splice(index, 1);
  }

  updatePropertyType(property: StepProperty) {
    // Reset type-specific properties when type changes
    delete property.options;
    delete property.min;
    delete property.max;
    delete property.step;
    delete property.rows;

    // Set defaults based on type
    switch (property.type) {
      case 'textarea':
      case 'json':
        property.rows = 4;
        break;
      case 'number':
        property.min = 0;
        property.max = 100;
        property.step = 1;
        break;
      case 'select':
        property.options = [
          { value: 'option1', label: 'Option 1' },
          { value: 'option2', label: 'Option 2' }
        ];
        break;
      case 'checkbox':
        property.defaultValue = false;
        break;
    }
  }

  addSelectOption(property: StepProperty) {
    if (!property.options) {
      property.options = [];
    }
    property.options.push({
      value: `opt_${Date.now()}`,
      label: 'New Option'
    });
  }

  removeSelectOption(property: StepProperty, index: number) {
    if (property.options) {
      property.options.splice(index, 1);
    }
  }

  savePrompt() {
    if (!this.promptName.trim()) {
      alert('Please enter a prompt name');
      return;
    }

    if (this.properties.length === 0) {
      alert('Please add at least one property');
      return;
    }

    // Validate property keys are unique
    const keys = this.properties.map(p => p.key);
    if (new Set(keys).size !== keys.length) {
      alert('Property keys must be unique');
      return;
    }

    let savedPrompt: CustomPrompt;
    
    if (this.promptId && !this.isNew) {
      // Update existing
      this.promptManager.updatePrompt(this.promptId, {
        name: this.promptName,
        properties: this.properties
      });
      savedPrompt = this.promptManager.getPrompt(this.promptId)!;
    } else {
      // Create new
      savedPrompt = this.promptManager.createPrompt(this.promptName, this.properties);
    }

    this.save.emit(savedPrompt);
  }

  onCancel() {
    this.cancel.emit();
  }

  // Make property key safe for use as identifier
  sanitizeKey(event: any, property: StepProperty) {
    const value = event.target.value;
    property.key = value.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
  }
}