import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderComponentFixture, query, queryAll, click } from '@memberjunction/ng-test-utils';
import { CommsPreferenceCenterComponent } from './comms-preference-center.component';

describe('CommsPreferenceCenterComponent (DOM)', () => {
  const token = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an error alert when initialized without a token', () => {
    const f = renderComponentFixture(CommsPreferenceCenterComponent);
    const alert = query(f, '.mj-comms-pc__error');
    expect(alert?.textContent?.trim()).toBe('Invalid preference link.');
  });

  it('renders branding, preference items, and footer after loading from GET /comms/preferences/:token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
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
            {
              ID: 'p2',
              Name: 'Product Updates',
              Description: 'Release notes',
              MessageClass: 'Operational',
              State: 'Opted Out',
            },
          ],
          CanUnsubscribeAll: true,
        }),
      }),
    );

    const f = renderComponentFixture(CommsPreferenceCenterComponent, {
      inputs: { token, 'api-root': '/comms' },
    });

    await vi.waitFor(() => {
      f.detectChanges();
      expect(queryAll(f, '.mj-comms-pc__item')).toHaveLength(2);
    });

    expect(query(f, 'h1')?.textContent?.trim()).toBe('Acme Corp');
    expect(query(f, '.mj-comms-pc__footer')?.textContent?.trim()).toBe('Unsubscribe anytime.');
    const checkboxes = queryAll<HTMLInputElement>(f, '.mj-comms-pc__toggle input[type="checkbox"]');
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
  });

  it('submits UnsubscribeAll when clicking the Unsubscribe from all button', async () => {
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
          Preferences: [
            { ID: 'p1', Name: 'Newsletter', MessageClass: 'Marketing', State: 'Opted Out' },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const f = renderComponentFixture(CommsPreferenceCenterComponent, {
      inputs: { token },
    });

    await vi.waitFor(() => {
      f.detectChanges();
      expect(queryAll(f, '.mj-comms-pc__item')).toHaveLength(1);
    });

    const unsubBtn = query(f, '.mj-comms-pc__btn--danger');
    expect(unsubBtn).not.toBeNull();
    click(f, '.mj-comms-pc__btn--danger');

    await vi.waitFor(() => {
      f.detectChanges();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const postCall = fetchMock.mock.calls[1];
    expect(postCall[0]).toBe(`/comms/preferences/${token}`);
    expect(JSON.parse(String((postCall[1] as { body: string }).body))).toMatchObject({
      UnsubscribeAll: true,
    });
  });
});
