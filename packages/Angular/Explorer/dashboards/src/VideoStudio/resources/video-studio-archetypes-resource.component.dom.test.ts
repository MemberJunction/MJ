import { EMPTY } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RunView } from '@memberjunction/core';
import { VideoStudioEngine } from '@memberjunction/core-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { query, queryAll, renderComponentFixture } from '@memberjunction/ng-test-utils';
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
  it('groups archetypes by category, renders proportional beat timeline blocks, opens slide-out preview, supports Clone for shipped archetypes and Edit Record for company archetypes, calls NotifyLoadComplete once, and publishes agent context', async () => {
    const navStub = createNavigationServiceStub();

    vi.spyOn(VideoStudioEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(VideoStudioEngine.Instance, 'Archetypes', 'get').mockReturnValue([
      {
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
        BeatTemplate: '[]',
        Pacing: '{}',
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
      } as never,
      {
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
      } as never,
    ]);

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: vi.fn().mockResolvedValue({
        Success: true,
        Results: [{ ID: 'comp-1', Name: 'Acme Corp' }],
      }),
    } as never);

    const notifySpy = vi.spyOn(
      VideoStudioArchetypesResourceComponent.prototype as unknown as {
        NotifyLoadComplete: () => void;
      },
      'NotifyLoadComplete',
    );

    const fixture = renderComponentFixture(VideoStudioArchetypesResourceComponent, {
      providers: [{ provide: NavigationService, useValue: navStub }],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(instance.CategoryGroups).toHaveLength(2);
    expect(queryAll(fixture, '[data-testid^="archetype-card-"]')).toHaveLength(2);
    expect(queryAll(fixture, '[data-testid="archetype-beat-block"]')).toHaveLength(3);
    expect(navStub.SetAgentClientTools).toHaveBeenCalledTimes(1);
    expect(navStub.SetAgentContext).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({
        Surface: 'VideoStudioArchetypes',
        TotalArchetypeCount: 2,
        FilteredArchetypeCount: 2,
        ShippedArchetypeCount: 1,
        CompanyArchetypeCount: 1,
      }),
    );

    // Click shipped archetype card to open slide-out preview (read-only + Clone button)
    const shippedCard = query(fixture, '[data-testid="archetype-card-arch-briefing"]') as HTMLElement | null;
    shippedCard!.click();
    fixture.detectChanges();

    const slideout = query(fixture, '[data-testid="archetype-slideout"]');
    expect(slideout).not.toBeNull();
    expect(queryAll(fixture, '[data-testid="slideout-beat-item"]')).toHaveLength(2);
    expect(query(fixture, '[data-testid="slideout-pacing-section"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="slideout-guidance-section"]')).not.toBeNull();
    expect(query(fixture, '[data-testid="archetype-shipped-readonly-banner"]')).not.toBeNull();

    // Shipped archetype shows Clone button and opens Clone dialog
    const cloneBtn = query(fixture, '[data-testid="archetype-clone-button"]') as HTMLElement | null;
    expect(cloneBtn).not.toBeNull();
    cloneBtn!.click();
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="archetype-clone-dialog"]')).not.toBeNull();

    // Cancel Clone dialog
    instance.CancelCloneDialog();
    fixture.detectChanges();
    expect(query(fixture, '[data-testid="archetype-clone-dialog"]')).toBeNull();

    // Click company archetype card — shows Edit Record button and navigates to entity record
    const companyCard = query(fixture, '[data-testid="archetype-card-arch-social"]') as HTMLElement | null;
    companyCard!.click();
    fixture.detectChanges();

    const editBtn = query(fixture, '[data-testid="archetype-edit-record-button"]') as HTMLElement | null;
    expect(editBtn).not.toBeNull();
    editBtn!.click();
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
});
