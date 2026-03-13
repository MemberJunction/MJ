import { Injectable, ViewContainerRef, ComponentRef } from '@angular/core';
import { WindowService, WindowRef, WindowSettings } from '@progress/kendo-angular-dialog';
import { MJAIAgentEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AITestHarnessWindowComponent, AITestHarnessWindowData } from './ai-test-harness-window.component';
import { Observable, Subject } from 'rxjs';

export interface TestResult {
  success: boolean;
  result?: any;
  error?: string;
  executionTime?: number;
  tokensUsed?: number;
  cost?: number;
}

/**
 * Service for managing test harness windows for AI Agents and AI Prompts.
 * Uses Kendo Window component which provides maximize and close functionality.
 * 
 * Note: Kendo Window created via WindowService does not include a minimize button
 * in the titlebar. The window supports maximize/restore and close actions only.
 * To add minimize functionality, a custom window component with custom titlebar
 * would need to be implemented.
 */
@Injectable({
    providedIn: 'root'
})
export class TestHarnessWindowService {
    private openWindows = new Map<string, WindowRef>();
    private windowCounter = 0;
    
    constructor(private windowService: WindowService) {}
    
    /**
     * Opens the AI Agent Test Harness in a window
     */
    openAgentTestHarness(options: {
        agentId?: string;
        agent?: MJAIAgentEntityExtended;
        title?: string;
        width?: string | number;
        height?: string | number;
        initialDataContext?: Record<string, any>;
        initialTemplateData?: Record<string, any>;
        viewContainerRef?: ViewContainerRef;
    }): Observable<TestResult> {
        const data: AITestHarnessWindowData = {
            agentId: options.agentId,
            agent: options.agent,
            title: options.title,
            width: options.width || '90vw',
            height: options.height || '90vh',
            initialDataContext: options.initialDataContext,
            initialTemplateData: options.initialTemplateData,
            mode: 'agent'
        };
        
        return this.openWindow(data, options.viewContainerRef);
    }
    
    /**
     * Opens the AI Prompt Test Harness in a window
     */
    openPromptTestHarness(options: {
        promptId?: string;
        prompt?: MJAIPromptEntityExtended;
        title?: string;
        width?: string | number;
        height?: string | number;
        initialTemplateVariables?: Record<string, any>;
        selectedModelId?: string;
        promptRunId?: string;
        viewContainerRef?: ViewContainerRef;
    }): Observable<TestResult> {
        console.log('🎯 openPromptTestHarness called with options:', options);
        console.log('📌 promptRunId:', options.promptRunId);
        
        const data: AITestHarnessWindowData = {
            promptId: options.promptId,
            prompt: options.prompt,
            title: options.title || 'Test AI Prompt',
            width: options.width || '90vw',
            height: options.height || '90vh',
            initialTemplateVariables: options.initialTemplateVariables,
            selectedModelId: options.selectedModelId,
            promptRunId: options.promptRunId,
            mode: 'prompt'
        };
        
        console.log('📦 Final AITestHarnessWindowData:', data);
        
        return this.openWindow(data, options.viewContainerRef);
    }
    
    /**
     * Opens a test harness window
     */
    private openWindow(data: AITestHarnessWindowData, viewContainerRef?: ViewContainerRef): Observable<TestResult> {
        const resultSubject = new Subject<TestResult>();
        const windowId = `test-harness-${++this.windowCounter}`;
        
        const windowSettings: WindowSettings = {
            title: data.title || 'AI Test Harness',
            content: AITestHarnessWindowComponent,
            width: this.convertToNumber(data.width) || 1200,
            height: this.convertToNumber(data.height) || 800,
            minWidth: 800,
            minHeight: 600,
            draggable: true,
            resizable: true,
            state: 'default',
            cssClass: 'test-harness-window-wrapper'
        };
        
        if (viewContainerRef) {
            windowSettings.appendTo = viewContainerRef;
        }
        
        const windowRef = this.windowService.open(windowSettings);
        this.openWindows.set(windowId, windowRef);
        
        // Pass data to the component
        const componentRef = windowRef.content as ComponentRef<AITestHarnessWindowComponent>;
        if (componentRef && componentRef.instance) {
            componentRef.instance.data = data;
            
            // Handle window close
            componentRef.instance.closeWindow.subscribe(() => {
                this.closeWindow(windowId);
                // Don't complete the observable here, as the window.result will handle it
            });
        }
        
        // Handle window close via close button
        windowRef.result.subscribe({
            next: (result) => {
                this.openWindows.delete(windowId);
                resultSubject.next({
                    success: true,
                    result: result
                });
                resultSubject.complete();
            },
            error: (error) => {
                this.openWindows.delete(windowId);
                resultSubject.next({
                    success: false,
                    error: error.message || 'Test failed'
                });
                resultSubject.complete();
            }
        });
        
        return resultSubject.asObservable();
    }
    
    /**
     * Closes a specific window
     */
    private closeWindow(windowId: string) {
        const windowRef = this.openWindows.get(windowId);
        if (windowRef) {
            try {
                windowRef.close();
                this.openWindows.delete(windowId);
            } catch (error) {
                console.error('Error closing window:', error);
                // Force delete from map even if close fails
                this.openWindows.delete(windowId);
            }
        }
    }
    
    /**
     * Closes all open windows
     */
    closeAllWindows() {
        this.openWindows.forEach((windowRef, id) => {
            windowRef.close();
        });
        this.openWindows.clear();
    }
    
    /**
     * Helper method to convert string dimensions to pixel numbers
     */
    private convertToNumber(value: string | number | undefined): number | undefined {
        if (!value) return undefined;
        if (typeof value === 'number') return value;
        
        // Handle percentage values
        if (value.endsWith('vw') || value.endsWith('vh')) {
            const percentage = parseFloat(value) / 100;
            if (value.endsWith('vw')) {
                return window.innerWidth * percentage;
            } else {
                return window.innerHeight * percentage;
            }
        }
        
        // Handle pixel values
        if (value.endsWith('px')) {
            return parseFloat(value);
        }
        
        // Try to parse as number
        const parsed = parseFloat(value);
        return isNaN(parsed) ? undefined : parsed;
    }
}