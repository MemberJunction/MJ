import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { MediaConnectionOverlayComponent } from './connection-overlay.component';

/** Moved from ng-livekit-room's connection-overlay spec; each case keeps its meaning. */
describe('MediaConnectionOverlayComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown> = {}) => renderComponentFixture(MediaConnectionOverlayComponent, { inputs });

  it('shows "Ready to connect" for the idle status', () => {
    expect(text(render({ Status: 'idle' }), '.overlay__title')).toContain('Ready to connect');
  });

  it('shows a connecting title', () => {
    expect(text(render({ Status: 'connecting' }), '.overlay__title')).toContain('Connecting');
  });

  it('shows a reconnecting title with a subtitle', () => {
    const f = render({ Status: 'reconnecting' });
    expect(text(f, '.overlay__title')).toContain('Reconnecting');
    expect(text(f, '.overlay__sub')).toContain('connection dropped');
  });

  it('shows the error state with the supplied message and a retry button', () => {
    const f = render({ Status: 'error', ErrorMessage: 'Token expired' });
    expect(text(f, '.overlay__title')).toContain('Connection failed');
    expect(text(f, '.overlay__sub')).toContain('Token expired');
    expect(query(f, '.overlay__action')).not.toBeNull();
  });

  it('falls back to a generic error message when none is supplied', () => {
    expect(text(render({ Status: 'error', ErrorMessage: null }), '.overlay__sub')).toContain('could not join the room');
  });

  it('emits Retry when "Try again" is clicked', () => {
    const f = render({ Status: 'error' });
    const spy = vi.fn();
    f.componentInstance.Retry.subscribe(spy);
    (query(f, '.overlay__action') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('titles the disconnected state from the reason', () => {
    expect(text(render({ Status: 'disconnected', DisconnectReason: 'connection-lost' }), '.overlay__title')).toContain('Connection lost');
  });

  it('offers Rejoin in the disconnected state and emits Retry from it', () => {
    const f = render({ Status: 'disconnected', DisconnectReason: 'connection-lost', AllowRetry: true });
    const spy = vi.fn();
    f.componentInstance.Retry.subscribe(spy);
    const button = query(f, '.overlay__action');
    expect(button).not.toBeNull();
    (button as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('hides Rejoin when AllowRetry is false', () => {
    const f = render({ Status: 'disconnected', DisconnectReason: 'room-deleted', AllowRetry: false });
    expect(query(f, '.overlay__action')).toBeNull();
    expect(text(f, '.overlay__title')).toContain('The room has ended');
  });
});
