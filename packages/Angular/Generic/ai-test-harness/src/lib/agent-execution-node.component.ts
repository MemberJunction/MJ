import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { MJAIAgentRunStepEntityExtended } from '@memberjunction/ai-core-plus';

@Component({
  standalone: false,
    selector: 'mj-execution-node',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="tree-node" 
             [class.expanded]="expanded"
             [class.has-children]="hasChildren()"
             [class.details-expanded]="detailsExpanded"
             [class]="'depth-' + depth + ' type-' + getStepTypeClass()">
            
            <!-- Node Header -->
            <div class="node-header" 
                 (dblclick)="onDoubleClick()">
                <!-- Expand/Collapse Icon - Only show if node has children -->
                @if (hasChildren()) {
                    <i class="expand-icon fa-solid"
                       [class.fa-chevron-down]="expanded"
                       [class.fa-chevron-right]="!expanded"
                       (click)="onToggleChildren($event)"
                       title="Toggle children"></i>
                }
                
                <!-- Status Icon -->
                <span class="status-icon" [class]="'status-' + getStatusClass()">
                    @switch (getStatusClass()) {
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
                <span class="type-icon" [title]="getNodeTitle()">
                    @switch (getStepTypeClass()) {
                        @case ('validation') {
                            <i class="fa-solid fa-shield-halved"></i>
                        }
                        @case ('prompt') {
                            <i class="fa-solid fa-brain"></i>
                        }
                        @case ('action') {
                            @if (getActionIconClass()) {
                                <i [class]="getActionIconClass()"></i>
                            } @else {
                                <i class="fa-solid fa-bolt"></i>
                            }
                        }
                        @case ('sub-agent') {
                            @if (getAgentLogoURL()) {
                                <img [src]="getAgentLogoURL()" [alt]="getAgentName() || 'Agent'" class="agent-logo-icon">
                            } @else if (getAgentIconClass()) {
                                <i [class]="getAgentIconClass()"></i>
                            } @else {
                                <i class="fa-solid fa-sitemap"></i>
                            }
                        }
                        @case ('decision') {
                            <i class="fa-solid fa-code-branch"></i>
                        }
                        @case ('chat') {
                            <i class="fa-solid fa-comments"></i>
                        }
                    }
                </span>
                
                <!-- Node Name with depth indicator for sub-agents -->
                <span class="node-name">
                    @if (step.StepType === 'Sub-Agent' && depth > 0) {
                        <small style="color: #666; margin-right: 8px;">[Level {{ depth }}]</small>
                    }
                    {{ getTruncatedName() }}
                </span>
                
                <!-- Duration -->
                @if (getDuration()) {
                    <span class="node-duration">{{ formatDuration(getDuration()) }}</span>
                }
                
                <!-- Tokens/Cost -->
                @if (getTokensUsed() || getCost()) {
                    <span class="node-metrics">
                        @if (getTokensUsed()) {
                            <span class="tokens">{{ getTokensUsed() }} tokens</span>
                        }
                        @if (getCost()) {
                            <span class="cost">\${{ getCost()!.toFixed(4) }}</span>
                        }
                    </span>
                }
                
                <!-- Details Toggle Button - Only show if node has details -->
                @if (hasNodeDetails()) {
                    <button class="details-toggle-btn"
                            (click)="onToggleDetails($event)"
                            [title]="detailsExpanded ? 'Hide details' : 'Show details'">
                        <i class="fa-solid"
                           [class.fa-info]="!detailsExpanded"
                           [class.fa-times]="detailsExpanded"></i>
                    </button>
                }
            </div>
            
            <!-- Node Details (when details are expanded) -->
            @if (detailsExpanded) {
                <!-- Show markdown details first if available -->
                @if (getDetailsMarkdown() || isNameTruncated()) {
                    <div class="markdown-details">
                        @if (isNameTruncated()) {
                            <div class="full-name">{{ step.StepName }}</div>
                        }
                        @if (getDetailsMarkdown()) {
                            <div class="detail-content markdown" [innerHTML]="formatMarkdown(getDetailsMarkdown()!)"></div>
                        }
                    </div>
                }
                
                <!-- Always show details section if node is expanded, even if some content is empty -->
                <div class="node-details">
                    @if (step.ErrorMessage) {
                        <div class="detail-section error">
                            <div class="detail-label">
                                <i class="fa-solid fa-exclamation-triangle"></i> Error
                            </div>
                            <div class="detail-content">{{ step.ErrorMessage }}</div>
                        </div>
                    }
                    @if (getInputPreview()) {
                        <div class="detail-section">
                            <div class="detail-label">
                                <i class="fa-solid fa-sign-in-alt"></i> Input
                            </div>
                            <div class="detail-content">{{ getInputPreview() }}</div>
                        </div>
                    }
                    @if (getOutputPreview()) {
                        <div class="detail-section">
                            <div class="detail-label">
                                <i class="fa-solid fa-sign-out-alt"></i> Output
                            </div>
                            <div class="detail-content">{{ getOutputPreview() }}</div>
                        </div>
                    }
                    @if (!step.ErrorMessage && !getInputPreview() && !getOutputPreview() && !getDetailsMarkdown() && !isNameTruncated()) {
                        <div class="detail-section">
                            <div class="detail-content">No additional details available for this step.</div>
                        </div>
                    }
                </div>
            }
            
            <!-- Note: Sub-agent children are rendered by the parent component to maintain proper depth tracking -->
        </div>
    `,
    styles: [`
        :host {
            display: block;
            width: 100%;
        }
        
        /* Depth-based indentation - each level indents by 24px */
        .tree-node {
            margin: 4px 0;
            position: relative;
        }
        
        /* Root level nodes (depth 0) */
        .depth-0 { 
            margin-left: 0;
            position: relative;
            z-index: 2;
        }
        .depth-0::after {
            display: none;
        }
        .depth-0 .node-header {
            background: var(--mj-bg-surface-card);
            border: 2px solid var(--mj-border-default);
            font-weight: 600;
            position: relative;
            z-index: 10;
        }

        /* Sub-level nodes with increasing indentation */
        .depth-1 {
            margin-left: 24px;
        }
        .depth-1 .node-header {
            background: var(--mj-bg-surface-card);
            border-color: var(--mj-border-default);
        }

        .depth-2 {
            margin-left: 48px;
        }
        .depth-2 .node-header {
            background: var(--mj-bg-surface);
            border-color: var(--mj-border-default);
        }

        .depth-3 {
            margin-left: 72px;
        }
        .depth-3 .node-header {
            background: var(--mj-bg-surface);
            border-color: var(--mj-border-strong);
        }

        .depth-4 {
            margin-left: 96px;
        }
        .depth-4 .node-header {
            background: var(--mj-bg-surface);
            border-color: var(--mj-border-strong);
        }

        .depth-5 {
            margin-left: 120px;
        }
        .depth-5 .node-header {
            background: var(--mj-bg-surface);
            border-color: var(--mj-border-strong);
        }

        .depth-6 {
            margin-left: 144px;
        }
        .depth-6 .node-header {
            background: var(--mj-bg-surface);
            border-color: var(--mj-border-strong);
        }

        /* Root level - higher z-index to hide lines behind it */
        .depth-0 { 
            position: relative;
            overflow: hidden;
            z-index: 2;
        }
        .depth-0 .node-header {
            background: var(--mj-bg-surface-card);
            position: relative;
            z-index: 2;
        }

        /* Only add left padding for nodes with children (that show chevrons) */
        .depth-0.has-children::before {
            content: '';
            position: absolute;
            left: 12px;
            top: 0;
            width: 2px;
            height: 100%;
            border-left: 2px dotted var(--mj-border-strong);
            z-index: 0; /* Behind everything */
        }

        /* Child level - only for nodes that actually have parent chevrons */
        .depth-1 {
            margin-left: 30px;
            padding-left: 12px;
            position: relative;
            z-index: 1;
        }
        .depth-1 .node-header {
            background: var(--mj-bg-surface-card);
            position: relative;
            z-index: 1;
        }

        /* Horizontal line connecting to each child node - only when parent has children */
        .depth-1::after {
            content: '';
            position: absolute;
            left: -15px;
            top: 12px;
            width: 25px;
            height: 2px;
            border-bottom: 2px dotted var(--mj-border-strong);
            z-index: 1;
        }

        /* Visual indicator when details are expanded */
        .tree-node.details-expanded > .node-header {
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;
            border-bottom: 1px solid var(--mj-brand-primary);
        }

        .node-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            border: 1px solid var(--mj-border-default);
            border-radius: 6px;
            transition: all 0.2s ease;
            user-select: none;
            position: relative;
            z-index: 5;
            background: var(--mj-bg-surface);
        }

        .node-header:hover {
            background: var(--mj-bg-surface-hover);
            border-color: var(--mj-brand-primary) !important;
        }

        /* Sub-agent specific styling */
        .tree-node.type-sub-agent > .node-header {
            border-left: 4px solid var(--mj-brand-primary);
        }

        /* Action specific styling */
        .tree-node.type-action > .node-header {
            border-left: 4px solid var(--mj-status-success);
        }
        
        .expand-icon {
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            color: var(--mj-text-secondary);
            font-size: 10px;
            cursor: pointer;
            border-radius: 3px;
            transition: all 0.2s ease;
            z-index: 10; /* Ensure expand icon is clickable */
            position: relative;
        }

        .expand-icon:hover {
            background: var(--mj-bg-surface-hover);
            color: var(--mj-text-primary);
        }

        .status-icon {
            width: 20px;
            text-align: center;
            font-size: 14px;
        }

        .status-pending { color: var(--mj-text-muted); }
        .status-running { color: var(--mj-brand-primary); }
        .status-completed { color: var(--mj-status-success); }
        .status-failed { color: var(--mj-status-error); }

        .type-icon {
            width: 20px;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            color: var(--mj-text-secondary);
        }
        
        .agent-logo-icon {
            width: 16px;
            height: 16px;
            object-fit: cover;
            border-radius: 3px;
        }
        
        .node-name {
            flex: 1;
            font-size: 13px;
            font-weight: 500;
            color: var(--mj-text-primary);
        }


        .node-duration {
            font-size: 12px;
            color: var(--mj-text-secondary);
            font-weight: 500;
        }

        .node-metrics {
            display: flex;
            gap: 12px;
            font-size: 12px;
        }

        .tokens {
            color: var(--mj-text-secondary);
        }

        .cost {
            color: var(--mj-brand-primary);
            font-weight: 500;
        }

        /* Details Toggle Button */
        .details-toggle-btn {
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: 1px solid var(--mj-border-default);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 12px;
            color: var(--mj-text-secondary);
            margin-left: 4px;
        }

        .details-toggle-btn:hover {
            background: var(--mj-bg-surface-hover);
            border-color: var(--mj-brand-primary);
            color: var(--mj-brand-primary);
        }

        .details-toggle-btn:active {
            background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
        }

        /* When details are expanded, style the button differently */
        .tree-node.details-expanded .details-toggle-btn {
            background: var(--mj-brand-primary);
            border-color: var(--mj-brand-primary);
            color: var(--mj-text-inverse);
        }

        .tree-node.details-expanded .details-toggle-btn:hover {
            background: var(--mj-brand-primary-hover);
            border-color: var(--mj-brand-primary-hover);
        }

        .node-details {
            margin: 0 5px;
            padding: 16px;
            background: var(--mj-bg-surface-sunken);
            border: 1px solid var(--mj-border-default);
            border-top: none;
            border-radius: 0 0 6px 6px;
            font-size: 12px;
            position: relative;
            z-index: 4;
        }
        
        .detail-section {
            margin-bottom: 8px;
        }
        
        .detail-section:last-child {
            margin-bottom: 0;
        }
        
        .detail-section.error {
            color: var(--mj-status-error-text);
        }

        .detail-label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 600;
            margin-bottom: 4px;
            color: var(--mj-text-secondary);
        }

        .detail-content {
            white-space: pre-wrap;
            word-break: break-word;
            color: var(--mj-text-primary);
            line-height: 1.4;
        }

        .markdown-details {
            padding: 16px 16px 0 16px;
            background: var(--mj-bg-surface-sunken);
            border: 1px solid var(--mj-border-default);
            border-bottom: none;
            border-top: none;
            margin: 0 5px;
        }

        .markdown h3, .markdown h4 {
            margin: 8px 0 4px 0;
            color: var(--mj-text-primary);
        }
        
        .markdown h3 {
            font-size: 14px;
        }
        
        .markdown h4 {
            font-size: 13px;
        }
        
        .markdown ul {
            margin: 4px 0;
            padding-left: 20px;
        }
        
        .markdown li {
            margin: 2px 0;
        }
        
        .markdown code {
            background: var(--mj-bg-surface-sunken);
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 12px;
        }

        .markdown pre {
            background: var(--mj-bg-surface-sunken);
            padding: 8px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 4px 0;
        }

        .markdown pre code {
            background: none;
            padding: 0;
        }

        .markdown strong {
            font-weight: 600;
            color: var(--mj-text-primary);
        }

        .markdown em {
            font-style: italic;
            color: var(--mj-text-secondary);
        }

        .full-name {
            font-weight: 600;
            color: var(--mj-text-primary);
            padding-bottom: 8px;
            border-bottom: 1px solid var(--mj-border-default);
            word-wrap: break-word;
        }
    `]
})
export class ExecutionNodeComponent {
    @Input() Step!: MJAIAgentRunStepEntityExtended;

    /** @deprecated Use {@link Step}. */
    @Input() set step(value: MJAIAgentRunStepEntityExtended) {
      this.Step = value;
    }
    /** @deprecated Use {@link Step}. */
    get step(): MJAIAgentRunStepEntityExtended {
      return this.Step;
    }
    @Input() Depth: number = 0;

    /** @deprecated Use {@link Depth}. */
    @Input() set depth(value: number) {
      this.Depth = value;
    }
    /** @deprecated Use {@link Depth}. */
    get depth(): number {
      return this.Depth;
    }
    @Input() AgentPath: string[] = [];

    /** @deprecated Use {@link AgentPath}. */
    @Input() set agentPath(value: string[]) {
      this.AgentPath = value;
    }
    /** @deprecated Use {@link AgentPath}. */
    get agentPath(): string[] {
      return this.AgentPath;
    }
    @Input() Expanded: boolean = false;

    /** @deprecated Use {@link Expanded}. */
    @Input() set expanded(value: boolean) {
      this.Expanded = value;
    }
    /** @deprecated Use {@link Expanded}. */
    get expanded(): boolean {
      return this.Expanded;
    }
    @Input() DetailsExpanded: boolean = false;

    /** @deprecated Use {@link DetailsExpanded}. */
    @Input() set detailsExpanded(value: boolean) {
      this.DetailsExpanded = value;
    }
    /** @deprecated Use {@link DetailsExpanded}. */
    get detailsExpanded(): boolean {
      return this.DetailsExpanded;
    }
    @Input() OverrideDisplayStatus?: string;

    /** @deprecated Use {@link OverrideDisplayStatus}. */
    @Input() set overrideDisplayStatus(value: string | undefined) {
      this.OverrideDisplayStatus = value;
    }
    /** @deprecated Use {@link OverrideDisplayStatus}. */
    get overrideDisplayStatus(): string | undefined {
      return this.OverrideDisplayStatus;
    } // Allow parent to override the displayed status
    
    @Output() ToggleNode = new EventEmitter<void>();

    /**
     * @deprecated Use {@link ToggleNode}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (toggleNode) keeps working. Must stay AFTER ToggleNode: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() toggleNode = this.ToggleNode;
    @Output() ToggleDetails = new EventEmitter<void>();

    /**
     * @deprecated Use {@link ToggleDetails}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (toggleDetails) keeps working. Must stay AFTER ToggleDetails: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() toggleDetails = this.ToggleDetails;
    @Output() UserInteracted = new EventEmitter<void>();

    /**
     * @deprecated Use {@link UserInteracted}.
     *
     * The same emitter under the old binding name, so a template still binding
     * (userInteracted) keeps working. Must stay AFTER UserInteracted: class fields
     * initialise in order, and the other way round this captures undefined.
     */
    @Output() userInteracted = this.UserInteracted;
    
    HasChildren(): boolean {
        return this.Step.StepType === 'Sub-Agent' && 
               !!this.Step.SubAgentRun?.Steps && 
               this.Step.SubAgentRun.Steps.length > 0;
    }

    /** @deprecated Use {@link HasChildren}. */
    hasChildren(): boolean {
      return this.HasChildren();
    }
    
    OnToggleChildren(event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.HasChildren()) {
            this.ToggleNode.emit();
            this.UserInteracted.emit();
        }
    }

    /** @deprecated Use {@link OnToggleChildren}. */
    onToggleChildren(event?: Event): void {
      return this.OnToggleChildren(event);
    }
    
    OnToggleDetails(event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.HasNodeDetails()) {
            this.ToggleDetails.emit();
            this.UserInteracted.emit();
        }
    }

    /** @deprecated Use {@link OnToggleDetails}. */
    onToggleDetails(event?: Event): void {
      return this.OnToggleDetails(event);
    }
    
    OnDoubleClick(): void {
        if (this.HasChildren()) {
            this.ToggleNode.emit();
            this.UserInteracted.emit();
        }
    }

    /** @deprecated Use {@link OnDoubleClick}. */
    onDoubleClick(): void {
      return this.OnDoubleClick();
    }
    
    HasNodeDetails(): boolean {
        return !!this.Step.InputData || 
               !!this.Step.OutputData || 
               !!this.Step.ErrorMessage || 
               !!this.GetDetailsMarkdown() ||
               this.IsNameTruncated();
    }

    /** @deprecated Use {@link HasNodeDetails}. */
    hasNodeDetails(): boolean {
      return this.HasNodeDetails();
    }
    
    GetTruncatedName(): string {
        const maxLength = 120;
        const name = this.GetStepName();
        if (name.length <= maxLength) {
            return name;
        }
        return name.substring(0, maxLength) + '...';
    }

    /** @deprecated Use {@link GetTruncatedName}. */
    getTruncatedName(): string {
      return this.GetTruncatedName();
    }
    
    IsNameTruncated(): boolean {
        return this.Step.StepName.length > 120;
    }

    /** @deprecated Use {@link IsNameTruncated}. */
    isNameTruncated(): boolean {
      return this.IsNameTruncated();
    }
    
    FormatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }

    /** @deprecated Use {@link FormatDuration}. */
    formatDuration(ms: number): string {
      return this.FormatDuration(ms);
    }
    
    GetNodeTitle(): string {
        if (this.Step.StepType === 'Sub-Agent' && this.GetAgentName()) {
            return `Sub-agent: ${this.GetAgentName()}`;
        }
        if (this.Step.StepType === 'Actions' && this.GetActionName()) {
            return `Action: ${this.GetActionName()}`;
        }
        return this.Step.StepType;
    }

    /** @deprecated Use {@link GetNodeTitle}. */
    getNodeTitle(): string {
      return this.GetNodeTitle();
    }
    
    // Getter methods for step data
    GetStepName(): string {
        // Extract just the first line if the name contains markdown
        const lines = this.Step.StepName.split('\n');
        return lines[0].trim();
    }

    /** @deprecated Use {@link GetStepName}. */
    getStepName(): string {
      return this.GetStepName();
    }
    
    GetStepTypeClass(): string {
        const typeMap: Record<string, string> = {
            'Validation': 'validation',
            'Prompt': 'prompt',
            'Actions': 'action',
            'Sub-Agent': 'sub-agent',
            'Decision': 'decision',
            'Chat': 'chat'
        };
        return typeMap[this.Step.StepType] || 'prompt';
    }

    /** @deprecated Use {@link GetStepTypeClass}. */
    getStepTypeClass(): string {
      return this.GetStepTypeClass();
    }
    
    GetStatusClass(): string {
        const statusMap: Record<string, string> = {
            'Pending': 'pending',
            'Running': 'running',
            'Completed': 'completed',
            'Failed': 'failed',
            'Cancelled': 'failed',
            'Paused': 'pending'
        };
        // Use override if provided, otherwise use actual status
        const status = this.OverrideDisplayStatus || this.Step.Status;
        return statusMap[status] || 'pending';
    }

    /** @deprecated Use {@link GetStatusClass}. */
    getStatusClass(): string {
      return this.GetStatusClass();
    }
    
    GetDuration(): number {
        if (!this.Step.StartedAt || !this.Step.CompletedAt) return 0;
        return new Date(this.Step.CompletedAt).getTime() - new Date(this.Step.StartedAt).getTime();
    }

    /** @deprecated Use {@link GetDuration}. */
    getDuration(): number {
      return this.GetDuration();
    }
    
    GetTokensUsed(): number | undefined {
        // Check if this is a prompt step with token data
        if (this.Step.StepType === 'Prompt' && this.Step.PromptRun) {
            return this.Step.PromptRun.TokensUsed || undefined;
        }
        return undefined;
    }

    /** @deprecated Use {@link GetTokensUsed}. */
    getTokensUsed(): number | undefined {
      return this.GetTokensUsed();
    }
    
    GetCost(): number | undefined {
        // Check if this is a prompt step with cost data
        if (this.Step.StepType === 'Prompt' && this.Step.PromptRun) {
            return this.Step.PromptRun.TotalCost || undefined;
        }
        return undefined;
    }

    /** @deprecated Use {@link GetCost}. */
    getCost(): number | undefined {
      return this.GetCost();
    }
    
    GetDetailsMarkdown(): string | undefined {
        // Check if the step name contains markdown details after the first line
        const lines = this.Step.StepName.split('\n');
        if (lines.length > 1) {
            return lines.slice(1).join('\n').trim();
        }
        return undefined;
    }

    /** @deprecated Use {@link GetDetailsMarkdown}. */
    getDetailsMarkdown(): string | undefined {
      return this.GetDetailsMarkdown();
    }
    
    GetInputPreview(): string | undefined {
        if (!this.Step.InputData) return undefined;
        
        try {
            const parsed = JSON.parse(this.Step.InputData);
            
            // Extract meaningful preview
            if (parsed.promptName) return `Prompt: ${parsed.promptName}`;
            if (parsed.actionName) return `Action: ${parsed.actionName}`;
            if (parsed.subAgentName) return `Sub-agent: ${parsed.subAgentName}`;
            if (parsed.message) return parsed.message;
            if (parsed.userMessage) return parsed.userMessage;
            
            // Fallback to stringified preview
            const str = JSON.stringify(parsed, null, 2);
            return str.length > 500 ? str.substring(0, 500) + '...' : str;
        } catch {
            return typeof this.Step.InputData === 'string' ? this.Step.InputData : JSON.stringify(this.Step.InputData);
        }
    }

    /** @deprecated Use {@link GetInputPreview}. */
    getInputPreview(): string | undefined {
      return this.GetInputPreview();
    }
    
    GetOutputPreview(): string | undefined {
        if (!this.Step.OutputData) return undefined;
        
        try {
            const parsed = JSON.parse(this.Step.OutputData);
            
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
            
            // Show prompt results
            if (parsed.promptResult) {
                const result = parsed.promptResult;
                let preview = '';
                if (result.success !== undefined) {
                    preview += `Success: ${result.success}\n`;
                }
                if (result.content) {
                    preview += `Content: ${result.content}`;
                }
                return preview;
            }
            
            // Fallback
            const str = JSON.stringify(parsed, null, 2);
            return str.length > 500 ? str.substring(0, 500) + '...' : str;
        } catch {
            return typeof this.Step.OutputData === 'string' ? this.Step.OutputData : JSON.stringify(this.Step.OutputData);
        }
    }

    /** @deprecated Use {@link GetOutputPreview}. */
    getOutputPreview(): string | undefined {
      return this.GetOutputPreview();
    }
    
    // Methods to extract metadata from input/output data
    GetAgentName(): string | undefined {
        if (this.Step.StepType === 'Sub-Agent' && this.Step.SubAgentRun) {
            return this.Step.SubAgentRun.Agent || undefined;
        }
        return this.parseMetadata('subAgentName');
    }

    /** @deprecated Use {@link GetAgentName}. */
    getAgentName(): string | undefined {
      return this.GetAgentName();
    }
    
    GetAgentIconClass(): string | undefined {
        return this.parseMetadata('subAgentIconClass') || this.parseMetadata('agentIconClass');
    }

    /** @deprecated Use {@link GetAgentIconClass}. */
    getAgentIconClass(): string | undefined {
      return this.GetAgentIconClass();
    }
    
    GetAgentLogoURL(): string | undefined {
        return this.parseMetadata('subAgentLogoURL') || this.parseMetadata('agentLogoURL');
    }

    /** @deprecated Use {@link GetAgentLogoURL}. */
    getAgentLogoURL(): string | undefined {
      return this.GetAgentLogoURL();
    }
    
    GetActionName(): string | undefined {
        if (this.Step.StepType === 'Actions' && this.Step.ActionExecutionLog) {
            return this.Step.ActionExecutionLog.Action;
        }
        return this.parseMetadata('actionName');
    }

    /** @deprecated Use {@link GetActionName}. */
    getActionName(): string | undefined {
      return this.GetActionName();
    }
    
    GetActionIconClass(): string | undefined {
        return this.parseMetadata('actionIconClass');
    }

    /** @deprecated Use {@link GetActionIconClass}. */
    getActionIconClass(): string | undefined {
      return this.GetActionIconClass();
    }
    
    private parseMetadata(key: string): string | undefined {
        if (!this.Step.InputData) return undefined;
        
        try {
            const parsed = JSON.parse(this.Step.InputData);
            return parsed[key];
        } catch {
            return undefined;
        }
    }
    
    FormatMarkdown(markdown: string): string {
        // Basic markdown formatting
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
        const urlRegex = /(?:https?:\/\/|www\.)[^\s<]+/gi;
        html = html.replace(urlRegex, (url) => {
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

    /** @deprecated Use {@link FormatMarkdown}. */
    formatMarkdown(markdown: string): string {
      return this.FormatMarkdown(markdown);
    }
}