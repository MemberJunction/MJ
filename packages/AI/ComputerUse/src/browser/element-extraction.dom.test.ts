// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { INTERACTIVITYPROBE } from './element-extraction.js';

/**
 * A roving-tabindex composite marks every INACTIVE item `tabindex="-1"` and only
 * the active one `0`. Kendo and Material tabs, toolbars, listboxes and menus all
 * do it. Dropping every `-1` element therefore removed every unselected tab and
 * option from the grounded list, the model fell back to coordinates, and
 * `isRecordableRun` refused the resulting trace — so the test could never leave
 * the LLM tier.
 *
 * jsdom reports zero-size rects and has no checkVisibility, so both are stubbed
 * per element; the probe's own size/visibility filters are not what is under test.
 */
function makeVisible(el: Element): void {
    (el as HTMLElement).getBoundingClientRect = () =>
        ({ x: 10, y: 10, width: 120, height: 32, top: 10, left: 10, right: 130, bottom: 42, toJSON: () => ({}) }) as DOMRect;
    (el as unknown as { checkVisibility: () => boolean }).checkVisibility = () => true;
}

function render(html: string): void {
    document.body.innerHTML = html;
    document.body.querySelectorAll('*').forEach(makeVisible);
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 720, configurable: true });
}

const names = (): string[] => INTERACTIVITYPROBE().map(e => e.name).filter(Boolean) as string[];

describe('the probe and roving tabindex (review: non-blocking)', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('keeps inactive tabs, which carry tabindex="-1" by convention', () => {
        render(`
            <div role="tablist">
                <div role="tab" tabindex="0">Overview</div>
                <div role="tab" tabindex="-1">Agents</div>
                <div role="tab" tabindex="-1">Prompts</div>
            </div>`);
        expect(names()).toEqual(expect.arrayContaining(['Overview', 'Agents', 'Prompts']));
    });

    it('keeps inactive listbox options and menu items', () => {
        render(`
            <ul role="listbox">
                <li role="option" tabindex="-1">Alpha</li>
                <li role="option" tabindex="0">Beta</li>
            </ul>
            <div role="menu"><div role="menuitem" tabindex="-1">Rename</div></div>`);
        expect(names()).toEqual(expect.arrayContaining(['Alpha', 'Beta', 'Rename']));
    });

    it('keeps a real button that happens to carry tabindex="-1"', () => {
        render('<button tabindex="-1">Save</button>');
        expect(names()).toContain('Save');
    });

    it('still drops a plain element whose ONLY claim to interactivity is tabindex="-1"', () => {
        render('<div tabindex="-1">Scroll region</div>');
        expect(names()).not.toContain('Scroll region');
    });

    it('still keeps a plain element with tabindex="0"', () => {
        render('<div tabindex="0">Focusable panel</div>');
        expect(names()).toContain('Focusable panel');
    });
});
