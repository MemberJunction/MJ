import { describe, it, expect } from 'vitest';
import {
  PS_CAPABILITY_CARDS,
  buildImprovePrompt,
} from '../PredictiveStudio/predictive-studio-copilot.view-models';

describe('capability cards', () => {
  it('introduces the four core capabilities, each with icon/title/blurb', () => {
    expect(PS_CAPABILITY_CARDS).toHaveLength(4);
    for (const c of PS_CAPABILITY_CARDS) {
      expect(c.icon).toMatch(/^fa-/);
      expect(c.title.trim().length).toBeGreaterThan(0);
      expect(c.blurb.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('buildImprovePrompt', () => {
  it('names the prediction, its grade, and why it is held, and asks for improvements', () => {
    const p = buildImprovePrompt({ name: 'Renewal Risk', trustGrade: 'Poor', reason: 'not enough training history' });
    expect(p).toContain('"Renewal Risk"');
    expect(p).toContain('current trust: Poor');
    expect(p).toContain('not enough training history.');
    expect(p).toContain('what would make it reliable');
  });

  it('degrades gracefully when grade/reason are missing', () => {
    const p = buildImprovePrompt({ name: 'Lapse Score' });
    expect(p).toContain('"Lapse Score"');
    expect(p).not.toContain('current trust');
    expect(p).not.toContain('held back because');
  });

  it('falls back to a generic subject when the name is blank', () => {
    expect(buildImprovePrompt({ name: '' })).toContain('"this prediction"');
  });
});
