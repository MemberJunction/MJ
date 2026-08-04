import { describe, it, expect, vi } from 'vitest';
import { ActionExecutionResult, BaseBrowserAdapter, NavigateAction, TypeAction, type BrowserAction } from '@memberjunction/computer-use';
import { getValueFromPath, resolveActionTemplates, resolveTemplateString, wrapAdapterWithContext } from '../context-injection';

const CTX = { creds: { username: 'amith', password: 's3cret!' }, items: [{ id: 'a1' }] };

describe('getValueFromPath', () => {
    it('resolves dotted paths', () => {
        expect(getValueFromPath(CTX, 'creds.password')).toBe('s3cret!');
    });
    it('resolves array-index paths', () => {
        expect(getValueFromPath(CTX, 'items[0].id')).toBe('a1');
    });
    it('returns undefined for missing segments', () => {
        expect(getValueFromPath(CTX, 'creds.missing.deep')).toBeUndefined();
        expect(getValueFromPath(null, 'x')).toBeUndefined();
    });
});

describe('resolveTemplateString', () => {
    it('substitutes a token with its context value', () => {
        expect(resolveTemplateString('user {{creds.username}}', CTX)).toBe('user amith');
    });
    it('substitutes multiple tokens', () => {
        expect(resolveTemplateString('{{creds.username}}:{{creds.password}}', CTX)).toBe('amith:s3cret!');
    });
    it('leaves unresolved tokens intact (no "undefined" leak)', () => {
        expect(resolveTemplateString('{{creds.nope}}', CTX)).toBe('{{creds.nope}}');
    });
    it('passes through strings with no tokens', () => {
        expect(resolveTemplateString('plain', CTX)).toBe('plain');
    });
});

describe('resolveActionTemplates', () => {
    it('resolves a TypeAction text into a CLONE, leaving the original (and its log) model-safe', () => {
        const action = Object.assign(new TypeAction(), { Text: 'login with {{creds.password}}' });
        const resolved = resolveActionTemplates(action, CTX) as TypeAction;

        expect(resolved.Text).toBe('login with s3cret!'); // injected for the keystroke
        expect(action.Text).toBe('login with {{creds.password}}'); // original untouched → stays in step record
        expect(resolved).not.toBe(action);
        expect(resolved instanceof TypeAction).toBe(true); // prototype preserved for adapter instanceof checks
    });

    it('resolves a NavigateAction url', () => {
        const action = Object.assign(new NavigateAction(), { Url: 'https://{{host}}/in' });
        const resolved = resolveActionTemplates(action, { host: 'app.test' }) as NavigateAction;
        expect(resolved.Url).toBe('https://app.test/in');
    });

    it('returns the same instance when there is nothing to resolve', () => {
        const action = Object.assign(new TypeAction(), { Text: 'no tokens' });
        expect(resolveActionTemplates(action, CTX)).toBe(action);
    });
});

describe('wrapAdapterWithContext', () => {
    function makeInner(): { adapter: BaseBrowserAdapter; received: BrowserAction[] } {
        const received: BrowserAction[] = [];
        const adapter = {
            ExecuteAction: vi.fn(async (action: BrowserAction) => {
                received.push(action);
                return new ActionExecutionResult(action);
            }),
            CaptureScreenshot: vi.fn(async () => 'png'),
            get CurrentUrl() {
                return 'https://current.test/';
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any as BaseBrowserAdapter;
        return { adapter, received };
    }

    it('resolves tokens before delegating ExecuteAction to the inner adapter', async () => {
        const { adapter, received } = makeInner();
        const wrapped = wrapAdapterWithContext(adapter, CTX);
        const original = Object.assign(new TypeAction(), { Text: '{{creds.password}}' });

        await wrapped.ExecuteAction(original);

        expect((received[0] as TypeAction).Text).toBe('s3cret!'); // inner saw the real value
        expect(original.Text).toBe('{{creds.password}}'); // caller's action untouched
    });

    it('delegates other methods + getters unchanged to the inner adapter', async () => {
        const { adapter } = makeInner();
        const wrapped = wrapAdapterWithContext(adapter, CTX);
        expect(await wrapped.CaptureScreenshot()).toBe('png');
        expect(wrapped.CurrentUrl).toBe('https://current.test/');
    });
});
