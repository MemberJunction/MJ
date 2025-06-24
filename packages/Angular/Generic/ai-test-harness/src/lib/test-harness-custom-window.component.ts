import { Component, Input, Output, EventEmitter, OnInit, ViewChild, OnDestroy, AfterViewInit, Renderer2, ElementRef } from '@angular/core';
import { WindowComponent } from '@progress/kendo-angular-dialog';
import { AIAgentEntity, AIPromptEntity } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';
import { AITestHarnessComponent } from './ai-test-harness.component';

export interface CustomWindowData {
    agentId?: string;
    agent?: AIAgentEntity;
    promptId?: string;
    prompt?: AIPromptEntity;
    title?: string;
    width?: string | number;
    height?: string | number;
    initialDataContext?: Record<string, any>;
    initialTemplateData?: Record<string, any>;
    initialTemplateVariables?: Record<string, any>;
    selectedModelId?: string;
    mode?: 'agent' | 'prompt';
}

@Component({
    selector: 'mj-test-harness-custom-window',
    template: `
        <kendo-window
            #kendoWindow
            [title]="windowTitle"
            [width]="width"
            [height]="height"
            [top]="windowTop"
            [left]="windowLeft"
            [minWidth]="isMinimized ? 400 : 800"
            [minHeight]="isMinimized ? 60 : 600"
            [draggable]="true"
            [resizable]="!isMinimized"
            [state]="windowState"
            [class.minimized-window]="isMinimized"
            (close)="onClose()"
            (stateChange)="onStateChange($event)">
            
            <kendo-window-titlebar>
                <div class="window-title">
                    @if (mode === 'agent' && agent?.LogoURL) {
                        <img [src]="agent?.LogoURL" class="title-logo" alt="Agent logo" />
                    } @else if (mode === 'agent') {
                        <i class="fa-solid fa-robot title-icon"></i>
                    } @else {
                        <i class="fa-solid fa-comment-dots title-icon"></i>
                    }
                    <span>{{ windowTitle }}</span>
                </div>
                <div class="window-actions">
                    <button 
                        (click)="minimize()"
                        title="Minimize"
                        class="window-action-btn">
                        <i class="fa-solid fa-window-minimize"></i>
                    </button>
                    <button 
                        (click)="toggleMaximize()"
                        [title]="isMaximized ? 'Restore' : 'Maximize'"
                        class="window-action-btn">
                        <i class="fa-solid" [class.fa-window-maximize]="!isMaximized" [class.fa-window-restore]="isMaximized"></i>
                    </button>
                    <button 
                        (click)="closeButtonClick()"
                        title="Close"
                        class="window-action-btn">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </kendo-window-titlebar>
            
            <div class="window-content">
                @if (loading) {
                    <div class="loading-container">
                        <kendo-loader type="converging-spinner" size="large"></kendo-loader>
                        <p>Loading {{mode === 'agent' ? 'AI Agent' : 'AI Prompt'}}...</p>
                    </div>
                }
                @else if (error) {
                    <div class="error-container">
                        <i class="fa-solid fa-exclamation-triangle"></i>
                        <p>{{ error }}</p>
                    </div>
                }
                @else {
                    <mj-ai-test-harness
                        [entity]="(agent || prompt) || null"
                        [mode]="mode"
                        [isVisible]="true">
                    </mj-ai-test-harness>
                }
            </div>
        </kendo-window>
    `,
    styles: [`
        :host {
            display: contents;
        }
        
        /* Remove animation for snappy performance
        ::ng-deep .window-transition {
            transition: all 0.6s ease-in-out !important;
        } */
        
        ::ng-deep .minimized-window {
            .k-window-content {
                display: none !important;
            }
            
            .k-window-titlebar {
                border-radius: 4px !important;
            }
        }
        
        .window-title {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
            
            .title-icon {
                color: #666;
                font-size: 16px;
            }
            
            .title-logo {
                width: 20px;
                height: 20px;
                object-fit: contain;
            }
        }
        
        .window-actions {
            display: flex;
            gap: 4px;
            align-items: center;
        }
        
        .window-action-btn {
            background: transparent;
            border: none;
            padding: 8px;
            cursor: pointer;
            border-radius: 4px;
            transition: background-color 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            
            &:hover {
                background-color: rgba(0, 0, 0, 0.08);
            }
            
            i {
                font-size: 14px;
                color: #666;
            }
        }
        
        .window-content {
            height: 100%;
            display: flex;
            flex-direction: column;
        }
        
        .loading-container,
        .error-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: 1rem;
        }
        
        .error-container {
            color: #dc3545;
            
            i {
                font-size: 3rem;
            }
        }
        
        mj-ai-test-harness {
            flex: 1;
            overflow: hidden;
        }
    `]
})
export class TestHarnessCustomWindowComponent implements OnInit, OnDestroy, AfterViewInit {
    @ViewChild('kendoWindow', { static: false }) kendoWindow!: WindowComponent;
    @ViewChild(AITestHarnessComponent, { static: false }) testHarness?: AITestHarnessComponent;
    @Input() data: CustomWindowData = {};
    @Output() closeWindow = new EventEmitter<void>();
    @Output() minimizeWindow = new EventEmitter<void>();
    @Output() restoreWindow = new EventEmitter<void>();
    @Output() executionStateChange = new EventEmitter<{ windowId?: string; isExecuting: boolean }>();
    
