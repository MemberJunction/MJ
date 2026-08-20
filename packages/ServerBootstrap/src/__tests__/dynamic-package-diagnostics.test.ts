import { describe, it, expect } from 'vitest';
import { describeThrown, describeHostResolution } from '../host-import';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * MJ#3975 §4 — MJAPI refused to start with a non-`Error` rejection and ZERO output.
 *
 * The whole output of the failed start was:
 *
 *     node:internal/modules/run_main:107
 *         triggerUncaughtException(
 *         ^
 *     [Object: null prototype] {
 *       Symbol(nodejs.util.inspect.custom): [Function: [nodejs.util.inspect.custom]]
 *     }
 *
 * The cause was one `dynamicPackages.server` entry whose package was not built. Reproduced
 * under MJAPI's real loader (`ts-node/esm` registered through `node:module`): a dynamic-import
 * resolution failure crossing the module-hooks thread arrives as a **null-prototype object with
 * zero own properties**, carrying only `Symbol(nodejs.util.inspect.custom)`. Two consequences,
 * both tested here:
 *
 *  - `String(value)` on it THROWS `TypeError: Cannot convert object to primitive value`, so any
 *    diagnostic that stringifies naively takes the process down a second time — and
 *    `console.warn('...', value)` renders it as `{}`. Nothing usable reaches the operator.
 *  - `value instanceof Error` is false and it has no `message`, so the failure carries no
 *    identity of its own. The only way to name the culprit is for the loader to say which entry
 *    it was on, and to have pre-computed why that entry could not resolve.
 */

/** The exact value MJAPI's loader receives — verified against a live ts-node/esm repro. */
function opaqueLoaderFailure(): unknown {
    const v = Object.create(null) as Record<PropertyKey, unknown>;
    v[Symbol.for('nodejs.util.inspect.custom')] = () => 'inspected';
    return v;
}

describe('MJ#3975 §4 — describeThrown', () => {
    it('never throws on the opaque loader-thread value (String() on it does)', () => {
        const v = opaqueLoaderFailure();
        expect(() => String(v)).toThrow(TypeError);
        expect(() => describeThrown(v)).not.toThrow();
    });

    it('says the value carried nothing, instead of rendering as {}', () => {
        const described = describeThrown(opaqueLoaderFailure());
        expect(described).toMatch(/no message|carried no|stripped/i);
        expect(described).not.toBe('{}');
        expect(described.length).toBeGreaterThan(10);
    });

    it('passes a normal Error through with its message and code', () => {
        const e = Object.assign(new Error("Cannot find package 'x'"), { code: 'ERR_MODULE_NOT_FOUND' });
        expect(describeThrown(e)).toContain("Cannot find package 'x'");
        expect(describeThrown(e)).toContain('ERR_MODULE_NOT_FOUND');
    });

    it('handles a thrown string and a thrown null', () => {
        expect(describeThrown('boom')).toContain('boom');
        expect(() => describeThrown(null)).not.toThrow();
    });
});

describe('MJ#3975 §4 — describeHostResolution', () => {
    it('reports each anchor it tried and why the package could not be reached', () => {
        const host = mkdtempSync(path.join(tmpdir(), 'mj3975-host-'));
        const configPath = path.join(host, 'mj.config.cjs');
        writeFileSync(configPath, 'module.exports = {};');

        const report = describeHostResolution('@mj-biz-apps/orders-server', configPath);
        expect(report.Resolved).toBeUndefined();
        expect(report.Attempts.length).toBeGreaterThan(0);
        // The mj.config.cjs that NAMED the package must be among the anchors reported.
        expect(report.Attempts.some((a) => a.Anchor === configPath)).toBe(true);
        expect(report.Attempts.every((a) => typeof a.Error === 'string' && a.Error.length > 0)).toBe(true);
    });

    it('reports the resolved path when the host CAN reach the package', () => {
        const host = realpathSync(mkdtempSync(path.join(tmpdir(), 'mj3975-host-ok-')));
        const configPath = path.join(host, 'mj.config.cjs');
        writeFileSync(configPath, 'module.exports = {};');
        const pkgDir = path.join(host, 'node_modules', '@mj-biz-apps', 'orders-server');
        mkdirSync(pkgDir, { recursive: true });
        writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@mj-biz-apps/orders-server', version: '1.0.0', main: 'index.js' }));
        writeFileSync(path.join(pkgDir, 'index.js'), 'module.exports = {};');

        const report = describeHostResolution('@mj-biz-apps/orders-server', configPath);
        expect(report.Resolved).toBe(path.join(pkgDir, 'index.js'));
    });

    it('an unbuilt package (package.json present, entry file missing) is reported as unreachable, not resolved', () => {
        // This is the reported case: the entry was Enabled:true in mj.config.cjs but the
        // package had never been built, so there was no dist/ for its main to point at.
        const host = mkdtempSync(path.join(tmpdir(), 'mj3975-host-unbuilt-'));
        const configPath = path.join(host, 'mj.config.cjs');
        writeFileSync(configPath, 'module.exports = {};');
        const pkgDir = path.join(host, 'node_modules', '@mj-biz-apps', 'orders-server');
        mkdirSync(pkgDir, { recursive: true });
        writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@mj-biz-apps/orders-server', version: '1.0.0', main: 'dist/index.js' }));

        const report = describeHostResolution('@mj-biz-apps/orders-server', configPath);
        expect(report.Resolved).toBeUndefined();
        expect(report.Attempts.some((a) => /dist|Cannot find|MODULE_NOT_FOUND/i.test(a.Error))).toBe(true);
    });
});
