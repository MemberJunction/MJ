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
    // Playwright's locator, for plain CSS in the light DOM; a test maps any other selector itself.
    adapter.FocusBySelector = (selector) => {
        try {
            return document.querySelector<HTMLElement>(selector);
        } catch {
            return null;
        }
    };
    const session = new CdpRemoteBrowserSession(adapter, 'ws://cdp.test/endpoint', {}, new FakeCdpSessionBackend(), 'FakeProvider');
    return { session, adapter };
}

/** The actions that typed or clicked, leaving out the empty Type that only focuses a typed action's target. */
const typedOrClicked = (adapter: FakePlaywrightBrowserAdapter) =>
    adapter.ExecutedActions.filter((a) => !(a.Type === 'Type' && a.Text === ''));

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

    it('finds a destructive match inside an open shadow root', async () => {
        render(`<div id="host"></div>`);
        const root = document.getElementById('host')!.attachShadow({ mode: 'open' });
        root.innerHTML = '<button class="go">Place your order</button>';
        expect((await session.ExecuteAction({ Kind: 'click', Selector: 'button.go' })).Detail).toContain('Refusing to activate "Place your order"');
        expect(adapter.ExecutedActions).toEqual([]);
    });

    it('refuses order, transfer and payment-confirmation labels, and leaves plain Send and Confirm alone', async () => {
        render(['Place your order', 'Transfer', 'Confirm payment', 'Send', 'Confirm'].map((l) => `<button type="button" data-visible>${l}</button>`).join(''));
        const { Observation } = await session.ExecuteAction({ Kind: 'inspect' });
        expect(Observation?.Actions.map((a) => [a.Label, a.Destructive])).toEqual([
            ['Place your order', true],
            ['Transfer', true],
            ['Confirm payment', true],
            ['Send', false],
            ['Confirm', false],
        ]);
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
        expect(typedOrClicked(adapter)).toEqual([]);
    });

    it('treats a newline key as Enter, and Space as activating the focused button', async () => {
        render(ORDER_FORM.replace('<button type="button" data-visible>Next</button>', ''));
        (document.getElementById('name') as HTMLInputElement).focus();
        for (const key of ['\n', '\r', '\r\n']) {
            expect((await session.ExecuteAction({ Kind: 'key', Key: key })).Success).toBe(false);
        }
        const pay = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Pay now')!;
        pay.focus();
        for (const key of [' ', 'Space']) {
            expect((await session.ExecuteAction({ Kind: 'key', Key: key })).Detail).toContain('Refusing to activate "Pay now"');
        }
        expect((await session.ExecuteAction({ Kind: 'type', Text: ' ' })).Success).toBe(false);
        expect(adapter.ExecutedActions).toEqual([]);

        // Spaces typed into a text field are just text, whatever selector names the field.
        (document.getElementById('name') as HTMLInputElement).focus();
        expect((await session.ExecuteAction({ Kind: 'type', Text: 'Ada Lovelace' })).Success).toBe(true);
        expect((await session.ExecuteAction({ Kind: 'type', Text: 'Ada Lovelace', Selector: '#name >> nth=0' })).Success).toBe(true);
    });

    it('judges typed text by what the locator focuses, so a Playwright-only selector cannot reach a destructive button', async () => {
        render(`<form><input id="name" aria-label="Name" data-visible><button id="lightpay" data-visible>Place your order</button></form><div id="host"></div>`);
        const root = document.getElementById('host')!.attachShadow({ mode: 'open' });
        root.innerHTML = '<form><button id="pay">Place your order</button></form>';
        const lightpay = document.getElementById('lightpay');
        // What Playwright's locator resolves each selector to (jsdom cannot parse them).
        const locate: Record<string, HTMLElement | null> = {
            '#pay >> nth=0': root.getElementById('pay'),
            '#lightpay >> nth=0': lightpay,
            'button:has-text("Place your order")': lightpay,
            '#name >> nth=0': document.getElementById('name'),
        };
        adapter.FocusBySelector = (selector) => locate[selector] ?? null;
        for (const selector of ['#pay >> nth=0', '#lightpay >> nth=0', 'button:has-text("Place your order")']) {
            const result = await session.ExecuteAction({ Kind: 'type', Text: 'ok ', Selector: selector });
            expect([selector, result.Detail]).toEqual([selector, expect.stringContaining('Refusing to activate "Place your order"')]);
        }
        expect(typedOrClicked(adapter)).toEqual([]);
        expect((await session.ExecuteAction({ Kind: 'type', Text: 'Ada Lovelace', Selector: '#name >> nth=0' })).Success).toBe(true);
    });

    it('lets Enter submit a search, and type text without a newline', async () => {
        render(`<form><input id="q" aria-label="Query" data-visible><button data-visible>Search</button></form>`);
        (document.getElementById('q') as HTMLInputElement).focus();
        expect((await session.ExecuteAction({ Kind: 'key', Key: 'Enter' })).Success).toBe(true);
        expect((await session.ExecuteAction({ Kind: 'type', Text: 'shoes' })).Success).toBe(true);
    });
});

