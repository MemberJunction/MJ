import { describe, it, expect } from 'vitest';
import {
  BuildTourNotFoundError,
  BuildTourStudioAgentContext,
  IsValidTourStudioTab,
  ResolveTourByIdOrKeyOrName,
  ResolveTourStudioTab,
  TOUR_STUDIO_TABS,
  type TourCandidate,
} from '../TourStudio/tour-studio-agent-context';
import { AGENT_CONTEXT_NAME_LIST_CAP } from '../shared/agent-tool-validation';

const SAMPLE_TOURS: TourCandidate[] = [
  { ID: '11111111-1111-1111-1111-111111111111', TourKey: 'core.welcome', Name: 'Welcome to MemberJunction', Status: 'Active' },
  { ID: '22222222-2222-2222-2222-222222222222', TourKey: 'crm.first-deal', Name: 'Create Your First Deal', Status: 'Draft' },
  { ID: '33333333-3333-3333-3333-333333333333', TourKey: 'legacy.intro', Name: 'Legacy Intro', Status: 'Retired' },
];

describe('tour-studio-agent-context', () => {
  it('validates and resolves tab keys and labels', () => {
    for (const tab of TOUR_STUDIO_TABS) {
      expect(IsValidTourStudioTab(tab)).toBe(true);
    }
    expect(IsValidTourStudioTab('unknown')).toBe(false);
    expect(ResolveTourStudioTab('builder')).toBe('builder');
    expect(ResolveTourStudioTab('Learning Paths & Overrides')).toBe('governance');
    expect(ResolveTourStudioTab('holdouts')).toBe('analytics');
    expect(ResolveTourStudioTab('nonexistent-tab')).toBeNull();
  });

  it('resolves tours by ID, TourKey, exact Name, or partial Name/Key', () => {
    expect(ResolveTourByIdOrKeyOrName('11111111-1111-1111-1111-111111111111', SAMPLE_TOURS)?.TourKey).toBe('core.welcome');
    expect(ResolveTourByIdOrKeyOrName('CRM.FIRST-DEAL', SAMPLE_TOURS)?.ID).toBe('22222222-2222-2222-2222-222222222222');
    expect(ResolveTourByIdOrKeyOrName('Legacy Intro', SAMPLE_TOURS)?.TourKey).toBe('legacy.intro');
    expect(ResolveTourByIdOrKeyOrName('first deal', [])).toBeNull();
    expect(ResolveTourByIdOrKeyOrName('First Deal', SAMPLE_TOURS)?.TourKey).toBe('crm.first-deal');
    expect(ResolveTourByIdOrKeyOrName('missing', SAMPLE_TOURS)).toBeNull();
  });

  it('builds informative not-found messages capped at 25 entries', () => {
    const many: TourCandidate[] = Array.from({ length: 30 }, (_, i) => ({
      ID: `id-${i}`,
      TourKey: `key.${i}`,
      Name: `Tour ${i}`,
      Status: 'Active',
    }));
    const msg = BuildTourNotFoundError('bogus', many);
    expect(msg).toContain('No tour matching "bogus"');
    expect(msg).toContain('(+5 more)');
  });

  it('bounds VisibleTourNames at AGENT_CONTEXT_LIST_CAP with companion VisibleTourCount', () => {
    const names = Array.from({ length: 32 }, (_, i) => `Tour ${i}`);
    const ctx = BuildTourStudioAgentContext({
      ActiveTab: 'catalog',
      TotalTourCount: 32,
      FilteredTourCount: 32,
      DraftCount: 10,
      ActiveCount: 20,
      RetiredCount: 2,
      SearchQuery: '',
      StatusFilter: '',
      ApplicationFilter: '',
      GuideModeFilter: '',
      SurfaceFilter: '',
      VisibleTourNames: names,
      SelectedTour: SAMPLE_TOURS[0],
      SelectedTourStepCount: 4,
      SelectedTourCapabilityWarningCount: 1,
      SelectedStepKey: 'welcome-step',
      SelectedStepTitle: 'Welcome',
      GraphValid: true,
      GraphHasCycle: false,
      LearningPathCount: 2,
      OverrideCount: 3,
      TotalRunCount: 40,
      IsLoading: false,
    });

    const published = ctx['VisibleTourNames'] as string[];
    expect(published.length).toBe(AGENT_CONTEXT_NAME_LIST_CAP);
    expect(ctx['VisibleTourCount']).toBe(32);
    expect(ctx['SelectedTourKey']).toBe('core.welcome');
    expect(ctx['SelectedTourCapabilityWarningCount']).toBe(1);
    expect(ctx['GraphValid']).toBe(true);
    expect(ctx['SearchQuery']).toBeUndefined();
  });
});
