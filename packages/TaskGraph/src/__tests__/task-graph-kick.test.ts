import { describe, expect, it } from 'vitest';
import { KickTaskGraphDispatchers, RegisterTaskGraphKick } from '../task-graph-kick';

describe('KickTaskGraphDispatchers', () => {
    it('invokes every registered kick and forgets unregistered ones', () => {
        const seen: string[] = [];
        const offA = RegisterTaskGraphKick(() => { seen.push('a'); });
        const offB = RegisterTaskGraphKick(() => { seen.push('b'); });
        KickTaskGraphDispatchers();
        expect(seen.sort()).toEqual(['a', 'b']);
        offA();
        KickTaskGraphDispatchers();
        expect(seen.filter((s) => s === 'a')).toHaveLength(1);
        expect(seen.filter((s) => s === 'b')).toHaveLength(2);
        offB();
    });
});
