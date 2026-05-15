import { Component, Input, Output, EventEmitter, OnInit, ViewChild, OnDestroy, AfterViewInit, ChangeDetectorRef, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJWindowComponent } from '@memberjunction/ng-ui-components';
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
            [Visible]="WindowVisible"
            [Title]="''"
            [Width]="Width"
            [Height]="Height"
            [Top]="WindowTop"
            [Left]="WindowLeft"
            [MinWidth]="IsMinimized ? 400 : 800"
            [MinHeight]="IsMinimized ? 60 : 600"
            [Draggable]="true"
            [Resizable]="!IsMinimized"
            [State]="WindowState"
            (Close)="OnClose()"
            (StateChange)="OnStateChange($event)"
            (Resize)="OnWindowResize()">

            <mj-window-titlebar>
                <div class="window-title">
                    @if (Mode === 'agent' && Agent?.LogoURL) {
                        <img [src]="Agent?.LogoURL" class="title-logo" alt="Agent logo" />
                    } @else if (Mode === 'agent') {
                        <i class="fa-solid fa-robot title-icon"></i>
                    } @else {
                        <i class="fa-solid fa-comment-dots title-icon"></i>
                    }
                    <span>{{ WindowTitle }}</span>
                </div>
                <div class="window-actions">
                    <button
                        (click)="Minimize()"
                        title="Minimize"
                        class="window-action-btn">
                        <i class="fa-solid fa-window-minimize"></i>
                    </button>
                    <button
                        (click)="ToggleMaximize()"
                        [title]="IsMaximized ? 'Restore' : 'Maximize'"
                        class="window-action-btn">
                        <i class="fa-solid" [class.fa-window-maximize]="!IsMaximized" [class.fa-window-restore]="IsMaximized"></i>
                    </button>
                    <button
                        (click)="CloseButtonClick()"
                        title="Close"
                        class="window-action-btn">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </mj-window-titlebar>

            <div class="window-content">
                @if (Loading) {
                    <div class="loading-container">
                        <mj-loading [text]="'Loading ' + (Mode === 'agent' ? 'AI Agent' : 'AI Prompt') + '...'" size="large"></mj-loading>
                    </div>
                }
                @else if (Error) {
                    <div class="error-container">
                        <i class="fa-solid fa-exclamation-triangle"></i>
                        <p>{{ Error }}</p>
                    </div>
                }
                @else {
                    <mj-ai-test-harness
                        [entity]="(Agent || Prompt) || null"
                        [mode]="Mode"
                        [isVisible]="true"
                        (runOpened)="OnRunOpened($event)">
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
export class TestHarnessCustomWindowComponent extends BaseAngularComponent implements OnInit, OnDestroy, AfterViewInit  {
    @ViewChild('mjWindow', { static: false }) MjWindow!: MJWindowComponent;
    @ViewChild(AITestHarnessComponent, { static: false }) TestHarness?: AITestHarnessComponent;
    @Input() Data: CustomWindowData = {};
    @Output() CloseWindow = new EventEmitter<void>();
    @Output() MinimizeWindow = new EventEmitter<void>();
    @Output() RestoreWindow = new EventEmitter<void>();
    @Output() ExecutionStateChange = new EventEmitter<{ windowId?: string; isExecuting: boolean }>();

    WindowTitle = 'AI Test Harness';
    WindowVisible = false;
    Width: number = 1200;
    Height: number = 800;
    WindowTop: number = 100;
    WindowLeft: number = 100;
    Loading = true;
    Error = '';
    WindowState: 'default' | 'maximized' = 'default';
    IsMaximized = false;
    IsMinimized = false;

    // Store original dimensions for restore
    private originalWidth: number = 1200;
    private originalHeight: number = 800;
    private originalTop: number = 100;
    private originalLeft: number = 100;

    Agent?: MJAIAgentEntityExtended;
    Prompt?: MJAIPromptEntityExtended;
    Mode: 'agent' | 'prompt' = 'agent';

    private metadata = this.ProviderToUse;
    private executionCheckInterval: ReturnType<typeof setInterval> | null = null;
    private cdr = inject(ChangeDetectorRef);

    ngOnInit() {
        // Set window dimensions
        this.Width = this.convertToNumber(this.Data.width) || 1200;
        this.Height = this.convertToNumber(this.Data.height) || 800;

        // Store original dimensions
        this.originalWidth = this.Width;
        this.originalHeight = this.Height;

        // Calculate centered position
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        this.WindowLeft = Math.max(0, (viewportWidth - this.Width) / 2);
        this.WindowTop = Math.max(0, (viewportHeight - this.Height) / 2);

        // Store original position
        this.originalLeft = this.WindowLeft;
        this.originalTop = this.WindowTop;

        // Determine mode
        this.Mode = this.Data.mode || (this.Data.promptId || this.Data.prompt ? 'prompt' : 'agent');

        // Set initial title from data if available
        if (this.Data.title) {
            this.WindowTitle = this.Data.title;
        } else if (this.Data.agent) {
            this.WindowTitle = `Test: ${this.Data.agent.Name}`;
        } else if (this.Data.prompt) {
            this.WindowTitle = `Test: ${this.Data.prompt.Name}`;
        }

        // Show window now that position is calculated
        this.WindowVisible = true;

        // Load entity
        this.LoadEntity();
    }

    async LoadEntity() {
        try {
            if (this.Mode === 'agent') {
                await this.loadAgent();
            } else {
                await this.loadPrompt();
            }
            this.Loading = false;
            this.cdr.detectChanges();
        } catch (err: unknown) {
            this.Error = err instanceof Error ? err.message : 'Failed to load entity';
            this.Loading = false;
            this.cdr.detectChanges();
        }
    }

    private async loadAgent() {
        if (this.Data.agent) {
            this.Agent = this.Data.agent;
            this.WindowTitle = this.Data.title || `Test: ${this.Agent.Name}`;
        } else if (this.Data.agentId) {
            const agentEntity = await this.metadata.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents');
            await agentEntity.Load(this.Data.agentId);
            if (agentEntity.IsSaved) {
                this.Agent = agentEntity;
                this.WindowTitle = this.Data.title || `Test: ${this.Agent.Name}`;
            } else {
                throw new Error('Agent not found');
            }
        } else {
            throw new Error('No agent provided');
        }
    }

    private async loadPrompt() {
        if (this.Data.prompt) {
            this.Prompt = this.Data.prompt;
            this.WindowTitle = this.Data.title || `Test: ${this.Prompt.Name}`;
        } else if (this.Data.promptId) {
            const promptEntity = await this.metadata.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts');
            await promptEntity.Load(this.Data.promptId);
            if (promptEntity.IsSaved) {
                this.Prompt = promptEntity;
                this.WindowTitle = this.Data.title || `Test: ${this.Prompt.Name}`;
            } else {
                throw new Error('Prompt not found');
            }
        } else {
            throw new Error('No prompt provided');
        }
    }

    OnClose() {
        this.CloseWindow.emit();
    }

    CloseButtonClick() {
        this.OnClose();
    }

    OnStateChange(state: 'default' | 'maximized') {
        this.WindowState = state;
        this.IsMaximized = state === 'maximized';
    }

    OnWindowResize() {
        // Window was resized — no special handling needed as mj-window tracks dimensions internally
    }

    OnRunOpened(_event: { runId: string; runType: 'agent' | 'prompt' }) {
        // Auto-minimize the test harness window when a run is opened
        this.Minimize();
    }

    Minimize() {
        if (!this.IsMinimized) {
            // Store current dimensions before minimizing
            this.originalWidth = this.Width;
            this.originalHeight = this.Height;
            this.originalTop = this.WindowTop;
            this.originalLeft = this.WindowLeft;

            // Hide the window when minimized (dock will show icon)
            this.IsMinimized = true;
            this.WindowVisible = false;
            this.MinimizeWindow.emit();
            this.cdr.detectChanges();
        }
    }

    RestoreFromMinimized() {
        this.Width = this.originalWidth;
        this.Height = this.originalHeight;
        this.WindowTop = this.originalTop;
        this.WindowLeft = this.originalLeft;
        this.WindowState = 'default';
        this.IsMinimized = false;
        this.IsMaximized = false;
        this.WindowVisible = true;

        this.cdr.detectChanges();

        // Emit restore event
        this.RestoreWindow.emit();
    }

    ToggleMaximize() {
        if (this.IsMinimized) {
            // First restore from minimized, then maximize
            this.RestoreFromMinimized();
            setTimeout(() => {
                this.WindowState = 'maximized';
                this.IsMaximized = true;
                this.cdr.detectChanges();
            }, 100);
        } else {
            this.WindowState = this.IsMaximized ? 'default' : 'maximized';
            this.IsMaximized = !this.IsMaximized;
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
        if (this.TestHarness) {
            let lastExecutingState = false;

            this.executionCheckInterval = setInterval(() => {
                if (this.TestHarness && this.TestHarness.isExecuting !== lastExecutingState) {
                    lastExecutingState = this.TestHarness.isExecuting;
                    this.ExecutionStateChange.emit({ isExecuting: lastExecutingState });
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
