import { BaseAgent } from '@memberjunction/ai-agents';
import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus, RunView, Metadata, UserInfo } from '@memberjunction/core';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { Conversation, AudioInterface, ClientTools } from '@elevenlabs/elevenlabs-js/api/resources/conversationalAi/conversation';
import { EventEmitter } from 'events';
import { ActionEntityExtended } from '@memberjunction/actions-base';
import { ActionParamEntity } from '@memberjunction/core-entities';

// Real-time conversation configuration
const ELEVEN_LABS_CONFIG = {
  AGENT_ID: 'agent_8501kfsjva8xezmr0zj4sjm57a3x', // Conversational AI agent ID from Eleven Labs
};

/**
 * Callbacks for real-time conversation events.
 * Used to bridge Eleven Labs Conversation events to VoiceConversationHandler.
 */
export interface ConversationCallbacks {
  /** Called when user speech is transcribed */
  onUserTranscript: (text: string) => Promise<void>;
  /** Called when agent generates a text response */
  onAgentResponse: (text: string) => Promise<void>;
  /** Called when agent generates audio output */
  onAudioChunk: (audioBuffer: Buffer) => Promise<void>;
  /** Called when agent requests a tool execution */
  onToolCall: (toolName: string, params: Record<string, unknown>) => Promise<string>;
  /** Called when an error occurs */
  onError: (error: Error) => Promise<void>;
  /** Called when conversation completes */
  onComplete: () => Promise<void>;
}

/**
 * Tool definition in Eleven Labs format (OpenAI function calling compatible).
 */
interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

/**
 * Custom agent driver for Audio Sage real-time conversations.
 *
 * ARCHITECTURE:
 * - Extends BaseAgent to leverage MJ's agent infrastructure
 * - Uses Eleven Labs Conversational AI for bidirectional audio streaming
 * - Manages WebSocket connections to Eleven Labs via the Conversation API
 * - Bridges events between VoiceConversationHandler (WebSocket to client) and Eleven Labs
 * - Converts MJ Actions to Eleven Labs tool definitions for function calling
 *
 * REAL-TIME FLOW:
 * 1. VoiceConversationHandler establishes WebSocket with client
 * 2. AudioSageAgent.startConversation() creates Eleven Labs Conversation
 * 3. Audio streams bidirectionally: Client <-> VoiceConversationHandler <-> AudioSageAgent <-> Eleven Labs
 * 4. Eleven Labs handles STT, LLM processing, TTS internally
 * 5. Tool calls from Eleven Labs execute MJ Actions via callbacks
 * 6. Conversation continues until client disconnects or explicitly ends
 */
@RegisterClass(BaseAgent, 'AudioSageAgent')
export class AudioSageAgent extends BaseAgent {
  private elevenLabsClient: ElevenLabsClient;
  private activeConversations = new Map<string, Conversation>();
  private conversationEmitters = new Map<string, EventEmitter>();

  constructor() {
    super();

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY environment variable required');
    }

