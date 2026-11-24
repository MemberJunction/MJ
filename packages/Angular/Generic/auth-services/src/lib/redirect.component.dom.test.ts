import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommonModule } from '@angular/common';
import { RenderComponentFixture, Query, Text } from '@memberjunction/ng-test-utils';
import { MJAuthBase } from './mjexplorer-auth-base.service';
import { RedirectComponent } from './redirect.component';

function renderRedirect(handleCallback: () => Promise<void>) {
  const authStub: Pick<MJAuthBase, 'handleCallback'> = { handleCallback };
  return RenderComponentFixture(RedirectComponent, {
    imports: [CommonModule],
    declarations: [RedirectComponent],
    providers: [{ provide: MJAuthBase, useValue: authStub }],
  });
}

describe('RedirectComponent (DOM)', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('renders nothing and does not invoke handleCallback when no OAuth parameters are in the URL', () => {
    const handleCallback = vi.fn().mockResolvedValue(undefined);
    const fixture = renderRedirect(handleCallback);

    expect(handleCallback).not.toHaveBeenCalled();
    expect(Query(fixture, 'h2')).toBeNull();
  });

  it('displays the processing message while handleCallback is pending, then hides it once settled', async () => {
    let resolveCallback!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveCallback = resolve;
    });
    const handleCallback = vi.fn().mockReturnValue(pending);
    window.history.replaceState({}, '', '/redirect?code=auth-code-123&state=xyz');

    const fixture = renderRedirect(handleCallback);
    fixture.detectChanges();

    expect(handleCallback).toHaveBeenCalledTimes(1);
    expect(Text(fixture, 'h2')).toBe('Processing authentication...');

    resolveCallback();
    await pending;
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance.IsProcessing).toBe(false);
    expect(Query(fixture, 'h2')).toBeNull();
  });

  it('ignores MCP OAuth callbacks routed to /oauth/callback', () => {
    const handleCallback = vi.fn().mockResolvedValue(undefined);
    window.history.replaceState({}, '', '/oauth/callback?code=mcp-code');

    const fixture = renderRedirect(handleCallback);

    expect(handleCallback).not.toHaveBeenCalled();
    expect(Query(fixture, 'h2')).toBeNull();
  });

  it('resets IsProcessing and hides the message even when handleCallback rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const handleCallback = vi.fn().mockRejectedValue(new Error('OAuth exchange failed'));
    window.history.replaceState({}, '', '/#id_token=expired-token');

    const fixture = renderRedirect(handleCallback);
    await vi.waitFor(() => {
      expect(fixture.componentInstance.IsProcessing).toBe(false);
    });
    fixture.detectChanges();

    expect(handleCallback).toHaveBeenCalledTimes(1);
    expect(Query(fixture, 'h2')).toBeNull();
  });
});
