import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
    INTERACTIVITYPROBE,
    MapRawToInteractiveElement,
    ProbeDomInteractiveElements,
    ResolveDomSelector,
    ReresolveTarget,
    ShouldAcceptHeal,
    TraceTarget,
    type RawInteractiveElement,
} from '../browser-probe/index.js';

const __filename = fileURLToPath(import.meta.url);
const BROWSER_PROBE_SRC = join(dirname(__filename), '../browser-probe/index.ts');

function createMockElement(tagName: string, id: string, childrenList: Element[] = []): HTMLElement {
    const collection: HTMLCollection = Object.assign([...childrenList], {
        item: (index: number) => childrenList[index] ?? null,
        namedItem: (name: string) => childrenList.find(c => c.id === name) ?? null,
    });
    const el: Partial<HTMLElement> = {
        tagName,
        id,
        children: collection,
    };
    return el as HTMLElement;
}

describe('@memberjunction/computer-use/browser-probe — Playwright-free DOM grounding & heal module', () => {
    it('contains zero playwright or pngjs imports in browser-probe/index.ts', () => {
        const src = readFileSync(BROWSER_PROBE_SRC, 'utf8');
        expect(src).not.toMatch(/from\s+['"]playwright['"]/);
        expect(src).not.toMatch(/from\s+['"]pngjs['"]/);
    });

    it('exports INTERACTIVITYPROBE as a self-contained function with no external closure dependencies', () => {
        expect(typeof INTERACTIVITYPROBE).toBe('function');
        const serialized = INTERACTIVITYPROBE.toString();
        expect(serialized).toContain('INTERACTIVE_SELECTOR');
        expect(serialized).toContain('xpathOf');
        expect(serialized).toContain('roleOf');
        expect(serialized).toContain('nameOf');
        expect(serialized).toContain('scopeOf');
    });

    it('maps RawInteractiveElement to InteractiveElement with BoundingBox and xpath= prefix', () => {
        const raw: RawInteractiveElement = {
            role: 'button',
            name: 'Register Application',
            xpath: '/html/body[1]/main[1]/form[1]/button[2]',
            scope: 'form:App Registration',
            value: null,
            x: 120.4,
            y: 340.6,
            width: 180.2,
            height: 42.0,
            scrollable: false,
            disabled: false,
        };

        const el = MapRawToInteractiveElement(raw, 4);
        expect(el.Index).toBe(4);
        expect(el.Role).toBe('button');
        expect(el.Name).toBe('Register Application');
        expect(el.Selector).toBe('xpath=/html/body[1]/main[1]/form[1]/button[2]');
        expect(el.Scope).toBe('form:App Registration');
        expect(el.Value).toBeUndefined();
        expect(el.Scrollable).toBe(false);
        expect(el.Disabled).toBe(false);
        expect(el.BoundingBox).toBeDefined();
        expect(el.BoundingBox?.XMin).toBe(120);
        expect(el.BoundingBox?.YMin).toBe(341);
        expect(el.BoundingBox?.XMax).toBe(301);
        expect(el.BoundingBox?.YMax).toBe(383);
    });

    it('omits BoundingBox when width or height is zero and preserves form input value', () => {
        const raw: RawInteractiveElement = {
            role: 'textbox',
            name: 'Redirect URI',
            xpath: '/html/body[1]/input[1]',
            scope: '',
            value: 'https://tenant.mjcentral.io/callback',
            x: 10,
            y: 20,
            width: 0,
            height: 30,
            scrollable: true,
            disabled: true,
        };

        const el = MapRawToInteractiveElement(raw, 0);
        expect(el.Index).toBe(0);
        expect(el.Scope).toBeUndefined();
        expect(el.Value).toBe('https://tenant.mjcentral.io/callback');
        expect(el.Scrollable).toBe(true);
        expect(el.Disabled).toBe(true);
        expect(el.BoundingBox).toBeUndefined();
    });

    it('ProbeDomInteractiveElements safely returns [] when no browser document exists', () => {
        if (typeof document === 'undefined') {
            expect(ProbeDomInteractiveElements()).toEqual([]);
        }
    });

    it('ResolveDomSelector walks positional XPath and CSS selectors on a mock Document', () => {
        const btn1 = createMockElement('BUTTON', 'first');
        const btn2 = createMockElement('BUTTON', 'second');
        const div1 = createMockElement('DIV', 'container', [btn1, btn2]);
        const body = createMockElement('BODY', 'body', [div1]);
        const html = createMockElement('HTML', 'html', [body]);

        const queryMap: Record<string, HTMLElement> = { '#second': btn2 };
        const docPartial: Partial<Document> = {
            documentElement: html,
            querySelector: ((sel: string) => queryMap[sel] ?? null) as Document['querySelector'],
        };
        const mockDoc = docPartial as Document;

        expect(ResolveDomSelector('xpath=/html/body[1]/div[1]/button[2]', mockDoc)).toBe(btn2);
        expect(ResolveDomSelector('/html/body[1]/div[1]/button[1]', mockDoc)).toBe(btn1);
        expect(ResolveDomSelector('#second', mockDoc)).toBe(btn2);
        expect(ResolveDomSelector('xpath=/html/body[1]/div[9]/button[1]', mockDoc)).toBeNull();
        expect(ResolveDomSelector('', mockDoc)).toBeNull();
    });

    it('re-exports ReresolveTarget and ShouldAcceptHeal for shared extension target healing', () => {
        const el0 = MapRawToInteractiveElement(
            {
                role: 'button',
                name: 'Create App Registration',
                xpath: '/html/body[1]/div[3]/button[1]',
                scope: 'main:Portal',
                value: null,
                x: 50,
                y: 80,
                width: 160,
                height: 36,
                scrollable: false,
                disabled: false,
            },
            0
        );

        const target = new TraceTarget();
        target.Role = 'button';
        target.Name = 'Create App Registration';
        target.Scope = 'main:Portal';

        const resolution = ReresolveTarget(target, [el0]);
        expect(ShouldAcceptHeal(resolution.confidence)).toBe(true);
        expect(resolution.selector).toBe('xpath=/html/body[1]/div[3]/button[1]');
        expect(resolution.element).toBe(el0);
    });
});
