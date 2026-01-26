import { WebSocket, WebSocketServer, RawData } from 'ws';
import { IncomingMessage } from 'http';
import { AudioSageAgent } from '@memberjunction/ai-agent-manager';
import { LogStatus, LogError, Metadata, UserInfo } from '@memberjunction/core';
import { ConversationDetailEntity } from '@memberjunction/core-entities';
import { getUserPayload } from '../context.js';
import { DataSourceInfo, UserPayload } from '../types.js';
import { getSystemUser } from '../auth/index.js';

/**
 * In-memory conversation session.
 * Sessions are ephemeral - no database persistence beyond the initial conversation detail.
 */
export interface ConversationSession {
  id: string;
  conversationId: string;
  conversationDetailId: string;
  userId: string;
  ws: WebSocket;
  agent: AudioSageAgent;
  startedAt: Date;
}

/**
 * WebSocket message types for voice conversation.
 */
export type VoiceMessageType = 'audio' | 'text' | 'interrupt' | 'end';

export interface VoiceMessage {
  type: VoiceMessageType;
  data?: string; // Base64 audio for 'audio' type
  text?: string; // Text for 'text' type
  timestamp?: number;
}

/**
 * WebSocket event types sent to client.
 */
export type VoiceEventType = 'ready' | 'audio_chunk' | 'transcript' | 'agent_response' | 'tool_call' | 'error' | 'complete';

export interface VoiceEvent {
  type: VoiceEventType;
  data: Record<string, unknown>;
  timestamp: number;
}

/**
 * WebSocket handler for real-time voice conversations.
 *
 * ARCHITECTURE:
 * - Manages in-memory conversation sessions (no database persistence)
 * - Establishes WebSocket connections on /voice-conversation path
 * - Routes events to/from AudioSageAgent
 * - Handles cleanup on disconnect
 *
 * SESSION LIFECYCLE:
 * 1. Client connects with conversationDetailId query param
 * 2. Validate conversation detail exists and user has access
 * 3. Create in-memory session with AudioSageAgent
 * 4. Route messages between client and agent
 * 5. Clean up session on disconnect (remove from Map)
 *
 * NOTE: Sessions are ephemeral - they only live in memory during active connection.
 * No session state is persisted to database.
 */
export class VoiceConversationHandler {
  private wss: WebSocketServer;
  private activeSessions = new Map<string, ConversationSession>();
  private dataSources: DataSourceInfo[];

  constructor(dataSources: DataSourceInfo[]) {
    this.dataSources = dataSources;

    // Use noServer mode - upgrade handling will be done in index.ts
    this.wss = new WebSocketServer({
      noServer: true
    });

    this.wss.on('connection', this.handleConnection.bind(this));

    LogStatus('VoiceConversationHandler: WebSocket server initialized on /voice-conversation');
  }

