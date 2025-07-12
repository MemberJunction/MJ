import { Component, Input, OnInit, OnChanges } from '@angular/core';
import { ChatMessage, ChatMessageRole, ChatMessageContent, ChatMessageContentBlock } from '@memberjunction/ai';

interface MessageDisplay {
    message: ChatMessage;
    visible: boolean;
    expanded: boolean;
    sequenceNumber: number;
}

@Component({
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
            // we should return this 
            return contentAny.text;
        }
        else {
            return JSON.stringify(content, null, 2);
        }
    }
    
    public getContentStats(content: ChatMessageContent): { chars: number; words: number; approxTokens: number } {
        const text = this.getContentString(content);
        const chars = text.length;
        const words = text.trim() ? text.trim().split(/\s+/).filter(word => word.length > 0).length : 0;
        const approxTokens = Math.round(words * 1.25); // Average 1.25 tokens per word
        return { chars, words, approxTokens };
    }
    
    public copyMessageContent(content: ChatMessageContent) {
        const text = this.getContentString(content);
        navigator.clipboard.writeText(text).then(() => {
            console.log('Message content copied to clipboard');
        }).catch(err => {
            console.error('Failed to copy message:', err);
        });
    }
}