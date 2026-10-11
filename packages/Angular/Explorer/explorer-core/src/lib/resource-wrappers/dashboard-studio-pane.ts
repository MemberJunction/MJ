/**
 * The width of the AI pane in the dashboard tab: the user setting that stores it, and the reads that turn
 * the setting and angular-split's sizes into widths the tab can use.
 */

/** The UserInfoEngine setting that stores the AI pane width. */
export const STUDIO_PANE_SETTING_KEY = 'mj.dashboards.studio.layout';

/** The smallest width of the AI pane, in percent of the tab's width. */
export const STUDIO_PANE_COPILOT_MIN_PCT = 20;

/** The largest width of the AI pane, in percent of the tab's width. */
export const STUDIO_PANE_COPILOT_MAX_PCT = 60;

/** The widths of the dashboard and the AI pane, in percent of the tab's width. They add up to 100. */
export interface StudioPanePrefs {
  /** The dashboard's width. */
  MainSizePct: number;
  /** The AI pane's width, a whole number from STUDIO_PANE_COPILOT_MIN_PCT to STUDIO_PANE_COPILOT_MAX_PCT. */
  CopilotSizePct: number;
}

/** The widths the AI pane opens with when no width is saved. */
export const STUDIO_PANE_DEFAULTS: Readonly<StudioPanePrefs> = { MainSizePct: 68, CopilotSizePct: 32 };

/**
 * The widths in the saved setting, or the defaults when the setting is missing or holds no number for the
 * AI pane. The AI pane width is rounded and kept in its bounds; the dashboard gets the rest.
 */
export function ParseStudioPanePrefs(raw: string | null | undefined): StudioPanePrefs {
  const copilotSize = savedCopilotSize(raw);
  return copilotSize === null ? { ...STUDIO_PANE_DEFAULTS } : prefsForCopilotSize(copilotSize);
}

/**
 * The widths from the sizes of an angular-split dragEnd event, read as the AI pane width ParseStudioPanePrefs
 * would give, or null unless the event holds exactly two finite numbers.
 */
export function PrefsFromSplitSizes(sizes: readonly (number | '*')[]): StudioPanePrefs | null {
  if (sizes.length !== 2) return null;
  const [mainSize, copilotSize] = sizes;
  if (!isFiniteNumber(mainSize) || !isFiniteNumber(copilotSize)) return null;
  return prefsForCopilotSize(copilotSize);
}

/** The AI pane width in the saved setting, or null when the setting is not JSON with a finite CopilotSizePct. */
function savedCopilotSize(raw: string | null | undefined): number | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || !('CopilotSizePct' in parsed)) return null;
    return isFiniteNumber(parsed.CopilotSizePct) ? parsed.CopilotSizePct : null;
  } catch {
    return null;
  }
}

/** The widths for an AI pane width, rounded and kept in its bounds, with the rest for the dashboard. */
function prefsForCopilotSize(copilotSize: number): StudioPanePrefs {
  const copilot = Math.max(STUDIO_PANE_COPILOT_MIN_PCT, Math.min(STUDIO_PANE_COPILOT_MAX_PCT, Math.round(copilotSize)));
  return { MainSizePct: 100 - copilot, CopilotSizePct: copilot };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
