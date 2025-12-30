import { Component, Input, Output, EventEmitter, OnInit, ViewChild, OnDestroy, AfterViewInit, Renderer2, ElementRef, ChangeDetectorRef } from '@angular/core';
import { WindowComponent } from '@progress/kendo-angular-dialog';
import { AIAgentEntityExtended, AIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { Metadata } from '@memberjunction/core';
import { AITestHarnessComponent } from './ai-test-harness.component';

export interface CustomWindowData {
    agentId?: string;
    agent?: AIAgentEntityExtended;
    promptId?: string;
    prompt?: AIPromptEntityExtended;
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
            (stateChange)="onStateChange($event)"
            (resize)="onWindowResize()">
            
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
                        <mj-loading [text]="'Loading ' + (mode === 'agent' ? 'AI Agent' : 'AI Prompt') + '...'" size="large"></mj-loading>
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
                        [isVisible]="true"
                        (runOpened)="onRunOpened($event)">
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
        
        /* Ensure Kendo Window content wrapper maintains proper height */
        ::ng-deep .k-window-content {
            display: flex;
            flex-direction: column;
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
    
    agent?: AIAgentEntityExtended;
    prompt?: AIPromptEntityExtended;
    mode: 'agent' | 'prompt' = 'agent';
    
    private metadata = new Metadata();
    
    constructor(
        private renderer: Renderer2,
        private elementRef: ElementRef,
        private cdr: ChangeDetectorRef
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
                    const agentEntity = await this.metadata.GetEntityObject<AIAgentEntityExtended>('AI Agents');
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
                    const promptEntity = await this.metadata.GetEntityObject<AIPromptEntityExtended>('AI Prompts');
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
        
        // Adjust content height on any state change
        if (state !== 'minimized') {
            setTimeout(() => this.adjustContentHeight(), 100);
        }
    }
    
    onWindowResize() {
        // Handle Kendo Window resize event
        if (!this.isMinimized) {
            // Use a small delay to ensure the DOM has updated
            setTimeout(() => this.adjustContentHeight(), 50);
        }
    }
    
    onRunOpened(event: { runId: string; runType: 'agent' | 'prompt' }) {
        // Auto-minimize the test harness window when a run is opened
        this.minimize();
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
        setTimeout(() => {
            this.updateWindowPosition();
            
            // Force Angular change detection
            this.cdr.detectChanges();
            
            // Force the Kendo Window to recalculate its internal dimensions
            if (this.kendoWindow) {
                // Trigger resize event to fix content sizing
                window.dispatchEvent(new Event('resize'));
                
                // Use the shared method to adjust content height
                this.adjustContentHeight();
            }
        }, 100);
        
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
            this.adjustContentHeight();
        }, 100);
        
        // Set up execution tracking
        this.setupExecutionTracking();
        
        // Set up window resize listener
        this.setupResizeListener();
    }
    
    private adjustContentHeight() {
        // Ensure the window content wrapper has proper height
        const contentWrapper = this.elementRef.nativeElement.querySelector('.k-window-content');
        if (contentWrapper && this.kendoWindow) {
            // Get the actual window element to check current dimensions
            const windowElement = this.elementRef.nativeElement.querySelector('.k-window') ||
                                 this.elementRef.nativeElement.closest('.k-window');
            
            // Update our tracked dimensions if the window has been resized
            if (windowElement) {
                const rect = windowElement.getBoundingClientRect();
                if (rect.width > 0) this.width = rect.width;
                if (rect.height > 0) this.height = rect.height;
            }
            
            // Calculate the actual content height (window height minus titlebar and some padding)
            const windowHeight = this.height;
            const titlebarHeight = 40; // Titlebar height
            const bottomPadding = 10; // Extra space to prevent clipping
            const contentHeight = windowHeight - titlebarHeight - bottomPadding;
            
            this.renderer.setStyle(contentWrapper, 'height', `${contentHeight}px`);
            this.renderer.setStyle(contentWrapper, 'display', 'flex');
            this.renderer.setStyle(contentWrapper, 'flex-direction', 'column');
        }
        
        // Also update the test harness container
        const testHarnessContainer = this.elementRef.nativeElement.querySelector('mj-ai-test-harness');
        if (testHarnessContainer) {
            this.renderer.setStyle(testHarnessContainer, 'flex', '1');
            this.renderer.setStyle(testHarnessContainer, 'height', '100%');
            this.renderer.setStyle(testHarnessContainer, 'overflow', 'hidden');
        }
    }
    
    private setupResizeListener() {
        // Debounced resize handler
        let resizeTimeout: any;
        const handleResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (!this.isMinimized) {
                    this.adjustContentHeight();
                }
            }, 100);
        };
        
        // Listen for window resize events
        window.addEventListener('resize', handleResize);
        
        // Store the handler for cleanup
        (this as any).resizeHandler = handleResize;
        
        // Note: Kendo Window resize events are handled by the (resize) event binding in the template
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
        
        // Clean up resize listener
        if ((this as any).resizeHandler) {
            window.removeEventListener('resize', (this as any).resizeHandler);
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