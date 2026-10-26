// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BoundingBox, ClickAction, ElementInfo } from '@memberjunction/computer-use';
import { CdpRemoteBrowserSession } from './cdp-remote-browser-session';
import { NormalizeNavigableUrl } from './dom-inspection';
import { FakeCdpSessionBackend, FakePlaywrightBrowserAdapter } from './__tests__/fakes';

/**
 * The in-page script runs here against a real (jsdom) document: the fake adapter's EvaluateInPage
 * calls it directly. jsdom lays nothing out, so an element counts as visible only when the test
 * gives it a size; everything left alone is hidden.
 */
function render(html: string): void {
    document.body.innerHTML = html;
    document.body.querySelectorAll('[data-visible]').forEach((el) => {
        (el as HTMLElement).getBoundingClientRect = () =>
            ({ x: 10, y: 10, width: 120, height: 32, top: 10, left: 10, right: 130, bottom: 42, toJSON: () => ({}) }) as DOMRect;
    });
}

function buildSession(): { session: CdpRemoteBrowserSession; adapter: FakePlaywrightBrowserAdapter } {
    const adapter = new FakePlaywrightBrowserAdapter();
    const session = new CdpRemoteBrowserSession(adapter, 'ws://cdp.test/endpoint', {}, new FakeCdpSessionBackend(), 'FakeProvider');
    return { session, adapter };
}

const ORDER_FORM = `
  <form>
    <label for="name">Customer name</label><input id="name" data-visible>
    <input type="hidden" name="csrf" value="t0k3n">
    <span id="cardLabel">Card number</span><input name="f7" aria-labelledby="cardLabel" data-visible>
    <input type="password" name="pw" aria-label="Password" data-visible>
    <button type="button" data-visible>Next</button>
    <button data-visible>Pay now</button>
  </form>`;

describe('inspect', () => {
    let session: CdpRemoteBrowserSession;
    beforeEach(() => ({ session } = buildSession()));

    it('gives visible fields f-refs and controls a-refs, skips hidden inputs, and flags what a person must click', async () => {
        render(ORDER_FORM);
        const { Observation } = await session.ExecuteAction({ Kind: 'inspect' });
        expect(Observation?.Fields.map((f) => [f.Ref, f.Label, f.Writable])).toEqual([
            ['f1', 'Customer name', true],
            ['f2', 'Card number', false],
            ['f3', 'Password', false],
        ]);
        expect(Observation?.Actions.map((a) => [a.Ref, a.Label, a.Destructive])).toEqual([
            ['a1', 'Next', false],
            ['a2', 'Pay now', true],
        ]);
    });

    it('clears the previous refs, so a field hidden since then cannot keep one', async () => {
        render(`<div id="s1"><input aria-label="Name" id="n" data-visible></div><div id="s2"><input aria-label="Email" id="e"></div>`);
        await session.ExecuteAction({ Kind: 'inspect' });
        expect(document.getElementById('n')?.getAttribute('data-mj-browser-ref')).toBe('f1');

        // Wizard step 2: Name goes out of view, Email comes in.
        (document.getElementById('n') as HTMLElement).getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect;
        (document.getElementById('e') as HTMLElement).getBoundingClientRect = () => ({ width: 100, height: 20 }) as DOMRect;
        await session.ExecuteAction({ Kind: 'inspect' });
        expect(document.getElementById('n')?.hasAttribute('data-mj-browser-ref')).toBe(false);
        expect(document.getElementById('e')?.getAttribute('data-mj-browser-ref')).toBe('f1');
    });
});

describe('fill', () => {
    let session: CdpRemoteBrowserSession;
    beforeEach(() => ({ session } = buildSession()));

    it('fills by the ref the Fill tool documents and reads the value back', async () => {
        render(ORDER_FORM);
        await session.ExecuteAction({ Kind: 'inspect' });
        const result = await session.ExecuteAction({ Kind: 'fill', Values: [{ Target: 'f1', Value: 'Ada Lovelace' }] });
        expect(result.Success).toBe(true);
        expect(result.Filled).toEqual([{ Ref: 'f1', Label: 'Customer name', Value: 'Ada Lovelace' }]);
        expect((document.getElementById('name') as HTMLInputElement).value).toBe('Ada Lovelace');
    });

    it('never fills a card field named only through aria-labelledby, even by its ref', async () => {
        render(ORDER_FORM);
        await session.ExecuteAction({ Kind: 'inspect' });
        const result = await session.ExecuteAction({ Kind: 'fill', Values: [{ Target: 'f2', Value: '4111 1111 1111 1111' }] });
        expect(result.Success).toBe(false);
        expect(result.Detail).toContain('protected');
        expect((document.querySelector('[name="f7"]') as HTMLInputElement).value).toBe('');
    });

    it('protects a card field named only by its title or its autocomplete token', async () => {
        render(`<input name="cc" title="Card number" data-visible><input name="pan" aria-label="PAN" autocomplete="cc-number" data-visible><input name="e" aria-label="Expires" autocomplete="cc-exp" data-visible>`);
        const { Observation } = await session.ExecuteAction({ Kind: 'inspect' });
        expect(Observation?.Fields.map((f) => f.Writable)).toEqual([false, false, false]);
        const result = await session.ExecuteAction({ Kind: 'fill', Values: [{ Target: 'f1', Value: '4111' }, { Target: 'f2', Value: '4111' }, { Target: 'f3', Value: '12/30' }] });
        expect(result.Filled).toEqual([]);
    });

    it('does not fill a hidden input, even when named exactly', async () => {
        render(ORDER_FORM);
        const result = await session.ExecuteAction({ Kind: 'fill', Values: [{ Target: 'csrf', Value: 'forged' }] });
        expect(result.Success).toBe(false);
        expect((document.querySelector('[name="csrf"]') as HTMLInputElement).value).toBe('t0k3n');
    });
});

