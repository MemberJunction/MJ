import { Injectable } from '@angular/core';
import { Observable, Subject, BehaviorSubject } from 'rxjs';

/**
 * Event types emitted during a voice conversation stream
 */
export type VoiceStreamEventType =
  | 'ready'
  | 'audio_chunk'
  | 'transcript'
  | 'agent_response'
  | 'tool_call'
  | 'error'
  | 'complete';

/**
 * Event emitted during a voice conversation stream
 */
export interface VoiceStreamEvent {
  type: VoiceStreamEventType;
  data: Record<string, unknown>;
  timestamp: number;
}

/**
 * Session status values
 */
export type SessionStatus = 'connecting' | 'active' | 'ended' | 'error';

/**
 * Information about the current conversation session
 */
export interface ConversationSessionInfo {
  sessionId: string;
  conversationDetailId: string;
  status: SessionStatus;
}

/**
 * Message structure for WebSocket communication
 */
interface WebSocketMessage {
  type: string;
  data?: string;
  text?: string;
  timestamp?: number;
}

/**
 * Service for managing real-time voice conversations via WebSocket.
 * Handles bidirectional audio streaming, session lifecycle, and event management.
 *
 * Key features:
 * - WebSocket connection management
 * - Observable event stream for conversation events
 * - Audio data conversion to/from base64
 * - Session lifecycle management
 * - Proper cleanup on disconnect
 */
@Injectable({
  providedIn: 'root'
})
export class VoiceConversationService {
  private ws?: WebSocket;
  private events$ = new Subject<VoiceStreamEvent>();
  private sessionInfo$ = new BehaviorSubject<ConversationSessionInfo | null>(null);

  constructor() {}

  /**
   * Start a real-time voice conversation session.
   *
   * @param conversationDetailId - ID of the conversation detail to stream
   * @param authToken - Optional authentication token (Bearer token). If not provided, connection may fail.
   * @returns Observable stream of conversation events
   * @throws Error if a session is already active
   */
  startSession(conversationDetailId: string, authToken?: string): Observable<VoiceStreamEvent> {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      throw new Error('Session already active');
    }

    // Update session status to connecting
    this.sessionInfo$.next({
      sessionId: '',
      conversationDetailId,
      status: 'connecting'
    });

    // Construct WebSocket URL
    // For PoC: Connect to MJServer backend (port 4001 based on your .env GRAPHQL_PORT setting)
    // TODO: Make this configurable via environment or injected config service
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const backendHost = 'localhost:4001'; // MJServer port (check GRAPHQL_PORT in .env)

    // Add auth token as query parameter if provided (WebSocket doesn't support custom headers)
    let wsUrl = `${protocol}//${backendHost}/voice-conversation?conversationDetailId=${conversationDetailId}`;
    if (authToken) {
      wsUrl += `&token=${encodeURIComponent(authToken)}`;
    }

    // Create WebSocket connection
    this.ws = new WebSocket(wsUrl);

    // Set up event handlers
    this.ws.onopen = () => {
      console.log('Voice conversation WebSocket connected');
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event);
    };

    this.ws.onerror = (error: Event) => {
      this.handleError(error);
    };

    this.ws.onclose = () => {
      this.handleClose();
    };

    return this.events$.asObservable();
  }

  /**
   * Send audio chunk to the server.
   * Converts ArrayBuffer to base64 for transmission.
   *
   * @param audioData - Raw audio data as ArrayBuffer
   * @throws Error if no active WebSocket connection
   */
  sendAudio(audioData: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('No active WebSocket connection');
    }

    // Convert ArrayBuffer to base64
    const base64 = this.arrayBufferToBase64(audioData);

    // Send as JSON message
    const message: WebSocketMessage = {
      type: 'audio',
      data: base64
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send text message to the conversation.
   *
   * @param text - Text message to send
   * @throws Error if no active WebSocket connection
   */
  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('No active WebSocket connection');
    }

    const message: WebSocketMessage = {
      type: 'text',
      text: text
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Interrupt the agent's current response.
   * Sends interrupt signal to server if connection is active.
   */
  interrupt(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: WebSocketMessage = {
      type: 'interrupt'
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * End the conversation session.
   * Sends end signal and closes WebSocket connection.
   */
  endSession(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        type: 'end'
      };

      this.ws.send(JSON.stringify(message));
      this.ws.close();
    }
    this.ws = undefined;
  }

  /**
   * Get current session info as observable.
   *
   * @returns Observable of current session information
   */
  getSessionInfo(): Observable<ConversationSessionInfo | null> {
    return this.sessionInfo$.asObservable();
  }

  /**
   * Handle incoming WebSocket message.
   * Routes message to appropriate handler based on type.
   *
   * @param event - WebSocket message event
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as VoiceStreamEvent;

      // Handle ready event specially - update session info
      if (message.type === 'ready') {
        const currentInfo = this.sessionInfo$.value;
        if (currentInfo) {
          this.sessionInfo$.next({
            sessionId: (message.data.sessionId as string) || '',
            conversationDetailId: currentInfo.conversationDetailId,
            status: 'active'
          });
        }
      }

      // Emit event to observers
      this.events$.next(message);

    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
      this.emitErrorEvent('Failed to parse server message');
    }
  }

  /**
   * Handle WebSocket error.
   * Updates session status and emits error event.
   *
   * @param error - WebSocket error event
   */
  private handleError(error: Event): void {
    console.error('Voice conversation WebSocket error:', error);

    const currentInfo = this.sessionInfo$.value;
    if (currentInfo) {
      this.sessionInfo$.next({
        ...currentInfo,
        status: 'error'
      });
    }

    this.emitErrorEvent('WebSocket connection error');
  }

  /**
   * Handle WebSocket close.
   * Updates session status and completes event stream.
   */
  private handleClose(): void {
    console.log('Voice conversation WebSocket closed');

    const currentInfo = this.sessionInfo$.value;
    if (currentInfo) {
      this.sessionInfo$.next({
        ...currentInfo,
        status: 'ended'
      });
    }

    this.events$.complete();
    this.ws = undefined;
  }

  /**
   * Emit an error event to observers.
   *
   * @param message - Error message to emit
   */
  private emitErrorEvent(message: string): void {
    const errorEvent: VoiceStreamEvent = {
      type: 'error',
      data: { message },
      timestamp: Date.now()
    };
    this.events$.next(errorEvent);
  }

  /**
   * Convert ArrayBuffer to base64 string.
   *
   * @param buffer - ArrayBuffer to convert
   * @returns Base64 encoded string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;

    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary);
  }
}
