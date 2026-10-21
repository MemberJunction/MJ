import { describe, it, expect } from 'vitest';
import {
  ParseStudioPanePrefs,
  PrefsFromSplitSizes,
  STUDIO_PANE_COPILOT_MAX_PCT,
  STUDIO_PANE_COPILOT_MIN_PCT,
  STUDIO_PANE_DEFAULTS,
  STUDIO_PANE_SETTING_KEY,
} from './dashboard-studio-pane';

describe('STUDIO_PANE_DEFAULTS', () => {
  it('gives the dashboard 68 percent and the AI pane 32 percent, inside the AI pane bounds', () => {
    expect(STUDIO_PANE_DEFAULTS).toEqual({ MainSizePct: 68, CopilotSizePct: 32 });
    expect(STUDIO_PANE_COPILOT_MIN_PCT).toBe(20);
    expect(STUDIO_PANE_COPILOT_MAX_PCT).toBe(60);
    expect(STUDIO_PANE_SETTING_KEY).toBe('mj.dashboards.studio.layout');
  });
});

describe('ParseStudioPanePrefs', () => {
  it.each([null, undefined, '', '{bad', 'null', '42', '"text"', '[]', '{}', '{"CopilotSizePct":"40"}', '{"CopilotSizePct":null}', '{"CopilotSizePct":1e999}'])(
    'gives the defaults for the missing or unusable setting %j',
    (raw) => {
      expect(ParseStudioPanePrefs(raw)).toEqual({ MainSizePct: 68, CopilotSizePct: 32 });
    },
  );

  it('gives a new object each time, so a caller cannot change the defaults', () => {
    const prefs = ParseStudioPanePrefs(null);
    prefs.CopilotSizePct = 50;

    expect(ParseStudioPanePrefs(null)).toEqual({ MainSizePct: 68, CopilotSizePct: 32 });
    expect(STUDIO_PANE_DEFAULTS).toEqual({ MainSizePct: 68, CopilotSizePct: 32 });
  });

  it('reads the AI pane width and gives the dashboard the rest', () => {
    expect(ParseStudioPanePrefs(JSON.stringify({ CopilotSizePct: 40 }))).toEqual({ MainSizePct: 60, CopilotSizePct: 40 });
  });

  it('ignores a saved dashboard width that does not add up with the AI pane width', () => {
    expect(ParseStudioPanePrefs(JSON.stringify({ MainSizePct: 90, CopilotSizePct: 40 }))).toEqual({ MainSizePct: 60, CopilotSizePct: 40 });
  });

  it('keeps the AI pane width between 20 and 60 percent', () => {
    expect(ParseStudioPanePrefs(JSON.stringify({ CopilotSizePct: 90 }))).toEqual({ MainSizePct: 40, CopilotSizePct: 60 });
    expect(ParseStudioPanePrefs(JSON.stringify({ CopilotSizePct: 5 }))).toEqual({ MainSizePct: 80, CopilotSizePct: 20 });
    expect(ParseStudioPanePrefs(JSON.stringify({ CopilotSizePct: -10 }))).toEqual({ MainSizePct: 80, CopilotSizePct: 20 });
  });

  it('rounds the AI pane width to a whole percent', () => {
    expect(ParseStudioPanePrefs(JSON.stringify({ CopilotSizePct: 33.6 }))).toEqual({ MainSizePct: 66, CopilotSizePct: 34 });
  });
});

describe('PrefsFromSplitSizes', () => {
  it('rounds two numeric sizes', () => {
    expect(PrefsFromSplitSizes([65.4, 34.6])).toEqual({ MainSizePct: 65, CopilotSizePct: 35 });
  });

  it('keeps the two widths at 100 percent in total when both sizes end in .5', () => {
    expect(PrefsFromSplitSizes([65.5, 34.5])).toEqual({ MainSizePct: 65, CopilotSizePct: 35 });
  });

  it('keeps the AI pane width between 20 and 60 percent', () => {
    expect(PrefsFromSplitSizes([30, 70])).toEqual({ MainSizePct: 40, CopilotSizePct: 60 });
    expect(PrefsFromSplitSizes([90, 10])).toEqual({ MainSizePct: 80, CopilotSizePct: 20 });
  });

  it.each([[[]], [[100]], [['*', 30]], [[70, '*']], [[50, 30, 20]], [[Number.NaN, 30]], [[70, Number.POSITIVE_INFINITY]]] as const)(
    'is null for the sizes %j',
    (sizes) => {
      expect(PrefsFromSplitSizes(sizes)).toBeNull();
    },
  );

  it('gives sizes that ParseStudioPanePrefs reads back unchanged', () => {
    const prefs = PrefsFromSplitSizes([58.2, 41.8]);

    expect(ParseStudioPanePrefs(JSON.stringify(prefs))).toEqual(prefs);
  });
});
