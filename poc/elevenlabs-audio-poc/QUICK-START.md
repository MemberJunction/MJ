# Quick Start Guide - ElevenLabs Voice Assistant PoC

## ✅ What's Ready

Your simplified PoC is ready to run! The architecture uses the ElevenLabs SDK **directly in the browser** - no backend needed.

## 🚀 Start the Application

### Option 1: Just Run It (Recommended)

```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/poc/elevenlabs-audio-poc/frontend/audio-chat
npm start
```

Then open your browser to: **http://localhost:4200**

That's it! The backend is not needed for this simplified version.

### Option 2: Use the Backend (Optional)

If you later want to add authentication or integrate with MJ, you can use the backend:

```bash
# Terminal 1 - Backend
cd /Users/jordanfanapour/Documents/GitHub/MJ/poc/elevenlabs-audio-poc/backend
npm run dev

# Terminal 2 - Frontend
cd /Users/jordanfanapour/Documents/GitHub/MJ/poc/elevenlabs-audio-poc/frontend/audio-chat
npm start
```

## 🎤 Using the Voice Assistant

1. **Open the app**: Navigate to http://localhost:4200
2. **Allow microphone access**: Browser will prompt you
3. **Click "Start Conversation"**: The ElevenLabs agent will connect
4. **Start speaking**: The agent will respond in real-time
5. **See transcripts**: Both your speech and agent responses appear on screen
6. **End when done**: Click "End Conversation"

## 🔧 Configuration

The agent ID is hardcoded in the component:
- File: `frontend/audio-chat/src/app/conversation/conversation.component.ts`
- Agent ID: `agent_8501kfsjva8xezmr0zj4sjm57a3x`

To change the agent or update the prompt:
1. Edit `frontend/audio-chat/src/app/services/elevenlabs.service.ts`
2. Modify the `overrides.agent.prompt.prompt` in the `startConversation()` method

## 📋 Architecture (Simplified)

```
┌──────────────────────────────────┐
│   Angular App (Port 4200)        │
│                                   │
│   - ElevenLabs SDK (@elevenlabs/client)
│   - Material Design UI           │
│   - Audio capture & playback     │
│   - Transcript display            │
└────────────┬─────────────────────┘
             │
      Direct WebRTC/WebSocket
             │
┌────────────┴─────────────────────┐
│   ElevenLabs API                 │
│   - Real-time STT                │
│   - LLM processing               │
│   - Real-time TTS                │
└──────────────────────────────────┘
```

## 🐛 Troubleshooting

### "Cannot find module @elevenlabs/client"
```bash
cd frontend/audio-chat
npm install
```

### "Microphone permission denied"
- Check browser settings
- Ensure you're on localhost or HTTPS
- Try a different browser (Chrome works best)

### "Connection failed"
- Check that your agent ID is correct
- Verify your ElevenLabs account is active
- Check browser console for specific errors

### No audio playback
- Verify speakers/headphones are working
- Check browser audio permissions
- Look for errors in browser console

## 🎯 What's Different from the Original Plan

**Original Plan**: Angular → WebSocket → Node.js Backend → ElevenLabs API

**Current (Simplified)**: Angular → ElevenLabs API (direct)

**Why the change?**
- The `@elevenlabs/client` SDK is designed for browser use only
- Simpler architecture = faster PoC
- No need for backend authentication (using public agent)
- Lower latency (direct connection)

## 🔄 Next Steps for Integration with MJ

When you're ready to integrate with MemberJunction:

1. **Add Backend Authentication**:
   - Use Node backend to generate signed URLs
   - Keep API key server-side
   - Angular gets signed URL from your backend

2. **Add MJ Actions**:
   - Configure agent tools in ElevenLabs dashboard
   - Implement tool handlers that call MJ Actions
   - Return results back to conversation

3. **Enhance UI**:
   - Add conversation history from MJ database
   - Display tool execution status
   - Show action results in transcript

4. **Deploy**:
   - Host Angular app
   - Deploy backend API
   - Configure production agent

## 📝 Files Overview

**Key Files**:
- `frontend/audio-chat/src/app/services/elevenlabs.service.ts` - ElevenLabs SDK wrapper
- `frontend/audio-chat/src/app/conversation/conversation.component.ts` - Main UI component
- `frontend/audio-chat/src/app/conversation/conversation.component.html` - UI template
- `frontend/audio-chat/src/app/conversation/conversation.component.scss` - Styling

**Not Needed (Yet)**:
- `backend/*` - Only needed if you want authentication
- `frontend/audio-chat/src/app/services/websocket.service.ts` - Old WebSocket approach (can be deleted)
- `frontend/audio-chat/src/app/services/audio.service.ts` - Old audio handling (can be deleted)

## 🎉 You're Ready!

Just run:
```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/poc/elevenlabs-audio-poc/frontend/audio-chat
npm start
```

Then open http://localhost:4200 and start talking!
