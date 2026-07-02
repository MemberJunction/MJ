import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { LiveKitConnectionOverlayComponent } from './livekit-connection-overlay.component';

/**
 * DOM spec for <mj-livekit-connection-overlay> — a standalone, pure @Input/@Output leaf.
 * Covers the @switch over Status (connecting / reconnecting / error / disconnected /
 * default), the disconnectTitle mapping, the ErrorMessage fallback, and the Retry output
 * from both the error "Try again" and the disconnected "Rejoin" buttons.
 */
describe('LiveKitConnectionOverlayComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown> = {}) => renderComponentFixture(LiveKitConnectionOverlayComponent, { inputs });

  it('shows "Ready to connect" for the idle/default status', () => {
    expect(text(render({ Status: 'idle' }), '.lk-overlay__title')).toContain('Ready to connect');
  });

  it('shows a connecting title', () => {
    expect(text(render({ Status: 'connecting' }), '.lk-overlay__title')).toContain('Connecting');
  });

  it('shows a reconnecting title with a subtitle', () => {
    const f = render({ Status: 'reconnecting' });
    expect(text(f, '.lk-overlay__title')).toContain('Reconnecting');
    expect(text(f, '.lk-overlay__sub')).toContain('connection dropped');
  });

  it('shows the error state with the supplied message and a retry button', () => {
    const f = render({ Status: 'error', ErrorMessage: 'Token expired' });
    expect(text(f, '.lk-overlay__title')).toContain('Connection failed');
    expect(text(f, '.lk-overlay__sub')).toContain('Token expired');
    expect(query(f, '.lk-overlay__btn')).not.toBeNull();
  });

  it('falls back to a generic error message when none is supplied', () => {
    const f = render({ Status: 'error', ErrorMessage: null });
    expect(text(f, '.lk-overlay__sub')).toContain('could not join the room');
  });

  it('emits Retry when the error "Try again" button is clicked', () => {
    const f = render({ Status: 'error' });
    const spy = vi.fn();
    f.componentInstance.Retry.subscribe(spy);
    (query(f, '.lk-overlay__btn') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('titles the disconnected state from the disconnect reason', () => {
    const f = render({ Status: 'disconnected', DisconnectReason: 'connection-lost' });
    expect(text(f, '.lk-overlay__title')).toContain('Connection lost');
  });

  it('offers a Rejoin button in the disconnected state and emits Retry from it', () => {
    const f = render({ Status: 'disconnected', DisconnectReason: 'connection-lost', AllowRetry: true });
    const spy = vi.fn();
    f.componentInstance.Retry.subscribe(spy);
    const btn = query(f, '.lk-overlay__btn');
    expect(btn).not.toBeNull();
    (btn as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('hides the Rejoin button when AllowRetry is false', () => {
    const f = render({ Status: 'disconnected', DisconnectReason: 'room-deleted', AllowRetry: false });
    expect(query(f, '.lk-overlay__btn')).toBeNull();
    expect(text(f, '.lk-overlay__title')).toContain('The room has ended');
  });
});
