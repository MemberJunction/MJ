/**
 * `BuildGitHubOptions` records where the default token came from, so a "cannot read this
 * repository" message can name the token actually used (#4520): a config token silently beats
 * GITHUB_TOKEN, and a reader who just exported a fresh one would otherwise assume it was used.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { BuildGitHubOptions } from '../utils/open-app-context.js';

describe('BuildGitHubOptions token source', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('marks a config token as Config, even when GITHUB_TOKEN is also set', () => {
        vi.stubEnv('GITHUB_TOKEN', 'ghp_env');
        const options = BuildGitHubOptions({ openApps: { github: { token: 'ghp_config' } } });
        expect(options.Token).toBe('ghp_config');
        expect(options.TokenSource).toBe('Config');
    });

    it('marks GITHUB_TOKEN as Environment when no config token is set', () => {
        vi.stubEnv('GITHUB_TOKEN', 'ghp_env');
        const options = BuildGitHubOptions({});
        expect(options.Token).toBe('ghp_env');
        expect(options.TokenSource).toBe('Environment');
    });

    it('leaves the source unset when there is no default token', () => {
        vi.stubEnv('GITHUB_TOKEN', undefined);
        const options = BuildGitHubOptions({ openApps: { github: { tokens: { 'https://github.com/Acme/App': 'ghp_map' } } } });
        expect(options.Token).toBeUndefined();
        expect(options.TokenSource).toBeUndefined();
        expect(options.TokenMap).toEqual({ 'https://github.com/Acme/App': 'ghp_map' });
    });
});
