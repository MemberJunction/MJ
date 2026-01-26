/**
 * Shared types for ElevenLabs PoC
 */

export interface ConversationSession {
  sessionId: string;
  userId: string;
  startedAt: Date;
  isActive: boolean;
}

export interface WebSocketMessage {
  type: 'audio' | 'text' | 'start' | 'end' | 'interrupt';
  data?: string; // base64 audio or text content
  sessionId?: string;
}

export interface ConversationEvent {
  type: 'ready' | 'audio_chunk' | 'transcript' | 'agent_response' | 'error' | 'ended';
  data: unknown;
  timestamp: number;
}
