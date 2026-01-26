# ElevenLabs Conversational AI PoC

A minimal proof-of-concept demonstrating real-time voice conversation with ElevenLabs Conversational AI.

## Architecture

```
┌──────────────────────┐
│  Angular Frontend    │  Modern UI with Material Design
│  (Port 4200)         │  - Microphone capture
│                      │  - Audio playback
│                      │  - Transcript display
└──────────┬───────────┘
           │
      WebSocket
           │
┌──────────┴───────────┐
│  Node.js Backend     │  Express + WebSocket server
│  (Port 3000)         │  - Session management
│                      │  - ElevenLabs SDK wrapper
└──────────┬───────────┘
           │
   WebRTC/WebSocket
           │
┌──────────┴───────────┐
│  ElevenLabs API      │  Conversational AI platform
│                      │  - Real-time STT
│                      │  - LLM processing
│                      │  - Real-time TTS
└──────────────────────┘
```

## Features

- ✅ Real-time bidirectional audio streaming
- ✅ WebSocket-based communication
- ✅ Live transcription display
- ✅ Agent response visualization
- ✅ Interrupt capability
- ✅ Material Design UI
- ✅ TypeScript throughout

## Prerequisites

- Node.js 18+
- npm or yarn
- ElevenLabs account with API key
- ElevenLabs Conversational AI agent created

## Setup

### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env and add your credentials:
# ELEVENLABS_API_KEY=your_api_key_here
# ELEVENLABS_AGENT_ID=agent_8501kfsjva8xezmr0zj4sjm57a3x
# PORT=3000

# Start development server
npm run dev
```

The backend will start on `http://localhost:3000`

### 2. Frontend Setup

```bash
cd frontend/audio-chat

# Install dependencies
npm install

# Start development server
npm start
```

The frontend will start on `http://localhost:4200`

## Usage

1. Open your browser to `http://localhost:4200`
2. Click "Start Conversation" button
3. Allow microphone access when prompted
4. Speak naturally - the agent will respond in real-time
5. Click "Interrupt" to stop the agent mid-response
6. Click "End Conversation" when done

## Project Structure

```
elevenlabs-audio-poc/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express server + WebSocket
│   │   ├── elevenlabs-service.ts # ElevenLabs SDK wrapper
│   │   └── types.ts              # Shared TypeScript types
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   └── audio-chat/
│       ├── src/
│       │   ├── app/
│       │   │   ├── conversation/    # Main component
│       │   │   └── services/        # WebSocket & Audio services
│       │   ├── index.html
│       │   └── styles.scss
│       └── package.json
└── README.md
```

## Tech Stack

**Backend:**
- Express.js - HTTP server
- ws - WebSocket server
- @elevenlabs/client - ElevenLabs SDK
- TypeScript

**Frontend:**
- Angular 17 (standalone components)
- Angular Material - UI components
- RxJS - Reactive state management
- Web Audio API - Audio playback
- MediaRecorder API - Audio capture

## Development

### Backend Development

```bash
cd backend
npm run dev  # Auto-restart on changes
```

### Frontend Development

```bash
cd frontend/audio-chat
npm start    # Live reload
```

### Building for Production

**Backend:**
```bash
cd backend
npm run build
npm start
```

**Frontend:**
```bash
cd frontend/audio-chat
npm run build
# Output in dist/ folder
```

## Troubleshooting

### Microphone Access Denied
- Check browser permissions
- Ensure you're using HTTPS (or localhost)
- Try different browser

### WebSocket Connection Failed
- Verify backend is running on port 3000
- Check firewall settings
- Verify WebSocket URL in conversation.component.ts

### No Audio Playback
- Check browser audio permissions
- Verify speakers/headphones are working
- Check browser console for errors

### ElevenLabs API Errors
- Verify API key in .env file
- Ensure agent ID is correct
- Check ElevenLabs account status

## Next Steps

Once this PoC is working, you can:

1. **Add Authentication** - Secure the WebSocket connection
2. **Integrate with MJ** - Connect to MemberJunction Actions
3. **Add Tool Calling** - Execute MJ Actions during conversation
4. **Enhance UI** - Add more visual feedback and controls
5. **Deploy** - Move to production environment

## License

MIT
