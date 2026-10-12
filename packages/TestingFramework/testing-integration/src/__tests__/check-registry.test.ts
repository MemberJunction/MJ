import { describe, it, expect } from 'vitest';
import { IntegrationCheckRegistry } from '../check-registry';
import type { NamedCheck, BundleLifecycle } from '../check';

// The registry is a process-wide singleton, so every test uses its own bundle prefix.
const reg = IntegrationCheckRegistry.Instance;

/** A fresh check object each call, with identical source: what a re-evaluated module produces. */
function makeCheck(id: string, name = 'check'): NamedCheck {
    return { Id: id, Name: name, Fn: async () => { /* pass */ } };
}

/** A fresh lifecycle object each call, with identical source. */
function makeLifecycle(): BundleLifecycle {
    return {
        Setup: async () => { /* create fixture */ },
        Teardown: async () => { /* remove fixture */ }
    };
}

describe('IntegrationCheckRegistry.Register', () => {
    it('stores a check under a new Id', () => {
        const check = makeCheck('regnew.A');
        reg.Register(check);
        expect(reg.Get('regnew.A')).toBe(check);
    });

    it('registering the same object twice is a no-op', () => {
        const check = makeCheck('regsame.A');
        reg.Register(check);
        expect(() => reg.Register(check)).not.toThrow();
        expect(reg.GetBundle('regsame')).toEqual([check]);
    });

    it('an equivalent copy (module evaluated twice) is accepted and replaces the stored one', () => {
        const first = makeCheck('regcopy.A');
        const second = makeCheck('regcopy.A');
        reg.Register(first);
        expect(() => reg.Register(second)).not.toThrow();
        expect(reg.Get('regcopy.A')).toBe(second);
        expect(reg.GetBundle('regcopy')).toHaveLength(1);
    });

    it('a different check under an existing Id throws, naming the Id, and keeps the first', () => {
        const first = makeCheck('regdup.A', 'first');
        reg.Register(first);
        expect(() => reg.Register({ Id: 'regdup.A', Name: 'second', Fn: async () => { throw new Error('other'); } }))
            .toThrow(/regdup\.A/);
        expect(reg.Get('regdup.A')).toBe(first);
    });

    it('the same body under a different Name is a different check', () => {
        reg.Register(makeCheck('regname.A', 'first'));
        expect(() => reg.Register(makeCheck('regname.A', 'second'))).toThrow(/regname\.A/);
    });

    it('a different tier flag makes it a different check', () => {
        reg.Register(makeCheck('regtier.A'));
        expect(() => reg.Register({ ...makeCheck('regtier.A'), RequiresMutation: true })).toThrow(/regtier\.A/);
    });
});

describe('IntegrationCheckRegistry.RegisterLifecycle', () => {
    it('stores a lifecycle for a new bundle', () => {
        const lifecycle = makeLifecycle();
        reg.RegisterLifecycle('lcnew', lifecycle);
        expect(reg.GetLifecycle('lcnew')).toBe(lifecycle);
    });

    it('registering the same object twice is a no-op', () => {
        const lifecycle = makeLifecycle();
        reg.RegisterLifecycle('lcsame', lifecycle);
        expect(() => reg.RegisterLifecycle('lcsame', lifecycle)).not.toThrow();
        expect(reg.GetLifecycle('lcsame')).toBe(lifecycle);
    });

    it('an equivalent copy is accepted and replaces the stored one', () => {
        reg.RegisterLifecycle('lccopy', makeLifecycle());
        const second = makeLifecycle();
        expect(() => reg.RegisterLifecycle('lccopy', second)).not.toThrow();
        expect(reg.GetLifecycle('lccopy')).toBe(second);
    });

    it('a different lifecycle for the same bundle throws, naming the bundle, and keeps the first', () => {
        const first = makeLifecycle();
        reg.RegisterLifecycle('lcdup', first);
        expect(() => reg.RegisterLifecycle('lcdup', {
            Setup: async () => { throw new Error('other setup'); },
            Teardown: async () => { /* remove fixture */ }
        })).toThrow(/lcdup/);
        expect(reg.GetLifecycle('lcdup')).toBe(first);
    });
});
