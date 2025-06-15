import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AIPromptEntity, TemplateEntity, TemplateContentEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { Subject, takeUntil } from 'rxjs';

export interface AIPromptRunResult {
    success: boolean;
    output?: string;
    parsedResult?: string;
    error?: string;
    executionTimeMs?: number;
    promptRunId?: string;
    rawResult?: string;
    renderedPrompt?: string;
}

export interface TemplateVariable {
    name: string;
    value: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description?: string;
}

export interface ConversationMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    isStreaming?: boolean;
    streamingContent?: string;
    executionTime?: number;
    promptRunId?: string;
    error?: string;
    renderedPrompt?: string;
    rawContent?: string;
    showRaw?: boolean;
    streamingStartTime?: number;
    elapsedTime?: number;
    /** Whether JSON raw section is expanded in collapsible view */
    showJsonRaw?: boolean;
}

export interface SavedPromptConversation {
    id: string;
    name: string;
    promptId: string;
    promptName: string;
    messages: ConversationMessage[];
    templateVariables: TemplateVariable[];
    createdAt: Date;
    updatedAt: Date;
}

@Component({
    selector: 'mj-ai-prompt-test-harness-old',
    templateUrl: './ai-prompt-test-harness-old.component.html',
    styleUrls: ['./ai-prompt-test-harness-old.component.css']
})
export class AIPromptTestHarnessComponent implements OnInit, OnDestroy, AfterViewChecked {
    constructor(private sanitizer: DomSanitizer) {}
    @Input() aiPrompt: AIPromptEntity | null = null;
    @Input() template: TemplateEntity | null = null;
    @Input() templateContent: TemplateContentEntity | null = null;
    
    public _isVisible: boolean = false;
    @Input() 
    get isVisible(): boolean {
        return this._isVisible;
    }
    set isVisible(value: boolean) {
        const wasVisible = this._isVisible;
        this._isVisible = value;
        if (value && !wasVisible) {
            this.resetHarness();
            this.initializeVariables();
        }
    }

    @Output() visibilityChange = new EventEmitter<boolean>();
    @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
    @ViewChild('fileInput') private fileInput!: ElementRef;

    // Conversation state
    public conversationMessages: ConversationMessage[] = [];
    public currentUserMessage: string = '';
    public isExecuting = false;
    public currentStreamingMessageId: string | null = null;
    
    // Template variables management
    public templateVariables: TemplateVariable[] = [];
    public showVariablesPanel = true;
    
    // UI state
    public activeTab: 'variables' | 'savedConversations' | 'settings' = 'variables';
    public savedConversations: SavedPromptConversation[] = [];
    public currentConversationId: string | null = null;
    
    // Rendered prompt preview
    public showRenderedPrompt = false;
    public renderedPromptContent = '';
    
    // Streaming and events
    private destroy$ = new Subject<void>();
    private scrollNeeded = false;
    private streamingInterval: any;
    private elapsedTimeInterval: any;
    
    // Selected model for prompt execution
    public selectedModelId: string = '';
    public availableModels: any[] = [];
    
    private _metadata = new Metadata();

