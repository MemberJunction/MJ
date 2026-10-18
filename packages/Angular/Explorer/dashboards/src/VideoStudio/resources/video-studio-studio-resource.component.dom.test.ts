import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { EMPTY } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { IMetadataProvider, RunView } from '@memberjunction/core';
import {
  BrandKitEngine,
  MJBrandKitEntity,
  MJVideoArchetypeEntity,
  VideoStudioEngine,
  VideoStudioSetupHealthOperation,
} from '@memberjunction/core-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { query, queryAll, renderComponentFixture } from '@memberjunction/ng-test-utils';
import {
  MJAlertComponent,
  MJDropdownComponent,
  MJNumericInputComponent,
} from '@memberjunction/ng-ui-components';
import { VSCopilotPanelComponent } from '../components/vs-copilot-panel.component';
import { VSSetupHealthCardComponent } from '../components/vs-setup-health-card.component';
import { VideoStudioStudioResourceComponent } from './video-studio-studio-resource.component';

const STUDIO_TEST_IMPORTS = [
  FormsModule,
  MJAlertComponent,
  MJDropdownComponent,
  MJNumericInputComponent,
  VSSetupHealthCardComponent,
];

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

  const aiEngineStub = {
    Config: vi.fn().mockResolvedValue(undefined),
    Agents: [],
  } as unknown as AIEngineBase;

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

  const runViewFn = vi.fn().mockResolvedValue({
    Success: true,
    Results: [
      { ID: 'query-kpi', Name: 'Monthly Active Users KPI' },
      { ID: 'query-rev', Name: 'Quarterly Revenue Breakdown' },
    ],
  });

  const setupHealthSpy = vi
    .spyOn(VideoStudioSetupHealthOperation.prototype, 'Execute')
    .mockResolvedValue({
      Success: true,
      Output: {
        Healthy: true,
        Checks: [
          { Key: 'Storage', Status: 'OK', Title: 'File Storage', Message: 'Ready' },
          { Key: 'Render', Status: 'OK', Title: 'Render Sandbox', Message: 'Ready' },
          { Key: 'Models', Status: 'OK', Title: 'AI Models', Message: 'Ready' },
        ],
      },
    });

  vi.spyOn(AIEngineBase, 'GetProviderInstance').mockReturnValue(aiEngineStub);
  vi.spyOn(VideoStudioEngine, 'GetProviderInstance').mockReturnValue(vsEngineStub);
  vi.spyOn(BrandKitEngine, 'GetProviderInstance').mockReturnValue(bkEngineStub);
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
    RunView: runViewFn,
  } as unknown as RunView);

  return { navStub, customProvider, runViewFn, aiEngineStub, setupHealthSpy };
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
      imports: STUDIO_TEST_IMPORTS,
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

  it('wires brand-kit mj-dropdown ValueChange and duration mj-numeric-input ngModelChange through the template', async () => {
    const { navStub, customProvider } = setupStudioMocks();

    const fixture = renderComponentFixture(VideoStudioStudioResourceComponent, {
      inputs: { Provider: customProvider },
      imports: STUDIO_TEST_IMPORTS,
      providers: [{ provide: NavigationService, useValue: navStub }],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;

    // Select first archetype ("Product Launch Teaser": min 15s, max 90s)
    const firstCard = query(fixture, '[data-testid="studio-archetype-card-arch-launch"]');
    expect(firstCard).not.toBeNull();
    firstCard!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(instance.MinDurationSeconds).toBe(15);
    expect(instance.MaxDurationSeconds).toBe(90);

    // Emit ValueChange from the brand-kit mj-dropdown ('kit-acme' then null for 'None')
    const brandKitDebug = fixture.debugElement.query(
      By.css('[data-testid="studio-brand-kit-select"]'),
    );
    expect(brandKitDebug).not.toBeNull();
    brandKitDebug.triggerEventHandler('ValueChange', 'kit-acme');
    fixture.detectChanges();
    expect(instance.SelectedBrandKit?.ID).toBe('kit-acme');

    brandKitDebug.triggerEventHandler('ValueChange', null);
    fixture.detectChanges();
    expect(instance.SelectedBrandKit).toBeNull();

    // Trigger ngModelChange on duration mj-numeric-input with out-of-range values
    const durationDebug = fixture.debugElement.query(
      By.css('[data-testid="studio-duration-input"]'),
    );
    expect(durationDebug).not.toBeNull();
    durationDebug.triggerEventHandler('ngModelChange', 500);
    fixture.detectChanges();
    expect(instance.DurationSeconds).toBe(90);

    durationDebug.triggerEventHandler('ngModelChange', 3);
    fixture.detectChanges();
    expect(instance.DurationSeconds).toBe(15);

    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('disables Start production until topic and archetype are set, guards against double-click while StartConversation is pending, and surfaces StartError when copilot is not ready', async () => {
    const { navStub, customProvider } = setupStudioMocks();

    const fixture = renderComponentFixture(VideoStudioStudioResourceComponent, {
      inputs: { Provider: customProvider },
      imports: STUDIO_TEST_IMPORTS,
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

    const copilotDebug = fixture.debugElement.query(By.directive(VSCopilotPanelComponent));
    expect(copilotDebug).not.toBeNull();
    const copilotInstance = copilotDebug.componentInstance as VSCopilotPanelComponent;

    // Wire a pending OnEmptyStateMessageSent promise via StartConversation to verify double-click guard
    let resolveEmptyStateSend!: () => void;
    const onEmptyStateMessageSentSpy = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveEmptyStateSend = resolve;
        }),
    );
    const startConvSpy = vi
      .spyOn(copilotInstance, 'StartConversation')
      .mockImplementation(async (msg: string) => {
        copilotInstance.ConversationId = null;
        await onEmptyStateMessageSentSpy({ text: msg, attachments: [] });
        return true;
      });

    // First click starts production and leaves StartConversation pending
    startBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(instance.IsStarting).toBe(true);
    expect(instance.CanStartProduction).toBe(false);
    expect(startBtn!.hasAttribute('disabled')).toBe(true);

    // Second click while StartConversation is still pending must not fire StartConversation or OnEmptyStateMessageSent again
    startBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    void instance.StartProduction();
    fixture.detectChanges();

    expect(startConvSpy).toHaveBeenCalledTimes(1);
    expect(onEmptyStateMessageSentSpy).toHaveBeenCalledTimes(1);

    const expectedMessage =
      'Make a Product Launch Teaser video, about Announce MJ 3.0 Video Studio release, 45 seconds, formats 16:9, 9:16, brand kit MJ Corporate Brand, data from Monthly Active Users KPI.';
    const expectedAppContext = {
      VideoStudio: {
        ArchetypeID: 'arch-launch',
        BrandKitID: 'kit-default',
        Formats: ['16:9', '9:16'],
        DurationSeconds: 45,
        QueryIDs: ['query-kpi'],
      },
    };

    expect(instance.ActiveConversationId).toBeNull();
    expect(instance.PendingMessage).toBe(expectedMessage);
    expect(instance.StudioAppContext).toEqual(expectedAppContext);

    expect(copilotInstance.ConversationId).toBeNull();
    expect(copilotInstance.PendingMessage).toBe(expectedMessage);
    expect(copilotInstance.AppContext).toEqual(expectedAppContext);
    expect(startConvSpy).toHaveBeenCalledWith(expectedMessage);

    // Resolve the pending promise and verify button re-enables with no StartError
    resolveEmptyStateSend();
    await flushAsync();
    fixture.detectChanges();

    expect(instance.IsStarting).toBe(false);
    expect(instance.CanStartProduction).toBe(true);
    expect(startBtn!.hasAttribute('disabled')).toBe(false);
    expect(instance.StartError).toBeNull();
    expect(query(fixture, '[data-testid="studio-start-error"]')).toBeNull();

    // Restore real StartConversation (where agent is missing / chatArea is not mounted -> returns false) and verify StartError
    startConvSpy.mockRestore();
    startBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAsync();
    fixture.detectChanges();

    expect(instance.StartError).toBe("The copilot isn't ready yet.");
    const startErrorAlert = query(fixture, '[data-testid="studio-start-error"]');
    expect(startErrorAlert).not.toBeNull();
    expect(startErrorAlert!.textContent).toContain("The copilot isn't ready yet.");

    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('escapes LIKE wildcards in SearchSavedQueries and discards out-of-order stale search responses', async () => {
    const { navStub, customProvider, runViewFn } = setupStudioMocks();

    const fixture = renderComponentFixture(VideoStudioStudioResourceComponent, {
      inputs: { Provider: customProvider },
      imports: STUDIO_TEST_IMPORTS,
      providers: [{ provide: NavigationService, useValue: navStub }],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;

    // 1. Verify LIKE wildcard escaping ('50%_off')
    runViewFn.mockClear();
    await instance.SearchSavedQueries('50%_off');
    expect(runViewFn).toHaveBeenCalledTimes(1);
    expect(runViewFn.mock.calls[0][0]).toMatchObject({
      EntityName: 'MJ: Queries',
      ExtraFilter: "Name LIKE '%50\\%\\_off%' ESCAPE '\\'",
    });

    // 2. Verify out-of-order async completion guard
    let resolveFirstSearch!: (value: {
      Success: boolean;
      Results: Array<{ ID: string; Name: string }>;
    }) => void;

    runViewFn.mockImplementation((params: { ExtraFilter?: string }) => {
      if (params.ExtraFilter?.includes('first')) {
        return new Promise((resolve) => {
          resolveFirstSearch = resolve;
        });
      }
      return Promise.resolve({
        Success: true,
        Results: [{ ID: 'q-second', Name: 'Second Query Winner' }],
      });
    });

    const firstPromise = instance.SearchSavedQueries('first');
    const secondPromise = instance.SearchSavedQueries('second');

    await secondPromise;
    expect(instance.AvailableQueries).toEqual([
      { ID: 'q-second', Name: 'Second Query Winner' },
    ]);
    expect(instance.IsSearchingQueries).toBe(false);

    resolveFirstSearch({
      Success: true,
      Results: [{ ID: 'q-first-stale', Name: 'First Query Stale' }],
    });
    await firstPromise;
    await flushAsync();
    fixture.detectChanges();

    expect(instance.AvailableQueries).toEqual([
      { ID: 'q-second', Name: 'Second Query Winner' },
    ]);

    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('registers form-fill client tools that mutate form state without any tool that triggers Start production', async () => {
    const { navStub, customProvider } = setupStudioMocks();

    const fixture = renderComponentFixture(VideoStudioStudioResourceComponent, {
      inputs: { Provider: customProvider },
      imports: STUDIO_TEST_IMPORTS,
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

  it('calls VideoStudioSetupHealthOperation once on load, re-runs on Recheck, and renders an Error row when the operation fails', async () => {
    const { navStub, customProvider, setupHealthSpy } = setupStudioMocks();

    const fixture = renderComponentFixture(VideoStudioStudioResourceComponent, {
      inputs: { Provider: customProvider },
      imports: STUDIO_TEST_IMPORTS,
      providers: [{ provide: NavigationService, useValue: navStub }],
    });

    await flushAsync();
    fixture.detectChanges();

    expect(setupHealthSpy).toHaveBeenCalledTimes(1);
    expect(setupHealthSpy).toHaveBeenCalledWith({}, { provider: customProvider });
    expect(query(fixture, '[data-testid="vs-setup-health-ok-toggle"]')?.textContent).toContain(
      'Setup OK',
    );

    setupHealthSpy.mockResolvedValueOnce({
      Success: false,
      ErrorMessage: 'Not authorized to execute VideoStudio.SetupHealth.',
    });

    const recheckBtn = query(fixture, '[data-testid="vs-setup-health-recheck"]');
    expect(recheckBtn).toBeTruthy();
    recheckBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await flushAsync();
    fixture.detectChanges();

    expect(setupHealthSpy).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.SetupHealthResult?.Healthy).toBe(false);
    const errorRow = query(fixture, '[data-testid="vs-setup-health-row-Render"]');
    expect(errorRow?.textContent).toContain('Not authorized to execute VideoStudio.SetupHealth.');

    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('calls NotifyLoadComplete and renders the start form while VideoStudioSetupHealthOperation.Execute is still pending', async () => {
    const { navStub, customProvider, setupHealthSpy } = setupStudioMocks();
    setupHealthSpy.mockImplementation(() => new Promise(() => {}));
    const notifyLoadCompleteSpy = vi.spyOn(
      VideoStudioStudioResourceComponent.prototype as unknown as { NotifyLoadComplete: () => void },
      'NotifyLoadComplete',
    );

    const fixture = renderComponentFixture(VideoStudioStudioResourceComponent, {
      inputs: { Provider: customProvider },
      imports: STUDIO_TEST_IMPORTS,
      providers: [{ provide: NavigationService, useValue: navStub }],
    });

    await flushAsync();
    fixture.detectChanges();

    expect(notifyLoadCompleteSpy).toHaveBeenCalledTimes(1);
    expect(query(fixture, '[data-testid="studio-start-form"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="vs-setup-health-loading"]')).not.toBeNull();

    fixture.destroy();
    vi.restoreAllMocks();
  });
});

