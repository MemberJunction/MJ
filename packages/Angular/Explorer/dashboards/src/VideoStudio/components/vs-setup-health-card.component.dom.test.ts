import { describe, expect, it, vi } from 'vitest';
import { VideoStudioSetupHealthOutput } from '@memberjunction/core-entities';
import { query, queryAll, renderComponentFixture } from '@memberjunction/ng-test-utils';
import { VSSetupHealthCardComponent } from './vs-setup-health-card.component';

describe('VSSetupHealthCardComponent DOM', () => {
  it('renders Error and Warning rows with title, message, action, details, and role="status" aria-live="polite"', () => {
    const result: VideoStudioSetupHealthOutput = {
      Healthy: false,
      Checks: [
        {
          Key: 'Storage',
          Status: 'Error',
          Title: 'File Storage',
          Message: 'No active file storage account is configured.',
          Action: 'Add an active File Storage Account in Settings -> File Storage, or set StorageAccountID on the Video Studio agent.',
        },
        {
          Key: 'Render',
          Status: 'Warning',
          Title: 'Render Sandbox',
          Message: 'Renders can reach the network. Use the Docker driver for untrusted content.',
          Action: 'Set VIDEO_STUDIO_RENDER_DRIVER=docker to isolate renders from the network.',
          Details: ['driver=local, version=1.0.0'],
        },
        {
          Key: 'Models',
          Status: 'Warning',
          Title: 'AI Models',
          Message: 'Prompts are using fallback model selection: Narrative Director -> gemini-pro (env Credential)',
          Action: 'Add an active AI Credential for the primary model on each prompt in AI -> Credentials.',
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

    const rows = queryAll(fixture, '.vs-health-card__row');
    expect(rows.length).toBe(3);

    const storageRow = query(fixture, '[data-testid="vs-setup-health-row-Storage"]');
    expect(storageRow?.textContent).toContain('File Storage');
    expect(storageRow?.textContent).toContain('No active file storage account is configured.');
    expect(storageRow?.textContent).toContain('Add an active File Storage Account');

    const renderRow = query(fixture, '[data-testid="vs-setup-health-row-Render"]');
    expect(renderRow?.textContent).toContain('Render Sandbox');
    expect(renderRow?.textContent).toContain('Renders can reach the network. Use the Docker driver for untrusted content.');
    expect(renderRow?.textContent).toContain('driver=local, version=1.0.0');

    const modelsRow = query(fixture, '[data-testid="vs-setup-health-row-Models"]');
    expect(modelsRow?.textContent).toContain('AI Models');
    expect(modelsRow?.textContent).toContain('Prompts are using fallback model selection');
    expect(modelsRow?.textContent).toContain('Add an active AI Credential');

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

    const recheckBtn = query(fixture, '[data-testid="vs-setup-health-recheck"]');
    expect(recheckBtn).toBeTruthy();
    recheckBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(recheckSpy).toHaveBeenCalledTimes(1);

    fixture.destroy();
  });
});
