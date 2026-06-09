/**
 * @fileoverview AI Agent Session lifecycle substrate (server-side, record + janitor layer).
 *
 * Exposes the session-record lifecycle manager, the orphan-reconciliation janitor, and the
 * per-process host identity helpers. The audio/media (WebRTC) transport and the long-lived
 * realtime agent run are deliberately **not** part of this layer — they arrive in P5.
 *
 * @module @memberjunction/server
 */
export * from './HostInstance.js';
export * from './SessionManager.js';
export * from './SessionJanitor.js';
