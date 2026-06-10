/**
 * Unit tests for the pure narration-template helpers used by VoiceSessionService — the DB-driven
 * `{{ progressMessage }}` substitution plus the built-in fallback for deployments that haven't
 * synced the `Voice Co-Agent - Progress Narration` prompt.
 */
import { describe, it, expect } from 'vitest';
import {
  BuildNarrationInstructions,
  DefaultNarrationInstructions
} from '../lib/services/narration-template';

describe('DefaultNarrationInstructions', () => {
  it('embeds the progress message and keeps the first-person rules', () => {
    const out = DefaultNarrationInstructions('Analyzing the request');

    expect(out).toContain('"Analyzing the request"');
    expect(out).toContain('first person');
    expect(out).toContain(`"I'm…"`);
    // The explicit rewrite example + subject ban survive.
    expect(out).toContain("I'm looking at that now");
    expect(out).toContain('must not be the');
    expect(out).toContain('Do not repeat earlier updates');
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

  it('falls back to the built-in wording when the template is null', () => {
    const out = BuildNarrationInstructions(null, 'Analyzing the request');

    expect(out).toBe(DefaultNarrationInstructions('Analyzing the request'));
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
