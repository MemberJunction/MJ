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
    @Input() step!: MJAIAgentRunStepEntityExtended;
    @Input() depth: number = 0;
    @Input() agentPath: string[] = [];
    @Input() expanded: boolean = false;
    @Input() detailsExpanded: boolean = false;
    @Input() overrideDisplayStatus?: string; // Allow parent to override the displayed status
    
    @Output() toggleNode = new EventEmitter<void>();
    @Output() toggleDetails = new EventEmitter<void>();
    @Output() userInteracted = new EventEmitter<void>();
    
    hasChildren(): boolean {
        return this.step.StepType === 'Sub-Agent' && 
               !!this.step.SubAgentRun?.Steps && 
               this.step.SubAgentRun.Steps.length > 0;
    }
    
    onToggleChildren(event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.hasChildren()) {
            this.toggleNode.emit();
            this.userInteracted.emit();
        }
    }
    
    onToggleDetails(event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.hasNodeDetails()) {
            this.toggleDetails.emit();
            this.userInteracted.emit();
        }
    }
    
    onDoubleClick(): void {
        if (this.hasChildren()) {
            this.toggleNode.emit();
            this.userInteracted.emit();
        }
    }
    
    hasNodeDetails(): boolean {
        return !!this.step.InputData || 
               !!this.step.OutputData || 
               !!this.step.ErrorMessage || 
               !!this.getDetailsMarkdown() ||
               this.isNameTruncated();
    }
    
    getTruncatedName(): string {
        const maxLength = 120;
        const name = this.getStepName();
        if (name.length <= maxLength) {
            return name;
        }
        return name.substring(0, maxLength) + '...';
    }
    
    isNameTruncated(): boolean {
        return this.step.StepName.length > 120;
    }
    
    formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }
    
    getNodeTitle(): string {
        if (this.step.StepType === 'Sub-Agent' && this.getAgentName()) {
            return `Sub-agent: ${this.getAgentName()}`;
        }
        if (this.step.StepType === 'Actions' && this.getActionName()) {
            return `Action: ${this.getActionName()}`;
        }
        return this.step.StepType;
    }
    
    // Getter methods for step data
    getStepName(): string {
        // Extract just the first line if the name contains markdown
        const lines = this.step.StepName.split('\n');
        return lines[0].trim();
    }
    
    getStepTypeClass(): string {
        const typeMap: Record<string, string> = {
            'Validation': 'validation',
            'Prompt': 'prompt',
            'Actions': 'action',
            'Sub-Agent': 'sub-agent',
            'Decision': 'decision',
            'Chat': 'chat'
        };
        return typeMap[this.step.StepType] || 'prompt';
    }
    
    getStatusClass(): string {
        const statusMap: Record<string, string> = {
            'Pending': 'pending',
            'Running': 'running',
            'Completed': 'completed',
            'Failed': 'failed',
            'Cancelled': 'failed',
            'Paused': 'pending'
        };
        // Use override if provided, otherwise use actual status
        const status = this.overrideDisplayStatus || this.step.Status;
        return statusMap[status] || 'pending';
    }
    
    getDuration(): number {
        if (!this.step.StartedAt || !this.step.CompletedAt) return 0;
        return new Date(this.step.CompletedAt).getTime() - new Date(this.step.StartedAt).getTime();
    }
    
    getTokensUsed(): number | undefined {
        // Check if this is a prompt step with token data
        if (this.step.StepType === 'Prompt' && this.step.PromptRun) {
            return this.step.PromptRun.TokensUsed || undefined;
        }
        return undefined;
    }
    
    getCost(): number | undefined {
        // Check if this is a prompt step with cost data
        if (this.step.StepType === 'Prompt' && this.step.PromptRun) {
            return this.step.PromptRun.TotalCost || undefined;
        }
        return undefined;
    }
    
    getDetailsMarkdown(): string | undefined {
        // Check if the step name contains markdown details after the first line
        const lines = this.step.StepName.split('\n');
        if (lines.length > 1) {
            return lines.slice(1).join('\n').trim();
        }
        return undefined;
    }
    
    getInputPreview(): string | undefined {
        if (!this.step.InputData) return undefined;
        
        try {
            const parsed = JSON.parse(this.step.InputData);
            
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
            return typeof this.step.InputData === 'string' ? this.step.InputData : JSON.stringify(this.step.InputData);
        }
    }
    
    getOutputPreview(): string | undefined {
        if (!this.step.OutputData) return undefined;
        
        try {
            const parsed = JSON.parse(this.step.OutputData);
            
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
            return typeof this.step.OutputData === 'string' ? this.step.OutputData : JSON.stringify(this.step.OutputData);
        }
    }
    
    // Methods to extract metadata from input/output data
    getAgentName(): string | undefined {
        if (this.step.StepType === 'Sub-Agent' && this.step.SubAgentRun) {
            return this.step.SubAgentRun.Agent || undefined;
        }
        return this.parseMetadata('subAgentName');
    }
    
    getAgentIconClass(): string | undefined {
        return this.parseMetadata('subAgentIconClass') || this.parseMetadata('agentIconClass');
    }
    
    getAgentLogoURL(): string | undefined {
        return this.parseMetadata('subAgentLogoURL') || this.parseMetadata('agentLogoURL');
    }
    
    getActionName(): string | undefined {
        if (this.step.StepType === 'Actions' && this.step.ActionExecutionLog) {
            return this.step.ActionExecutionLog.Action;
        }
        return this.parseMetadata('actionName');
    }
    
    getActionIconClass(): string | undefined {
        return this.parseMetadata('actionIconClass');
    }
    
    private parseMetadata(key: string): string | undefined {
        if (!this.step.InputData) return undefined;
        
        try {
            const parsed = JSON.parse(this.step.InputData);
            return parsed[key];
        } catch {
            return undefined;
        }
    }
    
    formatMarkdown(markdown: string): string {
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
}