    windowTitle = 'AI Test Harness';
    width: number = 1200;
    height: number = 800;
    windowTop: number = 100;
    windowLeft: number = 100;
    loading = true;
    error = '';
    windowState: 'default' | 'minimized' | 'maximized' = 'default';
    isMaximized = false;
    isMinimized = false;
    
    // Store original dimensions for restore
    private originalWidth: number = 1200;
    private originalHeight: number = 800;
    private originalTop: number = 100;
    private originalLeft: number = 100;
    
    // Minimized dimensions
    private readonly MINIMIZED_WIDTH = 400;
    private readonly MINIMIZED_HEIGHT = 60;
    
    agent?: AIAgentEntity;
    prompt?: AIPromptEntity;
    mode: 'agent' | 'prompt' = 'agent';
    
    private metadata = new Metadata();
    
    constructor(
        private renderer: Renderer2,
        private elementRef: ElementRef
    ) {}
    
    ngOnInit() {
        // Set window dimensions
        this.width = this.convertToNumber(this.data.width) || 1200;
        this.height = this.convertToNumber(this.data.height) || 800;
        
        // Store original dimensions
        this.originalWidth = this.width;
        this.originalHeight = this.height;
        
        // Calculate centered position
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        this.windowLeft = Math.max(0, (windowWidth - this.width) / 2);
        this.windowTop = Math.max(0, (windowHeight - this.height) / 2);
        
        // Store original position
        this.originalLeft = this.windowLeft;
        this.originalTop = this.windowTop;
        
        // Determine mode
        this.mode = this.data.mode || (this.data.promptId || this.data.prompt ? 'prompt' : 'agent');
        
        // Load entity
        this.loadEntity();
    }
    
    async loadEntity() {
        try {
            if (this.mode === 'agent') {
                if (this.data.agent) {
                    this.agent = this.data.agent;
                    this.windowTitle = this.data.title || `Test: ${this.agent.Name}`;
                } else if (this.data.agentId) {
                    const agentEntity = await this.metadata.GetEntityObject<AIAgentEntity>('AI Agents');
                    await agentEntity.Load(this.data.agentId);
                    if (agentEntity.IsSaved) {
                        this.agent = agentEntity;
                        this.windowTitle = this.data.title || `Test: ${this.agent.Name}`;
                    } else {
                        throw new Error('Agent not found');
                    }
                } else {
                    throw new Error('No agent provided');
                }
            } else {
                if (this.data.prompt) {
                    this.prompt = this.data.prompt;
                    this.windowTitle = this.data.title || `Test: ${this.prompt.Name}`;
                } else if (this.data.promptId) {
                    const promptEntity = await this.metadata.GetEntityObject<AIPromptEntity>('AI Prompts');
                    await promptEntity.Load(this.data.promptId);
                    if (promptEntity.IsSaved) {
                        this.prompt = promptEntity;
                        this.windowTitle = this.data.title || `Test: ${this.prompt.Name}`;
                    } else {
                        throw new Error('Prompt not found');
                    }
                } else {
                    throw new Error('No prompt provided');
                }
            }
            
            this.loading = false;
        } catch (err: any) {
            this.error = err.message || 'Failed to load entity';
            this.loading = false;
        }
    }
    
    onClose() {
        // When the Kendo Window's close event fires (from the default X button),
        // emit our closeWindow event to notify the window manager
        this.closeWindow.emit();
    }
    
