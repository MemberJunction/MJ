import { Injectable, ViewContainerRef } from '@angular/core';
import { Observable } from 'rxjs';
import { TestHarnessWindowManagerService } from './test-harness-window-manager.service';
import { TestResult } from './test-harness-window.service';

/**
 * Service for opening AI test harness windows for agents and prompts.
 * This service wraps the TestHarnessWindowManagerService to provide a simpler API
 * that matches the expected interface in consuming components.
 */
@Injectable({
  providedIn: 'root'
})
export class AITestHarnessDialogService {
  constructor(private testHarnessService: TestHarnessWindowManagerService) {}

  /**
   * Opens the test harness window for an AI Agent (or Workflow).
   * Pass `{ initialDebugMode: true }` to initialize workflow mode in Debug (Start Paused) mode.
   */
  OpenForAgent(
    agentId: string,
    viewContainerRef?: ViewContainerRef,
    options?: { initialDebugMode?: boolean },
  ): Observable<TestResult> {
    return this.testHarnessService.OpenAgentTestHarness({
      agentId: agentId,
      // Don't pass title - let the window component generate it with the agent name
      width: '80vw',
      height: '80vh',
      viewContainerRef: viewContainerRef,
      initialDebugMode: options?.initialDebugMode,
    });
  }

  /** @deprecated Use {@link OpenForAgent}. */
  openForAgent(
    agentId: string,
    viewContainerRef?: ViewContainerRef,
    options?: { initialDebugMode?: boolean },
  ): Observable<TestResult> {
    return this.OpenForAgent(agentId, viewContainerRef, options);
  }

  /**
   * Opens the test harness window for an AI Prompt
   */
  OpenForPrompt(promptId: string, viewContainerRef?: ViewContainerRef): Observable<TestResult> {
    return this.testHarnessService.openPromptTestHarness({
      promptId: promptId,
      // Don't pass title - let the window component generate it with the prompt name
      width: '80vw',
      height: '80vh',
      viewContainerRef: viewContainerRef
    });
  }

  /** @deprecated Use {@link OpenForPrompt}. */
  openForPrompt(promptId: string, viewContainerRef?: ViewContainerRef): Observable<TestResult> {
    return this.OpenForPrompt(promptId, viewContainerRef);
  }
}