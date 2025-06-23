import { Injectable, ViewContainerRef } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { Observable, Subject } from 'rxjs';
import { TestHarnessDialogService } from './test-harness-dialog.service';

export interface TestResult {
  success: boolean;
  result?: any;
  error?: string;
  executionTime?: number;
  tokensUsed?: number;
  cost?: number;
}

/**
 * Service for opening AI test harness dialogs for agents and prompts.
 * This service wraps the TestHarnessDialogService to provide a simpler API
 * that matches the expected interface in consuming components.
 */
@Injectable({
  providedIn: 'root'
})
export class AITestHarnessDialogService {
  constructor(private testHarnessService: TestHarnessDialogService) {}

  /**
   * Opens the test harness dialog for an AI Agent
   */
  openForAgent(agentId: string, viewContainerRef?: ViewContainerRef): Observable<TestResult> {
    const resultSubject = new Subject<TestResult>();
    
    try {
      const dialogRef = this.testHarnessService.openAgentTestHarness({
        agentId: agentId,
        title: 'Test AI Agent',
        width: '80vw',
        height: '80vh'
      });
      
      // Convert dialog close to test result
      dialogRef.result.subscribe({
        next: (result) => {
          if (result) {
            resultSubject.next({
              success: true,
              result: result,
              executionTime: 0
            });
          } else {
            resultSubject.next({
              success: false,
              error: 'Test cancelled'
            });
          }
          resultSubject.complete();
        },
        error: (error) => {
          resultSubject.next({
            success: false,
            error: error.message || 'Test failed'
          });
          resultSubject.complete();
        }
      });
    } catch (error: any) {
      resultSubject.next({
        success: false,
        error: error.message || 'Failed to open test harness'
      });
      resultSubject.complete();
    }
    
    return resultSubject.asObservable();
  }

  /**
   * Opens the test harness dialog for an AI Prompt
   */
  openForPrompt(promptId: string, viewContainerRef?: ViewContainerRef): Observable<TestResult> {
    const resultSubject = new Subject<TestResult>();
    
    try {
      // Use the prompt-specific test harness method
      const dialogRef = this.testHarnessService.openPromptTestHarness({
        promptId: promptId,
        title: 'Test AI Prompt',
        width: '80vw',
        height: '80vh'
      });
      
      // Convert dialog close to test result
      dialogRef.result.subscribe({
        next: (result) => {
          if (result) {
            resultSubject.next({
              success: true,
              result: result,
              executionTime: 0
            });
          } else {
            resultSubject.next({
              success: false,
              error: 'Test cancelled'
            });
          }
          resultSubject.complete();
        },
        error: (error) => {
          resultSubject.next({
            success: false,
            error: error.message || 'Test failed'
          });
          resultSubject.complete();
        }
      });
    } catch (error: any) {
      resultSubject.next({
        success: false,
        error: error.message || 'Failed to open test harness'
      });
      resultSubject.complete();
    }
    
    return resultSubject.asObservable();
  }
}