import type { Settings } from '../settings';
import type { Vendor } from '../types';
import { VENDOR_KEY_ENV } from '../judges/ProviderFactory';

/** The pipeline step a preflight check runs for. `Assess` also needs the judge vendors' keys. */
export type PreflightStep = 'Generate' | 'Assess';

/**
 * Checks the environment before a step spends anything. Throws when the process runs inside a Claude Code session
 * (the agent's login would replace the key) or when a key the step needs is not set: `ANTHROPIC_API_KEY` always,
 * for `Generate` the generator model's vendor key, and for `Assess` the TP Prob vendor's key (OpenAI) and the key of
 * every bucket judge vendor.
 * The message names the variables only, never a value.
 */
export function PreflightEnv(settings: Settings, env: NodeJS.ProcessEnv = process.env, step: PreflightStep = 'Assess'): void {
    if (env.CLAUDECODE) throw new Error('refusing to run inside a Claude Code session (CLAUDECODE is set): run the JiT pipeline from a plain shell');
    const missing = requiredKeys(settings, step).filter((name) => !env[name]);
    if (missing.length > 0) throw new Error(`missing environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
}

/** The key variables a step needs, without duplicates, in a fixed order. */
function requiredKeys(settings: Settings, step: PreflightStep): string[] {
    const vendors: Vendor[] = ['Anthropic'];
    if (step === 'Generate') vendors.push(GeneratorVendor(settings.GeneratorModel));
    if (step === 'Assess') vendors.push('OpenAI', ...settings.Judges.BucketModels.map((b) => b.Vendor));
    return [...new Set(vendors.map((v) => VENDOR_KEY_ENV[v]))];
}

/** The vendor that serves a generator model: Gemini for `gemini-*` names, Anthropic for every other. */
export function GeneratorVendor(model: string): Vendor { return /^gemini-/i.test(model) ? 'Gemini' : 'Anthropic'; }
