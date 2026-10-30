import { describe, expect, it, vi } from 'vitest';
import { IMetadataProvider, RunView } from '@memberjunction/core';
import {
  BrandKitEngine,
  MJBrandKitEntity,
  MJVideoArchetypeEntity,
  VideoStudioEngine,
  VideoStudioSetupHealthOperation,
} from '@memberjunction/core-entities';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { query, queryAll, renderComponentFixture } from '@memberjunction/ng-test-utils';
import { VSProductionBriefComponent, VSProductionBriefStartEvent } from './vs-production-brief.component';

function createGraphQLProviderStub(): IMetadataProvider {
  const provider = Object.create(GraphQLDataProvider.prototype);
  Object.defineProperty(provider, 'CurrentUser', {
    value: { ID: 'user-1' },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(provider, 'ExecuteGQL', {
    value: vi.fn().mockResolvedValue({}),
    configurable: true,
    writable: true,
  });
  return provider as unknown as IMetadataProvider;
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe('VSProductionBriefComponent DOM', () => {
  it('renders dynamic formats (including 4:5) and new archetype rows without template changes, shows beat strip, toggles audio options, updates summary line, emits StartRequested, and applies client tools', async () => {
    const customProvider = createGraphQLProviderStub();

    vi.spyOn(VideoStudioSetupHealthOperation.prototype, 'Execute').mockResolvedValue({
      Success: true,
      Output: {
        Healthy: true,
        Checks: [
          { Key: 'Render', Status: 'OK', Title: 'Render Worker', Message: 'Chromium ready' },
        ],
      },
    });

    const fakeArchetypes: Partial<MJVideoArchetypeEntity>[] = [
      {
        ID: 'arch-1',
        Name: 'KPI Briefing',
        Description: 'Executive KPI summary',
        Category: 'Briefing',
        Status: 'Active',
        CompanyID: null,
        DefaultDurationSeconds: 60,
        MinDurationSeconds: 30,
        MaxDurationSeconds: 90,
        DefaultFormats: '["16:9", "9:16"]',
        BeatTemplateObject: [
          {
            Key: 'hook',
            Label: 'Hook',
            Purpose: 'Open with headline metric',
            MinDurationSeconds: 5,
            MaxDurationSeconds: 15,
            DefaultDurationSeconds: 10,
          },
          {
            Key: 'metric',
            Label: 'Key Metric',
            Purpose: 'Show KPI trend',
            MinDurationSeconds: 20,
            MaxDurationSeconds: 40,
            DefaultDurationSeconds: 30,
          },
          {
            Key: 'cta',
            Label: 'Takeaway',
            Purpose: 'Close with next steps',
            MinDurationSeconds: 10,
            MaxDurationSeconds: 30,
            DefaultDurationSeconds: 20,
          },
        ],
      },
      {
        ID: 'arch-2',
        Name: 'Custom Social Spotlight',
        Description: 'Vertical & portrait social promo',
        Category: 'Social',
        Status: 'Active',
        CompanyID: 'comp-1',
        Company: 'Acme Corp',
        DefaultDurationSeconds: 30,
        MinDurationSeconds: 15,
        MaxDurationSeconds: 60,
        DefaultFormats: '["4:5", "9:16"]',
        BeatTemplateObject: [
          {
            Key: 'intro',
            Label: 'Intro',
            Purpose: 'Catch attention',
            MinDurationSeconds: 5,
            MaxDurationSeconds: 15,
            DefaultDurationSeconds: 10,
          },
          {
            Key: 'body',
            Label: 'Demo',
            Purpose: 'Show feature',
            MinDurationSeconds: 10,
            MaxDurationSeconds: 30,
            DefaultDurationSeconds: 20,
          },
        ],
      },
    ];

    const fakeBrandKits: Partial<MJBrandKitEntity>[] = [
      {
        ID: 'kit-default',
        Name: 'Org Default Kit',
        Description: 'Org-wide kit',
        CompanyID: null,
        IsDefault: true,
        Status: 'Active',
      },
      {
        ID: 'kit-acme',
        Name: 'Acme Brand Kit',
        Description: 'Company-specific kit',
        CompanyID: 'comp-1',
        Company: 'Acme Corp',
        IsDefault: true,
        Status: 'Active',
      },
    ];

    vi.spyOn(VideoStudioEngine, 'GetProviderInstance').mockReturnValue({
      Config: vi.fn().mockResolvedValue(undefined),
      Archetypes: fakeArchetypes as MJVideoArchetypeEntity[],
    } as unknown as VideoStudioEngine);

    vi.spyOn(BrandKitEngine, 'GetProviderInstance').mockReturnValue({
      Config: vi.fn().mockResolvedValue(undefined),
      BrandKits: fakeBrandKits as MJBrandKitEntity[],
      GetAssets: vi.fn().mockReturnValue([]),
    } as unknown as BrandKitEngine);

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: vi.fn().mockResolvedValue({
        Success: true,
        Results: [{ ID: 'q-1', Name: 'Quarterly Revenue By Region' }],
      }),
    } as unknown as RunView);

    const fixture = renderComponentFixture(VSProductionBriefComponent, {
      inputs: { Provider: customProvider },
    });

    const startEvents: VSProductionBriefStartEvent[] = [];
    const sub = fixture.componentInstance.StartRequested.subscribe((ev) => startEvents.push(ev));

    await flushAsync();
    await flushAsync();
    fixture.detectChanges();

    // Setup OK takes no row in the brief when all checks are OK and ShowHealthySetupDetails is false
    expect(fixture.componentInstance.IsAllSetupOk).toBe(true);
    expect(query(fixture, '[data-testid="vs-setup-health-card"]')).toBeNull();

    // Toggling ShowHealthySetupDetails = true from header shows the expanded Setup health card with details and Recheck
    fixture.componentRef.setInput('ShowHealthySetupDetails', true);
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="vs-setup-health-card"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="vs-setup-health-expanded-details"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="vs-setup-health-recheck"]')).not.toBeNull();

    // Toggling ShowHealthySetupDetails back to false hides the card again
    fixture.componentRef.setInput('ShowHealthySetupDetails', false);
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="vs-setup-health-card"]')).toBeNull();

    // When a check is Warning or Error, the full card shows at the top of the brief automatically
    fixture.componentInstance.SetupHealthResult = {
      Healthy: true,
      Checks: [
        { Key: 'Render', Status: 'Warning', Title: 'TTS provider', Message: 'Missing API key' },
      ],
    };
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="vs-setup-health-card"]')).not.toBeNull();

    // 1. Both archetypes (including dynamically added arch-2) and all 4 formats (including 4:5) render
    const archetypeCards = queryAll(fixture, '[data-testid^="vs-brief-archetype-"]');
    expect(archetypeCards.length).toBe(2);
    expect(query(fixture, '[data-testid="vs-brief-format-4:5"]')).not.toBeNull();

    // Topic textarea uses rows="2"
    const topicInput = query(fixture, '[data-testid="vs-brief-topic-input"]');
    expect(topicInput?.getAttribute('rows')).toBe('2');

    // 2. Beat strip renders for the selected archetype
    const beatStrip = query(fixture, '[data-testid^="vs-brief-archetype-"] mj-video-beat-strip');
    expect(beatStrip).not.toBeNull();
    expect(beatStrip?.textContent).toContain('Hook');
    expect(beatStrip?.textContent).toContain('Key Metric');

    // 3. Audio options toggle narration and captions
    const narrationToggle = query(fixture, '[data-testid="vs-audio-voiceover-switch"] [role="switch"]');
    expect(narrationToggle).not.toBeNull();
    expect(narrationToggle?.getAttribute('aria-checked')).toBe('true');

    const sidecarCaptionBtn = query(fixture, '[data-testid="vs-audio-caption-sidecar"]');
    expect(sidecarCaptionBtn).not.toBeNull();
    sidecarCaptionBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.CaptionsMode).toBe('Sidecar');

    narrationToggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.NarrationEnabled).toBe(false);
    expect(query(fixture, '[data-testid="vs-audio-captions-group"]')).toBeNull();

    // Turn narration back on
    narrationToggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.NarrationEnabled).toBe(true);

    // 4. Client tools update brief state and summary line
    const archRes = fixture.componentInstance.ApplyClientToolArchetype('Custom Social Spotlight');
    expect(archRes.Success).toBe(true);
    expect(fixture.componentInstance.SelectedArchetype?.ID).toBe('arch-2');
    expect(fixture.componentInstance.SelectedBrandKit?.ID).toBe('kit-acme');

    const kitRes = fixture.componentInstance.ApplyClientToolBrandKit('Org Default Kit');
    expect(kitRes.Success).toBe(true);
    expect(fixture.componentInstance.SelectedBrandKit?.ID).toBe('kit-default');

    const fmtRes = fixture.componentInstance.ApplyClientToolFormats(['4:5', '1:1']);
    expect(fmtRes.Success).toBe(true);
    expect(fixture.componentInstance.SelectedFormats).toEqual(['4:5', '1:1']);

    const topicRes = fixture.componentInstance.ApplyClientToolTopic('New winter product launch');
    expect(topicRes.Success).toBe(true);
    fixture.detectChanges();

    const summaryEl = query(fixture, '[data-testid="vs-brief-summary"]');
    expect(summaryEl?.textContent).toContain('Custom Social Spotlight');
    expect(summaryEl?.textContent).toContain('0:30');
    expect(summaryEl?.textContent).toContain('4:5, 1:1');
    expect(summaryEl?.textContent).toContain('Org Default Kit');

    // 5. Clicking Start emits StartRequested with composed message and AppContext, with one-line composer hint
    const footerHintEl = query(fixture, '[data-testid="vs-brief-footer-hint"]');
    expect(footerHintEl?.textContent).toContain('Fills the message box below');
    const startBtn = query(fixture, '[data-testid="vs-brief-start-button"]');
    expect(startBtn).not.toBeNull();
    expect(startBtn?.getAttribute('Size')).toBe('md');
    expect(startBtn?.classList.contains('mj-btn--lg')).toBe(false);
    expect(startBtn?.hasAttribute('disabled')).toBe(false);
    startBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(startEvents.length).toBe(1);
    expect(startEvents[0].Message).toContain('Make a Custom Social Spotlight video');
    expect(startEvents[0].Message).toContain('New winter product launch');
    const vsContext = startEvents[0].AppContext['VideoStudio'] as Record<string, unknown>;
    expect(vsContext['ArchetypeID']).toBe('arch-2');
    expect(vsContext['BrandKitID']).toBe('kit-default');
    expect(vsContext['Formats']).toEqual(['4:5', '1:1']);
    expect(vsContext['NarrationEnabled']).toBe(true);
    expect(vsContext['CaptionsMode']).toBe('Sidecar');

    // 6. "New brand kit" link opens mj-brand-kit-creator and selects the newly saved kit after Saved
    const newKitLink = query(fixture, '[data-testid="vs-brief-new-brand-kit-link"]') as HTMLElement | null;
    expect(newKitLink).not.toBeNull();
    newKitLink!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.IsBrandKitCreatorOpen).toBe(true);
    expect(query(fixture, '[data-testid="brand-kit-creator"]')).not.toBeNull();

    fakeBrandKits.push({
      ID: 'kit-created-99',
      Name: 'Freshly Created Kit',
      Description: '',
      CompanyID: null,
      IsDefault: false,
      Status: 'Active',
    });
    await fixture.componentInstance.OnBrandKitCreatorSaved('kit-created-99');
    await flushAsync();
    fixture.detectChanges();

    expect(fixture.componentInstance.IsBrandKitCreatorOpen).toBe(false);
    expect(fixture.componentInstance.SelectedBrandKit?.ID).toBe('kit-created-99');
    expect(fixture.componentInstance.SelectedBrandKit?.Name).toBe('Freshly Created Kit');

    sub.unsubscribe();
    fixture.destroy();
    vi.restoreAllMocks();
  });
});

