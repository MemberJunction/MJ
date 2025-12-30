import { Injectable, ComponentRef, ApplicationRef, Injector, createComponent, ViewContainerRef } from '@angular/core';
import { AIAgentEntityExtended, AIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { TestHarnessCustomWindowComponent, CustomWindowData } from './test-harness-custom-window.component';
import { Observable, Subject } from 'rxjs';
import { TestResult } from './test-harness-window.service';
import { WindowDockService } from './window-dock.service';

interface WindowInfo {
    componentRef: ComponentRef<TestHarnessCustomWindowComponent>;
    usedViewContainerRef: boolean;
}

/**
 * Service for managing test harness windows for AI Agents and AI Prompts.
 * Creates Kendo Window components with custom titlebar including minimize button.
 */
@Injectable({
    providedIn: 'root'
})
export class TestHarnessWindowManagerService {
    private openWindows = new Map<string, WindowInfo>();
    private windowCounter = 0;
    
    constructor(
        private appRef: ApplicationRef,
        private injector: Injector,
        private dockService: WindowDockService
    ) {}
    
    /**
     * Opens the AI Agent Test Harness in a window
     */
    openAgentTestHarness(options: {
        agentId?: string;
        agent?: AIAgentEntityExtended;
        title?: string;
        width?: string | number;
        height?: string | number;
        initialDataContext?: Record<string, any>;
        initialTemplateData?: Record<string, any>;
        viewContainerRef?: ViewContainerRef;
    }): Observable<TestResult> {
        const data: CustomWindowData = {
            agentId: options.agentId,
            agent: options.agent,
            title: options.title,
            width: options.width || '90vw',
            height: options.height || '90vh',
            initialDataContext: options.initialDataContext,
            initialTemplateData: options.initialTemplateData,
            mode: 'agent'
        };
        
        return this.createWindow(data, options.viewContainerRef);
    }
    
    /**
     * Opens the AI Prompt Test Harness in a window
     */
    openPromptTestHarness(options: {
        promptId?: string;
        prompt?: AIPromptEntityExtended;
        title?: string;
        width?: string | number;
        height?: string | number;
        initialTemplateVariables?: Record<string, any>;
        selectedModelId?: string;
        viewContainerRef?: ViewContainerRef;
    }): Observable<TestResult> {
        const data: CustomWindowData = {
            promptId: options.promptId,
            prompt: options.prompt,
            title: options.title || 'Test AI Prompt',
            width: options.width || '90vw',
            height: options.height || '90vh',
            initialTemplateVariables: options.initialTemplateVariables,
            selectedModelId: options.selectedModelId,
            mode: 'prompt'
        };
        
        return this.createWindow(data, options.viewContainerRef);
    }
    
    /**
     * Creates a test harness window
     */
    private createWindow(data: CustomWindowData, viewContainerRef?: ViewContainerRef): Observable<TestResult> {
        const resultSubject = new Subject<TestResult>();
        const windowId = `test-harness-${++this.windowCounter}`;
        
        // Create component
        const componentRef = createComponent(TestHarnessCustomWindowComponent, {
            environmentInjector: this.appRef.injector,
            elementInjector: this.injector,
            hostElement: document.createElement('div')
        });
        
        // Set component data
        componentRef.instance.data = data;
        
        // Handle window events
        componentRef.instance.closeWindow.subscribe(() => {
            this.closeWindow(windowId);
            resultSubject.next({
                success: true
            });
            resultSubject.complete();
        });
        
        // Handle minimize event
        componentRef.instance.minimizeWindow.subscribe(() => {
            const title = componentRef.instance.windowTitle;
            let icon: string | undefined = 'fa-solid fa-flask'; // default
            let iconUrl: string | undefined;
            
            // Get the appropriate icon based on mode and entity
            if (componentRef.instance.mode === 'agent' && componentRef.instance.agent) {
                // For agents, use LogoURL since AIAgentEntityExtended doesn't have IconClass
                if (componentRef.instance.agent.LogoURL) {
                    iconUrl = componentRef.instance.agent.LogoURL;
                    icon = undefined; // Clear icon when using URL
                } else {
                    icon = 'fa-solid fa-robot'; // Default agent icon
                }
            } else if (componentRef.instance.mode === 'prompt') {
                icon = 'fa-solid fa-comment-dots'; // Default prompt icon
            }
            
            // Add to dock with icon or iconUrl
            this.dockService.addWindow(windowId, title, icon, () => {
                // Restore callback
                componentRef.instance.restoreFromMinimized();
            }, iconUrl);
        });
        
        // Handle restore event
        componentRef.instance.restoreWindow.subscribe(() => {
            // Remove from dock
            this.dockService.removeWindow(windowId);
        });
        
        // Handle execution state changes
        componentRef.instance.executionStateChange.subscribe((state) => {
            if (state.isExecuting) {
                // Show indeterminate progress (spinning/pulsing)
                this.dockService.updateWindowProgress(windowId, 50); // 50% for indeterminate animation
            } else {
                // Clear progress
                this.dockService.updateWindowProgress(windowId, undefined);
            }
        });
        
        // Attach to DOM
        if (viewContainerRef) {
            // When using viewContainerRef, the view is automatically attached to Angular
            viewContainerRef.insert(componentRef.hostView);
        } else {
            // When appending to document.body, we need to manually attach to Angular
            document.body.appendChild(componentRef.location.nativeElement);
            this.appRef.attachView(componentRef.hostView);
        }
        
        // Store reference with info about how it was created
        this.openWindows.set(windowId, {
            componentRef,
            usedViewContainerRef: !!viewContainerRef
        });
        
        return resultSubject.asObservable();
    }
    
    /**
     * Closes a specific window
     */
    private closeWindow(windowId: string) {
        const windowInfo = this.openWindows.get(windowId);
        if (windowInfo) {
            // Remove from dock if minimized
            this.dockService.removeWindow(windowId);
            
            // Only detach from appRef if we attached it manually (not using viewContainerRef)
            if (!windowInfo.usedViewContainerRef) {
                this.appRef.detachView(windowInfo.componentRef.hostView);
            }
            windowInfo.componentRef.destroy();
            this.openWindows.delete(windowId);
        }
    }
    
    /**
     * Closes all open windows
     */
    closeAllWindows() {
        this.openWindows.forEach((windowInfo, id) => {
            this.closeWindow(id);
        });
    }
}