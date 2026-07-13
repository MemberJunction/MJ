// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the conversations component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { LiveKitAgentStateComponent } from '../lib/components/livekit-agent-state.component';
import { LiveKitConnectionOverlayComponent } from '../lib/components/livekit-connection-overlay.component';
import { LiveKitControlBarComponent } from '../lib/components/livekit-control-bar.component';

/**
 * Class-level tests (no TestBed) for components with no Angular DI — their pure getters and emission
 * contracts. DOM-render tests for the DI/template-heavy components are tracked under the Angular
 * DOM-testing rollout (plans/testing/angular-dom-testing-rollout.md).
 */

describe('LiveKitAgentStateComponent', () => {
  it('maps each state to a human label', () => {
    const c = new LiveKitAgentStateComponent();
    c.State = 'listening';
    expect(c.labelText).toBe('listening');
    c.State = 'thinking';
    expect(c.labelText).toBe('thinking…');
    c.State = 'speaking';
    expect(c.labelText).toBe('speaking');
    c.State = 'idle';
    expect(c.labelText).toBe('idle');
  });
});

describe('LiveKitConnectionOverlayComponent', () => {
  it('titles the disconnected state by reason', () => {
    const c = new LiveKitConnectionOverlayComponent();
    c.DisconnectReason = 'participant-removed';
    expect(c.disconnectTitle).toMatch(/removed/i);
    c.DisconnectReason = 'room-deleted';
    expect(c.disconnectTitle).toMatch(/ended/i);
    c.DisconnectReason = 'client-initiated';
    expect(c.disconnectTitle).toMatch(/left/i);
  });
});

describe('LiveKitControlBarComponent', () => {
  it('emits intent events from its handlers', () => {
    const c = new LiveKitControlBarComponent();
    const mic = vi.fn();
    const leave = vi.fn();
    const whiteboard = vi.fn();
    c.ToggleMicrophone.subscribe(mic);
    c.Leave.subscribe(leave);
    c.ToggleWhiteboard.subscribe(whiteboard);
    c.ToggleMicrophone.emit();
    c.Leave.emit();
    c.ToggleWhiteboard.emit();
    expect(mic).toHaveBeenCalledOnce();
    expect(leave).toHaveBeenCalledOnce();
    expect(whiteboard).toHaveBeenCalledOnce();
  });
});