describe('guards reach into open shadow roots', () => {
    let session: CdpRemoteBrowserSession;
    let adapter: FakePlaywrightBrowserAdapter;
    let root: ShadowRoot;
    beforeEach(() => {
        ({ session, adapter } = buildSession());
        render(`<div id="host"></div>`);
        root = document.getElementById('host')!.attachShadow({ mode: 'open' });
        root.innerHTML = '<form><input id="qty" aria-label="Quantity"><button id="pay">Place your order</button></form>';
    });
    const refused = (detail: string | undefined) => expect(detail).toContain('Refusing to activate "Place your order"');

    it('Space on a focused shadow-root button', async () => {
        (root.getElementById('pay') as HTMLButtonElement).focus();
        refused((await session.ExecuteAction({ Kind: 'key', Key: ' ' })).Detail);
    });

    it('Enter in a shadow-root field whose form submits through it', async () => {
        (root.getElementById('qty') as HTMLInputElement).focus();
        refused((await session.ExecuteAction({ Kind: 'key', Key: 'Enter' })).Detail);
    });

    it('a typed space aimed at it by selector', async () => {
        adapter.FocusBySelector = () => root.getElementById('pay');
        refused((await session.ExecuteAction({ Kind: 'type', Text: ' ', Selector: '#pay' })).Detail);
    });

    it('a click at its point', async () => {
        const host = document.getElementById('host')!;
        document.elementFromPoint = () => host;
        root.elementFromPoint = () => root.getElementById('pay');
        refused((await session.ExecuteAction({ Kind: 'click', X: 20, Y: 20 })).Detail);
        expect(adapter.ExecutedActions).toEqual([]);
    });
});

