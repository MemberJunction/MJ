import { EMPTY } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { IMetadataProvider, RunView } from '@memberjunction/core';
import {
  BrandKitEngine,
  MJBrandKitEntity,
  MJVideoArchetypeEntity,
  VideoStudioEngine,
} from '@memberjunction/core-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { query, queryAll, renderComponentFixture } from '@memberjunction/ng-test-utils';
import { VideoStudioStudioResourceComponent } from './video-studio-studio-resource.component';

function createNavigationServiceStub(): {
  QueryParamChanged$: typeof EMPTY;
  SetAgentContext: ReturnType<typeof vi.fn>;
  SetAgentClientTools: ReturnType<typeof vi.fn>;
  SwitchToApp: ReturnType<typeof vi.fn>;
} {
  return {
    QueryParamChanged$: EMPTY,
    SetAgentContext: vi.fn(),
    SetAgentClientTools: vi.fn(),
    SwitchToApp: vi.fn().mockResolvedValue(true),
  };
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

function setupStudioMocks() {
  const navStub = createNavigationServiceStub();
  const customProvider = {
    CurrentUser: { ID: 'user-studio-1', Name: 'Studio Producer' },
  } as unknown as IMetadataProvider;

  const vsEngineStub = {
    Config: vi.fn().mockResolvedValue(undefined),
    Archetypes: [
      {
        ID: 'arch-launch',
        Name: 'Product Launch Teaser',
        Description: 'Fast-paced launch announcement with kinetic captions',
        Category: 'Product',
        Status: 'Active',
        CompanyID: null,
        Company: null,
        DefaultDurationSeconds: 45,
        MinDurationSeconds: 15,
        MaxDurationSeconds: 90,
        DefaultFormats: '["16:9","9:16"]',
        BeatTemplateObject: [{ Key: 'hook', Label: 'Hook' }],
      } as unknown as MJVideoArchetypeEntity,
      {
        ID: 'arch-recap',
        Name: 'Quarterly Data Recap',
        Description: 'Data-driven KPI summary',
        Category: 'DataStory',
        Status: 'Active',
        CompanyID: 'comp-1',
        Company: 'Acme Corp',
        DefaultDurationSeconds: 60,
        MinDurationSeconds: 30,
        MaxDurationSeconds: 120,
        DefaultFormats: '["16:9","1:1"]',
        BeatTemplateObject: [
          { Key: 'intro', Label: 'Intro' },
          { Key: 'metrics', Label: 'KPIs' },
        ],
      } as unknown as MJVideoArchetypeEntity,
    ],
  } as unknown as VideoStudioEngine;

  const bkEngineStub = {
    Config: vi.fn().mockResolvedValue(undefined),
    GetAssets: vi.fn().mockReturnValue([]),
    BrandKits: [
      {
        ID: 'kit-default',
        Name: 'MJ Corporate Brand',
        Description: 'Primary brand kit',
        CompanyID: null,
        Company: null,
        IsDefault: true,
        Status: 'Active',
      } as unknown as MJBrandKitEntity,
      {
        ID: 'kit-acme',
        Name: 'Acme Brand Kit',
        Description: 'Company brand kit',
        CompanyID: 'comp-1',
        Company: 'Acme Corp',
        IsDefault: false,
        Status: 'Active',
      } as unknown as MJBrandKitEntity,
    ],
  } as unknown as BrandKitEngine;

  vi.spyOn(VideoStudioEngine, 'GetProviderInstance').mockReturnValue(vsEngineStub);
  vi.spyOn(BrandKitEngine, 'GetProviderInstance').mockReturnValue(bkEngineStub);
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
    RunView: vi.fn().mockResolvedValue({
      Success: true,
      Results: [
        { ID: 'query-kpi', Name: 'Monthly Active Users KPI' },
        { ID: 'query-rev', Name: 'Quarterly Revenue Breakdown' },
      ],
    }),
  } as unknown as RunView);

  return { navStub, customProvider };
}