describe('click guard', () => {
    let session: CdpRemoteBrowserSession;
    let adapter: FakePlaywrightBrowserAdapter;
    beforeEach(() => {
        ({ session, adapter } = buildSession());
        render(ORDER_FORM);
    });

    it('clicks a safe control by ref through its ref selector (a real adapter click) and returns the new page', async () => {
        await session.ExecuteAction({ Kind: 'inspect' });
        const result = await session.ExecuteAction({ Kind: 'click', Ref: 'a1' });
        expect(result.Success).toBe(true);
        expect((adapter.ExecutedActions[0] as ClickAction).Selector).toBe('[data-mj-browser-ref="a1"]');
        expect(result.Observation?.Actions[0].Label).toBe('Next');
    });

    it('refuses a destructive control by ref and by text without clicking', async () => {
        await session.ExecuteAction({ Kind: 'inspect' });
        for (const target of [{ Ref: 'a2' }, { Text: 'pay now' }]) {
            const result = await session.ExecuteAction({ Kind: 'click', ...target });
            expect(result.Success).toBe(false);
            expect(result.Detail).toContain('Refusing to activate "Pay now"');
        }
        expect(adapter.ExecutedActions).toEqual([]);
    });

    it('refuses a destructive control reached by coordinates', async () => {
        const pay = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Pay now')!;
        document.elementFromPoint = () => pay;
        expect((await session.ExecuteAction({ Kind: 'click', X: 120, Y: 110 })).Success).toBe(false);
        expect(adapter.ExecutedActions).toEqual([]);
    });

    it('checks every match of a selector, on screen or not, and refuses a selector that is not plain CSS', async () => {
        // "Next" matches first, but the click may land on "Pay now", which sits below the fold.
        const both = await session.ExecuteAction({ Kind: 'click', Selector: 'form button' });
        expect(both.Detail).toContain('Refusing to activate "Pay now"');
        const playwrightOnly = await session.ExecuteAction({ Kind: 'click', Selector: 'text=Pay now' });
        expect(playwrightOnly.Detail).toContain('not a plain CSS selector');
        expect(adapter.ExecutedActions).toEqual([]);

        const safe = await session.ExecuteAction({ Kind: 'click', Selector: 'button[type="button"]' });
        expect(safe.Success).toBe(true);
        expect((adapter.ExecutedActions[0] as ClickAction).Selector).toBe('button[type="button"]');
    });

    it('lets a form\'s ordinary submit button be clicked: only what its label says counts', async () => {
        render(`<form><input aria-label="Query" data-visible><button data-visible>Search</button></form>`);
        await session.ExecuteAction({ Kind: 'inspect' });
        expect((await session.ExecuteAction({ Kind: 'click', Ref: 'a1' })).Success).toBe(true);
    });

    it('a text click on an element inspect gave no ref gets one, so the click hits exactly it', async () => {
        render(`<details><summary data-visible>More options</summary></details>`);
        const result = await session.ExecuteAction({ Kind: 'click', Text: 'More options' });
        expect(result.Success).toBe(true);
        expect((adapter.ExecutedActions[0] as ClickAction).Selector).toBe('[data-mj-browser-ref="a1"]');
    });
});

describe('Enter guard', () => {
    let session: CdpRemoteBrowserSession;
    let adapter: FakePlaywrightBrowserAdapter;
    beforeEach(() => ({ session, adapter } = buildSession()));

    it('refuses Enter, pressed or typed, when it would submit through a "Pay now" default button', async () => {
        render(ORDER_FORM.replace('<button type="button" data-visible>Next</button>', ''));
        (document.getElementById('name') as HTMLInputElement).focus();
        expect((await session.ExecuteAction({ Kind: 'key', Key: 'Enter' })).Detail).toContain('Refusing to activate "Pay now"');
        expect((await session.ExecuteAction({ Kind: 'type', Text: 'Ada\n', Selector: '#name' })).Success).toBe(false);
        expect(adapter.ExecutedActions).toEqual([]);
    });

    it('lets Enter submit a search, and type text without a newline', async () => {
        render(`<form><input id="q" aria-label="Query" data-visible><button data-visible>Search</button></form>`);
        (document.getElementById('q') as HTMLInputElement).focus();
        expect((await session.ExecuteAction({ Kind: 'key', Key: 'Enter' })).Success).toBe(true);
        expect((await session.ExecuteAction({ Kind: 'type', Text: 'shoes' })).Success).toBe(true);
    });
});

describe('NormalizeNavigableUrl', () => {
    it('opens http(s), bare domains, local hosts and about:blank', () => {
        expect(NormalizeNavigableUrl('example.com/x')).toBe('https://example.com/x');
        expect(NormalizeNavigableUrl('example.com:8443/x')).toBe('https://example.com:8443/x');
        expect(NormalizeNavigableUrl('localhost:4200')).toBe('http://localhost:4200');
        expect(NormalizeNavigableUrl('about:blank')).toBe('about:blank');
    });

    it('refuses every other scheme', () => {
        for (const url of ['file:///etc/passwd', 'chrome://settings', 'data:text/html,<b>x</b>', 'javascript:alert(1)', 'view-source:https://a.test']) {
            expect(() => NormalizeNavigableUrl(url)).toThrow('Only http and https');
        }
    });
});
