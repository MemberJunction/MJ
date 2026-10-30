import { EMPTY } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { IMetadataProvider, RunView } from '@memberjunction/core';
import { MJVideoArchetypeEntity, VideoStudioEngine } from '@memberjunction/core-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { query, queryAll, renderComponentFixture } from '@memberjunction/ng-test-utils';
import { VSStudioSlideInStateService } from '../services/vs-studio-slide-in-state.service';
import { VideoStudioArchetypesResourceComponent } from './video-studio-archetypes-resource.component';

function createNavigationServiceStub(): {
  QueryParamChanged$: typeof EMPTY;
  SetAgentContext: ReturnType<typeof vi.fn>;
  SetAgentClientTools: ReturnType<typeof vi.fn>;
  OpenEntityRecord: ReturnType<typeof vi.fn>;
} {
  return {
    QueryParamChanged$: EMPTY,
    SetAgentContext: vi.fn(),
    SetAgentClientTools: vi.fn(),
    OpenEntityRecord: vi.fn(),
  };
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe('VideoStudioArchetypesResourceComponent DOM', () => {
  it('renders a single archetypes grid with category and scope filter chips, proportional beat strips, slide-out preview, Make a copy / Edit in vs-archetype-editor, Open record navigation, SuppressChatOverlay agent context, and shared slide-in', async () => {
    const navStub = createNavigationServiceStub();
    const sharedSlideInState = new VSStudioSlideInStateService();
    const currentUser = { ID: 'user-copy-1', Name: 'Producer' };
    const savedEntities: Record<string, unknown>[] = [];
    let shouldSaveSucceed = false;

    const shippedBriefing = {
      ID: 'arch-briefing',
      Name: 'Executive Briefing',
      Description: 'Concise executive update',
      Category: 'Briefing',
      Status: 'Active',
      CompanyID: null,
      Company: null,
      DefaultDurationSeconds: 60,
      MinDurationSeconds: 30,
      MaxDurationSeconds: 90,
      DefaultFormats: '16:9, 9:16',
      DefaultInteractionMode: 'Auto',
      Guidance: 'Open with the headline metric.',
      BeatTemplate: '[{"Key":"hook"}]',
      Pacing: '{"AvgSecondsBetweenChanges":5}',
      BeatTemplateObject: [
        {
          Key: 'hook',
          Label: 'Hook',
          Purpose: 'Attention grabber',
          MinDurationSeconds: 5,
          MaxDurationSeconds: 10,
          DefaultDurationSeconds: 8,
        },
        {
          Key: 'kpi',
          Label: 'KPI Breakdown',
          Purpose: 'Show core metrics',
          MinDurationSeconds: 20,
          MaxDurationSeconds: 40,
          DefaultDurationSeconds: 30,
          RequiresDataBinding: true,
        },
      ],
      PacingObject: {
        AvgSecondsBetweenChanges: 5,
        HoldRules: 'Hold charts for at least 3 seconds.',
      },
    } as unknown as MJVideoArchetypeEntity;

    const companySocial = {
      ID: 'arch-social',
      Name: 'Social Pulse',
      Description: 'Fast social clip',
      Category: 'Social',
      Status: 'Active',
      CompanyID: 'comp-1',
      Company: 'Acme Corp',
      DefaultDurationSeconds: 30,
      MinDurationSeconds: 15,
      MaxDurationSeconds: 45,
      DefaultFormats: '9:16',
      DefaultInteractionMode: 'PresentOnly',
      Guidance: 'Keep cuts rapid.',
      BeatTemplate: '[]',
      Pacing: null,
      BeatTemplateObject: [
        {
          Key: 'intro',
          Label: 'Intro',
          Purpose: 'Quick hook',
          MinDurationSeconds: 4,
          MaxDurationSeconds: 8,
        },
      ],
      PacingObject: null,
    } as unknown as MJVideoArchetypeEntity;

    const engineArchetypes: MJVideoArchetypeEntity[] = [shippedBriefing, companySocial];

    const customProvider = {
      CurrentUser: currentUser,
      GetEntityObject: vi.fn().mockImplementation(async () => {
        const record: Record<string, unknown> = {
          ID: 'arch-copied-1',
          LatestResult: { CompleteMessage: 'Duplicate archetype name for company' },
          Save: vi.fn().mockImplementation(async () => {
            if (shouldSaveSucceed) {
              engineArchetypes.push({
                ...shippedBriefing,
                ID: 'arch-copied-1',
                Name: String(record['Name'] || 'Executive Briefing (Copy)'),
                CompanyID: String(record['CompanyID'] || 'comp-1'),
                Company: 'Acme Corp',
              } as unknown as MJVideoArchetypeEntity);
            }
            return shouldSaveSucceed;
          }),
        };
        savedEntities.push(record);
        return record;
      }),
    } as unknown as IMetadataProvider;

    const engineStub = {
      Config: vi.fn().mockResolvedValue(undefined),
      get Archetypes() {
        return engineArchetypes;
      },
    } as unknown as VideoStudioEngine;

    const getProviderInstanceSpy = vi
      .spyOn(VideoStudioEngine, 'GetProviderInstance')
      .mockReturnValue(engineStub);

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: vi.fn().mockResolvedValue({
        Success: true,
        Results: [{ ID: 'comp-1', Name: 'Acme Corp' }],
      }),
    } as unknown as RunView);

    const notifySpy = vi.spyOn(
      VideoStudioArchetypesResourceComponent.prototype as unknown as {
        NotifyLoadComplete: () => void;
      },
      'NotifyLoadComplete',
    );

    const fixture = renderComponentFixture(VideoStudioArchetypesResourceComponent, {
      inputs: { Provider: customProvider },
      providers: [
        { provide: NavigationService, useValue: navStub },
        { provide: VSStudioSlideInStateService, useValue: sharedSlideInState },
      ],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(getProviderInstanceSpy).toHaveBeenCalledWith(customProvider, VideoStudioEngine);

    // One grid (no stacked category sections) with category meta on each card
    expect(queryAll(fixture, '.vs-archetypes-grid')).toHaveLength(1);
    expect(queryAll(fixture, '[data-testid^="archetype-card-"]')).toHaveLength(2);
    expect(queryAll(fixture, '[data-testid="archetype-category-meta"]').map((el) => el.textContent?.trim())).toEqual([
      'Briefing',
      'Social',
    ]);
    expect(queryAll(fixture, '[data-testid="archetype-beat-timeline"] button.vp-beat-strip__block')).toHaveLength(3);
    expect(query(fixture, '[data-testid="archetype-duration-badge"]')?.textContent).toContain('1:00');
    expect(query(fixture, '[data-testid="archetype-duration-badge"]')?.textContent).toContain('0:30–1:30');

    // Clicking a category filter chip filters the grid; clicking All restores all cards
    const briefingChipBtn = query(
      fixture,
      '[data-testid="archetype-category-chip-Briefing"] button',
    ) as HTMLElement | null;
    expect(briefingChipBtn).not.toBeNull();
    briefingChipBtn!.click();
    fixture.detectChanges();
    expect(instance.CategoryFilter).toBe('Briefing');
    expect(queryAll(fixture, '[data-testid^="archetype-card-"]')).toHaveLength(1);

    const allChipBtn = query(
      fixture,
      '[data-testid="archetype-category-chip-all"] button',
    ) as HTMLElement | null;
    allChipBtn!.click();
    fixture.detectChanges();
    expect(instance.CategoryFilter).toBe('all');
    expect(queryAll(fixture, '[data-testid^="archetype-card-"]')).toHaveLength(2);

    // Clicking a scope filter chip filters to company ("Yours") and toggles back
    const yoursChipBtn = query(
      fixture,
      '[data-testid="archetype-scope-chip-company"] button',
    ) as HTMLElement | null;
    yoursChipBtn!.click();
    fixture.detectChanges();
    expect(instance.ScopeFilter).toBe('company');
    expect(queryAll(fixture, '[data-testid^="archetype-card-"]')).toHaveLength(1);
    yoursChipBtn!.click();
    fixture.detectChanges();
    expect(instance.ScopeFilter).toBe('all');
    expect(queryAll(fixture, '[data-testid^="archetype-card-"]')).toHaveLength(2);

    // Agent client tools & context
    expect(navStub.SetAgentClientTools).toHaveBeenCalledTimes(1);
    const registeredTools = navStub.SetAgentClientTools.mock.calls.at(-1)?.[1] as Array<{ Name: string }>;
    const toolNames = registeredTools.map((t) => t.Name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'SearchArchetypes',
        'FilterArchetypes',
        'ClearArchetypeFilters',
        'SelectArchetype',
        'OpenArchetype',
        'RefreshArchetypes',
        'SelectStudioArchetype',
        'SelectStudioBrandKit',
        'SetStudioFormats',
        'SetStudioTopic',
      ]),
    );
    expect(navStub.SetAgentContext).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({
        Surface: 'VideoStudioArchetypes',
        SuppressChatOverlay: true,
        TotalArchetypeCount: 2,
        FilteredArchetypeCount: 2,
        ShippedArchetypeCount: 1,
        CompanyArchetypeCount: 1,
      }),
    );

    // Shared slide-in sits beside mj-page-layout inside .vs-resource-shell; edge strip opens it
    expect(query(fixture, '.vs-resource-shell > vs-studio-slide-in')).not.toBeNull();
    expect(sharedSlideInState.IsOpen).toBe(false);
    const stripBtn = query(fixture, '[data-testid="productions-copilot-strip"]') as HTMLElement | null;
    expect(stripBtn).not.toBeNull();
    stripBtn!.click();
    fixture.detectChanges();
    expect(sharedSlideInState.IsOpen).toBe(true);
    expect(query(fixture, '[data-testid="productions-copilot-slidein"]')).not.toBeNull();

    // Click shipped archetype card to open slide-out preview (read-only + Make a copy button)
    const shippedCard = query(fixture, '[data-testid="archetype-card-arch-briefing"]') as HTMLElement | null;
    shippedCard!.click();
    fixture.detectChanges();

    const slideout = query(fixture, '[data-testid="archetype-slideout"]');
    expect(slideout).not.toBeNull();
    const slideoutBeats = queryAll(fixture, '[data-testid="slideout-beat-item"]');
    expect(slideoutBeats).toHaveLength(2);
    expect(slideoutBeats[0].textContent).toContain('0:13');
    expect(slideoutBeats[0].textContent).toContain('0:05–0:10');
    expect(query(fixture, '[data-testid="slideout-pacing-section"]')?.textContent).toContain('0:05');
    expect(query(fixture, '[data-testid="slideout-guidance-section"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="archetype-shipped-readonly-banner"]')).not.toBeNull();

    // Shipped archetype shows "Make a copy" button and opens vs-archetype-editor
    const makeCopyBtn = query(fixture, '[data-testid="archetype-make-copy-button"]') as HTMLElement | null;
    expect(makeCopyBtn).not.toBeNull();
    makeCopyBtn!.click();
    await flushAsync();
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="vs-archetype-editor"]')).not.toBeNull();

    // Save inside vs-archetype-editor fails first -> surfaces LatestResult.CompleteMessage
    const saveBtn = query(fixture, '[data-testid="vs-arch-editor-save"]') as HTMLElement | null;
    saveBtn!.click();
    await flushAsync();
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="vs-arch-editor-error"]')?.textContent).toContain(
      'Duplicate archetype name for company',
    );

    // Second Save succeeds -> closes dialog, reloads archetypes, and selects the new archetype
    shouldSaveSucceed = true;
    saveBtn!.click();
    await flushAsync();
    await flushAsync();
    fixture.detectChanges();
    expect(instance.IsEditorOpen).toBe(false);
    expect(instance.SelectedArchetype?.ID).toBe('arch-copied-1');

    // Click company archetype card — shows Edit (opens vs-archetype-editor) and Open record (opens entity record)
    const companyCard = query(fixture, '[data-testid="archetype-card-arch-social"]') as HTMLElement | null;
    companyCard!.click();
    fixture.detectChanges();

    const editBtn = query(fixture, '[data-testid="archetype-edit-button"]') as HTMLElement | null;
    expect(editBtn).not.toBeNull();
    editBtn!.click();
    await flushAsync();
    fixture.detectChanges();
    expect(instance.IsEditorOpen).toBe(true);
    expect(instance.EditorMode).toBe('edit');
    expect(instance.EditorEditingArchetypeId).toBe('arch-social');
    instance.CloseArchetypeEditor();
    fixture.detectChanges();

    const openRecordBtn = query(fixture, '[data-testid="archetype-open-record-button"]') as HTMLElement | null;
    expect(openRecordBtn).not.toBeNull();
    openRecordBtn!.click();
    expect(navStub.OpenEntityRecord).toHaveBeenCalledWith(
      'MJ: Video Archetypes',
      expect.anything(),
    );

    // Filter narrows grid and renders empty state when no archetypes match
    instance.OnSearchChange('nonexistent-archetype-xyz');
    fixture.detectChanges();
    expect(instance.FilteredArchetypes).toHaveLength(0);
    expect(query(fixture, '[data-testid="archetypes-empty"]')).not.toBeNull();

    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('surfaces company load failures inside vs-archetype-editor when MJ: Companies view fails, and preserves open slide-in state across pages', async () => {
    const navStub = createNavigationServiceStub();
    const sharedSlideInState = new VSStudioSlideInStateService();
    sharedSlideInState.OpenIterate('conv-persisted-88', 'art-88', 1);

    vi.spyOn(VideoStudioEngine, 'GetProviderInstance').mockReturnValue({
      Config: vi.fn().mockResolvedValue(undefined),
      Archetypes: [
        {
          ID: 'arch-briefing',
          Name: 'Executive Briefing',
          Category: 'Briefing',
          Status: 'Active',
          CompanyID: null,
          BeatTemplateObject: [],
        } as unknown as MJVideoArchetypeEntity,
      ],
    } as unknown as VideoStudioEngine);

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: vi.fn().mockResolvedValue({
        Success: false,
        ErrorMessage: 'Companies view unavailable',
        Results: [],
      }),
    } as unknown as RunView);

    const fixture = renderComponentFixture(VideoStudioArchetypesResourceComponent, {
      providers: [
        { provide: NavigationService, useValue: navStub },
        { provide: VSStudioSlideInStateService, useValue: sharedSlideInState },
      ],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    // Open slide-in and ConversationId from previous page survive mounting Archetypes
    expect(sharedSlideInState.IsOpen).toBe(true);
    expect(sharedSlideInState.ConversationId).toBe('conv-persisted-88');
    expect(query(fixture, '[data-testid="productions-copilot-slidein"]')).not.toBeNull();

    instance.OpenCopyArchetypeEditor(instance.AllArchetypes[0]);
    fixture.detectChanges();
    await flushAsync();
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="vs-arch-editor-error"]')?.textContent).toContain(
      "Couldn't load companies: Companies view unavailable",
    );

    fixture.destroy();
    vi.restoreAllMocks();
  });
});
