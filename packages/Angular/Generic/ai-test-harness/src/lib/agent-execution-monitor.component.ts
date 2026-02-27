import { Component, Input, OnChanges, SimpleChanges, OnDestroy, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, ChangeDetectionStrategy, ViewContainerRef, ComponentRef, Output, EventEmitter } from '@angular/core';
import { Subject, interval, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ExecutionNodeComponent } from './agent-execution-node.component';
import { MJAIAgentRunEntityExtended, MJAIAgentRunStepEntityExtended } from '@memberjunction/ai-core-plus';

/**
 * Progress message with display mode
 */
export interface ProgressMessage {
    id: string;
    message: string;
    timestamp: Date;
    displayMode: 'live' | 'historical' | 'both';
    metadata?: Record<string, unknown>;
}

/**
 * Mode for the execution monitor component
 */
export type ExecutionMonitorMode = 'live' | 'historical';

/**
 * Execution statistics for display
 */
export interface ExecutionStats {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    totalTokens: number;
    totalCost: number;
    stepsByType: Record<string, number>;
    totalDuration?: number;
    totalPrompts: number;
}

/**
 * AgentExecutionMonitor Component
 * 
 * A reusable component for visualizing AI agent execution flow in real-time or historically.
 * Displays a hierarchical tree of execution steps with status, timing, and preview information.
 * 
 * Features:
 * - Real-time updates for live executions
 * - Historical playback for completed executions
 * - Collapsible tree structure
 * - Step status indicators with animations
 * - Execution statistics
 * - Token usage and cost tracking
 * - Error display
 * - Input/output preview
 */