describe('VideoStudioStudioResourceComponent DOM', () => {
  it('renders archetype cards and pre-fills formats and duration when an archetype is selected', async () => {
    const { navStub, customProvider } = setupStudioMocks();
    const notifySpy = vi.spyOn(
      VideoStudioStudioResourceComponent.prototype as unknown as {
        NotifyLoadComplete: () => void;
      },
      'NotifyLoadComplete',
    );

    const fixture = renderComponentFixture(VideoStudioStudioResourceComponent, {
      inputs: { Provider: customProvider },
      providers: [{ provide: NavigationService, useValue: navStub }],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    expect(notifySpy).toHaveBeenCalledTimes(1);
    const cards = queryAll(fixture, '[data-testid^="studio-archetype-card-"]');
    expect(cards).toHaveLength(2);

    // Click second archetype ("Quarterly Data Recap")
    cards[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(instance.SelectedArchetype?.ID).toBe('arch-recap');
    expect(instance.DurationSeconds).toBe(60);
    expect(instance.SelectedFormats).toEqual(['16:9', '1:1']);

    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('disables Start production until topic and archetype are set, then sends PendingMessage and AppContext to vs-copilot-panel', async () => {
    const { navStub, customProvider } = setupStudioMocks();

    const fixture = renderComponentFixture(VideoStudioStudioResourceComponent, {
      inputs: { Provider: customProvider },
      providers: [{ provide: NavigationService, useValue: navStub }],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    const startBtn = query(fixture, '[data-testid="studio-start-button"]');
    expect(startBtn).not.toBeNull();
    expect(startBtn!.hasAttribute('disabled')).toBe(true);

    // Select first archetype ("Product Launch Teaser")
    const firstCard = query(fixture, '[data-testid="studio-archetype-card-arch-launch"]');
    expect(firstCard).not.toBeNull();
    firstCard!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(startBtn!.hasAttribute('disabled')).toBe(true);

    // Select brand kit, topic, and saved query
    instance.SelectBrandKitById('kit-default');
    instance.OnTopicChange('Announce MJ 3.0 Video Studio release');
    instance.ToggleSavedQuery({ ID: 'query-kpi', Name: 'Monthly Active Users KPI' });
    fixture.detectChanges();

    expect(instance.CanStartProduction).toBe(true);
    expect(startBtn!.hasAttribute('disabled')).toBe(false);

    startBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(instance.ActiveConversationId).toBeNull();
    expect(instance.PendingMessage).toBe(
      'Make a Product Launch Teaser video, about Announce MJ 3.0 Video Studio release, 45 seconds, formats 16:9, 9:16, brand kit MJ Corporate Brand, data from Monthly Active Users KPI.',
    );
    expect(instance.StudioAppContext).toEqual({
      VideoStudio: {
        ArchetypeID: 'arch-launch',
        BrandKitID: 'kit-default',
        Formats: ['16:9', '9:16'],
        DurationSeconds: 45,
        QueryIDs: ['query-kpi'],
      },
    });

    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('registers form-fill client tools that mutate form state without any tool that triggers Start production', async () => {
    const { navStub, customProvider } = setupStudioMocks();

    const fixture = renderComponentFixture(VideoStudioStudioResourceComponent, {
      inputs: { Provider: customProvider },
      providers: [{ provide: NavigationService, useValue: navStub }],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    expect(navStub.SetAgentClientTools).toHaveBeenCalledTimes(1);
    const tools = navStub.SetAgentClientTools.mock.calls[0][1] as Array<{
      Name: string;
      Handler: (params: Record<string, unknown>) => Promise<{ Success: boolean; Data?: Record<string, unknown> }>;
    }>;

    const toolNames = tools.map((t) => t.Name);
    expect(toolNames).toEqual([
      'SelectStudioArchetype',
      'SelectStudioBrandKit',
      'SetStudioFormats',
      'SetStudioTopic',
    ]);
    expect(toolNames).not.toContain('StartProduction');
    expect(toolNames).not.toContain('StartStudioProduction');

    const findTool = (name: string) => tools.find((t) => t.Name === name)!;

    const archRes = await findTool('SelectStudioArchetype').Handler({ archetype: 'Quarterly Data Recap' });
    expect(archRes.Success).toBe(true);
    expect(instance.SelectedArchetype?.ID).toBe('arch-recap');

    const kitRes = await findTool('SelectStudioBrandKit').Handler({ brandKit: 'Acme Brand Kit' });
    expect(kitRes.Success).toBe(true);
    expect(instance.SelectedBrandKit?.ID).toBe('kit-acme');

    const fmtRes = await findTool('SetStudioFormats').Handler({ formats: ['9:16', '4:5'] });
    expect(fmtRes.Success).toBe(true);
    expect(instance.SelectedFormats).toEqual(['9:16', '4:5']);

    const topicRes = await findTool('SetStudioTopic').Handler({ topic: 'AI Agent Deep Dive' });
    expect(topicRes.Success).toBe(true);
    expect(instance.Topic).toBe('AI Agent Deep Dive');

    // Verify Start production was NOT triggered automatically by any client tool
    expect(instance.PendingMessage).toBeNull();

    fixture.destroy();
    vi.restoreAllMocks();
  });
});
