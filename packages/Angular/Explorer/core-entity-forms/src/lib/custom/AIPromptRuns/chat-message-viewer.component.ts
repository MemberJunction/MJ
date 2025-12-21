import { Component, Input, OnInit, OnChanges } from '@angular/core';
import { ChatMessage, ChatMessageRole, ChatMessageContent, ChatMessageContentBlock } from '@memberjunction/ai';

interface MessageDisplay {
    message: ChatMessage;
    visible: boolean;
    expanded: boolean;
    sequenceNumber: number;
}

@Component({
  standalone: false,
    selector: 'mj-chat-message-viewer',
    templateUrl: './chat-message-viewer.component.html',
    styleUrls: ['./chat-message-viewer.component.css']
})
export class ChatMessageViewerComponent implements OnInit, OnChanges {
    @Input() messages: ChatMessage[] = [];
    
    public displayMessages: MessageDisplay[] = [];
    public showSystem = true;
    public showUser = true;
    public showAssistant = true;
    
    // Track expanded state for content parts
    private contentPartStates = new Map<string, boolean>();
    
    ngOnInit() {
        this.processMessages();
    }
    
    ngOnChanges() {
        this.processMessages();
    }
    
    private processMessages() {
        this.displayMessages = this.messages.map((msg, index) => ({
            message: msg,
            visible: this.isMessageVisible(msg),
            expanded: true,
            sequenceNumber: index + 1
        }));
    }
    
    private isMessageVisible(message: ChatMessage): boolean {
        switch (message.role) {
            case 'system':
                return this.showSystem;
            case 'user':
                return this.showUser;
            case 'assistant':
                return this.showAssistant;
            default:
                return true;
        }
    }
    
    public onFilterChange() {
        this.displayMessages.forEach(dm => {
            dm.visible = this.isMessageVisible(dm.message);
        });
    }
    
    public getRoleIcon(role: string): string {
        switch (role) {
            case 'system':
                return 'fa-cog';
            case 'user':
                return 'fa-user';
            case 'assistant':
                return 'fa-robot';
            default:
                return 'fa-comment';
        }
    }
    
    public getRoleColor(role: string): string {
        switch (role) {
            case 'system':
                return '#2563eb'; // blue
            case 'user':
                return '#059669'; // green
            case 'assistant':
                return '#7c3aed'; // purple
            default:
                return '#6b7280'; // gray
        }
    }
    
    public getRoleLabel(role: string): string {
        return role.charAt(0).toUpperCase() + role.slice(1);
    }
    
    public toggleMessage(index: number) {
        this.displayMessages[index].expanded = !this.displayMessages[index].expanded;
    }
    
    public getContentString(content: ChatMessageContent): string {
        if (typeof content === 'string') {
            return content;
        } else {
            const contentAny = content as any;
            // check to see if we have a text sub-property and if so
            if (contentAny.text?.trim().length > 0) {
                // we should return this 
                return contentAny.text;
            }
            else {
                return JSON.stringify(content, null, 2);
            }
        }
    }
    
    public getContentLanguage(content: ChatMessageContent): string {
        const text = this.getContentString(content);
        
        // Try to detect language based on content
        if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
            return 'json';
        } else if (text.includes('```') || text.includes('# ') || text.includes('**')) {
            return 'markdown';
        } else if (text.includes('function') || text.includes('const') || text.includes('let')) {
            return 'javascript';
        } else if (text.includes('SELECT') || text.includes('FROM') || text.includes('WHERE')) {
            return 'sql';
        }
        
