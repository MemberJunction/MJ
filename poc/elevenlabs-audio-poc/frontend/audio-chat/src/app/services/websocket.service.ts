import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export interface ConversationEvent {
  type: 'ready' | 'audio_chunk' | 'transcript' | 'agent_response' | 'error' | 'ended';
  data: unknown;
  timestamp: number;
}

export interface WebSocketMessage {
  type: 'audio' | 'text' | 'start' | 'end' | 'interrupt';
  data?: string;
  sessionId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private ws: WebSocket | null = null;
  private events$ = new Subject<ConversationEvent>();
  private sessionId: string | null = null;

  connect(url: string): Observable<ConversationEvent> {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      throw new Error('WebSocket already connected');
    }

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[WebSocket] Connected');
    };

    this.ws.onmessage = (event) => {
      const message: ConversationEvent = JSON.parse(event.data);

      if (message.type === 'ready') {
        this.sessionId = (message.data as {sessionId: string}).sessionId;
        console.log('[WebSocket] Session ready:', this.sessionId);
      }

      this.events$.next(message);
    };

    this.ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
      this.events$.next({
        type: 'error',
        data: { message: 'WebSocket connection error' },
        timestamp: Date.now()
      });
    };

    this.ws.onclose = () => {
      console.log('[WebSocket] Closed');
      this.events$.complete();
      this.ws = null;
      this.sessionId = null;
    };

    return this.events$.asObservable();
  }

  send(message: WebSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    this.ws.send(JSON.stringify(message));
  }

  disconnect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'end' });
      this.ws.close();
    }
    this.ws = null;
    this.sessionId = null;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
