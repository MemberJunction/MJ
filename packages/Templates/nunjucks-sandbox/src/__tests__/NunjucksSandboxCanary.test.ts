/**
 * The canary must fail on unguarded nunjucks, or it proves nothing. These tests run it against nunjucks
 * before the guard is installed, against a second copy of the nunjucks module (the case the guard cannot
 * reach), and after a guarded hook was replaced.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import nunjucks from 'nunjucks';
import { AssertNunjucksSandboxIsEffective } from '../NunjucksSandboxCanary';
import { HardenNunjucksRuntime } from '../NunjucksSandbox';
import { CreateSandboxedEnvironment } from '../SandboxedEnvironment';
import { TemplateSandboxError } from '../TemplateSandboxError';

/** The runtime hook a template's member reads go through. */
interface RuntimeModule {
    memberLookup: (obj: unknown, val: unknown) => unknown;
}
const runtime = (nunjucks as unknown as { runtime: RuntimeModule }).runtime;

/** nunjucks' own `memberLookup`, read before anything in this file installs the guard. */
const unguardedMemberLookup = runtime.memberLookup;

/** Loads a second, separate copy of the nunjucks module, as a duplicated or drifted install would. */
function loadSecondNunjucksCopy(): typeof nunjucks {
    const require = createRequire(import.meta.url);
    const entry = require.resolve('nunjucks');
    const packageRoot = entry.slice(0, entry.lastIndexOf('nunjucks') + 'nunjucks'.length);
    const cached = Object.keys(require.cache).filter((id) => id.startsWith(packageRoot));
    const saved = cached.map((id): [string, NodeJS.Module | undefined] => [id, require.cache[id]]);
    cached.forEach((id) => delete require.cache[id]);
    try {
        return require('nunjucks') as typeof nunjucks;
    } finally {
        Object.keys(require.cache).filter((id) => id.startsWith(packageRoot)).forEach((id) => delete require.cache[id]);
        saved.forEach(([id, module]) => { require.cache[id] = module; });
    }
}

describe('AssertNunjucksSandboxIsEffective', () => {
    // Order matters in this block: the first test runs before the guard is installed.
    it('throws on nunjucks that was never guarded (the probes do escape plain nunjucks)', () => {
        expect(() => AssertNunjucksSandboxIsEffective()).toThrow(TemplateSandboxError);
        expect(() => AssertNunjucksSandboxIsEffective(new nunjucks.Environment(null, { autoescape: false }))).toThrow(/NOT in effect/);
    });

    it('passes once HardenNunjucksRuntime has run, for a new and for a given environment', () => {
        HardenNunjucksRuntime();
        expect(() => AssertNunjucksSandboxIsEffective()).not.toThrow();
        expect(() => AssertNunjucksSandboxIsEffective(new nunjucks.Environment(null, { throwOnUndefined: true }))).not.toThrow();
        expect(() => AssertNunjucksSandboxIsEffective(new nunjucks.Environment(null, { autoescape: true }))).not.toThrow();
    });

    it('throws for an environment built from a second copy of the nunjucks module, which the guard does not cover', () => {
        HardenNunjucksRuntime();
        const second = loadSecondNunjucksCopy();
        expect(second).not.toBe(nunjucks);
        const foreignEnv = new second.Environment(null, { autoescape: false });
        // The audit scenario: the process is hardened, yet this environment renders the escape.
        expect(foreignEnv.renderString(`{{ ''.constructor.constructor('return 6*7')() }}`, {})).toBe('42');
        expect(() => AssertNunjucksSandboxIsEffective(foreignEnv)).toThrow(TemplateSandboxError);
        // The hardened copy is unaffected.
        expect(() => AssertNunjucksSandboxIsEffective()).not.toThrow();
    });

    it('throws when a guarded hook was replaced, and HardenNunjucksRuntime repairs it', () => {
        HardenNunjucksRuntime();
        const guarded = runtime.memberLookup;
        runtime.memberLookup = unguardedMemberLookup;
        try {
            expect(() => AssertNunjucksSandboxIsEffective()).toThrow(TemplateSandboxError);
            HardenNunjucksRuntime();
            expect(runtime.memberLookup).not.toBe(unguardedMemberLookup);
            expect(() => AssertNunjucksSandboxIsEffective()).not.toThrow();
        } finally {
            if (runtime.memberLookup === unguardedMemberLookup) {
                runtime.memberLookup = guarded;
            }
        }
    });
});

describe('CreateSandboxedEnvironment', () => {
    it('returns an environment that refuses a constructor escape and still renders ordinary templates', () => {
        const env = CreateSandboxedEnvironment(null, { autoescape: false });
        expect(env.renderString('Hello {{ name | upper }}', { name: 'world' })).toBe('Hello WORLD');
        expect(env.renderString(`{{ ''.constructor.constructor }}`, {})).toBe('');
        expect(() => env.renderString(`{{ ''.constructor.constructor('return 6*7')() }}`, {})).toThrow();
        expect(() => env.renderString(`{{ range.constructor('return 6*7')() }}`, {})).toThrow();
    });

    it('guards nunjucks itself: it does not need HardenNunjucksRuntime to have been called first', () => {
        const guarded = runtime.memberLookup;
        runtime.memberLookup = unguardedMemberLookup;
        try {
            const env = CreateSandboxedEnvironment();
            expect(runtime.memberLookup).not.toBe(unguardedMemberLookup);
            expect(() => env.renderString(`{{ ''.constructor.constructor('return 6*7')() }}`, {})).toThrow();
        } finally {
            if (runtime.memberLookup === unguardedMemberLookup) {
                runtime.memberLookup = guarded;
            }
        }
    });

    it('passes the loader and options through', () => {
        const env = CreateSandboxedEnvironment(null, { throwOnUndefined: true });
        expect(() => env.renderString('{{ missing }}', {})).toThrow();
    });
});
