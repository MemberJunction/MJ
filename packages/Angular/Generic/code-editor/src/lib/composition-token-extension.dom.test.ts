import { describe, it, expect } from 'vitest';
import { BuildCompositionTooltipDOM } from './composition-token-extension';
import type { CompositionTokenInfo } from './composition-token-extension';

/**
 * The hover tooltip for a composition token shows query metadata that other users can edit.
 * Each value must appear as text, never as markup.
 */

function infoWith(overrides: Partial<CompositionTokenInfo>): CompositionTokenInfo {
    return { Name: 'Monthly Totals', ...overrides };
}

describe('BuildCompositionTooltipDOM', () => {
    it('shows a category name with markup as text', () => {
        const category = 'Reports <img src=x data-marker="1">';
        const dom = BuildCompositionTooltipDOM(infoWith({ Category: category }), 'Reports/Monthly Totals');

        expect(dom.querySelector('img')).toBeNull();
        expect(dom.querySelector('[data-marker]')).toBeNull();
        const badge = Array.from(dom.querySelectorAll('.cm-composition-tooltip-badge'))
            .find(b => b.querySelector('.fa-folder'));
        expect(badge?.textContent?.trim()).toBe(category);
    });
});
