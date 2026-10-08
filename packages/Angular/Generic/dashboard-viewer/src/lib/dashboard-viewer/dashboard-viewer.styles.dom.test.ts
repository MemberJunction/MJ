import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DASHBOARD_STACK_HEADER_HEIGHT } from '../services/golden-layout-wrapper.service';

/**
 * The viewer's Golden Layout styles, as the browser parses them. The shell's tab styles reach this nested
 * layout, so the viewer's rules add .dashboard-viewer to outrank them and use !important where the shell does.
 * jsdom has no layout, so these specs check what the stylesheet declares; a browser check covers the look.
 */

const VIEWER = 'mj-dashboard-viewer .dashboard-viewer';

/** A declaration's value and whether it is !important. */
interface Declaration {
    Value: string;
    Important: boolean;
}

describe('dashboard viewer stylesheet: Golden Layout part tabs', () => {
    let styleElement: HTMLStyleElement;
    let rules: CSSStyleRule[];

    beforeAll(() => {
        styleElement = document.createElement('style');
        styleElement.textContent = readFileSync(join(__dirname, 'dashboard-viewer.component.css'), 'utf8');
        document.head.appendChild(styleElement);
        const sheet = styleElement.sheet;
        if (!sheet) {
            throw new Error('jsdom did not parse the viewer stylesheet');
        }
        rules = Array.from(sheet.cssRules).filter((rule): rule is CSSStyleRule => 'selectorText' in rule);
    });

    afterAll(() => {
        styleElement.remove();
    });

    /** The selectors of a rule (split at commas outside brackets and parentheses), with whitespace collapsed. */
    function selectorsOf(rule: CSSStyleRule): string[] {
        const selectors: string[] = [];
        let depth = 0;
        let current = '';
        for (const char of rule.selectorText) {
            depth += char === '(' || char === '[' ? 1 : char === ')' || char === ']' ? -1 : 0;
            if (char === ',' && depth === 0) {
                selectors.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        selectors.push(current);
        return selectors.map(selector => selector.trim().replace(/\s+/g, ' '));
    }

    /** What the last rule with this exact selector declares for the property, or null when no rule does. */
    function declared(selector: string, property: string): Declaration | null {
        let found: Declaration | null = null;
        for (const rule of rules) {
            const value = rule.style.getPropertyValue(property);
            if (value && selectorsOf(rule).includes(selector)) {
                found = { Value: value.trim(), Important: rule.style.getPropertyPriority(property) === 'important' };
            }
        }
        return found;
    }

    /** The rules that style an element with the class: the class is in the last compound selector. */
    function rulesStyling(className: string): CSSStyleRule[] {
        const classPattern = new RegExp(`\\.${className}(?![\\w-])`);
        // Attribute values and pseudo-class arguments can hold spaces; drop them before splitting at combinators
        const subjectOf = (selector: string): string =>
            selector.replace(/\[[^\]]*\]|\([^)]*\)/g, '').split(/\s*[\s>+~]\s*/).pop() ?? '';
        return rules.filter(rule => selectorsOf(rule).some(selector => classPattern.test(subjectOf(selector))));
    }

    it('makes each stack header the height the wrapper gives Golden Layout, and leaves the rest to the parts', () => {
        const header = `${DASHBOARD_STACK_HEADER_HEIGHT}px`;
        expect(declared(`${VIEWER} .lm_header`, 'height')).toEqual({ Value: header, Important: true });
        expect(declared(`${VIEWER} .lm_items`, 'height')).toEqual({ Value: `calc(100% - ${header})`, Important: true });

        // No other rule sizes a header, or the parts under one, for a different header height
        const headerHeights = rulesStyling('lm_header').map(rule => rule.style.getPropertyValue('height')).filter(Boolean);
        expect(new Set(headerHeights)).toEqual(new Set([header]));
        const itemHeights = rulesStyling('lm_items').map(rule => rule.style.getPropertyValue('height')).filter(Boolean);
        expect(new Set(itemHeights)).toEqual(new Set([`calc(100% - ${header})`, '100%'])); // 100%: a maximised stack
    });

    it("lifts the shell's 40px cap on nested stack headers", () => {
        expect(declared(`${VIEWER} .lm_header`, 'max-height')).toEqual({ Value: 'none', Important: true });
    });

    it("hides Golden Layout's own close, popout and maximise buttons in every mode", () => {
        for (const selector of [
            `${VIEWER} .lm_close_tab`,
            `${VIEWER} .lm_controls .lm_close`,
            `${VIEWER} .lm_controls .lm_popout`,
            `${VIEWER} .lm_controls .lm_maximise`,
        ]) {
            expect(declared(selector, 'display'), selector).toEqual({ Value: 'none', Important: true });
        }
    });

    it("shows the part buttons at full size and full opacity in the header's controls", () => {
        const hidden = rulesStyling('lm_controls').filter(rule => rule.style.getPropertyValue('display') === 'none');
        expect(hidden.map(rule => rule.selectorText)).toEqual([]);

        // Golden Layout makes each control 18px square, and the MJ theme dims each one to 0.6
        const group = `${VIEWER} .lm_header .lm_controls > .dashboard-stack-actions`;
        expect(declared(group, 'display')).toEqual({ Value: 'flex', Important: true });
        expect(declared(group, 'width')).toEqual({ Value: 'auto', Important: true });
        expect(declared(group, 'height')).toEqual({ Value: 'auto', Important: true });
        expect(declared(group, 'opacity')).toEqual({ Value: '1', Important: true });
    });

    it('keeps the part buttons above tabs that run into them, and under the tab dropdown list', () => {
        // The shell gives tabs z-index 1 (2 when active); the tab dropdown list uses --mj-z-dropdown (100)
        const zIndex = Number(declared(`${VIEWER} .lm_header .lm_controls`, 'z-index')?.Value);
        expect(zIndex).toBeGreaterThan(2);
        expect(zIndex).toBeLessThan(100);
        expect(declared(`${VIEWER} .lm_header .lm_tabdropdown_list`, 'z-index')?.Value).toBe('var(--mj-z-dropdown)');
    });

    it("spaces the tabs with a right margin, which Golden Layout's tab budget counts, not a gap on the track", () => {
        expect(declared(`${VIEWER} .lm_header .lm_tabs`, 'gap')).toBeNull();
        expect(declared(`${VIEWER} .lm_header .lm_tab`, 'margin')).toEqual({ Value: '0 var(--mj-space-1) 0 0', Important: true });
    });

    it('opens the tabs that do not fit as a menu below the header, above the part content', () => {
        const list = `${VIEWER} .lm_header .lm_tabdropdown_list`;
        expect(declared(list, 'top')?.Value).toBe('calc(100% + var(--mj-space-1))');
        expect(declared(list, 'flex-direction')?.Value).toBe('column');
        expect(declared(list, 'background')?.Value).toBe('var(--mj-bg-surface-elevated)');
        expect(declared(list, 'border')?.Value).toBe('1px solid var(--mj-border-default)');
        expect(declared(list, 'border-radius')?.Value).toBe('var(--mj-radius-md)');
        expect(declared(list, 'box-shadow')?.Value).toBe('var(--mj-shadow-md)');
        expect(declared(list, 'z-index')?.Value).toBe('var(--mj-z-dropdown)');
        // Golden Layout's z-index on the header would make it a stacking context and hold the menu at the header's level
        expect(declared(`${VIEWER} .lm_header`, 'z-index')?.Value).toBe('auto');

        const item = `${list} .lm_tab`;
        expect(declared(item, 'display')).toEqual({ Value: 'flex', Important: true });
        expect(declared(item, 'margin')).toEqual({ Value: '0', Important: true });
    });

    it('leaves showing and hiding the menu and its button to Golden Layout, which sets an inline display', () => {
        expect(declared(`${VIEWER} .lm_header .lm_tabdropdown_list`, 'display')).toEqual({ Value: 'flex', Important: false });
        const forced = [...rulesStyling('lm_tabdropdown_list'), ...rulesStyling('lm_tabdropdown')]
            .filter(rule => rule.style.getPropertyPriority('display') === 'important');
        expect(forced.map(rule => rule.selectorText)).toEqual([]);
    });

    it('sizes the tab dropdown button like the part buttons, at full opacity', () => {
        const button = `${VIEWER} .lm_header .lm_controls > .lm_tabdropdown`;
        expect(declared(button, 'width')).toEqual({ Value: '32px', Important: true });
        expect(declared(button, 'height')).toEqual({ Value: '32px', Important: true });
        expect(declared(button, 'opacity')).toEqual({ Value: '1', Important: true });
    });

    it('gives the active tab the size and shape of the other tabs, whichever stylesheet loads last', () => {
        // The shell's active tab rule (36px high, bordered, square at the bottom) is as specific as the viewer's tab rule
        const tab = `${VIEWER} .lm_header .lm_tab`;
        for (const property of ['height', 'margin', 'border', 'border-radius']) {
            expect(declared(`${tab}.lm_active`, property), property).toEqual(declared(tab, property));
        }
    });

    it("lifts the active tab with the theme's small shadow, which the dark theme darkens", () => {
        expect(declared(`${VIEWER} .lm_header .lm_tab.lm_active`, 'box-shadow')).toEqual({ Value: 'var(--mj-shadow-sm)', Important: true });
    });

    it('draws the keyboard focus ring inside the tab, where the header does not clip it', () => {
        const tab = `${VIEWER} .lm_header .lm_tab:focus-visible`;
        expect(declared(tab, 'outline')).toEqual({ Value: '2px solid var(--mj-border-focus)', Important: true });
        expect(declared(tab, 'outline-offset')).toEqual({ Value: '-2px', Important: true });
    });

    it('never animates a stack: Golden Layout sizes the stacks, and a transition makes them grow from zero', () => {
        const animated = rulesStyling('lm_stack').filter(rule =>
            ['transition', 'transition-property', 'transition-duration'].some(property => rule.style.getPropertyValue(property))
        );
        expect(animated.map(rule => rule.selectorText)).toEqual([]);
    });
});
