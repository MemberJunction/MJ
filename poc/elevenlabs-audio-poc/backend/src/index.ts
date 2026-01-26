/**
 * ElevenLabs PoC Backend Server
 * Express + WebSocket server for conversational AI
 */

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { ElevenLabsService } from './elevenlabs-service';
import { ConversationSession, WebSocketMessage, ConversationEvent } from './types';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
  console.error('Missing required environment variables');
  process.exit(1);
}

// Initialize services
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/conversation' });
const elevenLabsService = new ElevenLabsService(ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID);

// Middleware
app.use(cors());
app.use(express.json());

// Active sessions
const activeSessions = new Map<string, ConversationSession>();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeSessions: activeSessions.size,
    timestamp: new Date().toISOString()
  });
});

// WebSocket connection handler
wss.on('connection', (ws: WebSocket) => {
  const sessionId = uuidv4();
  console.log(`[Server] New WebSocket connection: ${sessionId}`);

  const session: ConversationSession = {
    sessionId,
    userId: 'poc-user', // Hardcoded for PoC
    startedAt: new Date(),
    isActive: true
  };

  activeSessions.set(sessionId, session);

  // Send ready event
  const readyEvent: ConversationEvent = {
    type: 'ready',
    data: { sessionId },
    timestamp: Date.now()
  };
  ws.send(JSON.stringify(readyEvent));

  // Handle incoming messages
  ws.on('message', async (data: Buffer) => {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'start':
          // Start ElevenLabs conversation
          await elevenLabsService.startConversation(sessionId, {
            onAudioChunk: (audioBuffer: Buffer) => {
              const event: ConversationEvent = {
                type: 'audio_chunk',
                data: audioBuffer.toString('base64'),
                timestamp: Date.now()
              };
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(event));
              }
            },
            onUserTranscript: (text: string) => {
              const event: ConversationEvent = {
                type: 'transcript',
                data: { text },
                timestamp: Date.now()
              };
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(event));
              }
            },
            onAgentResponse: (text: string) => {
              const event: ConversationEvent = {
                type: 'agent_response',
                data: { text },
                timestamp: Date.now()
              };
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(event));
              }
            },
            onError: (error: Error) => {
              const event: ConversationEvent = {
                type: 'error',
                data: { message: error.message },
                timestamp: Date.now()
              };
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(event));
              }
            },
            onEnded: () => {
              const event: ConversationEvent = {
                type: 'ended',
                data: {},
                timestamp: Date.now()
              };
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(event));
              }
              session.isActive = false;
            }
          });
          break;

        case 'audio':
          // Forward audio to ElevenLabs
          if (message.data) {
            const audioBuffer = Buffer.from(message.data, 'base64');
            await elevenLabsService.sendAudio(sessionId, audioBuffer);
          }
          break;

        case 'text':
          // Handle text input if needed
          console.log(`[Server] Text message: ${message.data}`);
          break;

        case 'interrupt':
          // Interrupt agent
          await elevenLabsService.interruptAgent(sessionId);
          break;

        case 'end':
          // End conversation
          await elevenLabsService.endConversation(sessionId);
          session.isActive = false;
          break;

        default:
          console.warn(`[Server] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[Server] Error handling message:', error);
      const errorEvent: ConversationEvent = {
        type: 'error',
        data: { message: error instanceof Error ? error.message : 'Unknown error' },
        timestamp: Date.now()
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(errorEvent));
      }
    }
  });

  // Handle disconnection
  ws.on('close', async () => {
    console.log(`[Server] WebSocket closed: ${sessionId}`);
    try {
      await elevenLabsService.endConversation(sessionId);
    } catch (error) {
      console.error('[Server] Error ending conversation:', error);
    }
    activeSessions.delete(sessionId);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error(`[Server] WebSocket error for ${sessionId}:`, error);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}/conversation`);
  console.log(`[Server] Health check: http://localhost:${PORT}/health`);
});
