import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { StepOption } from '../models/step.model';

export interface CustomPrompt extends StepOption {
  isCustom: boolean;
  createdAt: Date;
  modifiedAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class PromptManagerService {
  private customPrompts$ = new BehaviorSubject<CustomPrompt[]>([]);
  private nextPromptId = 1;
  
  public customPrompts = this.customPrompts$.asObservable();

  constructor() {
    // Load saved prompts from localStorage
    this.loadSavedPrompts();
  }

  private loadSavedPrompts() {
    const saved = localStorage.getItem('customPrompts');
    if (saved) {
      try {
        const prompts = JSON.parse(saved);
        this.customPrompts$.next(prompts);
        // Update nextPromptId based on loaded prompts
        if (prompts.length > 0) {
          const maxId = Math.max(...prompts.map((p: CustomPrompt) => parseInt(p.id.replace('custom_', ''))));
          this.nextPromptId = maxId + 1;
        }
      } catch (e) {
        console.error('Failed to load saved prompts:', e);
      }
    }
  }

  private savePrompts() {
    console.log('Saving prompts to localStorage:', this.customPrompts$.value);
    localStorage.setItem('customPrompts', JSON.stringify(this.customPrompts$.value));
  }

  createPrompt(name: string, properties: any[]): CustomPrompt {
    const promptId = `custom_${this.nextPromptId++}`;
    const newPrompt: CustomPrompt = {
      id: promptId,
      name: name,
      value: promptId, // Use the same value as id for consistency
      properties: properties,
      isCustom: true,
      createdAt: new Date(),
      modifiedAt: new Date()
    };

    const prompts = [...this.customPrompts$.value, newPrompt];
    this.customPrompts$.next(prompts);
    this.savePrompts();
    
    return newPrompt;
  }

  updatePrompt(promptId: string, updates: Partial<CustomPrompt>): void {
    const prompts = this.customPrompts$.value.map(p => 
      p.id === promptId 
        ? { ...p, ...updates, modifiedAt: new Date() }
        : p
    );
    this.customPrompts$.next(prompts);
    this.savePrompts();
  }

  deletePrompt(promptId: string): void {
    const prompts = this.customPrompts$.value.filter(p => p.id !== promptId);
    this.customPrompts$.next(prompts);
    this.savePrompts();
  }

  getPrompt(promptId: string): CustomPrompt | undefined {
    return this.customPrompts$.value.find(p => p.id === promptId);
  }

  duplicatePrompt(promptId: string, newName: string): CustomPrompt | null {
    const original = this.getPrompt(promptId);
    if (!original) return null;

    return this.createPrompt(
      newName,
      JSON.parse(JSON.stringify(original.properties)) // Deep clone properties
    );
  }

  // Get all prompts including built-in and custom
  getAllPromptOptions(builtInPrompts: StepOption[]): StepOption[] {
    const customPromptsAsOptions: StepOption[] = this.customPrompts$.value.map(cp => ({
      id: cp.id,
      name: cp.name + ' (Custom)',
      value: cp.value,
      properties: cp.properties
    }));
    
    return [...builtInPrompts, ...customPromptsAsOptions];
  }
}