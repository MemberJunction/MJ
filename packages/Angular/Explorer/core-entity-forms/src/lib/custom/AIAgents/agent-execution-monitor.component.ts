import { Component, Input, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, interval, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

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
            <div class="execution-tree" [class.has-content]="executionTree.length > 0">
                @if (executionTree.length === 0) {
                    <div class="empty-state">
                        <i class="fa-solid fa-hourglass-start"></i>
                        <p>Waiting for execution to begin...</p>
                    </div>
                } @else {
                    @for (node of executionTree; track node.id) {
                        <div class="tree-node" 
                             [class.expanded]="node.expanded"
                             [style.padding-left.px]="node.depth * 24">
                            
                            <!-- Node Header -->
                            <div class="node-header" (click)="toggleNode(node)">
                                <!-- Expand/Collapse Icon -->
                                @if (node.children && node.children.length > 0) {
                                    <i class="expand-icon fa-solid"
                                       [class.fa-chevron-down]="node.expanded"
                                       [class.fa-chevron-right]="!node.expanded"></i>
                                } @else {
                                    <span class="expand-spacer"></span>
                                }
                                
                                <!-- Status Icon -->
                                <span class="status-icon" [class]="'status-' + node.status">
                                    @switch (node.status) {
                                        @case ('pending') {
                                            <i class="fa-regular fa-circle"></i>
                                        }
                                        @case ('running') {
                                            <i class="fa-solid fa-spinner fa-spin"></i>
                                        }
                                        @case ('completed') {
                                            <i class="fa-solid fa-check-circle"></i>
                                        }
                                        @case ('failed') {
                                            <i class="fa-solid fa-times-circle"></i>
                                        }
                                    }
                                </span>
                                
                                <!-- Type Icon -->
                                <span class="type-icon" [title]="node.type">
                                    @switch (node.type) {
                                        @case ('validation') {
                                            <i class="fa-solid fa-shield-halved"></i>
                                        }
                                        @case ('prompt') {
                                            <i class="fa-solid fa-comment-dots"></i>
                                        }
                                        @case ('action') {
                                            <i class="fa-solid fa-bolt"></i>
                                        }
                                        @case ('sub-agent') {
                                            <i class="fa-solid fa-robot"></i>
                                        }
                                        @case ('decision') {
                                            <i class="fa-solid fa-code-branch"></i>
                                        }
                                        @case ('chat') {
                                            <i class="fa-solid fa-comments"></i>
                                        }
                                    }
                                </span>
                                
                                <!-- Node Name -->
                                <span class="node-name">{{ node.name }}</span>
                                
                                <!-- Duration -->
                                @if (node.duration) {
                                    <span class="node-duration">{{ formatDuration(node.duration) }}</span>
                                }
                                
                                <!-- Tokens/Cost -->
                                @if (node.tokensUsed || node.cost) {
                                    <span class="node-metrics">
                                        @if (node.tokensUsed) {
                                            <span class="tokens">{{ node.tokensUsed }} tokens</span>
                                        }
                                        @if (node.cost) {
                                            <span class="cost">\${{ node.cost.toFixed(4) }}</span>
                                        }
                                    </span>
                                }
                            </div>
                            
                            <!-- Node Details (when expanded) -->
                            @if (node.expanded && (node.inputPreview || node.outputPreview || node.error)) {
                                <div class="node-details">
                                    @if (node.error) {
                                        <div class="detail-section error">
                                            <div class="detail-label">
                                                <i class="fa-solid fa-exclamation-triangle"></i> Error
                                            </div>
                                            <div class="detail-content">{{ node.error }}</div>
                                        </div>
                                    }
                                    @if (node.inputPreview) {
                                        <div class="detail-section">
                                            <div class="detail-label">
                                                <i class="fa-solid fa-sign-in-alt"></i> Input
                                            </div>
                                            <div class="detail-content">{{ node.inputPreview }}</div>
                                        </div>
                                    }
                                    @if (node.outputPreview) {
                                        <div class="detail-section">
                                            <div class="detail-label">
                                                <i class="fa-solid fa-sign-out-alt"></i> Output
                                            </div>
                                            <div class="detail-content">{{ node.outputPreview }}</div>
                                        </div>
                                    }
                                </div>
                            }
                            
                            <!-- Children (when expanded) -->
                            @if (node.expanded && node.children) {
                                @for (child of node.children; track child.id) {
                                    <div class="tree-node" 
                                         [class.expanded]="child.expanded"
                                         [style.padding-left.px]="child.depth * 24">
                                        <!-- Recursive rendering would go here -->
                                        <!-- For simplicity, showing one level deep -->
                                    </div>
                                }
                            }
                        </div>
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
        }
    `]
})
export class AgentExecutionMonitorComponent implements OnChanges, OnDestroy {
    @Input() mode: ExecutionMonitorMode = 'historical';
    @Input() executionData: any = null; // Can be live updates or historical data
    @Input() autoExpand: boolean = true; // Auto-expand nodes in live mode
    
    executionTree: ExecutionTreeNode[] = [];
    currentStep: ExecutionTreeNode | null = null;
    stats: ExecutionStats = {
        totalSteps: 0,
        completedSteps: 0,
        failedSteps: 0,
        totalTokens: 0,
        totalCost: 0,
        stepsByType: {}
    };
    
    private destroy$ = new Subject<void>();
    private updateSubscription?: Subscription;
    
    ngOnChanges(changes: SimpleChanges): void {
        if (changes['executionData'] && this.executionData) {
            this.processExecutionData();
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
        
        this.calculateStats();
    }
    
    /**
     * Build tree from historical execution data
     */
    private buildTreeFromHistoricalData(): void {
        if (!this.executionData) return;
        
        // Handle executionTree format
        if (this.executionData.executionTree) {
            this.executionTree = this.convertExecutionTree(this.executionData.executionTree);
        }
    }
    
    /**
     * Convert new execution tree format to display nodes
     */
    private convertExecutionTree(nodes: any[], depth: number = 0): ExecutionTreeNode[] {
        return nodes.map((node, index) => {
            const treeNode: ExecutionTreeNode = {
                id: node.step?.ID || `node-${Date.now()}-${index}`,
                name: node.step?.StepName || 'Unknown Step',
                type: this.mapStepType(node.executionType || node.step?.StepType),
                status: this.mapStepStatus(node.step?.Status),
                startTime: node.startTime ? new Date(node.startTime) : undefined,
                endTime: node.endTime ? new Date(node.endTime) : undefined,
                duration: node.durationMs,
                agentPath: node.agentHierarchy || [],
                inputPreview: this.createPreview(node.inputData),
                outputPreview: this.createPreview(node.outputData),
                error: node.step?.ErrorMessage,
                expanded: this.autoExpand && depth < 2,
                depth: depth,
                tokensUsed: this.extractTokens(node.outputData),
                cost: this.extractCost(node.outputData),
                children: node.children ? this.convertExecutionTree(node.children, depth + 1) : undefined
            };
            
            return treeNode;
        });
    }
    
    /**
     * Convert legacy step format to tree nodes
     */
    private convertLegacySteps(steps: any[]): ExecutionTreeNode[] {
        return steps.map((step, index) => ({
            id: step.ID || `step-${index}`,
            name: step.StepName,
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
            depth: 0
        }));
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
        // This would connect to your real-time update stream
        // For now, simulating with polling
        if (this.mode === 'live') {
            this.updateSubscription = interval(1000)
                .pipe(takeUntil(this.destroy$))
                .subscribe(() => {
                    // Update current step and stats
                    this.updateCurrentStep();
                    this.calculateStats();
                });
        }
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
            totalDuration: 0
        };
        
        const processNode = (node: ExecutionTreeNode) => {
            this.stats.totalSteps++;
            
            if (node.status === 'completed') this.stats.completedSteps++;
            if (node.status === 'failed') this.stats.failedSteps++;
            
            if (node.tokensUsed) this.stats.totalTokens += node.tokensUsed;
            if (node.cost) this.stats.totalCost += node.cost;
            if (node.duration) this.stats.totalDuration! += node.duration;
            
            this.stats.stepsByType[node.type] = (this.stats.stepsByType[node.type] || 0) + 1;
            
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
        if (node.children && node.children.length > 0) {
            node.expanded = !node.expanded;
        }
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
}