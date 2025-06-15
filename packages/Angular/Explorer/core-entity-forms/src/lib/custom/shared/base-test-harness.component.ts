import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, ViewContainerRef } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { DialogRef, DialogService } from '@progress/kendo-angular-dialog';

/**
 * Base interfaces and types shared across test harnesses
 */
export interface BaseConversationMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    isStreaming?: boolean;
    streamingContent?: string;
    executionTime?: number;
    error?: string;
    rawContent?: string;
    showRaw?: boolean;
    streamingStartTime?: number;
    elapsedTime?: number;
    showJsonRaw?: boolean;
}

export interface BaseVariable {
    name: string;
    value: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description?: string;
}

export interface BaseSavedConversation {
    id: string;
    name: string;
    messages: BaseConversationMessage[];
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Abstract base component that provides shared test harness functionality
 * including conversation management, variable handling, and save/load operations.
 * 
 * Extended by specific test harness components for agents and prompts.
 */
@Component({
    template: '' // Abstract component - no template
})
export abstract class BaseTestHarnessComponent implements OnInit, OnDestroy, AfterViewChecked {
    
    constructor(
        protected sanitizer: DomSanitizer,
        protected dialogService: DialogService,
        protected viewContainerRef: ViewContainerRef
    ) {}
    
    @ViewChild('messagesContainer') protected messagesContainer!: ElementRef;
    @ViewChild('fileInput') protected fileInput!: ElementRef;

    // Conversation state
    public conversationMessages: BaseConversationMessage[] = [];
    public currentUserMessage: string = '';
    public isExecuting = false;
    public currentStreamingMessageId: string | null = null;
    
    // Variable management - to be implemented by subclasses
    public abstract variables: BaseVariable[];
    public showVariablesPanel = true;
    
    // UI state
    public activeTab: string = 'variables';
    public savedConversations: BaseSavedConversation[] = [];
    public currentConversationId: string | null = null;
    
    // Streaming simulation
    protected streamingInterval: any = null;
    protected elapsedTimeInterval: any = null;
    protected scrollNeeded = false;
    
    // Component lifecycle
    protected destroy$ = new Subject<void>();

    /**
     * Component initialization - loads saved conversations
     */
    async ngOnInit() {
        this.loadSavedConversations();
    }

    /**
     * Component cleanup
     */
    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
        this.clearIntervals();
    }

    /**
     * Auto-scroll after view updates
     */
    ngAfterViewChecked() {
        if (this.scrollNeeded) {
            this.scrollToBottom();
            this.scrollNeeded = false;
        }
    }

    // === Abstract methods to be implemented by subclasses ===
    
    /**
     * Execute the specific test (agent or prompt)
     */
    protected abstract executeTest(): Promise<void>;
    
    /**
     * Get the localStorage key for saved conversations
     */
    protected abstract getStorageKey(): string;
    
    /**
     * Reset harness to initial state
     */
    public abstract resetHarness(): void;

    // === Shared conversation management ===
    
