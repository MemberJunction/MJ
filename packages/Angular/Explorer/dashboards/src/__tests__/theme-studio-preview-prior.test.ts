/**
 * Theme Studio "Preview on my workspace": the overlay recorded to return to when the preview
 * ends must never be the preview's own id (#6030). Otherwise, after a failed brand bootstrap
 * left the draft painted, a second toggle recorded the draft as the prior overlay and ending
 * that preview persisted the unsaved draft to localStorage.
 */
import { describe, expect, it } from 'vitest';
import { PriorOverlayForPreview, WORKSPACE_PREVIEW_ID } from '../ThemeStudio/theme-studio.constants';

describe('PriorOverlayForPreview', () => {
  it('records the overlay in place when the preview starts', () => {
    expect(PriorOverlayForPreview('acme', null)).toBe('acme');
    expect(PriorOverlayForPreview(null, null)).toBeNull();
  });

  it('keeps the prior already recorded while the draft is still painted', () => {
    expect(PriorOverlayForPreview(WORKSPACE_PREVIEW_ID, 'acme')).toBe('acme');
  });

  it('never returns the preview id, even with no prior recorded', () => {
    expect(PriorOverlayForPreview(WORKSPACE_PREVIEW_ID, null)).toBeNull();
  });
});
