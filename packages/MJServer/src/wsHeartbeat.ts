/**
 * @fileoverview Server-side WebSocket heartbeat that survives an event-loop stall (MJ #5510).
 *
 * Replaces graphql-ws's built-in keepalive, which arms `setTimeout(() => socket.terminate(), keepAlive)`
 * after every ping. When MJAPI's event loop stalls past that deadline (a long synchronous agent step,
 * GC under heap pressure), the client's pong is already in the kernel buffer — but Node runs expired
 * timers BEFORE the poll phase that reads it, so the socket is terminated for a pong it received. A
 * busy server then drops every healthy client at once, and each one shows a connectivity banner.
 *
 * Here the "no pong" verdict is deferred by one `setImmediate`. That runs in the check phase, AFTER
 * the poll phase of the same loop turn has read whatever arrived during the stall, so a pong that was
 * waiting is processed first and the socket lives. A socket that genuinely never answers is still
 * terminated one interval after the ping, exactly as before.
 *
 * @module MJServer/wsHeartbeat
 */

import type { WebSocket, WebSocketServer } from 'ws';

/** Options for {@link AttachWebSocketHeartbeat}. */
export interface WebSocketHeartbeatOptions {
  /** How often each socket is pinged; a ping unanswered by the next tick terminates the socket. */
  IntervalMs: number;
}

/**
 * Ping every socket `server` accepts, every `IntervalMs`, and terminate one that has not answered the
 * previous ping. Returns a function that stops the heartbeat for all sockets.
 *
 * Pass `0` as graphql-ws `useServer`'s keepalive argument when using this, or both will ping.
 */
export function AttachWebSocketHeartbeat(server: WebSocketServer, options: WebSocketHeartbeatOptions): () => void {
  const stops = new Set<() => void>();
  const onConnection = (socket: WebSocket) => {
    const stop = startHeartbeat(socket, options.IntervalMs);
    stops.add(stop);
    socket.once('close', () => {
      stop();
      stops.delete(stop);
    });
  };
  server.on('connection', onConnection);
  return () => {
    server.off('connection', onConnection);
    stops.forEach((stop) => stop());
    stops.clear();
  };
}

/** One socket's heartbeat. Returns its stop function. */
function startHeartbeat(socket: WebSocket, intervalMs: number): () => void {
  let awaitingPong = false;
  let verdict: ReturnType<typeof setImmediate> | null = null;
  const onPong = () => {
    awaitingPong = false;
  };
  socket.on('pong', onPong);

  const timer = setInterval(() => {
    if (socket.readyState !== socket.OPEN) {
      return;
    }
    if (!awaitingPong) {
      awaitingPong = true;
      socket.ping();
      return;
    }
    // The last ping looks unanswered — but if the loop was stalled, its pong may be waiting in a
    // buffer this turn has not read yet. Decide after the poll phase, not before it.
    verdict = setImmediate(() => {
      verdict = null;
      if (awaitingPong && socket.readyState === socket.OPEN) {
        socket.terminate();
      } else if (socket.readyState === socket.OPEN) {
        awaitingPong = true;
        socket.ping();
      }
    });
  }, intervalMs);

  return () => {
    clearInterval(timer);
    if (verdict) {
      clearImmediate(verdict);
      verdict = null;
    }
    socket.off('pong', onPong);
  };
}
