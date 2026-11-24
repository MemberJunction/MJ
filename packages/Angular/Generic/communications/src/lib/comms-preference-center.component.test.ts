import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { CommsPreferenceCenterComponent } from './comms-preference-center.component';

// Minimal Angular DI stub for direct class unit testing without TestBed overhead
vi.mock('@angular/core', async () => {
  const actual = await vi.importActual<typeof import('@angular/core')>('@angular/core');
  return {
    ...actual,
    inject: () => ({ markForCheck: vi.fn(), detectChanges: vi.fn() } as unknown as ChangeDetectorRef),
  };
});

describe('CommsPreferenceCenterComponent', () => {
  const token = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads branding and preferences from GET /comms/preferences/:token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Token: token,
        Sender: {
          ID: 's1',
          Name: 'Acme Sender',
          TemplateContext: {
            BrandName: 'Acme Corp',
            LogoURL: 'https://acme.example.com/logo.png',
            PrimaryColor: '#0B5394',
            FooterText: 'Unsubscribe anytime.',
          },
        },
        Preferences: [
          {
            ID: 'p1',
            Name: 'Weekly Digest',
            Description: 'Weekly news',
            MessageClass: 'Marketing',
            State: 'Opted In',
          },
        ],
        CanUnsubscribeAll: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const comp = new CommsPreferenceCenterComponent();
    comp.Token = token;
    comp.ApiRoot = '/comms';
    comp.ngOnInit();

    await vi.waitFor(() => {
      expect(comp.IsLoading).toBe(false);
      expect(comp.Preferences).toHaveLength(1);
    });

    expect(comp.BrandName).toBe('Acme Corp');
    expect(comp.LogoUrl).toBe('https://acme.example.com/logo.png');
    expect(comp.PrimaryColor).toBe('#0B5394');
    expect(comp.FooterText).toBe('Unsubscribe anytime.');
    expect(fetchMock).toHaveBeenCalledWith(
      `/comms/preferences/${token}`,
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('submits updated preferences and UnsubscribeAll to POST /comms/preferences/:token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Token: token,
          Sender: { ID: 's1', Name: 'Acme', TemplateContext: {} },
          Preferences: [
            { ID: 'p1', Name: 'Newsletter', MessageClass: 'Marketing', State: 'Opted In' },
          ],
          CanUnsubscribeAll: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Success: true,
          UnsubscribedAll: true,
          Preferences: [
            { ID: 'p1', Name: 'Newsletter', MessageClass: 'Marketing', State: 'Opted Out' },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const comp = new CommsPreferenceCenterComponent();
    comp.Token = token;
    comp.ngOnInit();
    await vi.waitFor(() => expect(comp.Preferences).toHaveLength(1));

    await comp.UnsubscribeAll();
    expect(comp.Preferences[0].State).toBe('Opted Out');
    expect(comp.StatusMessage).toContain('unsubscribed from all');
  });
});
