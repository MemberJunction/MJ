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
             [class]="'depth-' + depth">
            
            <!-- Node Header -->
            <div class="node-header" (dblclick)="onDoubleClick()">
                <!-- Expand/Collapse Icon -->
                @if (hasExpandableContent()) {
                    <i class="expand-icon fa-solid"
                       [class.fa-chevron-down]="node.expanded"
                       [class.fa-chevron-right]="!node.expanded"
                       (click)="onToggleNode($event)"></i>
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
                
                <!-- Node Name -->
                <span class="node-name">
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
            </div>
            
            <!-- All Details (when expanded) -->
            @if (node.expanded) {
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
                
                @if (node.inputPreview || node.outputPreview || node.error) {
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
            }
            
            <!-- Children (when expanded) -->
            @if (node.expanded && node.children) {
                @for (child of node.children; track child.id) {
                    <mj-execution-node 
                        [node]="child"
                        [depth]="depth + 1"
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
        
        /* Depth-based indentation and background colors */
        .tree-node {
            margin-bottom: 4px;
            position: relative;
        }
        
        /* Base styling for all depth levels */
        .tree-node[class*="depth-"] {
            padding-left: 8px;
        }
        
        /* Root level - no lines */
        .depth-0 .node-header { 
            background: #f8f9fa; 
        }
        
        /* All child levels get dotted lines */
        .tree-node[class*="depth-"]:not(.depth-0) {
            margin-left: calc(var(--depth) * 20px);
        }
        
        .tree-node[class*="depth-"]:not(.depth-0)::before {
            content: '';
            position: absolute;
            left: calc(var(--depth) * -20px - 8px);
            top: 0;
            width: 2px;
            height: 100%;
            border-left: 2px dotted #e0e7ff;
        }
        
        .tree-node[class*="depth-"]:not(.depth-0)::after {
            content: '';
            position: absolute;
            left: calc(var(--depth) * -20px - 8px);
            top: 50%;
            width: calc(var(--depth) * 20px);
            height: 2px;
            border-bottom: 2px dotted #e0e7ff;
        }
        
        /* Progressive background lightening */
        .tree-node[class*="depth-"]:not(.depth-0) .node-header {
            background: color-mix(in srgb, #f8f9fa 70%, white calc(var(--depth) * 10%));
        }
        
        /* Fallback for browsers that don't support color-mix */
        .depth-1 { --depth: 1; margin-left: 20px; }
        .depth-1 .node-header { background: #fafbfc; }
        
        .depth-2 { --depth: 2; margin-left: 40px; }
        .depth-2 .node-header { background: #fcfdfe; }
        
        .depth-3 { --depth: 3; margin-left: 60px; }
        .depth-3 .node-header { background: #feffff; }
        
        .depth-4 { --depth: 4; margin-left: 80px; }
        .depth-4 .node-header { background: #ffffff; }
        
        .depth-5 { --depth: 5; margin-left: 100px; }
        .depth-5 .node-header { background: #ffffff; }
        
        .depth-6 { --depth: 6; margin-left: 120px; }
        .depth-6 .node-header { background: #ffffff; }
        
        .depth-7 { --depth: 7; margin-left: 140px; }
        .depth-7 .node-header { background: #ffffff; }
        
        .depth-8 { --depth: 8; margin-left: 160px; }
        .depth-8 .node-header { background: #ffffff; }
        
        .depth-9 { --depth: 9; margin-left: 180px; }
        .depth-9 .node-header { background: #ffffff; }

        
        .node-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            transition: all 0.2s ease;
            user-select: none;
        }
        
        .node-header:hover {
            background: #e8f0fe;
            border-color: #2196f3;
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
        }
        
        .expand-icon:hover {
            background: #e0e0e0;
            color: #333;
        }
        
        .expand-spacer {
            width: 20px;
            text-align: center;
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
    
    onToggleNode(event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.hasExpandableContent()) {
            this.toggleNode.emit(this.node);
            this.userInteracted.emit();
        }
    }
    
    
    onDoubleClick(): void {
        if (this.hasExpandableContent()) {
            this.toggleNode.emit(this.node);
            this.userInteracted.emit();
        }
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