        return 'markdown'; // default to markdown for formatting
    }
    
    public getContentBlockIcon(type: string): string {
        switch (type) {
            case 'image_url':
                return 'fa-image';
            case 'video_url':
                return 'fa-video';
            case 'audio_url':
                return 'fa-music';
            case 'file_url':
                return 'fa-file';
            default:
                return 'fa-paperclip';
        }
    }
    
    public isStringContent(content: ChatMessageContent): boolean {
        return typeof content === 'string';
    }
    
    public getContentJSON(content: ChatMessageContent): string {
        if (typeof content === 'string') {
            return content; // Shouldn't happen but just in case
        }
        // check to see if we have a text sub-property and if so
        // check to see if there are any other sub-properties that have non-empty values or non-empty-arrays/non-empty-object values
        const contentAny = content as any;
        if (contentAny.text?.trim().length > 0) {
            // check to see if there is just one more property called json, if that is the case, append that with a ```json block to the text
            // and return that
            if (contentAny.json) {
                return contentAny.text + '\n\n```json\n' + JSON.stringify(contentAny.json, null, 2) + '\n```';
            }
            else {
                // now check to see if there are any other sub-properties that have non-empty values or non-empty-arrays/non-empty-object values
                const hasNonEmptySubProps = Object.keys(contentAny).some(key => {
                    if (key === 'text') return false; // skip text property
                    const value = contentAny[key];
                    if (typeof value === 'string' && value.trim().length > 0) return true;
                    if (Array.isArray(value) && value.length > 0) return true;
                    if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) return true;
                    return false;
                });
                if (hasNonEmptySubProps) {
                    // return the full JSON with text included
                    return JSON.stringify(contentAny, null, 2);
                }
                else {
                    // if there are no other non-empty sub-properties, just return the text
                    return contentAny.text;
                }
            }
        }
        else {
            // if there is no text property, just return the full JSON
            return JSON.stringify(content, null, 2);
        }
    }
    
    public getContentStats(content: ChatMessageContent): { chars: number; words: number; approxTokens: number } {
        let totalChars = 0;
        let totalWords = 0;
        
        if (typeof content === 'string') {
            // For string content, use the content directly
            totalChars = content.length;
            totalWords = content.trim() ? content.trim().split(/\s+/).filter(word => word.length > 0).length : 0;
        } else {
            // For non-string content, calculate stats from all non-empty parts
            const contentAny = content as any;
            Object.keys(contentAny).forEach(key => {
                const value = contentAny[key];
                
                // Skip empty values
                if (value === null || value === undefined) return;
                
                let partText: string;
                if (typeof value === 'string') {
                    partText = value;
                } else if (Array.isArray(value) && value.length > 0) {
                    partText = JSON.stringify(value, null, 2);
                } else if (typeof value === 'object' && Object.keys(value).length > 0) {
                    partText = JSON.stringify(value, null, 2);
                } else {
                    return; // Skip empty arrays/objects
                }
                
                totalChars += partText.length;
                const partWords = partText.trim().split(/\s+/).filter(word => word.length > 0).length;
                totalWords += partWords;
            });
        }
        
        const approxTokens = Math.round(totalWords * 1.25); // Average 1.25 tokens per word
        return { chars: totalChars, words: totalWords, approxTokens };
    }
    
    public copyMessageContent(content: ChatMessageContent) {
        const text = this.getContentString(content);
        navigator.clipboard.writeText(text).then(() => {
            console.log('Message content copied to clipboard');
        }).catch(err => {
            console.error('Failed to copy message:', err);
        });
    }
    
    /**
     * Get content parts for multi-part content display
     * Returns an array of {id, key, value, language, expanded} objects for each content part
     */
    public getContentParts(content: ChatMessageContent, messageIndex: number): Array<{id: string, key: string, value: string, language: string, expanded: boolean}> {
        if (typeof content === 'string') {
            const id = `msg-${messageIndex}-part-content`;
            return [{
                id: id,
                key: 'content', 
                value: content, 
                language: 'markdown',
                expanded: this.isPartExpanded(id)
            }];
        }
        
        const contentAny = content as any;
        const parts: Array<{id: string, key: string, value: string, language: string, expanded: boolean}> = [];
        
        // Process each key in the content object
        Object.keys(contentAny).forEach((key, index) => {
            const value = contentAny[key];
            
            // Skip empty values
            if (value === null || value === undefined) return;
            if (typeof value === 'string' && value.trim().length === 0) return;
            if (Array.isArray(value) && value.length === 0) return;
            if (typeof value === 'object' && Object.keys(value).length === 0) return;
            
            // Determine the display value and language
            let displayValue: string;
            let language: string;
            
            if (typeof value === 'string') {
                displayValue = value;
                language = this.detectLanguageForKey(key, value);
            } else {
                // For objects/arrays, stringify them
                displayValue = JSON.stringify(value, null, 2);
                language = 'json';
            }
            
            const id = `msg-${messageIndex}-part-${key}`;
            parts.push({
                id: id,
                key: this.formatKeyLabel(key),
                value: displayValue,
                language: language,
                expanded: this.isPartExpanded(id)
            });
        });
        
        return parts;
    }
    
    /**
     * Detect language based on key name and content
     */
    private detectLanguageForKey(key: string, value: string): string {
        // Check key-based hints first
        const keyLower = key.toLowerCase();
        if (keyLower.includes('json') || keyLower.includes('data')) return 'json';
        if (keyLower.includes('sql') || keyLower.includes('query')) return 'sql';
        if (keyLower.includes('code') || keyLower.includes('script')) return 'javascript';
        if (keyLower.includes('markdown') || keyLower.includes('md')) return 'markdown';
        if (keyLower.includes('html')) return 'html';
        if (keyLower.includes('css')) return 'css';
        if (keyLower.includes('xml')) return 'xml';
        if (keyLower.includes('yaml') || keyLower.includes('yml')) return 'yaml';
        
        // Fall back to content detection
        return this.getContentLanguage({text: value} as any);
    }
    
    /**
     * Format key name for display label
     */
    private formatKeyLabel(key: string): string {
        // Convert camelCase or snake_case to Title Case
        return key
            .replace(/([A-Z])/g, ' $1') // Add space before capitals
            .replace(/_/g, ' ') // Replace underscores with spaces
            .replace(/\b\w/g, l => l.toUpperCase()) // Capitalize first letter of each word
            .trim();
    }
    
    /**
     * Check if content has multiple parts (for non-string content)
     */
    public hasMultipleParts(content: ChatMessageContent): boolean {
        if (typeof content === 'string') return false;
        
        const contentAny = content as any;
        const nonEmptyKeys = Object.keys(contentAny).filter(key => {
            const value = contentAny[key];
            if (value === null || value === undefined) return false;
            if (typeof value === 'string' && value.trim().length === 0) return false;
            if (Array.isArray(value) && value.length === 0) return false;
            if (typeof value === 'object' && Object.keys(value).length === 0) return false;
            return true;
        });
        
        return nonEmptyKeys.length > 1;
    }
    
    /**
     * Check if a content part is expanded
     */
    private isPartExpanded(partId: string): boolean {
        // Default to expanded for all parts initially
        if (!this.contentPartStates.has(partId)) {
            this.contentPartStates.set(partId, true);
        }
        return this.contentPartStates.get(partId) || false;
    }
    
    /**
     * Toggle the expanded state of a content part
     */
    public toggleContentPart(partId: string): void {
        const currentState = this.contentPartStates.get(partId) || false;
        this.contentPartStates.set(partId, !currentState);
    }
}