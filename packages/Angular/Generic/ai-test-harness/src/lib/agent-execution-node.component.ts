import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExecutionTreeNode } from './agent-execution-monitor.component';

@Component({
    selector: 'mj-execution-node',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="tree-node" 
             [class.expanded]="node.expanded"
             [class.has-children]="hasChildren()"
             [class]="'depth-' + node.depth + ' type-' + node.type">
            
            <!-- Node Header -->
            <div class="node-header" 
                 (dblclick)="onDoubleClick()">
                <!-- Expand/Collapse Icon - Only show if node has children -->
                @if (hasChildren()) {
                    <i class="expand-icon fa-solid"
                       [class.fa-chevron-down]="node.expanded"
                       [class.fa-chevron-right]="!node.expanded"
                       (click)="onToggleChildren($event)"
                       title="Toggle children"></i>
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
                <span class="type-icon" [title]="getNodeTitle()">
                    @switch (node.type) {
                        @case ('validation') {
                            <i class="fa-solid fa-shield-halved"></i>
                        }
                        @case ('prompt') {
                            <i class="fa-solid fa-brain"></i>
                        }
                        @case ('action') {
                            @if (node.actionIconClass) {
                                <i [class]="node.actionIconClass"></i>
                            } @else {
                                <i class="fa-solid fa-bolt"></i>
                            }
                        }
                        @case ('sub-agent') {
                            @if (node.agentLogoURL) {
                                <img [src]="node.agentLogoURL" [alt]="node.agentName || 'Agent'" class="agent-logo-icon">
                            } @else if (node.agentIconClass) {
                                <i [class]="node.agentIconClass"></i>
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
                    @if (node.type === 'sub-agent' && node.depth > 0) {
                        <small style="color: #666; margin-right: 8px;">[Level {{ node.depth }}]</small>
                    }
                    {{ getTruncatedName() }}
                </span>
                
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
                
                <!-- Details Toggle Button - Only show if node has details -->
                @if (hasNodeDetails()) {
                    <button class="details-toggle-btn"
                            (click)="onToggleDetails($event)"
                            [title]="node.detailsExpanded ? 'Hide details' : 'Show details'">
                        <i class="fa-solid"
                           [class.fa-info]="!node.detailsExpanded"
                           [class.fa-times]="node.detailsExpanded"></i>
                    </button>
                }
            </div>
            
            <!-- Node Details (when details are expanded) -->
            @if (node.detailsExpanded) {
                <!-- Show markdown details first if available -->
                @if (node.detailsMarkdown || isNameTruncated()) {
                    <div class="markdown-details">
                        @if (isNameTruncated()) {
                            <div class="full-name">{{ node.name }}</div>
                        }
                        @if (node.detailsMarkdown) {
                            <div class="detail-content markdown" [innerHTML]="formatMarkdown(node.detailsMarkdown)"></div>
                        }
                    </div>
                }
                
                <!-- Always show details section if node is expanded, even if some content is empty -->
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
                    @if (!node.error && !node.inputPreview && !node.outputPreview && !node.detailsMarkdown && !isNameTruncated()) {
                        <div class="detail-section">
                            <div class="detail-content">No additional details available for this step.</div>
                        </div>
                    }
                </div>
            }
            
            <!-- Children (when children are expanded) - HIERARCHICAL DISPLAY -->
            @if (node.expanded && node.children && node.children.length > 0) {
                @for (child of node.children; track child.id) {
                    <mj-execution-node 
                        [node]="child"
                        [depth]="child.depth"
                        (toggleNode)="toggleNode.emit($event)"
                        (userInteracted)="userInteracted.emit()">
                    </mj-execution-node>
                }
            }
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
            background: #f8f9fa;
            border: 2px solid #e0e0e0;
            font-weight: 600;
            position: relative;
            z-index: 10;
        }
        
        /* Sub-level nodes with increasing indentation */
        .depth-1 {
            margin-left: 24px;
        }
        .depth-1 .node-header {
            background: #fafafa;
            border-color: #d0d0d0;
        }
        
        .depth-2 {
            margin-left: 48px;
        }
        .depth-2 .node-header {
            background: #fcfcfc;
            border-color: #c0c0c0;
        }
        
        .depth-3 {
            margin-left: 72px;
        }
        .depth-3 .node-header {
            background: #fdfdfd;
            border-color: #b0b0b0;
        }
        
        .depth-4 {
            margin-left: 96px;
        }
        .depth-4 .node-header {
            background: #fefefe;
            border-color: #a0a0a0;
        }
        
        .depth-5 {
            margin-left: 120px;
        }
        .depth-5 .node-header {
            background: #fefefe;
            border-color: #a0a0a0;
        }
        
        .depth-6 {
            margin-left: 144px;
        }
        .depth-6 .node-header {
            background: #fefefe;
            border-color: #a0a0a0;
        }

        /* Root level - higher z-index to hide lines behind it */
        .depth-0 { 
            position: relative;
            overflow: hidden;
            z-index: 2;
        }
        .depth-0 .node-header { 
            background: #f8f9fa;
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
            border-left: 2px dotted #c0c7d0;
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
            background: #fafbfc;
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
            border-bottom: 2px dotted #c0c7d0;
            z-index: 1;
        }
        
        /* Visual indicator when details are expanded */
        .tree-node.details-expanded > .node-header {
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;
            border-bottom: 1px solid #2196f3;
        }
        
        .node-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            transition: all 0.2s ease;
            user-select: none;
            position: relative;
            z-index: 5;
            background: white;
        }
        
        .node-header:hover {
            background: var(--gray-700);
            border-color: var(--mj-blue) !important;
        }
        
        /* Sub-agent specific styling */
        .tree-node.type-sub-agent > .node-header {
            border-left: 4px solid var(--mj-blue);
        }
        
        /* Action specific styling */
        .tree-node.type-action > .node-header {
            border-left: 4px solid #4caf50;
        }
        
        .expand-icon {
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            color: #666;
            font-size: 10px;
            cursor: pointer;
            border-radius: 3px;
            transition: all 0.2s ease;
            z-index: 10; /* Ensure expand icon is clickable */
            position: relative;
        }
        
        .expand-icon:hover {
            background: #e0e0e0;
            color: #333;
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
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            color: #666;
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
        
        /* Details Toggle Button */
        .details-toggle-btn {
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 12px;
            color: #666;
            margin-left: 4px;
        }
        
        .details-toggle-btn:hover {
            background: #f0f0f0;
            border-color: #2196f3;
            color: #2196f3;
        }
        
        .details-toggle-btn:active {
            background: #e3f2fd;
        }
        
        /* When details are expanded, style the button differently */
        .tree-node.details-expanded .details-toggle-btn {
            background: #2196f3;
            border-color: #2196f3;
            color: white;
        }
        
        .tree-node.details-expanded .details-toggle-btn:hover {
            background: #1976d2;
            border-color: #1976d2;
        }
        
        .node-details {
            margin: 0 5px;
            padding: 16px;
            background: var(--gray-600);
            border: 1px solid var(--gray-700);
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
            color: #d32f2f;
        }
        
        .detail-label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 600;
            margin-bottom: 4px;
            color: #555;
        }
        
        .detail-content {
            white-space: pre-wrap;
            word-break: break-word;
            color: #333;
            line-height: 1.4;
        }
        
        .markdown-details {
            margin: 8px 0 8px 44px;
            padding: 12px;
            background: #f9f9f9;
            border-left: 3px solid #2196f3;
            border-radius: 0 4px 4px 0;
            font-size: 13px;
        }
        
        .markdown h3, .markdown h4 {
            margin: 8px 0 4px 0;
            color: #1a1a1a;
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
            background: #e8e8e8;
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 12px;
        }
        
        .markdown pre {
            background: #f5f5f5;
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
            color: #1a1a1a;
        }
        
        .markdown em {
            font-style: italic;
            color: #555;
        }
        
        .full-name {
            font-weight: 600;
            color: #1a1a1a;
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid #e0e0e0;
            word-wrap: break-word;
        }
    `]
})
export class ExecutionNodeComponent {
    @Input() node!: ExecutionTreeNode;
    @Input() depth: number = 0; // Add depth input
    @Output() toggleNode = new EventEmitter<ExecutionTreeNode>();
    @Output() userInteracted = new EventEmitter<void>();
    
    // NEW: Add events for node navigation
    // Note: Removed navigateToStep functionality
    
    hasExpandableContent(): boolean {
        return !!(this.node.children && this.node.children.length > 0) ||
               this.node.type === 'sub-agent' || 
               this.node.type === 'action' || 
               !!this.node.inputPreview || 
               !!this.node.outputPreview || 
               !!this.node.error || 
               !!this.node.detailsMarkdown;
    }
    
    hasChildren(): boolean {
        return !!(this.node.children && this.node.children.length > 0);
    }
    
    onToggleChildren(event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.hasChildren()) {
            this.toggleNode.emit(this.node);
            this.userInteracted.emit();
        }
    }
    
    onToggleDetails(event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.hasNodeDetails()) {
            this.node.detailsExpanded = !this.node.detailsExpanded;
            this.userInteracted.emit();
        }
    }
    
    
    onDoubleClick(): void {
        if (this.hasChildren()) {
            this.toggleNode.emit(this.node);
            this.userInteracted.emit();
        }
    }
    
    hasNodeDetails(): boolean {
        return !!this.node.inputPreview || 
               !!this.node.outputPreview || 
               !!this.node.error || 
               !!this.node.detailsMarkdown ||
               this.isNameTruncated();
    }
    
    getTruncatedName(): string {
        const maxLength = 120;
        if (this.node.name.length <= maxLength) {
            return this.node.name;
        }
        return this.node.name.substring(0, maxLength) + '...';
    }
    
    isNameTruncated(): boolean {
        return this.node.name.length > 120;
    }
    
    formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }
    
    getNodeTitle(): string {
        if (this.node.type === 'sub-agent' && this.node.agentName) {
            return `Sub-agent: ${this.node.agentName}`;
        }
        if (this.node.type === 'action' && this.node.actionName) {
            return `Action: ${this.node.actionName}`;
        }
        return this.node.type;
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