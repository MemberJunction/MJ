import { describe, it, expect } from 'vitest';
import { PreflightEnv } from '../pipeline/Preflight';
import { DEFAULT_SETTINGS } from '../settings';
import { FULL_ENV } from './helpers/pipelineFixtures';

describe('PreflightEnv', () => {
  it('refuses inside a Claude Code session', () => {
    expect(() => PreflightEnv(DEFAULT_SETTINGS, { ...FULL_ENV, CLAUDECODE: '1' }, 'Generate')).toThrow(/Claude Code/);
  });
  it('names the missing variable and never its value', () => {
    const env = { ...FULL_ENV, OPENAI_API_KEY: undefined };
    expect(() => PreflightEnv(DEFAULT_SETTINGS, env, 'Assess')).toThrow(/OPENAI_API_KEY/);
    expect(() => PreflightEnv(DEFAULT_SETTINGS, { ...FULL_ENV, ANTHROPIC_API_KEY: '' }, 'Generate')).toThrow(/ANTHROPIC_API_KEY/);
    try { PreflightEnv(DEFAULT_SETTINGS, { ...FULL_ENV, GEMINI_API_KEY: undefined }, 'Assess'); } catch (e) {
      expect((e as Error).message).toMatch(/GEMINI_API_KEY/); expect((e as Error).message).not.toContain(FULL_ENV.ANTHROPIC_API_KEY);
    }
  });
  it('needs the Gemini key for Generate when the generator model is a Gemini model', () => {
    const settings = { ...DEFAULT_SETTINGS, GeneratorModel: 'gemini-3.8-flash' };
    const env = { ...FULL_ENV }; delete env.GEMINI_API_KEY;
    expect(() => PreflightEnv(settings, env, 'Generate')).toThrow('missing environment variable: GEMINI_API_KEY');
    expect(() => PreflightEnv(DEFAULT_SETTINGS, env, 'Generate')).not.toThrow();
  });

  it('passes with every key present', () => {
    expect(() => PreflightEnv(DEFAULT_SETTINGS, FULL_ENV, 'Assess')).not.toThrow();
    expect(() => PreflightEnv(DEFAULT_SETTINGS, { ANTHROPIC_API_KEY: FULL_ENV.ANTHROPIC_API_KEY }, 'Generate')).not.toThrow();
  });
});
