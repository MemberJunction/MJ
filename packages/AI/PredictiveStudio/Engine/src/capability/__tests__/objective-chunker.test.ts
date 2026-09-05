import { describe, it, expect } from 'vitest';
import { chunkObjectives } from '../objective-chunker';

/**
 * The chunker is deterministic on purpose: a diagnosis a client acts on must not produce a
 * different set of gaps each time it is opened. These pin the rules a person could check by reading
 * their own document.
 */
describe('chunkObjectives', () => {
  it('treats bullets as objectives and headings as their section', () => {
    const objectives = chunkObjectives(`
# Membership Growth

- Grow paid membership by 10% over the next two years
- Reduce first-year lapse among new professional members

## Engagement

* Increase the share of members attending at least one event annually
`);

    expect(objectives).toHaveLength(3);
    expect(objectives[0].Section).toBe('Membership Growth');
    expect(objectives[0].Text).toBe('Grow paid membership by 10% over the next two years');
    expect(objectives[2].Section).toBe('Engagement');
    // The heading itself is a topic, not something anyone can be measured against.
    expect(objectives.map((o) => o.Text)).not.toContain('Engagement');
  });

  it('splits a paragraph into sentences, because two goals in one sentence hide one of them', () => {
    const objectives = chunkObjectives(
      'We will grow membership by ten percent this year. We will also improve retention among first-year members.',
    );

    expect(objectives).toHaveLength(2);
    expect(objectives[1].Text).toContain('retention among first-year members');
  });

  it('does not split on an abbreviation mid-sentence', () => {
    const objectives = chunkObjectives(
      'We will target lapsed members, e.g. those who did not renew last cycle, with a reactivation campaign.',
    );

    expect(objectives).toHaveLength(1);
  });

  it('drops fragments too short to mean anything', () => {
    const objectives = chunkObjectives(`
Goals
- Q3
- Grow paid membership by 10% over the next two years
`);

    // "Q3" would embed close to everything and close to nothing.
    expect(objectives.map((o) => o.Text)).toEqual(['Grow paid membership by 10% over the next two years']);
  });

  it('handles numbered and lettered lists', () => {
    const objectives = chunkObjectives(`
1. Grow paid membership by ten percent over two years
2) Reduce first-year lapse among professional members
a. Increase event attendance across all chapters
`);

    expect(objectives).toHaveLength(3);
    expect(objectives[0].Text).toBe('Grow paid membership by ten percent over two years');
    expect(objectives[2].Text).toBe('Increase event attendance across all chapters');
  });

  it('caps the number of objectives so a long plan cannot become a thousand embedding calls', () => {
    const many = Array.from({ length: 200 }, (_, i) => `- Objective number ${i} about growing membership steadily`).join('\n');

    expect(chunkObjectives(many)).toHaveLength(60);
    expect(chunkObjectives(many, 5)).toHaveLength(5);
  });

  it('keeps a long objective rather than dropping it, marking the truncation', () => {
    const long = `- ${'we will improve member engagement across every chapter and program '.repeat(20)}`;
    const objectives = chunkObjectives(long);

    expect(objectives).toHaveLength(1);
    expect(objectives[0].Text.endsWith('…')).toBe(true);
  });

  it('returns nothing for text with no real objectives', () => {
    expect(chunkObjectives('')).toEqual([]);
    expect(chunkObjectives('Overview\nGoals\nSummary')).toEqual([]);
  });

  it('preserves document order in Index', () => {
    const objectives = chunkObjectives(`
- Grow paid membership by 10% over the next two years
- Reduce first-year lapse among new professional members
`);

    expect(objectives.map((o) => o.Index)).toEqual([0, 1]);
  });
});
