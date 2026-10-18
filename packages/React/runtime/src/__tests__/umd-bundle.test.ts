import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

/**
 * @fileoverview The UMD bundle actually initializes, with its class names intact.
 *
 * ## Why this test exists
 *
 * `dist/runtime.umd.js` is the artifact a browser loads: the Playwright test harness injects it,
 * and the React Native app fetches it to render components that need a real DOM. It is also the
 * one output nothing else type-checks — webpack emits it after `tsc` has finished, so a packaging
 * mistake surfaces only when something tries to run it.
 *
 * ## The specific failure being guarded
 *
 * Minification was disabled on this bundle for a real reason: `MJGlobal.ClassFactory` keys every
 * registration on `class.name`, and terser's default mangling renames classes — so two distinct
 * classes collapse onto one identifier and their registrations collide, breaking initialization.
 *
 * The fix was `keep_classnames` / `keep_fnames` rather than leaving 11 MB of unminified JavaScript
 * on the wire, which on a phone is a first-render wait rather than a number on disk. This test
 * pins both halves: the bundle evaluates and exports its API, **and** the class names it depends on
 * survived. Without the second assertion, re-enabling plain mangling would pass silently here and
 * fail wherever a component is actually rendered.
 */

const BUNDLE = fileURLToPath(new URL('../../dist/runtime.umd.js', import.meta.url));

/** The bundle is a build output; a source-only checkout has not produced it yet. */
const built = existsSync(BUNDLE);

describe.skipIf(!built)('runtime.umd.js', () => {
    /**
     * Evaluates the bundle in a sandbox with the globals its externals expect.
     *
     * A `vm` context rather than an import: the file is UMD, assigns to a global, and must be
     * proven to work the way a browser loads it rather than the way a bundler would.
     */
    function LoadBundle(): Record<string, unknown> {
        const sandbox: Record<string, unknown> = {
            console,
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
            // The externals declared in webpack.umd.config.cjs. Shapes are irrelevant here — the
            // bundle only captures references at load time.
            React: { createElement: () => null, Component: class Component {} },
            ReactDOM: {},
            Babel: { transform: () => ({ code: '' }) },
            process: { env: { NODE_ENV: 'production' } },
        };
        sandbox.window = sandbox;
        sandbox.self = sandbox;
        sandbox.globalThis = sandbox;
        const ctx = createContext(sandbox);
        runInContext(readFileSync(BUNDLE, 'utf8'), ctx, { filename: 'runtime.umd.js' });
        return sandbox;
    }

    it('evaluates and exposes MJReactRuntime', () => {
        const g = LoadBundle();
        expect(g.MJReactRuntime).toBeTypeOf('object');
    });

    it('exports the entry points a host actually calls', () => {
        // Exactly what the DOM host page and the Playwright harness reach for. A packaging change
        // that dropped one of these would leave a blank panel in a WebView.
        const rt = LoadBundle().MJReactRuntime as Record<string, unknown>;
        for (const name of ['createReactRuntime', 'buildComponentProps', 'createErrorBoundary']) {
            expect(rt[name], `${name} should be exported from the UMD bundle`).toBeTypeOf('function');
        }
    });

    it('keeps class names, which ClassFactory registrations are keyed on', () => {
        // The assertion that makes re-enabling plain mangling fail here rather than at render time.
        const rt = LoadBundle().MJReactRuntime as Record<string, unknown>;
        const named = Object.entries(rt).filter(([, v]) => typeof v === 'function');
        expect(named.length).toBeGreaterThan(0);

        for (const [exportName, value] of named) {
            const fnName = (value as { name?: string }).name ?? '';
            // A mangled name is a single character or two; a preserved one matches its export.
            expect(fnName.length, `${exportName} came through as "${fnName}" — names were mangled`)
                .toBeGreaterThan(2);
        }
    });

    it('is minified — this bundle is fetched over the network by the mobile app', () => {
        // Not a style preference: unminified it was 11 MB, which is a visible wait on a phone
        // before a chart appears. A regression to `minimize: false` doubles it back.
        const source = readFileSync(BUNDLE, 'utf8');
        const lines = source.split('\n').length;
        const bytesPerLine = statSync(BUNDLE).size / lines;
        expect(bytesPerLine).toBeGreaterThan(1000);
    });
});
