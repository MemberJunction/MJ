import { describe, expect, it } from 'vitest';
import { ParsePageMessage, SerializeNativeMessage } from '../interactive/dom-host/bridge-protocol';
import { BuildHostPage } from '../interactive/dom-host/host-page';
import { DeclaredGlobals } from '../interactive/dom-host/library-definitions';
import type { ComponentSpec } from '@memberjunction/react-runtime';

/**
 * @fileoverview The boundary between the app and the DOM host page.
 *
 * Everything here is about a seam that fails badly when it fails: a message shape the two sides
 * disagree about breaks at runtime, inside a WebView, with no stack that points anywhere useful.
 * The page itself cannot be unit-tested without a browser, so what is tested is the contract it is
 * held to — what the app will accept from it, and what the app sends it.
 */

describe('ParsePageMessage', () => {
    it('reads each message the page can send', () => {
        expect(ParsePageMessage('{"Type":"ready"}')).toEqual({ Type: 'ready' });
        expect(ParsePageMessage('{"Type":"height","Pixels":412}')).toEqual({ Type: 'height', Pixels: 412 });
        expect(ParsePageMessage('{"Type":"error","Message":"boom"}')).toEqual({ Type: 'error', Message: 'boom' });
        expect(ParsePageMessage('{"Type":"rpc","ID":"r1","Method":"rv.RunView","Args":[{}]}')).toEqual({
            Type: 'rpc', ID: 'r1', Method: 'rv.RunView', Args: [{}],
        });
        expect(ParsePageMessage('{"Type":"callback","Name":"OpenEntityRecord","Args":["Users",{}]}')).toEqual({
            Type: 'callback', Name: 'OpenEntityRecord', Args: ['Users', {}],
        });
    });

    it('ignores anything it does not recognise instead of throwing', () => {
        // A WebView emits messages this app never sent — injected scripts, devtools, library
        // chatter. One of those must not take down the screen hosting the component.
        for (const raw of ['', null, undefined, 'not json', '[]', '"str"', '{"Type":"whoKnows"}', '{}']) {
            expect(ParsePageMessage(raw as string)).toBeNull();
        }
    });

    it('rejects an rpc with no id, which could never be answered', () => {
        expect(ParsePageMessage('{"Type":"rpc","Method":"rv.RunView"}')).toBeNull();
    });

    it('rejects a nonsensical height rather than collapsing the container', () => {
        for (const px of ['0', '-5', '"tall"', 'null']) {
            expect(ParsePageMessage(`{"Type":"height","Pixels":${px}}`)).toBeNull();
        }
    });

    it('defaults a missing error message rather than showing "undefined"', () => {
        expect(ParsePageMessage('{"Type":"error"}')).toEqual({
            Type: 'error', Message: 'The component failed to render.',
        });
    });

    it('tolerates missing args', () => {
        expect(ParsePageMessage('{"Type":"rpc","ID":"r1","Method":"rv.RunView"}')?.Type).toBe('rpc');
        expect(ParsePageMessage('{"Type":"callback","Name":"NotifyEvent"}')?.Type).toBe('callback');
    });
});

describe('SerializeNativeMessage', () => {
    it('produces an injectable statement that survives quotes and newlines in the payload', () => {
        // The payload is component data. A quote, a backslash or a newline in a row value would
        // otherwise terminate the injected statement and silently break the bridge.
        const js = SerializeNativeMessage({
            Type: 'rpc-result',
            ID: 'r1',
            Value: { note: 'he said "hi"\nthen \\left', tag: '</script>' },
        });
        expect(js.startsWith('window.__mjReceive(')).toBe(true);
        expect(js.trim().endsWith('true;')).toBe(true);

        // Round-trip it the way the page does: evaluate the argument, then JSON.parse it.
        const arg = js.slice('window.__mjReceive('.length, js.lastIndexOf(')'));
        const decoded = JSON.parse(JSON.parse(arg) as string) as { Value: { note: string; tag: string } };
        expect(decoded.Value.note).toBe('he said "hi"\nthen \\left');
        expect(decoded.Value.tag).toBe('</script>');
    });
});

