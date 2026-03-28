import { Component, Input, Output, EventEmitter, OnInit, ViewChild, OnDestroy, AfterViewInit, Renderer2, ElementRef, ChangeDetectorRef } from '@angular/core';
import { MjWindowComponent } from '@memberjunction/ng-ui-components';
import { MJAIAgentEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { Metadata } from '@memberjunction/core';
import { AITestHarnessComponent } from './ai-test-harness.component';

export interface CustomWindowData {
    agentId?: string;
    agent?: MJAIAgentEntityExtended;
    promptId?: string;
    prompt?: MJAIPromptEntityExtended;
    title?: string;
    width?: string | number;
    height?: string | number;
    initialDataContext?: Record<string, unknown>;
    initialTemplateData?: Record<string, unknown>;
    initialTemplateVariables?: Record<string, unknown>;
    selectedModelId?: string;
    mode?: 'agent' | 'prompt';
}

@Component({
  standalone: false,
    selector: 'mj-test-harness-custom-window',
    template: `
        <mj-window
            #mjWindow
            [Visible]="windowVisible"
            [Title]="''"
            [Width]="width"
            [Height]="height"
            [Top]="windowTop"
            [Left]="windowLeft"
            [MinWidth]="isMinimized ? 400 : 800"
            [MinHeight]="isMinimized ? 60 : 600"
            [Draggable]="true"
            [Resizable]="!isMinimized"
            [State]="windowState"
            (Close)="onClose()"
            (StateChange)="onStateChange($event)"
            (Resize)="onWindowResize()">

            <mj-window-titlebar>
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
            </mj-window-titlebar>

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
        </mj-window>
    `,
    styles: [`
        :host {
            display: contents;
        }

        .window-title {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;

            .title-icon {
                color: var(--mj-text-muted);
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
            border-radius: var(--mj-radius-sm);
            transition: var(--mj-transition-colors);
            display: flex;
            align-items: center;
            justify-content: center;

            &:hover {
                background: var(--mj-bg-surface-hover);
            }

            i {
                font-size: 14px;
                color: var(--mj-text-muted);
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
            color: var(--mj-status-error);

            i {
                font-size: 3rem;
            }
        }

        mj-ai-test-harness {
            flex: 1;
            overflow: hidden;
        }

        /* Ensure mj-window body fills available space for the test harness */
        :host ::ng-deep .mj-window-body {
            display: flex;
            flex-direction: column;
            padding: 0;
        }

        /* Hide the default close button since we have custom titlebar actions */
        :host ::ng-deep .mj-window-close {
            display: none;
        }
    `]
})
export class TestHarnessCustomWindowComponent implements OnInit, OnDestroy, AfterViewInit {
    @ViewChild('mjWindow', { static: false }) mjWindow!: MjWindowComponent;
    @ViewChild(AITestHarnessComponent, { static: false }) testHarness?: AITestHarnessComponent;
    @Input() data: CustomWindowData = {};
    @Output() closeWindow = new EventEmitter<void>();
    @Output() minimizeWindow = new EventEmitter<void>();
    @Output() restoreWindow = new EventEmitter<void>();
    @Output() executionStateChange = new EventEmitter<{ windowId?: string; isExecuting: boolean }>();

    windowTitle = 'AI Test Harness';
    windowVisible = true;
    width: number = 1200;
    height: number = 800;
    windowTop: number = 100;
    windowLeft: number = 100;
    loading = true;
    error = '';
    windowState: 'default' | 'maximized' = 'default';
    isMaximized = false;
    isMinimized = false;

    // Store original dimensions for restore
    private originalWidth: number = 1200;
    private originalHeight: number = 800;
    private originalTop: number = 100;
    private originalLeft: number = 100;

    agent?: MJAIAgentEntityExtended;
    prompt?: MJAIPromptEntityExtended;
    mode: 'agent' | 'prompt' = 'agent';

    private metadata = new Metadata();
    private executionCheckInterval: ReturnType<typeof setInterval> | null = null;

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
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        this.windowLeft = Math.max(0, (viewportWidth - this.width) / 2);
        this.windowTop = Math.max(0, (viewportHeight - this.height) / 2);

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
                    const agentEntity = await this.metadata.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents');
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
                    const promptEntity = await this.metadata.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts');
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
            this.cdr.detectChanges();
        } catch (err: unknown) {
            this.error = err instanceof Error ? err.message : 'Failed to load entity';
            this.loading = false;
            this.cdr.detectChanges();
        }
    }

    onClose() {
        this.closeWindow.emit();
    }

    closeButtonClick() {
        this.onClose();
    }

    onStateChange(state: 'default' | 'maximized') {
        this.windowState = state;
        this.isMaximized = state === 'maximized';
    }

    onWindowResize() {
        // Window was resized — no special handling needed as mj-window tracks dimensions internally
    }

    onRunOpened(_event: { runId: string; runType: 'agent' | 'prompt' }) {
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
            this.windowVisible = false;
            this.minimizeWindow.emit();
            this.cdr.detectChanges();
        }
    }

    restoreFromMinimized() {
        this.width = this.originalWidth;
        this.height = this.originalHeight;
        this.windowTop = this.originalTop;
        this.windowLeft = this.originalLeft;
        this.windowState = 'default';
        this.isMinimized = false;
        this.isMaximized = false;
        this.windowVisible = true;

        this.cdr.detectChanges();

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
                this.cdr.detectChanges();
            }, 100);
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
        // Set up execution tracking
        this.setupExecutionTracking();
    }

    private setupExecutionTracking() {
        // Use a timer to check the test harness execution state
        if (this.testHarness) {
            let lastExecutingState = false;

            this.executionCheckInterval = setInterval(() => {
                if (this.testHarness && this.testHarness.isExecuting !== lastExecutingState) {
                    lastExecutingState = this.testHarness.isExecuting;
                    this.executionStateChange.emit({ isExecuting: lastExecutingState });
                }
            }, 100);
        }
    }

    ngOnDestroy() {
        if (this.executionCheckInterval) {
            clearInterval(this.executionCheckInterval);
        }
    }
}
