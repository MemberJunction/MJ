import { ChatMessage } from "@memberjunction/ai";

/**
 * Azure AI Chat Completion Request type
 */
export interface AzureChatCompletionRequest {
  /**
   * The messages to send to the model
   */
  messages: ChatMessage[];
  
  /**
   * The ID of the model to use
   */
  model?: string;
  
  /**
   * The maximum number of tokens to generate
   */
  max_tokens?: number;
  
  /**
   * The temperature for sampling
   */
  temperature?: number;
  
  /**
   * The nucleus sampling, top_p probability mass
   */
  top_p?: number;
  
  /**
   * Whether to stream the response
   */
  stream?: boolean;
  
  /**
   * The number of chat completion choices to generate
   */
  n?: number;
  
  /**
   * Format of the response to be returned
   */
  response_format?: {
    type: "json_object" | "text";
  };
}

/**
 * Response from Azure AI chat completions
 */
export interface AzureChatCompletionResponse {
  /**
   * Unique identifier for this chat completion
   */
  id: string;
  
  /**
   * Object type, always "chat.completion"
   */
  object: string;
  
  /**
   * Creation timestamp
   */
  created: number;
  
  /**
   * Model used for completion
   */
  model: string;
  
  /**
   * The completion choices
   */
  choices: AzureChatCompletionChoice[];
  
  /**
   * Token usage information
   */
  usage: AzureTokenUsage;
}

/**
 * Azure Chat Completion Choice
 */
export interface AzureChatCompletionChoice {
  /**
   * Index of the choice
   */
  index: number;
  
  /**
   * The chat message
   */
  message: {
    /**
     * Role of the message author
     */
    role: string;
    
    /**
     * Message content
     */
    content: string;
  };
  
  /**
   * Reason the chat completion finished
   */
  finish_reason: string;
}

/**
 * Azure Chat Completion streaming chunk
 */
export interface AzureChatCompletionChunk {
  /**
   * Unique identifier for this chat completion
   */
  id: string;
  
  /**
   * Object type, always "chat.completion.chunk"
   */
  object: string;
  
  /**
   * Creation timestamp
   */
  created: number;
  
  /**
   * Model used for completion
   */
  model: string;
  
  /**
   * The chunk choices
   */
  choices: AzureChatCompletionChunkChoice[];
  
  /**
   * Optional token usage information
   */
  usage?: AzureTokenUsage;
}

/**
 * Azure Chat Completion Chunk Choice
 */
export interface AzureChatCompletionChunkChoice {
  /**
   * Index of the choice
   */
  index: number;
  
  /**
   * Delta content for streaming
   */
  delta: {
    /**
     * Role of the message author (only in first chunk)
     */
    role?: string;
    
    /**
     * Message content (may be empty or partial)
     */
    content?: string;
  };
  
  /**
   * Reason the chat completion finished (only in last chunk)
   */
  finish_reason: string | null;
}

/**
 * Azure Token Usage information
 */
export interface AzureTokenUsage {
  /**
   * Number of tokens in the prompt
   */
  prompt_tokens: number;
  
  /**
   * Number of tokens in the completion
   */
  completion_tokens: number;
  
  /**
   * Total number of tokens used
   */
  total_tokens: number;
}