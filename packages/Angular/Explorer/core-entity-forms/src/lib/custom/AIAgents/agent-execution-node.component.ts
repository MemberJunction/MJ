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
             [style.padding-left.px]="node.depth * 24">
            
            <!-- Node Header -->
            <div class="node-header" (click)="onToggleNode()">
                <!-- Expand/Collapse Icon -->
                @if (hasExpandableContent()) {
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
                <span class="node-name">
                    {{ node.name }}
                    @if (node.detailsMarkdown) {
                        <button class="details-toggle" 
                                (click)="onToggleDetails($event)"
                                [title]="node.detailsExpanded ? 'Hide details' : 'Show details'">
                            <i class="fa-solid" 
                               [class.fa-chevron-down]="!node.detailsExpanded"
                               [class.fa-chevron-up]="node.detailsExpanded"></i>
                        </button>
                    }
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
            </div>
            
            <!-- Markdown Details (when expanded) -->
            @if (node.detailsExpanded && node.detailsMarkdown) {
                <div class="markdown-details">
                    <div class="detail-content markdown" [innerHTML]="formatMarkdown(node.detailsMarkdown)"></div>
                </div>
            }
            
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
                    <mj-execution-node 
                        [node]="child"
                        (toggleNode)="toggleNode.emit($event)"
                        (toggleDetails)="toggleDetails.emit($event)"
                        (userInteracted)="userInteracted.emit()">
                    </mj-execution-node>
                }
            }
        </div>
    `,
    styles: [`
        :host {
            display: block;
        }
        
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
        
        .details-toggle {
            background: transparent;
            border: none;
            padding: 2px 6px;
            margin-left: 8px;
            cursor: pointer;
            color: #666;
            font-size: 10px;
            border-radius: 3px;
            transition: all 0.2s ease;
        }
        
        .details-toggle:hover {
            background: #e0e0e0;
            color: #333;
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
    `]
})
export class ExecutionNodeComponent {
    @Input() node!: ExecutionTreeNode;
    @Output() toggleNode = new EventEmitter<ExecutionTreeNode>();
    @Output() toggleDetails = new EventEmitter<{ node: ExecutionTreeNode, event: Event }>();
    @Output() userInteracted = new EventEmitter<void>();
    
    hasExpandableContent(): boolean {
        return !!(this.node.children && this.node.children.length > 0) ||
               this.node.type === 'sub-agent' || 
               this.node.type === 'action' || 
               !!this.node.inputPreview || 
               !!this.node.outputPreview || 
               !!this.node.error || 
               !!this.node.detailsMarkdown;
    }
    
    onToggleNode(): void {
        if (this.hasExpandableContent()) {
            this.toggleNode.emit(this.node);
            this.userInteracted.emit();
        }
    }
    
    onToggleDetails(event: Event): void {
        this.toggleDetails.emit({ node: this.node, event });
        this.userInteracted.emit();
    }
    
    formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
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