    LogStatus(`AudioSageAgent: Initializing with Eleven Labs API key: ${apiKey.substring(0, 8)}...`);
    this.elevenLabsClient = new ElevenLabsClient({ apiKey });
  }

  // ============================================================================
  // REAL-TIME CONVERSATION METHODS
  // ============================================================================

  /**
   * Start a real-time bidirectional conversation using Eleven Labs Conversation API.
   *
   * @param sessionId - Unique session identifier (from VoiceConversationHandler)
   * @param systemPrompt - MJ prompt to override Eleven Labs agent's default prompt
   * @param callbacks - Event callbacks for streaming data back to client
   * @param contextUser - User context for action execution
   */
  async startConversation(
    sessionId: string,
    systemPrompt: string,
    callbacks: ConversationCallbacks,
    contextUser: UserInfo
  ): Promise<void> {
    try {
      LogStatus(`AudioSageAgent: Starting real-time conversation session ${sessionId}`);

      // Create custom audio interface for bidirectional streaming
      const audioInterface = this.createAudioInterface(sessionId, callbacks);

      // Get tool definitions from MJ Actions configured for this agent
      const toolDefinitions = await this.getToolDefinitions(contextUser);

      LogStatus(`AudioSageAgent [${sessionId}]: Loaded ${toolDefinitions.length} tool definitions`);

      // Create ClientTools instance and register tools
      let clientTools: ClientTools | undefined = undefined;
      if (toolDefinitions.length > 0) {
        clientTools = new ClientTools();
        for (const tool of toolDefinitions) {
          const toolName = tool.function.name;
          clientTools.register(
            toolName,
            async (parameters: Record<string, unknown>) => {
              return await this.executeToolCall(sessionId, toolName, parameters, callbacks, contextUser);
            },
            true // isAsync
          );
        }
      }

      // Create Eleven Labs conversation with prompt override
      LogStatus(`AudioSageAgent [${sessionId}]: Creating Eleven Labs Conversation with agent ID: ${ELEVEN_LABS_CONFIG.AGENT_ID}`);

      const conversation = new Conversation({
        client: this.elevenLabsClient,
        agentId: ELEVEN_LABS_CONFIG.AGENT_ID,
        requiresAuth: true,
        audioInterface: audioInterface,
        config: {
          conversationConfigOverride: {
            agent: {
              prompt: {
                prompt: systemPrompt
              }
            }
          }
        },
        clientTools: clientTools,
        callbackUserTranscript: async (transcript: string) => {
          LogStatus(`AudioSageAgent [${sessionId}]: User transcript: "${transcript}"`);
          await callbacks.onUserTranscript(transcript);
        },
        callbackAgentResponse: async (response: string) => {
          LogStatus(`AudioSageAgent [${sessionId}]: Agent response: "${response}"`);
          await callbacks.onAgentResponse(response);
        }
      });

      LogStatus(`AudioSageAgent [${sessionId}]: Eleven Labs Conversation object created, calling startSession()`);

      // Store conversation for this session
      this.activeConversations.set(sessionId, conversation);

      // Start WebSocket session with Eleven Labs
      LogStatus(`AudioSageAgent [${sessionId}]: Calling conversation.startSession() to establish WebSocket with Eleven Labs...`);
      await conversation.startSession();
      LogStatus(`AudioSageAgent [${sessionId}]: conversation.startSession() completed successfully`);

      LogStatus(`AudioSageAgent: Session ${sessionId} started successfully`);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogError(`AudioSageAgent: Failed to start session ${sessionId} - ${errorMessage}`);
      await callbacks.onError(error instanceof Error ? error : new Error(errorMessage));
      throw error;
    }
  }

  /**
   * Send audio chunk to active conversation.
   * Audio is sent through the EventEmitter to the custom AudioInterface.
   */
  async sendAudioChunk(sessionId: string, audioBuffer: Buffer): Promise<void> {
    const conversation = this.activeConversations.get(sessionId);
    if (!conversation) {
      throw new Error(`No active conversation for session: ${sessionId}`);
    }

    // Emit audio chunk through the EventEmitter
    const emitter = this.conversationEmitters.get(sessionId);
    if (emitter) {
      LogStatus(`AudioSageAgent [${sessionId}]: Emitting audio chunk (${audioBuffer.length} bytes) to AudioInterface`);
      emitter.emit('audio-input', audioBuffer);
    } else {
      throw new Error(`No audio emitter for session: ${sessionId}`);
    }
  }

  /**
   * Send text message to conversation.
   */
  async sendText(sessionId: string, text: string): Promise<void> {
    const conversation = this.activeConversations.get(sessionId);
    if (!conversation) {
      throw new Error(`No active conversation for session: ${sessionId}`);
    }

    conversation.sendUserMessage(text);
    LogStatus(`AudioSageAgent [${sessionId}]: Sent text message: "${text}"`);
  }

  /**
   * Interrupt agent's current response.
   */
  async interrupt(sessionId: string): Promise<void> {
    const conversation = this.activeConversations.get(sessionId);
    if (!conversation) {
      throw new Error(`No active conversation for session: ${sessionId}`);
    }

    // The AudioInterface's interrupt() method will be called automatically
    // by the Conversation class when user speaks during agent output
    LogStatus(`AudioSageAgent [${sessionId}]: Interrupt requested`);
  }

  /**
   * End conversation session and clean up resources.
   */
  async endConversation(sessionId: string): Promise<void> {
    const conversation = this.activeConversations.get(sessionId);
    if (conversation) {
      conversation.endSession();
      this.activeConversations.delete(sessionId);
      this.conversationEmitters.delete(sessionId);
      LogStatus(`AudioSageAgent: Session ${sessionId} ended and cleaned up`);
    }
  }

  // ============================================================================
  // HELPER METHODS FOR REAL-TIME CONVERSATIONS
  // ============================================================================

  /**
   * Create custom audio interface for bidirectional streaming.
   * Uses EventEmitter to bridge audio input from VoiceConversationHandler to Eleven Labs.
   */
  private createAudioInterface(sessionId: string, callbacks: ConversationCallbacks): AudioInterface {
    const emitter = new EventEmitter();
    this.conversationEmitters.set(sessionId, emitter);

    // Create custom AudioInterface implementation
    const audioInterface = new (class extends AudioInterface {
      private inputCallback?: (audio: Buffer) => void;

      constructor(private emitter: EventEmitter, private callbacks: ConversationCallbacks, private sessionId: string) {
        super();
      }

      start(inputCallback: (audio: Buffer) => void): void {
        this.inputCallback = inputCallback;

        // Wire up emitter to call inputCallback when audio arrives
        this.emitter.on('audio-input', (audioBuffer: Buffer) => {
          LogStatus(`AudioSageAgent [${this.sessionId}]: AudioInterface received audio (${audioBuffer.length} bytes), forwarding to Eleven Labs`);
          if (this.inputCallback) {
            this.inputCallback(audioBuffer);
          } else {
            LogError(`AudioSageAgent [${this.sessionId}]: No inputCallback set when audio arrived!`);
          }
        });

        LogStatus(`AudioSageAgent [${this.sessionId}]: AudioInterface started and ready to receive audio`);
      }

      stop(): void {
        this.emitter.removeAllListeners('audio-input');
        this.inputCallback = undefined;
        LogStatus(`AudioSageAgent [${this.sessionId}]: AudioInterface stopped`);
      }

      output(audio: Buffer): void {
        LogStatus(`AudioSageAgent [${this.sessionId}]: Received audio output from Eleven Labs (${audio.length} bytes), streaming to client`);
        // Stream audio chunk to client via callback
        this.callbacks.onAudioChunk(audio).catch(error => {
          LogError(`AudioSageAgent [${this.sessionId}]: Failed to output audio - ${error instanceof Error ? error.message : String(error)}`);
        });
      }

      interrupt(): void {
        LogStatus(`AudioSageAgent [${this.sessionId}]: Audio output interrupted`);
      }
    })(emitter, callbacks, sessionId);

    return audioInterface;
  }

  /**
   * Get tool definitions from MJ Actions configured for this agent.
   * Converts MJ Action metadata to Eleven Labs tool format (OpenAI function calling compatible).
   */
  private async getToolDefinitions(contextUser: UserInfo): Promise<ToolDefinition[]> {
    try {
      // For now, return empty array - tool configuration will be loaded from agent metadata
      // This will be implemented when we have the agent configuration system in place
      LogStatus('AudioSageAgent: Tool definitions not yet configured');
      return [];

      // Future implementation:
      // const agentConfig = await this.getAgentConfiguration(contextUser);
      // const actions = await this.loadActionsForAgent(agentConfig, contextUser);
      // return this.convertActionsToToolDefinitions(actions, contextUser);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogError(`AudioSageAgent: Failed to load tool definitions - ${errorMessage}`);
      return [];
    }
  }

  /**
   * Convert MJ Action to Eleven Labs tool definition format.
   */
  private async convertActionToToolDefinition(
    action: ActionEntityExtended,
    contextUser: UserInfo
  ): Promise<ToolDefinition> {
    // Load action parameters
    const rv = new RunView();
    const paramsResult = await rv.RunView<ActionParamEntity>({
      EntityName: 'Action Params',
      ExtraFilter: `ActionID='${action.ID}'`,
      OrderBy: 'Name',
      ResultType: 'entity_object'
    }, contextUser);

    const params = paramsResult.Success ? (paramsResult.Results || []) : [];

    // Build JSON Schema for parameters
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const param of params) {
      properties[param.Name] = {
        type: this.mapMJTypeToJsonSchema(param.Type),
        description: param.Description || param.Name
      };

      // Add to required array if parameter is not optional
      // Note: ActionParam doesn't have an IsRequired field in current schema
      // This will need to be enhanced based on actual schema
    }

    return {
      type: 'function',
      function: {
        name: action.Name,
        description: action.Description || `Execute ${action.Name} action`,
        parameters: {
          type: 'object',
          properties,
          required
        }
      }
    };
  }

  /**
   * Map MJ parameter type to JSON Schema type.
   */
  private mapMJTypeToJsonSchema(mjType: string): string {
    const typeMap: Record<string, string> = {
      'String': 'string',
      'Int': 'integer',
      'Float': 'number',
      'Boolean': 'boolean',
      'JSON': 'object',
      'Date': 'string'
    };
    return typeMap[mjType] || 'string';
  }

  /**
   * Execute tool call from Eleven Labs agent.
   * Uses BaseAgent's action execution infrastructure.
   */
  private async executeToolCall(
    sessionId: string,
    toolName: string,
    parameters: Record<string, unknown>,
    callbacks: ConversationCallbacks,
    contextUser: UserInfo
  ): Promise<string> {
    try {
      LogStatus(`AudioSageAgent [${sessionId}]: Executing tool ${toolName}`);

      // Notify callback about tool call
      await callbacks.onToolCall(toolName, parameters);

      // Load action by name
      const md = new Metadata();
      const action = await md.GetEntityObject<ActionEntityExtended>('Actions', contextUser);
      await action.Load(`Name='${toolName.replace(/'/g, "''")}'`);

      if (!action.ID) {
        throw new Error(`Action not found: ${toolName}`);
      }

      // Execute action using BaseAgent's infrastructure
      // Note: This is a simplified implementation - full integration with BaseAgent
      // action execution will require more context (ExecuteAgentParams, etc.)
      const result = {
        success: false,
        message: 'Action execution not yet fully implemented in real-time mode'
      };

      LogStatus(`AudioSageAgent [${sessionId}]: Tool ${toolName} execution completed`);

      // Return result to Eleven Labs agent as JSON string
      return JSON.stringify(result);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogError(`AudioSageAgent [${sessionId}]: Tool execution failed - ${errorMessage}`);

      // Return error to agent so it can inform the user
      return JSON.stringify({
        success: false,
        error: errorMessage
      });
    }
  }
}
