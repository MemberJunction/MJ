import { Component, Input, OnChanges, SimpleChanges, OnDestroy, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, interval, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ExecutionNodeComponent } from './agent-execution-node.component';

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
    imports: [CommonModule, ExecutionNodeComponent],
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
                @if (executionTree.length === 0) {
                    <div class="empty-state">
                        <i class="fa-solid fa-hourglass-start"></i>
                        <p>Waiting for execution to begin...</p>
                    </div>
                } @else {
                    @for (node of executionTree; track node.id) {
                        <mj-execution-node 
                            [node]="node"
                            (toggleNode)="toggleNode($event)"
                            (toggleDetails)="handleToggleDetails($event)"
                            (userInteracted)="onUserInteraction()">
                        </mj-execution-node>
                    }
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
                                {{ stats.stepsByType[type] }} {{ type }}
                            </span>
                        }
                    </div>
                }
            </div>
        </div>
    `,
    styles: [`
        .execution-monitor {
            display: flex;
            flex-direction: column;
            height: 100%;
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
            padding: 16px;
            min-height: 200px;
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
    
    executionTree: ExecutionTreeNode[] = [];
    currentStep: ExecutionTreeNode | null = null;
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
    
    private destroy$ = new Subject<void>();
    private updateSubscription?: Subscription;
    
    constructor(private cdr: ChangeDetectorRef) {}
    
    ngOnChanges(changes: SimpleChanges): void {
        if (changes['executionData']) {
            // Process data even if it's empty/null (for initial setup)
            this.processExecutionData();
        }
        
        // Handle mode changes
        if (changes['mode'] && !changes['mode'].firstChange) {
            this.processExecutionData();
        }
    }
    
    ngAfterViewInit(): void {
        // Initial setup for scroll behavior
        if (this.mode === 'live') {
            this.checkIfUserAtBottom();
        }
    }
    
    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.updateSubscription?.unsubscribe();
    }
    
    /**
     * Process execution data based on mode
     */
    private processExecutionData(): void {
        if (this.mode === 'historical') {
            // Process historical data
            this.buildTreeFromHistoricalData();
        } else {
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
            this.executionTree = [];
            return;
        }
        
        // Store expanded state before rebuilding
        const expandedState = new Map<string, boolean>();
        const detailsExpandedState = new Map<string, boolean>();
        if (this.executionTree.length > 0) {
            this.preserveExpandedState(this.executionTree, expandedState, detailsExpandedState);
        }
        
        // Handle executionTree format
        if (this.executionData.executionTree) {
            this.executionTree = this.convertExecutionTree(this.executionData.executionTree);
        } else if (this.executionData.liveSteps) {
            // Handle live steps that have been converted to historical
            this.executionTree = this.convertLiveStepsToTree(this.executionData.liveSteps);
        } else if (this.executionData.steps) {
            // Handle legacy steps format
            this.executionTree = this.convertLegacySteps(this.executionData.steps);
        } else {
            this.executionTree = [];
        }
        
        // Restore expanded state if we had any
        if (expandedState.size > 0 || detailsExpandedState.size > 0) {
            this.restoreExpandedState(this.executionTree, expandedState, detailsExpandedState);
        }
    }
    
    /**
     * Convert new execution tree format to display nodes
     */
    private convertExecutionTree(nodes: any[], depth: number = 0): ExecutionTreeNode[] {
        return nodes.map((node, index) => {
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
                expanded: this.mode === 'live' && this.autoExpand && depth < 2,
                depth: depth,
                tokensUsed: this.extractTokens(node.outputData),
                cost: this.extractCost(node.outputData),
                detailsMarkdown: detailsMarkdown,
                children: node.children ? this.convertExecutionTree(node.children, depth + 1) : undefined
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
                detailsMarkdown: detailsMarkdown
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
            
            // Fallback to stringified preview
            const str = JSON.stringify(parsed, null, 2);
            return str.length > 200 ? str.substring(0, 200) + '...' : str;
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
            // For initial setup, clear the tree first
            this.executionTree = [];
            // Then append all steps
            this.appendNewLiveSteps(this.executionData.liveSteps);
        }
        
        // Set up interval to monitor for changes
        if (this.mode === 'live') {
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
        
        for (const step of liveSteps) {
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
                expanded: true, // Auto-expand live nodes
                depth: step.depth || 0,
                detailsMarkdown: detailsMarkdown
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
        
        const processNode = (node: ExecutionTreeNode) => {
            this.stats.totalSteps++;
            
            if (node.status === 'completed') this.stats.completedSteps++;
            if (node.status === 'failed') this.stats.failedSteps++;
            
            if (node.tokensUsed) this.stats.totalTokens += node.tokensUsed;
            if (node.cost) this.stats.totalCost += node.cost;
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
     * Find a node by ID in the tree
     */
    private findNodeById(nodes: ExecutionTreeNode[], id: string): ExecutionTreeNode | null {
        for (const node of nodes) {
            if (node.id === id) return node;
            if (node.children) {
                const found = this.findNodeById(node.children, id);
                if (found) return found;
            }
        }
        return null;
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
     * Toggle details expansion for a node
     */
    toggleDetails(node: ExecutionTreeNode, event: Event): void {
        event.stopPropagation(); // Prevent triggering node expansion
        const nodeInTree = this.findNodeById(this.executionTree, node.id);
        if (nodeInTree) {
            nodeInTree.detailsExpanded = !nodeInTree.detailsExpanded;
            this.userHasInteracted = true;
            this.cdr.markForCheck();
        }
    }
    
    /**
     * Handle toggle details event from child component
     */
    handleToggleDetails(event: { node: ExecutionTreeNode, event: Event }): void {
        this.toggleDetails(event.node, event.event);
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
            return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #2196f3; text-decoration: underline;">${url}</a>`;
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
        
        // Create a map of existing nodes by ID for quick lookup
        const nodeMap = new Map<string, ExecutionTreeNode>();
        this.buildNodeMap(this.executionTree, nodeMap);
        
        let hasChanges = false;
        
        for (const step of liveSteps) {
            const stepId = step.step?.ID || `live-${Date.now()}-${Math.random()}`;
            
            // Check if this node already exists
            const existingNode = nodeMap.get(stepId);
            if (existingNode) {
                // Update existing node properties
                const updatedStatus = this.mapStepStatus(step.step?.Status);
                if (existingNode.status !== updatedStatus) {
                    existingNode.status = updatedStatus;
                    hasChanges = true;
                }
                
                if (step.endTime && !existingNode.endTime) {
                    existingNode.endTime = new Date(step.endTime);
                    existingNode.duration = step.durationMs;
                    hasChanges = true;
                }
                
                // Update output data if available
                if (step.outputData && !existingNode.outputPreview) {
                    existingNode.outputPreview = this.createPreview(step.outputData);
                    existingNode.tokensUsed = this.extractTokens(step.outputData);
                    existingNode.cost = this.extractCost(step.outputData);
                    hasChanges = true;
                }
            } else {
                // Create new node
                const newNode = this.createNodeFromLiveStep(step);
                
                if (step.depth === 0) {
                    this.executionTree.push(newNode);
                } else {
                    // Find parent based on agent hierarchy or depth
                    const parentFound = this.appendToParent(this.executionTree, newNode);
                    if (!parentFound) {
                        // If no parent found, add as root node
                        this.executionTree.push(newNode);
                    }
                }
                
                hasChanges = true;
            }
        }
        
        if (hasChanges) {
            // Trigger change detection
            this.cdr.markForCheck();
            
            // Auto-scroll if user hasn't interacted
            setTimeout(() => {
                this.autoScrollToBottom();
            }, 100);
        }
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
        
        return {
            id: step.step?.ID || `live-${Date.now()}-${Math.random()}`,
            name: name,
            type: this.mapStepType(step.executionType || step.step?.StepType),
            status: 'running', // Live steps start as running
            startTime: step.startTime ? new Date(step.startTime) : new Date(),
            agentPath: step.agentHierarchy || [],
            expanded: this.mode === 'live' && step.depth < 1, // Only expand top-level in live mode
            depth: step.depth || 0,
            detailsMarkdown: detailsMarkdown,
            inputPreview: this.createPreview(step.inputData),
            outputPreview: this.createPreview(step.outputData),
            tokensUsed: this.extractTokens(step.outputData),
            cost: this.extractCost(step.outputData)
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