  /**
   * Handle WebSocket upgrade for voice conversation requests.
   * Called from centralized upgrade handler in index.ts.
   */
  public handleUpgradeRequest(request: IncomingMessage, socket: any, head: Buffer): void {
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit('connection', ws, request);
    });
  }

  /**
   * Handle new WebSocket connection.
   */
  private async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    try {
      // Extract conversation detail ID from query params
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const conversationDetailId = url.searchParams.get('conversationDetailId');

      if (!conversationDetailId) {
        ws.close(4000, 'Missing conversationDetailId query parameter');
        return;
      }

      LogStatus(`VoiceConversationHandler: New connection for conversation detail ${conversationDetailId}`);

      // Authenticate user
      // Try Authorization header first, fall back to query param (WebSocket doesn't support custom headers)
      let bearerToken = request.headers.authorization ?? '';

      // If no Authorization header, check query parameter
      if (!bearerToken) {
        const tokenParam = url.searchParams.get('token');
        if (tokenParam) {
          bearerToken = tokenParam.startsWith('Bearer ') ? tokenParam : `Bearer ${tokenParam}`;
        }
      }

      // TODO: For PoC, skip authentication if no token provided
      // In production, authentication should be mandatory
      let userPayload: UserPayload | null = null;

      if (bearerToken) {
        userPayload = await getUserPayload(bearerToken, undefined, this.dataSources);
      }

      // If no token provided, use system user for PoC
      if (!userPayload) {
        LogStatus('VoiceConversationHandler: No auth token - using system user for PoC');
        const systemUserInfo = await getSystemUser();
        userPayload = {
          userRecord: systemUserInfo,
          email: systemUserInfo.Email,
          sessionId: 'poc-session',
          isSystemUser: true
        };
      }

      // Create session
      const session = await this.createSession(conversationDetailId, userPayload, ws);
      this.activeSessions.set(session.id, session);

      LogStatus(`VoiceConversationHandler: Session ${session.id} created for user ${userPayload.email}`);

      // Handle incoming messages (async handler)
      ws.on('message', (data) => {
        this.handleMessage(session, data).catch(error => {
          LogError(`VoiceConversationHandler [${session.id}]: Async message handler error - ${error.message}`);
        });
      });
      ws.on('close', () => this.handleClose(session));
      ws.on('error', (error) => this.handleError(session, error));

      // Send ready event
      this.sendEvent(ws, 'ready', { sessionId: session.id });

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogError(`VoiceConversationHandler: Connection failed - ${errorMessage}`);

      // WebSocket close reason must be <= 123 bytes
      const closeReason = 'Session creation failed';
      ws.close(4001, closeReason);
    }
  }

  /**
   * Create a new in-memory conversation session.
   *
   * VALIDATION:
   * - Load conversation detail to ensure it exists
   * - Verify user has access to the conversation
   * - Initialize AudioSageAgent for this session
   *
   * NOTE: Session is stored in memory only, not in database.
   */
  private async createSession(
    conversationDetailId: string,
    userPayload: UserPayload,
    ws: WebSocket
  ): Promise<ConversationSession> {
    try {
      // Convert userPayload.userRecord to UserInfo
      const user = userPayload.userRecord as UserInfo;

      // Load conversation detail
      const md = new Metadata();
      const conversationDetail = await md.GetEntityObject<ConversationDetailEntity>(
        'Conversation Details',
        user
      );

      if (!conversationDetail) {
        throw new Error('Failed to create conversation detail entity');
      }

      const loaded = await conversationDetail.Load(conversationDetailId);
      if (!loaded) {
        throw new Error(`Conversation detail ${conversationDetailId} not found`);
      }

      // Verify user has access (conversation detail belongs to user's conversation)
      // TODO: Add proper authorization check here
      // For now, we assume if they can load it, they have access

      // Initialize AudioSageAgent
      const agent = new AudioSageAgent();

      // Generate unique session ID
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const session: ConversationSession = {
        id: sessionId,
        conversationId: conversationDetail.ConversationID,
        conversationDetailId: conversationDetailId,
        userId: user.ID,
        ws: ws,
        agent: agent,
        startedAt: new Date()
      };

      // Start Eleven Labs conversation with callbacks
      await this.startElevenLabsConversation(session, user);

      LogStatus(`VoiceConversationHandler: Session created - ${sessionId}`);

      return session;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogError(`VoiceConversationHandler: Failed to create session - ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Start Eleven Labs conversation with event callbacks.
   * This establishes the WebSocket connection to Eleven Labs and wires up event handlers.
   */
  private async startElevenLabsConversation(session: ConversationSession, user: UserInfo): Promise<void> {
    // Define callbacks to bridge Eleven Labs events to WebSocket client
    const callbacks = {
      onUserTranscript: async (text: string) => {
        this.sendEvent(session.ws, 'transcript', { text });
      },
      onAgentResponse: async (text: string) => {
        this.sendEvent(session.ws, 'agent_response', { text });
      },
      onAudioChunk: async (audioBuffer: Buffer) => {
        // Convert audio buffer to base64 for WebSocket transmission
        const base64Audio = audioBuffer.toString('base64');
        this.sendEvent(session.ws, 'audio_chunk', { audio: base64Audio });
      },
      onToolCall: async (toolName: string, params: Record<string, unknown>) => {
        this.sendEvent(session.ws, 'tool_call', { tool: toolName, parameters: params });
        return ''; // Return value handled by AudioSageAgent
      },
      onError: async (error: Error) => {
        this.sendEvent(session.ws, 'error', { message: error.message });
      },
      onComplete: async () => {
        this.sendEvent(session.ws, 'complete', {});
      }
    };

    // TODO: Load actual system prompt from agent configuration
    // For now, use a simple default prompt
    const systemPrompt = `You are Audio Sage, a helpful AI assistant with access to MemberJunction data.
You can answer questions about the system and execute actions to help users accomplish their goals.`;

    // Start the Eleven Labs conversation
    await session.agent.startConversation(session.id, systemPrompt, callbacks, user);
  }

  /**
   * Handle incoming WebSocket message from client.
   *
   * MESSAGE TYPES:
   * - audio: Base64-encoded audio chunk from user
   * - text: Text message from user
   * - interrupt: User interrupted agent
   * - end: End conversation gracefully
   */
  private async handleMessage(session: ConversationSession, data: RawData): Promise<void> {
    try {
      const messageStr = data.toString();
      const message = JSON.parse(messageStr) as VoiceMessage;

      LogStatus(`VoiceConversationHandler [${session.id}]: Received message type: ${message.type}`);

      switch (message.type) {
        case 'audio':
          if (!message.data) {
            throw new Error('Missing audio data');
          }
          // Convert base64 to buffer and forward to agent
          const audioBuffer = Buffer.from(message.data, 'base64');
          await this.handleAudioChunk(session, audioBuffer);
          break;

        case 'text':
          if (!message.text) {
            throw new Error('Missing text');
          }
          await this.handleTextMessage(session, message.text);
          break;

        case 'interrupt':
          await this.handleInterrupt(session);
          break;

        case 'end':
          await this.endSession(session);
          break;

        default:
          LogError(`VoiceConversationHandler [${session.id}]: Unknown message type: ${message.type}`);
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogError(`VoiceConversationHandler [${session.id}]: Message handling failed - ${errorMessage}`);
      this.sendEvent(session.ws, 'error', {
        message: errorMessage
      });
    }
  }

  /**
   * Handle audio chunk from client.
   * Forward to AudioSageAgent for processing.
   */
  private async handleAudioChunk(session: ConversationSession, audioBuffer: Buffer): Promise<void> {
    try {
      LogStatus(`VoiceConversationHandler [${session.id}]: Processing audio chunk (${audioBuffer.length} bytes)`);

      // Forward audio chunk to Eleven Labs via AudioSageAgent
      await session.agent.sendAudioChunk(session.id, audioBuffer);

      LogStatus(`VoiceConversationHandler [${session.id}]: Audio chunk forwarded to agent`);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogError(`VoiceConversationHandler [${session.id}]: Audio processing failed - ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Handle text message from client.
   * Send to AudioSageAgent for processing.
   */
  private async handleTextMessage(session: ConversationSession, text: string): Promise<void> {
    try {
      LogStatus(`VoiceConversationHandler [${session.id}]: Processing text message: "${text}"`);

      // Forward text to Eleven Labs via AudioSageAgent
      await session.agent.sendText(session.id, text);

      LogStatus(`VoiceConversationHandler [${session.id}]: Text message forwarded to agent`);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogError(`VoiceConversationHandler [${session.id}]: Text processing failed - ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Handle interrupt request from client.
   * Signal agent to stop current response.
   */
  private async handleInterrupt(session: ConversationSession): Promise<void> {
    try {
      LogStatus(`VoiceConversationHandler [${session.id}]: User interrupted agent`);

      // Forward interrupt to Eleven Labs via AudioSageAgent
      await session.agent.interrupt(session.id);

      LogStatus(`VoiceConversationHandler [${session.id}]: Interrupt signal sent to agent`);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogError(`VoiceConversationHandler [${session.id}]: Interrupt failed - ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Send event to client.
   */
  private sendEvent(ws: WebSocket, type: VoiceEventType, data: Record<string, unknown>): void {
    if (ws.readyState === WebSocket.OPEN) {
      const event: VoiceEvent = {
        type,
        data,
        timestamp: Date.now()
      };
      ws.send(JSON.stringify(event));
    }
  }

  /**
   * Handle WebSocket close.
   * Clean up session from memory.
   */
  private handleClose(session: ConversationSession): void {
    LogStatus(`VoiceConversationHandler [${session.id}]: Connection closed`);
    this.endSession(session).catch(error => {
      LogError(`VoiceConversationHandler [${session.id}]: Error during close cleanup - ${error.message}`);
    });
    this.activeSessions.delete(session.id);
  }

  /**
   * Handle WebSocket error.
   */
  private handleError(session: ConversationSession, error: Error): void {
    LogError(`VoiceConversationHandler [${session.id}]: WebSocket error - ${error.message}`);
    this.sendEvent(session.ws, 'error', { message: error.message });
  }

  /**
   * End conversation session.
   * Clean up agent resources and remove from active sessions.
   *
   * NOTE: Session is removed from memory only - no database cleanup needed.
   */
  private async endSession(session: ConversationSession): Promise<void> {
    try {
      LogStatus(`VoiceConversationHandler [${session.id}]: Ending session`);

      // End Eleven Labs conversation
      await session.agent.endConversation(session.id);

      // Remove from active sessions
      this.activeSessions.delete(session.id);

      // Close WebSocket if still open
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.close();
      }

      const duration = Date.now() - session.startedAt.getTime();
      LogStatus(`VoiceConversationHandler [${session.id}]: Session ended after ${duration}ms`);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogError(`VoiceConversationHandler [${session.id}]: Session cleanup failed - ${errorMessage}`);
    }
  }

  /**
   * Get count of active sessions.
   * Useful for monitoring and capacity management.
   */
  public getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Get session by ID.
   * Used for debugging and monitoring.
   */
  public getSession(sessionId: string): ConversationSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Get all active session IDs.
   * Used for monitoring and debugging.
   */
  public getActiveSessionIds(): string[] {
    return Array.from(this.activeSessions.keys());
  }
}
