import { RegisterClass, ParseJSONRecursive, ParseJSONOptions } from '@memberjunction/global';
import { BaseEntity } from '@memberjunction/core';
import { AIPromptRunEntity } from '@memberjunction/core-entities';
import { ChatMessage } from '@memberjunction/ai';

/**
 * Extended AIPromptRunEntity class with helper methods for extracting 
 * conversation messages and data from the stored JSON.
 */
@RegisterClass(BaseEntity, 'MJ: AI Prompt Runs')
export class AIPromptRunEntityExtended extends AIPromptRunEntity {
    
    /**
     * Parses and extracts all message data from the Messages field.
     * This uses the exact logic from the AI Prompt Run form component.
     * @returns Object containing chatMessages, inputData, and formattedMessages
     */
    public ParseMessagesData(): {
        chatMessages: ChatMessage[];
        inputData: any | null;
        formattedMessages: string;
        formattedData: string;
    } {
        const parseOptions: ParseJSONOptions = {
            extractInlineJson: true,
            maxDepth: 100,
            debug: false
        };

        let chatMessages: ChatMessage[] = [];
        let inputData: any = null;
        let formattedMessages: string = '';
        let formattedData: string = '';

        // Format messages with recursive JSON parsing
        if (this.Messages) {
            try {
                const parsed = JSON.parse(this.Messages);
                const recursivelyParsed = ParseJSONRecursive(parsed, parseOptions);
                formattedMessages = JSON.stringify(recursivelyParsed, null, 2);
                
                // Extract messages array and data
                if (recursivelyParsed && typeof recursivelyParsed === 'object') {
                    // Extract chat messages if they exist
                    if (recursivelyParsed.messages && Array.isArray(recursivelyParsed.messages)) {
                        chatMessages = recursivelyParsed.messages as ChatMessage[];
                    } else {
                        chatMessages = [];
                    }
                    
                    // Extract data object if it exists
                    if (recursivelyParsed.data) {
                        inputData = recursivelyParsed.data;
                        formattedData = JSON.stringify(recursivelyParsed.data, null, 2);
                    } else {
                        inputData = null;
                        formattedData = '';
                    }
                }
            } catch {
                formattedMessages = this.Messages;
                chatMessages = [];
                inputData = null;
                formattedData = '';
            }
        } else {
            formattedMessages = '';
            chatMessages = [];
            inputData = null;
            formattedData = '';
        }

        return {
            chatMessages,
            inputData,
            formattedMessages,
            formattedData
        };
    }
    
    /**
     * Extracts just the chat messages from the stored Messages JSON field.
     * @returns Array of ChatMessage objects, or empty array if no messages found
     */
    public GetChatMessages(): ChatMessage[] {
        const { chatMessages } = this.ParseMessagesData();
        return chatMessages;
    }

    /**
     * Extracts the data context from the stored Messages JSON field.
     * @returns The data object if found, or null
     */
    public GetDataContext(): any | null {
        const { inputData } = this.ParseMessagesData();
        return inputData;
    }

    /**
     * Formats the Messages field for display with proper JSON formatting.
     * @returns Formatted JSON string
     */
    public GetFormattedMessages(): string {
        const { formattedMessages } = this.ParseMessagesData();
        return formattedMessages;
    }

    /**
     * Formats the Result field for display with proper JSON formatting.
     * Uses exact logic from AI Prompt Run form.
     * @returns Formatted JSON string
     */
    public GetFormattedResult(): string {
        if (!this.Result) {
            return '';
        }

        const parseOptions: ParseJSONOptions = {
            extractInlineJson: true,
            maxDepth: 100,
            debug: false
        };

        try {
            const parsed = JSON.parse(this.Result);
            const recursivelyParsed = ParseJSONRecursive(parsed, parseOptions);
            return JSON.stringify(recursivelyParsed, null, 2);
        } catch {
            return this.Result;
        }
    }

    /**
     * Extracts the system prompt from the chat messages.
     * This is useful for re-running prompts with the exact same system prompt.
     * @returns The system prompt content if found, or null
     */
    public GetSystemPrompt(): string | null {
        const messages = this.GetChatMessages();
        
        // Find the first system message
        const systemMessage = messages.find(msg => msg.role === 'system');
        
        if (!systemMessage) {
            return null;
        }
        
        // Handle different content types
        if (typeof systemMessage.content === 'string') {
            return systemMessage.content;
        } else if (Array.isArray(systemMessage.content)) {
            // If content is an array of content blocks, extract text content
            const textBlocks = systemMessage.content.filter(block => block.type === 'text');
            if (textBlocks.length > 0) {
                return textBlocks.map(block => block.content).join('\n');
            }
        }
        
        return null;
    }
}