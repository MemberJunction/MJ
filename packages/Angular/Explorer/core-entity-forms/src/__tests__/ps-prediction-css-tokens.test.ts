import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every `var(--mj-*)` the prediction-serving stylesheets read without a fallback must be a token the
 * shared `_tokens.scss` defines — an undefined custom property renders as "no colour" with no error,
 * which is how the load-error box and the red badge lost their colour (audit M5b-1).
 */
const TOKENS_FILE = resolve(__dirname, '../../../../Generic/shared/src/lib/_tokens.scss');
const STYLESHEETS = [
    resolve(__dirname, '../lib/panels/model-predictions/model-prediction.panel.css'),
    resolve(__dirname, '../lib/custom/MLModels/ps-scoring-binding-editor.component.css'),
];

function definedTokens(): Set<string> {
    const names = new Set<string>();
    for (const m of readFileSync(TOKENS_FILE, 'utf8').matchAll(/(--mj-[a-z0-9-]+)\s*:/g)) {
        names.add(m[1]);
    }
    return names;
}

function unfallbackedReferences(css: string): string[] {
    return [...css.matchAll(/var\(\s*(--mj-[a-z0-9-]+)\s*\)/g)].map((m) => m[1]);
}

describe('prediction-serving stylesheets use only defined design tokens', () => {
    const defined = definedTokens();
    for (const sheet of STYLESHEETS) {
        it(sheet.split('/').pop() ?? sheet, () => {
            const undefinedRefs = unfallbackedReferences(readFileSync(sheet, 'utf8')).filter((t) => !defined.has(t));
            expect([...new Set(undefinedRefs)]).toEqual([]);
        });
    }
});