describe('labels, ancestors, shadow roots, credentials, fill read-back and links', () => {
    let session: CdpRemoteBrowserSession;
    let adapter: FakePlaywrightBrowserAdapter;
    beforeEach(() => ({ session, adapter } = buildSession()));

    it('a selector aimed at an icon, an SVG or any child of a "Pay now" button is judged by the button', async () => {
        render(`<button type="button" data-visible>Pay now <i class="ico"></i><svg class="s"></svg><span class="x"></span></button>`);
        for (const selector of ['i.ico', 'svg.s', 'button > *']) {
            const result = await session.ExecuteAction({ Kind: 'click', Selector: selector });
            expect([selector, result.Detail]).toEqual([selector, expect.stringContaining('Refusing to activate "Pay now"')]);
        }
        expect(adapter.ExecutedActions).toEqual([]);
    });

    it('a harmless aria-label cannot hide a destructive name, in inspect and in a click', async () => {
        render(`<span id="lbl">Delete account</span><button type="button" aria-label="Continue" data-visible>Pay now</button><button type="button" aria-labelledby="lbl" data-visible>Go</button>`);
        const { Observation } = await session.ExecuteAction({ Kind: 'inspect' });
        expect(Observation?.Actions.map((a) => [a.Label, a.Destructive])).toEqual([
            ['Continue', true],
            ['Go', true],
        ]);
        const byRef = await session.ExecuteAction({ Kind: 'click', Ref: 'a1' });
        expect(byRef.Detail).toContain('Refusing to activate "Pay now"'); // the name that matched, not the first
        expect((await session.ExecuteAction({ Kind: 'click', Text: 'Continue' })).Success).toBe(false);
    });

    it('a form key or a tooltip does not make a control destructive while it has a name of its own', async () => {
        render(`
          <form><button id="b1" type="submit" name="submit" data-visible>Search</button></form>
          <form><input id="b2" type="submit" name="submit" value="Go" data-visible></form>
          <form><button id="b3" type="submit" title="Submit search" data-visible>Search</button></form>
          <button id="b4" type="button" title="Remove filter" data-visible>x</button>
          <button id="icon" type="button" title="Delete item" data-visible><i class="fa-trash"></i></button>`);
        for (const id of ['b1', 'b2', 'b3', 'b4']) {
            expect([id, (await session.ExecuteAction({ Kind: 'click', Selector: `#${id}` })).Success]).toEqual([id, true]);
        }
        // An icon-only button has nothing but its tooltip to go by.
        expect((await session.ExecuteAction({ Kind: 'click', Selector: '#icon' })).Detail).toContain('Refusing to activate "Delete item"');
    });

    it('a label is judged as the control it clicks, by selector, text or point', async () => {
        render(`<label id="l1" for="payBtn" data-visible>Finish</label><button id="payBtn" type="button" data-visible>Pay now</button>`);
        document.elementFromPoint = () => document.getElementById('l1');
        for (const target of [{ Selector: '#l1' }, { Text: 'Finish' }, { X: 20, Y: 20 }]) {
            const result = await session.ExecuteAction({ Kind: 'click', ...target });
            expect([target, result.Detail]).toEqual([target, expect.stringContaining('Refusing to activate "Pay now"')]);
        }
        expect(adapter.ExecutedActions).toEqual([]);
    });

    it('inspect, fill and click by ref or text see an open shadow root', async () => {
        render(`<div id="host" data-visible></div>`);
        const root = document.getElementById('host')!.attachShadow({ mode: 'open' });
        root.innerHTML = '<input id="q" aria-label="Quantity"><button type="button" id="more">More</button>';
        root.querySelectorAll('*').forEach((el) => {
            (el as HTMLElement).getBoundingClientRect = () => ({ x: 1, y: 1, width: 50, height: 20, top: 1, left: 1, right: 51, bottom: 21, toJSON: () => ({}) }) as DOMRect;
        });
        const { Observation } = await session.ExecuteAction({ Kind: 'inspect' });
        expect(Observation?.Fields.map((f) => f.Label)).toEqual(['Quantity']);
        expect(Observation?.Actions.map((a) => a.Label)).toEqual(['More']);
        expect((await session.ExecuteAction({ Kind: 'fill', Values: [{ Target: 'f1', Value: '3' }] })).Success).toBe(true);
        expect((root.getElementById('q') as HTMLInputElement).value).toBe('3');
        expect((await session.ExecuteAction({ Kind: 'click', Ref: 'a1' })).Success).toBe(true);
        expect((await session.ExecuteAction({ Kind: 'click', Text: 'More' })).Success).toBe(true);
    });

    it('protects account numbers, IBANs, secrets, tokens, API keys and passphrases, by name or by label', async () => {
        render(
            '<input name="iban" data-visible><input aria-label="Account number" data-visible><input name="client_secret" data-visible>' +
                '<input placeholder="Access token" data-visible><input aria-label="API key" data-visible><input aria-label="Passphrase" data-visible>',
        );
        const { Observation } = await session.ExecuteAction({ Kind: 'inspect' });
        expect(Observation?.Fields.map((f) => f.Writable)).toEqual([false, false, false, false, false, false]);
    });

    it('a fill that reads back empty after a non-empty request fails, and names the field', async () => {
        render(`<input id="age" type="number" aria-label="Age" data-visible>`);
        await session.ExecuteAction({ Kind: 'inspect' });
        const result = await session.ExecuteAction({ Kind: 'fill', Values: [{ Target: 'f1', Value: 'forty' }] });
        expect(result.Success).toBe(false);
        expect(result.Detail).toContain('reads back empty');
        expect((await session.ExecuteAction({ Kind: 'fill', Values: [{ Target: 'f1', Value: '' }] })).Success).toBe(true);
    });

    it('lists only http(s) links (the CodeQL fix)', async () => {
        render(`<a href="https://example.com/a" data-visible>Real</a><a href="javascript:alert(1)" data-visible>Script</a><a href="data:text/html,x" data-visible>Data</a>`);
        const { Observation } = await session.ExecuteAction({ Kind: 'inspect' });
        expect(Observation?.Links.map((l) => l.Text)).toEqual(['Real']);
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