describe('BuildHostPage', () => {
    it('links the stylesheet a library needs, and only for libraries that have one', () => {
        // AG Grid and Leaflet render as unstyled markup without their CSS — visibly broken rather
        // than absent, which is the worse failure.
        const html = BuildHostPage([
            { Name: 'leaflet', GlobalVariable: 'L', CdnUrl: 'https://x/leaflet.js', CdnCssUrl: 'https://x/leaflet.css' },
            { Name: 'chart.js', GlobalVariable: 'Chart', CdnUrl: 'https://x/chart.js', CdnCssUrl: null },
        ]);
        expect(html).toContain('<link rel="stylesheet" href="https://x/leaflet.css">');
        expect(html).not.toContain('chart.css');
    });

    it('does not inline the spec into the document', () => {
        // Component code may legally contain `</script>`; inlined, that ends the document early.
        // The page boots empty and receives everything over the bridge instead.
        const html = BuildHostPage([]);
        expect(html).toContain("window.__mjReceive");
        expect(html).toContain("msg.Type === 'init'");
    });

    it('escapes a hostile stylesheet url rather than letting it close the tag', () => {
        const html = BuildHostPage([
            { Name: 'x', GlobalVariable: 'X', CdnUrl: 'https://x/x.js', CdnCssUrl: 'https://x/a"><script>alert(1)</script>' },
        ]);
        expect(html).not.toContain('"><script>alert(1)');
        expect(html).toContain('&quot;&gt;&lt;script&gt;');
    });

    it('loads React before ReactDOM, which captures it at execution time', () => {
        const html = BuildHostPage([]);
        const react = html.indexOf('react@18.2.0/umd/react.production');
        const reactDom = html.indexOf('react-dom@18.2.0/umd/react-dom.production');
        expect(react).toBeGreaterThan(-1);
        expect(reactDom).toBeGreaterThan(react);
    });

    it('loads the MemberJunction runtime, so the component is compiled by the same code as everywhere else', () => {
        expect(BuildHostPage([])).toContain('@memberjunction/react-runtime');
    });

    it('emits a syntactically valid script', () => {
        // The page is a JavaScript program inside a TypeScript template literal, so an ordinary
        // backtick in a comment silently terminates the literal and ships a broken document — the
        // failure lands in a WebView with no stack worth reading. Parsing it here turns that into
        // a test failure at the source.
        const html = BuildHostPage([
            { Name: 'chart.js', GlobalVariable: 'Chart', CdnUrl: 'https://x/c.js', CdnCssUrl: null },
        ]);
        const script = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
        expect(script.trim().length).toBeGreaterThan(500);
        expect(() => new Function(script)).not.toThrow();
    });

    it('leaves no unresolved template interpolation in the output', () => {
        // A `${...}` that survives into the page is a value that never got substituted.
        expect(BuildHostPage([])).not.toMatch(/\$\{/);
    });
});

describe('DeclaredGlobals', () => {
    it('collects globals from the whole tree plus the resolved extras', () => {
        const spec = {
            name: 'Root',
            code: 'x',
            libraries: [{ name: 'chart.js', globalVariable: 'Chart' }],
            dependencies: [{ name: 'Child', code: 'y', libraries: [{ name: 'lodash', globalVariable: '_' }] }],
        } as ComponentSpec;
        const globals = DeclaredGlobals(spec, [{ name: 'dayjs', globalVariable: 'dayjs' }]);
        expect(globals.sort()).toEqual(['Chart', '_', 'dayjs']);
    });

    it('returns nothing for a spec that declares nothing', () => {
        expect(DeclaredGlobals(null)).toEqual([]);
    });
});