    ngOnInit() {
        this.loadSavedConversations();
        this.loadAvailableModels();
        this.resetHarness();
        this.initializeVariables();
        this.setupGlobalJsonToggle();
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
        if (this.streamingInterval) {
            clearInterval(this.streamingInterval);
        }
        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
        }
    }

    ngAfterViewChecked() {
        if (this.scrollNeeded) {
            this.scrollToBottom();
            this.scrollNeeded = false;
        }
    }

    private async loadAvailableModels() {
        try {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: 'AI Models',
                ExtraFilter: 'IsActive = 1',
                OrderBy: 'Name',
                MaxRows: 1000
            });
            
            this.availableModels = result.Results || [];
            if (this.availableModels.length > 0 && !this.selectedModelId) {
                this.selectedModelId = this.availableModels[0].ID;
            }
        } catch (error) {
            console.error('Error loading AI models:', error);
        }
    }

    private initializeVariables() {
        if (!this.templateContent) {
            this.templateVariables = [];
            return;
        }
        
        // Parse template to extract variables
        const templateText = this.templateContent.TemplateText || '';
        const variableMatches = templateText.match(/\{\{\s*(\w+)\s*\}\}/g) || [];
        
        const uniqueVariables = new Set<string>();
        variableMatches.forEach(match => {
            const varName = match.replace(/\{\{\s*|\s*\}\}/g, '');
            uniqueVariables.add(varName);
        });
        
        // Create template variables array
        this.templateVariables = Array.from(uniqueVariables).map(varName => ({
            name: varName,
            value: '',
            type: 'string' as const,
            description: ''
        }));
        
        // Add some common variables if they don't exist
        if (!this.templateVariables.find(v => v.name === 'context')) {
            this.templateVariables.push({
                name: 'context',
                value: '',
                type: 'string',
                description: 'Additional context for the prompt'
            });
        }
    }

    public resetHarness() {
        this.conversationMessages = [];
        this.currentUserMessage = '';
        this.isExecuting = false;
        this.currentStreamingMessageId = null;
        this.currentConversationId = null;
        this.showVariablesPanel = true;
        this.activeTab = 'variables';
        this.showRenderedPrompt = false;
        this.renderedPromptContent = '';
    }

    public close() {
        this._isVisible = false;
        this.visibilityChange.emit(false);
    }

    public toggleVariablesPanel() {
        this.showVariablesPanel = !this.showVariablesPanel;
    }

    public selectTab(tab: 'variables' | 'savedConversations' | 'settings') {
        this.activeTab = tab;
    }

    public async sendMessage() {
        if (!this.currentUserMessage.trim() || !this.aiPrompt) {
            return;
        }

        // Add user message to conversation
        const userMessage: ConversationMessage = {
            id: this.generateMessageId(),
            role: 'user',
            content: this.currentUserMessage.trim(),
            timestamp: new Date()
        };
        this.conversationMessages.push(userMessage);
        
        // Clear input
        const messageToSend = this.currentUserMessage;
        this.currentUserMessage = '';
        
        // Scroll to bottom
        this.scrollNeeded = true;

        // Execute prompt
        await this.executePrompt(messageToSend);
    }

    public async previewRenderedPrompt() {
        if (!this.templateContent) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'No template content available',
                'warning',
                3000
            );
            return;
        }
        
        try {
            // Build template data from variables
            const templateData = this.buildTemplateData();
            
            // For now, do a simple variable replacement
            // TODO: Use proper template engine when available
            let rendered = this.templateContent.TemplateText || '';
            
            // Replace variables in the template
            for (const [key, value] of Object.entries(templateData)) {
                const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
                rendered = rendered.replace(regex, String(value));
            }
            
            this.renderedPromptContent = rendered;
            this.showRenderedPrompt = true;
        } catch (error) {
            console.error('Error rendering template:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Failed to render template: ' + (error as Error).message,
                'error',
                5000
            );
        }
    }

    private async executePrompt(userMessage: string) {
        if (!this.aiPrompt || !this.selectedModelId) return;

        this.isExecuting = true;

        // Add placeholder assistant message for streaming
        const assistantMessage: ConversationMessage = {
            id: this.generateMessageId(),
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            isStreaming: true,
            streamingContent: '',
            promptRunId: '',
            streamingStartTime: Date.now(),
            elapsedTime: 0
        };
        this.conversationMessages.push(assistantMessage);
        this.scrollNeeded = true;
        
        // Start elapsed time counter
        this.startElapsedTimeCounter(assistantMessage);

        try {
            // Get GraphQL data provider
            const dataProvider = Metadata.Provider as GraphQLDataProvider;

            // Build template data
            const templateData = this.buildTemplateData();
            templateData['userMessage'] = userMessage;
            templateData['conversationHistory'] = this.buildConversationHistory();

            // Execute the prompt
            const query = `
                mutation RunAIPrompt($promptId: String!, $modelId: String!, $templateData: String) {
                    RunAIPrompt(promptId: $promptId, modelId: $modelId, templateData: $templateData) {
                        success
                        output
                        parsedResult
                        error
                        executionTimeMs
                        promptRunId
                        rawResult
                        renderedPrompt
                    }
                }
            `;

            const variables = {
                promptId: this.aiPrompt.ID,
                modelId: this.selectedModelId,
                templateData: JSON.stringify(templateData)
            };

            // Set up streaming simulation (will be replaced with real streaming)
            assistantMessage.promptRunId = this.generateMessageId(); // Temporary until we get real ID
            this.currentStreamingMessageId = assistantMessage.promptRunId;
            this.simulateStreaming(assistantMessage);

            const result = await dataProvider.ExecuteGQL(query, variables);
            const executionResult: AIPromptRunResult = result?.RunAIPrompt;

            // Stop streaming simulation and elapsed time counter
            if (this.streamingInterval) {
                clearInterval(this.streamingInterval);
                this.streamingInterval = null;
            }
            if (this.elapsedTimeInterval) {
                clearInterval(this.elapsedTimeInterval);
                this.elapsedTimeInterval = null;
            }

            // Update assistant message with result
            assistantMessage.isStreaming = false;
            assistantMessage.promptRunId = executionResult?.promptRunId || assistantMessage.promptRunId;
            assistantMessage.renderedPrompt = executionResult?.renderedPrompt;
            
            if (executionResult?.success) {
                // Store both raw and parsed content
                assistantMessage.rawContent = executionResult.rawResult || executionResult.output || '';
                assistantMessage.content = executionResult.parsedResult || executionResult.output || 'No response generated';
                assistantMessage.executionTime = executionResult.executionTimeMs;
            } else {
                assistantMessage.content = 'I encountered an error processing your request.';
                assistantMessage.error = executionResult?.error || 'Unknown error occurred';
            }

            delete assistantMessage.streamingContent;
            this.currentStreamingMessageId = null;
            this.scrollNeeded = true;

            // Auto-save conversation
            this.autoSaveConversation();

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
                'Failed to execute prompt: ' + (error as Error).message,
                'error',
                6000
            );
        } finally {
            this.isExecuting = false;
            this.currentStreamingMessageId = null;
            if (this.streamingInterval) {
                clearInterval(this.streamingInterval);
                this.streamingInterval = null;
            }
            if (this.elapsedTimeInterval) {
                clearInterval(this.elapsedTimeInterval);
                this.elapsedTimeInterval = null;
            }
        }
    }

    private simulateStreaming(message: ConversationMessage) {
        // Simulate streaming for demo purposes
        // This will be replaced with real GraphQL subscription streaming
        const sampleText = "I'm processing your prompt and will provide a response shortly...";
        let index = 0;
        
        this.streamingInterval = setInterval(() => {
            if (index < sampleText.length) {
                message.streamingContent = (message.streamingContent || '') + sampleText[index];
                index++;
                this.scrollNeeded = true;
            } else {
                clearInterval(this.streamingInterval);
                this.streamingInterval = null;
            }
        }, 50);
    }

    private buildTemplateData(): Record<string, any> {
        const data: Record<string, any> = {};
        
        for (const variable of this.templateVariables) {
            if (variable.name.trim()) {
                data[variable.name] = this.convertVariableValue(variable.value, variable.type);
            }
        }
        
        return data;
    }

    private buildConversationHistory(): string {
        return this.conversationMessages
            .filter(m => !m.isStreaming)
            .map(m => `${m.role}: ${m.content}`)
            .join('\n');
    }

    private convertVariableValue(value: string, type: string): any {
        switch (type) {
            case 'number':
                return parseFloat(value) || 0;
            case 'boolean':
                return value.toLowerCase() === 'true';
            case 'object':
            case 'array':
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
                }
            default:
                return value;
        }
    }

    public addVariable() {
        this.templateVariables.push({
            name: '',
            value: '',
            type: 'string',
            description: ''
        });
    }

    public removeVariable(index: number) {
        this.templateVariables.splice(index, 1);
    }

    public clearConversation() {
        if (this.conversationMessages.length > 0) {
            if (confirm('Are you sure you want to clear the conversation?')) {
                this.conversationMessages = [];
                this.currentConversationId = null;
            }
        }
    }

    public showRenderedPromptInMessage(message: ConversationMessage) {
        if (message.renderedPrompt) {
            this.renderedPromptContent = message.renderedPrompt;
            this.showRenderedPrompt = true;
        }
    }

    private scrollToBottom(): void {
        try {
            if (this.messagesContainer) {
                this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
            }
        } catch(err) {
            console.error('Error scrolling to bottom:', err);
        }
    }

    private generateMessageId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Saved conversations functionality
    private loadSavedConversations() {
        const saved = localStorage.getItem('mj_prompt_conversations');
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

    public saveConversation() {
        if (this.conversationMessages.length === 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'No messages to save',
                'warning',
                3000
            );
            return;
        }

        const name = prompt('Enter a name for this conversation:');
        if (!name) return;

        const conversation: SavedPromptConversation = {
            id: this.generateMessageId(),
            name: name,
            promptId: this.aiPrompt?.ID || '',
            promptName: this.aiPrompt?.Name || '',
            messages: [...this.conversationMessages],
            templateVariables: [...this.templateVariables],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        if (this.currentConversationId) {
            // Update existing conversation
            const index = this.savedConversations.findIndex(c => c.id === this.currentConversationId);
            if (index >= 0) {
                conversation.id = this.currentConversationId;
                conversation.createdAt = this.savedConversations[index].createdAt;
                this.savedConversations[index] = conversation;
            }
        } else {
            // Add new conversation
            this.savedConversations.unshift(conversation);
            this.currentConversationId = conversation.id;
        }

        // Limit to 50 saved conversations
        if (this.savedConversations.length > 50) {
            this.savedConversations = this.savedConversations.slice(0, 50);
        }

        localStorage.setItem('mj_prompt_conversations', JSON.stringify(this.savedConversations));
        
        MJNotificationService.Instance.CreateSimpleNotification(
            'Conversation saved successfully',
            'success',
            3000
        );
    }

    private autoSaveConversation() {
        if (this.currentConversationId && this.conversationMessages.length > 0) {
            const index = this.savedConversations.findIndex(c => c.id === this.currentConversationId);
            if (index >= 0) {
                this.savedConversations[index].messages = [...this.conversationMessages];
                this.savedConversations[index].templateVariables = [...this.templateVariables];
                this.savedConversations[index].updatedAt = new Date();
                localStorage.setItem('mj_prompt_conversations', JSON.stringify(this.savedConversations));
            }
        }
    }

    public loadConversation(conversation: SavedPromptConversation) {
        if (this.conversationMessages.length > 0) {
            if (!confirm('Loading this conversation will replace the current one. Continue?')) {
                return;
            }
        }

        this.conversationMessages = [...conversation.messages];
        this.currentConversationId = conversation.id;
        this.templateVariables = [...conversation.templateVariables];
        
        this.scrollNeeded = true;
        
        MJNotificationService.Instance.CreateSimpleNotification(
            'Conversation loaded',
            'info',
            3000
        );
    }

    public deleteConversation(conversation: SavedPromptConversation, event: Event) {
        event.stopPropagation();
        
        if (confirm(`Delete conversation "${conversation.name}"?`)) {
            const index = this.savedConversations.findIndex(c => c.id === conversation.id);
            if (index >= 0) {
                this.savedConversations.splice(index, 1);
                localStorage.setItem('mj_prompt_conversations', JSON.stringify(this.savedConversations));
                
                if (this.currentConversationId === conversation.id) {
                    this.currentConversationId = null;
                }
                
                MJNotificationService.Instance.CreateSimpleNotification(
                    'Conversation deleted',
                    'info',
                    3000
                );
            }
        }
    }

    public exportConversation() {
        if (this.conversationMessages.length === 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                'No messages to export',
                'warning',
                3000
            );
            return;
        }

        const exportData = {
            prompt: {
                id: this.aiPrompt?.ID,
                name: this.aiPrompt?.Name,
                description: this.aiPrompt?.Description
            },
            template: {
                id: this.template?.ID,
                name: this.template?.Name,
                content: this.templateContent?.TemplateText
            },
            messages: this.conversationMessages,
            templateVariables: this.templateVariables,
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `prompt-conversation-${this.aiPrompt?.Name?.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        window.URL.revokeObjectURL(url);
    }

    public importConversation() {
        this.fileInput.nativeElement.click();
    }

    public onFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target?.result as string);
                    
                    // Validate and import
                    if (data.messages && Array.isArray(data.messages)) {
                        if (this.conversationMessages.length > 0) {
                            if (!confirm('Importing will replace the current conversation. Continue?')) {
                                return;
                            }
                        }
                        
                        this.conversationMessages = data.messages.map((msg: any) => ({
                            ...msg,
                            timestamp: new Date(msg.timestamp)
                        }));
                        
                        // Import template variables
                        if (data.templateVariables) {
                            this.templateVariables = data.templateVariables;
                        }
                        
                        this.currentConversationId = null;
                        this.scrollNeeded = true;
                        
                        MJNotificationService.Instance.CreateSimpleNotification(
                            'Conversation imported successfully',
                            'success',
                            3000
                        );
                    } else {
                        throw new Error('Invalid conversation format');
                    }
                } catch (error) {
                    MJNotificationService.Instance.CreateSimpleNotification(
                        'Failed to import conversation: ' + (error as Error).message,
                        'error',
                        5000
                    );
                }
                
                // Reset file input
                input.value = '';
            };
            
            reader.readAsText(file);
        }
    }

    public handleKeyPress(event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    public getMessageClass(message: ConversationMessage): string {
        return `message message-${message.role}${message.isStreaming ? ' streaming' : ''}${message.error ? ' error' : ''}`;
    }

    public formatTimestamp(date: Date): string {
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    public getModelName(modelId: string): string {
        const model = this.availableModels.find(m => m.ID === modelId);
        return model ? model.Name : 'Unknown Model';
    }

    public closeRenderedPromptDialog() {
        this.showRenderedPrompt = false;
        this.renderedPromptContent = '';
    }

    public formatExecutionTime(milliseconds: number): string {
        if (milliseconds >= 60000) {
            const minutes = Math.floor(milliseconds / 60000);
            const seconds = ((milliseconds % 60000) / 1000).toFixed(2);
            return `${minutes}m ${seconds}s`;
        } else if (milliseconds >= 1000) {
            return `${(milliseconds / 1000).toFixed(2)}s`;
        } else {
            return `${milliseconds}ms`;
        }
    }

    public formatElapsedTime(milliseconds: number): string {
        const seconds = Math.floor(milliseconds / 1000);
        const ms = milliseconds % 1000;
        if (seconds > 0) {
            return `${seconds}.${Math.floor(ms / 100)}s`;
        } else {
            return `${ms}ms`;
        }
    }

    private startElapsedTimeCounter(message: ConversationMessage) {
        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
        }
        
        this.elapsedTimeInterval = setInterval(() => {
            if (message.streamingStartTime && message.isStreaming) {
                message.elapsedTime = Date.now() - message.streamingStartTime;
            } else {
                clearInterval(this.elapsedTimeInterval);
                this.elapsedTimeInterval = null;
            }
        }, 100); // Update every 100ms for smooth counter
    }

    public toggleRawView(message: ConversationMessage) {
        message.showRaw = !message.showRaw;
    }

    public isJsonContent(content: string): boolean {
        if (!content) return false;
        try {
            JSON.parse(content);
            return true;
        } catch {
            return false;
        }
    }

    public formatJson(content: string): string {
        try {
            return JSON.stringify(JSON.parse(content), null, 2);
        } catch {
            return content;
        }
    }

    public detectContentType(content: string): 'markdown' | 'json' | 'text' {
        if (!content) return 'text';
        
        // Check if it's JSON
        if (this.isJsonContent(content)) {
            return 'json';
        }
        
        // Check for markdown indicators
        const markdownPatterns = [
            /^#{1,6}\s/m,  // Headers
            /\*\*[^*]+\*\*/,  // Bold
            /\*[^*]+\*/,  // Italic
            /\[([^\]]+)\]\(([^)]+)\)/,  // Links
            /```[\s\S]*?```/,  // Code blocks
            /`[^`]+`/,  // Inline code
            /^[-*+]\s/m,  // Lists
            /^\d+\.\s/m  // Numbered lists
        ];
        
        if (markdownPatterns.some(pattern => pattern.test(content))) {
            return 'markdown';
        }
        
        return 'text';
    }

    public renderMarkdown(content: string): SafeHtml {
        // Basic markdown to HTML conversion with improved formatting
        let html = content;
        
        // Escape HTML first
        html = html.replace(/&/g, '&amp;')
                   .replace(/</g, '&lt;')
                   .replace(/>/g, '&gt;');
        
        // Code blocks with language support
        html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || '';
            const className = language ? ` class="language-${language}"` : '';
            return `<pre class="code-block"><code${className}>${code.trim()}</code></pre>`;
        });
        
        // Regular code blocks without language
        html = html.replace(/```([\s\S]*?)```/g, '<pre class="code-block"><code>$1</code></pre>');
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        
        // Headers
        html = html.replace(/^### (.+)$/gm, '<h3 class="markdown-h3">$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2 class="markdown-h2">$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1 class="markdown-h1">$1</h1>');
        
        // Bold
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="markdown-link">$1</a>');
        
        // Unordered lists
        html = html.replace(/^[*-+] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ul class="markdown-list">$1</ul>');
        
        // Numbered lists
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        html = html.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ol class="markdown-list">$1</ol>');
        
        // Paragraphs and line breaks - improved handling
        html = html.replace(/\n\s*\n/g, '</p><p class="markdown-paragraph">');
        html = html.replace(/\n/g, '<br>');
        html = `<p class="markdown-paragraph">${html}</p>`;
        
        // Clean up empty paragraphs
        html = html.replace(/<p class="markdown-paragraph"><\/p>/g, '');
        
        return this.sanitizer.bypassSecurityTrustHtml(`<div class="markdown-content">${html}</div>`);
    }

    public getFormattedContent(message: ConversationMessage): SafeHtml {
        const content = message.showRaw && message.rawContent ? message.rawContent : message.content;
        const contentStr = typeof content === 'string' ? content : String(content);
        const contentType = this.detectContentType(contentStr);
        
        if (contentType === 'json' && !message.showRaw) {
            // Try to extract human-readable content from JSON
            const extractedContent = this.extractHumanReadableContent(contentStr);
            if (extractedContent) {
                // Render with collapsible JSON section
                return this.renderJsonWithCollapsibleRaw(extractedContent, contentStr, message);
            } else {
                // Fallback to formatted JSON if no human-readable content found
                const formattedJson = this.formatJson(contentStr);
                const markdownJson = `\`\`\`json\n${formattedJson}\n\`\`\``;
                return this.renderMarkdown(markdownJson);
            }
        } else if (contentType === 'json' && message.showRaw) {
            // Show raw JSON when raw view is enabled
            const formattedJson = this.formatJson(contentStr);
            const markdownJson = `\`\`\`json\n${formattedJson}\n\`\`\``;
            return this.renderMarkdown(markdownJson);
        } else if (contentType === 'markdown' && !message.showRaw) {
            return this.renderMarkdown(contentStr);
        } else if (message.showRaw && message.rawContent) {
            // Format raw content as markdown code block
            const markdownRaw = `\`\`\`\n${contentStr}\n\`\`\``;
            return this.renderMarkdown(markdownRaw);
        } else {
            // Convert plain text to markdown for consistent formatting
            return this.renderMarkdown(contentStr);
        }
    }

    /**
     * Renders JSON content with human-readable content prominently displayed
     * and raw JSON in a collapsible section below with proper text wrapping.
     */
    private renderJsonWithCollapsibleRaw(extractedContent: string, rawJson: string, message: ConversationMessage): SafeHtml {
        const showRawSection = message.showJsonRaw || false;
        const messageId = message.id;
        
        // Format JSON with proper wrapping for display
        const wrappedJson = this.formatJsonForDisplay(rawJson);
        
        const html = `
            <div class="json-content-wrapper">
                <div class="json-main-content">
                    ${this.renderMarkdown(extractedContent).toString().replace(/<div class="markdown-content">|<\/div>/g, '')}
                </div>
                <div class="json-raw-section">
                    <button class="json-toggle-button" onclick="window.mjToggleJsonRawPrompt && window.mjToggleJsonRawPrompt('${messageId}')">
                        <i class="fa-solid ${showRawSection ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                        ${showRawSection ? 'Hide' : 'Show'} raw JSON
                    </button>
                    ${showRawSection ? `<div class="json-display-container">${wrappedJson}</div>` : ''}
                </div>
            </div>
        `;
        
        return this.sanitizer.bypassSecurityTrustHtml(html);
    }

    /**
     * Sets up global function for JSON toggle functionality
     */
    private setupGlobalJsonToggle() {
        (window as any).mjToggleJsonRawPrompt = (messageId: string) => {
            const message = this.conversationMessages.find(m => m.id === messageId);
            if (message) {
                this.toggleJsonRaw(message);
            }
        };
    }

    /**
     * Toggles the visibility of the JSON raw section
     */
    public toggleJsonRaw(message: ConversationMessage) {
        message.showJsonRaw = !message.showJsonRaw;
        // Force re-render by triggering change detection
        setTimeout(() => {
            // This will cause the content to re-render with updated state
        }, 0);
    }

    /**
     * Extracts human-readable content from JSON responses.
     * Prioritizes userMessage field first, then checks other common fields.
     * @param jsonStr - JSON string to extract content from
     * @returns Extracted human-readable content or null if none found
     */
    private extractHumanReadableContent(jsonStr: string): string | null {
        try {
            const parsed = JSON.parse(jsonStr);
            
            // Priority 1: Always check userMessage first, regardless of taskComplete status
            if (parsed.userMessage && typeof parsed.userMessage === 'string' && parsed.userMessage.trim()) {
                return parsed.userMessage;
            }
            
            // Priority 2: Check for nested userMessage in nextStep or other objects
            if (parsed.nextStep && parsed.nextStep.userMessage && 
                typeof parsed.nextStep.userMessage === 'string' && parsed.nextStep.userMessage.trim()) {
                return parsed.nextStep.userMessage;
            }
            
            // Priority 3: Other common human-readable fields
            const contentFields = [
                'message', 'content', 'response', 'text', 'output',
                'result', 'answer', 'reply', 'description', 'summary'
            ];
            
            for (const field of contentFields) {
                if (parsed[field] && typeof parsed[field] === 'string' && parsed[field].trim()) {
                    return parsed[field];
                }
            }
            
            // Priority 4: Check nested objects for content
            for (const key of Object.keys(parsed)) {
                if (typeof parsed[key] === 'object' && parsed[key] !== null) {
                    for (const field of ['userMessage', 'message', 'content']) {
                        if (parsed[key][field] && typeof parsed[key][field] === 'string' && parsed[key][field].trim()) {
                            return parsed[key][field];
                        }
                    }
                }
            }
            
            // Priority 5: If it's a simple string value, return it
            if (typeof parsed === 'string' && parsed.trim()) {
                return parsed;
            }
            
            // Priority 6: If it's an object with a single string property, consider returning it
            const keys = Object.keys(parsed);
            if (keys.length === 1 && typeof parsed[keys[0]] === 'string' && parsed[keys[0]].trim()) {
                return parsed[keys[0]];
            }
            
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Checks if a message contains JSON content that has extractable human-readable content.
     * Used to determine if the raw toggle should be shown.
     * @param message - The conversation message to check
     * @returns True if the message has extractable content different from raw JSON
     */
    public hasExtractableContent(message: ConversationMessage): boolean {
        if (!message.content || message.role === 'user') {
            return false;
        }
        
        const contentStr = typeof message.content === 'string' ? message.content : String(message.content);
        if (!this.isJsonContent(contentStr)) {
            return false;
        }
        
        const extractedContent = this.extractHumanReadableContent(contentStr);
        return extractedContent !== null && extractedContent !== contentStr;
    }

    /**
     * Determines whether to show the raw toggle button for a message.
     * Combines the logic for raw content availability and extractable content.
     * @param message - The conversation message to check
     * @returns True if the raw toggle should be displayed
     */
    public showRawToggle(message: ConversationMessage): boolean {
        return (message.rawContent && !message.isStreaming) || this.hasExtractableContent(message);
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Formats JSON for proper display with text wrapping instead of wide code blocks.
     * Creates a structured, readable format that respects container width.
     */
    private formatJsonForDisplay(jsonStr: string): string {
        try {
            const parsed = JSON.parse(jsonStr);
            return this.createJsonDisplayHtml(parsed, 0);
        } catch {
            // If JSON parsing fails, escape and display as-is with wrapping
            return `<div class="json-fallback">${this.escapeHtml(jsonStr)}</div>`;
        }
    }

    /**
     * Creates formatted HTML for JSON display with proper indentation and wrapping.
     */
    private createJsonDisplayHtml(obj: any, depth: number = 0): string {
        const indent = '  '.repeat(depth);
        const nextIndent = '  '.repeat(depth + 1);
        
        if (obj === null) return `<span class="json-null">null</span>`;
        if (typeof obj === 'boolean') return `<span class="json-boolean">${obj}</span>`;
        if (typeof obj === 'number') return `<span class="json-number">${obj}</span>`;
        if (typeof obj === 'string') {
            const escaped = this.escapeHtml(obj);
            return `<span class="json-string">"<span class="json-string-content">${escaped}</span>"</span>`;
        }
        
        if (Array.isArray(obj)) {
            if (obj.length === 0) return '<span class="json-bracket">[]</span>';
            
            const items = obj.map(item => 
                `<div class="json-array-item">${nextIndent}${this.createJsonDisplayHtml(item, depth + 1)}</div>`
            ).join(',\n');
            
            return `<span class="json-bracket">[</span>\n${items}\n<div class="json-indent">${indent}</div><span class="json-bracket">]</span>`;
        }
        
        if (typeof obj === 'object') {
            const keys = Object.keys(obj);
            if (keys.length === 0) return '<span class="json-bracket">{}</span>';
            
            const properties = keys.map(key => {
                const escapedKey = this.escapeHtml(key);
                const value = this.createJsonDisplayHtml(obj[key], depth + 1);
                return `<div class="json-property">${nextIndent}<span class="json-key">"${escapedKey}"</span><span class="json-colon">:</span> ${value}</div>`;
            }).join(',\n');
            
            return `<span class="json-bracket">{</span>\n${properties}\n<div class="json-indent">${indent}</div><span class="json-bracket">}</span>`;
        }
        
        return String(obj);
    }
}