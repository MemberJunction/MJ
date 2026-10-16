import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { LogError } from '@memberjunction/core';

/**
 * Represents a system validation issue with its severity level
 */
export interface SystemValidationIssue {
  id: string;
  message: string;
  details?: string;
  severity: 'error' | 'warning' | 'info';
  help?: string;
  timestamp: Date;
}

/**
 * Service for checking system validation issues and displaying error messages to users
 */
@Injectable({
  providedIn: 'root'
})
export class SystemValidationService {
  private _validationIssues = new BehaviorSubject<SystemValidationIssue[]>([]);
  
  public ValidationIssues$: Observable<SystemValidationIssue[]> = this._validationIssues.asObservable();

  /** @deprecated Use {@link ValidationIssues$}. */
  public get validationIssues$(): Observable<SystemValidationIssue[]> {
    return this.ValidationIssues$;
  }
  /** @deprecated Use {@link ValidationIssues$}. */
  public set validationIssues$(value: Observable<SystemValidationIssue[]>) {
    this.ValidationIssues$ = value;
  }

  constructor() { }

  /**
   * Adds a new validation issue to the list
   */
  public AddIssue(issue: Omit<SystemValidationIssue, 'timestamp'>): void {
    try {
      const newIssue: SystemValidationIssue = {
        ...issue,
        timestamp: new Date()
      };

      const currentIssues = this._validationIssues.getValue();
      
      // Don't add duplicates with the same ID
      if (!currentIssues.some(i => i.id === issue.id)) {
        this._validationIssues.next([...currentIssues, newIssue]);
        LogError(`System Validation Issue: ${issue.message} (${issue.id})`);
      }
    } catch (err) {
      console.error('Error adding validation issue', err);
    }
  }

  /** @deprecated Use {@link AddIssue}. */
  public addIssue(issue: Omit<SystemValidationIssue, 'timestamp'>): void {
    return this.AddIssue(issue);
  }

  /**
   * Removes a validation issue by id
   */
  public RemoveIssue(id: string): void {
    try {
      const currentIssues = this._validationIssues.getValue();
      const updatedIssues = currentIssues.filter(issue => issue.id !== id);
      
      if (updatedIssues.length !== currentIssues.length) {
        this._validationIssues.next(updatedIssues);
      }
    } catch (err) {
      console.error('Error removing validation issue', err);
    }
  }

  /** @deprecated Use {@link RemoveIssue}. */
  public removeIssue(id: string): void {
    return this.RemoveIssue(id);
  }

  /**
   * Clears all validation issues
   */
  public ClearIssues(): void {
    this._validationIssues.next([]);
  }

  /** @deprecated Use {@link ClearIssues}. */
  public clearIssues(): void {
    return this.ClearIssues();
  }

  /**
   * Checks if there are any validation issues with error severity
   */
  public HasErrors(): boolean {
    return this._validationIssues.getValue().some(issue => issue.severity === 'error');
  }

  /** @deprecated Use {@link HasErrors}. */
  public hasErrors(): boolean {
    return this.HasErrors();
  }
}