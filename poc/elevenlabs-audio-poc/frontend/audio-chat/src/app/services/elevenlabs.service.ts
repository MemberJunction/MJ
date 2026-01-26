import { Injectable } from '@angular/core';
import { Conversation } from '@elevenlabs/client';
import { Subject } from 'rxjs';

export interface ConversationMessage {
  type: 'user' | 'agent';
  text: string;
  timestamp: Date;
}

export interface ConversationStatus {
  isConnected: boolean;
  isAgentSpeaking: boolean;
  statusText: string;
}

@Injectable({
  providedIn: 'root'
})
export class ElevenLabsService {
  private conversation: Conversation | null = null;

  // Observables for UI updates
  public messages$ = new Subject<ConversationMessage>();
  public status$ = new Subject<ConversationStatus>();

  private currentStatus: ConversationStatus = {
    isConnected: false,
    isAgentSpeaking: false,
    statusText: 'Click Start to begin conversation'
  };

  async startConversation(agentId: string): Promise<void> {
    try {
      this.updateStatus({ statusText: 'Connecting to ElevenLabs...' });

      this.conversation = await Conversation.startSession({
        agentId: agentId,
        connectionType: 'websocket',
        // Note: Prompt overrides disabled in agent config - using dashboard prompt
        onConnect: (props: { conversationId: string }) => {
          console.log('[ElevenLabs] Connected - Conversation ID:', props.conversationId);
          this.updateStatus({
            isConnected: true,
            statusText: 'Connected - Start speaking!'
          });
        },
        onDisconnect: (details: any) => {
          console.log('[ElevenLabs] Disconnected:', details);
          console.error('[ElevenLabs] Disconnect reason:', details.reason);
          if (details.message) {
            console.error('[ElevenLabs] Disconnect message:', details.message);
          }
          this.updateStatus({
            isConnected: false,
            isAgentSpeaking: false,
            statusText: `Disconnected: ${details.reason}${details.message ? ` - ${details.message}` : ''}`
          });
        },
        onError: (message: string) => {
          console.error('[ElevenLabs] Error:', message);
          this.updateStatus({
            statusText: `Error: ${message}`
          });
        },
        onMessage: (props: { message: string; role: 'user' | 'agent' }) => {
          console.log(`[ElevenLabs] ${props.role === 'user' ? 'User' : 'Agent'} said:`, props.message);

          this.messages$.next({
            type: props.role,
            text: props.message,
            timestamp: new Date()
          });

          const statusPrefix = props.role === 'user' ? 'You' : 'Agent';
          this.updateStatus({
            statusText: `${statusPrefix}: ${props.message}`,
            ...(props.role === 'agent' && { isAgentSpeaking: true })
          });
        },
        onModeChange: ({ mode }: { mode: string }) => {
          console.log('[ElevenLabs] Mode changed to:', mode);
          const isAgentSpeaking = mode === 'speaking';
          this.updateStatus({
            isAgentSpeaking: isAgentSpeaking
          });
        }
      });

      console.log('[ElevenLabs] Session started successfully');
    } catch (error) {
      console.error('[ElevenLabs] Failed to start session:', error);
      this.updateStatus({
        statusText: error instanceof Error ? `Failed to connect: ${error.message}` : 'Failed to connect'
      });
      throw error;
    }
  }

  endConversation(): void {
    if (this.conversation) {
      this.conversation.endSession();
      this.conversation = null;
      this.updateStatus({
        isConnected: false,
        isAgentSpeaking: false,
        statusText: 'Conversation ended'
      });
    }
  }

  setMicrophoneMuted(muted: boolean): void {
    if (this.conversation) {
      this.conversation.setMicMuted(muted);
    }
  }

  getInputVolume(): number {
    return this.conversation?.getInputVolume() ?? 0;
  }

  getOutputVolume(): number {
    return this.conversation?.getOutputVolume() ?? 0;
  }

  isConnected(): boolean {
    return this.conversation?.isOpen() ?? false;
  }

  private updateStatus(updates: Partial<ConversationStatus>): void {
    this.currentStatus = {
      ...this.currentStatus,
      ...updates
    };
    this.status$.next(this.currentStatus);
  }
}