@Component({
  standalone: false,
    selector: 'mj-agent-execution-monitor',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="execution-monitor" [class.live-mode]="mode === 'live'">
            <!-- Header -->
            <div class="monitor-header">
                <div class="header-title">
                    <i class="fa-solid fa-diagram-project"></i>
                    <span>Execution Monitor</span>
                    @if (mode === 'live') {
                        <span class="live-indicator">
                            <span class="pulse"></span>
                            LIVE
                        </span>
                    }
                </div>
                @if (currentStep && mode === 'live') {
                    <div class="current-status">
                        <span class="status-label">Current:</span>
                        <span class="step-name">{{ currentStep.StepName }}</span>
                    </div>
                }
                @if (mode === 'historical' && agentRun && isExecutionComplete()) {
                    <button class="view-run-btn" (click)="onViewRunClick()">
                        <i class="fa-solid fa-external-link-alt"></i>
                        View {{ runType === 'agent' ? 'Agent' : 'Prompt' }} Run
                    </button>
                }
            </div>

            <!-- Execution Tree -->
            <div class="execution-tree" 
                 #executionTreeContainer
                 [class.has-content]="hasContent()"
                 (scroll)="onScroll($event)"
                 (click)="onUserInteraction()">
                <!-- Always render the container, but show empty state when no data -->
                <div #executionNodesContainer class="nodes-container">
                </div>
                @if (!agentRun && liveSteps.length === 0) {
                    <div class="empty-state">
                        <i class="fa-solid fa-hourglass-start"></i>
                        <p>Waiting for execution to begin...</p>
                    </div>
                }
            </div>

            <!-- Statistics Footer -->
            <div class="monitor-footer">
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Steps</span>
                        <span class="stat-value">
                            {{ stats.completedSteps }}/{{ stats.totalSteps }}
                            @if (stats.failedSteps > 0) {
                                <span class="failed-count">({{ stats.failedSteps }} failed)</span>
                            }
                        </span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Prompts</span>
                        <span class="stat-value">{{ stats.totalPrompts }}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Tokens</span>
                        <span class="stat-value">{{ stats.totalTokens.toLocaleString() }}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Cost</span>
                        <span class="stat-value">\${{ stats.totalCost.toFixed(4) }}</span>
                    </div>
                    @if (stats.totalDuration) {
                        <div class="stat-item">
                            <span class="stat-label">Duration</span>
                            <span class="stat-value">{{ formatDuration(stats.totalDuration) }}</span>
                        </div>
                    }
                </div>
                @if (getStepTypes().length > 0) {
                    <div class="step-types">
                        @for (type of getStepTypes(); track type) {
                            <span class="type-badge">
                                {{ stats.stepsByType[type] }} {{ pluralizeStepType(type, stats.stepsByType[type]) }}
                            </span>
                        }
                    </div>
                }
            </div>
        </div>
    `,
    styles: [`
        :host {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
        }
        
        .execution-monitor {
            display: flex;
            flex-direction: column;
            flex: 1;
            background: #fff;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            overflow: hidden;
        }

        /* Header */
        .monitor-header {
            padding: 16px;
            background: #f8f9fa;
            border-bottom: 1px solid #e0e0e0;
        }

        .header-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 16px;
            font-weight: 600;
            color: #1a1a1a;
            margin-bottom: 8px;
        }

        .header-title i {
            color: #2196f3;
        }

        .live-indicator {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            background: #ff4444;
            color: white;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.5px;
        }

        .pulse {
            display: inline-block;
            width: 8px;
            height: 8px;
            background: white;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.8); }
            100% { opacity: 1; transform: scale(1); }
        }

        .current-status {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            color: #666;
        }

        .status-label {
            font-weight: 500;
        }

        .agent-path {
            color: #999;
        }

        .step-name {
            color: #1a1a1a;
            font-weight: 500;
        }

        /* Execution Tree */
        .execution-tree {
            flex: 1;
            overflow-y: auto;
            overflow-x: auto;
            padding: 16px;
            min-height: 0;
        }
        
        .nodes-container {
            /* No extra padding needed, indentation handled by node margins */
        }

        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #999;
            text-align: center;
        }

        .empty-state i {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }

        .empty-state p {
            margin: 0;
            font-size: 14px;
        }

        /* Tree Nodes - These styles are for reference only, actual rendering is done by ExecutionNodeComponent */
        .tree-node {
            margin-bottom: 4px;
        }

        /* Footer */
        .monitor-footer {
            padding: 16px;
            background: #f8f9fa;
            border-top: 1px solid #e0e0e0;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
            gap: 16px;
            margin-bottom: 12px;
        }

        .stat-item {
            text-align: center;
        }

        .stat-label {
            display: block;
            font-size: 11px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
        }

        .stat-value {
            display: block;
            font-size: 16px;
            font-weight: 600;
            color: #1a1a1a;
        }

        .failed-count {
            color: #f44336;
            font-size: 12px;
            font-weight: normal;
        }

        .step-types {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: center;
        }

        .type-badge {
            display: inline-block;
            padding: 4px 8px;
            background: #e3f2fd;
            color: #1976d2;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        
        /* View Run Button */
        .view-run-btn {
            background: #2196f3;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
            margin-left: auto;
        }
        
        .view-run-btn:hover {
            background: #1976d2;
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        .view-run-btn i {
            font-size: 12px;
        }

        /* Responsive */
        @media (max-width: 768px) {
            .monitor-header {
                padding: 12px;
            }

            .execution-tree {
                padding: 12px;
            }
        }
    `]
})
export class AgentExecutionMonitorComponent implements OnChanges, OnDestroy, AfterViewInit {
    @Input() mode: ExecutionMonitorMode = 'historical';
    @Input() agentRun: MJAIAgentRunEntityExtended | null = null; // For historical mode
    @Input() liveSteps: MJAIAgentRunStepEntityExtended[] = []; // For live mode streaming
    @Input() autoExpand: boolean = true; // Auto-expand nodes in live mode
    @Input() runId: string | null = null; // ID of the run (agent or prompt)
    @Input() runType: 'agent' | 'prompt' = 'agent'; // Type of run
    
    @Output() viewRunClick = new EventEmitter<{ runId: string; runType: 'agent' | 'prompt' }>();
    
    @ViewChild('executionTreeContainer') executionTreeContainer!: ElementRef<HTMLDivElement>;
    @ViewChild('executionNodesContainer', { read: ViewContainerRef }) executionNodesContainer!: ViewContainerRef;
    
    // Store the currently rendered steps for UI state management
    currentStep: MJAIAgentRunStepEntityExtended | null = null;
    
    // Track component references for dynamic components
    private nodeComponentMap = new Map<string, ComponentRef<ExecutionNodeComponent>>();
    
    // UI state management - track expanded states separately from entities
    private expandedStates = new Map<string, boolean>();
    private detailsExpandedStates = new Map<string, boolean>();
    stats: ExecutionStats = {
        totalSteps: 0,
        completedSteps: 0,
        failedSteps: 0,
        totalTokens: 0,
        totalCost: 0,
        stepsByType: {},
        totalPrompts: 0
    };
    
    // User interaction tracking
    private userHasInteracted = false;
    private userHasScrolled = false;
    private isAutoScrolling = false;
    private lastScrollPosition = 0;
    private scrollThreshold = 50; // pixels from bottom to consider "at bottom"
    
    // View initialization flag
    private viewInitialized = false;
    
    // Track processed step IDs to avoid duplication
    private processedStepIds = new Set<string>();
    
    // Track which nodes were added in the current update
    private newlyAddedNodeIds = new Set<string>();
    
    // Temporary storage for parsed metadata
    private lastParsedAgentData: any = null;
    private lastParsedActionData: any = null;
    
    private destroy$ = new Subject<void>();
    private updateSubscription?: Subscription;
    
    constructor(private cdr: ChangeDetectorRef) {}
    
    ngOnChanges(changes: SimpleChanges): void {
        console.log('🔄 Execution Monitor ngOnChanges:', {
            agentRunChanged: !!changes['agentRun'],
            liveStepsChanged: !!changes['liveSteps'],
            modeChanged: !!changes['mode'],
            hasAgentRun: !!this.agentRun,
            liveStepsCount: this.liveSteps?.length || 0
        });
        
        // Handle agent run changes (historical mode)
        if (changes['agentRun'] && this.mode === 'historical') {
            const oldRun = changes['agentRun'].previousValue;
            const newRun = changes['agentRun'].currentValue;
            
            console.log('📊 Agent run changed:', {
                oldRunExists: !!oldRun,
                newRunExists: !!newRun,
                oldRunId: oldRun?.ID,
                newRunId: newRun?.ID,
                stepsCount: newRun?.Steps?.length
            });
            
            // Only clear if it's actually a different execution (different ID)
            const isDifferentExecution = (!oldRun && newRun) || 
                                       (oldRun && newRun && oldRun.ID !== newRun.ID) ||
                                       (oldRun && !newRun);
            
            if (isDifferentExecution) {
                console.log('🗑️ Clearing for different agent run');
                this.processedStepIds.clear();
                this.newlyAddedNodeIds.clear();
                this.expandedStates.clear();
                this.detailsExpandedStates.clear();
                this.clearNodeComponents();
                this.currentStep = null;
            }
            
            // Always process the agent run data (will handle updates to existing run)
            if (newRun) {
                this.processAgentRun();
            }
        }
        
        // Handle live steps changes (live mode)
        if (changes['liveSteps'] && this.mode === 'live') {
            const oldSteps = changes['liveSteps'].previousValue;
            const newSteps = changes['liveSteps'].currentValue;
            
            console.log('📊 Live steps changed:', {
                oldCount: oldSteps?.length || 0,
                newCount: newSteps?.length || 0
            });
            
            // Process live steps
            this.processLiveSteps();
        }
        
        // Handle mode changes
        if (changes['mode'] && !changes['mode'].firstChange) {
            const previousMode = changes['mode'].previousValue;
            const currentMode = changes['mode'].currentValue;
            
            console.log('🔄 Mode changed:', { previousMode, currentMode });
            
            // Clear everything when switching modes
            this.processedStepIds.clear();
            this.newlyAddedNodeIds.clear();
            this.expandedStates.clear();
            this.detailsExpandedStates.clear();
            this.clearNodeComponents();
            this.currentStep = null;
            
            // Stop live updates when switching away from live mode
            if (previousMode === 'live' && this.updateSubscription) {
                this.updateSubscription.unsubscribe();
                this.updateSubscription = undefined;
            }
            
            // Process data for the new mode
            if (currentMode === 'historical' && this.agentRun) {
                this.processAgentRun();
            } else if (currentMode === 'live') {
                this.setupLiveUpdates();
            }
        }
    }
    
    ngAfterViewInit(): void {
        this.viewInitialized = true;
        
        console.log('🎯 View initialized, checking for pending data:', {
            hasAgentRun: !!this.agentRun,
            hasLiveSteps: this.liveSteps?.length > 0,
            hasContainer: !!this.executionNodesContainer
        });
        
        // Initial setup for scroll behavior
        if (this.mode === 'live') {
            this.checkIfUserAtBottom();
        }
        
        // If we have data waiting to be rendered, render it now
        if (this.mode === 'historical' && this.agentRun && this.nodeComponentMap.size === 0) {
            console.log('⚡ Processing agent run after view init');
            this.processAgentRun();
        } else if (this.mode === 'live' && this.liveSteps?.length > 0) {
            console.log('⚡ Processing live steps after view init');
            this.processLiveSteps();
        }
    }
    
    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        if (this.updateSubscription) {
            this.updateSubscription.unsubscribe();
            this.updateSubscription = undefined;
        }
        this.clearNodeComponents();
    }
    
    /**
     * Clear all dynamically created components
     */
    private clearNodeComponents(): void {
        this.nodeComponentMap.forEach(ref => ref.destroy());
        this.nodeComponentMap.clear();
        if (this.executionNodesContainer) {
            this.executionNodesContainer.clear();
        }
    }
    
    /**
     * Process agent run for historical mode
     */
    private processAgentRun(): void {
        console.log('⚙️ Processing agent run:', {
            hasAgentRun: !!this.agentRun,
            stepsCount: this.agentRun?.Steps?.length || 0,
            viewInitialized: this.viewInitialized,
            hasContainer: !!this.executionNodesContainer
        });
        
        if (!this.agentRun || !this.viewInitialized || !this.executionNodesContainer) {
            console.warn('⚠️ Cannot process agent run:', {
                agentRun: !this.agentRun ? 'missing' : 'present',
                viewInitialized: this.viewInitialized ? 'yes' : 'no',
                container: !this.executionNodesContainer ? 'missing' : 'present'
            });
            return;
        }
        
        // Clear existing components
        this.clearNodeComponents();
        
        // Render the agent run steps
        if (this.agentRun.Steps && this.agentRun.Steps.length > 0) {
            console.log('🎨 Rendering', this.agentRun.Steps.length, 'steps');
            this.renderSteps(this.agentRun.Steps, 0, []);
            console.log('✅ Finished rendering, container now has', this.executionNodesContainer.length, 'components');
        } else {
            console.warn('⚠️ No steps to render');
        }
        
        // Calculate statistics
        this.calculateStats();
        
        // Trigger change detection after rendering all components
        this.cdr.detectChanges();
    }
    
    /**
     * Process live steps for live mode
     */
    private processLiveSteps(): void {
        console.log('⚙️ Processing live steps:', {
            stepsCount: this.liveSteps?.length || 0,
            viewInitialized: this.viewInitialized,
            hasContainer: !!this.executionNodesContainer
        });
        
        if (!this.liveSteps || !this.viewInitialized || !this.executionNodesContainer) {
            return;
        }
        
        // Append new steps without clearing existing ones
        this.appendNewLiveSteps(this.liveSteps);
        
        // Trigger change detection after appending live steps
        this.cdr.detectChanges();
        
        // Set up live update monitoring if not already set up
        if (!this.updateSubscription) {
            this.setupLiveUpdates();
        }
    }
    
    /**
     * Render steps recursively with proper hierarchy
     */
    private renderSteps(steps: MJAIAgentRunStepEntityExtended[], depth: number, agentPath: string[]): void {
        console.log('🎨 Rendering steps:', {
            count: steps.length,
            depth,
            agentPath
        });
        
        // Sort steps by StepNumber to ensure proper ordering
        const sortedSteps = [...steps].sort((a, b) => (a.StepNumber || 0) - (b.StepNumber || 0));
        
        for (const step of sortedSteps) {
            // Skip if already processed in live mode
            if (this.processedStepIds.has(step.ID)) {
                continue;
            }
            
            // Create component for this step
            this.createStepComponent(step, depth, agentPath);
            
            // Mark as processed
            this.processedStepIds.add(step.ID);
            
            // Handle sub-agent recursion
            if (step.StepType === 'Sub-Agent' && step.SubAgentRun?.Steps) {
                const subAgentPath = [...agentPath, step.SubAgentRun.Agent || 'Sub-Agent'];
                this.renderSteps(step.SubAgentRun.Steps, depth + 1, subAgentPath);
            }
        }
    }
    
    /**
     * Create a component for a step
     */
    private createStepComponent(
        step: MJAIAgentRunStepEntityExtended, 
        depth: number, 
        agentPath: string[]
    ): ComponentRef<ExecutionNodeComponent> {
        // Ensure container exists
        if (!this.executionNodesContainer) {
            console.error('❌ executionNodesContainer not available');
            throw new Error('executionNodesContainer ViewContainerRef not initialized');
        }
        
        const componentRef = this.executionNodesContainer.createComponent(ExecutionNodeComponent);
        const instance = componentRef.instance;
        
        console.log('🔨 Creating component for step:', {
            stepId: step.ID,
            stepName: step.StepName,
            depth,
            containerLength: this.executionNodesContainer.length,
            hostElement: componentRef.location.nativeElement
        });
        
        // Pass the step data with UI state information
        instance.step = step;
        instance.depth = depth;
        instance.agentPath = agentPath;
        instance.expanded = this.expandedStates.get(step.ID) || false;
        instance.detailsExpanded = this.detailsExpandedStates.get(step.ID) || false;
        
        // Subscribe to outputs
        instance.toggleNode.subscribe(() => this.toggleStepExpansion(step));
        instance.toggleDetails.subscribe(() => this.toggleStepDetails(step));
        instance.userInteracted.subscribe(() => this.onUserInteraction());
        
        // Store reference
        this.nodeComponentMap.set(step.ID, componentRef);
        
        // Log the component state after setup
        console.log('✅ Component created and configured:', {
            stepId: step.ID,
            hasData: !!instance.step,
            isAttached: componentRef.hostView.destroyed === false
        });
        
        return componentRef;
    }
    
    /**
     * Toggle step expansion
     */
    private toggleStepExpansion(step: MJAIAgentRunStepEntityExtended): void {
        const currentState = this.expandedStates.get(step.ID) || false;
        this.expandedStates.set(step.ID, !currentState);
        this.userHasInteracted = true;
        
        // Update the component
        const componentRef = this.nodeComponentMap.get(step.ID);
        if (componentRef) {
            componentRef.instance.expanded = !currentState;
            componentRef.changeDetectorRef.detectChanges();
        }
        
        this.cdr.markForCheck();
    }
    
    /**
     * Toggle step details expansion
     */
    private toggleStepDetails(step: MJAIAgentRunStepEntityExtended): void {
        const currentState = this.detailsExpandedStates.get(step.ID) || false;
        this.detailsExpandedStates.set(step.ID, !currentState);
        
        // Update the component
        const componentRef = this.nodeComponentMap.get(step.ID);
        if (componentRef) {
            componentRef.instance.detailsExpanded = !currentState;
            componentRef.changeDetectorRef.detectChanges();
        }
    }
    
    
    /**
     * Get step type CSS class for styling
     */
    private getStepTypeClass(stepType: string): string {
        const typeMap: Record<string, string> = {
            'Validation': 'validation',
            'Prompt': 'prompt',
            'Actions': 'action',
            'Sub-Agent': 'sub-agent',
            'Decision': 'decision',
            'Chat': 'chat'
        };
        return typeMap[stepType] || 'prompt';
    }
    
    /**
     * Get status CSS class for styling
     */
    private getStatusClass(status: string): string {
        const statusMap: Record<string, string> = {
            'Pending': 'pending',
            'Running': 'running',
            'Completed': 'completed',
            'Failed': 'failed',
            'Cancelled': 'failed',
            'Paused': 'pending'
        };
        return statusMap[status] || 'pending';
    }
    
    /**
     * Helper function to safely convert a value to a preview string
     */
    private valueToPreviewString(value: any): string {
        if (value === null || value === undefined) {
            return '';
        }
        if (typeof value === 'object') {
            return JSON.stringify(value, null, 2);
        }
        return String(value);
    }

    /**
     * Create a preview string from data
     */
    private createPreview(data: any): string | undefined {
        if (!data) return undefined;
        
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            
            // Extract meaningful preview and store metadata
            if (parsed.promptName) return `Prompt: ${parsed.promptName}`;
            if (parsed.actionName) {
                // Store action metadata if available
                this.lastParsedActionData = {
                    actionName: parsed.actionName,
                    actionId: parsed.actionId,
                    actionIconClass: parsed.actionIconClass
                };
                return `Action: ${parsed.actionName}`;
            }
            if (parsed.subAgentName) {
                // Store agent metadata if available
                this.lastParsedAgentData = {
                    agentName: parsed.subAgentName,
                    agentId: parsed.subAgentId || parsed.agentId,
                    agentIconClass: parsed.subAgentIconClass || parsed.agentIconClass,
                    agentLogoURL: parsed.subAgentLogoURL || parsed.agentLogoURL
                };
                return `Sub-agent: ${parsed.subAgentName}`;
            }
            if (parsed.message) return this.valueToPreviewString(parsed.message);
            if (parsed.userMessage) return this.valueToPreviewString(parsed.userMessage);
            
            // Show action results clearly
            if (parsed.actionResult) {
                const result = parsed.actionResult;
                let preview = '';
                if (result.success !== undefined) {
                    preview += `Success: ${result.success}\n`;
                }
                if (result.resultCode) {
                    preview += `Result Code: ${result.resultCode}\n`;
                }
                if (result.message) {
                    preview += `Message: ${this.valueToPreviewString(result.message)}\n`;
                }
                if (result.result) {
                    preview += `Result: ${typeof result.result === 'object' ? JSON.stringify(result.result, null, 2) : result.result}`;
                }
                return preview.trim();
            }
            
            // Legacy action result format
            if (parsed.result) {
                return this.valueToPreviewString(parsed.result);
            }
            
            // Show prompt results
            if (parsed.promptResult) {
                const result = parsed.promptResult;
                let preview = '';
                if (result.success !== undefined) {
                    preview += `Success: ${result.success}\n`;
                }
                if (result.content) {
                    preview += `Content: ${this.valueToPreviewString(result.content)}`;
                }
                return preview;
            }
            
            // Fallback to stringified preview
            const str = JSON.stringify(parsed, null, 2);
            return str.length > 500 ? str.substring(0, 500) + '...' : str;
        } catch {
            return typeof data === 'string' ? data : JSON.stringify(data);
        }
    }
    
    /**
     * Extract token count from output data
     */
    private extractTokens(data: any): number | undefined {
        if (!data) return undefined;
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            return parsed.promptResult?.tokensUsed || parsed.tokensUsed;
        } catch {
            return undefined;
        }
    }
    
    /**
     * Extract cost from output data
     */
    private extractCost(data: any): number | undefined {
        if (!data) return undefined;
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            return parsed.promptResult?.totalCost || parsed.totalCost;
        } catch {
            return undefined;
        }
    }
    
    /**
     * Calculate duration from timestamps
     */
    private calculateDuration(start: any, end: any): number | undefined {
        if (!start || !end) return undefined;
        const startTime = new Date(start).getTime();
        const endTime = new Date(end).getTime();
        return endTime - startTime;
    }
    
    /**
     * Set up live updates for real-time execution
     */
    private setupLiveUpdates(): void {
        console.log('⚡ Setting up live updates');
        
        // Process initial live steps if any
        if (this.liveSteps && this.liveSteps.length > 0) {
            this.appendNewLiveSteps(this.liveSteps);
        }
        
        // Set up interval to check for updates (if not already set up)
        if (this.mode === 'live' && !this.updateSubscription) {
            this.updateSubscription = interval(500)
                .pipe(takeUntil(this.destroy$))
                .subscribe(() => {
                    // Update current step indicator
                    this.updateCurrentStep();
                    
                    // Recalculate stats periodically
                    this.calculateStats();
                });
        }
    }
    
    /**
     * Update current step indicator
     */
    private updateCurrentStep(): void {
        // Find the first running step from all rendered components
        let runningStep: MJAIAgentRunStepEntityExtended | null = null;
        
        this.nodeComponentMap.forEach((componentRef, stepId) => {
            const step = componentRef.instance.step;
            if (step && step.Status === 'Running' && !runningStep) {
                runningStep = step;
            }
        });
        
        this.currentStep = runningStep;
        this.cdr.markForCheck();
    }
    
    /**
     * Mark previously new nodes as completed
     */
    private markPreviouslyNewNodesAsComplete(): void {
        // Mark ALL running steps as completed (not just previously new ones)
        // This ensures only the latest step shows as running
        this.nodeComponentMap.forEach((componentRef, stepId) => {
            const step = componentRef.instance.step;
            if (step.Status === 'Running') {
                // Create a copy with updated status
                const updatedStep = Object.assign({}, step, { Status: 'Completed' });
                componentRef.instance.step = updatedStep;
                componentRef.changeDetectorRef.detectChanges();
            }
        });
    }
    
    /**
     * Ensure only the last step in the execution order shows as running
     */
    private ensureOnlyLastStepIsRunning(): void {
        // Find the last step by step number
        let lastRunningStep: { stepId: string; stepNumber: number; componentRef: ComponentRef<ExecutionNodeComponent> } | null = null;
        
        this.nodeComponentMap.forEach((componentRef, stepId) => {
            const step = componentRef.instance.step;
            if (step.Status === 'Running') {
                const stepNumber = step.StepNumber || 0;
                if (!lastRunningStep || stepNumber > lastRunningStep.stepNumber) {
                    lastRunningStep = { stepId, stepNumber, componentRef };
                }
            }
        });
        
        // Set override display status for all running steps
        this.nodeComponentMap.forEach((componentRef, stepId) => {
            const step = componentRef.instance.step;
            if (step.Status === 'Running') {
                // Override display to show as completed, except for the last one
                if (lastRunningStep && stepId === lastRunningStep.stepId) {
                    componentRef.instance.overrideDisplayStatus = 'Running';
                } else {
                    componentRef.instance.overrideDisplayStatus = 'Completed';
                }
                componentRef.changeDetectorRef.detectChanges();
            }
        });
    }
    
    
    /**
     * Calculate execution statistics
     */
    private calculateStats(): void {
        this.stats = {
            totalSteps: 0,
            completedSteps: 0,
            failedSteps: 0,
            totalTokens: 0,
            totalCost: 0,
            stepsByType: {},
            totalDuration: 0,
            totalPrompts: 0
        };
        
        // Use token data from agent run if available
        if (this.agentRun) {
            this.stats.totalTokens = this.agentRun.TotalTokensUsed || 0;
            this.stats.totalCost = this.agentRun.TotalCost || 0;
            
            // Calculate duration
            if (this.agentRun.StartedAt && this.agentRun.CompletedAt) {
                this.stats.totalDuration = new Date(this.agentRun.CompletedAt).getTime() - 
                                          new Date(this.agentRun.StartedAt).getTime();
            }
            
            // Count steps recursively
            if (this.agentRun.Steps) {
                this.countSteps(this.agentRun.Steps);
            }
        }
        
        console.log('📈 Stats calculated:', {
            totalSteps: this.stats.totalSteps,
            totalTokens: this.stats.totalTokens,
            totalCost: this.stats.totalCost
        });
    }
    
    /**
     * Count steps recursively
     */
    private countSteps(steps: MJAIAgentRunStepEntityExtended[]): void {
        for (const step of steps) {
            this.stats.totalSteps++;
            
            // Map to display types for consistency
            const displayType = this.getStepTypeClass(step.StepType);
            this.stats.stepsByType[displayType] = (this.stats.stepsByType[displayType] || 0) + 1;
            
            if (step.Status === 'Completed') this.stats.completedSteps++;
            if (step.Status === 'Failed' || step.Status === 'Cancelled') this.stats.failedSteps++;
            
            // Count prompts
            if (step.StepType === 'Prompt') {
                this.stats.totalPrompts++;
            }
            
            // Recurse for sub-agents
            if (step.StepType === 'Sub-Agent' && step.SubAgentRun?.Steps) {
                this.countSteps(step.SubAgentRun.Steps);
            }
        }
    }
    
    
    
    /**
     * Handle scroll events
     */
    onScroll(event: Event): void {
        if (this.isAutoScrolling) {
            // Ignore scroll events triggered by auto-scrolling
            return;
        }
        
        const element = event.target as HTMLDivElement;
        const isAtBottom = this.isScrolledToBottom(element);
        
        // If user scrolled up from bottom, mark as user interaction
        if (!isAtBottom && this.lastScrollPosition !== element.scrollTop) {
            this.userHasScrolled = true;
            this.userHasInteracted = true;
        }
        
        // If user scrolled back to bottom, reset interaction flags
        if (isAtBottom) {
            this.userHasScrolled = false;
            this.userHasInteracted = false;
        }
        
        this.lastScrollPosition = element.scrollTop;
    }
    
    /**
     * Handle user clicks (interaction detection)
     */
    onUserInteraction(): void {
        // This is called when user clicks anywhere in the execution tree
        // The toggleNode method will set userHasInteracted for specific interactions
    }
    
    /**
     * Check if scroll is at bottom
     */
    private isScrolledToBottom(element: HTMLElement): boolean {
        const threshold = this.scrollThreshold;
        return element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
    }
    
    /**
     * Check if user is at bottom (for initial setup)
     */
    private checkIfUserAtBottom(): void {
        if (!this.executionTreeContainer) return;
        
        const element = this.executionTreeContainer.nativeElement;
        if (this.isScrolledToBottom(element)) {
            this.userHasScrolled = false;
        }
    }
    
    /**
     * Auto-scroll to bottom if user hasn't interacted
     */
    private autoScrollToBottom(): void {
        if (!this.executionTreeContainer || this.userHasInteracted || this.userHasScrolled) {
            return;
        }
        
        const element = this.executionTreeContainer.nativeElement;
        this.isAutoScrolling = true;
        
        // Use smooth scrolling for better UX
        element.scrollTo({
            top: element.scrollHeight,
            behavior: 'smooth'
        });
        
        // Reset auto-scrolling flag after animation
        setTimeout(() => {
            this.isAutoScrolling = false;
        }, 300);
    }
    
    /**
     * Format agent path for display
     */
    formatAgentPath(path: string[]): string {
        return path.join(' → ');
    }
    
    /**
     * Format duration for display
     */
    formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }
    
    /**
     * Get step types for display
     */
    getStepTypes(): string[] {
        return Object.keys(this.stats.stepsByType).sort();
    }
    
    /**
     * Pluralize step type based on count
     */
    pluralizeStepType(type: string, count: number): string {
        if (count === 1) {
            return type;
        }
        
        // Handle special cases
        switch (type.toLowerCase()) {
            case 'analysis':
                return 'Analyses';
            case 'summary':
                return 'Summaries';
            default:
                // Default pluralization - just add 's'
                return type + 's';
        }
    }
    
    /**
     * Format markdown content for display
     */
    formatMarkdown(markdown: string): string {
        // Basic markdown formatting
        // This is a simple implementation - you might want to use a proper markdown library
        let html = markdown;
        
        // Headers
        html = html.replace(/^### (.*$)/gim, '<h4>$1</h4>');
        html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
        html = html.replace(/^# (.*$)/gim, '<h2>$1</h2>');
        
        // Bold
        html = html.replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        html = html.replace(/\*(.*)\*/g, '<em>$1</em>');
        
        // Detect and linkify URLs
        // This regex matches URLs starting with http://, https://, or www.
        const urlRegex = /(?:https?:\/\/|www\.)[^\s<]+/gi;
        html = html.replace(urlRegex, (url) => {
            // Ensure the URL has a protocol
            const href = url.startsWith('http') ? url : `https://${url}`;
            // Truncate long URLs for display
            const displayUrl = url.length > 50 ? url.substring(0, 50) + '...' : url;
            return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #2196f3; text-decoration: underline; font-size: inherit;">${displayUrl}</a>`;
        });
        
        // Line breaks
        html = html.replace(/\n/g, '<br>');
        
        // Lists
        html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        
        // Code blocks
        html = html.replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>');
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        return html;
    }
    
    /**
     * Append new live steps without re-rendering entire tree
     */
    private appendNewLiveSteps(newSteps: MJAIAgentRunStepEntityExtended[]): void {
        if (!newSteps || newSteps.length === 0 || !this.viewInitialized || !this.executionNodesContainer) {
            return;
        }
        
        console.log('📝 Appending', newSteps.length, 'live steps');
        
        // Sort steps by StepNumber
        const sortedSteps = [...newSteps].sort((a, b) => (a.StepNumber || 0) - (b.StepNumber || 0));
        
        // Mark previously new steps as completed
        if (this.newlyAddedNodeIds.size > 0) {
            this.markPreviouslyNewNodesAsComplete();
            this.newlyAddedNodeIds.clear();
        }
        
        let hasNewSteps = false;
        
        for (const step of sortedSteps) {
            // Skip if already processed
            if (this.processedStepIds.has(step.ID)) {
                // Update existing step if status changed
                const componentRef = this.nodeComponentMap.get(step.ID);
                if (componentRef && componentRef.instance.step.Status !== step.Status) {
                    componentRef.instance.step = step;
                    componentRef.changeDetectorRef.detectChanges();
                }
                continue;
            }
            
            // Mark as processed and newly added
            this.processedStepIds.add(step.ID);
            this.newlyAddedNodeIds.add(step.ID);
            hasNewSteps = true;
            
            // Determine depth based on parent hierarchy
            const depth = this.calculateStepDepth(step);
            const agentPath = this.buildAgentPath(step);
            
            // Create component for new step
            this.createStepComponent(step, depth, agentPath);
            
            // Handle sub-agent steps recursively
            if (step.StepType === 'Sub-Agent' && step.SubAgentRun?.Steps) {
                const subAgentPath = [...agentPath, step.SubAgentRun.Agent || 'Sub-Agent'];
                this.renderSteps(step.SubAgentRun.Steps, depth + 1, subAgentPath);
            }
        }
        
        if (hasNewSteps) {
            // After processing all new steps, ensure only the last one shows as running
            this.ensureOnlyLastStepIsRunning();
            
            this.updateCurrentStep();
            this.calculateStats();
            
            // Force change detection to ensure new components are rendered
            this.cdr.detectChanges();
            
            // Auto-scroll if user hasn't interacted
            setTimeout(() => {
                this.autoScrollToBottom();
            }, 100);
        }
    }
    
    /**
     * Calculate step depth based on parent hierarchy
     */
    private calculateStepDepth(step: MJAIAgentRunStepEntityExtended): number {
        // For now, return 0 for top-level steps
        // In live mode, depth information should come from the streaming data
        return 0;
    }
    
    /**
     * Build agent path for a step
     */
    private buildAgentPath(step: MJAIAgentRunStepEntityExtended): string[] {
        // In live mode, agent path should come from streaming data
        // For now, return empty array
        return [];
    }
    
    
    /**
     * Check if execution is complete
     */
    isExecutionComplete(): boolean {
        return this.stats.completedSteps > 0 && 
               this.stats.completedSteps === this.stats.totalSteps - this.stats.failedSteps;
    }
    
    /**
     * Handle view run button click
     */
    onViewRunClick(): void {
        if (this.agentRun) {
            this.viewRunClick.emit({ runId: this.agentRun.ID, runType: 'agent' });
        }
    }
    
    
    /**
     * Expands all nodes that have sub-agent children
     */
    private expandAllNodes(): void {
        console.log('🔄 Auto-expanding nodes with sub-agents');
        
        // Expand all steps that have sub-agent runs
        this.nodeComponentMap.forEach((componentRef, stepId) => {
            const step = componentRef.instance.step;
            if (step.StepType === 'Sub-Agent' && step.SubAgentRun?.Steps?.length) {
                this.expandedStates.set(stepId, true);
                componentRef.instance.expanded = true;
                componentRef.changeDetectorRef.detectChanges();
                console.log(`Expanded sub-agent: ${step.StepName}`);
            }
        });
        
        // Trigger change detection
        this.cdr.markForCheck();
        this.cdr.detectChanges();
        
        // Scroll to top after expansion
        setTimeout(() => {
            this.scrollToTop();
        }, 100);
    }
    
    /**
     * Scroll the execution tree to the top
     */
    private scrollToTop(): void {
        if (this.executionTreeContainer) {
            const element = this.executionTreeContainer.nativeElement;
            element.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }
    }
    
    /**
     * Check if there is content to display
     */
    hasContent(): boolean {
        return this.nodeComponentMap.size > 0;
    }
}