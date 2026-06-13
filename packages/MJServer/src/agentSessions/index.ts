/**
 * @fileoverview AI Agent Session lifecycle substrate (server-side, record + janitor layer).
 *
 * Exposes the session-record lifecycle manager, the orphan-reconciliation janitor, and the
 * per-process host identity helpers. The audio/media (WebRTC) transport and the long-lived
 * realtime agent run are deliberately **not** part of this layer — they arrive in P5.
 *
 * @module @memberjunction/server
 */
import { LoadWhiteboardChannelServer, LoadMeetingControlsChannelServer } from '@memberjunction/ai-agents';

// Tree-shaking prevention: force the server-side channel plugin registrations
// (`@RegisterClass(BaseRealtimeChannelServer, ...)`) to execute on any static path that touches
// the session lifecycle — `SessionManager.CreateSession` resolves them via the ClassFactory.
LoadWhiteboardChannelServer();
LoadMeetingControlsChannelServer();

export * from './HostInstance.js';
export * from './SessionManager.js';
export * from './SessionJanitor.js';
