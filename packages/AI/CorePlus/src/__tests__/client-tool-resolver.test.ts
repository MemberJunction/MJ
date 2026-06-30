import { describe, it, expect } from 'vitest';
import {
    ResolveClientTools,
    FormatClientToolsForPrompt,
    IClientToolSource,
} from '../client-tool-resolver';
import { ClientToolMetadata } from '../agent-types';

const tool = (name: string, extra: Partial<ClientToolMetadata> = {}): ClientToolMetadata => ({
    Name: name,
    Description: `desc:${name}`,
    InputSchema: { type: 'object' },
    ...extra,
});

describe('ResolveClientTools', () => {
    it('returns empty when no tiers supplied', () => {
        expect(ResolveClientTools({ agentId: 'a' })).toEqual([]);
    });

    it('merges all four tiers, deduping by Name', () => {
        const result = ResolveClientTools({
            agentId: 'a',
            overrideTools: [tool('Nav')],
            sessionTools: [tool('Save')],
            appTools: [tool('Export')],
            staticTools: [tool('Help')],
        });
        expect(result.map(t => t.Name).sort()).toEqual(['Export', 'Help', 'Nav', 'Save']);
    });

    it('honors precedence override > session > app > static (first-match-wins)', () => {
        const result = ResolveClientTools({
            agentId: 'a',
            overrideTools: [tool('X', { Description: 'override' })],
            sessionTools: [tool('X', { Description: 'session' })],
            appTools: [tool('X', { Description: 'app' })],
            staticTools: [tool('X', { Description: 'static' })],
        });
        expect(result).toHaveLength(1);
        expect(result[0].Description).toBe('override');
    });

    it('session beats app beats static when no override', () => {
        expect(
            ResolveClientTools({
                agentId: 'a',
                sessionTools: [tool('X', { Description: 'session' })],
                appTools: [tool('X', { Description: 'app' })],
                staticTools: [tool('X', { Description: 'static' })],
            })[0].Description,
        ).toBe('session');

        expect(
            ResolveClientTools({
                agentId: 'a',
                appTools: [tool('X', { Description: 'app' })],
                staticTools: [tool('X', { Description: 'static' })],
            })[0].Description,
        ).toBe('app');
    });

    it('uses the injected IClientToolSource for the static tier when staticTools omitted', () => {
        const source: IClientToolSource = {
            GetStaticTools: (id) => (id === 'a' ? [tool('FromSource')] : []),
        };
        const result = ResolveClientTools({ agentId: 'a', source });
        expect(result.map(t => t.Name)).toEqual(['FromSource']);
    });

    it('prefers explicit staticTools over the source', () => {
        const source: IClientToolSource = { GetStaticTools: () => [tool('FromSource')] };
        const result = ResolveClientTools({ agentId: 'a', source, staticTools: [tool('Explicit')] });
        expect(result.map(t => t.Name)).toEqual(['Explicit']);
    });

    it('ignores nameless/falsy tool entries defensively', () => {
        const result = ResolveClientTools({
            agentId: 'a',
            sessionTools: [tool('Good'), { Name: '', Description: '', InputSchema: {} }],
        });
        expect(result.map(t => t.Name)).toEqual(['Good']);
    });
});

describe('FormatClientToolsForPrompt', () => {
    it('returns empty string for no tools', () => {
        expect(FormatClientToolsForPrompt([])).toBe('');
    });

    it('renders tools grouped by category', () => {
        const md = FormatClientToolsForPrompt([
            tool('NavigateToRecord', { Category: 'navigation' }),
            tool('Export', { Category: 'data', OutputSchema: { type: 'string' } }),
        ]);
        expect(md).toContain('### navigation');
        expect(md).toContain('**NavigateToRecord**');
        expect(md).toContain('### data');
        expect(md).toContain('Output schema');
    });

    it('buckets uncategorized tools under General', () => {
        expect(FormatClientToolsForPrompt([tool('X')])).toContain('### General');
    });
});