    /**
     * Sends a user message and triggers test execution
     */
    public async sendMessage() {
        if (!this.currentUserMessage.trim() || this.isExecuting) return;

        const userMessage: BaseConversationMessage = {
            id: this.generateMessageId(),
            role: 'user',
            content: this.currentUserMessage.trim(),
            timestamp: new Date()
        };

        this.conversationMessages.push(userMessage);
        this.currentUserMessage = '';
        this.scrollNeeded = true;

        // Create assistant message placeholder
        const assistantMessage: BaseConversationMessage = {
            id: this.generateMessageId(),
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true,
            streamingContent: '',
            streamingStartTime: Date.now(),
            elapsedTime: 0
        };

        this.conversationMessages.push(assistantMessage);
        this.scrollNeeded = true;

        try {
            this.isExecuting = true;
            await this.executeTest();
        } catch (error) {
            // Update assistant message with error
            const lastMessage = this.conversationMessages[this.conversationMessages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
                lastMessage.isStreaming = false;
                lastMessage.content = 'I encountered an error processing your request.';
                lastMessage.error = (error as Error).message;
                delete lastMessage.streamingContent;
            }
            
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to execute test: ' + (error as Error).message,
                'error',
                6000
            );
        } finally {
            this.isExecuting = false;
            this.clearIntervals();
            this.autoSaveConversation();
        }
    }

    /**
     * Clears the current conversation
     */
    public clearConversation() {
        if (this.conversationMessages.length === 0) return;
        
        this.showConfirmDialog(
            'Clear Conversation',
            'Are you sure you want to clear the conversation?',
            () => {
                this.conversationMessages = [];
                this.currentConversationId = null;
            }
        );
    }

    // === Shared content formatting ===
    
    /**
     * Formats message content for display
     */
    public formatMessageContent(message: BaseConversationMessage): SafeHtml {
        const content = message.isStreaming ? (message.streamingContent || '') : message.content;
        
        if (!content) return this.sanitizer.bypassSecurityTrustHtml('');

        // Try to parse as JSON first
        if (this.isJsonString(content)) {
            try {
                const parsed = JSON.parse(content);
                if (parsed.userMessage) {
                    // Handle structured response with userMessage
                    return this.sanitizer.bypassSecurityTrustHtml(this.formatAsMarkdown(parsed.userMessage));
                }
            } catch (e) {
                // Fall through to other formatting
            }
        }

        // Check if it looks like markdown
        if (this.looksLikeMarkdown(content)) {
            return this.sanitizer.bypassSecurityTrustHtml(this.formatAsMarkdown(content));
        }

        // Default to plain text with line breaks
        return this.sanitizer.bypassSecurityTrustHtml(this.escapeHtml(content).replace(/\n/g, '<br>'));
    }

    /**
     * Gets formatted raw content for display
     */
    public getFormattedRawContent(message: BaseConversationMessage): SafeHtml {
        const content = message.rawContent || message.content || '';
        
        if (this.isJsonString(content)) {
            try {
                const formatted = JSON.stringify(JSON.parse(content), null, 2);
                return this.sanitizer.bypassSecurityTrustHtml(`<pre><code>${this.escapeHtml(formatted)}</code></pre>`);
            } catch (e) {
                // Fall back to plain text
            }
        }
        
        return this.sanitizer.bypassSecurityTrustHtml(`<pre>${this.escapeHtml(content)}</pre>`);
    }

    /**
     * Toggles raw content visibility
     */
    public toggleRawContent(message: BaseConversationMessage) {
        message.showRaw = !message.showRaw;
    }

    /**
     * Toggles JSON raw section
     */
    public toggleJsonRaw(message: BaseConversationMessage) {
        message.showJsonRaw = !message.showJsonRaw;
    }

    // === Shared variable management ===
    
    /**
     * Adds a new variable
     */
    public addVariable() {
        this.variables.push({
            name: '',
            value: '',
            type: 'string',
            description: ''
        });
    }

    /**
     * Removes a variable by index
     */
    public removeVariable(index: number) {
        this.variables.splice(index, 1);
    }

    /**
     * Updates variable type and converts value
     */
    public onVariableTypeChange(variable: BaseVariable) {
        switch (variable.type) {
            case 'boolean':
                variable.value = variable.value === 'true' || variable.value === '1' ? 'true' : 'false';
                break;
            case 'number':
                const num = parseFloat(variable.value);
                variable.value = isNaN(num) ? '0' : num.toString();
                break;
            case 'object':
            case 'array':
                if (!this.isJsonString(variable.value)) {
                    variable.value = variable.type === 'array' ? '[]' : '{}';
                }
                break;
        }
    }

    // === Shared save/load functionality ===
    
    /**
     * Saves current conversation
     */
    public saveConversation() {
        if (this.conversationMessages.length === 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'No messages to save',
                'warning',
                3000
            );
            return;
        }

        this.showPromptDialog(
            'Save Conversation',
            'Enter a name for this conversation:',
            'My Conversation',
            (name: string) => {
                if (!name) return;
                const conversation = this.createSavedConversation(name);
                
                if (this.currentConversationId) {
                    // Update existing
                    const index = this.savedConversations.findIndex(c => c.id === this.currentConversationId);
                    if (index >= 0) {
                        conversation.id = this.currentConversationId;
                        conversation.createdAt = this.savedConversations[index].createdAt;
                        this.savedConversations[index] = conversation;
                    }
                } else {
                    // Add new
                    this.savedConversations.unshift(conversation);
                    this.currentConversationId = conversation.id;
                }

                // Limit conversations
                if (this.savedConversations.length > 50) {
                    this.savedConversations = this.savedConversations.slice(0, 50);
                }

                this.saveToBrowser();
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Conversation saved successfully',
                    'success',
                    3000
                );
            }
        );
    }

    /**
     * Loads a saved conversation
     */
    public loadConversation(conversation: BaseSavedConversation) {
        // Skip confirmation if no changes made
        if (this.conversationMessages.length === 0 || !this.hasUnsavedChanges()) {
            this.doLoadConversation(conversation);
            return;
        }

        this.showConfirmDialog(
            'Load Conversation',
            'Loading this conversation will replace the current one. Continue?',
            () => {
                this.doLoadConversation(conversation);
            }
        );
    }

    private doLoadConversation(conversation: BaseSavedConversation) {
        this.conversationMessages = [...conversation.messages];
        this.currentConversationId = conversation.id;
        this.loadConversationVariables(conversation);
        this.scrollNeeded = true;
    }

    /**
     * Deletes a saved conversation
     */
    public deleteConversation(conversation: BaseSavedConversation) {
        this.showConfirmDialog(
            'Delete Conversation',
            `Delete conversation "${conversation.name}"?`,
            () => {
                const index = this.savedConversations.findIndex(c => c.id === conversation.id);
                if (index >= 0) {
                    this.savedConversations.splice(index, 1);
                    this.saveToBrowser();
                    
                    if (this.currentConversationId === conversation.id) {
                        this.currentConversationId = null;
                    }
                    
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Conversation deleted',
                        'success',
                        2000
                    );
                }
            }
        );
    }

    // === Protected helper methods ===
    
    /**
     * Abstract method to create saved conversation - implemented by subclasses
     */
    protected abstract createSavedConversation(name: string): BaseSavedConversation;
    
    /**
     * Abstract method to load variables from conversation - implemented by subclasses
     */
    protected abstract loadConversationVariables(conversation: BaseSavedConversation): void;

    /**
     * Auto-saves current conversation
     */
    protected autoSaveConversation() {
        if (this.currentConversationId && this.conversationMessages.length > 0) {
            const index = this.savedConversations.findIndex(c => c.id === this.currentConversationId);
            if (index >= 0) {
                this.savedConversations[index].messages = [...this.conversationMessages];
                this.savedConversations[index].updatedAt = new Date();
                this.updateSavedConversationVariables(this.savedConversations[index]);
                this.saveToBrowser();
            }
        }
    }

    /**
     * Abstract method to update saved conversation variables - implemented by subclasses
     */
    protected abstract updateSavedConversationVariables(conversation: BaseSavedConversation): void;

    /**
     * Loads saved conversations from browser storage
     */
    protected loadSavedConversations() {
        const saved = localStorage.getItem(this.getStorageKey());
        if (saved) {
            try {
                this.savedConversations = JSON.parse(saved);
                // Convert date strings back to Date objects
                this.savedConversations.forEach(conv => {
                    conv.createdAt = new Date(conv.createdAt);
                    conv.updatedAt = new Date(conv.updatedAt);
                    conv.messages.forEach(msg => {
                        msg.timestamp = new Date(msg.timestamp);
                    });
                });
            } catch (error) {
                console.error('Error loading saved conversations:', error);
                this.savedConversations = [];
            }
        }
    }

    /**
     * Saves conversations to browser storage
     */
    protected saveToBrowser() {
        localStorage.setItem(this.getStorageKey(), JSON.stringify(this.savedConversations));
    }

    /**
     * Simulates streaming response
     */
    protected simulateStreaming(message: BaseConversationMessage) {
        message.streamingContent = '';
        message.elapsedTime = 0;
        
        // Update elapsed time
        this.elapsedTimeInterval = setInterval(() => {
            if (message.streamingStartTime) {
                message.elapsedTime = Date.now() - message.streamingStartTime;
            }
        }, 100);

        // Simulate typing
        this.streamingInterval = setInterval(() => {
            const responses = [
                'Thinking...',
                'Processing your request...',
                'Analyzing...',
                'Generating response...'
            ];
            const dots = '.'.repeat((Date.now() / 500) % 4);
            const response = responses[Math.floor(Date.now() / 2000) % responses.length];
            message.streamingContent = response + dots;
        }, 500);
    }

    /**
     * Clears all intervals
     */
    protected clearIntervals() {
        if (this.streamingInterval) {
            clearInterval(this.streamingInterval);
            this.streamingInterval = null;
        }
        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
            this.elapsedTimeInterval = null;
        }
    }

    // === Utility methods ===
    
    /**
     * Scrolls to bottom of messages
     */
    protected scrollToBottom(): void {
        try {
            if (this.messagesContainer) {
                this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
            }
        } catch(err) {
            console.error('Error scrolling to bottom:', err);
        }
    }

    /**
     * Generates unique message ID
     */
    protected generateMessageId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    /**
     * Checks if string is valid JSON
     */
    protected isJsonString(str: string): boolean {
        try {
            JSON.parse(str);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Checks if content looks like markdown
     */
    protected looksLikeMarkdown(content: string): boolean {
        const markdownPatterns = [
            /^#{1,6}\s/m,        // Headers
            /\*\*.*?\*\*/,       // Bold
            /\*.*?\*/,           // Italic
            /```[\s\S]*?```/,    // Code blocks
            /`[^`]+`/,           // Inline code
            /^\* /m,             // Bullet points
            /^\d+\. /m,          // Numbered lists
            /\[.*?\]\(.*?\)/     // Links
        ];
        
        return markdownPatterns.some(pattern => pattern.test(content));
    }

    /**
     * Formats content as markdown
     */
    protected formatAsMarkdown(content: string): string {
        // Basic markdown formatting - this could be enhanced with a proper markdown library
        let formatted = this.escapeHtml(content);
        
        // Headers
        formatted = formatted.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        formatted = formatted.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        formatted = formatted.replace(/^# (.*$)/gim, '<h1>$1</h1>');
        
        // Bold and italic
        formatted = formatted.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
        formatted = formatted.replace(/\*(.*?)\*/gim, '<em>$1</em>');
        
        // Code blocks
        formatted = formatted.replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>');
        formatted = formatted.replace(/`([^`]+)`/gim, '<code>$1</code>');
        
        // Lists
        formatted = formatted.replace(/^\* (.*)$/gim, '<li>$1</li>');
        formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        
        // Line breaks
        formatted = formatted.replace(/\n/g, '<br>');
        
        return formatted;
    }

    /**
     * Escapes HTML characters
     */
    protected escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Formats execution time from milliseconds
     */
    public formatExecutionTime(milliseconds: number): string {
        if (!milliseconds) return 'N/A';
        
        if (milliseconds >= 60000) {
            const minutes = Math.floor(milliseconds / 60000);
            const seconds = ((milliseconds % 60000) / 1000).toFixed(1);
            return `${minutes}m ${seconds}s`;
        } else if (milliseconds >= 1000) {
            return `${(milliseconds / 1000).toFixed(1)}s`;
        } else {
            return `${milliseconds}ms`;
        }
    }

    /**
     * Formats elapsed time from milliseconds
     */
    public formatElapsedTime(milliseconds: number): string {
        if (!milliseconds) return '0ms';
        return this.formatExecutionTime(milliseconds);
    }

    /**
     * Gets formatted JSON content for display
     */
    public getFormattedJsonContent(message: BaseConversationMessage): string {
        const content = message.rawContent || message.content || '';
        
        if (this.isJsonString(content)) {
            try {
                return JSON.stringify(JSON.parse(content), null, 2);
            } catch (e) {
                return content;
            }
        }
        
        return content;
    }

    /**
     * Handles file selection for import/export
     */
    public onFileSelected(event: any) {
        // To be implemented by subclasses if needed
        console.log('File selected:', event);
    }

    /**
     * Shows a confirmation dialog
     */
    protected showConfirmDialog(title: string, message: string, onConfirm: () => void): void {
        const dialog: DialogRef = this.dialogService.open({
            title: title,
            content: message,
            actions: [
                { text: 'Cancel', primary: false },
                { text: 'OK', primary: true }
            ],
            width: 400,
            height: 180
        });

        dialog.result.subscribe((result: any) => {
            if (result?.text === 'OK') {
                onConfirm();
            }
        });
    }

    /**
     * Shows a prompt dialog for user input
     */
    protected showPromptDialog(title: string, message: string, defaultValue: string, onConfirm: (value: string) => void): void {
        const dialog: DialogRef = this.dialogService.open({
            title: title,
            content: `
                <div style="margin-bottom: 10px;">${message}</div>
                <input kendoTextBox 
                       id="promptInput" 
                       value="${defaultValue}" 
                       style="width: 100%;" 
                       class="k-textbox" />
            `,
            actions: [
                { text: 'Cancel', primary: false },
                { text: 'OK', primary: true }
            ],
            width: 400,
            height: 200
        });

        dialog.result.subscribe((result: any) => {
            if (result?.text === 'OK') {
                const input = document.getElementById('promptInput') as HTMLInputElement;
                if (input) {
                    onConfirm(input.value);
                }
            }
        });
    }

    /**
     * Checks if there are unsaved changes in the current conversation
     */
    protected hasUnsavedChanges(): boolean {
        if (!this.currentConversationId || this.conversationMessages.length === 0) {
            return false;
        }

        const savedConversation = this.savedConversations.find(c => c.id === this.currentConversationId);
        if (!savedConversation) {
            return this.conversationMessages.length > 0;
        }

        // Check if messages have changed
        if (savedConversation.messages.length !== this.conversationMessages.length) {
            return true;
        }

        // Compare message contents
        for (let i = 0; i < savedConversation.messages.length; i++) {
            if (savedConversation.messages[i].content !== this.conversationMessages[i].content) {
                return true;
            }
        }

        return false;
    }
}