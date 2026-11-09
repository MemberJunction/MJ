import { describe, it, expect } from 'vitest';
import { AppClientToolRegistry, DEFAULT_APP_TOOL_OWNER } from '../session/app-client-tool-registry';

const tool = (Name: string, value: string, extra: Partial<{ Description: string; InputSchema: Record<string, unknown> }> = {}) => ({
    Name,
    Handler: () => value,
    ...extra,
});

describe('AppClientToolRegistry', () => {
    it('replaces only the registering owner\'s set', () => {
        const r = new AppClientToolRegistry();
        r.Register('explorer.global', [tool('NavigateToApp', 'g1'), tool('OpenRecord', 'g2')]);
        r.Register('explorer.surface', [tool('SetFilter', 's1')]);
        r.Register('explorer.surface', [tool('SetSort', 's2')]);
        expect(r.Names().sort()).toEqual(['NavigateToApp', 'OpenRecord', 'SetSort']);
        expect(r.Find('setfilter')).toBeUndefined();
    });

    it('an empty set clears just that owner and leaves the others', () => {
        const r = new AppClientToolRegistry();
        r.Register('a', [tool('One', '1')]);
        r.Register('b', [tool('Two', '2')]);
        r.Register('b', []);
        expect(r.Names()).toEqual(['One']);
    });

    it('later-registered owner wins a name collision, and keeps its slot when it re-registers', () => {
        const r = new AppClientToolRegistry();
        r.Register('global', [tool('Go', 'global')]);
        r.Register('surface', [tool('Go', 'surface')]);
        expect(r.Find('Go')?.Handler({})).toBe('surface');
        r.Register('global', [tool('Go', 'global-v2')]); // re-register: must NOT leapfrog the surface
        expect(r.Find('Go')?.Handler({})).toBe('surface');
    });

    it('Unregister gives up the slot, so a later re-registration is the newest', () => {
        const r = new AppClientToolRegistry();
        r.Register('global', [tool('Go', 'global')]);
        r.Register('surface', [tool('Go', 'surface')]);
        r.Unregister('global');
        r.Register('global', [tool('Go', 'global-again')]);
        expect(r.Find('Go')?.Handler({})).toBe('global-again');
    });

    it('matches names case-insensitively and skips invalid entries', () => {
        const r = new AppClientToolRegistry();
        r.Register('a', [tool('Export', 'x'), { Name: '', Handler: () => 1 }, { Name: 'NoHandler' } as unknown as ReturnType<typeof tool>]);
        expect(r.Find('EXPORT')).toBeDefined();
        expect(r.Names()).toEqual(['Export']);
    });

    it('a blank owner falls back to the default owner', () => {
        const r = new AppClientToolRegistry();
        r.Register('  ', [tool('A', '1')]);
        r.Register(DEFAULT_APP_TOOL_OWNER, [tool('B', '2')]);
        expect(r.Names()).toEqual(['B']); // same owner: the second registration replaced the first
    });

    it('Clear removes every owner', () => {
        const r = new AppClientToolRegistry();
        r.Register('a', [tool('A', '1')]);
        r.Clear();
        expect(r.Names()).toEqual([]);
    });

    it('ToMetadata orders later owners first so resolver first-match agrees with Find', () => {
        const r = new AppClientToolRegistry();
        r.Register('global', [tool('Go', 'g', { Description: 'global go' })]);
        r.Register('surface', [tool('Go', 's', { Description: 'surface go', InputSchema: { type: 'object' } })]);
        const meta = r.ToMetadata();
        expect(meta[0]).toMatchObject({ Name: 'Go', Description: 'surface go' });
        expect(meta[1]).toMatchObject({ Name: 'Go', Description: 'global go', InputSchema: {} });
    });
});
