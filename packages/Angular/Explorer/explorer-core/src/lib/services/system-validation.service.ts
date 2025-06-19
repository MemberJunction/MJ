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
  
  public validationIssues$: Observable<SystemValidationIssue[]> = this._validationIssues.asObservable();

  constructor() { }

  /**
   * Adds a new validation issue to the list
   */
  public addIssue(issue: Omit<SystemValidationIssue, 'timestamp'>): void {
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

  /**
   * Removes a validation issue by id
   */
  public removeIssue(id: string): void {
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

  /**
   * Clears all validation issues
   */
  public clearIssues(): void {
    this._validationIssues.next([]);
  }

  /**
   * Checks if there are any validation issues with error severity
   */
  public hasErrors(): boolean {
    return this._validationIssues.getValue().some(issue => issue.severity === 'error');
  }
}