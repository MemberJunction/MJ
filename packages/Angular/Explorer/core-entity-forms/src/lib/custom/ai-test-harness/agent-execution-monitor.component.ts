import { Component, Input, OnChanges, SimpleChanges, OnDestroy, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, ChangeDetectionStrategy, ViewContainerRef, ComponentRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, interval, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ExecutionNodeComponent } from './agent-execution-node.component';

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
 * Represents a node in the execution tree with all necessary display information
 */
export interface ExecutionTreeNode {
    id: string;
    name: string;
    type: 'validation' | 'prompt' | 'action' | 'sub-agent' | 'decision' | 'chat';
    status: 'pending' | 'running' | 'completed' | 'failed';
    startTime?: Date;
    endTime?: Date;
    duration?: number;
    agentPath: string[];
    inputPreview?: string;
    outputPreview?: string;
    error?: string;
    children?: ExecutionTreeNode[];
    expanded?: boolean;
    depth: number;
    tokensUsed?: number;
    cost?: number;
    detailsMarkdown?: string;
    detailsExpanded?: boolean;
    promptCount?: number;
    displayMode?: 'live' | 'historical' | 'both';
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
    selector: 'mj-agent-execution-monitor',
    standalone: true,
    imports: [CommonModule],
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
                        <span class="agent-path">{{ formatAgentPath(currentStep.agentPath) }}</span>
                        <span class="step-name">{{ currentStep.name }}</span>
                    </div>
                }
            </div>

            <!-- Execution Tree -->
            <div class="execution-tree" 
                 #executionTreeContainer
                 [class.has-content]="executionTree.length > 0"
                 (scroll)="onScroll($event)"
                 (click)="onUserInteraction()">
                <!-- Always render the container, but show empty state when no data -->
                <div #executionNodesContainer class="nodes-container">
                    @if (executionTree.length === 0) {
                        <div class="empty-state">
                            <i class="fa-solid fa-hourglass-start"></i>
                            <p>Waiting for execution to begin...</p>
                        </div>
                    }
                </div>
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
                                {{ stats.stepsByType[type] }} {{ type }}
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
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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

        /* Tree Nodes */
        .tree-node {
            margin-bottom: 4px;
        }

        .node-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
            user-select: none;
        }

        .node-header:hover {
            background: #e8f0fe;
            border-color: #2196f3;
        }

        .expand-icon, .expand-spacer {
            width: 16px;
            text-align: center;
            color: #666;
            font-size: 10px;
        }

        .status-icon {
            width: 20px;
            text-align: center;
            font-size: 14px;
        }

        .status-pending { color: #999; }
        .status-running { color: #2196f3; }
        .status-completed { color: #4caf50; }
        .status-failed { color: #f44336; }

        .type-icon {
            width: 20px;
            text-align: center;
            font-size: 14px;
            color: #666;
        }

        .node-name {
            flex: 1;
            font-size: 13px;
            font-weight: 500;
            color: #1a1a1a;
        }

        .node-duration {
            font-size: 12px;
            color: #666;
            font-weight: 500;
        }

        .node-metrics {
            display: flex;
            gap: 12px;
            font-size: 12px;
        }

        .tokens {
            color: #666;
        }

        .cost {
            color: #2196f3;
            font-weight: 500;
        }

        /* Node Details */
        .node-details {
            margin: 8px 0 8px 44px;
            padding: 12px;
            background: #f5f5f5;
            border-radius: 4px;
            font-size: 12px;
        }

        .detail-section {
            margin-bottom: 8px;
        }

        .detail-section:last-child {
            margin-bottom: 0;
        }

        .detail-section.error {
            color: #d32f2f;
        }

        .detail-label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 600;
            margin-bottom: 4px;
            color: #666;
        }

        .detail-section.error .detail-label {
            color: #d32f2f;
        }

        .detail-label i {
            font-size: 12px;
        }

        .detail-content {
            padding-left: 18px;
            color: #333;
            line-height: 1.4;
            white-space: pre-wrap;
            word-break: break-word;
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

        /* Details Toggle Button */
        .details-toggle {
            margin-left: 8px;
            padding: 2px 6px;
            background: transparent;
            border: 1px solid #ddd;
            border-radius: 3px;
            cursor: pointer;
            font-size: 10px;
            color: #666;
            transition: all 0.2s ease;
        }
        
        .details-toggle:hover {
            background: #f0f0f0;
            border-color: #2196f3;
            color: #2196f3;
        }
        
        /* Markdown Details Section */
        .markdown-details {
            margin: 8px 0 8px 44px;
            padding: 12px;
            background: #f9fafb;
            border-left: 3px solid #2196f3;
            border-radius: 0 4px 4px 0;
            font-size: 13px;
            line-height: 1.6;
        }
        
        .markdown-details h2 {
            font-size: 16px;
            margin: 0 0 8px 0;
            color: #1a1a1a;
        }
        
        .markdown-details h3 {
            font-size: 14px;
            margin: 8px 0 6px 0;
            color: #333;
        }
        
        .markdown-details h4 {
            font-size: 13px;
            margin: 6px 0 4px 0;
            color: #555;
        }
        
        .markdown-details ul {
            margin: 4px 0;
            padding-left: 20px;
        }
        
        .markdown-details li {
            margin: 2px 0;
        }
        
        .markdown-details code {
            background: #e8f0fe;
            padding: 1px 4px;
            border-radius: 3px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 12px;
        }
        
        .markdown-details pre {
            background: #f5f5f5;
            padding: 8px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 8px 0;
        }
        
        .markdown-details pre code {
            background: none;
            padding: 0;
        }
        
        .markdown-details strong {
            font-weight: 600;
            color: #1a1a1a;
        }
        
        .markdown-details em {
            font-style: italic;
            color: #555;
        }

        /* Button styling for execution history toggle */
        .execution-history-toggle {
            background: transparent;
            border: none;
            padding: 4px 8px;
            margin-left: 4px;
            cursor: pointer;
            color: #666;
            font-size: 12px;
            border-radius: 3px;
            transition: all 0.2s ease;
        }
        
        .execution-history-toggle:hover {
            background: #e3f2fd;
            color: #2196f3;
        }

        /* Responsive */
        @media (max-width: 768px) {
            .monitor-header {
                padding: 12px;
            }

            .execution-tree {
                padding: 12px;
            }

            .node-header {
                padding: 6px 8px;
                gap: 6px;
            }

            .node-metrics {
                display: none;
            }
            
            .markdown-details {
                margin-left: 20px;
                font-size: 12px;
            }
        }
    `]
})
export class AgentExecutionMonitorComponent implements OnChanges, OnDestroy, AfterViewInit {
    @Input() mode: ExecutionMonitorMode = 'historical';
    @Input() executionData: any = null; // Can be live updates or historical data
    @Input() autoExpand: boolean = true; // Auto-expand nodes in live mode
    
    @ViewChild('executionTreeContainer') executionTreeContainer!: ElementRef<HTMLDivElement>;
    @ViewChild('executionNodesContainer', { read: ViewContainerRef }) executionNodesContainer!: ViewContainerRef;
    
    executionTree: ExecutionTreeNode[] = [];
    currentStep: ExecutionTreeNode | null = null;
    
    // Track component references for dynamic components
    private nodeComponentMap = new Map<string, ComponentRef<ExecutionNodeComponent>>();
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
    
    private destroy$ = new Subject<void>();
    private updateSubscription?: Subscription;
    
    constructor(private cdr: ChangeDetectorRef) {}
    
    ngOnChanges(changes: SimpleChanges): void {
        
        if (changes['executionData']) {
            // Check if we're starting a new live execution (empty liveSteps array)
            if (this.mode === 'live' && 
                this.executionData && 
                this.executionData.liveSteps && 
                this.executionData.liveSteps.length === 0 &&
                this.executionTree.length > 0) {
                // Clear everything for new run
                this.processedStepIds.clear();
                this.newlyAddedNodeIds.clear();
                this.clearNodeComponents();
                this.executionTree = [];
                this.currentStep = null;
                this.calculateStats();
            }
            
            // Process data even if it's empty/null (for initial setup)
            this.processExecutionData();
        }
        
        // Handle mode changes
        if (changes['mode'] && !changes['mode'].firstChange) {
            // Clear live nodes when switching from live to historical
            if (changes['mode'].previousValue === 'live' && changes['mode'].currentValue === 'historical') {
                // Stop live updates
                if (this.updateSubscription) {
                    this.updateSubscription.unsubscribe();
                    this.updateSubscription = undefined;
                }
                // Clear all tracking data from live mode
                this.processedStepIds.clear();
                this.newlyAddedNodeIds.clear();
                this.clearNodeComponents();
                this.executionTree = [];
            }
            this.processExecutionData();
        }
    }
    
    ngAfterViewInit(): void {
        this.viewInitialized = true;
        
        
        // Initial setup for scroll behavior
        if (this.mode === 'live') {
            this.checkIfUserAtBottom();
        }
        
        // If we have data waiting to be rendered, render it now
        if (this.executionData && this.executionTree.length === 0) {
            this.processExecutionData();
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
     * Process execution data based on mode
     */
    private processExecutionData(): void {
        
        if (this.mode === 'historical') {
            // Clear processed step IDs when processing historical data
            this.processedStepIds.clear();
            // Process historical data
            this.buildTreeFromHistoricalData();
        } else {
            // For live mode, only clear if we don't have existing data
            // This prevents losing state when switching tabs
            if (this.executionTree.length === 0) {
                this.processedStepIds.clear();
                this.newlyAddedNodeIds.clear();
            }
            // Set up live updates
            this.setupLiveUpdates();
        }
        
        // Only calculate stats if we have data
        if (this.executionTree.length > 0) {
            this.calculateStats();
        }
    }
    
    /**
     * Build tree from historical execution data
     */
    private buildTreeFromHistoricalData(): void {
        
        if (!this.executionData) {
            this.clearNodeComponents();
            this.executionTree = [];
            return;
        }
        
        // Clear existing components for full rebuild
        this.clearNodeComponents();
        
        // Handle executionTree format - historical mode should only use saved database data
        if (this.executionData.executionTree) {
            const allNodes = this.convertExecutionTree(this.executionData.executionTree);
            // Filter out live-only nodes in historical mode
            this.executionTree = this.filterNodesForMode(allNodes, 'historical');
        } else if (this.executionData.steps) {
            // Handle legacy steps format
            const allNodes = this.convertLegacySteps(this.executionData.steps);
            this.executionTree = this.filterNodesForMode(allNodes, 'historical');
        } else {
            this.executionTree = [];
        }
        
        
        // Render the tree using dynamic components
        if (this.executionNodesContainer) {
            this.renderTree();
        }
    }
    
    /**
     * Render the execution tree using dynamic components
     */
    private renderTree(): void {
        
        if (!this.executionNodesContainer) {
            console.warn('📊 Execution Monitor: No container available for rendering');
            return;
        }
        
        // Clear and recreate all components for historical view
        this.clearNodeComponents();
        
        
        // Create components for each root node
        for (const node of this.executionTree) {
            this.createNodeComponent(node, this.executionNodesContainer);
        }
        
    }
    
    /**
     * Create a component for a node and its children
     */
    private createNodeComponent(node: ExecutionTreeNode, container: ViewContainerRef): ComponentRef<ExecutionNodeComponent> {
        const componentRef = container.createComponent(ExecutionNodeComponent);
        const instance = componentRef.instance;
        
        // Set inputs
        instance.node = node;
        
        // No need to apply margin here - it's handled in the component template
        
        // Subscribe to outputs
        instance.toggleNode.subscribe((n: ExecutionTreeNode) => this.toggleNode(n));
        instance.userInteracted.subscribe(() => this.onUserInteraction());
        
        // Store reference
        this.nodeComponentMap.set(node.id, componentRef);
        
        // Force immediate change detection to ensure styles are applied
        componentRef.changeDetectorRef.markForCheck();
        componentRef.changeDetectorRef.detectChanges();
        
        return componentRef;
    }
    
    /**
     * Convert new execution tree format to display nodes
     */
    private convertExecutionTree(nodes: any[], depth: number = 0): ExecutionTreeNode[] {
        // Sort nodes by StepNumber before processing
        const sortedNodes = [...nodes].sort((a, b) => {
            const aStepNum = a.step?.StepNumber || 0;
            const bStepNum = b.step?.StepNumber || 0;
            return aStepNum - bStepNum;
        });
        
        return sortedNodes.map((node, index) => {
            // Parse the step name for markdown content (same as live steps)
            const stepName = node.step?.StepName || 'Unknown Step';
            let name = stepName;
            let detailsMarkdown: string | undefined;
            
            // Check if the step name contains markdown (indicated by newlines or markdown syntax)
            if (stepName.includes('\n') || stepName.includes('**') || stepName.includes('##')) {
                // Split by newline and use first line as name
                const lines = stepName.split('\n');
                name = lines[0].trim();
                // Rest is markdown details
                if (lines.length > 1) {
                    detailsMarkdown = lines.slice(1).join('\n').trim();
                }
            }
            
            // Determine display mode based on the step content
            let displayMode: 'live' | 'historical' | 'both' = 'both';
            
            // Progress messages that should only show in live mode
            if (name.includes('Executing') && name.includes('action') && !name.startsWith('Execute Action:')) {
                displayMode = 'live';
            } else if (name.includes("Executing agent's initial prompt")) {
                displayMode = 'live';
            } else if (name.includes('Re-executing agent prompt with additional context')) {
                displayMode = 'live';
            }
            
            const treeNode: ExecutionTreeNode = {
                id: node.step?.ID || `node-${Date.now()}-${index}`,
                name: name,
                type: this.mapStepType(node.executionType || node.step?.StepType),
                status: this.mapStepStatus(node.step?.Status),
                startTime: node.startTime ? new Date(node.startTime) : undefined,
                endTime: node.endTime ? new Date(node.endTime) : undefined,
                duration: node.durationMs,
                agentPath: node.agentHierarchy || [],
                inputPreview: this.createPreview(node.inputData),
                outputPreview: this.createPreview(node.outputData),
                error: node.step?.ErrorMessage,
                expanded: false,
                depth: node.depth !== undefined ? node.depth : depth,  // Use node.depth if available, fallback to recursion depth
                tokensUsed: this.extractTokens(node.outputData),
                cost: this.extractCost(node.outputData),
                detailsMarkdown: detailsMarkdown,
                detailsExpanded: false,
                children: node.children ? this.convertExecutionTree(node.children, node.depth !== undefined ? node.depth + 1 : depth + 1) : undefined,
                displayMode: displayMode
            };
            
            return treeNode;
        });
    }
    
    /**
     * Convert legacy step format to tree nodes
     */
    private convertLegacySteps(steps: any[]): ExecutionTreeNode[] {
        return steps.map((step, index) => {
            // Parse the step name for markdown content
            const stepName = step.StepName || '';
            let name = stepName;
            let detailsMarkdown: string | undefined;
            
            // Check if the step name contains markdown
            if (stepName.includes('\n') || stepName.includes('**') || stepName.includes('##')) {
                const lines = stepName.split('\n');
                name = lines[0].trim();
                if (lines.length > 1) {
                    detailsMarkdown = lines.slice(1).join('\n').trim();
                }
            }
            
            return {
                id: step.ID || `step-${index}`,
                name: name,
                type: this.mapStepType(step.StepType),
                status: this.mapStepStatus(step.Status),
                startTime: step.StartedAt ? new Date(step.StartedAt) : undefined,
                endTime: step.CompletedAt ? new Date(step.CompletedAt) : undefined,
                duration: this.calculateDuration(step.StartedAt, step.CompletedAt),
                agentPath: [],
                inputPreview: this.createPreview(step.InputData),
                outputPreview: this.createPreview(step.OutputData),
                error: step.ErrorMessage,
                expanded: false,
                depth: 0,
                detailsMarkdown: detailsMarkdown,
                detailsExpanded: false
            };
        });
    }
    
    /**
     * Map step type strings to our type enum
     */
    private mapStepType(type: string): ExecutionTreeNode['type'] {
        const typeMap: Record<string, ExecutionTreeNode['type']> = {
            'validation': 'validation',
            'prompt': 'prompt',
            'action': 'action',
            'subagent': 'sub-agent',
            'sub-agent': 'sub-agent',
            'decision': 'decision',
            'chat': 'chat'
        };
        return typeMap[type?.toLowerCase()] || 'prompt';
    }
    
    /**
     * Map status strings to our status enum
     */
    private mapStepStatus(status: string): ExecutionTreeNode['status'] {
        const statusMap: Record<string, ExecutionTreeNode['status']> = {
            'pending': 'pending',
            'running': 'running',
            'completed': 'completed',
            'failed': 'failed',
            'error': 'failed'
        };
        return statusMap[status?.toLowerCase()] || 'pending';
    }
    
    /**
     * Create a preview string from data
     */
    private createPreview(data: any): string | undefined {
        if (!data) return undefined;
        
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            
            // Extract meaningful preview
            if (parsed.promptName) return `Prompt: ${parsed.promptName}`;
            if (parsed.actionName) return `Action: ${parsed.actionName}`;
            if (parsed.subAgentName) return `Sub-agent: ${parsed.subAgentName}`;
            if (parsed.message) return parsed.message;
            if (parsed.userMessage) return parsed.userMessage;
            
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
                    preview += `Message: ${result.message}\n`;
                }
                if (result.result) {
                    preview += `Result: ${typeof result.result === 'object' ? JSON.stringify(result.result, null, 2) : result.result}`;
                }
                return preview.trim();
            }
            
            // Legacy action result format
            if (parsed.result) {
                if (typeof parsed.result === 'object') {
                    return JSON.stringify(parsed.result, null, 2);
                }
                return String(parsed.result);
            }
            
            // Show prompt results
            if (parsed.promptResult) {
                const result = parsed.promptResult;
                let preview = '';
                if (result.success !== undefined) {
                    preview += `Success: ${result.success}\n`;
                }
                if (result.content) {
                    preview += `Content: ${typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)}`;
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
        
        // Handle live streaming data format
        if (this.executionData && this.executionData.liveSteps) {
            // Only clear and rebuild if we don't have existing data
            if (this.executionTree.length === 0) {
                this.clearNodeComponents();
                this.executionTree = [];
                // Then append all steps
                this.appendNewLiveSteps(this.executionData.liveSteps);
            } else {
                // Just append new steps without clearing
                this.appendNewLiveSteps(this.executionData.liveSteps);
            }
        }
        
        // Set up interval to monitor for changes (if not already set up)
        if (this.mode === 'live' && !this.updateSubscription) {
            this.updateSubscription = interval(500)
                .pipe(takeUntil(this.destroy$))
                .subscribe(() => {
                    // Check for new live steps and update tree
                    if (this.executionData && this.executionData.liveSteps) {
                        // Instead of replacing entire tree, append new nodes
                        this.appendNewLiveSteps(this.executionData.liveSteps);
                        this.calculateStats();
                    }
                    this.updateCurrentStep();
                });
        }
    }
    
    /**
     * Convert live steps format to execution tree format
     */
    private convertLiveStepsToTree(liveSteps: any[]): ExecutionTreeNode[] {
        const treeNodes: ExecutionTreeNode[] = [];
        const nodeMap = new Map<string, ExecutionTreeNode>();
        
        // Sort steps by StepNumber to ensure proper ordering
        const sortedSteps = [...liveSteps].sort((a, b) => {
            const aStepNum = a.step?.StepNumber || 0;
            const bStepNum = b.step?.StepNumber || 0;
            return aStepNum - bStepNum;
        });
        
        for (const step of sortedSteps) {
            // Parse the step name for markdown content
            const stepName = step.step?.StepName || 'Processing...';
            let name = stepName;
            let detailsMarkdown: string | undefined;
            
            // Check if the step name contains markdown (indicated by newlines or markdown syntax)
            if (stepName.includes('\n') || stepName.includes('**') || stepName.includes('##')) {
                // Split by newline and use first line as name
                const lines = stepName.split('\n');
                name = lines[0].trim();
                // Rest is markdown details
                if (lines.length > 1) {
                    detailsMarkdown = lines.slice(1).join('\n').trim();
                }
            }
            
            const node: ExecutionTreeNode = {
                id: step.step?.ID || `live-${Date.now()}-${Math.random()}`,
                name: name,
                type: this.mapStepType(step.executionType || step.step?.StepType),
                status: 'running', // Live steps are always running
                startTime: step.startTime ? new Date(step.startTime) : new Date(),
                agentPath: step.agentHierarchy || [],
                expanded: false,
                depth: step.depth || 0,
                detailsMarkdown: detailsMarkdown,
                detailsExpanded: false
            };
            // Store in map for hierarchy building
            nodeMap.set(node.id, node);
            
            // Handle hierarchy by depth
            if (step.depth === 0) {
                treeNodes.push(node);
            } else {
                // Find parent based on depth and agent hierarchy
                let parent: ExecutionTreeNode | undefined;
                
                // Look for a node at depth-1 that could be the parent
                nodeMap.forEach((candidate) => {
                    if (candidate.depth === step.depth - 1) {
                        parent = candidate;
                    }
                });
                
                if (parent) {
                    if (!parent.children) {
                        parent.children = [];
                    }
                    parent.children.push(node);
                }
            }
            
            nodeMap.set(node.id, node);
        }
        
        return treeNodes;
    }
    
    /**
     * Update current step indicator
     */
    private updateCurrentStep(): void {
        // Find the first running step
        const findRunning = (nodes: ExecutionTreeNode[]): ExecutionTreeNode | null => {
            for (const node of nodes) {
                if (node.status === 'running') return node;
                if (node.children) {
                    const child = findRunning(node.children);
                    if (child) return child;
                }
            }
            return null;
        };
        
        this.currentStep = findRunning(this.executionTree);
        this.cdr.markForCheck();
    }
    
    /**
     * Mark previously new nodes as completed
     */
    private markPreviouslyNewNodesAsComplete(): void {
        // Only mark nodes that were previously marked as newly added
        for (const nodeId of this.newlyAddedNodeIds) {
            const node = this.findNodeById(this.executionTree, nodeId);
            if (node && node.status === 'running') {
                node.status = 'completed';
                
                // Update the component if it exists
                const componentRef = this.nodeComponentMap.get(nodeId);
                if (componentRef) {
                    componentRef.instance.node = { ...node };
                    componentRef.changeDetectorRef.detectChanges();
                }
            }
        }
    }
    
    /**
     * Find a node by ID in the tree
     */
    private findNodeById(nodes: ExecutionTreeNode[], id: string): ExecutionTreeNode | null {
        for (const node of nodes) {
            if (node.id === id) {
                return node;
            }
            if (node.children) {
                const found = this.findNodeById(node.children, id);
                if (found) return found;
            }
        }
        return null;
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
        
        // Check if we have agent run data with token information
        if (this.executionData?.agentRun) {
            // Use token data from agent run if available
            this.stats.totalTokens = this.executionData.agentRun.TotalTokensUsed || 0;
            this.stats.totalCost = this.executionData.agentRun.TotalCost || 0;
        }
        
        const processNode = (node: ExecutionTreeNode) => {
            this.stats.totalSteps++;
            
            if (node.status === 'completed') this.stats.completedSteps++;
            if (node.status === 'failed') this.stats.failedSteps++;
            
            // Only accumulate tokens if we don't have agent run data
            if (!this.executionData?.agentRun) {
                if (node.tokensUsed) this.stats.totalTokens += node.tokensUsed;
                if (node.cost) this.stats.totalCost += node.cost;
            }
            
            if (node.duration) this.stats.totalDuration! += node.duration;
            
            this.stats.stepsByType[node.type] = (this.stats.stepsByType[node.type] || 0) + 1;
            
            // Count prompts
            if (node.type === 'prompt' || node.promptCount) {
                this.stats.totalPrompts += node.promptCount || 1;
            }
            
            if (node.children) {
                node.children.forEach(child => processNode(child));
            }
        };
        
        this.executionTree.forEach(node => processNode(node));
    }
    
    /**
     * Toggle node expansion
     */
    toggleNode(node: ExecutionTreeNode): void {
        const nodeInTree = this.findNodeById(this.executionTree, node.id);
        if (nodeInTree && this.hasExpandableContent(nodeInTree)) {
            nodeInTree.expanded = !nodeInTree.expanded;
            this.userHasInteracted = true;
            
            // Update the component's node reference to trigger change detection
            const componentRef = this.nodeComponentMap.get(node.id);
            if (componentRef) {
                componentRef.instance.node = { ...nodeInTree };
                componentRef.changeDetectorRef.detectChanges();
            }
            
            this.cdr.markForCheck();
        }
    }
    
    /**
     * Check if node has expandable content
     */
    private hasExpandableContent(node: ExecutionTreeNode): boolean {
        return !!(node.children && node.children.length > 0) ||
               node.type === 'sub-agent' || 
               node.type === 'action' || 
               !!node.inputPreview || 
               !!node.outputPreview || 
               !!node.error || 
               !!node.detailsMarkdown;
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
    private appendNewLiveSteps(liveSteps: any[]): void {
        
        if (!liveSteps || liveSteps.length === 0) return;
        
        // If view is not initialized yet, wait for it
        if (!this.viewInitialized || !this.executionNodesContainer) {
            return;
        }
        
        // Sort live steps by stepNumber to ensure proper ordering
        const sortedSteps = [...liveSteps].sort((a, b) => {
            const aStepNum = a.step?.StepNumber || 0;
            const bStepNum = b.step?.StepNumber || 0;
            return aStepNum - bStepNum;
        });
        
        // Create a map of existing nodes by ID for quick lookup
        const nodeMap = new Map<string, ExecutionTreeNode>();
        this.buildNodeMap(this.executionTree, nodeMap);
        
        // First pass: identify which steps are truly NEW (not in processedStepIds)
        const trulyNewStepIds = new Set<string>();
        for (const step of sortedSteps) {
            const stepId = step.step?.ID || this.generateStepId(step);
            if (!this.processedStepIds.has(stepId)) {
                trulyNewStepIds.add(stepId);
            }
        }
        
        // Only mark previously new nodes as complete if we have truly new steps
        if (trulyNewStepIds.size > 0 && this.newlyAddedNodeIds.size > 0) {
            this.markPreviouslyNewNodesAsComplete();
            // Clear the set for new additions
            this.newlyAddedNodeIds.clear();
        }
        
        let hasNewNodes = false;
        
        for (const step of sortedSteps) {
            // Generate a stable ID based on step content to avoid duplicates
            const stepId = step.step?.ID || this.generateStepId(step);
            
            // Skip if we've already processed this exact step
            if (this.processedStepIds.has(stepId)) {
                continue;
            }
            
            // Mark as processed
            this.processedStepIds.add(stepId);
            
            // Check if this node already exists
            const existingNode = nodeMap.get(stepId);
            if (existingNode) {
                // Update existing node in the component
                const componentRef = this.nodeComponentMap.get(stepId);
                if (componentRef) {
                    // Preserve current UI state
                    const currentExpanded = existingNode.expanded;
                    const currentDetailsExpanded = existingNode.detailsExpanded;
                    
                    const updatedStatus = step.step?.Status ? 
                        this.mapStepStatus(step.step.Status) : 
                        (step.endTime || step.outputData ? 'completed' : existingNode.status);
                    
                    if (existingNode.status !== updatedStatus) {
                        existingNode.status = updatedStatus;
                    }
                    
                    if (step.endTime && !existingNode.endTime) {
                        existingNode.endTime = new Date(step.endTime);
                        existingNode.duration = step.durationMs;
                    }
                    
                    // Update output data if available
                    if (step.outputData && !existingNode.outputPreview) {
                        existingNode.outputPreview = this.createPreview(step.outputData);
                        existingNode.tokensUsed = this.extractTokens(step.outputData);
                        existingNode.cost = this.extractCost(step.outputData);
                    }
                    
                    // Restore UI state
                    existingNode.expanded = currentExpanded;
                    existingNode.detailsExpanded = currentDetailsExpanded;
                    
                    // Update the component's node reference
                    // Important: We need to update the node object directly to ensure
                    // Angular detects changes to style bindings that depend on node.depth
                    const nodeInstance = componentRef.instance.node;
                    Object.assign(nodeInstance, existingNode);
                    
                    // Mark for check to ensure Angular updates the view
                    componentRef.changeDetectorRef.markForCheck();
                    componentRef.changeDetectorRef.detectChanges();
                }
            } else {
                // Create new node
                const newNode = this.createNodeFromLiveStep(step);
                
                // Debug: Log if depth is missing
                if (newNode.depth === 0 && step.depth !== 0) {
                    console.warn('Node depth was reset to 0 for step:', step);
                }
                
                if (step.depth === 0) {
                    // Add to tree and create component
                    this.executionTree.push(newNode);
                    this.createNodeComponent(newNode, this.executionNodesContainer);
                } else {
                    // Find parent and add as child
                    const parentNode = this.findParentNode(this.executionTree, newNode);
                    if (parentNode) {
                        if (!parentNode.children) {
                            parentNode.children = [];
                        }
                        parentNode.children.push(newNode);
                        
                        // Update parent component to show new child
                        const parentComponentRef = this.nodeComponentMap.get(parentNode.id);
                        if (parentComponentRef) {
                            // Update the parent node object directly
                            const parentNodeInstance = parentComponentRef.instance.node;
                            Object.assign(parentNodeInstance, parentNode);
                            parentComponentRef.changeDetectorRef.markForCheck();
                            parentComponentRef.changeDetectorRef.detectChanges();
                        }
                    } else {
                        // If no parent found, add as root
                        this.executionTree.push(newNode);
                        this.createNodeComponent(newNode, this.executionNodesContainer);
                    }
                }
                
                hasNewNodes = true;
                // Only track as newly added if it's truly new
                if (trulyNewStepIds.has(stepId)) {
                    this.newlyAddedNodeIds.add(newNode.id);
                }
            }
        }
        
        if (hasNewNodes) {
            // Update current step
            this.updateCurrentStep();
            
            // Recalculate stats
            this.calculateStats();
            
            // Trigger change detection
            this.cdr.markForCheck();
            
            // Auto-scroll if user hasn't interacted
            setTimeout(() => {
                this.autoScrollToBottom();
            }, 100);
        }
    }
    
    /**
     * Generate a stable ID for a step based on its content
     */
    private generateStepId(step: any): string {
        // Create a stable ID based on step properties that should be unique
        const parts = [
            step.executionType || 'unknown',
            step.depth || 0,
            step.step?.StepName || '',
            step.startTime || Date.now()
        ];
        return `live-${parts.join('-').replace(/[^a-zA-Z0-9-]/g, '')}`;
    }
    
    /**
     * Find parent node based on depth
     */
    private findParentNode(nodes: ExecutionTreeNode[], childNode: ExecutionTreeNode): ExecutionTreeNode | null {
        // We need to find the most recent node at the parent depth
        // that could logically be this node's parent
        let potentialParent: ExecutionTreeNode | null = null;
        
        const findParentRecursive = (searchNodes: ExecutionTreeNode[]): ExecutionTreeNode | null => {
            // Process nodes in reverse order to find the most recent one
            for (let i = searchNodes.length - 1; i >= 0; i--) {
                const node = searchNodes[i];
                
                // Check if this node could be the parent based on depth
                if (node.depth === childNode.depth - 1) {
                    // Special handling for sub-agent execution steps
                    if (childNode.agentPath && childNode.agentPath.length > node.agentPath.length) {
                        // This child belongs to a sub-agent
                        // Look for the most recent sub-agent delegation node
                        if (node.type === 'sub-agent' || node.name.includes('Delegating to')) {
                            return node;
                        }
                    }
                    // Keep track of the most recent node at the correct depth
                    if (!potentialParent) {
                        potentialParent = node;
                    }
                }
                
                // Search children recursively
                if (node.children && node.children.length > 0) {
                    const foundInChildren = findParentRecursive(node.children);
                    if (foundInChildren) return foundInChildren;
                }
            }
            return null;
        };
        
        const found = findParentRecursive(nodes);
        return found || potentialParent;
    }
    
    /**
     * Filter nodes based on display mode
     */
    private filterNodesForMode(nodes: ExecutionTreeNode[], mode: ExecutionMonitorMode): ExecutionTreeNode[] {
        return nodes.filter(node => {
            // If no displayMode is set, default to showing in both modes
            if (!node.displayMode) {
                return true;
            }
            
            // Show if displayMode is 'both' or matches current mode
            if (node.displayMode === 'both' || node.displayMode === mode) {
                // Filter children recursively
                if (node.children) {
                    node.children = this.filterNodesForMode(node.children, mode);
                }
                return true;
            }
            
            return false;
        });
    }
    
    /**
     * Build a map of nodes by ID for quick lookup
     */
    private buildNodeMap(nodes: ExecutionTreeNode[], map: Map<string, ExecutionTreeNode>): void {
        for (const node of nodes) {
            map.set(node.id, node);
            if (node.children) {
                this.buildNodeMap(node.children, map);
            }
        }
    }
    
    /**
     * Create a single node from a live step
     */
    private createNodeFromLiveStep(step: any): ExecutionTreeNode {
        const stepName = step.step?.StepName || 'Processing...';
        let name = stepName;
        let detailsMarkdown: string | undefined;
        
        // Check if the step name contains markdown
        if (stepName.includes('\n') || stepName.includes('**') || stepName.includes('##')) {
            const lines = stepName.split('\n');
            name = lines[0].trim();
            if (lines.length > 1) {
                detailsMarkdown = lines.slice(1).join('\n').trim();
            }
        }
        
        // For live steps, always start as running
        // The status will be updated to completed in markPreviouslyNewNodesAsComplete
        let status: ExecutionTreeNode['status'] = 'running';
        if (step.step?.Status) {
            // Only use explicit status if it's failed
            const mappedStatus = this.mapStepStatus(step.step.Status);
            if (mappedStatus === 'failed') {
                status = 'failed';
            }
        }
        
        // Determine display mode based on the step content
        let displayMode: 'live' | 'historical' | 'both' = 'both';
        
        // Progress messages that should only show in live mode
        if (name.includes('Executing') && name.includes('action') && !name.startsWith('Execute Action:')) {
            displayMode = 'live';
        } else if (name.includes("Executing agent's initial prompt")) {
            displayMode = 'live';
        } else if (name.includes('Re-executing agent prompt with additional context')) {
            displayMode = 'live';
        }
        
        // Check displayMode from metadata if available
        if (step.metadata?.displayMode) {
            displayMode = step.metadata.displayMode;
        }
        
        return {
            id: step.step?.ID || this.generateStepId(step),
            name: name,
            type: this.mapStepType(step.executionType || step.step?.StepType),
            status: status,
            startTime: step.startTime ? new Date(step.startTime) : new Date(),
            endTime: step.endTime ? new Date(step.endTime) : undefined,
            duration: step.durationMs,
            agentPath: step.agentHierarchy || [],
            expanded: false,
            depth: step.depth || 0,
            detailsMarkdown: detailsMarkdown,
            detailsExpanded: false,
            inputPreview: this.createPreview(step.inputData),
            outputPreview: this.createPreview(step.outputData),
            tokensUsed: this.extractTokens(step.outputData),
            cost: this.extractCost(step.outputData),
            displayMode: displayMode
        };
    }
    
    /**
     * Collect all node IDs in the tree
     */
    private collectNodeIds(nodes: ExecutionTreeNode[], ids: Set<string>): void {
        for (const node of nodes) {
            ids.add(node.id);
            if (node.children) {
                this.collectNodeIds(node.children, ids);
            }
        }
    }
    
    /**
     * Preserve expanded state of all nodes
     */
    private preserveExpandedState(
        nodes: ExecutionTreeNode[], 
        expandedState: Map<string, boolean>,
        detailsExpandedState: Map<string, boolean>
    ): void {
        for (const node of nodes) {
            if (node.expanded !== undefined) {
                expandedState.set(node.id, node.expanded);
            }
            if (node.detailsExpanded !== undefined) {
                detailsExpandedState.set(node.id, node.detailsExpanded);
            }
            if (node.children) {
                this.preserveExpandedState(node.children, expandedState, detailsExpandedState);
            }
        }
    }
    
    /**
     * Restore expanded state of all nodes
     */
    private restoreExpandedState(
        nodes: ExecutionTreeNode[], 
        expandedState: Map<string, boolean>,
        detailsExpandedState: Map<string, boolean>
    ): void {
        for (const node of nodes) {
            const expanded = expandedState.get(node.id);
            if (expanded !== undefined) {
                node.expanded = expanded;
            }
            const detailsExpanded = detailsExpandedState.get(node.id);
            if (detailsExpanded !== undefined) {
                node.detailsExpanded = detailsExpanded;
            }
            if (node.children) {
                this.restoreExpandedState(node.children, expandedState, detailsExpandedState);
            }
        }
    }
    
    /**
     * Append a node to its parent based on depth
     */
    private appendToParent(nodes: ExecutionTreeNode[], newNode: ExecutionTreeNode): boolean {
        for (const node of nodes) {
            if (node.depth === newNode.depth - 1) {
                if (!node.children) {
                    node.children = [];
                }
                node.children.push(newNode);
                return true;
            }
            if (node.children && this.appendToParent(node.children, newNode)) {
                return true;
            }
        }
        return false;
    }
}