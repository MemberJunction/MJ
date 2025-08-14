import { Injectable } from '@angular/core';
import { Module, ModuleType } from '../models/module.model';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ModuleManagerService {
  private selectedModule$ = new BehaviorSubject<Module | null>(null);
  public selectedModule = this.selectedModule$.asObservable();

  private moduleTypes: { [key: string]: ModuleType } = {
    prompt: {
      name: 'Prompt',
      icon: 'fa-comment',
      color: '#28a745',
      properties: {
        promptText: { type: 'textarea', label: 'Prompt Text', default: '' },
        temperature: { type: 'number', label: 'Temperature', default: 0.7, min: 0, max: 1, step: 0.1 },
        maxTokens: { type: 'number', label: 'Max Tokens', default: 150 }
      }
    },
    'api-call': {
      name: 'API Call',
      icon: 'fa-cloud',
      color: '#007bff',
      properties: {
        url: { type: 'text', label: 'API URL', default: '' },
        method: { type: 'select', label: 'Method', default: 'GET', options: ['GET', 'POST', 'PUT', 'DELETE'] },
        headers: { type: 'textarea', label: 'Headers (JSON)', default: '{}' },
        body: { type: 'textarea', label: 'Body (JSON)', default: '{}' }
      }
    },
    condition: {
      name: 'Condition',
      icon: 'fa-share-alt',
      color: '#ffc107',
      properties: {
        condition: { type: 'text', label: 'Condition Expression', default: '' },
        trueLabel: { type: 'text', label: 'True Branch Label', default: 'True' },
        falseLabel: { type: 'text', label: 'False Branch Label', default: 'False' }
      }
    },
    variable: {
      name: 'Variable',
      icon: 'fa-tag',
      color: '#6c757d',
      properties: {
        variableName: { type: 'text', label: 'Variable Name', default: '' },
        variableValue: { type: 'text', label: 'Initial Value', default: '' },
        variableType: { type: 'select', label: 'Type', default: 'string', options: ['string', 'number', 'boolean', 'object'] }
      }
    },
    loop: {
      name: 'Loop',
      icon: 'fa-redo',
      color: '#6f42c1',
      properties: {
        loopType: { type: 'select', label: 'Loop Type', default: 'for', options: ['for', 'while', 'forEach'] },
        iterations: { type: 'number', label: 'Iterations', default: 10 },
        collection: { type: 'text', label: 'Collection Variable', default: '' }
      }
    },
    output: {
      name: 'Output',
      icon: 'fa-paper-plane',
      color: '#dc3545',
      properties: {
        outputType: { type: 'select', label: 'Output Type', default: 'text', options: ['text', 'json', 'file'] },
        format: { type: 'text', label: 'Format Template', default: '' }
      }
    }
  };

  constructor() { }

  getModuleTypes(): { [key: string]: ModuleType } {
    return this.moduleTypes;
  }

  getModuleType(type: string): ModuleType | undefined {
    return this.moduleTypes[type];
  }

  createModule(type: string, id: string | null = null): Module | null {
    const moduleType = this.moduleTypes[type];
    if (!moduleType) return null;

    const moduleId = id || `module-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const module: Module = {
      id: moduleId,
      type: type,
      name: moduleType.name,
      icon: moduleType.icon,
      color: moduleType.color,
      properties: {}
    };

    // Initialize properties with default values
    for (const [key, prop] of Object.entries(moduleType.properties)) {
      module.properties[key] = prop.default;
    }

    return module;
  }

  updateModuleProperty(module: Module, propertyName: string, value: any): void {
    if (module && module.properties) {
      module.properties[propertyName] = value;
    }
  }

  selectModule(module: Module | null): void {
    this.selectedModule$.next(module);
  }

  deleteModule(modules: Module[], moduleId: string): Module[] {
    return modules.filter(m => m.id !== moduleId);
  }
}