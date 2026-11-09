import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function channel(hex: string, index: number): number {
    const value = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(foreground: string, background: string): number {
    const left = 0.2126 * channel(foreground, 0) + 0.7152 * channel(foreground, 1) + 0.0722 * channel(foreground, 2);
    const right = 0.2126 * channel(background, 0) + 0.7152 * channel(background, 1) + 0.0722 * channel(background, 2);
    const lighter = Math.max(left, right);
    const darker = Math.min(left, right);
    return (lighter + 0.05) / (darker + 0.05);
}

function hex(css: string, name: string): string {
    const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
    if (!match) throw new Error(`Missing ${name}`);
    return match[1].toLowerCase();
}

describe('dark theme rubric chrome', () => {
    it('keeps a filled anchor readable and does not force a light scheme', () => {
        const directory = dirname(fileURLToPath(import.meta.url));
        const builder = readFileSync(join(directory, 'rubric-builder.component.css'), 'utf8');
        const scoring = readFileSync(join(directory, 'rubric-scoring-form.component.css'), 'utf8');
        const agent = readFileSync(join(directory, '../../../agents/src/lib/components/agent-rubrics.component.css'), 'utf8');
        const tokens = readFileSync(join(directory, '../../../shared/src/lib/_tokens.scss'), 'utf8');
        const filled = builder.slice(builder.indexOf('.anchor.filled'), builder.indexOf('.anchor.filled') + 160);
        expect(filled).toContain('var(--mj-text-link)');
        expect(filled).not.toContain('--mj-color-brand-700');
        expect(scoring).not.toContain('color-scheme: light');
        expect(agent).not.toContain('color-scheme: light');
        const surface = hex(tokens, '--mj-color-neutral-800');
        const link = hex(tokens, '--mj-color-brand-300');
        const oldBrand = hex(tokens, '--mj-color-brand-700');
        expect(contrast(link, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(oldBrand, surface)).toBeLessThan(4.5);
    });
});
