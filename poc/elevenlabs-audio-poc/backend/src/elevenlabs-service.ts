/**
 * ElevenLabs Conversational AI Service
 * Wraps the ElevenLabs SDK for easy integration
 */

import { Conversation } from '@elevenlabs/client';
import { ConversationEvent } from './types';

export interface ConversationCallbacks {
  onAudioChunk: (audioBuffer: Buffer) => void;
  onUserTranscript: (text: string) => void;
  onAgentResponse: (text: string) => void;
  onError: (error: Error) => void;
  onEnded: () => void;
}

export class ElevenLabsService {
  private apiKey: string;
  private agentId: string;
  private activeConversations = new Map<string, Conversation>();

  constructor(apiKey: string, agentId: string) {
    this.apiKey = apiKey;
    this.agentId = agentId;
  }

  async startConversation(
    sessionId: string,
    callbacks: ConversationCallbacks
  ): Promise<void> {
    try {
      console.log(`[ElevenLabs] Starting conversation ${sessionId}`);

      const conversation = await Conversation.startSession({
        agentId: this.agentId,
        apiKey: this.apiKey,
        overrides: {
          agent: {
            prompt: {
              prompt: `You are a friendly AI assistant having a casual conversation with a user.
Be helpful, engaging, and conversational. Keep responses concise and natural.`
            }
          }
        },
        callbacks: {
          onConnect: () => {
            console.log(`[ElevenLabs] Connected: ${sessionId}`);
          },
          onDisconnect: () => {
            console.log(`[ElevenLabs] Disconnected: ${sessionId}`);
            callbacks.onEnded();
          },
          onError: (error: Error) => {
            console.error(`[ElevenLabs] Error in ${sessionId}:`, error);
            callbacks.onError(error);
          },
          onUserTranscript: (transcript: string) => {
            console.log(`[ElevenLabs] User said: "${transcript}"`);
            callbacks.onUserTranscript(transcript);
          },
          onAgentMessage: (message: string) => {
            console.log(`[ElevenLabs] Agent said: "${message}"`);
            callbacks.onAgentResponse(message);
          },
          onAudioResponse: (audioBuffer: Buffer) => {
            console.log(`[ElevenLabs] Audio chunk: ${audioBuffer.length} bytes`);
            callbacks.onAudioChunk(audioBuffer);
          }
        }
      });

      this.activeConversations.set(sessionId, conversation);
      console.log(`[ElevenLabs] Session ${sessionId} started successfully`);
    } catch (error) {
      console.error(`[ElevenLabs] Failed to start session ${sessionId}:`, error);
      throw error;
    }
  }

  async sendAudio(sessionId: string, audioBuffer: Buffer): Promise<void> {
    const conversation = this.activeConversations.get(sessionId);
    if (!conversation) {
      throw new Error(`No active conversation for session: ${sessionId}`);
    }

    // Send audio to ElevenLabs
    await conversation.sendAudioInput(audioBuffer);
  }

  async endConversation(sessionId: string): Promise<void> {
    const conversation = this.activeConversations.get(sessionId);
    if (conversation) {
      await conversation.endSession();
      this.activeConversations.delete(sessionId);
      console.log(`[ElevenLabs] Session ${sessionId} ended`);
    }
  }

  async interruptAgent(sessionId: string): Promise<void> {
    const conversation = this.activeConversations.get(sessionId);
    if (conversation) {
      // Note: Check if interrupt is supported in the SDK
      console.log(`[ElevenLabs] Interrupt requested for ${sessionId}`);
    }
  }
}
