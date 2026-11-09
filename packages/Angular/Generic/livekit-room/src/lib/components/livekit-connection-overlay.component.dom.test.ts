import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { LiveKitConnectionOverlayComponent } from './livekit-connection-overlay.component';

/**
 * DOM spec for the deprecated <mj-livekit-connection-overlay> wrapper: it renders `mj-connection-overlay` (whose
 * own spec, in ng-realtime-media, covers every status) and passes its inputs and Retry through.
 */
describe('LiveKitConnectionOverlayComponent (DOM, deprecated wrapper)', () => {
  const render = (inputs: Record<string, unknown> = {}) => renderComponentFixture(LiveKitConnectionOverlayComponent, { inputs });

  it('renders mj-connection-overlay with the status and the error message', () => {
    const f = render({ Status: 'error', ErrorMessage: 'Token expired' });
    expect(text(f, 'mj-connection-overlay .overlay__title')).toContain('Connection failed');
    expect(text(f, '.overlay__sub')).toContain('Token expired');
  });

  it('titles the disconnected state from the reason, and hides Rejoin when AllowRetry is false', () => {
    const f = render({ Status: 'disconnected', DisconnectReason: 'room-deleted', AllowRetry: false });
    expect(text(f, '.overlay__title')).toContain('The room has ended');
    expect(query(f, '.overlay__action')).toBeNull();
    expect(f.componentInstance.disconnectTitle).toBe('The room has ended');
  });

  it('re-emits Retry from the inner overlay', () => {
    const f = render({ Status: 'error' });
    const spy = vi.fn();
    f.componentInstance.Retry.subscribe(spy);
    (query(f, '.overlay__action') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });
});
