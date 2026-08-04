/**
 * Integration tests for the opt-in code-string reduction wiring in BaseAgent
 * (resolveActionResultCrush.codeLang via the `crushCodeLang` prompt param + crushCodeValue).
 *
 * Mirror-style (see prompt-formatting.test.ts) but exercising the REAL
 * @memberjunction/context-crush CrushCode engine.
 *
 * token optimization via @memberjunction/context-crush (CodeCompressor-inspired)
 */
import { describe, it, expect } from 'vitest';
import { DescribeCrush } from '@memberjunction/context-crush';
import { CrushCode, type CodeLang } from '@memberjunction/context-crush/code';

const ACTION_RESULT_CRUSH_THRESHOLD = 600;

interface CrushConfig {
    threshold: number;
    maxChars: number | undefined;
    codeLang: CodeLang | undefined;
}

/** Mirror of BaseAgent.resolveActionResultCrush. */
function resolveBase(promptParams?: Record<string, unknown>): CrushConfig | undefined {
    if (promptParams?.crushActionResults === false) {
        return undefined;
    }
    const requested = promptParams?.crushCodeLang;
    const codeLang: CodeLang | undefined = requested === 'sql' || requested === 'typescript' ? requested : undefined;
    return { threshold: ACTION_RESULT_CRUSH_THRESHOLD, maxChars: undefined, codeLang };
}

/** Mirror of BaseAgent.crushCodeValue. */
function crushCodeValue(stringValue: string, config: CrushConfig | undefined): string | null {
    if (!config || !config.codeLang || stringValue.length < config.threshold) {
        return null;
    }
    const result = CrushCode(stringValue, config.codeLang);
    if (result.CrushedChars >= result.OriginalChars) {
        return null;
    }
    const legend = DescribeCrush(result);
    return legend ? `${result.Text}\n  ↳ ${legend}` : result.Text;
}

/** A large SQL string with a long VALUES list — the kind a query agent moves through context. */
function buildLargeSql(): string {
    const rows = Array.from({ length: 40 }, (_, i) => `(${i}, 'name${i}', 'StandardCategory')`).join(', ');
    return `-- generated insert\nINSERT INTO Users (id, name, category) VALUES ${rows};`;
}

describe('code-string action-result crush wiring', () => {
    it('leaves code strings verbatim for the base agent (codeLang off by default)', () => {
        const sql = buildLargeSql();
        expect(crushCodeValue(sql, resolveBase())).toBeNull();
    });

    it('reduces large SQL strings once an agent opts into a code language (crushCodeLang)', () => {
        const sql = buildLargeSql();
        const crushed = crushCodeValue(sql, resolveBase({ crushCodeLang: 'sql' }));
        expect(crushed).not.toBeNull();
        expect(crushed!).toContain('value tuples elided');
        expect(crushed!.split('\n  ↳ ')[0].length).toBeLessThan(sql.length);
    });

    it('does not crush code when the agent opts out of crushing entirely', () => {
        expect(resolveBase({ crushActionResults: false })).toBeUndefined();
    });

    it('leaves small code strings verbatim (below threshold)', () => {
        expect(crushCodeValue('SELECT 1;', resolveBase({ crushCodeLang: 'sql' }))).toBeNull();
    });
});
