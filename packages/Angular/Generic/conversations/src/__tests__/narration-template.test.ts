/**
 * Unit tests for the pure narration-template helpers used by RealtimeSessionService — the DB-driven
 * `{{ progressMessage }}` / `{{ priorNarrations }}` / `{{ updateNumber }}` substitution plus the
 * built-in fallback for deployments that haven't synced the
 * `Realtime Co-Agent - Progress Narration` prompt.
 */
import { describe, it, expect } from 'vitest';
import {
  BuildNarrationInstructions,
  DefaultNarrationInstructions
} from '../lib/services/narration-template';

describe('DefaultNarrationInstructions', () => {
  it('embeds the progress digest and keeps the first-person + variation rules', () => {
    const out = DefaultNarrationInstructions('Analyzing the request');

    expect(out).toContain('Analyzing the request');
    expect(out).toContain('FIRST PERSON');
    expect(out).toContain('VARY the');
    expect(out).toContain('must not be the subject');
    expect(out).toContain('Never repeat');
  });

  it('numbers the update and reports no prior narrations on the first update', () => {
    const out = DefaultNarrationInstructions('Fetching', { UpdateNumber: 1 });

    expect(out).toContain('update #1');
    expect(out).toContain('first spoken update');
  });

  it('chains prior spoken narrations so the model can build on them', () => {
    const out = DefaultNarrationInstructions('Fetching', {
      UpdateNumber: 3,
      PriorNarrations: ["I'm pulling that up now", 'Got the first batch']
    });

    expect(out).toContain('update #3');
    expect(out).toContain(`- "I'm pulling that up now"`);
    expect(out).toContain('- "Got the first batch"');
  });
});

describe('BuildNarrationInstructions', () => {
  it('substitutes {{ progressMessage }} (spaced token) everywhere it appears', () => {
    const template = 'Progress: "{{ progressMessage }}". Repeat: {{ progressMessage }}.';
    const out = BuildNarrationInstructions(template, 'Fetching records');

    expect(out).toBe('Progress: "Fetching records". Repeat: Fetching records.');
  });

  it('tolerates the no-spaces {{progressMessage}} variant', () => {
    const out = BuildNarrationInstructions('Now: {{progressMessage}}!', 'Running the query');

    expect(out).toBe('Now: Running the query!');
  });

  it('substitutes a mix of both token variants', () => {
    const out = BuildNarrationInstructions('A {{ progressMessage }} B {{progressMessage}}', 'x');

    expect(out).toBe('A x B x');
  });

  it('substitutes {{ updateNumber }} and {{ priorNarrations }}', () => {
    const template = 'Update #{{ updateNumber }}. Said before:\n{{ priorNarrations }}';
    const out = BuildNarrationInstructions(template, 'x', {
      UpdateNumber: 2,
      PriorNarrations: ['First thing I said']
    });

    expect(out).toBe('Update #2. Said before:\n- "First thing I said"');
  });

  it('renders a friendly "nothing yet" for {{ priorNarrations }} on the first update', () => {
    const out = BuildNarrationInstructions('Prior: {{ priorNarrations }}', 'x');

    expect(out).toContain('first spoken update');
  });

  it('defaults {{ updateNumber }} to 1 when no options are given', () => {
    const out = BuildNarrationInstructions('N={{updateNumber}}', 'x');

    expect(out).toBe('N=1');
  });

  it('falls back to the built-in wording when the template is null', () => {
    const out = BuildNarrationInstructions(null, 'Analyzing the request', { UpdateNumber: 2 });

    expect(out).toBe(DefaultNarrationInstructions('Analyzing the request', { UpdateNumber: 2 }));
  });

  it('falls back to the built-in wording when the template is blank', () => {
    const out = BuildNarrationInstructions('   ', 'Analyzing the request');

    expect(out).toBe(DefaultNarrationInstructions('Analyzing the request'));
  });

  it('returns a template without tokens unchanged (no accidental injection)', () => {
    const out = BuildNarrationInstructions('Say something brief.', 'ignored');

    expect(out).toBe('Say something brief.');
  });
});