    closeButtonClick() {
        // When our custom close button is clicked, emit the close event
        // This will trigger the window to close and call our onClose handler
        if (this.kendoWindow) {
            this.kendoWindow.close.emit();
        } else {
            // If kendoWindow is not available, directly emit the close event
            this.onClose();
        }
    }
    
    onStateChange(state: 'default' | 'minimized' | 'maximized') {
        this.windowState = state;
        this.isMaximized = state === 'maximized';
        this.isMinimized = state === 'minimized';
        
        // Handle restore from minimized
        if (this.isMinimized && state !== 'minimized') {
            this.restoreFromMinimized();
        }
    }
    
    minimize() {
        if (!this.isMinimized) {
            // Store current dimensions before minimizing
            this.originalWidth = this.width;
            this.originalHeight = this.height;
            this.originalTop = this.windowTop;
            this.originalLeft = this.windowLeft;
            
            // Hide the window when minimized (dock will show icon)
            this.isMinimized = true;
            this.minimizeWindow.emit();
            
            // Hide the window element
            let windowElement = this.elementRef.nativeElement.querySelector('.k-window');
            if (!windowElement && this.elementRef.nativeElement.closest) {
                windowElement = this.elementRef.nativeElement.closest('.k-window');
            }
            if (windowElement) {
                this.renderer.setStyle(windowElement, 'display', 'none');
            }
        }
    }
    
    restoreFromMinimized() {
        this.width = this.originalWidth;
        this.height = this.originalHeight;
        this.windowTop = this.originalTop;
        this.windowLeft = this.originalLeft;
        this.windowState = 'default';
        this.isMinimized = false;
        
        // Show the window element
        let windowElement = this.elementRef.nativeElement.querySelector('.k-window');
        if (!windowElement && this.elementRef.nativeElement.closest) {
            windowElement = this.elementRef.nativeElement.closest('.k-window');
        }
        if (windowElement) {
            this.renderer.setStyle(windowElement, 'display', 'block');
        }
        
        // Update position after state change
        setTimeout(() => this.updateWindowPosition(), 50);
        
        // Emit restore event
        this.restoreWindow.emit();
    }
    
    toggleMaximize() {
        if (this.isMinimized) {
            // First restore from minimized, then maximize
            this.restoreFromMinimized();
            setTimeout(() => {
                this.windowState = 'maximized';
                this.isMaximized = true;
            }, 600);
        } else {
            this.windowState = this.isMaximized ? 'default' : 'maximized';
            this.isMaximized = !this.isMaximized;
        }
    }
    
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
    
    ngAfterViewInit() {
        // Set initial position if needed
        setTimeout(() => {
            this.updateWindowPosition();
        }, 100);
        
        // Set up execution tracking
        this.setupExecutionTracking();
    }
    
    private setupExecutionTracking() {
        // Use a timer to check the test harness execution state
        // This is needed because the test harness doesn't emit events for execution state changes
        if (this.testHarness) {
            // Initial state
            let lastExecutingState = false;
            
            // Check execution state periodically
            const checkInterval = setInterval(() => {
                if (this.testHarness && this.testHarness.isExecuting !== lastExecutingState) {
                    lastExecutingState = this.testHarness.isExecuting;
                    this.executionStateChange.emit({ isExecuting: lastExecutingState });
                }
            }, 100);
            
            // Store interval for cleanup
            (this as any).executionCheckInterval = checkInterval;
        }
    }
    
    ngOnDestroy() {
        // Clean up execution tracking interval
        if ((this as any).executionCheckInterval) {
            clearInterval((this as any).executionCheckInterval);
        }
        
        // Ensure window is properly closed and cleaned up
        if (this.kendoWindow) {
            this.kendoWindow.close.emit();
        }
    }
    
    private updateWindowPosition() {
        // Find the window element - it might be in the parent if we're inside a wrapper
        let windowElement = this.elementRef.nativeElement.querySelector('.k-window');
        if (!windowElement && this.elementRef.nativeElement.closest) {
            windowElement = this.elementRef.nativeElement.closest('.k-window');
        }
        
        if (windowElement && (this.windowTop !== undefined || this.windowLeft !== undefined)) {
            if (this.windowTop !== undefined) {
                this.renderer.setStyle(windowElement, 'top', `${this.windowTop}px`);
            }
            if (this.windowLeft !== undefined) {
                this.renderer.setStyle(windowElement, 'left', `${this.windowLeft}px`);
            }
        }
    }
}