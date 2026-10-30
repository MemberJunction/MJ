import { describe, expect, it, vi } from 'vitest';
import { VideoStudioSetupHealthOutput } from '@memberjunction/core-entities';
import { query, queryAll, renderComponentFixture } from '@memberjunction/ng-test-utils';
import { VSSetupHealthCardComponent } from './vs-setup-health-card.component';

describe('VSSetupHealthCardComponent DOM', () => {
  it('renders error line ("Video Studio can\'t make videos yet: <title>"), message, and Details toggle when an Error check is present', () => {
    const result: VideoStudioSetupHealthOutput = {
      Healthy: false,
      Checks: [
        {
          Key: 'Render',
          Status: 'Error',
          Title: 'Render Worker',
          Message: "The render worker didn't answer in 10 s (driver LocalWorker).",
          Action: 'Install ffmpeg and check @memberjunction/video-studio-render-worker.',
          Details: ['ffmpeg binary not found on PATH'],
        },
        {
          Key: 'Storage',
          Status: 'Warning',
          Title: 'File Storage',
          Message:
            'No file storage connected. Videos up to 2 MB are kept in the database; larger videos and sharing need file storage.',
          Action: 'An admin can add a file storage account; any active account works.',
        },
      ],
    };

    const fixture = renderComponentFixture(VSSetupHealthCardComponent, {
      inputs: {
        Result: result,
        Loading: false,
      },
    });
    fixture.detectChanges();

    const card = query(fixture, '[data-testid="vs-setup-health-card"]');
    expect(card).toBeTruthy();
    expect(card?.getAttribute('role')).toBe('status');
    expect(card?.getAttribute('aria-live')).toBe('polite');
    expect(card?.classList.contains('vs-health-card--unhealthy')).toBe(true);

    const headline = query(fixture, '[data-testid="vs-setup-health-error-headline"]');
    expect(headline?.textContent?.trim()).toBe("Video Studio can't make videos yet: Render Worker");

    const message = query(fixture, '[data-testid="vs-setup-health-error-message"]');
    expect(message?.textContent?.trim()).toBe(
      "The render worker didn't answer in 10 s (driver LocalWorker).",
    );

    const detailsToggle = query(fixture, '[data-testid="vs-setup-health-error-details-toggle"]');
    expect(detailsToggle).toBeTruthy();
    expect(detailsToggle?.textContent).toContain('Details');
    expect(detailsToggle?.getAttribute('aria-expanded')).toBe('false');
    expect(query(fixture, '[data-testid="vs-setup-health-non-ok-list"]')).toBeNull();

    // Clicking "Details" reveals the non-OK rows with Action and Details tucked behind "Details for admins"
    detailsToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(detailsToggle?.getAttribute('aria-expanded')).toBe('true');
    const rows = queryAll(fixture, '.vs-health-card__row');
    expect(rows.length).toBe(2);
    expect(query(fixture, '[data-testid="vs-setup-health-action-Render"]')).toBeNull();
    expect(query(fixture, '[data-testid="vs-setup-health-details-Render"]')).toBeNull();

    const adminToggle = query(fixture, '[data-testid="vs-setup-health-admin-toggle-Render"]');
    expect(adminToggle?.textContent).toContain('Details for admins');
    adminToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="vs-setup-health-action-Render"]')?.textContent).toContain(
      'Install ffmpeg',
    );
    expect(query(fixture, '[data-testid="vs-setup-health-details-Render"]')?.textContent).toContain(
      'ffmpeg binary not found on PATH',
    );

    fixture.destroy();
  });

  it('renders one quiet collapsed "Ready, with 2 notes" line when only warnings exist, and expands notes + admin details on click', () => {
    const result: VideoStudioSetupHealthOutput = {
      Healthy: true,
      Checks: [
        {
          Key: 'Storage',
          Status: 'Warning',
          Title: 'File Storage',
          Message:
            'No file storage connected. Videos up to 2 MB are kept in the database; larger videos and sharing need file storage.',
          Action: 'An admin can add a file storage account; any active account works.',
        },
        {
          Key: 'Render',
          Status: 'Warning',
          Title: 'Render Worker',
          Message:
            "Videos are made on this server. That's fine for your own content; for content from outside your organization, an admin should switch rendering to Docker.",
          Action: "Switch videoStudio.render.driver to 'Docker' when rendering untrusted content.",
          Details: ['Node v24.18.0', 'HyperFrames 0.8.134', 'Chromium 146.0.0', 'ffmpeg 7.1.1'],
        },
        {
          Key: 'Models',
          Status: 'OK',
          Title: 'Model Credentials',
          Message: 'All 3 presets have model credentials.',
        },
      ],
    };

    const fixture = renderComponentFixture(VSSetupHealthCardComponent, {
      inputs: {
        Result: result,
        Loading: false,
      },
    });
    fixture.detectChanges();

    const card = query(fixture, '[data-testid="vs-setup-health-card"]');
    expect(card?.classList.contains('vs-health-card--warning')).toBe(true);
    expect(card?.classList.contains('vs-health-card--unhealthy')).toBe(false);

    const warningsToggle = query(fixture, '[data-testid="vs-setup-health-warnings-toggle"]');
    expect(warningsToggle).toBeTruthy();
    expect(warningsToggle?.getAttribute('aria-expanded')).toBe('false');
    expect(query(fixture, '[data-testid="vs-setup-health-warnings-label"]')?.textContent?.trim()).toBe(
      'Ready, with 2 notes',
    );
    expect(query(fixture, '[data-testid="vs-setup-health-non-ok-list"]')).toBeNull();

    // Clicking the quiet summary line expands the 2 warning notes
    warningsToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(warningsToggle?.getAttribute('aria-expanded')).toBe('true');
    const rows = queryAll(fixture, '.vs-health-card__row');
    expect(rows.length).toBe(2);

    const storageRow = query(fixture, '[data-testid="vs-setup-health-row-Storage"]');
    expect(storageRow?.textContent).toContain('File Storage');
    expect(storageRow?.textContent).toContain(
      'No file storage connected. Videos up to 2 MB are kept in the database; larger videos and sharing need file storage.',
    );
    // Action and Details are tucked behind "Details for admins" until clicked
    expect(query(fixture, '[data-testid="vs-setup-health-action-Storage"]')).toBeNull();
    expect(query(fixture, '[data-testid="vs-setup-health-details-Render"]')).toBeNull();

    const renderAdminToggle = query(fixture, '[data-testid="vs-setup-health-admin-toggle-Render"]');
    expect(renderAdminToggle?.textContent).toContain('Details for admins');
    renderAdminToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="vs-setup-health-action-Render"]')?.textContent).toContain(
      "Switch videoStudio.render.driver to 'Docker'",
    );
    expect(query(fixture, '[data-testid="vs-setup-health-details-Render"]')?.textContent).toContain(
      'Node v24.18.0',
    );

    fixture.destroy();
  });

  it('renders compact "Setup OK" line when Healthy is true with all OK checks and expands details on click', () => {
    const result: VideoStudioSetupHealthOutput = {
      Healthy: true,
      Checks: [
        {
          Key: 'Storage',
          Status: 'OK',
          Title: 'File Storage',
          Message: 'File storage account "Studio R2" is ready.',
          Details: ['source=Agent'],
        },
        {
          Key: 'Render',
          Status: 'OK',
          Title: 'Render Sandbox',
          Message: 'Render driver "docker" is healthy.',
        },
        {
          Key: 'Models',
          Status: 'OK',
          Title: 'AI Models',
          Message: 'All 4 Video Studio prompts have active primary model credentials.',
        },
      ],
    };

    const fixture = renderComponentFixture(VSSetupHealthCardComponent, {
      inputs: {
        Result: result,
        Loading: false,
      },
    });
    fixture.detectChanges();

    const toggle = query(fixture, '[data-testid="vs-setup-health-ok-toggle"]');
    expect(toggle).toBeTruthy();
    expect(toggle?.textContent).toContain('Setup OK');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(query(fixture, '[data-testid="vs-setup-health-expanded-details"]')).toBeNull();

    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    const expanded = query(fixture, '[data-testid="vs-setup-health-expanded-details"]');
    expect(expanded).toBeTruthy();
    expect(expanded?.textContent).toContain('File storage account "Studio R2" is ready.');
    expect(expanded?.textContent).toContain('Render driver "docker" is healthy.');
    expect(expanded?.textContent).toContain('All 4 Video Studio prompts have active primary model credentials.');

    fixture.destroy();
  });

  it('emits (Recheck) when the Recheck button is clicked', () => {
    const result: VideoStudioSetupHealthOutput = {
      Healthy: true,
      Checks: [
        { Key: 'Storage', Status: 'OK', Title: 'File Storage', Message: 'Ready' },
        { Key: 'Render', Status: 'OK', Title: 'Render Sandbox', Message: 'Ready' },
        { Key: 'Models', Status: 'OK', Title: 'AI Models', Message: 'Ready' },
      ],
    };

    const fixture = renderComponentFixture(VSSetupHealthCardComponent, {
      inputs: {
        Result: result,
        Loading: false,
      },
    });
    fixture.detectChanges();

    const recheckSpy = vi.fn();
    fixture.componentInstance.Recheck.subscribe(recheckSpy);

    const recheckBtn = query(fixture, '[data-testid="vs-setup-health-recheck"] button');
    expect(recheckBtn).toBeTruthy();
    recheckBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(recheckSpy).toHaveBeenCalledTimes(1);

    fixture.destroy();
  });

  it('renders <mj-loading> when Loading is true and Result is null', () => {
    const fixture = renderComponentFixture(VSSetupHealthCardComponent, {
      inputs: {
        Result: null,
        Loading: true,
      },
    });
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="vs-setup-health-loading"] mj-loading')).toBeTruthy();
    fixture.destroy();
  });
});
