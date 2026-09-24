import { describe, it, expect } from 'vitest';
import { ResolveTranscriptToggleVisible, ResolveTranscriptVisible } from '../lib/media-player/transcript-layout';

describe('resolveTranscriptVisible', () => {
  it('is visible only when transcript exists, ShowTranscript is on, and user has it visible', () => {
    expect(ResolveTranscriptVisible(true, true, true)).toBe(true);
  });

  it('is hidden when there is no transcript, regardless of the other flags', () => {
    expect(ResolveTranscriptVisible(false, true, true)).toBe(false);
  });

  it('is hidden when the ShowTranscript master switch is off', () => {
    expect(ResolveTranscriptVisible(true, false, true)).toBe(false);
  });

  it('is hidden when the user toggled it off', () => {
    expect(ResolveTranscriptVisible(true, true, false)).toBe(false);
  });
});

describe('resolveTranscriptToggleVisible', () => {
  it('renders only when a transcript exists, ShowTranscript is on, and the toggle is enabled', () => {
    expect(ResolveTranscriptToggleVisible(true, true, true)).toBe(true);
  });

  it('does not render when there is no transcript to toggle', () => {
    expect(ResolveTranscriptToggleVisible(false, true, true)).toBe(false);
  });

  it('does not render when ShowTranscript is off', () => {
    expect(ResolveTranscriptToggleVisible(true, false, true)).toBe(false);
  });

  it('does not render when the consumer disabled ShowTranscriptToggle', () => {
    expect(ResolveTranscriptToggleVisible(true, true, false)).toBe(false);
  });

  it('is independent of the runtime visibility state (button shows whether shown or hidden)', () => {
    // Toggle button visibility does not depend on the user-visible flag — it stays present
    // so the user can re-show a hidden transcript.
    expect(ResolveTranscriptToggleVisible(true, true, true)).toBe(true);
  });
});
